// Phát triển tuyển thủ: tập luyện hằng tuần và thay đổi theo tuổi mỗi mùa.
import type { Player, PlayerAttributes } from "./types.ts";
import type { Rng } from "./rng.ts";
import { ageOf, overallOf } from "./economy.ts";

export type AttrGroup = keyof PlayerAttributes;
export type TrainingFocus = AttrGroup | "BALANCED";

export const TRAINING_VI: Record<TrainingFocus, string> = {
  mechanics: "Kỹ năng cá nhân",
  macro: "Tư duy chiến thuật",
  teamfight: "Giao tranh",
  mental: "Tâm lý",
  BALANCED: "Cân bằng",
};

const GROUPS: AttrGroup[] = ["mechanics", "macro", "teamfight", "mental"];
const clamp = (x: number) => Math.max(1, Math.min(99, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

function addToGroup(p: Player, group: AttrGroup, delta: (attr: string) => number) {
  const g = p.attributes[group] as unknown as Record<string, number>;
  for (const k of Object.keys(g)) g[k] = round1(clamp(g[k] + delta(k)));
}

/** Khoảng còn có thể phát triển: 0 khi đã chạm trần tiềm năng. */
export const growthRoom = (p: Player) => Math.max(0, (p.potential ?? overallOf(p)) - overallOf(p));

/**
 * Một tuần tập luyện. Tuyển thủ trẻ còn nhiều tiềm năng tiến bộ nhanh hơn;
 * đã chạm trần thì chỉ duy trì.
 */
export function weeklyTraining(p: Player, focus: TrainingFocus, year: number) {
  const room = growthRoom(p);
  if (room <= 0) return;
  const youth = ageOf(p, year) <= 22 ? 1.3 : ageOf(p, year) <= 25 ? 1 : 0.5;
  const rate = Math.min(1, room / 8) * youth;
  for (const g of GROUPS) {
    const amount = focus === "BALANCED" ? 0.04 : g === focus ? 0.12 : 0.01;
    addToGroup(p, g, () => amount * rate);
  }
}

/**
 * Thay đổi cuối mùa theo tuổi (gọi 1 lần mỗi mùa).
 * <=19: tăng mạnh về phía tiềm năng; 24-25 chững lại; từ 26 kỹ năng cá nhân giảm dần, tâm lý vẫn tăng.
 * Trả về chênh lệch chỉ số tổng.
 */
export function yearlyDevelopment(p: Player, year: number, rng: Rng): number {
  const before = overallOf(p);
  const age = ageOf(p, year);
  const room = growthRoom(p);
  const share = age <= 19 ? 0.45 : age <= 21 ? 0.32 : age <= 23 ? 0.2 : age <= 25 ? 0.08 : 0;
  const decline = age <= 25 ? 0 : age <= 27 ? 0.4 : age <= 29 ? 1.1 : 1.9;
  for (const g of GROUPS) {
    const mult = g === "mechanics" ? 1.5 : g === "macro" ? 0.5 : g === "mental" ? -0.4 : 1;
    addToGroup(p, g, () => room * share - decline * mult + rng.gauss() * 0.6);
  }
  return overallOf(p) - before;
}

/** Giải nghệ: từ 30 tuổi, khả năng tăng dần khi trình độ đi xuống. */
export function shouldRetire(p: Player, year: number, rng: Rng): boolean {
  const age = ageOf(p, year);
  if (age < 30) return false;
  const ovr = overallOf(p);
  const chance = age >= 34 ? 0.7 : ovr < 78 ? 0.4 : ovr < 85 ? 0.15 : 0.05;
  return rng.chance(chance);
}
