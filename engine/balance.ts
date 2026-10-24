// Chạy hàng loạt trận để kiểm tra cân bằng: npm run balance [số trận]
import { simulateMatch, type TeamSetup } from "./src/index.ts";
import { PATCH, buffTeam, db, setups, teams } from "./test/fixtures.ts";

const N = Number(process.argv[2] ?? 2000);

function batch(label: string, s: [TeamSetup, TeamSetup]) {
  let wins = 0, dur = 0, kills = 0, comebacks = 0, stomps = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = simulateMatch(db, { patch: PATCH, stagePressure: 0, seed }, s);
    if (r.winner === 0) wins++;
    dur += r.duration;
    kills += r.sides[0].kills + r.sides[1].kills;
    const early = r.phases[0].goldDiff;
    if ((early > 0 && r.winner === 1) || (early < 0 && r.winner === 0)) comebacks++;
    if (r.duration <= 25) stomps++;
  }
  const pct = (x: number) => `${((x / N) * 100).toFixed(1)}%`.padStart(6);
  console.log(`${label.padEnd(34)} thắng ${pct(wins)} | ${(dur / N).toFixed(1)}' | ${(kills / N).toFixed(1)} kill | lội ngược ${pct(comebacks)} | ≤25' ${pct(stomps)}`);
}

const mirror = (d: number): [TeamSetup, TeamSetup] => {
  const [a] = setups();
  return [{ ...a, team: buffTeam(teams[0], d) }, { ...a, team: teams[0] }];
};
batch("Gương (cùng đội, cùng tướng)", mirror(0));
batch("Gương, đội 0 +3 mọi chỉ số", mirror(3));
batch("Gương, đội 0 +8 mọi chỉ số", mirror(8));
batch("Demo: Blue vs Red", setups());
batch("Demo: Blue vs Red (Red +6)", setups([{}, { team: buffTeam(teams[1], 6) }]));
