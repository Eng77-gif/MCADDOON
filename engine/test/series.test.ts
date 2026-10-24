import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPlaySeries, lockedChampions } from "../src/index.ts";
import { PATCH, realPack, realTeam } from "./fixtures.ts";

const opts = (seed: number, bestOf: 1 | 3 | 5 = 5) => ({ bestOf, fearless: true, patch: PATCH, stagePressure: 0.3, seed });

test("Bo5 kết thúc khi một đội đủ 3 ván, đội thua ván trước được bên xanh", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = autoPlaySeries(realPack.champions, [realTeam("GEN"), realTeam("T1")], opts(seed));
    assert.equal(Math.max(...s.wins), 3);
    assert.ok(s.games.length >= 3 && s.games.length <= 5);
    for (let i = 1; i < s.games.length; i++) assert.equal(s.games[i].blue, s.games[i - 1].winner === 0 ? 1 : 0);
  }
});

test("Fearless: không tướng nào được chọn lại trong cùng series", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = autoPlaySeries(realPack.champions, [realTeam("HLE"), realTeam("BLG")], opts(seed));
    const picks = s.games.flatMap((g) => [...Object.values(g.picks[0]), ...Object.values(g.picks[1])]);
    assert.equal(new Set(picks).size, picks.length);
    assert.equal(lockedChampions(s).length, picks.length);
  }
});

test("đội mạnh hơn nhiều thắng series gần như chắc chắn, đội ngang nhau thì cân", () => {
  let strong = 0;
  let even = 0;
  for (let seed = 1; seed <= 60; seed++) {
    if (autoPlaySeries(realPack.champions, [realTeam("GEN"), realTeam("FUR")], opts(seed, 3)).wins[0] === 2) strong++;
    if (autoPlaySeries(realPack.champions, [realTeam("KT"), realTeam("DK")], opts(seed, 3)).wins[0] === 2) even++;
  }
  assert.ok(strong / 60 > 0.9, `strong ${strong}`);
  assert.ok(even / 60 > 0.25 && even / 60 < 0.75, `even ${even}`);
});
