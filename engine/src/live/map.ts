// Bản đồ 3 đường (200x200 đơn vị mô phỏng, trục y hướng xuống), lấy theo model 3D Summoner's Rift
// (data/map3d/map_data.json, toạ độ model -96..96, y hướng lên, bắc = -z). Đổi: x = (mx + 96)·200/192, y = (mz + 96)·200/192.
// Đội xanh (0) ở góc dưới-trái, đội đỏ (1) ở góc trên-phải; sông chạy chéo từ trên-trái xuống dưới-phải.
import mapData from "../../../data/map3d/map_data.json" with { type: "json" };

export type Vec = { x: number; y: number };
export type Lane = "TOP" | "MID" | "BOT";
export const LANES: readonly Lane[] = ["TOP", "MID", "BOT"];
export const MAP_SIZE = 200;
const SCALE = MAP_SIZE / 192;

/** Toạ độ model 3D [x, y, z] → toạ độ mô phỏng */
export const fromModel = (m: number[]): Vec => ({ x: (m[0] + 96) * SCALE, y: (m[2] + 96) * SCALE });
/** Toạ độ mô phỏng → model 3D (x, z) */
export const toModel = (v: Vec) => ({ x: v.x / SCALE - 96, z: v.y / SCALE - 96 });

type Structure = { node: string; kind: string; team: string; model_pos: number[] };
const structures = mapData.structures as Structure[];
const nexusOf = (team: string) => fromModel(structures.find((s) => s.kind === "Nexus" && s.team === team)!.model_pos);

export const NEXUS: [Vec, Vec] = [nexusOf("Blue"), nexusOf("Red")];
export const FOUNTAIN: [Vec, Vec] = [fromModel(mapData.fountains.Blue), fromModel(mapData.fountains.Red)];

/** Đường đi từ nhà xanh tới nhà đỏ (đường thật trên bản đồ, dùng chung cho cả hai phe) */
const lanePath = (key: "Top" | "Mid" | "Bot"): Vec[] => [NEXUS[0], ...mapData.lanes[key].model.map(fromModel), NEXUS[1]];
export const LANE_PATHS: Record<Lane, Vec[]> = { TOP: lanePath("Top"), MID: lanePath("Mid"), BOT: lanePath("Bot") };

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
export interface TowerSpec { side: 0 | 1; lane?: Lane; tier: TowerTier; pos: Vec; hp: number; node: string }

const TIER_HP: Record<TowerTier, number> = { OUTER: 1600, INNER: 1900, INHIB: 2200, NEXUS: 2000 };
const TIER_OF: Record<string, TowerTier> = { Outer: "OUTER", Inner: "INNER", Inhibitor: "INHIB", Top: "NEXUS", Bot: "NEXUS" };

/**
 * Đường thật của một công trình. File 3D đặt tên đường phe Đỏ theo đối xứng tâm
 * (Turret_Red_Top_* nằm trên đường dưới thật), nên đổi Top <-> Bot cho phe Đỏ.
 */
function physicalLane(team: string, lane: string): Lane {
  const l = lane.toUpperCase() as Lane;
  if (team !== "Red" || l === "MID") return l;
  return l === "TOP" ? "BOT" : "TOP";
}

export function towerSpecs(): TowerSpec[] {
  return structures
    .filter((s) => s.kind === "Turret")
    .map((s) => {
      const [, team, a, b] = s.node.split("_"); // Turret_Blue_Top_Outer | Turret_Blue_Nexus_Top
      const side = team === "Blue" ? 0 : 1;
      const tier = a === "Nexus" ? "NEXUS" : TIER_OF[b];
      return { side, ...(a === "Nexus" ? {} : { lane: physicalLane(team, a) }), tier, pos: fromModel(s.model_pos), hp: TIER_HP[tier], node: s.node };
    });
}

/** Nhà lính theo đường thật: ẩn khi trụ nhà lính của đường đó vỡ */
export const INHIBITORS: { side: 0 | 1; lane: Lane; node: string; pos: Vec }[] = structures
  .filter((s) => s.kind === "Inhibitor")
  .map((s) => {
    const [, team, lane] = s.node.split("_");
    return { side: team === "Blue" ? 0 : 1, lane: physicalLane(team, lane), node: s.node, pos: fromModel(s.model_pos) };
  });

export const NEXUS_NODES: [string, string] = ["Nexus_Blue", "Nexus_Red"];

/** Bãi quái rừng: 6 bãi mỗi bên */
export const CAMPS: { side: 0 | 1; pos: Vec; name: string }[] = mapData.jungle_camps.map((c) => ({
  side: c.side === "Blue" ? 0 : 1,
  pos: fromModel(c.model_pos),
  name: c.name,
}));

export const DRAGON_PIT: Vec = fromModel(mapData.objectives.Dragon_Pit.model_pos);
export const BARON_PIT: Vec = fromModel(mapData.objectives.Baron_Pit.model_pos);
