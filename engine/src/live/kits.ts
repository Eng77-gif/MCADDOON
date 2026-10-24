// Bộ chiêu theo nhóm tướng. Tướng giữ tên thật; chiêu được mô hình hoá theo nhóm (không sao chép bộ kỹ năng gốc),
// suy ra từ hồ sơ của tướng (engage, poke, mobility...) để mỗi tướng vẫn có cảm giác riêng.
import type { Champion, Role } from "../types.ts";

export type Archetype = "TANK" | "FIGHTER" | "ASSASSIN" | "MAGE" | "MARKSMAN" | "ENCHANTER" | "CATCHER";

export const ARCHETYPE_VI: Record<Archetype, string> = {
  TANK: "Đỡ đòn", FIGHTER: "Đấu sĩ", ASSASSIN: "Sát thủ", MAGE: "Pháp sư", MARKSMAN: "Xạ thủ", ENCHANTER: "Hỗ trợ hồi máu", CATCHER: "Hỗ trợ khống chế",
};

export function archetypeOf(c: Champion, role: Role): Archetype {
  const p = c.profile;
  if (role === "SUPPORT") return p.engage >= 7 || p.pick_potential >= 8 ? "CATCHER" : "ENCHANTER";
  if (role === "ADC" && c.damage_type !== "AP") return "MARKSMAN";
  if (p.mobility >= 8 && p.pick_potential >= 8) return "ASSASSIN";
  if (role === "MID" && c.damage_type === "AP") return "MAGE";
  if (p.engage >= 8 && p.teamfight >= 7) return "TANK";
  if (c.damage_type === "AP" && (p.poke >= 5 || p.waveclear >= 7)) return "MAGE";
  if (role === "ADC") return "MAGE";
  return "FIGHTER";
}

export interface BaseStats {
  hp: number;
  power: number; // sát thương đòn đánh / chỉ số kỹ năng
  range: number;
  aspd: number; // đòn/giây
  speed: number; // đơn vị/giây
}

const BASE: Record<Archetype, BaseStats> = {
  TANK: { hp: 760, power: 40, range: 9, aspd: 0.7, speed: 12 },
  FIGHTER: { hp: 680, power: 52, range: 9, aspd: 0.8, speed: 12.5 },
  ASSASSIN: { hp: 560, power: 58, range: 9, aspd: 0.85, speed: 13.5 },
  MAGE: { hp: 520, power: 46, range: 34, aspd: 0.65, speed: 12 },
  MARKSMAN: { hp: 520, power: 50, range: 38, aspd: 0.9, speed: 12 },
  ENCHANTER: { hp: 520, power: 32, range: 32, aspd: 0.65, speed: 12 },
  CATCHER: { hp: 640, power: 34, range: 10, aspd: 0.7, speed: 12.5 },
};

/** Chỉ số theo cấp độ và số vàng đã tiêu (trang bị) */
export function statsAt(a: Archetype, level: number, itemGold: number): BaseStats {
  const b = BASE[a];
  const items = itemGold / 1000;
  const hpPerItem = a === "TANK" || a === "CATCHER" ? 110 : a === "FIGHTER" ? 85 : 55;
  const powPerItem = a === "TANK" || a === "CATCHER" || a === "ENCHANTER" ? 8 : a === "MARKSMAN" ? 18 : 15;
  return {
    hp: b.hp + (level - 1) * 100 + items * hpPerItem * 1.3,
    power: b.power + (level - 1) * 3.5 + items * powPerItem,
    range: b.range,
    aspd: Math.min(2.2, b.aspd * (1 + (level - 1) * 0.02 + (a === "MARKSMAN" ? items * 0.07 : items * 0.025))),
    speed: b.speed,
  };
}

export interface SkillSpec {
  name: string;
  cooldown: number; // giây mô phỏng
  range: number;
  /** cần trúng đích (skillshot) => chịu ảnh hưởng độ chính xác & né tránh */
  skillshot: boolean;
}

export const SKILLS: Record<Archetype, { skill: SkillSpec; ult: SkillSpec }> = {
  TANK: { skill: { name: "Lao vào khống chế", cooldown: 9, range: 22, skillshot: false }, ult: { name: "Mở giao tranh diện rộng", cooldown: 55, range: 24, skillshot: false } },
  FIGHTER: { skill: { name: "Chém hút máu", cooldown: 6, range: 14, skillshot: false }, ult: { name: "Cuồng nộ", cooldown: 50, range: 14, skillshot: false } },
  ASSASSIN: { skill: { name: "Lướt chém", cooldown: 7, range: 24, skillshot: false }, ult: { name: "Kết liễu", cooldown: 45, range: 22, skillshot: false } },
  MAGE: { skill: { name: "Phép định hướng", cooldown: 6, range: 38, skillshot: true }, ult: { name: "Đại phép diện rộng", cooldown: 50, range: 38, skillshot: true } },
  MARKSMAN: { skill: { name: "Xả đạn", cooldown: 9, range: 38, skillshot: false }, ult: { name: "Phát bắn xuyên bản đồ", cooldown: 50, range: 70, skillshot: true } },
  ENCHANTER: { skill: { name: "Hồi máu / lá chắn", cooldown: 8, range: 34, skillshot: false }, ult: { name: "Hồi máu toàn đội", cooldown: 60, range: 30, skillshot: false } },
  CATCHER: { skill: { name: "Móc / choáng", cooldown: 9, range: 30, skillshot: true }, ult: { name: "Hất tung diện rộng", cooldown: 55, range: 20, skillshot: false } },
};

/** Sức mạnh theo giai đoạn trận của tướng: hồ sơ 0..10 => 0.85..1.15 */
export function phaseMult(c: Champion, displayMinute: number): number {
  const v = displayMinute < 14 ? c.profile.early_power : displayMinute < 26 ? c.profile.mid_power : c.profile.late_power;
  return 0.85 + 0.03 * v;
}
