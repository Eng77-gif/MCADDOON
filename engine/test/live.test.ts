import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPS, INHIBITORS, LIVE, LiveMatch, NEXUS, archetypeOf, bestTactic, lanePoint, towerSpecs, type Picks, type TeamSetup } from "../src/index.ts";
import { realPack, realTeam } from "./fixtures.ts";

const db = realPack.champions;
const A: Picks = { TOP: "KSANTE", JUNGLE: "VIEGO", MID: "AZIR", ADC: "KAISA", SUPPORT: "RAKAN" };
const B: Picks = { TOP: "GNAR", JUNGLE: "LEESIN", MID: "ORIANNA", ADC: "XAYAH", SUPPORT: "NAUTILUS" };
const setup = (id: string, picks: Picks): TeamSetup => ({ team: realTeam(id), picks, tactic: bestTactic(db, picks), orders: { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" } });
const ctx = (seed: number) => ({ patch: "26.21", stagePressure: 0, seed });

test("bản đồ 3D: 22 trụ gần đối xứng tâm, mỗi đường 3 trụ mỗi phe, đường nối đúng hai nhà chính", () => {
  const towers = towerSpecs();
  assert.equal(towers.length, 22);
  for (const side of [0, 1] as const)
    for (const lane of ["TOP", "MID", "BOT"] as const)
      assert.deepEqual(towers.filter((t) => t.side === side && t.lane === lane).map((t) => t.tier).sort(), ["INHIB", "INNER", "OUTER"]);
  for (const b of towers.filter((t) => t.side === 0)) {
    const mirror = towers.find((r) => r.side === 1 && r.tier === b.tier && Math.hypot(r.pos.x - (200 - b.pos.x), r.pos.y - (200 - b.pos.y)) < 7);
    assert.ok(mirror, `${b.node}`);
  }
  // trụ ngoài đường trên của hai phe đều nằm trên đường trên thật (cạnh trái / cạnh trên)
  const top = towers.filter((t) => t.lane === "TOP" && t.tier === "OUTER");
  assert.ok(top.every((t) => t.pos.x < 40 || t.pos.y < 40));
  for (const lane of ["TOP", "MID", "BOT"] as const) {
    for (const [t, n] of [[0, NEXUS[0]], [1, NEXUS[1]]] as const) {
      const p = lanePoint(lane, t);
      assert.ok(Math.hypot(p.x - n.x, p.y - n.y) < 1e-6, `${lane} ${t}`);
    }
  }
  assert.equal(CAMPS.length, 12);
  assert.equal(INHIBITORS.length, 6);
});

test("phân nhóm tướng hợp lý", () => {
  assert.equal(archetypeOf(db.KAISA, "ADC"), "MARKSMAN");
  assert.equal(archetypeOf(db.RAKAN, "SUPPORT"), "CATCHER");
  assert.equal(archetypeOf(db.LULU, "SUPPORT"), "ENCHANTER");
  assert.equal(archetypeOf(db.ORIANNA, "MID"), "MAGE");
});

test("trận thời gian thực: cùng seed cùng kết quả, kết thúc bằng vỡ nhà chính, số liệu hợp lệ", () => {
  const run = () => new LiveMatch(db, ctx(3), [setup("GEN", A), setup("T1", B)]).run();
  const r = run();
  assert.deepEqual(r, run());
  assert.equal(r.events.at(-1)?.type, "NEXUS");
  assert.ok(r.duration > 15 && r.duration <= (LIVE.maxTime * 3) / 60, `${r.duration}`);
  const kills = r.sides[0].kills + r.sides[1].kills;
  const deaths = r.sides.flatMap((s) => s.lines).reduce((a, l) => a + l.deaths, 0);
  assert.ok(kills <= deaths, "mạng hạ gục không vượt số lần chết");
  for (const l of r.sides.flatMap((s) => s.lines)) assert.ok(l.cs >= 0 && l.gold > 500 && l.csAt15 <= l.cs);
  assert.ok(r.sides.flatMap((s) => s.lines).filter((l) => l.role === "ADC").every((l) => l.cs > 50), "xạ thủ có ăn lính");
});

test("trình xem: chạy từng đoạn cho cùng kết quả như chạy một mạch", () => {
  const a = new LiveMatch(db, ctx(9), [setup("HLE", A), setup("BLG", B)]);
  while (!a.isOver) a.advance(7.3);
  const b = new LiveMatch(db, ctx(9), [setup("HLE", A), setup("BLG", B)]).run();
  assert.deepEqual(a.result(), b);
});

test("đội mạnh hơn hẳn thắng phần lớn", () => {
  let wins = 0;
  for (let s = 1; s <= 6; s++) if (new LiveMatch(db, ctx(s), s % 2 ? [setup("GEN", A), setup("FUR", B)] : [setup("FUR", B), setup("GEN", A)]).run().winner === (s % 2 ? 0 : 1)) wins++;
  assert.ok(wins >= 4, `GEN thắng ${wins}/6`);
});
