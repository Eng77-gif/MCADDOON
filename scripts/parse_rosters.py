"""Extract players from rendered Leaguepedia Team Rosters pages (action=parse JSON)."""
import html, json, re, sys

rows = []
for path in sys.argv[1:]:
    text = json.load(open(path, encoding="utf-8"))["parse"]["text"]
    stage = "Play-In" if "Play-In" in path else "Main Event"
    # Each team section starts with an <h3> heading, followed by its roster table.
    for section in re.split(r"<h3", text)[1:]:
        team = re.search(r'class="mw-headline" id="([^"]+)"', section)
        team = html.unescape(team.group(1)).strip("\u2060").replace("_", " ") if team else ""
        table = re.search(r'<table class="[^"]*extended-rosters.*?</table>', section, re.S)
        if not table:
            continue
        table = table.group(0)
        for tr in re.findall(r'<tr class="multirow-highlighter".*?</tr>', table, re.S):
            link = re.search(r'extended-rosters-id"[^>]*><a href="/wiki/([^"]+)"[^>]*title="([^"]+)">([^<]+)</a>', tr)
            if not link:
                continue
            role = re.search(r'title="([^"]+)" class="sprite role-sprite', tr)
            country = re.search(r'title="([^"]+)" class="sprite country-sprite', tr)
            name = re.search(r'extended-rosters-name"[^>]*>(.*?)</td>', tr, re.S)
            rows.append({
                "id": html.unescape(link.group(3)),
                "page": html.unescape(link.group(2)),
                "team": team,
                "role": role.group(1) if role else "",
                "country": country.group(1) if country else "",
                "name": html.unescape(re.sub("<[^>]+>", "", name.group(1))).strip() if name else "",
                "stage": stage,
            })

seen, out = set(), []
for r in rows:
    key = (r["page"], r["team"])
    if key not in seen:
        seen.add(key)
        out.append(r)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
