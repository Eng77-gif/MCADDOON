// Trận 5v5 thời gian thực trên bản đồ 3 đường, tuyển thủ do AI điều khiển (kiểu Teamfight Manager 2).
// Chạy theo bước cố định 0.1s, có seed => cùng seed cùng trận. 1 giây mô phỏng = 3 giây đồng hồ trận (DISPLAY_SCALE).
//
// Chỉ số tuyển thủ KHÔNG cộng thẳng vào sát thương; chúng quyết định chất lượng quyết định:
//   laning/cs_efficiency  -> ăn lính chuẩn          skillshot_accuracy/mechanical_outplay -> trúng chiêu / né chiêu
//   map_awareness/vision  -> đánh giá giao tranh     rotation -> phản ứng nhanh với lệnh của đội
//   objective_control     -> tranh Rồng/Baron        positioning -> xạ thủ/pháp sư giữ khoảng cách
//   target_selection      -> chọn đúng mục tiêu      engage_timing -> đỡ đòn mở giao tranh đúng lúc
//   composure/tilt_resistance/consistency -> độ "loạn" khi bị dẫn hoặc trận lớn
import { ROLES, type Champion, type CoachOrders, type MatchContext, type Player, type Role, type TeamSetup } from "../types.ts";
import { draftScore, draftWinProbability, type ChampionDb } from "../draft.ts";
import { masteryOf, conditionFactor } from "../ratings.ts";
import { createRng, type Rng } from "../rng.ts";
import type { MatchEvent, MatchResult, PhaseReport, PlayerLine } from "../match.ts";
import {
  BARON_PIT, CAMPS, DRAGON_PIT, FOUNTAIN, LANES, NEXUS, dist, lanePoint, lanePointFor, towerSpecs,
  type Lane, type TowerTier, type Vec,
} from "./map.ts";
import { SKILLS, archetypeOf, phaseMult, statsAt, type Archetype } from "./kits.ts";

export const DT = 0.1;
export const DISPLAY_SCALE = 3;
export const LIVE = {
  waveEvery: 25,
  firstWave: 4,
  minionsPerWave: 4,
  laningEnd: 260, // sim giây (~13 phút trận)
  dragonSpawn: 100,
  dragonRespawn: 110,
  baronSpawn: 380, // ~19 phút
  baronRespawn: 140,
  baronBuff: 60,
  campRespawn: 40,
  maxTime: 1200, // 60 phút trận
  passiveGold: 2.2,
  passiveXp: 1.6,
};

/** Mỗi lính trong mô phỏng tượng trưng cho 4 lính thật (thời gian nén 3 lần, đợt lính thưa hơn) */
const CS_PER_MINION = 4;

/** Hiệu ứng hình ảnh cho trình xem (chỉ ghi khi recordFx = true) */
export interface Fx {
  t: number;
  kind: "hit" | "shot" | "skill" | "ult" | "heal";
  side: 0 | 1 | 2;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arch?: Archetype;
}

/** Nhật ký ý định của tuyển thủ, kiểu "Giao tranh, mục tiêu Ahri!" */
export interface IntentLog { t: number; side: 0 | 1; ign: string; text: string }

const LANE_VI: Record<Lane, string> = { TOP: "đường trên", MID: "đường giữa", BOT: "đường dưới" };

export type UnitKind = "CHAMP" | "MINION" | "TOWER" | "NEXUS" | "CAMP" | "DRAGON" | "BARON";

export interface Unit {
  id: number;
  kind: UnitKind;
  side: 0 | 1 | 2; // 2 = quái trung lập
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  power: number;
  range: number;
  aspd: number;
  speed: number;
  atkTimer: number;
  alive: boolean;
  targetId: number;
  // lính
  lane?: Lane;
  t?: number;
  ranged?: boolean;
  // trụ
  tier?: TowerTier;
  /** Tên node trong model 3D (để ẩn khi bị phá) */
  node?: string;
  // quái
  home?: Vec;
  respawnAt?: number;
  lastHit?: number; // id tướng gây đòn cuối
  aggroAt?: number;
}

export type ChampState = "LANE" | "JUNGLE" | "FIGHT" | "RETREAT" | "RECALL" | "GROUP" | "GANK" | "DEAD";

export interface ChampUnit extends Unit {
  kind: "CHAMP";
  side: 0 | 1;
  slot: number;
  role: Role;
  player: Player;
  champion: Champion;
  arch: Archetype;
  homeLane: Lane | null;
  level: number;
  xp: number;
  gold: number;
  itemGold: number;
  skillCd: number;
  ultCd: number;
  stunUntil: number;
  shield: number;
  buffUntil: number; // chiêu cuối đấu sĩ / tăng tốc đánh xạ thủ
  state: ChampState;
  stateUntil: number;
  respawnAt: number;
  focus: number; // id mục tiêu đang đánh (tướng)
  decideAt: number;
  hitBy: Map<number, number>; // id tướng địch -> thời điểm gây sát thương gần nhất
  attackedChampAt: number;
  hurtAt: number;
  /** Hiệu suất giao tranh: kỹ năng cá nhân (trúng đòn, chuỗi chiêu, né) × phong độ/tinh thần. Tính một lần đầu trận. */
  efficiency: number;
  line: PlayerLine;
  mastery: number;
}

interface TeamState {
  setup: TeamSetup;
  orders: CoachOrders;
  dragons: number;
  barons: number;
  baronUntil: number;
  towers: number; // số công trình đã phá của địch
  call: { kind: "NONE" | "DRAGON" | "BARON" | "PUSH"; point: Vec; lane?: Lane; since: number; dive?: boolean };
  callAt: number;
}

const attr = (p: Player, g: keyof Player["attributes"], k: string) => ((p.attributes[g] as unknown as Record<string, number>)[k] ?? 70) / 100;

export class LiveMatch {
  readonly rng: Rng;
  readonly db: ChampionDb;
  readonly ctx: MatchContext;
  t = 0;
  winner: 0 | 1 | null = null;
  readonly units: Unit[] = [];
  readonly champs: ChampUnit[] = [];
  readonly teams: [TeamState, TeamState];
  readonly events: MatchEvent[] = [];
  /** Bật để ghi hiệu ứng và nhật ký cho trình xem (tắt khi chạy nhanh để tiết kiệm bộ nhớ) */
  recordFx = false;
  readonly fx: Fx[] = [];
  readonly intents: IntentLog[] = [];
  private lastIntentAt = new Map<number, number>();
  private nextId = 1;
  private readonly byId = new Map<number, Unit>();
  private nextWave: number = LIVE.firstWave;
  private dragon: Unit;
  private baron: Unit;
  private recentKills: { t: number; side: 0 | 1 }[] = [];
  private lastTeamfight = -100;
  private firstBlood = true;
  private goldAt: Record<number, [number, number]> = {};
  private readonly draft: MatchResult["draft"];

  constructor(db: ChampionDb, ctx: MatchContext, setups: [TeamSetup, TeamSetup]) {
    this.db = db;
    this.ctx = ctx;
    this.rng = createRng(ctx.seed);
    this.teams = setups.map((s) => ({
      setup: s, orders: { ...s.orders }, dragons: 0, barons: 0, baronUntil: 0, towers: 0,
      call: { kind: "NONE", point: NEXUS[0], since: 0 }, callAt: 0,
    })) as [TeamState, TeamState];

    const [a, b] = setups;
    const da = draftScore(db, ctx.patch, a.team, a.picks, b.picks, a.tactic);
    const dbk = draftScore(db, ctx.patch, b.team, b.picks, a.picks, b.tactic);
    const p = draftWinProbability(da.total, dbk.total);
    this.draft = { breakdown: [da, dbk], pWin: [p, 1 - p] };

    for (const spec of towerSpecs())
      this.add({ kind: "TOWER", side: spec.side, x: spec.pos.x, y: spec.pos.y, hp: spec.hp, maxHp: spec.hp, power: 150, range: 30, aspd: 1, speed: 0, lane: spec.lane, tier: spec.tier, node: spec.node });
    for (const side of [0, 1] as const)
      this.add({ kind: "NEXUS", side, x: NEXUS[side].x, y: NEXUS[side].y, hp: 3000, maxHp: 3000, power: 0, range: 0, aspd: 0, speed: 0 });
    for (const c of CAMPS)
      this.add({ kind: "CAMP", side: 2, x: c.pos.x, y: c.pos.y, hp: 900, maxHp: 900, power: 28, range: 10, aspd: 0.8, speed: 0, home: c.pos });
    this.dragon = this.add({ kind: "DRAGON", side: 2, x: DRAGON_PIT.x, y: DRAGON_PIT.y, hp: 3200, maxHp: 3200, power: 60, range: 14, aspd: 0.8, speed: 0, home: DRAGON_PIT, respawnAt: LIVE.dragonSpawn });
    this.dragon.alive = false;
    this.baron = this.add({ kind: "BARON", side: 2, x: BARON_PIT.x, y: BARON_PIT.y, hp: 9000, maxHp: 9000, power: 110, range: 16, aspd: 0.8, speed: 0, home: BARON_PIT, respawnAt: LIVE.baronSpawn });
    this.baron.alive = false;

    const laneOf: Record<Role, Lane | null> = { TOP: "TOP", JUNGLE: null, MID: "MID", ADC: "BOT", SUPPORT: "BOT" };
    setups.forEach((s, side) => {
      ROLES.forEach((role, slot) => {
        const player = s.team.roster[role];
        const champion = db[s.picks[role]];
        const arch = archetypeOf(champion, role);
        const st = statsAt(arch, 1, 0);
        const f = FOUNTAIN[side];
        const u: ChampUnit = {
          id: this.nextId++, kind: "CHAMP", side: side as 0 | 1, x: f.x, y: f.y, hp: st.hp, maxHp: st.hp, power: st.power,
          range: st.range, aspd: st.aspd, speed: st.speed, atkTimer: 0, alive: true, targetId: 0,
          slot, role, player, champion, arch, homeLane: laneOf[role], level: 1, xp: 0, gold: 500, itemGold: 0,
          skillCd: 0, ultCd: 0, stunUntil: 0, shield: 0, buffUntil: 0, state: role === "JUNGLE" ? "JUNGLE" : "LANE",
          stateUntil: 0, respawnAt: 0, focus: 0, decideAt: slot * 0.1, hitBy: new Map(), attackedChampAt: -10, hurtAt: -10,
          efficiency: (0.1 + 1.05 * (attr(player, "mechanics", "mechanical_outplay") + attr(player, "teamfight", "positioning")) / 2) * conditionFactor(player, ctx),
          mastery: masteryOf(player, champion.id),
          line: { playerId: player.id, ign: player.ign, role, champion: champion.id, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 500, damage: 0, csAt15: 0, goldAt15: 0 },
        };
        this.units.push(u);
        this.byId.set(u.id, u);
        this.champs.push(u);
      });
    });
  }

  private add(u: Partial<Unit> & Pick<Unit, "kind" | "side" | "x" | "y" | "hp" | "maxHp" | "power" | "range" | "aspd" | "speed">): Unit {
    const unit: Unit = { id: this.nextId++, atkTimer: 0, alive: true, targetId: 0, ...u };
    this.units.push(unit);
    this.byId.set(unit.id, unit);
    return unit;
  }

  get displayMinute() {
    return (this.t * DISPLAY_SCALE) / 60;
  }
  get isOver() {
    return this.winner !== null;
  }
  get draftResult() {
    return this.draft;
  }

  setOrders(side: 0 | 1, orders: CoachOrders) {
    this.teams[side].orders = { ...orders };
  }

  /** Chạy không vẽ hình tới khi kết thúc. */
  run(): MatchResult {
    while (!this.isOver) this.tick();
    return this.result();
  }

  /** Chạy thêm `seconds` giây mô phỏng (dùng cho trình xem theo tốc độ). */
  advance(seconds: number) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n && !this.isOver; i++) this.tick();
  }

  tick() {
    if (this.isOver) return;
    this.t = Math.round((this.t + DT) * 10) / 10;
    this.spawns();
    if (Math.abs(this.t - Math.round(this.t)) < 1e-6) for (const side of [0, 1] as const) this.teamBrain(side);
    for (const c of this.champs) this.champTick(c);
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.kind === "MINION") this.minionTick(u);
      else if (u.kind === "TOWER") this.towerTick(u);
      else if (u.kind === "CAMP" || u.kind === "DRAGON" || u.kind === "BARON") this.monsterTick(u);
    }
    this.economyTick();
    if (Math.abs(this.t - 300) < 1e-6) this.snapshot15();
    for (const m of [300, 500]) if (Math.abs(this.t - m) < 1e-6) this.goldAt[m] = [this.teamGold(0), this.teamGold(1)];
    // dọn lính chết để mảng không phình
    if (Math.abs(this.t % 10) < 1e-6) {
      for (let i = this.units.length - 1; i >= 0; i--)
        if (this.units[i].kind === "MINION" && !this.units[i].alive) this.byId.delete(this.units.splice(i, 1)[0].id);
    }
    if (this.t >= LIVE.maxTime && this.winner === null) this.forceEnd();
  }

  // ------------------------------------------------------------------ Sinh lính, quái
  private spawns() {
    if (this.t >= this.nextWave) {
      const wave = Math.floor((this.t - LIVE.firstWave) / LIVE.waveEvery);
      for (const side of [0, 1] as const)
        for (const lane of LANES)
          for (let i = 0; i < LIVE.minionsPerWave; i++) {
            const ranged = i >= LIVE.minionsPerWave / 2;
            const t0 = 0.03 - i * 0.012;
            const p = lanePointFor(lane, side, Math.max(0, t0));
            this.add({
              kind: "MINION", side, x: p.x, y: p.y, lane, t: Math.max(0, t0), ranged,
              hp: (ranged ? 230 : 320) + wave * 12, maxHp: (ranged ? 230 : 320) + wave * 12,
              power: (ranged ? 26 : 18) + wave * 1.2, range: ranged ? 20 : 6, aspd: 0.8, speed: 9,
            });
          }
      this.nextWave += LIVE.waveEvery;
    }
    for (const u of this.units) {
      if (u.alive || u.respawnAt === undefined || this.t < u.respawnAt) continue;
      if (u.kind === "CAMP" || u.kind === "DRAGON" || u.kind === "BARON") {
        u.alive = true;
        u.hp = u.maxHp;
        u.x = u.home!.x;
        u.y = u.home!.y;
        u.respawnAt = undefined;
        u.targetId = 0;
      }
    }
    for (const c of this.champs) {
      if (!c.alive && this.t >= c.respawnAt) {
        const f = FOUNTAIN[c.side];
        Object.assign(c, { alive: true, x: f.x, y: f.y, hp: c.maxHp, state: c.role === "JUNGLE" ? "JUNGLE" : "LANE", focus: 0, shield: 0 });
        this.shop(c);
      }
    }
  }

  // ------------------------------------------------------------------ Bộ não đội (mỗi giây)
  private teamBrain(side: 0 | 1) {
    const team = this.teams[side];
    const enemy = 1 - side as 0 | 1;
    const mine = this.champs.filter((c) => c.side === side && c.alive);
    const theirs = this.champs.filter((c) => c.side === enemy && c.alive);
    const lead = this.teamGold(side) - this.teamGold(enemy);
    const obj = mine.reduce((s, c) => s + attr(c.player, "macro", "objective_control"), 0) / Math.max(1, mine.length);
    const risk = team.orders.risk;
    const advantage = mine.length - theirs.length + lead / 3000 + (risk === "AGGRESSIVE" ? 0.6 : risk === "SAFE" ? -0.6 : 0);
    const set = (kind: TeamState["call"]["kind"], point: Vec, lane?: Lane) => {
      if (team.call.kind !== kind || team.call.lane !== lane) team.call = { kind, point, lane, since: this.t };
    };

    // Vừa thắng giao tranh (đông hơn ≥2 người): dồn ngay vào công trình địch gần đội nhất
    if (mine.length - theirs.length >= 2 && mine.length >= 3) {
      const cx = mine.reduce((s, c) => s + c.x, 0) / mine.length;
      const cy = mine.reduce((s, c) => s + c.y, 0) / mine.length;
      let lane: Lane = "MID";
      let best = Infinity;
      for (const l of LANES) {
        const st = this.nextStructure(enemy, l);
        if (st && dist(st, { x: cx, y: cy }) < best) (best = dist(st, { x: cx, y: cy })), (lane = l);
      }
      if (team.call.kind !== "PUSH" || team.call.lane !== lane) team.call = { kind: "PUSH", point: this.waveFront(side, lane), lane, since: this.t - 10 };
      team.call.dive = true;
      return;
    }
    if (team.call.dive) team.call.dive = false;
    if (this.baron.alive && this.t >= LIVE.laningEnd && (advantage >= 1 || (team.orders.objective === "HERALD_BARON" && advantage >= 0)) && this.rng.chance(0.3 + obj * 0.4))
      return set("BARON", BARON_PIT);
    if (team.call.kind === "BARON" && this.baron.alive && advantage >= -0.5) return;
    const wantDragon = team.orders.objective !== "HERALD_BARON" || advantage >= 1;
    if (this.dragon.alive && wantDragon && advantage >= (team.orders.objective === "DRAGON" ? -0.5 : 0) && this.rng.chance(0.25 + obj * 0.4))
      return set("DRAGON", DRAGON_PIT);
    if (team.call.kind === "DRAGON" && this.dragon.alive && advantage >= -1) return;

    if (this.t < LIVE.laningEnd && theirs.length >= 3) return set("NONE", NEXUS[side]);
    // Sau đi đường (hoặc địch chết nhiều): dồn về đường có trụ địch yếu nhất
    if (team.call.kind === "PUSH" && this.t - team.call.since < 25 && advantage > -1.5) return;
    const lane = this.pushLane(side);
    if (advantage < -1.5) return set("NONE", NEXUS[side]);
    set("PUSH", this.waveFront(side, lane), lane);
  }

  /** Đường nên dồn: đường mà trụ kế tiếp của địch thấp máu nhất (ưu tiên giữa khi bằng nhau). */
  private pushLane(side: 0 | 1): Lane {
    let best: Lane = "MID";
    let bestScore = -Infinity;
    for (const lane of LANES) {
      const tower = this.nextTower(1 - side as 0 | 1, lane);
      const score = tower ? 1 - tower.hp / tower.maxHp + (lane === "MID" ? 0.05 : 0) : 2;
      if (score > bestScore) (bestScore = score), (best = lane);
    }
    return best;
  }

  /** Trụ đứng đầu tiên của `side` trên đường (theo thứ tự ngoài → trong → nhà lính). */
  private nextTower(side: 0 | 1, lane: Lane): Unit | undefined {
    for (const tier of ["OUTER", "INNER", "INHIB"] as const) {
      const t = this.units.find((u) => u.kind === "TOWER" && u.side === side && u.lane === lane && u.tier === tier);
      if (t?.alive) return t;
    }
    return undefined;
  }

  /** Vị trí đầu đợt lính phe mình trên đường (hoặc trụ ngoài cùng nếu không có lính). */
  private waveFront(side: 0 | 1, lane: Lane): Vec {
    let tMax = 0.3;
    for (const u of this.units) if (u.alive && u.kind === "MINION" && u.side === side && u.lane === lane) tMax = Math.max(tMax, u.t ?? 0);
    return lanePointFor(lane, side, Math.min(0.95, tMax - 0.03));
  }

  // ------------------------------------------------------------------ Tướng
  private champTick(c: ChampUnit) {
    if (!c.alive) return;
    c.atkTimer -= DT;
    c.skillCd -= DT;
    c.ultCd -= DT;
    if (this.t < c.stunUntil) return;

    // hồi máu chậm khi không giao tranh, nhanh ở bệ đá
    if (this.t - c.hurtAt > 5) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.008 * DT);
    const f = FOUNTAIN[c.side];
    if (dist(c, f) < 14) {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.15 * DT);
      if (c.state === "RECALL" && c.hp >= c.maxHp * 0.98) {
        this.shop(c);
        c.state = c.role === "JUNGLE" ? "JUNGLE" : "LANE";
      }
    }

    if (this.t >= c.decideAt) {
      const before = c.state;
      const focus = c.focus;
      this.decide(c);
      c.decideAt = this.t + 0.5;
      if (this.recordFx && (c.state !== before || (c.state === "FIGHT" && c.focus !== focus))) this.logIntent(c);
    }
    this.act(c);
  }

  private logIntent(c: ChampUnit) {
    if (this.t - (this.lastIntentAt.get(c.id) ?? -10) < 3) return;
    const call = this.teams[c.side].call;
    const target = this.champs.find((e) => e.id === c.focus);
    let text: string | null = null;
    if (c.state === "FIGHT" && target) text = `Giao tranh, mục tiêu ${target.champion.name}!`;
    else if (c.state === "GANK") text = target?.homeLane ? `Đi gank ${LANE_VI[target.homeLane]}` : "Đi gank";
    else if (c.state === "RETREAT") text = c.hp / c.maxHp < 0.5 ? "Máu thấp, lùi lại" : "Bất lợi, lùi lại";
    else if (c.state === "RECALL") text = "Về nhà hồi máu";
    else if (c.state === "GROUP")
      text = call.kind === "DRAGON" ? "Tập trung đánh Rồng" : call.kind === "BARON" ? "Tập trung đánh Baron" : call.dive ? "Dồn trụ sau giao tranh!" : call.lane ? `Dồn ${LANE_VI[call.lane]}` : null;
    if (!text) return;
    this.lastIntentAt.set(c.id, this.t);
    this.intents.push({ t: this.t, side: c.side, ign: c.player.ign, text });
    if (this.intents.length > 60) this.intents.splice(0, this.intents.length - 60);
  }

  private pushFx(f: Omit<Fx, "t">) {
    if (!this.recordFx) return;
    this.fx.push({ t: this.t, ...f });
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  /** Độ "nhiễu" khi đánh giá tình huống: kém nhận thức, mất bình tĩnh, áp lực trận lớn => sai nhiều hơn. */
  private noise(c: ChampUnit) {
    const aware = (attr(c.player, "macro", "map_awareness") + attr(c.player, "macro", "vision_control")) / 2;
    const behind = this.teamKills(1 - c.side as 0 | 1) - this.teamKills(c.side) >= 5;
    const tilt = behind ? 1 + (1 - attr(c.player, "mental", "tilt_resistance")) : 1;
    const nerves = 1 + this.ctx.stagePressure * (1 - attr(c.player, "mental", "big_match"));
    const cond = 2 - conditionFactor(c.player, this.ctx);
    return (0.08 + (1 - aware) * 0.5) * tilt * nerves * cond * (1.2 - attr(c.player, "mental", "consistency") * 0.4);
  }

  /** Sức mạnh cục bộ (máu × sát thương mỗi giây) của một phe quanh điểm. */
  private localPower(side: 0 | 1, at: Vec, radius: number) {
    let p = 0;
    for (const u of this.champs) if (u.alive && u.side === side && dist(u, at) <= radius) p += (u.hp + u.shield) * this.dps(u);
    for (const u of this.units)
      if (u.alive && u.kind === "TOWER" && u.side === side && dist(u, at) <= u.range + 6) p += 900 * 160; // trụ rất nguy hiểm
    return p;
  }

  private dps(c: ChampUnit) {
    return this.effPower(c) * c.aspd * (this.t < c.buffUntil && c.arch === "MARKSMAN" ? 1.5 : 1) + (c.arch === "MAGE" ? 25 : 0);
  }

  private effPower(c: ChampUnit) {
    const team = this.teams[c.side];
    const dragons = Math.min(team.dragons, 4) * 0.04 + (team.dragons >= 4 ? 0.08 : 0);
    const baron = this.t < team.baronUntil ? 0.25 : 0;
    const ult = this.t < c.buffUntil && c.arch === "FIGHTER" ? 0.3 : 0;
    const mastery = (c.mastery - 70) * 0.002; // tướng tủ: tối đa ~+6%
    return c.power * phaseMult(c.champion, this.displayMinute) * (1 + dragons + baron + ult + mastery) * c.efficiency;
  }

  private retreatHp(c: ChampUnit) {
    const r = this.teams[c.side].orders.risk;
    return r === "SAFE" ? 0.38 : r === "AGGRESSIVE" ? 0.18 : 0.28;
  }

  private decide(c: ChampUnit) {
    const team = this.teams[c.side];
    const enemySide = 1 - c.side as 0 | 1;
    if (c.state === "RECALL" && c.hp < c.maxHp * 0.98) return;
    if (c.state === "RETREAT" && this.t < c.stateUntil) return;

    const enemies = this.champs.filter((e) => e.alive && e.side === enemySide && dist(e, c) < 42);
    let fightThreshold = c.state === "FIGHT" ? 0.85 : team.orders.risk === "AGGRESSIVE" ? 0.95 : team.orders.risk === "SAFE" ? 1.35 : 1.12;
    // Giai đoạn đi đường: chỉ trao đổi khi có lợi thế rõ (đối thủ thấp máu, có rừng hỗ trợ)
    if (this.t < LIVE.laningEnd && (c.state === "LANE" || c.state === "JUNGLE")) fightThreshold += 0.45;

    if (c.hp / c.maxHp < this.retreatHp(c) && !(c.state === "FIGHT" && enemies.some((e) => e.hp / e.maxHp < 0.2))) {
      c.state = "RECALL";
      c.focus = 0;
      return;
    }

    // Không lao vào tầm trụ địch đuổi theo, trừ khi gần như chắc chắn hạ được hoặc có Baron
    if (c.state === "FIGHT") {
      const target = this.champs.find((e) => e.id === c.focus && e.alive);
      const enemyTower = target && this.units.some((u) => u.alive && u.kind === "TOWER" && u.side === enemySide && dist(u, target) < u.range + 3);
      const sure = target && target.hp / target.maxHp < 0.15 && c.hp / c.maxHp > 0.5;
      // Lặn trụ tập thể khi đông hơn hẳn thì được phép
      const near = (side: number) => (target ? this.champs.filter((e) => e.alive && e.side === side && dist(e, target) < 35).length : 0);
      const dive = target && near(c.side) >= near(enemySide) + 2;
      if (enemyTower && !sure && !dive && this.t >= team.baronUntil) {
        c.state = "RETREAT";
        c.stateUntil = this.t + 1.5;
        c.focus = 0;
        return;
      }
    }

    if (enemies.length) {
      const ally = this.localPower(c.side, c, 45);
      const foe = this.localPower(enemySide, c, 45);
      let ratio = ally / Math.max(1, foe);
      // Đỡ đòn/khống chế mở giao tranh: chọn thời điểm tốt hơn khi engage_timing cao
      if (c.arch === "TANK" || c.arch === "CATCHER") ratio *= 0.9 + attr(c.player, "teamfight", "engage_timing") * 0.2;
      ratio *= 1 + this.rng.gauss() * this.noise(c);
      // Giai đoạn đi đường (đi đường, không phải rừng/gank): chỉ lao vào khi có cơ hội rõ ràng
      if (this.t < LIVE.laningEnd && c.state === "LANE") {
        const weak = enemies.some((e) => e.hp / e.maxHp < 0.35 && dist(e, c) < 30) && c.hp / c.maxHp > 0.5;
        const jungler = this.champs.some((a) => a.alive && a.side === c.side && a.role === "JUNGLE" && dist(a, c) < 30);
        const attacked = this.t - c.hurtAt < 1 && [...c.hitBy.values()].some((at) => this.t - at < 1);
        if (!(weak || jungler || attacked)) ratio = Math.min(ratio, fightThreshold - 0.01);
      }
      if (ratio >= fightThreshold) {
        c.state = "FIGHT";
        c.focus = this.pickTarget(c, enemies).id;
        return;
      }
      // Chỉ lùi khi thật sự yếu thế; ngang cơ thì tiếp tục farm/làm việc của mình
      const laning = this.t < LIVE.laningEnd && c.state !== "FIGHT";
      if (ratio < (laning ? 0.55 : 0.8) && enemies.some((e) => dist(e, c) < (laning ? 18 : 28)) && c.hp / c.maxHp < (laning ? 0.7 : 1.01)) {
        c.state = "RETREAT";
        c.stateUntil = this.t + 1.5;
        c.focus = 0;
        return;
      }
    }
    if (c.state === "FIGHT") c.focus = 0;

    // Lệnh của đội: phản ứng chậm hơn nếu chỉ số luân chuyển thấp
    const call = team.call;
    const delay = (1 - attr(c.player, "macro", "rotation")) * 5;
    // Đường trên luôn giữ đường biên khi đội dồn đường khác (đẩy lẻ thì kể cả khi đội dồn cùng đường)
    const splitter = c.role === "TOP" && call.kind === "PUSH" && !call.dive && (team.setup.tactic === "SPLIT_1_4" || call.lane !== "TOP");
    // Giai đoạn đi đường: đường trên không bỏ đường đi Rồng
    const laningTop = this.t < LIVE.laningEnd && c.role === "TOP" && call.kind === "DRAGON";
    if (call.kind !== "NONE" && this.t - call.since >= delay && !splitter && !laningTop && (this.t >= LIVE.laningEnd || call.kind !== "PUSH" || c.role === "JUNGLE" || dist(c, call.point) < 60)) {
      c.state = "GROUP";
      return;
    }

    if (c.role === "JUNGLE") {
      if (c.state !== "GANK" && this.t > 30 && this.rng.chance(this.gankChance(c))) {
        c.state = "GANK";
        c.stateUntil = this.t + 14;
        c.focus = this.gankTarget(c)?.id ?? 0;
        return;
      }
      if (c.state === "GANK" && this.t < c.stateUntil && c.focus) return;
      c.state = "JUNGLE";
      return;
    }
    c.state = "LANE";
  }

  private gankChance(c: ChampUnit) {
    const focus = this.teams[c.side].orders.laneFocus;
    return 0.02 + attr(c.player, "macro", "map_awareness") * 0.02 + (focus !== "NONE" ? 0.03 : 0);
  }

  private gankTarget(c: ChampUnit): ChampUnit | undefined {
    const focus = this.teams[c.side].orders.laneFocus;
    const lane: Lane | null = focus === "NONE" ? null : focus;
    const cands = this.champs.filter((e) => e.alive && e.side !== c.side && e.role !== "JUNGLE" && (!lane || e.homeLane === lane));
    return cands.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  /** Chọn mục tiêu: người chọn mục tiêu giỏi nhắm vào carry/đối thủ yếu máu, người kém đánh người gần nhất. */
  private pickTarget(c: ChampUnit, enemies: ChampUnit[]): ChampUnit {
    if (this.rng.chance(attr(c.player, "teamfight", "target_selection"))) {
      const score = (e: ChampUnit) => (1 - e.hp / e.maxHp) * 2 + (e.arch === "MARKSMAN" || e.arch === "MAGE" ? 0.8 : 0) - dist(e, c) / 60;
      return [...enemies].sort((a, b) => score(b) - score(a))[0];
    }
    return [...enemies].sort((a, b) => dist(a, c) - dist(b, c))[0];
  }

  private act(c: ChampUnit) {
    const team = this.teams[c.side];
    switch (c.state) {
      case "RECALL":
      case "RETREAT": {
        const dest = c.state === "RECALL" ? FOUNTAIN[c.side] : this.safePoint(c);
        this.moveTo(c, dest);
        return;
      }
      case "FIGHT":
      case "GANK": {
        const target = this.champs.find((e) => e.id === c.focus && e.alive);
        if (!target) {
          c.state = c.role === "JUNGLE" ? "JUNGLE" : "LANE";
          return;
        }
        if (c.state === "GANK" && dist(c, target) > 40) return this.moveTo(c, target);
        c.state = "FIGHT";
        this.fight(c, target);
        return;
      }
      case "GROUP": {
        const call = team.call;
        if (call.kind === "DRAGON" || call.kind === "BARON") {
          const m = call.kind === "DRAGON" ? this.dragon : this.baron;
          if (!m.alive) return void (c.state = "LANE");
          if (dist(c, m) > c.range + 2) return this.moveTo(c, m);
          return this.attack(c, m);
        }
        if (call.kind === "PUSH" && call.lane) {
          // Đang dồn sau giao tranh thắng: đi thẳng vào công trình, không chờ lính
          if (call.dive) {
            const st = this.nextStructure(1 - c.side as 0 | 1, call.lane);
            if (st) return dist(c, st) > c.range ? this.moveTo(c, st) : this.attack(c, st);
          }
          return this.laneBehaviour(c, call.lane, true);
        }
        return this.moveTo(c, call.point);
      }
      case "JUNGLE": {
        const camp = this.units
          .filter((u) => u.kind === "CAMP" && u.alive && CAMPS.some((k) => k.side === c.side && k.pos.x === u.home!.x && k.pos.y === u.home!.y))
          .sort((a, b) => dist(a, c) - dist(b, c))[0];
        if (!camp) return this.laneBehaviour(c, "MID", false);
        if (dist(c, camp) > c.range + 2) return this.moveTo(c, camp);
        return this.attack(c, camp);
      }
      default: {
        const lane = c.homeLane ?? "MID";
        const split = team.setup.tactic === "SPLIT_1_4" && c.role === "TOP" && this.t >= LIVE.laningEnd;
        return this.laneBehaviour(c, split ? "TOP" : lane, split);
      }
    }
  }

  private safePoint(c: ChampUnit): Vec {
    const tower = this.units
      .filter((u) => u.alive && u.kind === "TOWER" && u.side === c.side)
      .sort((a, b) => dist(a, c) - dist(b, c))[0];
    return tower ? { x: tower.x + (c.side === 0 ? -6 : 6), y: tower.y + (c.side === 0 ? 6 : -6) } : FOUNTAIN[c.side];
  }

  /** Đi đường / đẩy lẻ: đứng sau đợt lính, ăn lính, đánh trụ khi an toàn. */
  private laneBehaviour(c: ChampUnit, lane: Lane, pushing: boolean) {
    const front = this.waveFront(c.side, lane);
    const ranged = c.range > 15;
    const stand = ranged ? { x: front.x + (c.side === 0 ? -4 : 4), y: front.y + (c.side === 0 ? 4 : -4) } : front;

    // lính địch trong tầm
    let best: Unit | undefined;
    let bestScore = -Infinity;
    const dmg = this.effPower(c);
    const lastHitSkill = (attr(c.player, "mechanics", "cs_efficiency") + attr(c.player, "mechanics", "laning")) / 2;
    for (const u of this.units) {
      if (!u.alive || u.kind !== "MINION" || u.side === c.side || u.lane !== lane) continue;
      const d = dist(u, c);
      if (d > c.range + 26) continue;
      // giỏi ăn lính: ưu tiên lính sắp chết; kém: đánh lính gần nhất
      const killable = u.hp <= dmg * 1.05;
      const score = (killable && this.rng.chance(lastHitSkill) ? 100 : 0) + (pushing ? 50 - u.hp / 20 : -d) - (killable ? 0 : u.hp / 50);
      if (score > bestScore) (bestScore = score), (best = u);
    }
    if (best) {
      if (dist(c, best) > c.range) return this.moveTo(c, best);
      return this.attack(c, best);
    }

    // không có lính: đánh trụ nếu có lính phe mình đỡ đòn hoặc địch không có ai quanh
    const tower = this.nextStructure(1 - c.side as 0 | 1, lane);
    if (tower && dist(c, tower) < 60) {
      const shielded = this.units.some((u) => u.alive && u.kind === "MINION" && u.side === c.side && dist(u, tower) < tower.range);
      const baron = this.t < this.teams[c.side].baronUntil;
      const defenders = this.champs.filter((e) => e.alive && e.side !== c.side && dist(e, tower) < 40).length;
      const attackers = this.champs.filter((e) => e.alive && e.side === c.side && dist(e, tower) < 45).length;
      // Công trụ khi có lính đỡ đòn / có Baron, và phe mình đông hơn người thủ
      if ((shielded || baron || pushing) && attackers > defenders) {
        if (dist(c, tower) > c.range) return this.moveTo(c, tower);
        return this.attack(c, tower);
      }
    }
    if (dist(c, stand) > 3) this.moveTo(c, stand);
  }

  /** Công trình kế tiếp có thể đánh của `side` trên đường (kể cả trụ nhà chính / nhà chính). */
  private nextStructure(side: 0 | 1, lane: Lane): Unit | undefined {
    const t = this.nextTower(side, lane);
    if (t) return t;
    const nexusTowers = this.units.filter((u) => u.kind === "TOWER" && u.side === side && u.tier === "NEXUS" && u.alive);
    if (nexusTowers.length) return nexusTowers[0];
    return this.units.find((u) => u.kind === "NEXUS" && u.side === side && u.alive);
  }

  private targetable(u: Unit): boolean {
    if (!u.alive) return false;
    if (u.kind === "TOWER" && u.tier !== "OUTER") {
      const side = u.side as 0 | 1;
      if (u.tier === "NEXUS") return LANES.some((l) => !this.nextTower(side, l));
      return this.nextTower(side, u.lane!) === u;
    }
    if (u.kind === "NEXUS") return !this.units.some((x) => x.kind === "TOWER" && x.side === u.side && x.tier === "NEXUS" && x.alive);
    return true;
  }

  private fight(c: ChampUnit, target: ChampUnit) {
    const d = dist(c, target);
    // Xạ thủ/pháp sư/hỗ trợ: giữ khoảng cách nếu bị áp sát (positioning)
    const ranged = c.range > 15;
    if (ranged) {
      const threat = this.champs.find((e) => e.alive && e.side !== c.side && e.range < 15 && dist(e, c) < 8);
      if (threat && c.atkTimer > 0 && this.rng.chance(attr(c.player, "teamfight", "positioning") * 0.6)) {
        const away = { x: c.x + (c.x - threat.x), y: c.y + (c.y - threat.y) };
        return this.moveTo(c, away);
      }
    }
    this.useSkills(c, target);
    if (d > c.range) return this.moveTo(c, target);
    this.attack(c, target);
  }

  private skillLands(c: ChampUnit, target: ChampUnit) {
    if (this.t < target.stunUntil) return true;
    const acc = attr(c.player, "mechanics", "skillshot_accuracy");
    const dodge = attr(target.player, "mechanics", "mechanical_outplay") * 0.18;
    return this.rng.chance(0.42 + acc * 0.45 + (c.mastery - 70) / 300 - dodge);
  }

  private useSkills(c: ChampUnit, target: ChampUnit) {
    const S = SKILLS[c.arch];
    const p = this.effPower(c);
    const d = dist(c, target);
    const enemiesNear = (pt: Vec, r: number) => this.champs.filter((e) => e.alive && e.side !== c.side && dist(e, pt) <= r);
    const alliesNear = (r: number) => this.champs.filter((e) => e.alive && e.side === c.side && dist(e, c) <= r);

    // Chiêu cuối
    if (c.ultCd <= 0 && d <= S.ult.range) {
      const crowd = enemiesNear(target, 20).length;
      const lowAllies = alliesNear(S.ult.range).filter((a) => a.hp / a.maxHp < 0.5).length;
      const want =
        c.arch === "ENCHANTER" ? lowAllies >= 2 :
        c.arch === "ASSASSIN" || c.arch === "MARKSMAN" ? target.hp / target.maxHp < 0.45 || crowd >= 3 :
        crowd >= 2 || target.hp / target.maxHp < 0.35;
      if (want) {
        c.ultCd = S.ult.cooldown;
        this.pushFx({ kind: c.arch === "ENCHANTER" ? "heal" : "ult", side: c.side, x1: c.x, y1: c.y, x2: target.x, y2: target.y, arch: c.arch });
        switch (c.arch) {
          case "TANK":
          case "CATCHER":
            this.blink(c, target, 5);
            for (const e of enemiesNear(target, c.arch === "TANK" ? 18 : 16)) {
              e.stunUntil = this.t + (c.arch === "TANK" ? 1.4 : 1.2);
              this.damage(c, e, p * 0.9);
            }
            break;
          case "FIGHTER":
            c.buffUntil = this.t + 6;
            c.shield += c.maxHp * 0.2;
            break;
          case "ASSASSIN":
            this.blink(c, target, 3);
            this.damage(c, target, p * 2.2 * (target.hp / target.maxHp < 0.4 ? 1.6 : 1));
            break;
          case "MAGE":
            for (const e of enemiesNear(target, 18)) if (this.skillLands(c, e)) this.damage(c, e, p * 3);
            break;
          case "MARKSMAN":
            if (this.skillLands(c, target)) this.damage(c, target, p * 2.6);
            break;
          case "ENCHANTER":
            for (const a of alliesNear(30)) this.heal(a, 100 + p * 2.2);
            break;
        }
      }
    }

    // Chiêu thường
    if (c.skillCd > 0) return;
    if (c.arch === "ENCHANTER") {
      const ally = alliesNear(S.skill.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (ally && ally.hp / ally.maxHp < 0.75) {
        c.skillCd = S.skill.cooldown;
        this.pushFx({ kind: "heal", side: c.side, x1: c.x, y1: c.y, x2: ally.x, y2: ally.y, arch: c.arch });
        this.heal(ally, 60 + p * 1.8);
        ally.shield += 40 + p;
      }
      return;
    }
    if (d > S.skill.range) return;
    c.skillCd = S.skill.cooldown;
    this.pushFx({ kind: "skill", side: c.side, x1: c.x, y1: c.y, x2: target.x, y2: target.y, arch: c.arch });
    switch (c.arch) {
      case "TANK":
        this.blink(c, target, 4);
        target.stunUntil = this.t + 1;
        this.damage(c, target, p * 0.9);
        break;
      case "CATCHER":
        if (this.skillLands(c, target)) {
          target.stunUntil = this.t + 1.2;
          this.damage(c, target, p * 0.7);
        }
        break;
      case "FIGHTER": {
        const dealt = this.damage(c, target, p * 1.5);
        this.heal(c, dealt * 0.4);
        break;
      }
      case "ASSASSIN":
        this.blink(c, target, 3);
        this.damage(c, target, p * 1.8);
        break;
      case "MAGE":
        for (const e of enemiesNear(target, 10)) if (this.skillLands(c, e)) this.damage(c, e, p * 1.7);
        break;
      case "MARKSMAN":
        c.buffUntil = this.t + 4;
        break;
    }
  }

  private blink(c: Unit, to: Vec, gap: number) {
    const d = dist(c, to);
    if (d <= gap) return;
    const k = (d - gap) / d;
    c.x += (to.x - c.x) * k;
    c.y += (to.y - c.y) * k;
  }

  private heal(u: Unit, amount: number) {
    if (!u.alive) return;
    u.hp = Math.min(u.maxHp, u.hp + amount);
  }

  private moveTo(u: Unit, to: Vec) {
    const d = dist(u, to);
    if (d < 0.01) return;
    const step = Math.min(d, u.speed * DT * (u.kind === "CHAMP" && this.t < (this.teams[u.side as 0 | 1]?.baronUntil ?? 0) ? 1.1 : 1));
    u.x += ((to.x - u.x) / d) * step;
    u.y += ((to.y - u.y) / d) * step;
  }

  private attack(u: Unit, target: Unit) {
    if (u.atkTimer > 0) return;
    u.atkTimer = 1 / Math.max(0.1, u.aspd * (u.kind === "CHAMP" && this.t < (u as ChampUnit).buffUntil && (u as ChampUnit).arch === "MARKSMAN" ? 1.5 : 1));
    u.targetId = target.id;
    if (this.recordFx) this.pushFx({ kind: u.range > 15 || u.kind === "TOWER" ? "shot" : "hit", side: u.side, x1: u.x, y1: u.y, x2: target.x, y2: target.y });
    let amount = u.kind === "CHAMP" ? this.effPower(u as ChampUnit) : u.power;
    // Lính đánh lính chậm để tướng còn ăn lính; tướng dọn lính theo chỉ số waveclear của tướng
    if (target.kind === "MINION") amount *= u.kind === "MINION" ? 0.3 : 1.3 + (u.kind === "CHAMP" ? (u as ChampUnit).champion.profile.waveclear * 0.06 : 0);
    if (u.kind === "TOWER") amount = target.kind === "MINION" ? target.maxHp * 0.45 : u.power * (1 + this.t / 600);
    this.damage(u, target, amount);
  }

  /** Gây sát thương, trả về lượng thực tế. Xử lý lá chắn, giảm sát thương công trình, ghi công, chết. */
  private damage(src: Unit, tgt: Unit, raw: number): number {
    if (!tgt.alive) return 0;
    if (!this.targetable(tgt)) return 0;
    let amount = raw;
    if (tgt.kind === "TOWER" || tgt.kind === "NEXUS") {
      const baron = src.kind === "CHAMP" && this.t < this.teams[src.side as 0 | 1].baronUntil;
      // trụ yếu dần theo thời gian (hết lớp giáp), giúp trận không kéo dài
      amount *= src.kind === "MINION" ? 0.6 : (baron ? 1.6 : 0.8) * (1 + this.t / 500);
    }
    if (tgt.kind === "CHAMP") {
      const ct = tgt as ChampUnit;
      ct.hurtAt = this.t;
      const absorbed = Math.min(ct.shield, amount);
      ct.shield -= absorbed;
      amount -= absorbed;
      if (src.kind === "CHAMP") {
        ct.hitBy.set(src.id, this.t);
        (src as ChampUnit).attackedChampAt = this.t;
        (src as ChampUnit).line.damage += amount + absorbed;
      }
    }
    if (tgt.kind === "CAMP" || tgt.kind === "DRAGON" || tgt.kind === "BARON") {
      tgt.targetId = src.id;
      tgt.aggroAt = this.t;
    }
    tgt.hp -= amount;
    if (src.kind === "CHAMP") tgt.lastHit = src.id;
    if (tgt.hp <= 0) this.kill(src, tgt);
    return amount;
  }

  // ------------------------------------------------------------------ Lính, trụ, quái
  private minionTick(m: Unit) {
    m.atkTimer -= DT;
    const side = m.side as 0 | 1;
    // giữ mục tiêu cũ giữa các lần dò (dò lại mỗi 0.3s) để đỡ tốn CPU
    const cached = m.targetId ? this.byId.get(m.targetId) : undefined;
    if (cached && cached.alive && Math.round(this.t * 10 + m.id) % 3 !== 0 && dist(cached, m) < 24) return this.hit(m, cached);
    let target: Unit | undefined;
    let bestD = 22;
    // kéo aggro: tướng địch vừa đánh tướng phe mình ở gần
    for (const c of this.champs)
      if (c.alive && c.side !== side && this.t - c.attackedChampAt < 2 && dist(c, m) < 18) return this.hit(m, c);
    for (const u of this.units) {
      if (!u.alive || u.side === side || u.side === 2 || u === m) continue;
      if (u.kind !== "MINION" && u.kind !== "TOWER" && u.kind !== "NEXUS") continue;
      const d = dist(u, m) + (u.kind === "MINION" ? 0 : 6);
      if (d < bestD && this.targetable(u)) (bestD = d), (target = u);
    }
    if (!target)
      for (const c of this.champs) if (c.alive && c.side !== side && dist(c, m) < 14) (target = c);
    if (target) return this.hit(m, target);
    // đi theo đường
    const next = lanePointFor(m.lane!, side, Math.min(1, (m.t ?? 0) + 0.01));
    this.moveTo(m, next);
    if (dist(m, next) < 1.2) m.t = Math.min(1, (m.t ?? 0) + 0.01);
  }

  private hit(u: Unit, target: Unit) {
    if (dist(u, target) > u.range) return this.moveTo(u, target);
    this.attack(u, target);
  }

  private towerTick(t: Unit) {
    t.atkTimer -= DT;
    if (t.atkTimer > 0) return;
    const side = t.side as 0 | 1;
    let target: Unit | undefined;
    // ưu tiên tướng địch vừa đánh tướng phe mình trong tầm trụ
    for (const c of this.champs)
      if (c.alive && c.side !== side && dist(c, t) <= t.range && this.t - c.attackedChampAt < 2) target = c;
    if (!target) {
      let best = Infinity;
      for (const u of this.units)
        if (u.alive && u.kind === "MINION" && u.side !== side && dist(u, t) <= t.range && dist(u, t) < best) (best = dist(u, t)), (target = u);
    }
    if (!target) for (const c of this.champs) if (c.alive && c.side !== side && dist(c, t) <= t.range) target = c;
    if (target) this.attack(t, target);
  }

  private monsterTick(m: Unit) {
    m.atkTimer -= DT;
    const attacker = this.units.find((u) => u.id === m.targetId && u.alive);
    if (!attacker || dist(attacker, m.home!) > 28 || this.t - (m.aggroAt ?? 0) > 5) {
      m.targetId = 0;
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * DT); // hồi máu khi không bị đánh
      return;
    }
    if (dist(attacker, m) <= m.range + 2) this.attack(m, attacker);
  }

  // ------------------------------------------------------------------ Chết, phần thưởng
  private kill(src: Unit, tgt: Unit) {
    tgt.alive = false;
    tgt.hp = 0;
    const minute = Math.round(this.displayMinute * 10) / 10;
    const killer = src.kind === "CHAMP" ? (src as ChampUnit) : undefined;

    if (tgt.kind === "CHAMP") return this.champDeath(src, tgt as ChampUnit, minute);

    if (tgt.kind === "MINION") {
      const lh = this.champs.find((c) => c.id === tgt.lastHit && c.alive && dist(c, tgt) < 45);
      if (lh && src.kind === "CHAMP") {
        lh.line.cs += CS_PER_MINION;
        this.giveGold(lh, tgt.ranged ? 16 : 21);
      }
      for (const c of this.champs) if (c.alive && c.side !== tgt.side && dist(c, tgt) < 40) this.giveXp(c, 22);
      return;
    }

    if (tgt.kind === "CAMP") {
      tgt.respawnAt = this.t + LIVE.campRespawn;
      if (killer) {
        killer.line.cs += 4 * CS_PER_MINION;
        this.giveGold(killer, 55);
        this.giveXp(killer, 90);
      }
      return;
    }

    if (tgt.kind === "DRAGON" || tgt.kind === "BARON") {
      const side = this.objectiveWinner(tgt, killer);
      if (side === null) return;
      const team = this.teams[side];
      if (tgt.kind === "DRAGON") {
        tgt.respawnAt = this.t + LIVE.dragonRespawn;
        if (team.dragons < 4) team.dragons++;
        this.events.push({ minute, type: "DRAGON", side });
        if (team.dragons === 4) this.events.push({ minute, type: "SOUL", side });
        for (const c of this.champs) if (c.side === side) this.giveGold(c, 50);
      } else {
        tgt.respawnAt = this.t + LIVE.baronRespawn;
        team.barons++;
        team.baronUntil = this.t + LIVE.baronBuff;
        this.events.push({ minute, type: "BARON", side });
        for (const c of this.champs) if (c.side === side) this.giveGold(c, 150);
      }
      this.teams[side].call = { kind: "NONE", point: NEXUS[side], since: this.t };
      return;
    }

    if (tgt.kind === "TOWER" || tgt.kind === "NEXUS") {
      const side = (1 - (tgt.side as number)) as 0 | 1;
      this.teams[side].towers++;
      if (tgt.kind === "NEXUS") {
        this.events.push({ minute, type: "NEXUS", side });
        this.winner = side;
        return;
      }
      this.events.push({ minute, type: "TOWER", side, count: 1, reason: "FIGHT" });
      for (const c of this.champs) if (c.side === side) this.giveGold(c, 120);
    }
  }

  /** Cướp mục tiêu: nếu tướng địch cũng đang ở gần, đội có objective_control cao hơn có lợi thế. */
  private objectiveWinner(m: Unit, killer: ChampUnit | undefined): 0 | 1 | null {
    if (!killer) return null;
    const near = (side: number) => this.champs.filter((c) => c.alive && c.side === side && dist(c, m) < 22);
    const mine = near(killer.side);
    const theirs = near(1 - killer.side);
    if (!theirs.length) return killer.side;
    const avg = (cs: ChampUnit[]) => cs.reduce((s, c) => s + attr(c.player, "macro", "objective_control"), 0) / Math.max(1, cs.length);
    const steal = 0.12 + (avg(theirs) - avg(mine)) * 0.6;
    return this.rng.chance(Math.max(0.02, Math.min(0.5, steal))) ? (1 - killer.side as 0 | 1) : killer.side;
  }

  private champDeath(src: Unit, dead: ChampUnit, minute: number) {
    dead.line.deaths++;
    dead.respawnAt = this.t + 4 + dead.level * 1.4;
    dead.state = "DEAD";
    dead.focus = 0;
    dead.shield = 0;
    // người được tính mạng: tướng gây đòn cuối, hoặc tướng địch gây sát thương gần nhất trong 8s
    let killer: ChampUnit | undefined = src.kind === "CHAMP" ? (src as ChampUnit) : undefined;
    if (!killer) {
      let last = -Infinity;
      for (const [id, at] of dead.hitBy)
        if (this.t - at < 8 && at > last) (last = at), (killer = this.champs.find((c) => c.id === id));
    }
    const side = (1 - dead.side) as 0 | 1;
    if (killer) {
      killer.line.kills++;
      this.giveGold(killer, 300);
      this.giveXp(killer, 140 + dead.level * 15);
      for (const [id, at] of dead.hitBy) {
        if (id === killer.id || this.t - at > 8) continue;
        const a = this.champs.find((c) => c.id === id);
        if (!a) continue;
        a.line.assists++;
        this.giveGold(a, 120);
        this.giveXp(a, 60);
      }
      this.events.push({ minute, type: this.firstBlood ? "FIRST_BLOOD" : "KILL", side, killer: killer.player.ign, victim: dead.player.ign, lane: dead.homeLane ?? "JUNGLE" });
      this.firstBlood = false;
      this.recentKills.push({ t: this.t, side });
      this.detectTeamfight(minute);
    }
    dead.hitBy.clear();
  }

  private detectTeamfight(minute: number) {
    this.recentKills = this.recentKills.filter((k) => this.t - k.t < 12);
    if (this.recentKills.length < 3 || this.t - this.lastTeamfight < 20) return;
    const kills: [number, number] = [0, 0];
    for (const k of this.recentKills) kills[k.side]++;
    const winner: 0 | 1 = kills[0] >= kills[1] ? 0 : 1;
    this.events.push({ minute, type: "TEAMFIGHT", winner, kills, around: "SKIRMISH", pWin: 0.5 });
    this.lastTeamfight = this.t;
  }

  private giveGold(c: ChampUnit, g: number) {
    c.gold += g;
    c.line.gold += g;
  }

  private giveXp(c: ChampUnit, xp: number) {
    c.xp += xp;
    while (c.level < 18 && c.xp >= 40 + c.level * 25) {
      c.xp -= 40 + c.level * 25;
      c.level++;
      this.refreshStats(c);
    }
  }

  private shop(c: ChampUnit) {
    c.itemGold += c.gold;
    c.gold = 0;
    this.refreshStats(c);
  }

  private refreshStats(c: ChampUnit) {
    const st = statsAt(c.arch, c.level, c.itemGold);
    const ratio = c.hp / c.maxHp;
    c.maxHp = st.hp;
    c.hp = Math.max(1, st.hp * ratio);
    c.power = st.power;
    c.aspd = st.aspd;
  }

  private economyTick() {
    if (this.t < 10) return;
    for (const c of this.champs) {
      if (!c.alive) continue;
      this.giveGold(c, LIVE.passiveGold * DT);
      this.giveXp(c, LIVE.passiveXp * DT);
    }
  }

  private snapshot15() {
    for (const c of this.champs) {
      c.line.csAt15 = c.line.cs;
      c.line.goldAt15 = Math.round(c.line.gold);
    }
  }

  private forceEnd() {
    const score = (s: 0 | 1) => this.teams[s].towers * 1000 + this.teamKills(s) * 300 + this.teamGold(s) / 10;
    const side: 0 | 1 = score(0) >= score(1) ? 0 : 1;
    this.events.push({ minute: Math.round(this.displayMinute), type: "NEXUS", side });
    this.winner = side;
  }

  teamGold(side: 0 | 1) {
    return this.champs.filter((c) => c.side === side).reduce((s, c) => s + c.line.gold, 0);
  }
  teamKills(side: 0 | 1) {
    return this.champs.filter((c) => c.side === side).reduce((s, c) => s + c.line.kills, 0);
  }

  /** Bảng tỉ số cho UI */
  scoreboard() {
    return ([0, 1] as const).map((s) => ({
      kills: this.teamKills(s), gold: Math.round(this.teamGold(s)), towers: this.teams[s].towers,
      dragons: this.teams[s].dragons, barons: this.teams[s].barons, baronActive: this.t < this.teams[s].baronUntil,
    }));
  }

  result(): MatchResult {
    if (this.winner === null) throw new Error("Trận chưa kết thúc");
    const duration = Math.round(this.displayMinute * 10) / 10;
    if (this.t < 300) this.snapshot15();
    const phases: PhaseReport[] = [];
    const bounds: [PhaseReport["phase"], number, number][] = [["EARLY", 0, 15], ["MID", 15, 25], ["LATE", 25, Infinity]];
    for (const [phase, from, to] of bounds) {
      if (duration <= from) break;
      const evs = this.events.filter((e) => e.minute >= from && e.minute < to);
      const kills: [number, number] = [0, 0];
      for (const e of evs) if (e.type === "KILL" || e.type === "FIRST_BLOOD") kills[e.side]++;
      const g = to === 15 ? this.goldAt[300] : to === 25 ? this.goldAt[500] : undefined;
      phases.push({ phase, fromMinute: from, toMinute: Math.min(to, duration), goldDiff: g ? g[0] - g[1] : this.teamGold(0) - this.teamGold(1), kills, events: evs });
    }
    return {
      winner: this.winner,
      duration,
      draft: this.draft,
      sides: ([0, 1] as const).map((s) => ({
        name: this.teams[s].setup.team.name,
        kills: this.teamKills(s),
        gold: Math.round(this.teamGold(s)),
        towers: this.teams[s].towers,
        dragons: this.teams[s].dragons,
        barons: this.teams[s].barons,
        lines: this.champs.filter((c) => c.side === s).map((c) => ({ ...c.line, gold: Math.round(c.line.gold), damage: Math.round(c.line.damage) })),
      })),
      phases,
      events: this.events,
    };
  }
}

export function simulateLiveMatch(db: ChampionDb, ctx: MatchContext, setups: [TeamSetup, TeamSetup]): MatchResult {
  return new LiveMatch(db, ctx, setups).run();
}
