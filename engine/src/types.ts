// Kiểu dữ liệu dùng chung cho toàn bộ engine. Khớp với docs/01 và data/packs/*.

export type Role = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
export const ROLES: readonly Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export type Tier = "S" | "A" | "B" | "C" | "D";
export type Tactic = "TEAMFIGHT" | "SPLIT_1_4" | "POKE" | "PICK_OFF";

export interface ChampionProfile {
  early_power: number;
  mid_power: number;
  late_power: number;
  engage: number;
  disengage: number;
  pick_potential: number;
  poke: number;
  teamfight: number;
  split_push: number;
  waveclear: number;
  mobility: number;
  objective_dps: number;
}

export interface Champion {
  id: string;
  name: string;
  roles: Role[];
  damage_type: "AD" | "AP" | "MIXED";
  profile: ChampionProfile;
  patch_stats: Record<string, { tier: Tier }>;
  matchups: Record<string, number>;
  synergies: Record<string, number>;
}

export interface PlayerAttributes {
  mechanics: { laning: number; cs_efficiency: number; mechanical_outplay: number; skillshot_accuracy: number };
  macro: { map_awareness: number; vision_control: number; objective_control: number; rotation: number };
  teamfight: { positioning: number; target_selection: number; engage_timing: number; synergy_communication: number };
  mental: { composure: number; consistency: number; big_match: number; leadership: number; tilt_resistance: number };
}

export interface PoolEntry {
  champion_id: string;
  mastery: number;
  is_signature?: boolean;
}

export interface Player {
  id: string;
  ign: string;
  role: Role;
  nationality?: string;
  /** false = dữ liệu roster chưa xác minh được từ nguồn tin */
  verified?: boolean;
  attributes: PlayerAttributes;
  dynamic_state: { form: number; morale: number; fatigue: number };
  champion_pool: PoolEntry[];
  /** Năm sinh (dữ liệu thật hoặc ước lượng) */
  birthYear?: number;
  /** Trần chỉ số ẩn (1-99). Người chơi chỉ thấy ước lượng qua tuyển trạch. */
  potential?: number;
  contract?: Contract;
}

export interface Contract {
  /** Lương tháng (USD) */
  salary: number;
  /** Hợp đồng hết hạn sau mùa giải năm này */
  until: number;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  league?: string;
  /** Hạt giống CKTG, ví dụ "LCK1" */
  worldsSeed?: string;
  verified?: boolean;
  roster: Record<Role, Player>;
  /** Dự bị / học viện (tối đa 3) */
  bench?: Player[];
  /** Màu áo [chính, phụ] dạng hex, dùng cho avatar pixel */
  colors?: [string, string];
}

export interface League {
  id: string;
  name: string;
  region: string;
  /** 0 = quốc tế, 1 = giải quốc nội hàng đầu, 2 = giải hạng dưới */
  tier: number;
  feedsInto?: string;
}

export type Picks = Record<Role, string>;

// ---- Chỉ đạo của HLV (áp dụng cho từng giai đoạn) ----
export type LaneFocus = "TOP" | "MID" | "BOT" | "NONE";
export type ObjectiveFocus = "DRAGON" | "HERALD_BARON" | "BALANCED";
export type Risk = "SAFE" | "NORMAL" | "AGGRESSIVE";

export interface CoachOrders {
  laneFocus: LaneFocus;
  objective: ObjectiveFocus;
  risk: Risk;
}

export type Phase = "EARLY" | "MID" | "LATE";

export interface MatchContext {
  patch: string;
  /** 0 (vòng bảng) .. 0.3 (chung kết CKTG) — kích hoạt chỉ số big_match */
  stagePressure: number;
  seed: number;
}

export interface TeamSetup {
  team: Team;
  picks: Picks;
  tactic: Tactic;
  /** Chỉ đạo mặc định; có thể đổi giữa các giai đoạn qua callback */
  orders: CoachOrders;
}
