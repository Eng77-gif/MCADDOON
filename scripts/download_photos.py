"""Download each player's infobox photo from Leaguepedia (lol.fandom.com).

Usage: python3 download_photos.py players.json OUT_DIR
Writes OUT_DIR/<Team>/<ID>.<ext> and OUT_DIR/players.csv.
"""
import csv, html, json, os, re, sys, time, urllib.parse, urllib.request

API = "https://lol.fandom.com/api.php"
UA = {"User-Agent": "MCADDOON-photo-fetch/1.0"}


def get(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))


def infobox_image(page):
    q = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "text", "section": 0,
                                "format": "json", "formatversion": 2, "redirects": 1})
    data = json.loads(get(f"{API}?{q}"))
    if "error" in data:
        raise RuntimeError(data["error"].get("info"))
    text = data["parse"]["text"]
    box = re.search(r'id="infoboxPlayer".*?</table>', text, re.S)
    m = box and re.search(r'<a href="(https://static\.wikia\.nocookie\.net/[^"]+)" class="mw-file-description', box.group(0))
    return html.unescape(m.group(1)) if m else None


def safe(s):
    return re.sub(r'[\\/:*?"<>|]', "_", s).strip()


def main(players_path, out_dir):
    players = json.load(open(players_path, encoding="utf-8"))
    rows = []
    for n, p in enumerate(players, 1):
        file, url = "", ""
        try:
            url = infobox_image(p["page"]) or ""
            if url:
                ext = os.path.splitext(urllib.parse.urlparse(url).path.split("/revision/")[0])[1] or ".png"
                rel = os.path.join(safe(p["team"]), safe(p["id"]) + ext.lower())
                dest = os.path.join(out_dir, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                if not os.path.exists(dest):
                    data = get(url)
                    with open(dest, "wb") as f:
                        f.write(data)
                file = rel
            status = "ok" if file else "no image"
        except Exception as e:
            status = f"error: {e}"
        print(f"[{n}/{len(players)}] {p['team']} / {p['id']}: {status}", flush=True)
        rows.append({**p, "file": file, "source": url, "status": status})
        time.sleep(1)
    with open(os.path.join(out_dir, "players.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main(*sys.argv[1:3])
