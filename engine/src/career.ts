// Chế độ sự nghiệp: một mùa gồm Vòng bảng -> Playoffs -> CKTG (Play-In, Swiss, Loại trực tiếp) -> Nghỉ giữa mùa.
// Hai vai: HLV (bị ban lãnh đạo đánh giá) hoặc Chủ CLB (tự lo tài chính).
// Toàn bộ Career là dữ liệu thuần, JSON.stringify được để lưu game.
import { ROLES, type League, type Player, type Team } from "./types.ts";
import type { ChampionDb } from "./draft.ts";
import type { Pack } from "./pack.ts";
import { overallOf, teamStrength, teamWagesPerMonth } from "./economy.ts";
import { shouldRetire, weeklyTraining, yearlyDevelopment, type TrainingFocus } from "./development.ts";
import { generateProspects, type Prospect } from "./scouting.ts";
import { MAX_SCOUT_POINTS, allPlayers, fillRole, newRegen, processContracts } from "./market.ts";
import { createRng } from "./rng.ts";
import { autoPlaySeries, seriesWinner, type SeriesState } from "./series.ts";
import {
  advanceCompetition, createKnockout, createLeague, createPlayoffs, createSwiss, standings,
  type Competition, type Fixture, type GameSummary,
} from "./season.ts";

export type CareerMode = "COACH" | "OWNER";
export type Stage = "SPLIT" | "PLAYOFFS" | "WORLDS_PLAYIN" | "WORLDS_SWISS" | "WORLDS_KO" | "OFFSEASON";

export const STAGE_NAMES: Record<Stage, string> = {
  SPLIT: "Vòng bảng",
  PLAYOFFS: "Playoffs",
  WORLDS_PLAYIN: "CKTG — Play-In",
  WORLDS_SWISS: "CKTG — Vòng Swiss",
  WORLDS_KO: "CKTG — Vòng loại trực tiếp",
  OFFSEASON: "Nghỉ giữa mùa",
};

export interface PlayerStats {
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  minutes: number;
  csd15: number; // tổng, chia cho games khi hiển thị
  gd15: number;
  champions: Record<string, number>;
  ign: string;
  team: string;
}

export interface Career {
  version: 2;
  packId: string;
  patch: string;
  mode: CareerMode;
  teamId: string;
  year: number;
  seed: number;
  stage: Stage;
  teams: Record<string, Team>;
  leagues: League[];
  /** Số suất CKTG của từng giải */
  worldsQuota: Record<string, number>;
  competitions: Competition[]; // của mùa hiện tại
  /** Thứ hạng chung cuộc của giải quốc nội mùa này (sau playoffs) */
  leagueRanking: Record<string, string[]>;
  stats: Record<string, PlayerStats>; // theo player id, mùa hiện tại
  finance: { balance: number; lastWeek: { income: number; wages: number } };
  board: { targetRank: number; text: string; confidence: number; transferBudget: number; wageBudget: number };
  news: { year: number; text: string }[];
  gameOver?: string;
  /** Tuyển thủ tự do (không thuộc CLB nào) */
  freeAgents: Player[];
  /** Thần đồng rank Thách Đấu chưa ký hợp đồng */
  prospects: Prospect[];
  scouting: { level: number; points: number };
  training: { focus: TrainingFocus };
  idCounter: number;
}

// ------------------------------------------------------------------ Tạo sự nghiệp
const leagueOf = (c: Career, teamId: string) => c.teams[teamId].league!;
const tierOf = (c: Career, leagueId: string) => tierOf2(c.leagues, leagueId);
const tierOf2 = (leagues: League[], leagueId?: string) => leagues.find((l) => l.id === leagueId)?.tier ?? 1;

/** Thị trường ban đầu: 16 tuyển thủ tự do và 10 thần đồng. */
function seedMarket(c: Career, db: ChampionDb, rng: ReturnType<typeof createRng>) {
  for (let i = 0; i < 16; i++) {
    const p = newRegen(c, db, rng, ROLES[i % 5], 64 + Math.round(rng.next() * 14));
    p.birthYear = c.year - (20 + Math.floor(rng.next() * 7));
    p.contract = undefined;
    c.freeAgents.push(p);
  }
  const taken = new Set(allPlayers(c).map((p) => p.ign.toLowerCase()));
  c.prospects = generateProspects(db, c.year, rng, 10, taken);
}

/** Ngân sách chuyển nhượng và quỹ lương do ban lãnh đạo cấp (chế độ HLV); với Chủ CLB chỉ là gợi ý. */
function setBudgets(c: Career) {
  const team = c.teams[c.teamId];
  const tier = tierOf(c, leagueOf(c, c.teamId));
  const strength = teamStrength(team);
  c.board.transferBudget = tier === 2 ? 40000 : Math.round((150000 + Math.max(0, strength - 75) * 60000) / 10000) * 10000;
  c.board.wageBudget = Math.round((teamWagesPerMonth(team) * 1.2) / 1000) * 1000;
}

/** Nâng save cũ (version 1) lên cấu trúc hiện tại. */
export function migrateCareer(c: Career, db: ChampionDb): Career {
  if (c.version === 2) return c;
  const old = c as Career & { version: number };
  old.freeAgents ??= [];
  old.prospects ??= [];
  old.scouting ??= { level: 2, points: 3 };
  old.training ??= { focus: "BALANCED" };
  old.idCounter ??= 0;
  for (const t of Object.values(old.teams)) t.bench ??= [];
  old.version = 2;
  if (!old.freeAgents.length) seedMarket(old, db, createRng(old.seed));
  setBudgets(old);
  return old;
}

export function createCareer(pack: Pack & { id: string }, mode: CareerMode, teamId: string, seed = Date.now() % 1e9): Career {
  const rng = createRng(seed ^ 0x1234567);
  const teams = Object.fromEntries(pack.teams.map((t) => [t.id, structuredClone(t)]));
  if (!teams[teamId]) throw new Error(`Không có đội ${teamId}`);
  const worldsQuota: Record<string, number> = {};
  for (const t of pack.teams) if (t.worldsSeed && t.league) worldsQuota[t.league] = (worldsQuota[t.league] ?? 0) + 1;

  const c: Career = {
    version: 2, packId: pack.id, patch: pack.patch, mode, teamId, year: 2027, seed, stage: "SPLIT",
    teams, leagues: pack.leagues, worldsQuota, competitions: [], leagueRanking: {}, stats: {},
    finance: { balance: 0, lastWeek: { income: 0, wages: 0 } },
    board: { targetRank: 0, text: "", confidence: 60, transferBudget: 0, wageBudget: 0 },
    news: [], freeAgents: [], prospects: [],
    scouting: { level: tierOf2(pack.leagues, teams[teamId].league) === 1 ? 3 : 2, points: 3 },
    training: { focus: "BALANCED" },
    idCounter: 0,
  };
  c.finance.balance = teamWagesPerMonth(teams[teamId]) * 6;
  seedMarket(c, pack.champions, rng);
  startSplit(c);
  return c;
}

function startSplit(c: Career) {
  c.stage = "SPLIT";
  c.competitions = [];
  c.leagueRanking = {};
  c.stats = {};
  for (const lg of c.leagues) {
    if (lg.tier === 0) continue;
    const ids = Object.values(c.teams).filter((t) => t.league === lg.id).sort((a, b) => teamStrength(b) - teamStrength(a)).map((t) => t.id);
    if (ids.length >= 2) c.competitions.push(createLeague(`${c.year}-${lg.id}`, `${lg.id} ${c.year}`, lg.id, ids));
  }
  setBoardObjective(c);
  setBudgets(c);
  pushNews(c, `Mùa giải ${c.year} bắt đầu. ${c.board.text}`);
}

function setBoardObjective(c: Career) {
  const lg = leagueOf(c, c.teamId);
  const ids = c.competitions.find((x) => x.leagueId === lg)?.teams ?? [];
  const expected = ids.indexOf(c.teamId) + 1; // theo thứ hạng sức mạnh
  const quota = c.worldsQuota[lg] ?? 0;
  const target = Math.max(1, Math.min(ids.length, expected + 1));
  let text: string;
  if (target === 1) text = "Ban lãnh đạo yêu cầu: VÔ ĐỊCH quốc nội.";
  else if (quota && target <= quota) text = `Ban lãnh đạo yêu cầu: giành vé CKTG (top ${target}).`;
  else if (target <= 4) text = `Ban lãnh đạo yêu cầu: vào Playoffs (top ${target}).`;
  else text = `Ban lãnh đạo yêu cầu: kết thúc trong top ${target}.`;
  if (tierOf(c, lg) === 2 && target <= 1) text += " Vô địch sẽ được thăng hạng.";
  c.board.targetRank = target;
  c.board.text = c.mode === "COACH" ? text : `Mục tiêu đề xuất: top ${target}.`;
}

const pushNews = (c: Career, text: string) => c.news.unshift({ year: c.year, text });

// ------------------------------------------------------------------ Lịch thi đấu
const stageComps = (c: Career) => c.competitions.filter((x) => stageOf(x) === c.stage);

function stageOf(x: Competition): Stage {
  if (x.kind === "LEAGUE") return "SPLIT";
  if (x.kind === "PLAYOFFS") return "PLAYOFFS";
  if (x.kind === "PLAYIN") return "WORLDS_PLAYIN";
  if (x.kind === "SWISS") return "WORLDS_SWISS";
  return "WORLDS_KO";
}

export function pendingFixtures(c: Career): { comp: Competition; fixture: Fixture }[] {
  return stageComps(c).flatMap((comp) => comp.fixtures.filter((f) => !f.result).map((fixture) => ({ comp, fixture })));
}

export function nextUserFixture(c: Career) {
  return pendingFixtures(c)
    .filter(({ fixture: f }) => f.home === c.teamId || f.away === c.teamId)
    .sort((a, b) => a.fixture.round - b.fixture.round)[0];
}

export const userCompetition = (c: Career) => c.competitions.find((x) => x.teams.includes(c.teamId) && stageOf(x) === c.stage);

export function fixtureSeed(c: Career, f: Fixture) {
  let h = c.seed ^ (c.year * 2654435761);
  for (let i = 0; i < f.id.length; i++) h = Math.imul(h ^ f.id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type AdvanceStop = "USER_MATCH" | "STAGE_CHANGED" | "SEASON_END";

/**
 * Mô phỏng các trận AI cho tới khi tới lượt trận của người chơi, hoặc khi chuyển giai đoạn.
 * UI gọi lặp lại; khi trả về USER_MATCH thì cho người chơi đấu nextUserFixture(c).
 */
export function advance(c: Career, db: ChampionDb): AdvanceStop {
  if (c.stage === "OFFSEASON") return "SEASON_END";
  const rng = createRng(c.seed ^ c.year ^ c.competitions.reduce((n, x) => n + x.fixtures.length, 0));
  for (;;) {
    for (const comp of stageComps(c)) advanceCompetition(comp, rng);
    const pending = pendingFixtures(c);
    if (pending.length === 0) {
      nextStage(c, db);
      return (c.stage as Stage) === "OFFSEASON" ? "SEASON_END" : "STAGE_CHANGED"; // nextStage đã đổi stage
    }
    const user = nextUserFixture(c);
    const minRound = Math.min(...pending.map((p) => p.fixture.round));
    const toPlay = pending.filter((p) => p !== user && p.fixture !== user?.fixture && (user ? p.fixture.round <= user.fixture.round : p.fixture.round === minRound));
    if (toPlay.length === 0) return "USER_MATCH";
    for (const { comp, fixture } of toPlay) playAiFixture(c, db, comp, fixture);
  }
}

export function seriesTeams(c: Career, f: Fixture): [Team, Team] {
  return [c.teams[f.home], c.teams[f.away]];
}

export function seriesOptionsFor(c: Career, comp: Competition, f: Fixture) {
  return { bestOf: f.bestOf, fearless: true, patch: c.patch, stagePressure: comp.stagePressure, seed: fixtureSeed(c, f) };
}

function playAiFixture(c: Career, db: ChampionDb, comp: Competition, f: Fixture) {
  const s = autoPlaySeries(db, seriesTeams(c, f), seriesOptionsFor(c, comp, f));
  recordSeries(c, f.id, s);
}

/** Ghi kết quả một series (của AI hoặc người chơi tự đấu) vào sự nghiệp. */
export function recordSeries(c: Career, fixtureId: string, s: SeriesState) {
  const found = c.competitions.flatMap((comp) => comp.fixtures.map((f) => ({ comp, f }))).find((x) => x.f.id === fixtureId);
  if (!found) throw new Error(`Không có trận ${fixtureId}`);
  const { comp, f } = found;
  const w = seriesWinner(s);
  if (w === null) throw new Error("Series chưa kết thúc");
  const ids = [f.home, f.away];
  const games: GameSummary[] = s.games.map((g) => ({
    winner: ids[g.winner],
    duration: g.result.duration,
    picks: { [ids[0]]: ROLES.map((r) => g.picks[0][r]), [ids[1]]: ROLES.map((r) => g.picks[1][r]) },
  }));
  f.result = { wins: [...s.wins] as [number, number], winner: ids[w], games };

  // Thống kê tuyển thủ
  for (const g of s.games) {
    const blueTeam = g.blue;
    g.result.sides.forEach((side, sideIdx) => {
      const opp = g.result.sides[sideIdx === 0 ? 1 : 0];
      const teamIdx = sideIdx === 0 ? blueTeam : 1 - blueTeam;
      side.lines.forEach((l, i) => {
        const st = (c.stats[l.playerId] ??= { games: 0, kills: 0, deaths: 0, assists: 0, cs: 0, damage: 0, minutes: 0, csd15: 0, gd15: 0, champions: {}, ign: l.ign, team: ids[teamIdx] });
        st.team = ids[teamIdx];
        st.games++;
        st.kills += l.kills, st.deaths += l.deaths, st.assists += l.assists;
        st.cs += l.cs, st.damage += l.damage, st.minutes += g.result.duration;
        st.csd15 += l.csAt15 - opp.lines[i].csAt15;
        st.gd15 += l.goldAt15 - opp.lines[i].goldAt15;
        st.champions[l.champion] = (st.champions[l.champion] ?? 0) + 1;
      });
    });
  }

  // Tâm lý và phong độ sau series
  const rng = createRng(fixtureSeed(c, f) ^ 0x51ed27);
  ids.forEach((id, i) => {
    const won = i === w;
    for (const role of ROLES) {
      const st = c.teams[id].roster[role].dynamic_state;
      st.morale = clamp(st.morale + (won ? 1 : -1), -10, 10);
      st.form = clamp(Math.round(st.form * 0.7 + (won ? 1 : -1) + rng.gauss() * 1.5), -10, 10);
      st.fatigue = 20;
    }
  });

  if (ids.includes(c.teamId)) {
    const wonUser = ids[w] === c.teamId;
    const opp = ids[0] === c.teamId ? ids[1] : ids[0];
    pushNews(c, `${comp.name} — ${f.label}: ${c.teams[c.teamId].short} ${wonUser ? "thắng" : "thua"} ${c.teams[opp].short} ${Math.max(...s.wins)}-${Math.min(...s.wins)}.`);
    weeklyFinance(c, wonUser);
    // Một tuần tập luyện + thêm lượt tuyển trạch
    const me = c.teams[c.teamId];
    for (const p of [...ROLES.map((r) => me.roster[r]), ...(me.bench ?? [])]) weeklyTraining(p, c.training.focus, c.year);
    c.scouting.points = Math.min(MAX_SCOUT_POINTS, c.scouting.points + 1);
    c.board.confidence = clamp(c.board.confidence + (wonUser ? 2 : -3), 0, 100);
  }
}

// ------------------------------------------------------------------ Tài chính
const SPONSOR_WEEKLY: Record<number, number> = { 0: 0, 1: 60000, 2: 8000 };
const WIN_BONUS: Record<number, number> = { 0: 0, 1: 15000, 2: 2000 };

function weeklyFinance(c: Career, won: boolean) {
  const tier = tierOf(c, leagueOf(c, c.teamId));
  const income = SPONSOR_WEEKLY[tier] + (won ? WIN_BONUS[tier] : 0);
  const wages = Math.round(teamWagesPerMonth(c.teams[c.teamId]) / 4);
  c.finance.balance += income - wages;
  c.finance.lastWeek = { income, wages };
  if (c.mode === "OWNER" && c.finance.balance < -500000 && !c.gameOver) c.gameOver = "BANKRUPT";
}

function prize(c: Career, amount: number, why: string) {
  if (amount <= 0) return;
  c.finance.balance += amount;
  pushNews(c, `Tiền thưởng ${why}: +$${amount.toLocaleString("en-US")}.`);
}

// ------------------------------------------------------------------ Chuyển giai đoạn
function nextStage(c: Career, db: ChampionDb) {
  const rng = createRng(c.seed ^ (c.year * 7) ^ c.stage.length);
  if (c.stage === "SPLIT") {
    for (const comp of stageComps(c)) {
      const seeds = comp.ranking!;
      const top = seeds.slice(0, Math.min(4, seeds.length));
      c.competitions.push(createPlayoffs(`${c.year}-${comp.leagueId}-PO`, `Playoffs ${comp.leagueId}`, comp.leagueId!, top));
    }
    c.stage = "PLAYOFFS";
    pushNews(c, "Vòng bảng kết thúc. Bắt đầu Playoffs!");
    return;
  }

  if (c.stage === "PLAYOFFS") {
    for (const po of stageComps(c)) {
      const lg = po.leagueId!;
      const split = c.competitions.find((x) => x.kind === "LEAGUE" && x.leagueId === lg)!.ranking!;
      const ranking = [...po.ranking!, ...split.filter((t) => !po.ranking!.includes(t))];
      c.leagueRanking[lg] = ranking;
      pushNews(c, `${c.teams[ranking[0]].name} vô địch ${lg} ${c.year}!`);
      if (ranking[0] === c.teamId) prize(c, tierOf(c, lg) === 1 ? 200000 : 30000, `vô địch ${lg}`);
    }
    // Suất CKTG
    const direct: string[] = [];
    const playIn: string[] = [];
    for (let seed = 0; seed < 4; seed++)
      for (const [lg, quota] of Object.entries(c.worldsQuota)) {
        const team = c.leagueRanking[lg]?.[seed];
        if (!team || seed >= quota) continue;
        (quota < 4 && seed === quota - 1 ? playIn : direct).push(team);
      }
    c.competitions.push(createKnockout(`${c.year}-WORLDS-PI`, "CKTG Play-In", "PLAYIN", playIn, 0.15));
    c.competitions.push({ id: `${c.year}-WORLDS-DIRECT`, name: "CKTG (suất thẳng)", kind: "SWISS", teams: direct, fixtures: [], stagePressure: 0.2, ranking: direct });
    c.stage = "WORLDS_PLAYIN";
    const q = [...direct, ...playIn];
    pushNews(c, q.includes(c.teamId) ? `${c.teams[c.teamId].short} giành vé dự CKTG ${c.year}!` : `${c.teams[c.teamId].short} không có vé CKTG ${c.year}.`);
    return;
  }

  if (c.stage === "WORLDS_PLAYIN") {
    const pi = c.competitions.find((x) => x.kind === "PLAYIN")!;
    const direct = c.competitions.find((x) => x.id === `${c.year}-WORLDS-DIRECT`)!;
    c.competitions = c.competitions.filter((x) => x !== direct);
    const swissTeams = [...direct.teams, pi.ranking![0]];
    c.competitions.push(createSwiss(`${c.year}-WORLDS-SW`, "CKTG Swiss", swissTeams, rng));
    c.stage = "WORLDS_SWISS";
    pushNews(c, `${c.teams[pi.ranking![0]].short} vượt qua Play-In.`);
    return;
  }

  if (c.stage === "WORLDS_SWISS") {
    const sw = c.competitions.find((x) => x.kind === "SWISS")!;
    const top8 = sw.ranking!.slice(0, 8);
    c.competitions.push(createKnockout(`${c.year}-WORLDS-KO`, "CKTG Vòng loại trực tiếp", "KNOCKOUT", top8, 0.3));
    c.stage = "WORLDS_KO";
    if (sw.teams.includes(c.teamId)) {
      const pos = sw.ranking!.indexOf(c.teamId);
      pushNews(c, pos < 8 ? `${c.teams[c.teamId].short} vào Tứ kết CKTG!` : `${c.teams[c.teamId].short} dừng bước ở vòng Swiss.`);
      if (pos < 8) prize(c, 250000, "vào Tứ kết CKTG");
      else prize(c, 100000, "dự vòng Swiss CKTG");
    }
    return;
  }

  if (c.stage === "WORLDS_KO") {
    const ko = c.competitions.find((x) => x.kind === "KNOCKOUT")!;
    pushNews(c, `🏆 ${c.teams[ko.ranking![0]].name} VÔ ĐỊCH THẾ GIỚI ${c.year}!`);
    const pos = ko.ranking!.indexOf(c.teamId);
    if (pos === 0) prize(c, 2000000, "vô địch thế giới");
    else if (pos === 1) prize(c, 750000, "á quân CKTG");
    else if (pos >= 2 && pos <= 3) prize(c, 250000, "vào Bán kết CKTG");
    endOfSeason(c, db, rng);
  }
}

function endOfSeason(c: Career, db: ChampionDb, rng: ReturnType<typeof createRng>) {
  c.stage = "OFFSEASON";
  // Đánh giá của ban lãnh đạo (chế độ HLV)
  const lg = leagueOf(c, c.teamId);
  const pos = (c.leagueRanking[lg]?.indexOf(c.teamId) ?? 99) + 1;
  if (c.mode === "COACH") {
    if (pos <= c.board.targetRank) {
      c.board.confidence = clamp(c.board.confidence + 15, 0, 100);
      pushNews(c, `Ban lãnh đạo hài lòng: hạng ${pos} (mục tiêu top ${c.board.targetRank}).`);
    } else {
      c.board.confidence = clamp(c.board.confidence - 15 * (pos - c.board.targetRank), 0, 100);
      pushNews(c, `Ban lãnh đạo không hài lòng: hạng ${pos} (mục tiêu top ${c.board.targetRank}).`);
      if (c.board.confidence <= 0) c.gameOver = "FIRED";
    }
  }
  // Thăng/xuống hạng: vô địch giải hạng 2 đổi chỗ với đội bét giải hạng 1 mà nó dẫn vào
  for (const lower of c.leagues.filter((l) => l.tier === 2 && l.feedsInto)) {
    const up = c.leagueRanking[lower.id]?.[0];
    const upperRank = c.leagueRanking[lower.feedsInto!];
    const down = upperRank?.at(-1);
    if (!up || !down) continue;
    c.teams[up].league = lower.feedsInto;
    c.teams[down].league = lower.id;
    pushNews(c, `${c.teams[up].short} thăng hạng lên ${lower.feedsInto}; ${c.teams[down].short} xuống ${lower.id}.`);
  }
  developAndRetire(c, db, rng);
  setBudgets(c);
  pushNews(c, "Kỳ chuyển nhượng mở cửa. Hợp đồng hết hạn sẽ kết thúc khi sang mùa mới.");
}

/** Cuối mùa: mọi tuyển thủ phát triển/xuống dốc theo tuổi, một số giải nghệ, lứa thần đồng mới xuất hiện. */
function developAndRetire(c: Career, db: ChampionDb, rng: ReturnType<typeof createRng>) {
  const me = c.teams[c.teamId];
  for (const p of allPlayers(c)) {
    const delta = yearlyDevelopment(p, c.year, rng);
    const mine = me.roster[p.role]?.id === p.id || me.bench?.some((b) => b.id === p.id);
    if (mine && Math.abs(delta) >= 1) pushNews(c, `${p.ign} ${delta > 0 ? "tiến bộ" : "sa sút"} ${delta > 0 ? "+" : ""}${delta.toFixed(1)} (chỉ số ${Math.round(overallOf(p))}).`);
  }
  for (const team of Object.values(c.teams)) {
    for (const role of ROLES) {
      const p = team.roster[role];
      if (!shouldRetire(p, c.year, rng)) continue;
      team.roster[role] = undefined as unknown as Player;
      fillRole(c, db, team, role, rng);
      pushNews(c, `${p.ign} (${team.short}) tuyên bố giải nghệ. ${team.roster[role].ign} thay thế.`);
    }
    team.bench = (team.bench ?? []).filter((p) => !shouldRetire(p, c.year, rng));
  }
  c.freeAgents = c.freeAgents.filter((p) => !shouldRetire(p, c.year, rng));
  // Thần đồng đủ 19 tuổi mà chưa ai ký thì thành tự do; lứa mới xuất hiện
  for (const pr of c.prospects.filter((x) => c.year + 1 - (x.player.birthYear ?? 0) >= 19)) c.freeAgents.push(pr.player);
  c.prospects = c.prospects.filter((x) => c.year + 1 - (x.player.birthYear ?? 0) < 19);
  const taken = new Set(allPlayers(c).map((p) => p.ign.toLowerCase()));
  c.prospects.push(...generateProspects(db, c.year + 1, rng, 8, taken));
  c.scouting.points = MAX_SCOUT_POINTS;
}

/** Gọi từ UI khi người chơi bấm "Sang mùa mới". */
export function startNextSeason(c: Career, db: ChampionDb) {
  if (c.stage !== "OFFSEASON") throw new Error("Mùa giải chưa kết thúc");
  c.year++;
  processContracts(c, db, createRng(c.seed ^ c.year));
  for (const t of Object.values(c.teams))
    for (const role of ROLES) c.teams[t.id].roster[role].dynamic_state = { form: 0, morale: 0, fatigue: 20 };
  startSplit(c);
}

export function leagueTable(c: Career, leagueId: string) {
  const comp = c.competitions.find((x) => x.kind === "LEAGUE" && x.leagueId === leagueId);
  return comp ? standings(comp) : [];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
