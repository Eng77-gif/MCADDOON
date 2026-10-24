import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchSim, simulateMatch, describeEvent, boxScore, MATCH } from "../src/index.ts";
import { PATCH, buffTeam, db, setups, teams } from "./fixtures.ts";

const ctx = (seed: number) => ({ patch: PATCH, stagePressure: 0, seed });
const winRate = (s: ReturnType<typeof setups>, n = 400) => {
  let w = 0;
  for (let seed = 1; seed <= n; seed++) if (simulateMatch(db, ctx(seed), s).winner === 0) w++;
  return w / n;
};
const mirror = (delta: number): ReturnType<typeof setups> => {
  const [a] = setups();
  return [{ ...a, team: buffTeam(teams[0], delta) }, { ...a, team: teams[0] }];
};

test("cùng seed => cùng kết quả (replay được)", () => {
  assert.deepEqual(simulateMatch(db, ctx(7), setups()), simulateMatch(db, ctx(7), setups()));
});

test("trận luôn kết thúc với 3 giai đoạn và vỡ nhà chính", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = simulateMatch(db, ctx(seed), setups());
    assert.deepEqual(r.phases.slice(0, 2).map((p) => p.phase), ["EARLY", "MID"]);
    assert.equal(r.events.at(-1)?.type, "NEXUS");
    assert.ok(r.duration >= 20 && r.duration <= MATCH.maxMinute, `duration ${r.duration}`);
    assert.equal(r.sides[r.winner].towers, MATCH.towersToNexus);
  }
});

test("tổng hạ gục mỗi đội = tổng số lần chết của đội kia", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = simulateMatch(db, ctx(seed), setups());
    const sum = (i: 0 | 1, k: "kills" | "deaths") => r.sides[i].lines.reduce((s, l) => s + l[k], 0);
    assert.equal(sum(0, "kills"), sum(1, "deaths"));
    assert.equal(sum(1, "kills"), sum(0, "deaths"));
  }
});

test("có số liệu phút 15 và sự kiện theo thứ tự thời gian", () => {
  const r = simulateMatch(db, ctx(3), setups());
  for (const side of r.sides) for (const l of side.lines) assert.ok(l.csAt15 > 0 && l.goldAt15 > 0);
  r.events.forEach((e, i) => i > 0 && assert.ok(e.minute >= r.events[i - 1].minute));
});

test("trận gương ~50%", () => {
  const p = winRate(mirror(0));
  assert.ok(p > 0.42 && p < 0.58, `mirror ${p}`);
});

test("đội mạnh hơn thắng nhiều hơn, nhưng không tuyệt đối", () => {
  const p3 = winRate(mirror(3));
  const p8 = winRate(mirror(8));
  assert.ok(p3 > 0.55 && p3 < 0.78, `+3 ${p3}`);
  assert.ok(p8 > p3 && p8 < 0.95, `+8 ${p8}`);
});

test("HLV đổi chỉ đạo giữa các giai đoạn được áp dụng", () => {
  const sim = new MatchSim(db, ctx(5), setups());
  sim.playPhase();
  sim.playPhase([{ laneFocus: "NONE", objective: "HERALD_BARON", risk: "AGGRESSIVE" }]);
  assert.ok(sim.phases.length === 2 || sim.isOver);
  assert.throws(() => { while (true) sim.playPhase(); }, /kết thúc/);
});

test("đánh mạo hiểm tạo nhiều hạ gục hơn đánh an toàn", () => {
  const kills = (risk: "SAFE" | "AGGRESSIVE") => {
    const o = { laneFocus: "MID", objective: "DRAGON", risk } as const;
    let k = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = simulateMatch(db, ctx(seed), setups([{ orders: o }, { orders: o }]));
      k += r.sides[0].kills + r.sides[1].kills;
    }
    return k;
  };
  assert.ok(kills("AGGRESSIVE") > kills("SAFE"));
});

test("bình luận và bảng chỉ số không lỗi", () => {
  const r = simulateMatch(db, ctx(11), setups());
  for (const e of r.events) assert.ok(describeEvent(e, ["A", "B"]).length > 0);
  assert.match(boxScore(r), /CSD@15/);
});
