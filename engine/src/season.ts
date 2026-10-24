// Cấu trúc giải đấu: vòng tròn, playoffs, Play-In, Swiss, loại trực tiếp.
// Toàn bộ là dữ liệu thuần (serialize được thành JSON để lưu game).
import type { Rng } from "./rng.ts";

export interface GameSummary {
  winner: string; // team id
  duration: number;
  picks: Record<string, string[]>; // team id -> 5 tướng theo thứ tự ROLES
}

export interface SeriesSummary {
  wins: [number, number]; // [home, away]
  winner: string;
  games: GameSummary[];
}

export interface Fixture {
  id: string;
  round: number;
  home: string;
  away: string;
  bestOf: 1 | 3 | 5;
  /** Nhãn hiển thị: "Tuần 3", "Bán kết"... */
  label: string;
  result?: SeriesSummary;
}

export type CompetitionKind = "LEAGUE" | "PLAYOFFS" | "PLAYIN" | "SWISS" | "KNOCKOUT";

export interface Competition {
  id: string;
  name: string;
  kind: CompetitionKind;
  leagueId?: string;
  teams: string[]; // theo thứ tự hạt giống
  fixtures: Fixture[];
  stagePressure: number;
  /** Kết quả cuối: thứ hạng (id đội), có khi competition xong */
  ranking?: string[];
}

export interface StandingRow {
  team: string;
  wins: number;
  losses: number;
  gameWins: number;
  gameLosses: number;
}

// ------------------------------------------------------------------ Vòng tròn
/** Phương pháp xoay vòng (circle method). double = lượt đi + lượt về. */
export function roundRobin(teams: string[], double: boolean): [string, string][][] {
  const list = teams.length % 2 ? [...teams, "BYE"] : [...teams];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") round.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!); // giữ cố định phần tử đầu, xoay phần còn lại
  }
  return double ? [...rounds, ...rounds.map((rd) => rd.map(([a, b]) => [b, a] as [string, string]))] : rounds;
}

export function createLeague(id: string, name: string, leagueId: string, teams: string[], bestOf: 1 | 3 = 3): Competition {
  const fixtures: Fixture[] = [];
  roundRobin(teams, true).forEach((round, r) =>
    round.forEach(([home, away], i) => fixtures.push({ id: `${id}-R${r + 1}-${i}`, round: r + 1, home, away, bestOf, label: `Tuần ${r + 1}` })),
  );
  return { id, name, kind: "LEAGUE", leagueId, teams, fixtures, stagePressure: 0 };
}

export function standings(c: Competition): StandingRow[] {
  const rows = new Map(c.teams.map((t) => [t, { team: t, wins: 0, losses: 0, gameWins: 0, gameLosses: 0 }]));
  for (const f of c.fixtures) {
    if (!f.result) continue;
    const [hw, aw] = f.result.wins;
    const h = rows.get(f.home)!;
    const a = rows.get(f.away)!;
    h.gameWins += hw, h.gameLosses += aw, a.gameWins += aw, a.gameLosses += hw;
    if (f.result.winner === f.home) h.wins++, a.losses++;
    else a.wins++, h.losses++;
  }
  const seedIndex = (t: string) => c.teams.indexOf(t);
  return [...rows.values()].sort(
    (x, y) => y.wins - x.wins || (y.gameWins - y.gameLosses) - (x.gameWins - x.gameLosses) || y.gameWins - x.gameWins || seedIndex(x.team) - seedIndex(y.team),
  );
}

// ------------------------------------------------------------------ Playoffs (top 4 hoặc chung kết)
export function createPlayoffs(id: string, name: string, leagueId: string, seeds: string[]): Competition {
  const c: Competition = { id, name, kind: "PLAYOFFS", leagueId, teams: seeds, fixtures: [], stagePressure: 0.1 };
  if (seeds.length >= 4) {
    c.fixtures.push(
      { id: `${id}-SF1`, round: 1, home: seeds[0], away: seeds[3], bestOf: 5, label: "Bán kết" },
      { id: `${id}-SF2`, round: 1, home: seeds[1], away: seeds[2], bestOf: 5, label: "Bán kết" },
    );
  } else if (seeds.length >= 2) {
    c.fixtures.push({ id: `${id}-F`, round: 1, home: seeds[0], away: seeds[1], bestOf: 5, label: "Chung kết" });
  }
  return c;
}

// ------------------------------------------------------------------ Loại trực tiếp (Play-In, Tứ kết CKTG...)
export function createKnockout(id: string, name: string, kind: CompetitionKind, seeds: string[], pressure: number): Competition {
  const c: Competition = { id, name, kind, teams: seeds, fixtures: [], stagePressure: pressure };
  const n = seeds.length;
  for (let i = 0; i < n / 2; i++)
    c.fixtures.push({ id: `${id}-R1-${i}`, round: 1, home: seeds[i], away: seeds[n - 1 - i], bestOf: 5, label: roundLabel(n) });
  return c;
}

const roundLabel = (teamsLeft: number) => (teamsLeft === 2 ? "Chung kết" : teamsLeft === 4 ? "Bán kết" : teamsLeft === 8 ? "Tứ kết" : `Vòng ${teamsLeft} đội`);

/** Sinh vòng tiếp theo khi vòng hiện tại xong. Dùng cho PLAYOFFS / PLAYIN / KNOCKOUT. Trả về true nếu có thay đổi. */
export function advanceBracket(c: Competition): boolean {
  if (c.ranking || c.fixtures.some((f) => !f.result)) return false;
  const lastRound = Math.max(0, ...c.fixtures.map((f) => f.round));
  const current = c.fixtures.filter((f) => f.round === lastRound);
  if (current.length === 0) return false;
  const winners = current.map((f) => f.result!.winner);

  if (winners.length === 1) {
    // Xếp hạng: vô địch, á quân, rồi đội bị loại ở vòng muộn hơn đứng trên, cùng vòng thì theo hạt giống
    const out: string[] = [winners[0]];
    for (let r = lastRound; r >= 1; r--)
      for (const f of c.fixtures.filter((x) => x.round === r).sort((a, b) => c.teams.indexOf(loser(a)) - c.teams.indexOf(loser(b))))
        out.push(loser(f));
    for (const t of c.teams) if (!out.includes(t)) out.push(t);
    c.ranking = out;
    return true;
  }
  const label = roundLabel(winners.length);
  for (let i = 0; i < winners.length / 2; i++)
    c.fixtures.push({ id: `${c.id}-R${lastRound + 1}-${i}`, round: lastRound + 1, home: winners[i], away: winners[winners.length - 1 - i], bestOf: 5, label });
  return true;
}

const loser = (f: Fixture) => (f.result!.winner === f.home ? f.away : f.home);

// ------------------------------------------------------------------ Swiss (CKTG): 3 thắng đi tiếp, 3 thua bị loại
export function createSwiss(id: string, name: string, teams: string[], rng: Rng): Competition {
  const c: Competition = { id, name, kind: "SWISS", teams, fixtures: [], stagePressure: 0.2 };
  pairSwissRound(c, rng);
  return c;
}

export function swissRecord(c: Competition): Map<string, { w: number; l: number }> {
  const rec = new Map(c.teams.map((t) => [t, { w: 0, l: 0 }]));
  for (const f of c.fixtures) {
    if (!f.result) continue;
    rec.get(f.result.winner)!.w++;
    rec.get(loser(f))!.l++;
  }
  return rec;
}

function pairSwissRound(c: Competition, rng: Rng) {
  const rec = swissRecord(c);
  const round = Math.max(0, ...c.fixtures.map((f) => f.round)) + 1;
  const played = new Set(c.fixtures.map((f) => [f.home, f.away].sort().join("|")));
  const groups = new Map<string, string[]>();
  for (const [t, r] of rec) if (r.w < 3 && r.l < 3) groups.set(`${r.w}-${r.l}`, [...(groups.get(`${r.w}-${r.l}`) ?? []), t]);

  let i = 0;
  for (const [key, list] of [...groups].sort(([a], [b]) => b.localeCompare(a))) {
    const pool = shuffle(list, rng);
    const [w, l] = key.split("-").map(Number);
    const bestOf = w === 2 || l === 2 ? 3 : 1; // trận quyết định đi tiếp/bị loại đánh Bo3
    while (pool.length >= 2) {
      const home = pool.shift()!;
      let j = pool.findIndex((t) => !played.has([home, t].sort().join("|")));
      if (j < 0) j = 0;
      const [away] = pool.splice(j, 1);
      c.fixtures.push({ id: `${c.id}-R${round}-${i++}`, round, home, away, bestOf, label: `Swiss vòng ${round} (${key})` });
    }
  }
}

/** Sinh vòng Swiss tiếp theo hoặc chốt 8 đội đi tiếp. */
export function advanceSwiss(c: Competition, rng: Rng): boolean {
  if (c.ranking || c.fixtures.some((f) => !f.result)) return false;
  const rec = swissRecord(c);
  const active = [...rec.values()].filter((r) => r.w < 3 && r.l < 3).length;
  if (active > 0) {
    pairSwissRound(c, rng);
    return true;
  }
  c.ranking = [...rec].sort(([a, x], [b, y]) => y.w - x.w || x.l - y.l || c.teams.indexOf(a) - c.teams.indexOf(b)).map(([t]) => t);
  return true;
}

export function finalizeLeague(c: Competition): boolean {
  if (c.ranking || c.fixtures.some((f) => !f.result)) return false;
  c.ranking = standings(c).map((r) => r.team);
  return true;
}

/** Bước tiến chung cho mọi loại competition. */
export function advanceCompetition(c: Competition, rng: Rng): boolean {
  if (c.kind === "LEAGUE") return finalizeLeague(c);
  if (c.kind === "SWISS") return advanceSwiss(c, rng);
  return advanceBracket(c);
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
