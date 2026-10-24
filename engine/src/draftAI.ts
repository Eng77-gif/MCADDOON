// Ban/Pick theo thứ tự thi đấu chuyên nghiệp + AI chọn tướng. UI dùng chung DraftState để người chơi tự cấm/chọn.
import { ROLES, type Picks, type Role, type Tactic, type Team } from "./types.ts";
import { DRAFT, TACTIC_KEYS, matchup, synergy, type ChampionDb } from "./draft.ts";
import { masteryOf } from "./ratings.ts";
import type { Rng } from "./rng.ts";

export type DraftSide = 0 | 1; // 0 = xanh (chọn trước), 1 = đỏ
export interface DraftStep { side: DraftSide; type: "BAN" | "PICK" }

/** Thứ tự chuẩn: 6 cấm, 6 chọn (B R R B B R), 4 cấm (đỏ cấm trước), 4 chọn (R B B R). */
export const DRAFT_ORDER: readonly DraftStep[] = [
  ...[0, 1, 0, 1, 0, 1].map((side) => ({ side, type: "BAN" }) as DraftStep),
  ...[0, 1, 1, 0, 0, 1].map((side) => ({ side, type: "PICK" }) as DraftStep),
  ...[1, 0, 1, 0].map((side) => ({ side, type: "BAN" }) as DraftStep),
  ...[1, 0, 0, 1].map((side) => ({ side, type: "PICK" }) as DraftStep),
];

export interface DraftState {
  patch: string;
  teams: [Team, Team]; // [xanh, đỏ]
  step: number;
  bans: [string[], string[]];
  picks: [Partial<Picks>, Partial<Picks>];
  /** Tướng bị khoá thêm (Fearless Draft: đã dùng ở các ván trước của series) */
  locked: string[];
}

export function newDraft(patch: string, teams: [Team, Team], locked: string[] = []): DraftState {
  return { patch, teams, step: 0, bans: [[], []], picks: [{}, {}], locked };
}

export const currentStep = (d: DraftState): DraftStep | undefined => DRAFT_ORDER[d.step];
export const isDraftDone = (d: DraftState) => d.step >= DRAFT_ORDER.length;
export const openRoles = (d: DraftState, side: DraftSide) => ROLES.filter((r) => !d.picks[side][r]);

export function isAvailable(db: ChampionDb, d: DraftState, id: string): boolean {
  if (!db[id] || d.locked.includes(id)) return false;
  if (d.bans[0].includes(id) || d.bans[1].includes(id)) return false;
  return !Object.values(d.picks[0]).includes(id) && !Object.values(d.picks[1]).includes(id);
}

/** Thực hiện bước hiện tại. PICK cần vị trí (role). Trả về state mới (không sửa state cũ). */
export function applyDraft(db: ChampionDb, d: DraftState, championId: string, role?: Role): DraftState {
  const step = currentStep(d);
  if (!step) throw new Error("Ban/Pick đã xong");
  if (!isAvailable(db, d, championId)) throw new Error(`${championId} không khả dụng`);
  const next: DraftState = structuredClone(d);
  if (step.type === "BAN") next.bans[step.side].push(championId);
  else {
    if (!role || next.picks[step.side][role]) throw new Error(`Vị trí ${role} không hợp lệ`);
    next.picks[step.side][role] = championId;
  }
  next.step++;
  return next;
}

const indexCache = new WeakMap<ChampionDb, Record<string, [string, number][]>>();

/** Danh sách khắc chế có khai báo (cả hai chiều) cho từng tướng: tránh duyệt toàn bộ tướng mỗi lần. */
function matchupIndex(db: ChampionDb): Record<string, [string, number][]> {
  let idx = indexCache.get(db);
  if (!idx) {
    idx = {};
    for (const c of Object.values(db))
      for (const [o, score] of Object.entries(c.matchups)) {
        (idx[c.id] ??= []).push([o, score]);
        (idx[o] ??= []).push([c.id, -score]);
      }
    indexCache.set(db, idx);
  }
  return idx;
}

/** Giá trị khi `side` chọn `champ` cho `role`, dựa trên những gì đã biết ở thời điểm hiện tại. */
export function pickValue(db: ChampionDb, d: DraftState, side: DraftSide, champ: string, role: Role, tactic?: Tactic): number {
  const enemy: DraftSide = side === 0 ? 1 : 0;
  const c = db[champ];
  const player = d.teams[side].roster[role];
  const entry = player.champion_pool.find((e) => e.champion_id === champ);

  let v = DRAFT.tierPoints[c.patch_stats[d.patch]?.tier ?? "B"];
  v += ((masteryOf(player, champ) - DRAFT.masteryBaseline) / 10) * DRAFT.wMastery;
  if (entry?.is_signature) v += DRAFT.signatureBonus;

  const enemyPicks = d.picks[enemy];
  const laneOpp = enemyPicks[role];
  if (laneOpp) v += matchup(db, champ, laneOpp) * DRAFT.wLaneCounter;
  else {
    // Pick mù: trừ rủi ro bị khắc chế bởi tướng đối thủ còn chọn được
    let worst = 0;
    for (const [o, score] of matchupIndex(db)[champ] ?? [])
      if (score < worst && db[o].roles.includes(role) && isAvailable(db, d, o)) worst = score;
    v += 0.3 * worst;
  }
  for (const [r, e] of Object.entries(enemyPicks)) if (r !== role && e) v += matchup(db, champ, e) * DRAFT.wGlobalCounter;
  for (const own of Object.values(d.picks[side])) if (own) v += synergy(db, champ, own) * DRAFT.wSynergy;
  if (tactic) {
    const keys = TACTIC_KEYS[tactic];
    v += ((keys.reduce((s, k) => s + c.profile[k], 0) / keys.length - 5) * DRAFT.wTacticFit) / 5; // 1/5 phần TacticFit của cả đội
  }
  return v;
}

const OFF_ROLE_PENALTY = 3;

export interface Suggestion { champion: string; role?: Role; value: number }

/** Top lựa chọn cho bước hiện tại (dùng cho AI và gợi ý cho người chơi). */
export function suggest(db: ChampionDb, d: DraftState, limit = 3): Suggestion[] {
  const step = currentStep(d);
  if (!step) return [];
  const avail = Object.keys(db).filter((id) => isAvailable(db, d, id));
  const out: Suggestion[] = [];

  if (step.type === "PICK") {
    for (const role of openRoles(d, step.side)) {
      const fits = avail.filter((id) => db[id].roles.includes(role));
      // Hết tướng đúng vị trí (thường gặp ở ván cuối Fearless Bo5): cho phép chọn trái vị trí, bị phạt
      const pool = fits.length ? fits : avail;
      const penalty = fits.length ? 0 : OFF_ROLE_PENALTY;
      for (const id of pool) out.push({ champion: id, role, value: pickValue(db, d, step.side, id, role) - penalty });
    }
  } else {
    // Cấm: tướng mà đối thủ sẽ có giá trị cao nhất ở một vị trí còn trống
    const enemy: DraftSide = step.side === 0 ? 1 : 0;
    for (const id of avail) {
      let best = -Infinity;
      for (const role of openRoles(d, enemy)) if (db[id].roles.includes(role)) best = Math.max(best, pickValue(db, d, enemy, id, role));
      out.push({ champion: id, value: best > -Infinity ? best : -100 });
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, limit);
}

/**
 * AI thực hiện bước hiện tại. `quality` 0..1 là trình độ Ban/Pick của ban huấn luyện:
 * thấp => hay chọn lệch khỏi phương án tốt nhất.
 */
export function aiDraftStep(db: ChampionDb, d: DraftState, rng: Rng, quality = 0.8): DraftState {
  const options = suggest(db, d, 6);
  if (!options.length) throw new Error("Không còn tướng để chọn");
  const noise = (1 - quality) * 2.5;
  let best = options[0];
  let bestScore = -Infinity;
  for (const o of options) {
    const s = o.value + rng.gauss() * noise;
    if (s > bestScore) (bestScore = s), (best = o);
  }
  return applyDraft(db, d, best.champion, best.role);
}

export function runAiDraft(db: ChampionDb, d: DraftState, rng: Rng, quality: [number, number] = [0.8, 0.8]): DraftState {
  let s = d;
  while (!isDraftDone(s)) s = aiDraftStep(db, s, rng, quality[currentStep(s)!.side]);
  return s;
}

/** Lối chơi phù hợp nhất với đội hình đã chọn. */
export function bestTactic(db: ChampionDb, picks: Picks): Tactic {
  let best: Tactic = "TEAMFIGHT";
  let bestFit = -Infinity;
  for (const [t, keys] of Object.entries(TACTIC_KEYS) as [Tactic, (keyof ChampionDb[string]["profile"])[]][]) {
    const fit = ROLES.reduce((s, r) => s + keys.reduce((k, key) => k + db[picks[r]].profile[key], 0), 0);
    if (fit > bestFit) (bestFit = fit), (best = t);
  }
  return best;
}
