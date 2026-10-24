// Sinh chân dung pixel art cho tuyển thủ bằng PixelLab, lưu vào app/public/portraits/.
//
//   PIXELLAB_SECRET=... npm run portraits -- --team T1,GEN --limit 10
//   npm run portraits -- --dry-run            (xem mô tả và số lượng, không gọi API)
//
// Bỏ qua ảnh đã có (dùng --force để tạo lại). manifest.json được cập nhật sau mỗi ảnh, nên dừng giữa chừng vẫn giữ kết quả.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROLES, type Team } from "../../src/index.ts";
import { PixelLabClient, PixelLabError } from "./client.ts";
import { portraitParams } from "./prompts.ts";

const { values: args } = parseArgs({
  options: {
    pack: { type: "string", default: "real-2026" },
    team: { type: "string" },
    limit: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const root = join(import.meta.dirname, "../../..");
const teams: Team[] = JSON.parse(readFileSync(join(root, "data/packs", args.pack!, "teams.json"), "utf8"));
const outDir = join(root, "app/public/portraits");
const manifestPath = join(outDir, "manifest.json");
mkdirSync(outDir, { recursive: true });
const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

const wanted = args.team ? new Set(args.team.split(",")) : null;
let jobs = teams
  .filter((t) => !wanted || wanted.has(t.id))
  .flatMap((t) => ROLES.map((r) => ({ team: t, player: t.roster[r] })))
  .filter(({ player }) => args.force || !manifest[player.id]);
if (args.limit) jobs = jobs.slice(0, Number(args.limit));

if (args["dry-run"]) {
  for (const { team, player } of jobs) console.log(`${team.short} ${player.ign}: ${portraitParams(player, team).description}`);
  console.log(`\n${jobs.length} chân dung sẽ được tạo.`);
  process.exit(0);
}

const client = new PixelLabClient(process.env.PIXELLAB_SECRET ?? "");
console.log(`Số dư PixelLab: $${(await client.balance()).toFixed(2)} — sẽ tạo ${jobs.length} chân dung.`);

let spent = 0;
for (const [i, { team, player }] of jobs.entries()) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { png, usd } = await client.generatePixflux(portraitParams(player, team));
      writeFileSync(join(outDir, `${player.id}.png`), png);
      manifest[player.id] = `portraits/${player.id}.png`;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
      spent += usd;
      console.log(`[${i + 1}/${jobs.length}] ${team.short} ${player.ign} ✓ ($${usd.toFixed(4)})`);
      break;
    } catch (e) {
      const retryable = e instanceof PixelLabError && (e.status === 429 || e.status >= 500);
      if (!retryable || attempt >= 4) throw e;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ${(e as Error).message} — thử lại sau ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
console.log(`Xong. Chi phí: $${spent.toFixed(4)}. Manifest: app/public/portraits/manifest.json`);
