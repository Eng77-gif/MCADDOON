// Sprite pixel có animation cho tướng LMHT bằng PixelLab, lưu vào data/packs/<id>/sprites/<CHAMP>/
//   base.png                 sprite gốc 64x64, nhìn ngang, quay sang phải (đội đỏ thì lật ngang khi hiển thị)
//   idle_0..4.png            đứng thở (4 khung + khung gốc)
//   attack_0..8.png          tấn công/tung chiêu (8 khung + khung gốc)
// Chi phí: 1 lượt vẽ cho base + 1 lượt mỗi animation (64x64, ≤ 8 khung) → 3 lượt/tướng.
// Dùng:
//   PIXELLAB_API_KEY=key1,key2 npm run champ-sprites -- --champ AHRI,JINX
//   npm run champ-sprites -- --dry-run                    # xem prompt
//   npm run champ-sprites -- --champ AHRI --anims attack --force
// Ngoại hình từng tướng: data/packs/<id>/sprites/champions.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ChampionDb } from "../src/draft.ts";
import { call, fromPng, requireKey, toPng, waitJob, type B64Image } from "./pixellab.ts";

const { values: opt } = parseArgs({
  options: {
    pack: { type: "string", default: "real-2026" },
    champ: { type: "string" },
    anims: { type: "string", default: "idle,attack" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const packDir = join(import.meta.dirname, "../../data/packs", opt.pack);
const outRoot = join(packDir, "sprites");
const db = JSON.parse(readFileSync(join(packDir, "champions.json"), "utf8")) as ChampionDb;
const looks = JSON.parse(readFileSync(join(outRoot, "champions.json"), "utf8")) as Record<string, string>;

const SIZE = 64;
const ANIMS: Record<string, { frames: number; motion: string }> = {
  idle: { frames: 4, motion: "idle stance, gentle breathing and slight bobbing in place, loops seamlessly" },
  attack: { frames: 8, motion: "performs a powerful signature attack toward the right with their weapon or magic, then returns to the starting pose" },
};
const anims = opt.anims.split(",").map((s) => s.trim()).filter(Boolean);
for (const a of anims) if (!ANIMS[a]) throw new Error(`animation không hỗ trợ: ${a} (có: ${Object.keys(ANIMS).join(", ")})`);

const filter = opt.champ?.split(",").map((s) => s.trim().toUpperCase());
const champs = Object.values(db).filter((c) => !filter || filter.includes(c.id));
const subject = (id: string) => `${db[id].name} from League of Legends: ${looks[id] ?? "a fantasy champion"}`;

const baseRequest = (id: string) => ({
  description: `pixel art game sprite of ${subject(id)}, full body, standing idle, facing right`,
  image_size: { width: SIZE, height: SIZE },
  no_background: true,
  outline: "single color black outline",
  shading: "medium shading",
  detail: "highly detailed",
  view: "side",
  direction: "east",
});

const has = (dir: string, anim: string) => existsSync(join(dir, `${anim}_0.png`));
const todo = champs.filter((c) => {
  const dir = join(outRoot, c.id);
  return opt.force || !existsSync(join(dir, "base.png")) || anims.some((a) => !has(dir, a));
});

if (opt["dry-run"]) {
  for (const c of todo) console.log(`${c.id}: ${baseRequest(c.id).description}`);
  console.log(`${todo.length} tướng, tối đa ${todo.length * (1 + anims.length)} lượt vẽ.`);
  process.exit(0);
}
requireKey();

async function animate(base: Buffer, id: string, anim: string): Promise<Buffer[]> {
  const a = ANIMS[anim];
  const job = await call<{ background_job_id: string }>("POST", "animate-pixminimax", {
    first_frame: fromPng(base),
    description: a.motion,
    frame_count: a.frames,
    no_background: true,
    view: "side",
    direction: "east",
    subject_description: subject(id).slice(0, 300),
    initial_pose: "standing idle facing right",
  });
  const res = await waitJob<{ images: B64Image[] }>(job.background_job_id);
  return res.images.map(toPng);
}

console.log(`Vẽ sprite cho ${todo.length} tướng (${anims.join(", ")}) → ${outRoot}`);
let failed = 0;
for (const [i, c] of todo.entries()) {
  const dir = join(outRoot, c.id);
  mkdirSync(dir, { recursive: true });
  try {
    const basePath = join(dir, "base.png");
    if (opt.force || !existsSync(basePath)) {
      const r = await call<{ image: B64Image }>("POST", "create-image-pixflux", baseRequest(c.id));
      writeFileSync(basePath, toPng(r.image));
    }
    const base = readFileSync(basePath);
    for (const anim of anims) {
      if (!opt.force && has(dir, anim)) continue;
      const frames = await animate(base, c.id, anim);
      frames.forEach((f, k) => writeFileSync(join(dir, `${anim}_${k}.png`), f));
    }
    console.log(`  ✓ ${c.name} [${i + 1}/${todo.length}]`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${c.name}: ${(e as Error).message}`);
    if (/401|402/.test((e as Error).message)) break;
  }
}
console.log(`Xong: ${todo.length - failed} tướng, ${failed} lỗi`);
process.exitCode = failed ? 1 : 0;
