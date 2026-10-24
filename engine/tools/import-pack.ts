// Dựng data/packs/<id>/*.json từ data/packs/<id>/csv/*.csv
// Dùng: npm run import-pack real-2026 [patch]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPack, type PackCsv } from "../src/pack.ts";

const id = process.argv[2] ?? "real-2026";
const patch = process.argv[3] ?? "26.21";
const dir = join(import.meta.dirname, "../../data/packs", id);
const read = (f: string) => readFileSync(join(dir, "csv", `${f}.csv`), "utf8");
const csv: PackCsv = {
  champions: read("champions"), matchups: read("matchups"), synergies: read("synergies"),
  leagues: read("leagues"), teams: read("teams"), players: read("players"),
};

const pack = buildPack(csv, patch);
const write = (f: string, data: unknown) => writeFileSync(join(dir, f), JSON.stringify(data, null, 1) + "\n");
write("champions.json", pack.champions);
write("leagues.json", pack.leagues);
write("teams.json", pack.teams);
write("pack.json", {
  id, patch,
  name: "Dữ liệu thật mùa 2026 (chỉ số là ước lượng)",
  files: { champions: "champions.json", leagues: "leagues.json", teams: "teams.json" },
});

const players = pack.teams.reduce((n, t) => n + Object.keys(t.roster).length, 0);
const unverified = pack.teams.filter((t) => !t.verified).map((t) => t.short);
console.log(`${id}: ${Object.keys(pack.champions).length} tướng, ${pack.leagues.length} giải, ${pack.teams.length} đội, ${players} tuyển thủ`);
if (unverified.length) console.log(`Roster chưa xác minh đầy đủ: ${unverified.join(", ")}`);
for (const w of pack.warnings) console.warn("CẢNH BÁO:", w);
process.exitCode = pack.warnings.length ? 1 : 0;
