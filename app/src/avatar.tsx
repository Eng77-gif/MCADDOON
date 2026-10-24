// Avatar pixel art: ưu tiên chân dung PixelLab (app/public/portraits, tạo bằng `npm run portraits`),
// không có thì vẽ avatar 16x16 theo id tuyển thủ và màu áo đội.
import { useEffect, useState } from "react";
import type { Player, Team } from "../../engine/src/index.ts";

let manifest: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadManifest() {
  loading ??= fetch("portraits/manifest.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m) => {
      manifest = m as Record<string, string>;
      listeners.forEach((f) => f());
    });
  return loading;
}

function usePortrait(id: string): string | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    if (manifest) return;
    const f = () => force((n) => n + 1);
    listeners.add(f);
    loadManifest();
    return () => void listeners.delete(f);
  }, []);
  return manifest?.[id];
}

const SKIN = ["#f6d3b3", "#eab98f", "#d39a6a", "#a86b45", "#7a4a2e"];
const HAIR = ["#1c1a22", "#3b2a20", "#6b4428", "#d9c27a", "#e8e8f0", "#b23a48", "#3d5ccc"];
const cache = new Map<string, string>();

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Vẽ chân dung 16x16 và trả về data URL (có cache). */
export function pixelAvatar(id: string, colors: [string, string] = ["#c27c0e", "#2b2140"]): string {
  const key = `${id}|${colors.join()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(id);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 4) % HAIR.length];
  const style = (h >> 8) % 4;
  const glasses = (h >> 12) % 5 === 0;
  const [c1, c2] = colors;
  const ink = "#140f1f";

  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const g = cv.getContext("2d")!;
  const px = (x: number, y: number, c: string, w = 1, hh = 1) => ((g.fillStyle = c), g.fillRect(x, y, w, hh));

  // áo đấu + cổ áo màu phụ
  px(2, 12, ink, 12, 4); px(3, 12, c1, 10, 4); px(6, 12, c2, 4, 1); px(7, 13, c2, 2, 1); px(4, 14, c2, 1, 2); px(11, 14, c2, 1, 2);
  // cổ + đầu
  px(7, 10, skin, 2, 2);
  px(4, 3, ink, 8, 8); px(5, 4, skin, 6, 6); px(4, 5, skin, 1, 4); px(11, 5, skin, 1, 4);
  // mắt, miệng
  px(6, 7, ink); px(9, 7, ink); px(7, 9, "#9a4a4a", 2, 1);
  if (glasses) { px(5, 7, "#2a2a3a", 3, 1); px(8, 7, "#2a2a3a", 3, 1); px(6, 7, "#9fd3ff"); px(9, 7, "#9fd3ff"); }
  // tóc theo kiểu
  px(4, 2, hair, 8, 2); px(4, 4, hair, 1, 2); px(11, 4, hair, 1, 2);
  if (style === 1) { px(5, 1, hair, 1, 1); px(8, 1, hair, 1, 1); px(10, 1, hair, 1, 1); }
  if (style === 2) { px(3, 4, hair, 1, 6); px(12, 4, hair, 1, 6); }
  if (style === 3) { px(4, 1, c2, 8, 2); px(3, 3, c2, 10, 1); }
  // tai nghe + mic
  px(3, 2, "#222", 10, 1); px(3, 5, "#222", 2, 3); px(11, 5, "#222", 2, 3); px(12, 8, "#222", 1, 2); px(10, 9, "#222", 2, 1);
  px(4, 6, "#e04848"); px(11, 6, "#e04848");

  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

export function Avatar({ player, team, size = 48 }: { player: Player; team?: Team; size?: number }) {
  const portrait = usePortrait(player.id);
  const src = portrait ?? pixelAvatar(player.id, team?.colors);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <img src={src} alt="" width={size} height={size} />
    </span>
  );
}
