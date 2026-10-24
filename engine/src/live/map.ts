// Bản đồ 3 đường thu nhỏ (200x200 đơn vị, trục y hướng xuống).
// Đội xanh (0) ở góc dưới-trái, đội đỏ (1) ở góc trên-phải; sông chạy chéo từ trên-trái xuống dưới-phải.

export type Vec = { x: number; y: number };
export type Lane = "TOP" | "MID" | "BOT";
export const LANES: readonly Lane[] = ["TOP", "MID", "BOT"];
export const MAP_SIZE = 200;

export const NEXUS: [Vec, Vec] = [{ x: 22, y: 178 }, { x: 178, y: 22 }];
export const FOUNTAIN: [Vec, Vec] = [{ x: 10, y: 190 }, { x: 190, y: 10 }];

/** Đường đi từ nhà xanh tới nhà đỏ */
export const LANE_PATHS: Record<Lane, Vec[]> = {
  TOP: [NEXUS[0], { x: 20, y: 100 }, { x: 22, y: 22 }, { x: 100, y: 20 }, NEXUS[1]],
  MID: [NEXUS[0], { x: 100, y: 100 }, NEXUS[1]],
  BOT: [NEXUS[0], { x: 100, y: 180 }, { x: 178, y: 178 }, { x: 180, y: 100 }, NEXUS[1]],
};

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(p: Vec[]) {
  let len = 0;
  for (let i = 1; i < p.length; i++) len += dist(p[i - 1], p[i]);
  return len;
}

/** Điểm tại tỉ lệ t (0 = nhà xanh, 1 = nhà đỏ) trên đường. */
export function lanePoint(lane: Lane, t: number): Vec {
  const p = LANE_PATHS[lane];
  let remain = Math.max(0, Math.min(1, t)) * pathLength(p);
  for (let i = 1; i < p.length; i++) {
    const seg = dist(p[i - 1], p[i]);
    if (remain <= seg) {
      const k = seg === 0 ? 0 : remain / seg;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k };
    }
    remain -= seg;
  }
  return { ...p[p.length - 1] };
}

/** Tỉ lệ t gần nhất của một điểm trên đường (dò thô 100 mẫu, đủ cho AI). */
export function laneProgress(lane: Lane, v: Vec): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i <= 100; i++) {
    const d = dist(lanePoint(lane, i / 100), v);
    if (d < bd) (bd = d), (best = i / 100);
  }
  return best;
}

/** Điểm t tính từ nhà của `side` (0 = nhà mình). */
export const lanePointFor = (lane: Lane, side: 0 | 1, t: number) => lanePoint(lane, side === 0 ? t : 1 - t);

export type TowerTier = "OUTER" | "INNER" | "INHIB" | "NEXUS";
export interface TowerSpec { side: 0 | 1; lane?: Lane; tier: TowerTier; pos: Vec; hp: number }

const TIER_T: Record<Exclude<TowerTier, "NEXUS">, number> = { OUTER: 0.36, INNER: 0.25, INHIB: 0.14 };
const TIER_HP: Record<TowerTier, number> = { OUTER: 1600, INNER: 1900, INHIB: 2200, NEXUS: 2000 };

export function towerSpecs(): TowerSpec[] {
  const out: TowerSpec[] = [];
  for (const side of [0, 1] as const) {
    for (const lane of LANES)
      for (const tier of ["OUTER", "INNER", "INHIB"] as const)
        out.push({ side, lane, tier, pos: lanePointFor(lane, side, TIER_T[tier]), hp: TIER_HP[tier] });
    const n = NEXUS[side];
    const s = side === 0 ? 1 : -1;
    out.push({ side, tier: "NEXUS", pos: { x: n.x + 9 * s, y: n.y - 3 * s }, hp: TIER_HP.NEXUS });
    out.push({ side, tier: "NEXUS", pos: { x: n.x + 3 * s, y: n.y - 9 * s }, hp: TIER_HP.NEXUS });
  }
  return out;
}

/** Bãi quái rừng: 3 bãi mỗi bên */
export const CAMPS: { side: 0 | 1; pos: Vec }[] = [
  { side: 0, pos: { x: 52, y: 122 } }, { side: 0, pos: { x: 80, y: 150 } }, { side: 0, pos: { x: 40, y: 148 } },
  { side: 1, pos: { x: 148, y: 78 } }, { side: 1, pos: { x: 120, y: 50 } }, { side: 1, pos: { x: 160, y: 52 } },
];

export const DRAGON_PIT: Vec = { x: 132, y: 132 };
export const BARON_PIT: Vec = { x: 68, y: 68 };
