// Chạy 1 trận mẫu, HLV đổi chỉ đạo giữa các giai đoạn: npm run demo [seed]
import { MatchSim, boxScore, describeEvent, describePhase } from "./src/index.ts";
import { PATCH, db, setups } from "./test/fixtures.ts";

const seed = Number(process.argv[2] ?? 42);
const sim = new MatchSim(db, { patch: PATCH, stagePressure: 0.1, seed }, setups());
const names: [string, string] = ["DBE", "DRG"];

console.log(`Seed ${seed} | Theo đội hình, ${names[0]} có ${(sim.draftResult.pWin[0] * 100).toFixed(1)}% thắng\n`);

while (!sim.isOver) {
  // Ví dụ chỉ đạo: bên đang thua vàng sau đầu trận chuyển sang đánh an toàn, bên dẫn ưu tiên Baron
  const prev = sim.phases.at(-1);
  const orders: Parameters<MatchSim["playPhase"]>[0] = [];
  if (prev && prev.phase === "EARLY") {
    const leader = prev.goldDiff >= 0 ? 0 : 1;
    orders[leader] = { laneFocus: "NONE", objective: "HERALD_BARON", risk: "AGGRESSIVE" };
    orders[1 - leader] = { laneFocus: "NONE", objective: "DRAGON", risk: "SAFE" };
  }
  const report = sim.playPhase(orders);
  console.log(describePhase(report, names));
  for (const e of report.events) if (e.type !== "KILL") console.log("  " + describeEvent(e, names));
}
console.log("\n" + boxScore(sim.result()));
