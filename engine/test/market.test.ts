import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, advance, autoPlaySeries, createCareer, createRng, evaluateOffer, findPlayer, nextUserFixture, overallOf, potentialRange,
  recordSeries, releasePlayer, scoutProspect, seriesOptionsFor, seriesTeams, setStarter, signPlayer, startNextSeason,
  teamPlayers, weeklyTraining, yearlyDevelopment, type Career,
} from "../src/index.ts";
import { realPack } from "./fixtures.ts";

const db = realPack.champions;
const rng = () => createRng(5);

function toOffseason(c: Career) {
  for (;;) {
    const stop = advance(c, db);
    if (stop === "SEASON_END") return;
    if (stop === "USER_MATCH") {
      const u = nextUserFixture(c)!;
      recordSeries(c, u.fixture.id, autoPlaySeries(db, seriesTeams(c, u.fixture), seriesOptionsFor(c, u.comp, u.fixture)));
    }
  }
}

test("sự nghiệp mới có thị trường: tự do, thần đồng, ngân sách", () => {
  const c = createCareer(realPack, "COACH", "T1", 1);
  assert.equal(c.freeAgents.length, 16);
  assert.equal(c.prospects.length, 10);
  assert.ok(c.board.transferBudget > 0 && c.board.wageBudget > 0);
  for (const p of teamPlayers(c.teams.T1)) assert.ok(p.contract && p.birthYear && p.potential);
});

test("không mua được tuyển thủ còn hợp đồng giữa mùa; ký tự do thì được", () => {
  const c = createCareer(realPack, "OWNER", "SGW", 2);
  const star = c.teams.GEN.roster.MID;
  const ev = evaluateOffer(c, star.id, { salary: 1e6, years: 2 });
  assert.ok(!ev.ok && ev.problems.some((p) => p.includes("kỳ chuyển nhượng")));

  const fa = c.freeAgents[0];
  const low = evaluateOffer(c, fa.id, { salary: 100, years: 1 });
  assert.ok(!low.ok && low.demand > 100);
  signPlayer(c, db, fa.id, { salary: low.demand, years: 1 }, rng());
  assert.equal(findPlayer(c, fa.id)!.loc.kind, "BENCH");
});

test("kỳ chuyển nhượng: mua ngôi sao, đội bán tự lấp vị trí, phí trừ vào ngân sách", () => {
  const c = createCareer(realPack, "OWNER", "T1", 3);
  toOffseason(c);
  c.finance.balance = 1e8;
  const star = c.teams.GEN.roster.ADC;
  const ev = evaluateOffer(c, star.id, { salary: 1, years: 2 });
  signPlayer(c, db, star.id, { salary: ev.demand, years: 2 }, rng());
  assert.equal(c.finance.balance, 1e8 - ev.fee);
  assert.ok(c.teams.GEN.roster.ADC && c.teams.GEN.roster.ADC.id !== star.id);
  setStarter(c, star.id);
  assert.equal(c.teams.T1.roster.ADC.id, star.id);
});

test("HLV bị giới hạn bởi ngân sách ban lãnh đạo", () => {
  const c = createCareer(realPack, "COACH", "SGW", 4);
  toOffseason(c);
  const star = ROLES.map((r) => c.teams.GEN.roster[r]).find((p) => p.contract!.until > c.year)!;
  const ev = evaluateOffer(c, star.id, { salary: 1e6, years: 3 });
  assert.ok(ev.fee > 0);
  assert.ok(ev.problems.some((p) => p.includes("ngân sách")) && ev.problems.some((p) => p.includes("Quỹ lương")), ev.problems.join(" | "));
});

test("giải phóng dự bị và hết hạn hợp đồng đưa tuyển thủ ra thị trường tự do", () => {
  const c = createCareer(realPack, "OWNER", "T1", 6);
  const fa = c.freeAgents[1];
  signPlayer(c, db, fa.id, { salary: evaluateOffer(c, fa.id, { salary: 0, years: 1 }).demand, years: 1 }, rng());
  releasePlayer(c, fa.id);
  assert.equal(findPlayer(c, fa.id)!.loc.kind, "FREE");

  toOffseason(c);
  const expiring = ROLES.map((r) => c.teams.T1.roster[r]).filter((p) => p.contract!.until <= c.year);
  startNextSeason(c, db);
  // Người hết hạn rời T1 (có thể được đội khác ký)
  for (const p of expiring) assert.ok(!ROLES.some((r) => c.teams.T1.roster[r].id === p.id), p.ign);
  for (const t of Object.values(c.teams)) for (const r of ROLES) assert.ok(t.roster[r], `${t.id} ${r}`);
});

test("tuyển trạch thu hẹp khoảng tiềm năng và luôn chứa giá trị thật", () => {
  const c = createCareer(realPack, "COACH", "SGW", 7);
  const pr = c.prospects[0];
  const [lo0, hi0] = potentialRange(pr.player, pr.knowledge);
  scoutProspect(c, pr.player.id);
  scoutProspect(c, pr.player.id);
  const [lo1, hi1] = potentialRange(pr.player, pr.knowledge);
  assert.ok(hi1 - lo1 < hi0 - lo0);
  assert.ok(lo1 <= pr.player.potential! && pr.player.potential! <= hi1);
  assert.equal(c.scouting.points, 1);
});

test("phát triển: trẻ tiến bộ về phía tiềm năng, lão tướng sa sút", () => {
  const c = createCareer(realPack, "COACH", "T1", 8);
  const young = structuredClone(c.prospects.find((p) => p.player.potential! - overallOf(p.player) > 10)!.player);
  const old = structuredClone(c.teams.T1.roster.MID); // Faker
  old.birthYear = c.year - 33;
  const r = createRng(1);
  let dy = 0, dOld = 0;
  for (let y = 0; y < 3; y++) { dy += yearlyDevelopment(young, c.year + y, r); dOld += yearlyDevelopment(old, c.year + y, r); }
  assert.ok(dy > 4, `young ${dy}`);
  assert.ok(dOld < -2, `old ${dOld}`);
  const before = overallOf(young);
  for (let w = 0; w < 10; w++) weeklyTraining(young, "mechanics", c.year);
  assert.ok(overallOf(young) > before);
});
