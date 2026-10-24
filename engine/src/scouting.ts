// Tuyển trạch: sinh thần đồng rank Thách Đấu (nhân vật hư cấu), báo cáo tiềm năng theo độ hiểu biết.
import { ROLES, type Player, type Role } from "./types.ts";
import type { ChampionDb } from "./draft.ts";
import type { Rng } from "./rng.ts";
import { monthlySalary } from "./economy.ts";

export interface Prospect {
  player: Player;
  region: string;
  /** 0..100: càng cao, ước lượng tiềm năng càng chính xác */
  knowledge: number;
  /** Rank đơn trên máy chủ (LP), cho cảm giác "thần đồng solo queue" */
  soloLp: number;
}

export const SCOUT_REGIONS: Record<string, string> = { KR: "Hàn Quốc", CN: "Trung Quốc", VN: "Việt Nam", EU: "Châu Âu", NA: "Bắc Mỹ", BR: "Brazil", TW: "Đài Loan" };

const SYL = ["ka", "zen", "ri", "mo", "vex", "lu", "ta", "shi", "no", "rae", "kyo", "dan", "fi", "ro", "jin", "sol", "ae", "ky", "tor", "min", "hy", "zu", "pe", "ren", "lix", "bo", "qi", "an", "ver", "yu"];

function makeIgn(rng: Rng, taken: Set<string>): string {
  for (;;) {
    const n = 2 + (rng.chance(0.3) ? 1 : 0);
    let s = "";
    for (let i = 0; i < n; i++) s += SYL[Math.floor(rng.next() * SYL.length)];
    if (rng.chance(0.15)) s += Math.floor(rng.next() * 99);
    const ign = s[0].toUpperCase() + s.slice(1);
    if (!taken.has(ign.toLowerCase())) {
      taken.add(ign.toLowerCase());
      return ign;
    }
  }
}

/** Tạo một tuyển thủ mới với chỉ số quanh `ovr`. Dùng cho thần đồng và tuyển thủ thay thế (regen). */
export function generatePlayer(
  db: ChampionDb, rng: Rng, opts: { id: string; ign: string; role: Role; ovr: number; potential: number; birthYear: number; nationality?: string; year: number },
): Player {
  const v = (base: number) => Math.max(1, Math.min(99, Math.round((base + rng.gauss() * 3) * 10) / 10));
  const style = { laning: rng.gauss() * 3, mech: rng.gauss() * 3, macro: rng.gauss() * 3 - 2, tf: rng.gauss() * 3, mental: rng.gauss() * 3 - 3 };
  const o = opts.ovr;
  const pool = Object.values(db)
    .filter((c) => c.roles.includes(opts.role))
    .map((c) => ({ champion_id: c.id, mastery: Math.max(20, Math.min(99, Math.round(48 + (o - 70) * 0.9 + rng.gauss() * 10))) }))
    .sort((a, b) => b.mastery - a.mastery);
  if (pool[0]) Object.assign(pool[0], { mastery: Math.min(99, pool[0].mastery + 12), is_signature: true });
  return {
    id: opts.id,
    ign: opts.ign,
    role: opts.role,
    ...(opts.nationality ? { nationality: opts.nationality } : {}),
    verified: true,
    attributes: {
      mechanics: { laning: v(o + style.laning), cs_efficiency: v(o + style.laning), mechanical_outplay: v(o + style.mech), skillshot_accuracy: v(o + style.mech) },
      macro: { map_awareness: v(o + style.macro), vision_control: v(o + style.macro), objective_control: v(o + style.macro), rotation: v(o + style.macro) },
      teamfight: { positioning: v(o + style.tf), target_selection: v(o + style.tf), engage_timing: v(o + style.tf), synergy_communication: v(o + style.tf) },
      mental: { composure: v(o + style.mental), consistency: v(o + style.mental), big_match: v(o + style.mental), leadership: v(o + style.mental - 6), tilt_resistance: v(o + style.mental) },
    },
    dynamic_state: { form: 0, morale: 0, fatigue: 20 },
    champion_pool: pool,
    birthYear: opts.birthYear,
    potential: opts.potential,
    contract: { salary: monthlySalary(o), until: opts.year + 1 },
  };
}

/** Lứa thần đồng mới mỗi mùa. Phần lớn tiềm năng 72-85, hiếm hoi mới có "quái vật" 90+. */
export function generateProspects(db: ChampionDb, year: number, rng: Rng, count: number, takenNames: Set<string>): Prospect[] {
  const regions = Object.keys(SCOUT_REGIONS);
  return Array.from({ length: count }, (_, i) => {
    const age = 16 + Math.floor(rng.next() * 3);
    const roll = rng.next();
    const potential = Math.round(roll > 0.96 ? 91 + rng.next() * 6 : roll > 0.8 ? 85 + rng.next() * 6 : 72 + rng.next() * 13);
    const ovr = Math.round(potential - 12 - rng.next() * 10 + (age - 16) * 2);
    const region = regions[Math.floor(rng.next() * regions.length)];
    const role = ROLES[Math.floor(rng.next() * ROLES.length)];
    const player = generatePlayer(db, rng, {
      id: `P${year}_${i}`, ign: makeIgn(rng, takenNames), role, ovr, potential, birthYear: year - age, nationality: region, year,
    });
    player.contract = undefined; // chưa ký với CLB nào
    return { player, region, knowledge: 0, soloLp: Math.round(800 + (ovr - 55) * 60 + rng.next() * 300) };
  });
}

export function generateIgn(rng: Rng, takenNames: Set<string>) {
  return makeIgn(rng, takenNames);
}

/**
 * Ước lượng tiềm năng hiển thị cho người chơi: khoảng rộng ±15 khi chưa biết gì, co về đúng giá trị khi knowledge = 100.
 * Lệch trái/phải cố định theo id để mỗi lần xem không nhảy số.
 */
export function potentialRange(p: Player, knowledge: number): [number, number] {
  const truth = p.potential ?? 70;
  const err = 15 * (1 - Math.min(100, knowledge) / 100);
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const skew = (h % 100) / 100; // 0..1
  return [Math.max(40, Math.round(truth - err * skew)), Math.min(99, Math.round(truth + err * (1 - skew)))];
}

/** Một lần cử tuyển trạch viên đi xem: trình độ tuyển trạch 1..5 quyết định lượng thông tin thu được. */
export const scoutGain = (scoutLevel: number) => 15 + scoutLevel * 7;
