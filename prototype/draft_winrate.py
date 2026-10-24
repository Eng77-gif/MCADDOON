"""Prototype: ước lượng tỷ lệ thắng sau giai đoạn Ban/Pick.

Chạy: python3 prototype/draft_winrate.py
Công thức chi tiết xem docs/01-data-model-and-draft-formula.md
"""
import math

# ---- Hằng số cân bằng (tuning knobs) ----
TIER_POINTS = {"S": 3.0, "A": 1.5, "B": 0.0, "C": -1.5, "D": -3.0}
W_META = 1.0
W_MASTERY = 1.5          # mỗi 10 điểm mastery lệch khỏi mốc 70
MASTERY_BASELINE = 70
UNKNOWN_MASTERY = 40     # tướng không có trong bể tướng
SIGNATURE_BONUS = 1.0
W_LANE_COUNTER = 1.0
W_GLOBAL_COUNTER = 0.25  # khắc chế với các tướng địch khác đường
W_SYNERGY = 0.5
W_TACTIC_FIT = 0.6
SCALE = 15.0             # chênh 15 điểm draft ~ 73% thắng
P_MIN, P_MAX = 0.20, 0.80  # draft không bao giờ quyết định tuyệt đối

TACTIC_KEYS = {
    "TEAMFIGHT": ["teamfight", "engage"],
    "SPLIT_1_4": ["split_push", "waveclear"],
    "POKE": ["poke", "disengage"],
    "PICK_OFF": ["pick_potential", "mobility"],
}

ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]


def matchup(champs, a, b):
    """Điểm khắc chế a vs b, tự suy ra chiều ngược nếu chỉ nhập một phía."""
    if b in champs[a]["matchups"]:
        return champs[a]["matchups"][b]
    return -champs[b]["matchups"].get(a, 0)


def slot_score(champs, patch, player, champ_id, role, enemy_picks):
    c = champs[champ_id]
    meta = TIER_POINTS[c["patch_stats"][patch]["tier"]] * W_META

    pool = {e["champion_id"]: e for e in player["champion_pool"]}
    entry = pool.get(champ_id)
    mastery = entry["mastery"] if entry else UNKNOWN_MASTERY
    mastery_pts = (mastery - MASTERY_BASELINE) / 10 * W_MASTERY
    if entry and entry.get("is_signature"):
        mastery_pts += SIGNATURE_BONUS

    lane = matchup(champs, champ_id, enemy_picks[role]) * W_LANE_COUNTER
    glob = sum(matchup(champs, champ_id, e) for r, e in enemy_picks.items() if r != role)
    glob *= W_GLOBAL_COUNTER

    return {"meta": meta, "mastery": mastery_pts, "lane": lane, "global": glob}


def team_score(champs, patch, roster, picks, enemy_picks, tactic):
    slots = {r: slot_score(champs, patch, roster[r], picks[r], r, enemy_picks) for r in ROLES}

    ids = list(picks.values())
    synergy = 0.0
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            synergy += max(champs[a]["synergies"].get(b, 0), champs[b]["synergies"].get(a, 0))
    synergy *= W_SYNERGY

    keys = TACTIC_KEYS[tactic]
    avg = sum(champs[c]["profile"][k] for c in ids for k in keys) / (len(ids) * len(keys))
    tactic_fit = (avg - 5) * W_TACTIC_FIT

    total = sum(sum(s.values()) for s in slots.values()) + synergy + tactic_fit
    return total, {"slots": slots, "synergy": synergy, "tactic_fit": tactic_fit}


def draft_win_probability(score_a, score_b):
    p = 1 / (1 + math.exp(-(score_a - score_b) / SCALE))
    return min(P_MAX, max(P_MIN, p))


# ---------------- Demo ----------------
def _champ(tier, profile, matchups=None, synergies=None):
    base = dict.fromkeys(
        ["teamfight", "engage", "split_push", "waveclear", "poke", "disengage",
         "pick_potential", "mobility"], 5)
    base.update(profile)
    return {"patch_stats": {"26.21": {"tier": tier}}, "profile": base,
            "matchups": matchups or {}, "synergies": synergies or {}}


CHAMPS = {
    "AHRI":     _champ("A", {"pick_potential": 9, "mobility": 9}, {"SYLAS": -2, "AZIR": 2}, {"WUKONG": 2}),
    "SYLAS":    _champ("S", {"engage": 7, "teamfight": 7}),
    "AZIR":     _champ("A", {"teamfight": 8, "poke": 6}),
    "KSANTE":   _champ("S", {"engage": 6, "teamfight": 7}, {"GNAR": 1}),
    "GNAR":     _champ("S", {"teamfight": 8, "split_push": 6}),
    "WUKONG":   _champ("A", {"engage": 8, "teamfight": 8}, {"VI": 1}),
    "VI":       _champ("A", {"pick_potential": 8, "engage": 7}),
    "KAISA":    _champ("S", {"mobility": 7}, {"VARUS": 0}),
    "VARUS":    _champ("A", {"poke": 8}),
    "NAUTILUS": _champ("A", {"engage": 9, "pick_potential": 8}, {"KARMA": 1}, {"KAISA": 2}),
    "KARMA":    _champ("A", {"poke": 8, "disengage": 7}),
}


def _player(pool):
    return {"champion_pool": [{"champion_id": c, "mastery": m, "is_signature": s} for c, m, s in pool]}


ROSTER_A = {
    "TOP": _player([("KSANTE", 85, False)]),
    "JUNGLE": _player([("WUKONG", 80, False)]),
    "MID": _player([("AHRI", 92, True), ("SYLAS", 85, False)]),
    "ADC": _player([("KAISA", 88, False)]),
    "SUPPORT": _player([("NAUTILUS", 75, False)]),
}
ROSTER_B = {
    "TOP": _player([("GNAR", 80, False)]),
    "JUNGLE": _player([("VI", 78, False)]),
    "MID": _player([("AZIR", 90, True)]),
    "ADC": _player([("VARUS", 82, False)]),
    "SUPPORT": _player([("KARMA", 70, False)]),
}

if __name__ == "__main__":
    picks_a = {"TOP": "KSANTE", "JUNGLE": "WUKONG", "MID": "AHRI", "ADC": "KAISA", "SUPPORT": "NAUTILUS"}
    picks_b = {"TOP": "GNAR", "JUNGLE": "VI", "MID": "AZIR", "ADC": "VARUS", "SUPPORT": "KARMA"}

    sa, da = team_score(CHAMPS, "26.21", ROSTER_A, picks_a, picks_b, "PICK_OFF")
    sb, db = team_score(CHAMPS, "26.21", ROSTER_B, picks_b, picks_a, "POKE")
    print(f"Team A draft score: {sa:6.2f}  (synergy {da['synergy']:.2f}, tactic {da['tactic_fit']:.2f})")
    print(f"Team B draft score: {sb:6.2f}  (synergy {db['synergy']:.2f}, tactic {db['tactic_fit']:.2f})")
    print(f"P(A thắng | draft) = {draft_win_probability(sa, sb):.1%}")

    # So sánh các lựa chọn MID của A: tướng tủ / tướng meta / tướng ngoài bể tướng
    for alt, note in [("SYLAS", "meta S, mastery 85"), ("KARMA", "không có trong bể tướng")]:
        picks_alt = dict(picks_a, MID=alt)
        s_alt, _ = team_score(CHAMPS, "26.21", ROSTER_A, picks_alt, picks_b, "PICK_OFF")
        print(f"Nếu A pick {alt} ({note}): P = {draft_win_probability(s_alt, sb):.1%}")
