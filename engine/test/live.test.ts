import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE, LiveMatch, archetypeOf, bestTactic, lanePoint, towerSpecs, type Picks, type TeamSetup } from "../src/index.ts";
import { realPack, realTeam } from "./fixtures.ts";

const db = realPack.champions;
const A: Picks = { TOP: "KSANTE", JUNGLE: "VIEGO", MID: "AZIR", ADC: "KAISA", SUPPORT: "RAKAN" };
const B: Picks = { TOP: "GNAR", JUNGLE: "LEESIN", MID: "ORIANNA", ADC: "XAYAH", SUPPORT: "NAUTILUS" };
const setup = (id: string, picks: Picks): TeamSetup => ({ team: realTeam(id), picks, tactic: bestTactic(db, picks), orders: { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" } });
const ctx = (seed: number) => ({ patch: "26.21", stagePressure: 0, seed });

test("bản đồ đối xứng tâm: trụ hai bên đối xứng qua tâm, đường nối đúng hai nhà", () => {
  const towers = towerSpecs();
  assert.equal(towers.length, 22);
  const blue = towers.filter((t) => t.side === 0);
  for (const b of blue) {
    const mirror = towers.find((r) => r.side === 1 && Math.abs(r.pos.x - (200 - b.pos.x)) < 1.5 && Math.abs(r.pos.y - (200 - b.pos.y)) < 1.5);
    assert.ok(mirror, `${b.lane} ${b.tier}`);
  }
  for (const lane of ["TOP", "MID", "BOT"] as const) {
    assert.deepEqual(lanePoint(lane, 0), { x: 22, y: 178 });
    assert.deepEqual(lanePoint(lane, 1), { x: 178, y: 22 });
  }
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
