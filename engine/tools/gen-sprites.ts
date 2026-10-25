// Sprite pixel có animation cho tướng và quái LMHT bằng PixelLab, lưu vào data/packs/<id>/sprites/<ID>/
//   base.png                 sprite gốc (64x64, quái lớn 96x96), nhìn ngang, quay sang phải (đội đỏ thì lật ngang khi hiển thị)
//   idle_0..4.png            đứng thở (4 khung + khung gốc)
//   attack_0..8.png          tấn công/tung chiêu (8 khung + khung gốc)
// Chi phí: 1 lượt vẽ cho base + khoảng 1 lượt mỗi animation → ~3 lượt mỗi tướng/quái (quái 96px có thể tốn hơn).
// Dùng:
//   PIXELLAB_API_KEY=key1,key2 npm run champ-sprites -- --only AHRI,JINX
//   npm run monster-sprites -- --only BARON,DRAGON_INFERNAL
//   npm run monster-sprites -- --dry-run                  # xem prompt
//   npm run champ-sprites -- --only AHRI --anims attack --force
// Ngoại hình: data/packs/<id>/sprites/champions.json (tướng), sprites/monsters.json (quái)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ChampionDb } from "../src/draft.ts";
import { call, fromPng, requireKey, toPng, waitJob, type B64Image } from "./pixellab.ts";

const { values: opt } = parseArgs({
  options: {
    pack: { type: "string", default: "real-2026" },
    set: { type: "string", default: "champions" }, // champions | monsters
    only: { type: "string" },
    anims: { type: "string", default: "idle,attack" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const packDir = join(import.meta.dirname, "../../data/packs", opt.pack);
const outRoot = join(packDir, "sprites");
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));

interface Subject { id: string; name: string; look: string; size: number; kind: string }
let subjects: Subject[];
if (opt.set === "champions") {
  const db = read(join(packDir, "champions.json")) as ChampionDb;
  const looks = read(join(outRoot, "champions.json")) as Record<string, string>;
  subjects = Object.values(db).map((c) => ({ id: c.id, name: c.name, look: looks[c.id] ?? "a fantasy champion", size: 64, kind: "champion" }));
} else if (opt.set === "monsters") {
  const monsters = read(join(outRoot, "monsters.json")) as Record<string, { name: string; look: string; size?: number }>;
  subjects = Object.entries(monsters).map(([id, m]) => ({ id, name: m.name, look: m.look, size: m.size ?? 64, kind: "monster" }));
} else throw new Error("--set phải là champions hoặc monsters");

const ANIMS: Record<string, { frames: number; motion: string }> = {
  idle: { frames: 4, motion: "idle stance, gentle breathing and slight bobbing in place, loops seamlessly" },
  attack: { frames: 8, motion: "performs a powerful attack toward the right (strike, bite, breath or spell), then returns to the starting pose" },
};
const anims = opt.anims.split(",").map((s) => s.trim()).filter(Boolean);
for (const a of anims) if (!ANIMS[a]) throw new Error(`animation không hỗ trợ: ${a} (có: ${Object.keys(ANIMS).join(", ")})`);

const filter = opt.only?.split(",").map((s) => s.trim().toUpperCase());
const picked = subjects.filter((c) => !filter || filter.includes(c.id));
const subject = (c: Subject) => `${c.name} from League of Legends: ${c.look}`;

const baseRequest = (c: Subject) => ({
  description: `pixel art game sprite of ${subject(c)}, full body, standing idle, facing right`,
  image_size: { width: c.size, height: c.size },
  no_background: true,
  outline: "single color black outline",
  shading: "medium shading",
  detail: "highly detailed",
  view: "side",
  direction: "east",
});

const has = (dir: string, anim: string) => existsSync(join(dir, `${anim}_0.png`));
const todo = picked.filter((c) => {
  const dir = join(outRoot, c.id);
  return opt.force || !existsSync(join(dir, "base.png")) || anims.some((a) => !has(dir, a));
});

if (opt["dry-run"]) {
  for (const c of todo) console.log(`${c.id} (${c.size}px): ${baseRequest(c).description}`);
  console.log(`${todo.length} ${opt.set}, khoảng ${todo.length * (1 + anims.length)} lượt vẽ.`);
  process.exit(0);
}
requireKey();

async function animate(base: Buffer, c: Subject, anim: string): Promise<Buffer[]> {
  const a = ANIMS[anim];
  const job = await call<{ background_job_id: string }>("POST", "animate-pixminimax", {
    first_frame: fromPng(base),
    description: a.motion,
    frame_count: a.frames,
    no_background: true,
    view: "side",
    direction: "east",
    subject_description: subject(c).slice(0, 300),
    initial_pose: "standing idle facing right",
  });
  const res = await waitJob<{ images: B64Image[] }>(job.background_job_id);
  return res.images.map(toPng);
}

console.log(`Vẽ sprite cho ${todo.length} ${opt.set} (${anims.join(", ")}) → ${outRoot}`);
let failed = 0;
for (const [i, c] of todo.entries()) {
  const dir = join(outRoot, c.id);
  mkdirSync(dir, { recursive: true });
  try {
    const basePath = join(dir, "base.png");
    if (opt.force || !existsSync(basePath)) {
      const r = await call<{ image: B64Image }>("POST", "create-image-pixflux", baseRequest(c));
      writeFileSync(basePath, toPng(r.image));
    }
    const base = readFileSync(basePath);
    for (const anim of anims) {
      if (!opt.force && has(dir, anim)) continue;
      const frames = await animate(base, c, anim);
      frames.forEach((f, k) => writeFileSync(join(dir, `${anim}_${k}.png`), f));
    }
    console.log(`  ✓ ${c.name} [${i + 1}/${todo.length}]`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${c.name}: ${(e as Error).message}`);
    if (/401|402/.test((e as Error).message)) break;
  }
}
console.log(`Xong: ${todo.length - failed} ${opt.set}, ${failed} lỗi`);
process.exitCode = failed ? 1 : 0;
