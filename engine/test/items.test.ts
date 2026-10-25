import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveMatch, archetypeOf, bestTactic, inventoryStats, planBuild, remainingCost, shopFor, type ItemDb, type Picks, type TeamSetup } from "../src/index.ts";
import { realPack, realTeam } from "./fixtures.ts";
import itemsJson from "../../data/packs/real-2026/items.json" with { type: "json" };

const items = itemsJson as unknown as ItemDb;
const db = realPack.champions;
const A: Picks = { TOP: "KSANTE", JUNGLE: "VIEGO", MID: "AZIR", ADC: "KAISA", SUPPORT: "RAKAN" };
const B: Picks = { TOP: "GNAR", JUNGLE: "LEESIN", MID: "ORIANNA", ADC: "XAYAH", SUPPORT: "NAUTILUS" };
const setup = (id: string, picks: Picks): TeamSetup => ({ team: realTeam(id), picks, tactic: bestTactic(db, picks), orders: { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" } });

test("dữ liệu trang bị Riot: tên tiếng Việt, ảnh, công thức ghép hợp lệ", () => {
  const all = Object.values(items);
  assert.ok(all.length >= 190);
  assert.equal(items.INFINITY_EDGE.nameVi, "Vô Cực Kiếm");
  assert.equal(items.INFINITY_EDGE.cost, 3500);
  assert.equal(items.INFINITY_EDGE.tags.CRIT_DMG, 0.3);
  assert.equal(items.ZHONYAS.tags.STASIS, 1);
  for (const it of all) {
    assert.ok(it.icon, it.id);
    for (const c of it.from) assert.ok(items[c], `${it.id} <- ${c}`);
    assert.ok(it.from.reduce((s, c) => s + items[c].cost, 0) <= it.cost, it.id);
  }
});

test("mọi món trong lộ trình AI đều tồn tại, mỗi lộ trình 6 món có giày", () => {
  const boots = new Set(Object.values(items).filter((i) => i.tier === "BOOTS").map((i) => i.id));
  for (const champ of Object.values(db))
    for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const)
      for (const style of ["BALANCED", "DAMAGE", "DEFENSE"] as const) {
        const enemies = [{ arch: "TANK", damage: "AD" }, { arch: "ENCHANTER", damage: "AP" }, { arch: "FIGHTER", damage: "AD" }] as const;
        const plan = planBuild(champ, role, archetypeOf(champ, role), [...enemies], style);
        for (const id of [...plan.start, ...plan.core]) assert.ok(items[id], `${champ.id} ${role} ${style}: ${id}`);
        assert.ok(plan.core.some((id) => boots.has(id)), `${champ.id} ${role}`);
      }
});

test("lên đồ phản đội hình: gặp nhiều phép mua Giày Thủy Ngân, gặp hồi máu mua vết thương sâu", () => {
  const ksante = db.KSANTE;
  const apHeavy = [{ arch: "MAGE", damage: "AP" }, { arch: "MAGE", damage: "AP" }, { arch: "ENCHANTER", damage: "AP" }, { arch: "MARKSMAN", damage: "AD" }] as const;
  assert.ok(planBuild(ksante, "TOP", "TANK", [...apHeavy]).core.includes("MERCURYS_TREADS"));
  const healers = [{ arch: "ENCHANTER", damage: "AP" }, { arch: "FIGHTER", damage: "AD" }, { arch: "FIGHTER", damage: "AD" }] as const;
  const adc = planBuild(db.XAYAH, "ADC", "MARKSMAN", [...healers]);
  assert.ok(adc.core.includes("MORTAL_REMINDER"));
});

test("mua theo công thức: nguyên liệu được trừ giá, túi tối đa 6 ô", () => {
  assert.equal(remainingCost(items, "INFINITY_EDGE", ["BF_SWORD"]), 3500 - items.BF_SWORD.cost);
  const plan = planBuild(db.XAYAH, "ADC", "MARKSMAN", []);
  let inv: string[] = [];
  let gold = 500;
  ({ inventory: inv, gold } = shopFor(items, plan, inv, gold));
  assert.deepEqual(inv, ["DORANS_BLADE"]);
  ({ inventory: inv } = shopFor(items, plan, inv, gold + 40000));
  assert.equal(inv.length, 6);
  assert.deepEqual(new Set(inv), new Set(plan.core));
  const { stats, tags } = inventoryStats(items, inv);
  assert.ok(stats.crit >= 50 && stats.ad > 100);
  assert.ok(tags.CRIT_DMG > 0);
});

test("trận thời gian thực: tướng lên đồ dần, bảng điểm cuối trận có túi đồ", () => {
  const m = new LiveMatch(db, { patch: "26.21", stagePressure: 0, seed: 3 }, [setup("GEN", A), setup("T1", B)]);
  m.advance(10);
  assert.ok(m.champs.every((c) => c.inventory.length >= 1), "đồ khởi đầu");
  const r = m.run();
  const lines = r.sides.flatMap((s) => s.lines);
  const legendary = lines.map((l) => (l.items ?? []).filter((id) => items[id]?.tier === "LEGENDARY").length);
  assert.ok(legendary.every((n) => n >= 1), `${r.duration}': ${legendary}`);
  assert.ok(lines.every((l) => (l.items ?? []).length <= 6));
});
