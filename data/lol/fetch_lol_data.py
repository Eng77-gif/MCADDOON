"""Fetch League of Legends items and champions from Riot's Data Dragon and write them for the game.

Usage: python3 fetch_lol_data.py [VERSION] [LOCALE]
        (defaults: newest patch, vi_VN)

Writes next to this script:
  items.json       Summoner's Rift items: cost, recipe, stats, passives and actives (plain text)
  champions.json   every champion: roles, resource, base stats + growth, passive and abilities
  TRANG_BI.md      readable item list grouped by tier
  TUONG.md         readable champion list with base / level 18 stats and passive
"""
import html, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

DD = "https://ddragon.leagueoflegends.com"
CDRAGON = "https://raw.communitydragon.org/latest/game/data/characters"
HERE = os.path.dirname(os.path.abspath(__file__))

STAT_NAMES = {   # Data Dragon item stat keys -> short names used in items.json
    "FlatPhysicalDamageMod": "ad", "FlatMagicDamageMod": "ap", "FlatHPPoolMod": "hp", "FlatMPPoolMod": "mana",
    "FlatArmorMod": "armor", "FlatSpellBlockMod": "mr", "FlatCritChanceMod": "crit",
    "PercentAttackSpeedMod": "attack_speed", "PercentLifeStealMod": "lifesteal",
    "FlatMovementSpeedMod": "move_speed", "PercentMovementSpeedMod": "move_speed_pct",
    "FlatHPRegenMod": "hp_regen", "PercentHPRegenMod": "hp_regen_pct", "FlatMPRegenMod": "mana_regen",
}
TIER_VI = {"starter": "Khởi đầu", "boots": "Giày", "basic": "Cơ bản", "epic": "Trung cấp",
           "legendary": "Huyền thoại", "consumable": "Tiêu hao", "trinket": "Mắt"}
ROLE_VI = {"Assassin": "Sát thủ", "Fighter": "Đấu sĩ", "Mage": "Pháp sư", "Marksman": "Xạ thủ",
           "Support": "Hỗ trợ", "Tank": "Đỡ đòn"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MCADDOON-lol-data/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def plain(text):
    """Data Dragon rich text -> readable plain text with line breaks."""
    text = re.sub(r"<br\s*/?>", "\n", text or "")
    text = re.sub(r"</?(passive|active)>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in text.split("\n")]
    return "\n".join(l for l in lines if l)


def item_effects(desc):
    """Split an item description into its stat lines and named passive / active effects."""
    stats = re.search(r"<stats>(.*?)</stats>", desc, re.S)
    stat_lines = plain(stats.group(1)).split("\n") if stats else []
    body = desc[stats.end():] if stats else desc
    effects = []
    # each effect starts with <passive>Name</passive> or <active>Name</active>; its text runs to the next one
    parts = re.split(r"<(passive|active)>(.*?)</\1>", body)
    for k in range(1, len(parts) - 2, 3):
        effects.append({"type": parts[k], "name": plain(parts[k + 1]).strip(" :"),
                        "text": plain(parts[k + 2]).lstrip(": ").strip()})
    if not effects and plain(body):
        effects.append({"type": "passive", "name": "", "text": plain(body)})
    return [l for l in stat_lines if l], effects


def item_tier(it):
    tags = set(it.get("tags", []))
    gold = it["gold"]["total"]
    if "Trinket" in tags:
        return "trinket"
    if "Consumable" in tags:
        return "consumable"
    if "Boots" in tags or it["name"].startswith("Giày") or it.get("from") == ["3006"]:
        return "boots"
    if "Lane" in tags or (gold <= 500 and not it.get("from") and it.get("depth", 1) == 1 and "into" not in it):
        return "starter"
    if not it.get("from"):
        return "basic"
    if it.get("into"):
        return "epic"
    return "legendary"


def build_items(raw):
    items, seen = [], {}
    for iid, it in sorted(raw.items(), key=lambda kv: int(kv[0])):
        if not it.get("maps", {}).get("11") or not it["gold"].get("purchasable"):
            continue
        if it.get("inStore") is False or it.get("hideFromAll") or it.get("requiredChampion") or it.get("requiredAlly"):
            continue
        if int(iid) >= 100000:                      # 2xxxxx/4xxxxx/6xxxxx: copies for other game modes
            continue
        if it["name"] in seen:                     # mode-specific copies share the name; keep the first id
            continue
        seen[it["name"]] = iid
        it["name"] = it["name"].strip()
        stat_lines, effects = item_effects(it["description"])
        items.append({
            "id": int(iid), "name": it["name"], "tier": item_tier(it),
            "cost": it["gold"]["total"], "combine_cost": it["gold"]["base"], "sell": it["gold"]["sell"],
            "from": [int(x) for x in it.get("from", [])], "into": [int(x) for x in it.get("into", [])],
            "tags": it.get("tags", []),
            "stats": {STAT_NAMES.get(k, k): v for k, v in it.get("stats", {}).items()},
            "stat_text": stat_lines, "effects": effects, "summary": plain(it.get("plaintext", "")),
            "icon": f"{DD}/cdn/{VERSION}/img/item/{it['image']['full']}",
        })
    names = {i["id"]: i["name"] for i in items}
    for i in items:                                # drop recipe links to items that are not on the Rift
        i["from"] = [x for x in i["from"] if x in names]
        i["into"] = [x for x in i["into"] if x in names]
    return items


def stat_at(base, growth, level):
    """Champion stat at a level, using Riot's growth curve."""
    return base + growth * (level - 1) * (0.7025 + 0.0175 * (level - 1))


def ad_growth(champ_id):
    """AD per level from the game files (Data Dragon has reported 0 for every champion lately)."""
    try:
        d = get(f"{CDRAGON}/{champ_id.lower()}/{champ_id.lower()}.bin.json")
        rec = next(v for k, v in d.items() if k.lower() == f"characters/{champ_id.lower()}/characterrecords/root")
        return rec.get("damagePerLevelModifiable", {}).get("baseValue", 0.0)   # absent = no growth (Senna)
    except Exception:
        return None


def build_champions(raw):
    with ThreadPoolExecutor(12) as pool:
        growth = dict(zip(raw, pool.map(ad_growth, raw)))
    missing = [k for k, v in growth.items() if v is None]
    if missing:
        print("AD growth not found in game files for:", ", ".join(missing))
    out = []
    for key, c in sorted(raw.items(), key=lambda kv: kv[1]["name"]):
        s = c["stats"]
        out.append({
            "id": key, "key": int(c["key"]), "name": c["name"], "title": c["title"],
            "roles": c["tags"], "resource": c["partype"],
            "info": c["info"],                        # Riot's 0-10 attack / defense / magic / difficulty
            "stats": {
                "hp": [s["hp"], s["hpperlevel"]], "mana": [s["mp"], s["mpperlevel"]],
                "hp_regen": [s["hpregen"], s["hpregenperlevel"]], "mana_regen": [s["mpregen"], s["mpregenperlevel"]],
                "armor": [s["armor"], s["armorperlevel"]], "mr": [s["spellblock"], s["spellblockperlevel"]],
                "ad": [s["attackdamage"], round(growth[key], 3) if growth.get(key) is not None
                       else s["attackdamageperlevel"]],
                "attack_speed": [s["attackspeed"], s["attackspeedperlevel"] / 100],
                "range": s["attackrange"], "move_speed": s["movespeed"],
            },
            "passive": {"name": c["passive"]["name"], "text": plain(c["passive"]["description"])},
            "spells": [{"slot": slot, "name": sp["name"], "cooldown": sp["cooldown"], "cost": sp["cost"],
                        "range": sp["range"], "text": plain(sp["description"])}
                       for slot, sp in zip("QWER", c["spells"])],
            "icon": f"{DD}/cdn/{VERSION}/img/champion/{c['image']['full']}",
        })
    return out


def fmt(v):
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)


def write_item_md(items, path):
    by_id = {i["id"]: i for i in items}
    lines = [f"# Trang bị Liên Minh Huyền Thoại — bản {VERSION}", "",
             f"{len(items)} trang bị mua được ở Summoner's Rift. Nguồn: Riot Data Dragon ({LOCALE}).", ""]
    for tier in ("legendary", "boots", "epic", "basic", "starter", "consumable", "trinket"):
        group = sorted((i for i in items if i["tier"] == tier), key=lambda i: (-i["cost"], i["name"]))
        if not group:
            continue
        lines += [f"## {TIER_VI[tier]} ({len(group)})", ""]
        for i in group:
            lines.append(f"### {i['name']} — {i['cost']} vàng")
            if i["stat_text"]:
                lines.append("**Chỉ số:** " + " · ".join(i["stat_text"]))
            if i["from"]:
                lines.append("**Ghép từ:** " + ", ".join(by_id[x]["name"] for x in i["from"])
                             + f" (+{i['combine_cost']} vàng)")
            for e in i["effects"]:
                label = "Nội tại" if e["type"] == "passive" else "Kích hoạt"
                name = f" – {e['name']}" if e["name"] else ""
                lines.append(f"- **{label}{name}:** " + e["text"].replace("\n", " "))
            if not i["stat_text"] and not i["effects"] and i["summary"]:
                lines.append(i["summary"])
            lines.append("")
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def write_champ_md(champs, path):
    lines = [f"# Tướng Liên Minh Huyền Thoại — bản {VERSION}", "",
             f"{len(champs)} tướng. Chỉ số ghi dạng `cấp 1 → cấp 18` (mức tăng mỗi cấp có trong champions.json). Nguồn: Riot Data Dragon ({LOCALE}).", "",
             "| Tướng | Vai trò | Máu | Giáp | Kháng phép | SMCK | Tốc đánh | Tầm | Tốc chạy |",
             "|---|---|---|---|---|---|---|---|---|"]
    for c in champs:
        s = c["stats"]
        lv = lambda k, d=0: f"{s[k][0]:.{d}f} → {stat_at(s[k][0], s[k][1], 18):.{d}f}"
        as18 = s["attack_speed"][0] * (1 + stat_at(0, s["attack_speed"][1], 18))
        lines.append(f"| {c['name']} | {', '.join(ROLE_VI.get(r, r) for r in c['roles'])} | {lv('hp')} | {lv('armor', 1)} | "
                     f"{lv('mr', 1)} | {lv('ad')} | {s['attack_speed'][0]:.3f} → {as18:.3f} | {s['range']} | {s['move_speed']} |")
    lines += ["", "## Nội tại và kỹ năng", ""]
    for c in champs:
        lines.append(f"### {c['name']} — {c['title']}")
        lines.append(f"- **Nội tại – {c['passive']['name']}:** " + c["passive"]["text"].replace("\n", " "))
        for sp in c["spells"]:
            cd = "/".join(fmt(x) for x in sp["cooldown"])
            lines.append(f"- **{sp['slot']} – {sp['name']}** (hồi {cd}s): " + sp["text"].replace("\n", " "))
        lines.append("")
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def main():
    global VERSION, LOCALE
    VERSION = sys.argv[1] if len(sys.argv) > 1 else get(f"{DD}/api/versions.json")[0]
    LOCALE = sys.argv[2] if len(sys.argv) > 2 else "vi_VN"
    items = build_items(get(f"{DD}/cdn/{VERSION}/data/{LOCALE}/item.json")["data"])
    champs = build_champions(get(f"{DD}/cdn/{VERSION}/data/{LOCALE}/championFull.json")["data"])
    meta = {"patch": VERSION, "locale": LOCALE, "source": "Riot Data Dragon"}
    json.dump({**meta, "items": items}, open(os.path.join(HERE, "items.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump({**meta, "stat_format": "[base, per level]; attack_speed growth is a fraction per level",
               "champions": champs},
              open(os.path.join(HERE, "champions.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_item_md(items, os.path.join(HERE, "TRANG_BI.md"))
    write_champ_md(champs, os.path.join(HERE, "TUONG.md"))
    print(f"patch {VERSION}: {len(items)} items, {len(champs)} champions")


if __name__ == "__main__":
    main()
