// Sprite pixel có animation của tướng do PixelLab vẽ (npm run champ-sprites).
import { useEffect, useState } from "react";

const files = import.meta.glob<string>("../../data/packs/real-2026/sprites/*/*.png", { eager: true, query: "?inline", import: "default" });

// sprites[CHAMP][anim] = các khung theo thứ tự; anim "base" là ảnh tĩnh
const sprites: Record<string, Record<string, string[]>> = {};
for (const [path, url] of Object.entries(files)) {
  const [champ, file] = path.split("/").slice(-2);
  const m = /^(\w+?)(?:_(\d+))?\.png$/.exec(file);
  if (!m) continue;
  const frames = ((sprites[champ] ??= {})[m[1]] ??= []);
  frames[Number(m[2] ?? 0)] = url;
}

/** Tướng dạng pixel. `anim` chưa vẽ thì dùng ảnh tĩnh; `flip` để quay sang trái (đội đỏ). */
export function ChampSprite({ id, anim = "idle", size = 64, flip = false, fps = 8 }: { id: string; anim?: string; size?: number; flip?: boolean; fps?: number }) {
  const frames = sprites[id]?.[anim]?.filter(Boolean) ?? sprites[id]?.base ?? [];
  const [k, setK] = useState(0);
  useEffect(() => {
    setK(0);
    if (frames.length < 2) return;
    const t = setInterval(() => setK((x) => (x + 1) % frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [id, anim, frames.length, fps]);
  if (!frames.length) return null;
  return <img className="sprite" src={frames[k % frames.length]} alt="" width={size} height={size} style={flip ? { transform: "scaleX(-1)" } : undefined} />;
}
