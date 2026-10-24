// Mô phỏng trận theo giai đoạn: EARLY (0-15') -> MID (15-25') -> LATE (25'+ tới khi vỡ nhà chính).
// Thiết kế chi tiết: docs/02-match-engine.md
import { ROLES, type ChampionProfile, type CoachOrders, type MatchContext, type Phase, type Player, type Role, type TeamSetup } from "./types.ts";
import { draftScore, draftWinProbability, matchup, type ChampionDb, type DraftBreakdown } from "./draft.ts";
import { playerPhaseRating, volatility } from "./ratings.ts";
import { createRng, type Rng } from "./rng.ts";

export type Side = 0 | 1;
const other = (s: Side): Side => (s === 0 ? 1 : 0);

export const MATCH = {
  /** Độ dốc của logistic theo ln(powerA/powerB): mạnh hơn 10% => ~60% */
  contestSlope: 4,
  goldPer1kPower: 0.018,
  goldPowerCap: 0.15,
  dragonPower: 0.015,
  soulPower: 0.06,
  baronPower: 0.1,
  elderPower: 0.15,
  /** +1 điểm meta/synergy trong draft => +0.4% sức mạnh (theo trọng số giai đoạn của đội hình) */
  draftMetaWeight: 0.004,
  objectivePriority: 0.08,
  risk: {
    SAFE: { power: 0.97, vol: 0.7, kills: -1 },
    NORMAL: { power: 1, vol: 1, kills: 0 },
    AGGRESSIVE: { power: 1.04, vol: 1.5, kills: 1 },
  },
  passiveGoldPerMin: 125,
  goldPerCs: 21,
  killGold: 300,
  assistGold: 150,
  towerGold: 550,
  dragonGold: 200,
  baronGold: 300,
  /** Tiền thưởng lội ngược (bounty): đội đang thua vàng thắng giao tranh nhận thêm 12% khoảng cách, tối đa 1500 */
  bountyShare: 0.12,
  bountyCap: 1500,
  /** 3 trụ ngoài + 3 trụ trong + 3 nhà lính + 2 trụ nhà chính */
  towersToNexus: 11,
  maxMinute: 60,
};

const CS_PER_MIN: Record<Role, number> = { TOP: 8.3, JUNGLE: 6.3, MID: 8.7, ADC: 9.0, SUPPORT: 1.6 };
const CARRY_WEIGHT: Record<Role, number> = { TOP: 1, JUNGLE: 0.9, MID: 1.3, ADC: 1.3, SUPPORT: 0.4 };
const LANES: { lane: "TOP" | "MID" | "BOT"; roles: Role[] }[] = [
  { lane: "TOP", roles: ["TOP"] },
  { lane: "MID", roles: ["MID"] },
  { lane: "BOT", roles: ["ADC", "SUPPORT"] },
];

export interface PlayerLine {
  playerId: string;
  ign: string;
  role: Role;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  csAt15: number;
  goldAt15: number;
}

export type MatchEvent =
  | { minute: number; type: "FIRST_BLOOD" | "KILL"; side: Side; killer: string; victim: string; lane: string }
  | { minute: number; type: "LANE_REPORT"; lane: string; winner: Side; edge: number }
  | { minute: number; type: "DRAGON" | "HERALD" | "BARON" | "ELDER" | "SOUL"; side: Side }
  | { minute: number; type: "TOWER"; side: Side; count: number; reason: "LANE" | "FIGHT" | "SPLIT" | "HERALD" }
  | { minute: number; type: "TEAMFIGHT"; winner: Side; kills: [number, number]; around: string; pWin: number }
  | { minute: number; type: "NEXUS"; side: Side };

export interface PhaseReport {
  phase: Phase;
  fromMinute: number;
  toMinute: number;
  goldDiff: number; // đội 0 trừ đội 1
  kills: [number, number];
  events: MatchEvent[];
}

interface SideState {
  setup: TeamSetup;
  orders: CoachOrders;
  lines: Record<Role, PlayerLine>;
  towers: number;
  dragons: number;
  barons: number;
  heralds: number;
  baronUntil: number;
  elderUntil: number;
}

export interface MatchResult {
  winner: Side;
  duration: number;
  draft: { breakdown: [DraftBreakdown, DraftBreakdown]; pWin: [number, number] };
  sides: { name: string; kills: number; gold: number; towers: number; dragons: number; barons: number; lines: PlayerLine[] }[];
  phases: PhaseReport[];
  events: MatchEvent[];
}

type ContestKind = "FIGHT" | "OBJECTIVE" | "SIEGE";

export class MatchSim {
  readonly rng: Rng;
  minute = 0;
  phase: Phase | "END" = "EARLY";
  winner: Side | null = null;
  readonly events: MatchEvent[] = [];
  readonly phases: PhaseReport[] = [];
  private readonly s: [SideState, SideState];
  private readonly draft: MatchResult["draft"];
  private nextDragon = 5;
  private nextBaron = 20;

  private readonly db: ChampionDb;
  private readonly ctx: MatchContext;

  constructor(db: ChampionDb, ctx: MatchContext, setups: [TeamSetup, TeamSetup]) {
    this.db = db;
    this.ctx = ctx;
    this.rng = createRng(ctx.seed);
    this.s = [this.initSide(setups[0]), this.initSide(setups[1])];
    const [a, b] = setups;
    const da = draftScore(db, ctx.patch, a.team, a.picks, b.picks, a.tactic);
    const dbk = draftScore(db, ctx.patch, b.team, b.picks, a.picks, b.tactic);
    const p = draftWinProbability(da.total, dbk.total);
    this.draft = { breakdown: [da, dbk], pWin: [p, 1 - p] };
  }

  get draftResult() {
    return this.draft;
  }

  get isOver() {
    return this.phase === "END";
  }

  /** Chạy 1 giai đoạn. HLV có thể đổi chỉ đạo trước mỗi giai đoạn. */
  playPhase(orders: [CoachOrders?, CoachOrders?] = []): PhaseReport {
    if (this.phase === "END") throw new Error("Trận đã kết thúc");
    orders.forEach((o, i) => o && (this.s[i].orders = o));
    const phase = this.phase;
    const from = this.minute;
    const firstEvent = this.events.length;
    const killsBefore = [this.kills(0), this.kills(1)];

    if (phase === "EARLY") this.runEarly();
    else if (phase === "MID") for (const m of [17, 20, 23]) this.round(m, "MID");
    else for (let m = 27; this.winner === null && m <= MATCH.maxMinute; m += 3) this.round(m, "LATE");

    if (phase === "LATE" && this.winner === null) this.forceEnd();
    this.phase = this.winner !== null ? "END" : phase === "EARLY" ? "MID" : "LATE";

    const report: PhaseReport = {
      phase,
      fromMinute: from,
      toMinute: this.minute,
      goldDiff: this.gold(0) - this.gold(1),
      kills: [this.kills(0) - killsBefore[0], this.kills(1) - killsBefore[1]],
      events: this.events.slice(firstEvent),
    };
    this.phases.push(report);
    return report;
  }

  /** Trạng thái hiện tại cho bảng tỉ số / bản đồ mini của UI. */
  snapshot() {
    return this.s.map((st, i) => ({
      kills: this.kills(i as Side),
      gold: Math.round(this.gold(i as Side)),
      towers: st.towers,
      dragons: st.dragons,
      barons: st.barons,
    }));
  }

  run(): MatchResult {
    while (!this.isOver) this.playPhase();
    return this.result();
  }

  result(): MatchResult {
    if (this.winner === null) throw new Error("Trận chưa kết thúc");
    return {
      winner: this.winner,
      duration: this.minute,
      draft: this.draft,
      sides: this.s.map((st, i) => ({
        name: st.setup.team.name,
        kills: this.kills(i as Side),
        gold: Math.round(this.gold(i as Side)),
        towers: st.towers,
        dragons: st.dragons,
        barons: st.barons,
        lines: ROLES.map((r) => ({ ...st.lines[r], gold: Math.round(st.lines[r].gold), cs: Math.round(st.lines[r].cs), damage: Math.round(st.lines[r].damage) })),
      })),
      phases: this.phases,
      events: this.events,
    };
  }

  // ------------------------------------------------------------------ EARLY
  private runEarly() {
    this.advance(14);
    const edges: Record<string, number> = {};
    let firstBlood = true;

    for (const { lane, roles } of LANES) {
      const r: [number, number] = [0, 0];
      const jungleHere: [boolean, boolean] = [false, false];
      for (const side of [0, 1] as Side[]) {
        const st = this.s[side];
        const enemy = this.s[other(side)];
        let rating = roles.reduce((sum, role) => sum + this.rating(side, role, "EARLY"), 0);
        const mu = roles.reduce((sum, role) => sum + matchup(this.db, st.setup.picks[role], enemy.setup.picks[role]), 0);
        rating *= 1 + 0.02 * mu; // áp cho cả hai bên => tỷ lệ chênh ~4% mỗi điểm khắc chế
        if (st.orders.laneFocus === lane) {
          rating += 0.35 * this.rating(side, "JUNGLE", "EARLY");
          jungleHere[side] = true;
        }
        r[side] = rating * (1 + this.rng.gauss() * this.sideVolatility(side, roles));
      }
      const edge = Math.log(r[0] / r[1]); // >0: đội 0 thắng đường
      edges[lane] = edge;
      const winner: Side = edge >= 0 ? 0 : 1;
      this.events.push({ minute: 14, type: "LANE_REPORT", lane, winner, edge: Math.abs(edge) });

      // CS và gold chênh lệch theo ưu thế đường
      for (const side of [0, 1] as Side[]) {
        const signed = side === 0 ? edge : -edge;
        for (const role of roles) {
          const line = this.s[side].lines[role];
          line.cs += this.csRate(side, role) * 14 * 0.5 * signed;
          line.gold += 800 * signed;
        }
      }

      // Kill ở đường: kỳ vọng tăng khi có rừng ghé hoặc chỉ đạo mạo hiểm
      let lambda = 0.5 + (jungleHere[0] ? 0.6 : 0) + (jungleHere[1] ? 0.6 : 0);
      for (const side of [0, 1] as Side[]) lambda += Math.max(0, MATCH.risk[this.s[side].orders.risk].kills) * 0.4;
      const pSide0 = logistic(10 * edge);
      for (let k = this.poisson(lambda); k > 0; k--) {
        const side: Side = this.rng.chance(pSide0) ? 0 : 1;
        const killers = jungleHere[side] ? [...roles, "JUNGLE" as Role] : roles;
        const victims = jungleHere[other(side)] ? [...roles, "JUNGLE" as Role] : roles;
        const minute = 3 + Math.floor(this.rng.next() * 11);
        this.kill(side, killers, victims, minute, lane, firstBlood);
        firstBlood = false;
      }
    }

    // Rừng không ghé đường nào thì farm thêm
    for (const side of [0, 1] as Side[]) {
      if (this.s[side].orders.laneFocus === "NONE") {
        const jg = this.s[side].lines.JUNGLE;
        jg.gold += 400;
        jg.cs += 15;
      }
    }

    // Rồng 5' và 11' (ưu thế đường dưới), Sứ Giả 14' (ưu thế đường trên)
    for (const minute of [5, 11]) {
      const w = this.contest("EARLY", "OBJECTIVE", "DRAGON", 0.5 * edges.BOT);
      this.takeDragon(w, minute);
    }
    this.nextDragon = 17;
    const herald = this.contest("EARLY", "OBJECTIVE", "HERALD_BARON", 0.5 * edges.TOP);
    this.s[herald].heralds++;
    this.events.push({ minute: 14, type: "HERALD", side: herald });
    this.takeTowers(herald, 1, 14, "HERALD");

    // Trụ ngoài của đường thua rõ rệt
    for (const { lane } of LANES) {
      if (Math.abs(edges[lane]) > 0.12) this.takeTowers(edges[lane] > 0 ? 0 : 1, 1, 14, "LANE");
    }

    this.advance(15);
    this.events.sort((a, b) => a.minute - b.minute); // các sự kiện ở đường được sinh không theo thứ tự thời gian
    for (const side of [0, 1] as Side[])
      for (const role of ROLES) {
        const line = this.s[side].lines[role];
        line.csAt15 = Math.round(line.cs);
        line.goldAt15 = Math.round(line.gold);
      }
  }

  // ------------------------------------------------------------ MID / LATE
  private round(minute: number, phase: "MID" | "LATE") {
    this.advance(minute);
    const soulTaken = this.s.some((st) => st.dragons >= 4);
    const dragonUp = minute >= this.nextDragon;
    const baronUp = minute >= this.nextBaron;

    // Giao tranh xoay quanh mục tiêu nào? Baron nếu có đội ưu tiên/đang dẫn, ngược lại Rồng.
    const wantsBaron = this.s.some((st) => st.orders.objective === "HERALD_BARON") || phase === "LATE";
    const around = baronUp && (wantsBaron || !dragonUp) ? "BARON" : dragonUp ? (soulTaken ? "ELDER" : "DRAGON") : "SKIRMISH";
    const objectiveFocus = around === "BARON" ? "HERALD_BARON" : around === "SKIRMISH" ? undefined : "DRAGON";

    const { winner, p } = this.contestWithP(phase, "FIGHT", objectiveFocus, 0);
    const loser = other(winner);
    const risk = MATCH.risk[this.s[winner].orders.risk].kills;
    const killsW = clamp(Math.round(2 + this.rng.next() * 3 + risk), 1, 5);
    const closeness = 1 - Math.abs(p - 0.5) * 2;
    const killsL = clamp(Math.floor(this.rng.next() * 3 * closeness), 0, killsW - 1);
    const kills: [number, number] = [0, 0];
    kills[winner] = killsW;
    kills[loser] = killsL;
    this.events.push({ minute, type: "TEAMFIGHT", winner, kills, around, pWin: winner === 0 ? p : 1 - p });
    for (let i = 0; i < killsW; i++) this.kill(winner, ROLES, ROLES, minute, "TEAMFIGHT", false);
    for (let i = 0; i < killsL; i++) this.kill(loser, ROLES, ROLES, minute, "TEAMFIGHT", false);
    this.addFightDamage(phase, killsW + killsL);

    const deficit = this.gold(loser) - this.gold(winner);
    if (deficit > 0) {
      const bounty = Math.min(MATCH.bountyCap, deficit * MATCH.bountyShare);
      for (const r of ROLES) this.s[winner].lines[r].gold += bounty / 5;
    }

    if (around === "BARON") {
      const st = this.s[winner];
      st.barons++;
      st.baronUntil = minute + 3;
      this.nextBaron = minute + 6;
      for (const r of ROLES) st.lines[r].gold += MATCH.baronGold;
      this.events.push({ minute, type: "BARON", side: winner });
    } else if (around === "ELDER") {
      this.s[winner].elderUntil = minute + 2.5;
      this.nextDragon = minute + 6;
      this.events.push({ minute, type: "ELDER", side: winner });
    } else if (around === "DRAGON") {
      this.takeDragon(winner, minute);
      this.nextDragon = minute + 5;
    }

    // Công trụ sau giao tranh
    const hasBuff = this.s[winner].baronUntil > minute || this.s[winner].elderUntil > minute;
    let towers = (phase === "MID" ? 1 : 2) + (hasBuff ? 1 : 0);
    if (this.rng.chance(this.siegeChance(winner))) towers++;
    this.takeTowers(winner, towers, minute, "FIGHT");

    // Đẩy lẻ: đội SPLIT_1_4 có cơ hội ăn trụ ở đường biên bất kể kết quả giao tranh
    for (const side of [0, 1] as Side[]) {
      const st = this.s[side];
      if (st.setup.tactic !== "SPLIT_1_4") continue;
      const split = this.db[st.setup.picks.TOP].profile.split_push;
      if (this.rng.chance(0.08 + 0.03 * split)) this.takeTowers(side, 1, minute, "SPLIT");
    }

    // Vỡ nhà chính: đã phá đủ công trình và thắng giao tranh rõ ràng (hoặc có buff)
    const decisive = killsW - killsL >= 3 || hasBuff;
    if (this.s[winner].towers >= MATCH.towersToNexus && decisive) this.endMatch(winner, minute);
  }

  private forceEnd() {
    const p0 = this.power(0, "LATE", "FIGHT");
    const p1 = this.power(1, "LATE", "FIGHT");
    this.endMatch(p0 >= p1 ? 0 : 1, this.minute);
  }

  private endMatch(side: Side, minute: number) {
    this.s[side].towers = MATCH.towersToNexus;
    this.winner = side;
    this.minute = minute;
    this.events.push({ minute, type: "NEXUS", side });
  }

  // --------------------------------------------------------------- Helpers
  private initSide(setup: TeamSetup): SideState {
    const lines = {} as Record<Role, PlayerLine>;
    for (const role of ROLES) {
      const p = setup.team.roster[role];
      lines[role] = {
        playerId: p.id, ign: p.ign, role, champion: setup.picks[role],
        kills: 0, deaths: 0, assists: 0, cs: 0, gold: 500, damage: 0, csAt15: 0, goldAt15: 0,
      };
    }
    return { setup, orders: { ...setup.orders }, lines, towers: 0, dragons: 0, barons: 0, heralds: 0, baronUntil: 0, elderUntil: 0 };
  }

  private player(side: Side, role: Role): Player {
    return this.s[side].setup.team.roster[role];
  }

  private rating(side: Side, role: Role, phase: Phase): number {
    const champ = this.db[this.s[side].setup.picks[role]];
    return playerPhaseRating(this.player(side, role), champ, phase, this.ctx);
  }

  private csRate(side: Side, role: Role): number {
    return CS_PER_MIN[role] * (0.75 + 0.0035 * this.player(side, role).attributes.mechanics.cs_efficiency);
  }

  private advance(to: number) {
    const dt = to - this.minute;
    if (dt <= 0) return;
    for (const side of [0, 1] as Side[])
      for (const role of ROLES) {
        const line = this.s[side].lines[role];
        const cs = this.csRate(side, role) * dt;
        line.cs += cs;
        line.gold += dt * MATCH.passiveGoldPerMin + cs * MATCH.goldPerCs;
        const phase = this.phase === "END" ? "LATE" : this.phase;
        line.damage += dt * 2.5 * this.rating(side, role, phase) * CARRY_WEIGHT[role];
      }
    this.minute = to;
  }

  private gold(side: Side) {
    return ROLES.reduce((sum, r) => sum + this.s[side].lines[r].gold, 0);
  }

  private kills(side: Side) {
    return ROLES.reduce((sum, r) => sum + this.s[side].lines[r].kills, 0);
  }

  private sideVolatility(side: Side, roles: readonly Role[] = ROLES) {
    const v = roles.reduce((sum, r) => sum + volatility(this.player(side, r)), 0) / roles.length;
    return v * MATCH.risk[this.s[side].orders.risk].vol;
  }

  private teamProfileAvg(side: Side, keys: (keyof ChampionProfile)[]) {
    const picks = this.s[side].setup.picks;
    return ROLES.reduce((sum, r) => sum + keys.reduce((k, key) => k + this.db[picks[r]].profile[key], 0), 0) / (5 * keys.length);
  }

  private tacticMultiplier(side: Side, phase: Phase, kind: ContestKind) {
    const t = this.s[side].setup.tactic;
    if (t === "TEAMFIGHT" && kind === "FIGHT") return 1 + 0.02 * (this.teamProfileAvg(side, ["teamfight", "engage"]) - 5);
    if (t === "PICK_OFF" && kind === "FIGHT" && phase === "MID") return 1 + 0.025 * (this.teamProfileAvg(side, ["pick_potential", "mobility"]) - 5);
    if (t === "POKE" && kind !== "FIGHT") return 1 + 0.03 * (this.teamProfileAvg(side, ["poke"]) - 5);
    if (t === "SPLIT_1_4" && kind === "FIGHT") return 0.97; // đánh 4v5
    return 1;
  }

  /** Sức mạnh đội ở một thời điểm, chưa có nhiễu. */
  private power(side: Side, phase: Phase, kind: ContestKind, objective?: CoachOrders["objective"]) {
    const st = this.s[side];
    let p = ROLES.reduce((sum, r) => sum + this.rating(side, r, phase), 0);

    const phaseKey = phase === "EARLY" ? "early_power" : phase === "MID" ? "mid_power" : "late_power";
    const phaseWeight = this.teamProfileAvg(side, [phaseKey]) / 5;
    // Mastery, khắc chế đường và lối chơi đã có trong rating/tactic; ở đây chỉ cộng phần meta + synergy của draft
    const metaSyn = (d: DraftBreakdown) => d.meta + d.synergy;
    const draftEdge = metaSyn(this.draft.breakdown[side]) - metaSyn(this.draft.breakdown[other(side)]);
    p *= 1 + MATCH.draftMetaWeight * draftEdge * phaseWeight;

    const goldDiff = this.gold(side) - this.gold(other(side));
    p *= 1 + clamp((goldDiff / 1000) * MATCH.goldPer1kPower, -MATCH.goldPowerCap, MATCH.goldPowerCap);
    p *= 1 + MATCH.dragonPower * Math.min(st.dragons, 4) + (st.dragons >= 4 ? MATCH.soulPower : 0);
    if (st.baronUntil > this.minute) p *= 1 + MATCH.baronPower;
    if (st.elderUntil > this.minute) p *= 1 + MATCH.elderPower;
    p *= MATCH.risk[st.orders.risk].power;
    p *= this.tacticMultiplier(side, phase, kind);
    if (objective && st.orders.objective === objective) p *= 1 + MATCH.objectivePriority;
    return p;
  }

  private contestWithP(phase: Phase, kind: ContestKind, objective: CoachOrders["objective"] | undefined, bias: number) {
    const noisy = (side: Side) => this.power(side, phase, kind, objective) * (1 + this.rng.gauss() * this.sideVolatility(side));
    const p = logistic(MATCH.contestSlope * Math.log(noisy(0) / noisy(1)) + bias * MATCH.contestSlope);
    return { winner: (this.rng.chance(p) ? 0 : 1) as Side, p };
  }

  private contest(phase: Phase, kind: ContestKind, objective: CoachOrders["objective"] | undefined, bias: number): Side {
    return this.contestWithP(phase, kind, objective, bias).winner;
  }

  private siegeChance(side: Side) {
    const ratio = this.power(side, "LATE", "SIEGE") / this.power(other(side), "LATE", "SIEGE");
    return clamp(0.3 * ratio - 0.05, 0.05, 0.6);
  }

  private takeDragon(side: Side, minute: number) {
    const st = this.s[side];
    if (st.dragons >= 4) return;
    st.dragons++;
    for (const r of ROLES) st.lines[r].gold += MATCH.dragonGold / 5;
    this.events.push({ minute, type: "DRAGON", side });
    if (st.dragons === 4) this.events.push({ minute, type: "SOUL", side });
  }

  private takeTowers(side: Side, count: number, minute: number, reason: "LANE" | "FIGHT" | "SPLIT" | "HERALD") {
    const st = this.s[side];
    const n = Math.min(count, MATCH.towersToNexus - st.towers);
    if (n <= 0) return;
    st.towers += n;
    for (const r of ROLES) st.lines[r].gold += (MATCH.towerGold * n) / 5;
    this.events.push({ minute, type: "TOWER", side, count: n, reason });
  }

  private kill(side: Side, killers: readonly Role[], victims: readonly Role[], minute: number, lane: string, firstBlood: boolean) {
    const enemy = other(side);
    const killerRole = this.rng.pickWeighted(killers, (r) => CARRY_WEIGHT[r] * this.rating(side, r, "MID"));
    const victimRole = this.rng.pickWeighted(victims, (r) => 120 - this.player(enemy, r).attributes.teamfight.positioning);
    const k = this.s[side].lines[killerRole];
    const v = this.s[enemy].lines[victimRole];
    k.kills++;
    k.gold += MATCH.killGold;
    v.deaths++;
    const helpers = ROLES.filter((r) => r !== killerRole && (lane === "TEAMFIGHT" || killers.includes(r)));
    for (const r of helpers) {
      if (lane === "TEAMFIGHT" && !this.rng.chance(0.6)) continue;
      this.s[side].lines[r].assists++;
      this.s[side].lines[r].gold += MATCH.assistGold / Math.max(1, helpers.length);
    }
    this.events.push({ minute, type: firstBlood ? "FIRST_BLOOD" : "KILL", side, killer: k.ign, victim: v.ign, lane });
  }

  private addFightDamage(phase: Phase, intensity: number) {
    for (const side of [0, 1] as Side[])
      for (const role of ROLES) {
        const dmg = this.rating(side, role, phase) * CARRY_WEIGHT[role] * (8 + 3 * intensity);
        this.s[side].lines[role].damage += dmg * (0.8 + 0.4 * this.rng.next());
      }
  }

  private poisson(lambda: number) {
    const L = Math.exp(-lambda);
    let k = 0;
    for (let p = this.rng.next(); p > L; p *= this.rng.next()) k++;
    return k;
  }
}

export function simulateMatch(db: ChampionDb, ctx: MatchContext, setups: [TeamSetup, TeamSetup]): MatchResult {
  return new MatchSim(db, ctx, setups).run();
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
