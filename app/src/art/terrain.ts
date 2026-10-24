// Vẽ trước toàn bộ bản đồ thành một ảnh lớn (ô 4x4 đơn vị, mỗi ô là 8x8 "điểm ảnh" pixel art).
// Phân loại ô: đường lát đá, sông, hang quái, nền nhà, rừng rậm (tường cây), cỏ.
import { BARON_PIT, CAMPS, DRAGON_PIT, LANE_PATHS, MAP_SIZE, NEXUS, type Vec } from "../../../engine/src/index.ts";

export const PPU = 6; // điểm ảnh màn hình trên mỗi đơn vị bản đồ (trước khi zoom)
const TILE = 4; // đơn vị / ô
const ART = 8; // điểm ảnh nghệ thuật / cạnh ô
const AP = (TILE * PPU) / ART; // kích thước 1 điểm ảnh nghệ thuật = 3px

type Kind = "path" | "water" | "pit" | "base0" | "base1" | "wall" | "grass";

function segDist(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function laneDist(p: Vec) {
  let d = Infinity;
  for (const path of Object.values(LANE_PATHS)) for (let i = 1; i < path.length; i++) d = Math.min(d, segDist(p, path[i - 1], path[i]));
  return d;
}

function rnd(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nhiễu mượt (giá trị theo lưới thô 3 ô, nội suy) để rừng thành từng mảng */
function blob(x: number, y: number) {
  const gx = x / 3;
  const gy = y / 3;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const v = (a: number, b: number) => rnd(a, b, 7);
  const top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
  const bot = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bot * fy;
}

export function tileKind(tx: number, ty: number): Kind {
  const p = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  const ld = laneDist(p);
  if (ld < 5.5) return "path";
  if (Math.hypot(p.x - NEXUS[0].x, p.y - NEXUS[0].y) < 26) return "base0";
  if (Math.hypot(p.x - NEXUS[1].x, p.y - NEXUS[1].y) < 26) return "base1";
  if (Math.hypot(p.x - DRAGON_PIT.x, p.y - DRAGON_PIT.y) < 10 || Math.hypot(p.x - BARON_PIT.x, p.y - BARON_PIT.y) < 11) return "pit";
  if (Math.abs(p.x - p.y) < 8) return "water";
  if (p.x < 6 || p.y < 6 || p.x > MAP_SIZE - 6 || p.y > MAP_SIZE - 6) return "wall";
  const nearCamp = CAMPS.some((c) => Math.hypot(c.pos.x - p.x, c.pos.y - p.y) < 9);
  if (!nearCamp && ld > 10 && Math.abs(p.x - p.y) > 13 && blob(tx, ty) > 0.52) return "wall";
  return "grass";
}

const PAL = {
  grass: ["#2f5a34", "#356640", "#2a5230", "#3d7246"],
  wall: ["#173322", "#1e4029", "#122a1c", "#2a5233"],
  path: ["#8d7a5c", "#9c8866", "#7d6b50", "#a99573"],
  water: ["#2c5d8f", "#336aa1", "#28537f", "#4f8fc9"],
  pit: ["#4a3a2c", "#56442f", "#3e3125", "#64503a"],
  base0: ["#3a4a6a", "#435577", "#33425e", "#52669a"],
  base1: ["#6a3a44", "#774450", "#5e333c", "#9a5262"],
};

export function renderTerrain(): HTMLCanvasElement {
  const size = MAP_SIZE * PPU;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  const n = MAP_SIZE / TILE;
  const kinds: Kind[][] = [];
  for (let ty = 0; ty < n; ty++) {
    kinds[ty] = [];
    for (let tx = 0; tx < n; tx++) kinds[ty][tx] = tileKind(tx, ty);
  }
  const px = (tx: number, ty: number, ax: number, ay: number, c: string, w = 1, h = 1) => {
    g.fillStyle = c;
    g.fillRect(tx * TILE * PPU + ax * AP, ty * TILE * PPU + ay * AP, w * AP, h * AP);
  };

  for (let ty = 0; ty < n; ty++)
    for (let tx = 0; tx < n; tx++) {
      const k = kinds[ty][tx];
      const pal = k === "base0" || k === "base1" ? PAL[k] : PAL[k];
      px(tx, ty, 0, 0, pal[0], ART, ART);
      // hoạ tiết theo loại ô
      for (let i = 0; i < 10; i++) {
        const ax = Math.floor(rnd(tx, ty, i) * ART);
        const ay = Math.floor(rnd(ty, tx, i + 31) * ART);
        px(tx, ty, ax, ay, pal[1 + (i % 3)]);
      }
      if (k === "path" || k === "base0" || k === "base1") {
        // đá lát: viền gạch
        if ((tx + ty) % 2 === 0) px(tx, ty, 0, 0, pal[2], ART, 1);
        px(tx, ty, 0, 0, pal[2], 1, ART);
      }
      if (k === "water") {
        const w = Math.floor(rnd(tx, ty, 99) * 5);
        px(tx, ty, w, 3, "#7fb6e6", 3, 1);
        px(tx, ty, (w + 4) % 6, 6, "#5b9ad6", 2, 1);
      }
      if (k === "wall") {
        // tán cây: chấm sáng phía trên, bóng đổ xuống ô dưới nếu ô dưới không phải tường
        px(tx, ty, 1, 1, "#2f6a3a", 3, 2);
        px(tx, ty, 5, 3, "#2f6a3a", 2, 2);
        px(tx, ty, 2, 1, "#4c8a4f", 1, 1);
        px(tx, ty, 5, 3, "#4c8a4f", 1, 1);
        if (ty + 1 < n && kinds[ty + 1][tx] !== "wall") px(tx, ty, 0, 6, "#0c1d12", ART, 2);
      }
      if (k === "grass" && rnd(tx, ty, 5) > 0.85) {
        // hoa / bụi cỏ nhỏ
        px(tx, ty, 3, 4, "#6fae5a", 1, 1);
        px(tx, ty, 4, 3, "#e8d36a", 1, 1);
      }
    }
  return cv;
}
