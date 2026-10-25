// Kiểm tra cân bằng engine trận thời gian thực: npm run live-balance [số trận mỗi kịch bản]
import { LiveMatch } from "./src/live/sim.ts";
import { bestTactic, type Picks, type Team, type TeamSetup } from "./src/index.ts";
import { buffTeam, realPack, realTeam } from "./test/fixtures.ts";
import defaultItems from "../data/packs/real-2026/items.json" with { type: "json" };

const db = realPack.champions;
const N = Number(process.argv[2] ?? 20);
const A: Picks = { TOP: "KSANTE", JUNGLE: "VIEGO", MID: "AZIR", ADC: "KAISA", SUPPORT: "RAKAN" };
const B: Picks = { TOP: "GNAR", JUNGLE: "LEESIN", MID: "ORIANNA", ADC: "XAYAH", SUPPORT: "NAUTILUS" };
const setup = (team: Team, picks: Picks): TeamSetup => ({ team, picks, tactic: bestTactic(db, picks), orders: { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" } });

function batch(label: string, mk: (seed: number) => [TeamSetup, TeamSetup]) {
  let wins = 0, dur = 0, kills = 0, towers = 0, cs = 0, timeouts = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= N; seed++) {
    const r = new LiveMatch(db, { patch: "26.21", stagePressure: 0, seed }, mk(seed)).run();
    if (r.winner === 0) wins++;
    dur += r.duration;
    if (r.duration >= 59.9) timeouts++;
    kills += r.sides[0].kills + r.sides[1].kills;
    towers += r.sides[0].towers + r.sides[1].towers;
    cs += r.sides.flatMap((s) => s.lines).filter((l) => l.role !== "SUPPORT" && l.role !== "JUNGLE").reduce((a, l) => a + l.cs / r.duration, 0) / 6;
  }
  const f = (x: number) => (x / N).toFixed(1);
  console.log(`${label.padEnd(30)} thắng ${(wins / N * 100).toFixed(0).padStart(3)}% | ${f(dur)}' | ${f(kills)} mạng | ${f(towers)} trụ | ${f(cs)} cs/phút | hết giờ ${timeouts} | ${((performance.now() - t0) / N).toFixed(0)}ms/trận`);
}

const gen = realTeam("GEN");
batch("Gương GEN vs GEN (cùng tướng)", (s) => (s % 2 ? [setup(gen, A), setup(gen, A)] : [setup(gen, B), setup(gen, B)]));
batch("Gương, đội 0 +5 chỉ số", () => [setup(buffTeam(gen, 5), A), setup(gen, A)]);
batch("Gương, đội 0 +10 chỉ số", () => [setup(buffTeam(gen, 10), A), setup(gen, A)]);
batch("GEN vs T1 (đổi bên/tướng)", (s) => (s % 2 ? [setup(gen, A), setup(realTeam("T1"), B)] : [setup(gen, B), setup(realTeam("T1"), A)]));
batch("GEN vs FURIA", (s) => (s % 2 ? [setup(gen, A), setup(realTeam("FUR"), B)] : [setup(gen, B), setup(realTeam("FUR"), A)]));

// Lên đồ: túi đồ cuối trận mẫu và hiệu quả theo lối lên đồ
{
  const r = new LiveMatch(db, { patch: "26.21", stagePressure: 0, seed: 7 }, [setup(gen, A), setup(realTeam("T1"), B)]).run();
  const items = defaultItems as Record<string, { nameVi?: string }>;
  console.log(`\nTúi đồ mẫu (GEN vs T1, ${r.duration}'):`);
  for (const s of r.sides) for (const l of s.lines) console.log(`  ${l.ign.padEnd(9)} ${l.champion.padEnd(9)} ${(l.items ?? []).map((id) => items[id]?.nameVi ?? id).join(", ")}`);
}
for (const style of ["DAMAGE", "DEFENSE"] as const)
  batch(`Gương, đội 0 lên đồ ${style}`, (s) => {
    const p = s % 2 ? A : B;
    return [{ ...setup(gen, p), buildStyle: style }, setup(gen, p)];
  });
