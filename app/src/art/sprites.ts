// Sprite pixel art vẽ bằng code (không dùng ảnh ngoài): nhân vật chibi theo tuyển thủ + nhóm tướng,
// lính, trụ pha lê, nhà chính, quái rừng, Rồng, Baron, huy hiệu đội. Tất cả được cache theo khoá.
import type { Archetype } from "../../../engine/src/index.ts";

type Px = (x: number, y: number, c: string, w?: number, h?: number) => void;
const cache = new Map<string, HTMLCanvasElement>();

function make(key: string, w: number, h: number, draw: (px: Px) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const px: Px = (x, y, c, ww = 1, hh = 1) => ((g.fillStyle = c), g.fillRect(x, y, ww, hh));
  draw(px);
  cache.set(key, cv);
  return cv;
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const INK = "#120e1c";
const SKIN = ["#f6d3b3", "#eab98f", "#d39a6a", "#a86b45", "#7a4a2e"];
const HAIR = ["#1c1a22", "#3b2a20", "#6b4428", "#d9c27a", "#e8e8f0", "#b23a48", "#3d5ccc", "#7c4dbd"];

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Nhân vật chibi 16x20: đầu theo tuyển thủ (da, tóc), áo theo màu đội, vũ khí theo nhóm tướng.
 * frame 0/1 = bước chân; flip = quay trái.
 */
export function heroSprite(playerId: string, colors: [string, string], arch: Archetype, frame: number, flip: boolean) {
  return make(`hero|${playerId}|${colors}|${arch}|${frame}|${flip}`, 18, 20, (raw) => {
    const px: Px = flip ? (x, y, c, w = 1, h = 1) => raw(18 - x - w, y, c, w, h) : raw;
    const h = hash(playerId);
    const skin = SKIN[h % SKIN.length];
    const hair = HAIR[(h >> 4) % HAIR.length];
    const style = (h >> 8) % 4;
    const [c1, c2] = colors;
    const step = frame % 2;

    // bóng
    px(4, 18, "#00000055", 10, 2);
    // chân
    px(6, 14, INK, 6, 4);
    px(7, 14, "#2b2b3a", 1, 3 - step);
    px(10, 14, "#2b2b3a", 1, 2 + step);
    px(6, 17 - step, "#3a2a1e", 2, 1);
    px(10, 16 + step, "#3a2a1e", 2, 1);
    // thân áo
    px(5, 8, INK, 8, 7);
    px(6, 9, c1, 6, 5);
    px(6, 12, c2, 6, 1);
    px(8, 9, shade(c1, 1.25), 2, 2);
    // tay
    px(4, 9, INK, 2, 4); px(4, 10, skin, 1, 2);
    px(12, 9, INK, 2, 4); px(13, 10, skin, 1, 2);
    // đầu
    px(5, 1, INK, 8, 8);
    px(6, 2, skin, 6, 6);
    px(7, 5, INK); px(10, 5, INK);
    px(8, 7, "#9a4a4a", 2, 1);
    // tóc
    px(5, 1, hair, 8, 2); px(5, 3, hair, 1, 2); px(12, 3, hair, 1, 2);
    if (style === 1) { px(6, 0, hair, 1, 1); px(9, 0, hair, 1, 1); px(11, 0, hair, 1, 1); }
    if (style === 2) { px(4, 2, hair, 1, 5); px(13, 2, hair, 1, 5); }
    if (style === 3) { px(5, 0, c2, 8, 2); px(4, 2, c2, 10, 1); }

    // vũ khí theo nhóm tướng
    switch (arch) {
      case "TANK":
        px(1, 7, INK, 5, 8); px(2, 8, c2, 3, 6); px(3, 9, shade(c2, 1.3), 1, 4);
        break;
      case "FIGHTER":
        px(14, 2, INK, 3, 11); px(15, 3, "#cfd6e4", 1, 8); px(14, 10, "#8a6a3d", 3, 1);
        break;
      case "ASSASSIN":
        px(14, 8, INK, 3, 5); px(15, 9, "#cfd6e4", 1, 3); px(1, 9, INK, 3, 4); px(2, 10, "#cfd6e4", 1, 2);
        break;
      case "MAGE":
        px(14, 1, INK, 3, 15); px(15, 4, "#7a5a3a", 1, 11); px(14, 1, "#9b6bff", 3, 3); px(15, 2, "#e6d6ff");
        break;
      case "MARKSMAN":
        px(14, 6, INK, 4, 7); px(15, 7, "#6b4a2a", 1, 5); px(16, 7, "#d8d8d8", 1, 5); px(14, 9, "#3a3a3a", 4, 1);
        break;
      case "ENCHANTER":
        px(14, 3, INK, 3, 12); px(15, 6, "#c9a24a", 1, 8); px(14, 3, "#4fd18b", 3, 3); px(15, 4, "#d9ffe9");
        break;
      case "CATCHER":
        px(14, 7, INK, 4, 4); px(15, 8, "#8d93a3", 2, 2); px(13, 11, "#8d93a3", 1, 4);
        break;
    }
  });
}

export function minionSprite(side: 0 | 1, ranged: boolean, frame: number) {
  return make(`minion|${side}|${ranged}|${frame}`, 9, 10, (px) => {
    const c = side === 0 ? "#4a7cff" : "#ff5b6b";
    px(2, 9, "#00000055", 6, 1);
    px(2, 2, INK, 5, 7);
    px(3, 3, c, 3, 4);
    px(3, 3, shade(c, 1.35), 3, 1);
    px(3, 7 + (frame % 2), "#2b2b3a", 1, 1);
    px(5, 8 - (frame % 2), "#2b2b3a", 1, 1);
    if (ranged) { px(7, 0, INK, 2, 8); px(7, 0, "#c9a0ff", 2, 2); }
    else { px(7, 3, INK, 2, 5); px(7, 4, "#cfd6e4", 1, 3); }
  });
}

/** Trụ pha lê: chân đá + tinh thể phát sáng màu phe; alive=false => đống đổ nát */
export function towerSprite(side: 0 | 1, alive: boolean, big: boolean) {
  const w = big ? 22 : 14;
  const h = big ? 28 : 26;
  return make(`tower|${side}|${alive}|${big}`, w, h, (px) => {
    const glow = side === 0 ? "#6fb6ff" : "#ff7a8a";
    const core = side === 0 ? "#2f6fe0" : "#d8434f";
    px(1, h - 3, "#00000066", w - 2, 3);
    if (!alive) {
      px(2, h - 8, INK, w - 4, 6); px(3, h - 7, "#6e6a62", w - 6, 4); px(5, h - 9, "#8b867c", 3, 2); px(w - 7, h - 8, "#8b867c", 2, 2);
      return;
    }
    // chân đá
    px(2, h - 10, INK, w - 4, 8); px(3, h - 9, "#8b867c", w - 6, 6); px(3, h - 9, "#a9a397", w - 6, 1);
    // tinh thể
    const cw = big ? 10 : 6;
    const cx = (w - cw) / 2;
    px(cx - 1, 1, INK, cw + 2, h - 10);
    px(cx, 2, core, cw, h - 12);
    px(cx + 1, 3, glow, Math.max(1, cw / 2 - 1), h - 15);
    px(cx + cw / 2, 1, "#ffffff", 1, 2);
  });
}

export function monsterSprite(kind: "CAMP" | "DRAGON" | "BARON") {
  if (kind === "CAMP")
    return make("camp", 12, 9, (px) => {
      px(1, 8, "#00000055", 10, 1);
      px(1, 2, INK, 10, 6); px(2, 3, "#8a6a3d", 8, 4); px(8, 1, INK, 3, 3); px(9, 2, "#a98552"); px(3, 7, INK, 1, 1); px(8, 7, INK, 1, 1);
      px(9, 2, "#ffde59");
    });
  if (kind === "DRAGON")
    return make("dragon", 26, 18, (px) => {
      px(3, 16, "#00000066", 20, 2);
      px(4, 5, INK, 16, 10); px(5, 6, "#d06a2c", 14, 8); px(6, 7, "#f29a4a", 8, 2);
      px(18, 2, INK, 7, 7); px(19, 3, "#d06a2c", 5, 5); px(22, 4, "#ffde59");
      px(2, 1, INK, 6, 5); px(3, 2, "#f2c14a", 4, 3); // cánh
      px(1, 9, INK, 4, 3); px(2, 10, "#d06a2c", 2, 1); // đuôi
      px(7, 14, INK, 2, 2); px(14, 14, INK, 2, 2);
    });
  return make("baron", 32, 24, (px) => {
    px(4, 21, "#00000066", 24, 3);
    px(6, 8, INK, 20, 13); px(7, 9, "#6a3fa8", 18, 11); px(9, 10, "#9b6bff", 12, 3);
    px(10, 2, INK, 12, 8); px(11, 3, "#7b4fb3", 10, 6); px(13, 5, "#ffde59"); px(18, 5, "#ffde59");
    px(4, 14, INK, 4, 6); px(24, 14, INK, 4, 6); px(5, 15, "#6a3fa8", 2, 4); px(25, 15, "#6a3fa8", 2, 4);
    for (let i = 0; i < 4; i++) px(8 + i * 4, 1, "#d9c2ff", 1, 2);
  });
}

export function nexusSprite(side: 0 | 1, alive: boolean) {
  return make(`nexus|${side}|${alive}`, 30, 30, (px) => {
    const glow = side === 0 ? "#6fb6ff" : "#ff7a8a";
    const core = side === 0 ? "#2f6fe0" : "#d8434f";
    px(2, 24, "#00000066", 26, 4);
    px(2, 18, INK, 26, 8); px(3, 19, "#8b867c", 24, 6); px(3, 19, "#a9a397", 24, 1);
    if (!alive) { px(8, 14, "#6e6a62", 14, 5); return; }
    px(8, 2, INK, 14, 18); px(9, 3, core, 12, 16); px(11, 4, glow, 4, 12); px(14, 1, "#ffffff", 2, 3);
  });
}

/** Huy hiệu đội hình khiên 2 màu + chữ viết tắt (vẽ 1 lần, trả về data URL cho thẻ <img>) */
const crestCache = new Map<string, string>();
export function teamCrest(short: string, colors?: [string, string]): string {
  const key = `${short}|${colors}`;
  const hit = crestCache.get(key);
  if (hit) return hit;
  const [c1, c2] = colors ?? ["#64748b", "#111827"];
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!;
  const px = (x: number, y: number, c: string, w = 1, h = 1) => ((g.fillStyle = c), g.fillRect(x, y, w, h));
  // khiên
  px(5, 3, INK, 22, 18);
  for (let i = 0; i < 8; i++) px(6 + i, 21 + i, INK, 20 - i * 2, 1);
  px(6, 4, c1, 20, 16);
  for (let i = 0; i < 7; i++) px(7 + i, 20 + i, c1, 18 - i * 2, 1);
  px(16, 4, c2, 10, 16);
  for (let i = 0; i < 7; i++) px(16, 20 + i, c2, Math.max(0, 9 - i), 1);
  px(6, 4, "#ffffff44", 20, 2);
  // chữ cái đầu
  g.font = "bold 11px 'Press Start 2P', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.fillText(short.slice(0, 2), 17, 14);
  g.fillStyle = "#ffffff";
  g.fillText(short.slice(0, 2), 16, 13);
  const url = cv.toDataURL();
  crestCache.set(key, url);
  return url;
}
