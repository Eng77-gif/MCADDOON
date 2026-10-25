// Dựng data/packs/<pack>/csv/items.csv từ dữ liệu Riot (data/lol/items.json, Data Dragon tiếng Việt)
// + data/lol/item_keys.csv (mã engine, tên tiếng Anh và hiệu ứng engine hiểu được cho từng món).
// Dùng: node engine/tools/import-lol-items.ts [real-2026]   rồi   npm run import-pack
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../src/pack.ts";

interface RiotItem {
  id: number; name: string; tier: string; cost: number; from: number[]; stat_text: string[];
  effects: { type: string; name: string; text: string }[]; summary: string;
}

const packId = process.argv[2] ?? "real-2026";
const root = join(import.meta.dirname, "../..");
const riot: { patch: string; items: RiotItem[] } = JSON.parse(readFileSync(join(root, "data/lol/items.json"), "utf8"));
const keys = new Map(parseCsv(readFileSync(join(root, "data/lol/item_keys.csv"), "utf8")).map((r) => [Number(r.riot_id), r]));

const SUPPORT = new Set([3865, 3869, 3870, 3871, 3876, 3877]);
const tierOf = (it: RiotItem) =>
  SUPPORT.has(it.id) ? "SUPPORT" : it.id === 1036 ? "BASIC" : ({ starter: "STARTER", basic: "BASIC", epic: "EPIC", legendary: "LEGENDARY", boots: "BOOTS" } as Record<string, string>)[it.tier];

// "25% Tốc Độ Đánh" -> cột as=25 ; chỉ số theo dòng chữ của Riot (đủ hơn trường stats)
const TEXT_COLS: [RegExp, string][] = [
  [/^Sức Mạnh Công Kích$/, "ad"], [/^Sức Mạnh Phép Thuật$/, "ap"], [/^Máu$/, "hp"], [/^Giáp$/, "armor"], [/^Kháng Phép$/, "mr"],
  [/^Tốc Độ Đánh$/, "as"], [/^Tỉ Lệ Chí Mạng$/, "crit"], [/^Điểm Hồi Kỹ Năng$/, "ah"], [/^Sát Lực$/, "lethality"],
  [/^Xuyên Giáp$/, "armor_pen"], [/^Hút Máu$/, "lifesteal"], [/^Hút Máu Toàn Phần$/, "omnivamp"], [/^Năng Lượng$/, "mana"],
  [/^Sức Mạnh Lá Chắn và Hồi Máu$/, "hsp"],
];
const COLS = ["id", "name", "name_vi", "tier", "cost", "from", "ad", "ap", "hp", "armor", "mr", "as", "crit", "ah", "ms", "ms_pct", "lethality", "armor_pen", "magic_pen", "magic_pen_pct", "lifesteal", "omnivamp", "mana", "hsp", "tags", "passive", "icon"];

const warnings: string[] = [];
const keyOf = (rid: number) => keys.get(rid)?.key ?? `I${rid}`;
const rows: Record<string, string>[] = [];
for (const it of riot.items) {
  const tier = tierOf(it);
  if (!tier) continue; // bình, mắt
  const k = keys.get(it.id);
  if (!k) warnings.push(`Món ${it.id} ${it.name} chưa có trong item_keys.csv`);
  const r: Record<string, string> = {
    id: keyOf(it.id), name: k?.name_en ?? "", name_vi: it.name, tier, cost: String(it.cost),
    from: it.from.map(keyOf).join(";"), icon: String(it.id),
  };
  const tags = new Map<string, string>();
  for (const t of (k?.tags ?? "").split(";").filter(Boolean)) {
    const [a, b] = t.split(":");
    tags.set(a, b ?? "");
  }
  for (const line of it.stat_text) {
    const m = /^([\d.]+)(%?)\s+(.+)$/.exec(line);
    if (!m) continue;
    const [, num, pct, label] = m;
    if (label === "Tốc Độ Di Chuyển") r[pct ? "ms_pct" : "ms"] = num;
    else if (label === "Xuyên Kháng Phép") r[pct ? "magic_pen_pct" : "magic_pen"] = num;
    else if (label === "Kháng Hiệu Ứng") tags.set("TENACITY", "");
    else if (label === "Sát Thương Chí Mạng") tags.set("CRIT_DMG", String(Number(num) / 100));
    else {
      const col = TEXT_COLS.find(([re]) => re.test(label))?.[1];
      if (col && Number(num) > 0) r[col] = num;
    }
  }
  r.tags = [...tags].map(([a, b]) => (b ? `${a}:${b}` : a)).join(";");
  r.passive = it.effects.filter((e) => e.type !== "active" || it.effects.length === 1).map((e) => `${e.name}: ${e.text}`).join(" | ") || it.summary;
  rows.push(r);
}
const known = new Set(rows.map((r) => r.id));
for (const r of rows) for (const c of r.from.split(";").filter(Boolean)) if (!known.has(c)) warnings.push(`${r.id}: nguyên liệu ${c} không có`);

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const out = [COLS.join(","), ...rows.map((r) => COLS.map((c) => esc(r[c] ?? "")).join(","))].join("\n") + "\n";
writeFileSync(join(root, "data/packs", packId, "csv/items.csv"), out);
console.log(`items.csv: ${rows.length} món từ Riot ${riot.patch}`);
for (const w of warnings) console.warn("CẢNH BÁO:", w);
