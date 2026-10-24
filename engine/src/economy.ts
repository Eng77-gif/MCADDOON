// Chỉ số tổng, lương, giá trị chuyển nhượng. Dùng chung cho pack, career, market.
import { ROLES, type Player, type Role, type Team } from "./types.ts";

/** Chỉ số tổng = trung bình mọi chỉ số chi tiết */
export function overallOf(p: Player): number {
  const vals = (Object.values(p.attributes) as Record<string, number>[]).flatMap((g) => Object.values(g));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export const playerOverall = (t: Team, role: Role) => Math.round(overallOf(t.roster[role]));

export function teamStrength(t: Team): number {
  return ROLES.reduce((s, r) => s + overallOf(t.roster[r]), 0) / ROLES.length;
}

/** Lương tháng thị trường (USD) theo trình độ: 70 => ~3.4k, 80 => ~11k, 90 => ~39k */
export const monthlySalary = (ovr: number) => Math.round((1000 * Math.pow(1.13, ovr - 60)) / 100) * 100;

export const salaryOf = (p: Player) => p.contract?.salary ?? monthlySalary(overallOf(p));

export const teamPlayers = (t: Team): Player[] => [...ROLES.map((r) => t.roster[r]), ...(t.bench ?? [])];

export const teamWagesPerMonth = (t: Team) => teamPlayers(t).reduce((s, p) => s + salaryOf(p), 0);

export const ageOf = (p: Player, year: number) => year - (p.birthYear ?? year - 22);

/**
 * Giá trị chuyển nhượng (USD): tăng theo trình độ, cộng thêm cho tuổi trẻ còn tiềm năng.
 * 70 => ~66k, 80 => ~290k, 90 => ~1.3M
 */
export function playerValue(p: Player, year: number): number {
  const ovr = overallOf(p);
  const age = ageOf(p, year);
  const ageFactor = age <= 19 ? 1.6 : age <= 22 ? 1.3 : age <= 25 ? 1 : age <= 28 ? 0.75 : 0.5;
  const upside = Math.max(0, (p.potential ?? ovr) - ovr);
  const v = 15000 * Math.pow(1.16, ovr - 60) * ageFactor * (1 + upside * 0.04);
  return Math.round(v / 1000) * 1000;
}

/** Phí giải phóng hợp đồng: giá trị × (1 + 25% mỗi năm hợp đồng còn lại). Hết hạn => 0. */
export function releaseFee(p: Player, year: number): number {
  const left = Math.max(0, (p.contract?.until ?? year) - year);
  return left === 0 ? 0 : Math.round(playerValue(p, year) * (1 + 0.25 * left));
}
