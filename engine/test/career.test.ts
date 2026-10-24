import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance, autoPlaySeries, createCareer, createRng, nextUserFixture, recordSeries, roundRobin, seriesOptionsFor,
  seriesTeams, standings, startNextSeason, createLeague, createSwiss, advanceSwiss, swissRecord, type Career, type Fixture,
} from "../src/index.ts";
import { realPack } from "./fixtures.ts";

test("vòng tròn: mỗi cặp gặp nhau đúng 2 lần, mỗi đội đấu tối đa 1 trận/tuần", () => {
  const teams = ["A", "B", "C", "D", "E"];
  const rounds = roundRobin(teams, true);
  const pairs = new Map<string, number>();
  for (const r of rounds) {
    const seen = new Set<string>();
    for (const [a, b] of r) {
      assert.ok(!seen.has(a) && !seen.has(b));
      seen.add(a), seen.add(b);
      const k = [a, b].sort().join();
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
  assert.equal(pairs.size, 10);
  for (const n of pairs.values()) assert.equal(n, 2);
});

test("bảng xếp hạng tính thắng/thua và hiệu số ván", () => {
  const c = createLeague("L", "L", "X", ["A", "B"]);
  c.fixtures[0].result = { wins: [2, 1], winner: c.fixtures[0].home, games: [] };
  const [first, second] = standings(c);
  assert.equal(first.team, c.fixtures[0].home);
  assert.deepEqual([first.wins, first.gameWins, first.gameLosses, second.losses], [1, 2, 1, 1]);
});

test("Swiss: kết thúc với 8 đội 3 thắng và 8 đội 3 thua", () => {
  const teams = Array.from({ length: 16 }, (_, i) => `T${i}`);
  const rng = createRng(3);
  const sw = createSwiss("S", "S", teams, rng);
  while (!sw.ranking) {
    for (const f of sw.fixtures.filter((x: Fixture) => !x.result)) f.result = { wins: [1, 0], winner: rng.chance(0.5) ? f.home : f.away, games: [] };
    advanceSwiss(sw, rng);
  }
  const rec = [...swissRecord(sw).values()];
  assert.equal(rec.filter((r) => r.w === 3).length, 8);
  assert.equal(rec.filter((r) => r.l === 3).length, 8);
});

function playSeason(c: Career) {
  let userSeries = 0;
  for (;;) {
    const stop = advance(c, realPack.champions);
    if (stop === "SEASON_END") return userSeries;
    if (stop === "USER_MATCH") {
      const u = nextUserFixture(c)!;
      recordSeries(c, u.fixture.id, autoPlaySeries(realPack.champions, seriesTeams(c, u.fixture), seriesOptionsFor(c, u.comp, u.fixture)));
      userSeries++;
    }
  }
}

test("một mùa đầy đủ: mọi giải có xếp hạng, CKTG có nhà vô địch, lưu được JSON", () => {
  const c = createCareer(realPack, "COACH", "SGW", 42);
  const userSeries = playSeason(c);
  assert.ok(userSeries >= 10, `user series ${userSeries}`);
  for (const lg of ["LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL", "VCS"]) assert.ok(c.leagueRanking[lg]?.length >= 2, lg);
  const ko = c.competitions.find((x) => x.kind === "KNOCKOUT")!;
  assert.equal(ko.ranking!.length, 8);
  assert.equal(c.competitions.find((x) => x.kind === "SWISS")!.teams.length, 16);
  const restored: Career = JSON.parse(JSON.stringify(c));
  startNextSeason(restored);
  assert.equal(restored.year, c.year + 1);
  assert.equal(restored.stage, "SPLIT");
  // thăng/xuống hạng giữ tổng số đội
  const count = (lg: string) => Object.values(restored.teams).filter((t) => t.league === lg).length;
  assert.equal(count("VCS") + count("LCP"), 9);
});

test("chế độ Chủ CLB có tài chính thay đổi theo tuần", () => {
  const c = createCareer(realPack, "OWNER", "T1", 7);
  const start = c.finance.balance;
  assert.equal(advance(c, realPack.champions), "USER_MATCH");
  const u = nextUserFixture(c)!;
  recordSeries(c, u.fixture.id, autoPlaySeries(realPack.champions, seriesTeams(c, u.fixture), seriesOptionsFor(c, u.comp, u.fixture)));
  assert.notEqual(c.finance.balance, start);
  assert.ok(c.finance.lastWeek.wages > 0);
});
