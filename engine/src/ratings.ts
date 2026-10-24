// Chuyển chỉ số gốc + trạng thái + tướng thành "sức mạnh theo giai đoạn" của một tuyển thủ.
import type { Champion, MatchContext, Phase, Player } from "./types.ts";

const avg = (o: Record<string, number>) => {
  const v = Object.values(o);
  return v.reduce((a, b) => a + b, 0) / v.length;
};

/** Hệ số trạng thái (docs/01 §1): form, morale, mệt mỏi, áp lực trận lớn. */
export function conditionFactor(p: Player, ctx: MatchContext): number {
  const { form, morale, fatigue } = p.dynamic_state;
  const pressure = 1 - (1 - p.attributes.mental.big_match / 100) * ctx.stagePressure;
  return (1 + 0.02 * form) * (1 + 0.01 * morale) * (1 - 0.004 * Math.max(0, fatigue - 40)) * pressure;
}

export function masteryOf(p: Player, championId: string): number {
  return p.champion_pool.find((e) => e.champion_id === championId)?.mastery ?? 40;
}

/** Mastery 100 => x1.10, 70 => x1.01, 40 (ngoài bể tướng) => x0.92 */
export const masteryFactor = (mastery: number) => 0.8 + 0.003 * mastery;

/** Sức mạnh tướng ở giai đoạn: profile 0 => x0.85, 5 => x1.0, 10 => x1.15 */
export function championPhaseFactor(c: Champion, phase: Phase): number {
  const v = phase === "EARLY" ? c.profile.early_power : phase === "MID" ? c.profile.mid_power : c.profile.late_power;
  return 0.85 + 0.03 * v;
}

/** Điểm kỹ năng thuần (1-100) của tuyển thủ ở từng giai đoạn, chưa tính tướng. */
export function skillForPhase(p: Player, phase: Phase): number {
  const a = p.attributes;
  const mech = avg(a.mechanics);
  const macro = avg(a.macro);
  const tf = avg(a.teamfight);
  switch (phase) {
    case "EARLY":
      return 0.5 * a.mechanics.laning + 0.3 * mech + 0.2 * a.mechanics.cs_efficiency;
    case "MID":
      return 0.35 * macro + 0.35 * tf + 0.3 * mech;
    case "LATE":
      return 0.45 * tf + 0.25 * macro + 0.3 * a.mental.composure;
  }
}

export function playerPhaseRating(p: Player, c: Champion, phase: Phase, ctx: MatchContext): number {
  return (
    skillForPhase(p, phase) *
    conditionFactor(p, ctx) *
    masteryFactor(masteryOf(p, c.id)) *
    championPhaseFactor(c, phase)
  );
}

/** Độ ổn định: consistency thấp => biên độ ngẫu nhiên lớn hơn (dùng làm độ lệch chuẩn). */
export const volatility = (p: Player) => 0.04 + (100 - p.attributes.mental.consistency) * 0.0008;
