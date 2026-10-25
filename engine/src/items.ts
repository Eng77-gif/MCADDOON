// Trang bị: dữ liệu Riot (data/lol/items.json -> data/packs/<pack>/csv/items.csv qua engine/tools/import-lol-items.ts), lộ trình lên đồ của AI, mua theo công thức ghép, cộng chỉ số.
import type { Champion, Role } from "./types.ts";
import type { Archetype } from "./live/kits.ts";

export type ItemTier = "STARTER" | "SUPPORT" | "BOOTS" | "BASIC" | "EPIC" | "LEGENDARY";

export interface ItemStats {
  ad: number;
  ap: number;
  hp: number;
  armor: number;
  mr: number;
  as: number; // % tốc đánh
  crit: number; // % chí mạng
  ah: number; // điểm hồi kỹ năng
  ms: number; // tốc chạy cộng thẳng (giày)
  msPct: number;
  lethality: number;
  armorPen: number; // %
  magicPen: number; // xuyên phép cộng thẳng
  magicPenPct: number;
  lifesteal: number; // %
  omnivamp: number; // %
  mana: number;
  hsp: number; // % sức mạnh hồi máu/khiên
}

export const STAT_KEYS: (keyof ItemStats)[] = [
  "ad", "ap", "hp", "armor", "mr", "as", "crit", "ah", "ms", "msPct", "lethality", "armorPen", "magicPen", "magicPenPct", "lifesteal", "omnivamp", "mana", "hsp",
];

export const STAT_VI: Record<keyof ItemStats, string> = {
  ad: "Sức mạnh công kích", ap: "Sức mạnh phép thuật", hp: "Máu", armor: "Giáp", mr: "Kháng phép", as: "% Tốc độ đánh",
  crit: "% Tỉ lệ chí mạng", ah: "Điểm hồi kỹ năng", ms: "Tốc độ di chuyển", msPct: "% Tốc độ di chuyển", lethality: "Sát lực",
  armorPen: "% Xuyên giáp", magicPen: "Xuyên kháng phép", magicPenPct: "% Xuyên kháng phép", lifesteal: "% Hút máu",
  omnivamp: "% Hút máu toàn phần", mana: "Năng lượng", hsp: "% Sức mạnh hồi máu & lá chắn",
};

export interface Item {
  id: string;
  name: string;
  nameVi?: string;
  tier: ItemTier;
  cost: number;
  from: string[];
  stats: Partial<ItemStats>;
  /** Hiệu ứng engine hiểu được, ví dụ { GRIEVOUS: 1, LIFELINE: 0.3, ONHIT: 30 } */
  tags: Record<string, number>;
  passive?: string;
  /** Mã món của Riot: ảnh ở data/lol/img/items/<icon>.png */
  icon?: string;
}

export type ItemDb = Record<string, Item>;

export const itemName = (it: Item) => it.nameVi || it.name;

/** Các món ghép được từ món này */
export function buildsInto(db: ItemDb, id: string): Item[] {
  return Object.values(db).filter((it) => it.from.includes(id));
}

// ------------------------------------------------------------------ Lộ trình lên đồ
export type BuildStyle = "BALANCED" | "DAMAGE" | "DEFENSE";
export const BUILD_STYLE_VI: Record<BuildStyle, string> = { BALANCED: "Cân bằng", DAMAGE: "Dồn sát thương", DEFENSE: "Ưu tiên chống chịu" };

export interface EnemyInfo { arch: Archetype; damage: Champion["damage_type"] }

export interface BuildPlan {
  start: string[];
  /** Thứ tự món lớn cần hoàn thành: giày nằm ở vị trí thứ 2 */
  core: string[];
}

const pick = <T>(arr: T[], seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
};

/**
 * AI chọn đồ theo nhóm tướng, kiểu sát thương và đội hình đối phương:
 * nhiều sát thương vật lý => giáp/Giày Thép Gai; nhiều phép => kháng phép/Giày Thủy Ngân;
 * đối phương có hồi máu => đồ vết thương sâu; đối phương nhiều đỡ đòn => xuyên giáp/xuyên phép.
 */
export function planBuild(champ: Champion, role: Role, arch: Archetype, enemies: EnemyInfo[], style: BuildStyle = "BALANCED"): BuildPlan {
  const ad = enemies.filter((e) => e.damage === "AD").length;
  const ap = enemies.filter((e) => e.damage === "AP").length;
  const healers = enemies.filter((e) => e.arch === "ENCHANTER" || e.arch === "FIGHTER").length >= 2;
  const tanks = enemies.filter((e) => e.arch === "TANK" || e.arch === "CATCHER" || e.arch === "FIGHTER").length >= 3;
  const tankBoots = ap > ad ? "MERCURYS_TREADS" : "PLATED_STEELCAPS";
  const apChamp = champ.damage_type === "AP";
  const s = champ.id;

  let start: string[];
  if (role === "SUPPORT") start = ["WORLD_ATLAS"];
  else if (role === "JUNGLE") start = [arch === "TANK" ? "MOSSTOMPER" : arch === "ASSASSIN" ? "SCORCHCLAW" : "GUSTWALKER"];
  else if (apChamp) start = ["DORANS_RING"];
  else if (arch === "TANK" || arch === "FIGHTER") start = ["DORANS_SHIELD"];
  else start = ["DORANS_BLADE"];

  let items: string[];
  let boots: string;
  let defensive: string[]; // món chống chịu (để đổi chỗ theo lối lên đồ)
  switch (arch) {
    case "MARKSMAN":
      boots = "BERSERKERS_GREAVES";
      items = [
        champ.damage_type === "MIXED" ? "GUINSOOS_RAGEBLADE" : pick(["YUN_TAL", "KRAKEN_SLAYER", "STATIKK_SHIV"], s),
        "INFINITY_EDGE",
        pick(["PHANTOM_DANCER", "RUNAANS_HURRICANE", "NAVORI"], s + "2"),
        healers ? "MORTAL_REMINDER" : "LORD_DOMINIKS",
        "BLOODTHIRSTER",
        "GUARDIAN_ANGEL",
      ];
      defensive = ["GUARDIAN_ANGEL", "IMMORTAL_SHIELDBOW"];
      break;
    case "MAGE":
      boots = "SORCERERS_SHOES";
      items = [
        champ.profile.poke >= 8 ? "HORIZON_FOCUS" : champ.profile.teamfight >= 8 && champ.profile.engage >= 6 ? "LIANDRYS" : pick(["LUDENS", "MALIGNANCE", "BLACKFIRE_TORCH"], s),
        "SHADOWFLAME",
        "RABADONS",
        healers ? "MORELLONOMICON" : tanks ? "VOID_STAFF" : "CRYPTBLOOM",
        ad >= ap ? "ZHONYAS" : "BANSHEES_VEIL",
      ];
      defensive = ["ZHONYAS", "BANSHEES_VEIL"];
      break;
    case "ASSASSIN":
      if (apChamp) {
        boots = "SORCERERS_SHOES";
        items = ["STORMSURGE", "SHADOWFLAME", "RABADONS", "VOID_STAFF", "ZHONYAS"];
        defensive = ["ZHONYAS"];
      } else {
        boots = "IONIAN_BOOTS";
        items = [pick(["YOUMUUS_GHOSTBLADE", "HUBRIS", "PROFANE_HYDRA"], s), pick(["SERPENTS_FANG", "ECLIPSE", "AXIOM_ARC"], s + "2"), "EDGE_OF_NIGHT", "SERYLDAS_GRUDGE", "GUARDIAN_ANGEL"];
        defensive = ["EDGE_OF_NIGHT", "GUARDIAN_ANGEL"];
      }
      break;
    case "FIGHTER":
      boots = tankBoots;
      if (apChamp) {
        items = ["RIFTMAKER", "LIANDRYS", "ZHONYAS", "RABADONS", "VOID_STAFF"];
        defensive = ["ZHONYAS"];
      } else {
        items = [
          pick(["TRINITY_FORCE", "SUNDERED_SKY", "BLACK_CLEAVER", "ECLIPSE"], s),
          "STERAKS_GAGE",
          healers ? "CHEMPUNK_CHAINSWORD" : "DEATHS_DANCE",
          ap > ad ? "MAW_OF_MALMORTIUS" : tanks ? "BLACK_CLEAVER" : "SPIRIT_VISAGE",
          "GUARDIAN_ANGEL",
        ];
        defensive = ["STERAKS_GAGE", "DEATHS_DANCE", "GUARDIAN_ANGEL", "SPIRIT_VISAGE"];
      }
      break;
    case "TANK":
      boots = tankBoots;
      items = [
        ap > ad ? "HOLLOW_RADIANCE" : "SUNFIRE_AEGIS",
        "JAKSHO",
        healers || ad > ap ? "THORNMAIL" : "FORCE_OF_NATURE",
        ap >= 2 ? "KAENIC_ROOKERN" : "SPIRIT_VISAGE",
        ad >= 3 ? "RANDUINS_OMEN" : "WARMOGS",
      ];
      defensive = items.slice();
      break;
    case "CATCHER":
      boots = tankBoots;
      items = ["LOCKET", "KNIGHTS_VOW", "ZEKES_CONVERGENCE", healers ? "THORNMAIL" : ap > ad ? "ABYSSAL_MASK" : "RANDUINS_OMEN", "WARMOGS"];
      defensive = items.slice();
      break;
    case "ENCHANTER":
      boots = "IONIAN_BOOTS";
      items = [pick(["MOONSTONE_RENEWER", "ECHOES_OF_HELIA"], s), "SHURELYAS", "REDEMPTION", "MIKAELS_BLESSING", "ARDENT_CENSER"];
      defensive = ["REDEMPTION", "MIKAELS_BLESSING"];
      break;
  }

  // lối lên đồ do HLV chọn
  if (style === "DEFENSE") {
    const d = items.find((it) => defensive.includes(it));
    if (d) items = [items[0], d, ...items.filter((it, i) => i > 0 && it !== d)];
  } else if (style === "DAMAGE" && arch !== "TANK" && arch !== "CATCHER" && arch !== "ENCHANTER") {
    items = items.map((it, i) => (i > 0 && defensive.includes(it) ? (apChamp ? "VOID_STAFF" : "THE_COLLECTOR") : it));
    items = [...new Set(items)];
  }
  // giày sau món lớn đầu tiên; tối đa 6 ô (giày + 5 món)
  const core = [items[0], boots, ...items.slice(1)].slice(0, 6);
  return { start, core };
}

// ------------------------------------------------------------------ Mua đồ
/** Giá còn phải trả để có `id` khi đã có sẵn một số nguyên liệu trong túi (túi bị trừ nguyên liệu dùng tới). */
export function remainingCost(db: ItemDb, id: string, bag: string[]): number {
  const i = bag.indexOf(id);
  if (i >= 0) {
    bag.splice(i, 1);
    return 0;
  }
  const it = db[id];
  if (!it) return Infinity;
  const combine = it.cost - it.from.reduce((s, c) => s + (db[c]?.cost ?? 0), 0);
  return combine + it.from.reduce((s, c) => s + remainingCost(db, c, bag), 0);
}

const SLOTS = 6;

/**
 * Mua theo lộ trình: hoàn thành món kế tiếp nếu đủ tiền, không thì mua nguyên liệu lớn nhất mua được.
 * Túi đầy thì bán món khởi đầu (hoàn 40%). Trả về túi đồ mới và vàng còn lại.
 */
export function shopFor(db: ItemDb, plan: BuildPlan, inventory: string[], gold: number): { inventory: string[]; gold: number; bought: string[] } {
  let inv = inventory.slice();
  const bought: string[] = [];
  // đầu trận: mua đồ khởi đầu
  if (!inv.length)
    for (const id of plan.start) {
      const cost = db[id]?.cost ?? Infinity;
      if (cost <= gold) (gold -= cost), inv.push(id), bought.push(id);
    }
  for (let guard = 0; guard < 40; guard++) {
    const target = plan.core.find((id) => !inv.includes(id));
    if (!target) break;
    const bag = inv.slice();
    const price = remainingCost(db, target, bag);
    if (price <= gold) {
      gold -= price;
      inv = [...bag, target];
      bought.push(target);
    } else {
      const comp = cheapestStep(db, target, inv, gold);
      if (!comp) break;
      const bag2 = inv.slice();
      gold -= remainingCost(db, comp, bag2);
      inv = [...bag2, comp];
      bought.push(comp);
    }
    // quá 6 ô: bán đồ khởi đầu
    while (inv.length > SLOTS) {
      const idx = inv.findIndex((id) => db[id]?.tier === "STARTER");
      if (idx < 0) break;
      gold += Math.round(db[inv[idx]].cost * 0.4);
      inv.splice(idx, 1);
    }
    if (inv.length > SLOTS) {
      inv.pop();
      break;
    }
  }
  return { inventory: inv, gold, bought };
}

/** Nguyên liệu (chưa có) đắt nhất trong cây công thức của `id` mà đủ tiền mua */
function cheapestStep(db: ItemDb, id: string, inv: string[], gold: number): string | null {
  const it = db[id];
  if (!it) return null;
  let best: string | null = null;
  let bestCost = -1;
  const bag = inv.slice();
  for (const c of it.from) {
    if (bag.includes(c)) {
      bag.splice(bag.indexOf(c), 1);
      continue;
    }
    const price = remainingCost(db, c, inv.slice());
    if (price <= gold && price > bestCost) (best = c), (bestCost = price);
    else if (price > gold) {
      const deeper = cheapestStep(db, c, inv, gold);
      if (deeper) {
        const p2 = remainingCost(db, deeper, inv.slice());
        if (p2 > bestCost) (best = deeper), (bestCost = p2);
      }
    }
  }
  return best;
}

/** Tổng chỉ số và hiệu ứng của túi đồ (nguyên liệu cũng cộng chỉ số, như trong game) */
export function inventoryStats(db: ItemDb, inv: string[]): { stats: ItemStats; tags: Record<string, number> } {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as unknown as ItemStats;
  const tags: Record<string, number> = {};
  for (const id of inv) {
    const it = db[id];
    if (!it) continue;
    for (const k of STAT_KEYS) stats[k] += it.stats[k] ?? 0;
    for (const [t, v] of Object.entries(it.tags)) tags[t] = Math.max(tags[t] ?? 0, v);
  }
  if (tags.AP_MULT) stats.ap *= 1 + tags.AP_MULT;
  return { stats, tags };
}
