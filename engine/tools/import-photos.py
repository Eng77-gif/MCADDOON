"""Chép ảnh tuyển thủ (Leaguepedia, nhánh ccr-08f2c8ab-y9pv45: players/players.csv + players/<Team>/<ID>.png)
vào data/packs/<pack>/portraits/photos/<playerId>.png để `npm run portraits` vẽ pixel art từ ảnh thật.
Ghép theo IGN (không phân biệt hoa thường), bỏ HLV, crop vuông phần đầu + vai, 512x512 (= 4 lần ảnh pixel 128px, theo khuyến nghị của PixelLab).

Dùng: git archive origin/ccr-08f2c8ab-y9pv45 players | tar -x -C /tmp/lp
      python3 engine/tools/import-photos.py /tmp/lp/players [real-2026]
Cần Pillow.
"""
import csv, json, os, sys
from PIL import Image

src = sys.argv[1]
pack = sys.argv[2] if len(sys.argv) > 2 else "real-2026"
root = os.path.join(os.path.dirname(__file__), "../../data/packs", pack)
teams = json.load(open(os.path.join(root, "teams.json"), encoding="utf8"))
by_ign = {p["ign"].lower(): p["id"] for t in teams for p in t["roster"].values()}
out = os.path.join(root, "portraits/photos")
os.makedirs(out, exist_ok=True)

matched, missing = 0, []
for r in csv.DictReader(open(os.path.join(src, "players.csv"), encoding="utf8")):
    if r["status"] != "ok" or r["role"] == "Coach":
        continue
    pid = by_ign.get(r["id"].lower())
    if not pid:
        missing.append(f"{r['team']}:{r['id']}")
        continue
    im = Image.open(os.path.join(src, r["file"])).convert("RGBA")
    w, h = im.size
    s = min(w, h)
    x = (w - s) // 2
    im.crop((x, 0, x + s, s)).resize((512, 512), Image.LANCZOS).save(os.path.join(out, f"{pid}.png"))
    matched += 1

print(f"{matched} ảnh → {out}")
if missing:
    print("Không có trong pack:", ", ".join(missing))
