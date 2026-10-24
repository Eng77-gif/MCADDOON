// Vẽ chân dung pixel cho tuyển thủ bằng PixelLab (https://www.pixellab.ai), lưu vào data/packs/<id>/portraits/<playerId>.png
// Dùng:
//   PIXELLAB_API_KEY=... npm run portraits                 # vẽ ảnh còn thiếu của pack real-2026
//   npm run portraits -- --team GEN,T1                     # chỉ vài đội
//   npm run portraits -- --player GEN_MID --force          # vẽ lại 1 người
//   npm run portraits -- --dry-run                         # chỉ in prompt, không gọi API
//   npm run portraits -- --pack demo --size 96
// Mô tả ngoại hình riêng (tuỳ chọn): data/packs/<id>/portraits/prompts.json  { "GEN_MID": "short black hair, round glasses" }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Team } from "../src/types.ts";
import { portraitRequest, type PortraitRequest, type PortraitSubject } from "./portraitPrompt.ts";

const API = "https://api.pixellab.ai/v2";

const { values: opt } = parseArgs({
  options: {
    pack: { type: "string", default: "real-2026" },
    team: { type: "string" },
    player: { type: "string" },
    size: { type: "string", default: "64" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string", default: "2" },
  },
});

const packDir = join(import.meta.dirname, "../../data/packs", opt.pack);
const outDir = join(packDir, "portraits");
const teams = JSON.parse(readFileSync(join(packDir, "teams.json"), "utf8")) as Team[];
const customFile = join(outDir, "prompts.json");
const custom: Record<string, string> = existsSync(customFile) ? JSON.parse(readFileSync(customFile, "utf8")) : {};

const teamFilter = opt.team?.split(",").map((s) => s.trim().toUpperCase());
const playerFilter = opt.player?.split(",").map((s) => s.trim().toUpperCase());
const subjects: PortraitSubject[] = teams
  .filter((t) => !teamFilter || teamFilter.includes(t.id))
  .flatMap((t) => Object.values(t.roster).map((p) => ({ id: p.id, ign: p.ign, role: p.role, teamId: t.id })))
  .filter((p) => !playerFilter || playerFilter.includes(p.id))
  .filter((p) => opt.force || !existsSync(join(outDir, `${p.id}.png`)));

const size = Number(opt.size);
if (!(size >= 16 && size <= 400)) throw new Error("--size phải trong khoảng 16..400");

if (opt["dry-run"]) {
  for (const p of subjects) console.log(`${p.id} (${p.ign}):`, JSON.stringify(portraitRequest(p, size, custom[p.id])));
  console.log(`${subjects.length} chân dung sẽ được vẽ.`);
  process.exit(0);
}

const key = process.env.PIXELLAB_API_KEY;
if (!key) {
  console.error("Thiếu PIXELLAB_API_KEY (lấy tại https://www.pixellab.ai/account). Chạy thử không cần key: --dry-run");
  process.exit(1);
}

async function generate(req: PortraitRequest): Promise<{ png: Buffer; usd?: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/create-image-pixflux`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    // 429: quá tần suất, 529: máy chủ quá tải → chờ rồi thử lại
    if ((res.status === 429 || res.status === 529) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (res.status === 401) throw new Error("PIXELLAB_API_KEY không hợp lệ (401)");
    if (res.status === 402) throw new Error("Hết credit PixelLab (402)");
    if (!res.ok) throw new Error(`PixelLab ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { image: { base64: string }; usage?: { usd?: number | null } };
    const b64 = body.image.base64.replace(/^data:image\/\w+;base64,/, "");
    return { png: Buffer.from(b64, "base64"), usd: body.usage?.usd ?? undefined };
  }
}

mkdirSync(outDir, { recursive: true });
console.log(`Vẽ ${subjects.length} chân dung ${size}x${size} → ${outDir}`);
let done = 0, failed = 0, usd = 0;
const queue = [...subjects];
async function worker() {
  for (let p = queue.shift(); p; p = queue.shift()) {
    try {
      const r = await generate(portraitRequest(p, size, custom[p.id]));
      writeFileSync(join(outDir, `${p.id}.png`), r.png);
      usd += r.usd ?? 0;
      console.log(`  ✓ ${p.id} (${p.ign}) [${++done}/${subjects.length}]`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${p.id} (${p.ign}): ${(e as Error).message}`);
      // Lỗi key/credit thì dừng hẳn, không đốt thêm request
      if (/401|402/.test((e as Error).message)) queue.length = 0;
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(opt.concurrency)) }, worker));
console.log(`Xong: ${done} ảnh, ${failed} lỗi${usd ? `, chi phí ~$${usd.toFixed(2)}` : ""}`);
process.exitCode = failed ? 1 : 0;
