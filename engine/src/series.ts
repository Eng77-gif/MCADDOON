// Series BoN (Bo1/Bo3/Bo5), có Fearless Draft, tâm lý và thể lực thay đổi giữa các ván.
import { ROLES, type CoachOrders, type MatchContext, type Picks, type Team } from "./types.ts";
import type { ChampionDb } from "./draft.ts";
import { bestTactic, newDraft, runAiDraft, type DraftState } from "./draftAI.ts";
import { simulateMatch, type MatchResult } from "./match.ts";
import { createRng } from "./rng.ts";

export interface SeriesOptions {
  bestOf: 1 | 3 | 5;
  /** Fearless Draft (luật 2025+): tướng đã dùng ở ván trước không ai được chọn lại */
  fearless: boolean;
  patch: string;
  stagePressure: number;
  seed: number;
}

export interface GameRecord {
  /** Chỉ số đội (0/1 theo thứ tự truyền vào series) ở bên xanh */
  blue: 0 | 1;
  picks: [Picks, Picks]; // theo chỉ số đội, không theo bên
  bans: [string[], string[]];
  winner: 0 | 1; // theo chỉ số đội
  result: MatchResult;
}

export interface SeriesState {
  teams: [Team, Team];
  options: SeriesOptions;
  wins: [number, number];
  games: GameRecord[];
}

export const newSeries = (teams: [Team, Team], options: SeriesOptions): SeriesState => ({ teams, options, wins: [0, 0], games: [] });
export const winsNeeded = (s: SeriesState) => Math.ceil(s.options.bestOf / 2);
export const isSeriesOver = (s: SeriesState) => s.wins[0] >= winsNeeded(s) || s.wins[1] >= winsNeeded(s);
export const seriesWinner = (s: SeriesState): 0 | 1 | null => (s.wins[0] >= winsNeeded(s) ? 0 : s.wins[1] >= winsNeeded(s) ? 1 : null);

/** Ván 1: đội 0 (hạt giống cao hơn) chọn bên xanh. Các ván sau: đội thua ván trước được chọn và luôn chọn xanh. */
export function nextBlue(s: SeriesState): 0 | 1 {
  const last = s.games.at(-1);
  return last ? (last.winner === 0 ? 1 : 0) : 0;
}

export function lockedChampions(s: SeriesState): string[] {
  if (!s.options.fearless) return [];
  return [...new Set(s.games.flatMap((g) => [...Object.values(g.picks[0]), ...Object.values(g.picks[1])]))];
}

/** Đội hình cho ván tiếp theo: tâm lý +-1 theo kết quả ván trước, mệt mỏi +4 mỗi ván đã đấu. */
export function teamsForNextGame(s: SeriesState): [Team, Team] {
  return s.teams.map((team, i) => {
    const t: Team = structuredClone(team);
    let morale = 0;
    for (const g of s.games) morale += g.winner === i ? 1 : -1;
    for (const role of ROLES) {
      const st = t.roster[role].dynamic_state;
      st.morale = Math.max(-10, Math.min(10, st.morale + morale));
      st.fatigue += 4 * s.games.length;
    }
    return t;
  }) as [Team, Team];
}

/** Mở Ban/Pick cho ván tiếp theo, đã sắp [xanh, đỏ]. */
export function draftForNextGame(s: SeriesState): { draft: DraftState; blue: 0 | 1 } {
  const blue = nextBlue(s);
  const [t0, t1] = teamsForNextGame(s);
  const sides: [Team, Team] = blue === 0 ? [t0, t1] : [t1, t0];
  return { draft: newDraft(s.options.patch, sides, lockedChampions(s)), blue };
}

export const gameContext = (s: SeriesState): MatchContext => ({
  patch: s.options.patch,
  stagePressure: s.options.stagePressure,
  seed: (s.options.seed * 31 + s.games.length * 7919) >>> 0,
});

/** Ghi nhận một ván đã đấu xong (result theo bên: side 0 = xanh). */
export function recordGame(s: SeriesState, blue: 0 | 1, draft: DraftState, result: MatchResult): SeriesState {
  const toTeam = (side: 0 | 1) => (side === 0 ? blue : ((1 - blue) as 0 | 1));
  const picks = [{}, {}] as [Picks, Picks];
  const bans: [string[], string[]] = [[], []];
  for (const side of [0, 1] as const) {
    picks[toTeam(side)] = draft.picks[side] as Picks;
    bans[toTeam(side)] = draft.bans[side];
  }
  const winner = toTeam(result.winner);
  const wins: [number, number] = [...s.wins];
  wins[winner]++;
  return { ...s, wins, games: [...s.games, { blue, picks, bans, winner, result }] };
}

const DEFAULT_ORDERS: CoachOrders = { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" };

/** AI tự đấu một ván (dùng cho trận không có người chơi, hoặc khi người chơi chọn "mô phỏng nhanh"). */
export function autoPlayGame(db: ChampionDb, s: SeriesState, quality: [number, number] = [0.8, 0.8]): SeriesState {
  const { draft, blue } = draftForNextGame(s);
  const ctx = gameContext(s);
  const q: [number, number] = blue === 0 ? quality : [quality[1], quality[0]];
  const done = runAiDraft(db, draft, createRng(ctx.seed ^ 0x9e3779b9), q);
  const picks = done.picks as [Picks, Picks];
  const result = simulateMatch(db, ctx, [0, 1].map((side) => ({
    team: done.teams[side],
    picks: picks[side],
    tactic: bestTactic(db, picks[side]),
    orders: DEFAULT_ORDERS,
  })) as [Parameters<typeof simulateMatch>[2][0], Parameters<typeof simulateMatch>[2][1]]);
  return recordGame(s, blue, done, result);
}

export function autoPlaySeries(db: ChampionDb, teams: [Team, Team], options: SeriesOptions, quality?: [number, number]): SeriesState {
  let s = newSeries(teams, options);
  while (!isSeriesOver(s)) s = autoPlayGame(db, s, quality);
  return s;
}
