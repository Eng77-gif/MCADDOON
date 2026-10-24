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
  attributes: PlayerAttributes;
  dynamic_state: { form: number; morale: number; fatigue: number };
  champion_pool: PoolEntry[];
}

export interface Team {
  id: string;
  name: string;
  short: string;
  roster: Record<Role, Player>;
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
