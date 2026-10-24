// Thị trường: chuyển nhượng, hợp đồng, giải phóng, tuyển trạch, hoạt động của AI trong kỳ nghỉ.
import { ROLES, type Player, type Role, type Team } from "./types.ts";
import type { ChampionDb } from "./draft.ts";
import type { Rng } from "./rng.ts";
import type { Career } from "./career.ts";
import { ageOf, monthlySalary, overallOf, releaseFee, teamStrength, teamWagesPerMonth } from "./economy.ts";
import { generateIgn, generatePlayer, scoutGain } from "./scouting.ts";

export const BENCH_LIMIT = 3;
export const MAX_SCOUT_POINTS = 6;

export type PlayerLocation =
  | { kind: "STARTER"; teamId: string; role: Role }
  | { kind: "BENCH"; teamId: string; index: number }
  | { kind: "FREE"; index: number }
  | { kind: "PROSPECT"; index: number };

export function findPlayer(c: Career, id: string): { player: Player; loc: PlayerLocation } | null {
  for (const t of Object.values(c.teams)) {
    for (const role of ROLES) if (t.roster[role].id === id) return { player: t.roster[role], loc: { kind: "STARTER", teamId: t.id, role } };
    const i = (t.bench ?? []).findIndex((p) => p.id === id);
    if (i >= 0) return { player: t.bench![i], loc: { kind: "BENCH", teamId: t.id, index: i } };
  }
  const f = c.freeAgents.findIndex((p) => p.id === id);
  if (f >= 0) return { player: c.freeAgents[f], loc: { kind: "FREE", index: f } };
  const p = c.prospects.findIndex((x) => x.player.id === id);
  if (p >= 0) return { player: c.prospects[p].player, loc: { kind: "PROSPECT", index: p } };
  return null;
}

export const teamOf = (c: Career, loc: PlayerLocation) => (loc.kind === "STARTER" || loc.kind === "BENCH" ? c.teams[loc.teamId] : undefined);
export const isTransferWindow = (c: Career) => c.stage === "OFFSEASON";

const news = (c: Career, text: string) => c.news.unshift({ year: c.year, text });

// ------------------------------------------------------------------ Đàm phán
export interface Offer {
  salary: number; // lương tháng
  years: 1 | 2 | 3;
}

export interface OfferEvaluation {
  ok: boolean;
  fee: number;
  /** Lương tối thiểu tuyển thủ chấp nhận */
  demand: number;
  problems: string[];
}

/** Mức lương tuyển thủ đòi khi về `toTeam`. */
export function wageDemand(c: Career, player: Player, toTeam: Team, fromTeam: Team | undefined, years: number): number {
  const ovr = overallOf(player);
  const isProspect = !player.contract && ageOf(player, c.year) <= 18;
  let demand = isProspect ? Math.max(1500, monthlySalary(ovr) * 0.6) : monthlySalary(ovr);
  // Về đội yếu hơn đội cũ => đòi thêm (tối đa +40%)
  if (fromTeam) demand *= 1 + Math.min(0.4, Math.max(0, teamStrength(fromTeam) - teamStrength(toTeam)) * 0.03);
  // Đội ở giải hạng 2 kém hấp dẫn
  const tier = c.leagues.find((l) => l.id === toTeam.league)?.tier ?? 1;
  if (tier === 2 && !isProspect) demand *= 1.15;
  // Tuyển thủ lớn tuổi muốn hợp đồng dài
  if (ageOf(player, c.year) >= 27 && years < 2) demand *= 1.1;
  return Math.round(demand / 100) * 100;
}

export function evaluateOffer(c: Career, playerId: string, offer: Offer): OfferEvaluation {
  const found = findPlayer(c, playerId);
  const me = c.teams[c.teamId];
  const problems: string[] = [];
  if (!found) return { ok: false, fee: 0, demand: 0, problems: ["Không tìm thấy tuyển thủ"] };
  const { player, loc } = found;
  const from = teamOf(c, loc);
  const renewing = from?.id === c.teamId;

  const fee = renewing || !from ? 0 : releaseFee(player, c.year);
  if (from && !renewing && !isTransferWindow(c))
    problems.push("Tuyển thủ còn hợp đồng chỉ mua được trong kỳ chuyển nhượng (nghỉ giữa mùa).");
  if (!renewing && (me.bench?.length ?? 0) >= BENCH_LIMIT) problems.push(`Ghế dự bị đã đủ ${BENCH_LIMIT} người. Hãy giải phóng bớt.`);

  const currentSalary = renewing ? player.contract?.salary ?? 0 : 0;
  const newWages = teamWagesPerMonth(me) - currentSalary + offer.salary;
  if (c.mode === "COACH") {
    if (fee > c.board.transferBudget) problems.push(`Phí chuyển nhượng vượt ngân sách ban lãnh đạo cấp ($${c.board.transferBudget.toLocaleString("en-US")}).`);
    if (newWages > c.board.wageBudget) problems.push(`Quỹ lương sẽ vượt mức cho phép ($${c.board.wageBudget.toLocaleString("en-US")}/tháng).`);
  } else if (fee > c.finance.balance) problems.push("Không đủ tiền trả phí chuyển nhượng.");

  const demand = wageDemand(c, player, me, renewing ? undefined : from, offer.years);
  if (offer.salary < demand) problems.push(`${player.ign} yêu cầu tối thiểu $${demand.toLocaleString("en-US")}/tháng.`);
  return { ok: problems.length === 0, fee, demand, problems };
}

/** Ký hợp đồng (mua, ký tự do, ký thần đồng hoặc gia hạn). Ném lỗi nếu đề nghị không hợp lệ. */
export function signPlayer(c: Career, db: ChampionDb, playerId: string, offer: Offer, rng: Rng): Player {
  const ev = evaluateOffer(c, playerId, offer);
  if (!ev.ok) throw new Error(ev.problems.join(" "));
  const { player, loc } = findPlayer(c, playerId)!;
  const me = c.teams[c.teamId];
  const until = (isTransferWindow(c) ? c.year : c.year - 1) + offer.years;
  player.contract = { salary: offer.salary, until };

  if (loc.kind !== "STARTER" && loc.kind !== "BENCH") {
    if (loc.kind === "FREE") c.freeAgents.splice(loc.index, 1);
    else c.prospects.splice(loc.index, 1);
    (me.bench ??= []).push(player);
    news(c, `${me.short} ký hợp đồng với ${player.ign} (${offer.years} năm, $${offer.salary.toLocaleString("en-US")}/tháng).`);
  } else if (loc.teamId === c.teamId) {
    news(c, `${player.ign} gia hạn hợp đồng tới hết mùa ${until}.`);
  } else {
    const seller = c.teams[loc.teamId];
    if (loc.kind === "STARTER") {
      seller.roster[loc.role] = undefined as unknown as Player;
      fillRole(c, db, seller, loc.role, rng);
    } else seller.bench!.splice(loc.index, 1);
    (me.bench ??= []).push(player);
    pay(c, ev.fee);
    news(c, `CHUYỂN NHƯỢNG: ${player.ign} từ ${seller.short} về ${me.short} với giá $${ev.fee.toLocaleString("en-US")}.`);
  }
  return player;
}

function pay(c: Career, amount: number) {
  if (amount <= 0) return;
  if (c.mode === "COACH") c.board.transferBudget -= amount;
  else c.finance.balance -= amount;
}

/** Đưa tuyển thủ dự bị lên đá chính, người đang đá chính cùng vị trí xuống dự bị. */
export function setStarter(c: Career, playerId: string) {
  const me = c.teams[c.teamId];
  const i = (me.bench ?? []).findIndex((p) => p.id === playerId);
  if (i < 0) throw new Error("Tuyển thủ không ở ghế dự bị");
  const incoming = me.bench![i];
  const outgoing = me.roster[incoming.role];
  me.roster[incoming.role] = incoming;
  me.bench![i] = outgoing;
}

/** Giải phóng tuyển thủ dự bị: trả trợ cấp 3 tháng lương, tuyển thủ thành tự do. */
export function releasePlayer(c: Career, playerId: string) {
  const me = c.teams[c.teamId];
  const i = (me.bench ?? []).findIndex((p) => p.id === playerId);
  if (i < 0) throw new Error("Chỉ giải phóng được tuyển thủ dự bị");
  const [p] = me.bench!.splice(i, 1);
  const severance = (p.contract?.salary ?? 0) * 3;
  if (c.mode === "OWNER") c.finance.balance -= severance;
  p.contract = undefined;
  c.freeAgents.push(p);
  news(c, `${me.short} giải phóng ${p.ign} (trợ cấp $${severance.toLocaleString("en-US")}).`);
}

// ------------------------------------------------------------------ Tuyển trạch
export function scoutProspect(c: Career, playerId: string) {
  const pr = c.prospects.find((x) => x.player.id === playerId);
  if (!pr) throw new Error("Không có thần đồng này");
  if (c.scouting.points <= 0) throw new Error("Hết lượt tuyển trạch tuần này");
  c.scouting.points--;
  pr.knowledge = Math.min(100, pr.knowledge + scoutGain(c.scouting.level));
}

export const scoutUpgradeCost = (level: number) => 80000 * level;

/** Chủ CLB đầu tư vào bộ phận tuyển trạch (tối đa cấp 5). */
export function upgradeScouting(c: Career) {
  if (c.mode !== "OWNER") throw new Error("Chỉ Chủ CLB được đầu tư");
  if (c.scouting.level >= 5) throw new Error("Đã đạt cấp tối đa");
  const cost = scoutUpgradeCost(c.scouting.level);
  if (c.finance.balance < cost) throw new Error("Không đủ tiền");
  c.finance.balance -= cost;
  c.scouting.level++;
  news(c, `Nâng cấp bộ phận tuyển trạch lên cấp ${c.scouting.level}.`);
}

// ------------------------------------------------------------------ Bổ sung vị trí, AI
/** Lấp vị trí trống: dự bị cùng vị trí → tự do tốt nhất cùng vị trí → tạo tuyển thủ trẻ mới. */
export function fillRole(c: Career, db: ChampionDb, team: Team, role: Role, rng: Rng) {
  const bench = team.bench ?? [];
  const bi = bench.map((p, i) => [p, i] as const).filter(([p]) => p.role === role).sort(([a], [b]) => overallOf(b) - overallOf(a))[0];
  if (bi) {
    team.roster[role] = bench.splice(bi[1], 1)[0];
    return;
  }
  const fi = c.freeAgents.map((p, i) => [p, i] as const).filter(([p]) => p.role === role).sort(([a], [b]) => overallOf(b) - overallOf(a))[0];
  if (fi) {
    const p = c.freeAgents.splice(fi[1], 1)[0];
    p.contract = { salary: monthlySalary(overallOf(p)), until: c.year + 1 };
    team.roster[role] = p;
    return;
  }
  team.roster[role] = newRegen(c, db, rng, role, Math.round(teamStrength(team) - 7));
}

export function newRegen(c: Career, db: ChampionDb, rng: Rng, role: Role, ovr: number): Player {
  const taken = new Set(allPlayers(c).map((p) => p.ign.toLowerCase()));
  const age = 18 + Math.floor(rng.next() * 3);
  return generatePlayer(db, rng, {
    id: `R${c.year}_${c.idCounter++}`, ign: generateIgn(rng, taken), role, ovr,
    potential: Math.min(97, ovr + 4 + Math.round(rng.next() * 8)), birthYear: c.year - age, year: c.year,
  });
}

export function allPlayers(c: Career): Player[] {
  return [
    ...Object.values(c.teams).flatMap((t) => [...ROLES.map((r) => t.roster[r]).filter(Boolean), ...(t.bench ?? [])]),
    ...c.freeAgents,
    ...c.prospects.map((p) => p.player),
  ];
}

/** Đầu mùa mới: hợp đồng hết hạn, AI gia hạn/thả người, AI mua tự do để vá vị trí yếu. */
export function processContracts(c: Career, db: ChampionDb, rng: Rng) {
  for (const team of Object.values(c.teams)) {
    const isUser = team.id === c.teamId;
    const avg = teamStrength(team);
    const expired = (p: Player) => (p.contract?.until ?? c.year) < c.year;

    for (const role of ROLES) {
      const p = team.roster[role];
      if (!expired(p)) continue;
      if (!isUser && (overallOf(p) >= avg - 3 || rng.chance(0.6))) {
        p.contract = { salary: monthlySalary(overallOf(p)), until: c.year + 1 + Math.floor(rng.next() * 2) };
        continue;
      }
      p.contract = undefined;
      team.roster[role] = undefined as unknown as Player;
      fillRole(c, db, team, role, rng); // lấp trước khi thả ra thị trường để không ký lại chính người vừa đi
      c.freeAgents.push(p);
      if (isUser) news(c, `${p.ign} hết hợp đồng và rời ${team.short}. ${team.roster[role].ign} lên thay.`);
    }
    for (const p of [...(team.bench ?? [])]) {
      if (!expired(p)) continue;
      team.bench = team.bench!.filter((x) => x !== p);
      p.contract = undefined;
      c.freeAgents.push(p);
      if (isUser) news(c, `${p.ign} (dự bị) hết hợp đồng và rời đội.`);
    }
  }

  // AI vá vị trí yếu bằng tuyển thủ tự do
  for (const team of Object.values(c.teams)) {
    if (team.id === c.teamId) continue;
    const avg = teamStrength(team);
    for (const role of ROLES) {
      const cur = team.roster[role];
      const best = c.freeAgents.filter((p) => p.role === role).sort((a, b) => overallOf(b) - overallOf(a))[0];
      if (best && overallOf(cur) < avg - 4 && overallOf(best) > overallOf(cur) + 2) {
        c.freeAgents = c.freeAgents.filter((p) => p !== best);
        best.contract = { salary: monthlySalary(overallOf(best)), until: c.year + 1 };
        cur.contract = undefined;
        c.freeAgents.push(cur);
        team.roster[role] = best;
        news(c, `${team.short} ký ${best.ign} (tự do) thay ${cur.ign}.`);
      }
    }
  }
  // Giữ thị trường tự do gọn: 40 người tốt nhất
  c.freeAgents = c.freeAgents.sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 40);
}
