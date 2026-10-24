// Vẽ chân dung pixel cho tuyển thủ bằng PixelLab (https://www.pixellab.ai), lưu vào data/packs/<id>/portraits/<playerId>.png
// Dùng:
//   PIXELLAB_API_KEY=... npm run portraits                 # vẽ ảnh còn thiếu của pack real-2026
//   npm run portraits -- --team GEN,T1                     # chỉ vài đội
//   npm run portraits -- --player GEN_MID --force          # vẽ lại 1 người
//   npm run portraits -- --dry-run                         # chỉ in prompt, không gọi API
//   npm run portraits -- --pack demo --size 96 --strength 350
// Giống người thật nhất: đặt ảnh chụp (crop vuông, thấy mặt + vai) vào data/packs/<id>/portraits/photos/<playerId>.jpg|.png
//   → dùng image-to-pixelart của PixelLab thay vì vẽ từ chữ. Ảnh gốc không được commit (xem .gitignore).
// Không có ảnh: vẽ từ chữ, thêm mô tả ngoại hình riêng ở data/packs/<id>/portraits/prompts.json  { "GEN_MID": "short black hair, round glasses" }
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
    size: { type: "string", default: "128" },
    strength: { type: "string", default: "300" }, // ảnh thật: 100–450, càng cao càng giống ảnh gốc
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string", default: "1" }, // gói Free của PixelLab: 1 ảnh mỗi lần
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
  .flatMap((t) => Object.values(t.roster).map((p) => ({ id: p.id, ign: p.ign, role: p.role, teamId: t.id, nationality: p.nationality })))
  .filter((p) => !playerFilter || playerFilter.includes(p.id))
  .filter((p) => opt.force || !existsSync(join(outDir, `${p.id}.png`)));

const photoDir = join(outDir, "photos");
const photoOf = (id: string) => [".png", ".jpg", ".jpeg"].map((ext) => join(photoDir, id + ext)).find(existsSync);

/** Kích thước ảnh PNG/JPEG, đọc thẳng từ header (không cần thư viện ảnh). */
export function imageSize(buf: Buffer): { width: number; height: number } {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length; ) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // SOF0..SOF15 (trừ DHT/JPG/DAC) chứa kích thước
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  throw new Error("chỉ hỗ trợ ảnh PNG hoặc JPEG");
}

function photoRequest(file: string) {
  const buf = readFileSync(file);
  const src = imageSize(buf);
  if (Math.max(src.width, src.height) > 2048 || Math.min(src.width, src.height) < 16) throw new Error(`ảnh ${src.width}x${src.height} phải trong khoảng 16..2048`);
  // Giữ tỉ lệ ảnh gốc, cạnh dài = size
  const k = size / Math.max(src.width, src.height);
  return {
    image: { type: "base64", base64: buf.toString("base64") },
    image_size: src,
    output_size: { width: Math.max(16, Math.round(src.width * k)), height: Math.max(16, Math.round(src.height * k)) },
    init_image_strength: Number(opt.strength), // 300: vẫn là pixel art nhưng nhận ra mặt; >450 gần như ảnh chụp
    fixer: true, // bám sát ảnh gốc thay vì vẽ lại
  };
}

const size = Number(opt.size);
if (!(size >= 16 && size <= 400)) throw new Error("--size phải trong khoảng 16..400");

if (opt["dry-run"]) {
  for (const p of subjects) {
    const photo = photoOf(p.id);
    console.log(`${p.id} (${p.ign}):`, photo ? `từ ảnh ${photo}` : JSON.stringify(portraitRequest(p, size, custom[p.id])));
  }
  console.log(`${subjects.length} chân dung sẽ được vẽ.`);
  process.exit(0);
}

const key = process.env.PIXELLAB_API_KEY;
if (!key) {
  console.error("Thiếu PIXELLAB_API_KEY (lấy tại https://www.pixellab.ai/account). Chạy thử không cần key: --dry-run");
  process.exit(1);
}

async function generate(endpoint: string, req: PortraitRequest | ReturnType<typeof photoRequest>): Promise<{ png: Buffer; usd?: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    // 429: quá tần suất / quá số job đồng thời, 529: máy chủ quá tải → chờ rồi thử lại
    if ((res.status === 429 || res.status === 529) && attempt < 8) {
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
      const photo = photoOf(p.id);
      const r = photo ? await generate("image-to-pixelart", photoRequest(photo)) : await generate("create-image-pixflux", portraitRequest(p, size, custom[p.id]));
      writeFileSync(join(outDir, `${p.id}.png`), r.png);
      usd += r.usd ?? 0;
      console.log(`  ✓ ${p.id} (${p.ign})${photo ? " từ ảnh" : ""} [${++done}/${subjects.length}]`);
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
