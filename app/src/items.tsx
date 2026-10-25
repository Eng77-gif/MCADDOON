// Trang bị: ảnh Riot (data/lol/img/items), ô đồ của tướng, trang tra cứu "Kho trang bị".
import { useMemo, useState } from "react";
import { STAT_KEYS, STAT_VI, buildsInto, itemName, type Item, type ItemDb, type ItemTier } from "../../engine/src/index.ts";
import itemsJson from "../../data/packs/real-2026/items.json";
import { Card } from "./ui.tsx";

export const items = itemsJson as unknown as ItemDb;

const files = import.meta.glob<string>("../../data/lol/img/items/*.png", { eager: true, query: "?inline", import: "default" });
const iconByRiotId: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) iconByRiotId[path.slice(path.lastIndexOf("/") + 1, -4)] = url;

export const itemIcon = (id: string): string | undefined => {
  const it = items[id];
  return it?.icon ? iconByRiotId[it.icon] : undefined;
};

const PCT = new Set(["as", "crit", "msPct", "armorPen", "magicPenPct", "lifesteal", "omnivamp", "hsp"]);
export function statLines(it: Item): string[] {
  return STAT_KEYS.filter((k) => it.stats[k]).map((k) => {
    const v = it.stats[k]!;
    const label = STAT_VI[k].replace(/^% /, "");
    return `+${v}${PCT.has(k) ? "%" : ""} ${label}`;
  });
}

const tooltip = (it: Item) => [`${itemName(it)} — ${it.cost} vàng`, ...statLines(it), it.passive ?? ""].filter(Boolean).join("\n");

export function ItemIcon({ id, size = 22 }: { id: string; size?: number }) {
  const it = items[id];
  const src = itemIcon(id);
  if (!it) return null;
  return src ? (
    <img className={`item-icon tier-${it.tier.toLowerCase()}`} src={src} width={size} height={size} alt={itemName(it)} title={tooltip(it)} />
  ) : (
    <span className="item-icon empty" style={{ width: size, height: size }} title={tooltip(it)} />
  );
}

/** 6 ô đồ (ô trống hiện khung) */
export function ItemSlots({ inventory, size = 20 }: { inventory: string[] | undefined; size?: number }) {
  const inv = inventory ?? [];
  return (
    <span className="item-slots">
      {Array.from({ length: 6 }, (_, i) => (inv[i] ? <ItemIcon key={i} id={inv[i]} size={size} /> : <span key={i} className="item-icon empty" style={{ width: size, height: size }} />))}
    </span>
  );
}

// ------------------------------------------------------------------ Kho trang bị
const TIERS: [ItemTier | "ALL", string][] = [
  ["ALL", "Tất cả"], ["LEGENDARY", "Huyền thoại"], ["EPIC", "Sử thi"], ["BASIC", "Cơ bản"], ["BOOTS", "Giày"], ["STARTER", "Khởi đầu"], ["SUPPORT", "Hỗ trợ"],
];
const FILTERS: [string, string, (it: Item) => boolean][] = [
  ["ad", "Công vật lý", (it) => !!it.stats.ad],
  ["ap", "Phép thuật", (it) => !!it.stats.ap],
  ["crit", "Chí mạng", (it) => !!it.stats.crit],
  ["as", "Tốc đánh", (it) => !!it.stats.as],
  ["hp", "Máu", (it) => !!it.stats.hp],
  ["armor", "Giáp", (it) => !!it.stats.armor],
  ["mr", "Kháng phép", (it) => !!it.stats.mr],
  ["pen", "Xuyên giáp/phép", (it) => !!(it.stats.lethality || it.stats.armorPen || it.stats.magicPen || it.stats.magicPenPct)],
  ["grievous", "Vết thương sâu", (it) => !!it.tags.GRIEVOUS],
  ["support", "Hỗ trợ đồng đội", (it) => !!(it.tags.TEAM_HEAL || it.tags.TEAM_SHIELD || it.tags.ALLY_AS || it.stats.hsp)],
];

/** Hiệu ứng engine áp dụng trong trận, mô tả ngắn */
const TAG_VI: Record<string, (v: number) => string> = {
  GRIEVOUS: () => "Gây Vết Thương Sâu (giảm 40% hồi máu)",
  LIFELINE: (v) => `Lá chắn ${Math.round(v * 100)}% máu khi máu thấp`,
  REVIVE: () => "Hồi sinh với 50% máu",
  STASIS: () => "Hóa vàng khi sắp chết",
  SPELLSHIELD: () => "Chặn một kỹ năng",
  SPELLBLADE: (v) => `Kiếm phép: đòn đánh sau chiêu +${Math.round(v * 100)}% sức mạnh`,
  ONHIT: (v) => `Đòn đánh +${v} sát thương phép`,
  PERCENT_HP: (v) => `Đòn đánh +${Math.round(v * 100)}% máu hiện tại`,
  CLEAVE: (v) => `Đòn đánh lan ${Math.round(v * 100)}%`,
  BURN_AURA: () => "Thiêu đốt kẻ địch xung quanh",
  BURN_SPELL: () => "Kỹ năng thiêu đốt theo máu tối đa",
  THORNS: () => "Phản sát thương khi bị đánh",
  TENACITY: () => "Kháng hiệu ứng (khống chế ngắn hơn 30%)",
  CLEANSE: () => "Giải khống chế",
  BLOCK_AUTO: () => "Giảm 12% sát thương đòn đánh",
  ANTI_CRIT: () => "Giảm sát thương chí mạng phải nhận",
  DAMAGE_DELAY: () => "Trì hoãn một phần sát thương",
  EXECUTE: (v) => `Kết liễu dưới ${Math.round(v * 100)}% máu`,
  EXECUTE_BONUS: () => "Tăng sát thương lên mục tiêu thấp máu",
  ARMOR_SHRED: () => "Giảm giáp mục tiêu",
  MR_SHRED: () => "Giảm kháng phép mục tiêu",
  TEAM_SHIELD: () => "Lá chắn cho đồng đội",
  TEAM_HEAL: () => "Hồi máu cho đồng đội",
  ALLY_AS: () => "Tăng tốc đánh đồng đội",
  AP_MULT: (v) => `+${Math.round(v * 100)}% tổng sức mạnh phép`,
  CRIT_DMG: (v) => `+${Math.round(v * 100)}% sát thương chí mạng`,
  HASTE_ON_HIT: () => "Đòn đánh giảm hồi chiêu",
  REGEN: () => "Hồi máu nhanh ngoài giao tranh",
  SPLIT: () => "Mạnh hơn khi đẩy lẻ",
  JUNGLE: () => "Đi rừng: đánh quái mạnh hơn, nhận ít sát thương từ quái",
  SLOW: () => "Kỹ năng làm chậm",
  SLOW_AURA: () => "Giảm tốc đánh kẻ địch đánh mình",
};

export function ItemsPage() {
  const [tier, setTier] = useState<ItemTier | "ALL">("LEGENDARY");
  const [filter, setFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("INFINITY_EDGE");
  const list = useMemo(() => {
    const f = FILTERS.find(([k]) => k === filter)?.[2];
    const needle = q.trim().toLowerCase();
    return Object.values(items)
      .filter((it) => (tier === "ALL" || it.tier === tier) && (!f || f(it)) && (!needle || itemName(it).toLowerCase().includes(needle) || it.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.cost - b.cost || itemName(a).localeCompare(itemName(b)));
  }, [tier, filter, q]);
  const it = items[sel];

  return (
    <div className="items-page">
      <Card title={`Kho trang bị · ${Object.keys(items).length} món (dữ liệu Riot 16.21)`}>
        <div className="chips">
          {TIERS.map(([t, l]) => <button key={t} className={`chip ${tier === t ? "on" : ""}`} onClick={() => setTier(t)}>{l}</button>)}
        </div>
        <div className="chips">
          {FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(filter === k ? null : k)}>{l}</button>)}
          <input className="search" placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="item-grid">
          {list.map((x) => (
            <button key={x.id} className={`item-cell ${sel === x.id ? "on" : ""}`} onClick={() => setSel(x.id)} title={itemName(x)}>
              <ItemIcon id={x.id} size={40} />
              <small>{x.cost}</small>
            </button>
          ))}
          {!list.length && <p className="muted">Không có món nào.</p>}
        </div>
      </Card>
      {it && <ItemDetail it={it} db={items} onPick={setSel} />}
    </div>
  );
}

function ItemDetail({ it, db, onPick }: { it: Item; db: ItemDb; onPick: (id: string) => void }) {
  const into = buildsInto(db, it.id);
  const combine = it.cost - it.from.reduce((s, c) => s + (db[c]?.cost ?? 0), 0);
  return (
    <Card title={itemName(it)}>
      <div className="item-head">
        <ItemIcon id={it.id} size={56} />
        <div>
          <div className="item-price">{it.cost} <small className="muted">vàng{it.from.length ? ` · ghép +${combine}` : ""}</small></div>
          {it.name && <div className="muted small">{it.name}</div>}
        </div>
      </div>
      <ul className="item-stats">{statLines(it).map((l) => <li key={l}>{l}</li>)}</ul>
      {it.passive && <p className="small">{it.passive}</p>}
      {Object.keys(it.tags).length > 0 && (
        <>
          <h4>Hiệu ứng trong mô phỏng</h4>
          <ul className="small">{Object.entries(it.tags).map(([k, v]) => <li key={k}>{TAG_VI[k]?.(v) ?? k}</li>)}</ul>
        </>
      )}
      {it.from.length > 0 && (
        <>
          <h4>Công thức</h4>
          <div className="recipe">{it.from.map((c, i) => <button key={i} className="item-cell" onClick={() => onPick(c)}><ItemIcon id={c} size={32} /><small>{db[c]?.cost}</small></button>)}</div>
        </>
      )}
      {into.length > 0 && (
        <>
          <h4>Nâng cấp thành</h4>
          <div className="recipe">{into.map((x) => <button key={x.id} className="item-cell" onClick={() => onPick(x.id)}><ItemIcon id={x.id} size={32} /><small>{x.cost}</small></button>)}</div>
        </>
      )}
    </Card>
  );
}
