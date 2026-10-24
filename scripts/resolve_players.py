"""Resolve player IDs to Leaguepedia pages, following disambiguation pages.

Usage: python3 resolve_players.py extra_rosters.txt > candidates.json
Input lines: "<TEAM>: <ID>, <ID>, ..."
Prints every candidate page with its infobox team so ambiguous IDs can be picked.
"""
import html, json, re, sys, time, urllib.parse

from download_photos import API, get


def parse(page):
    q = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "text", "section": 0,
                                "format": "json", "formatversion": 2, "redirects": 1})
    data = json.loads(get(f"{API}?{q}"))
    time.sleep(1)
    if "error" in data:
        return None, ""
    return data["parse"]["title"], data["parse"]["text"]


def infobox(text):
    box = re.search(r'id="infoboxPlayer".*?</table>', text, re.S)
    if not box:
        return None
    fields = {}
    for label, value in re.findall(r'class="infobox-label">(.*?)</td><td[^>]*>(.*?)</td>', box.group(0), re.S):
        fields[re.sub("<[^>]+>", "", label).strip()] = html.unescape(re.sub("<[^>]+>", " ", value)).split("\n")[0].strip()
    return fields


out = []
for line in open(sys.argv[1], encoding="utf-8"):
    if ":" not in line:
        continue
    team, ids = line.split(":", 1)
    for pid in [s.strip() for s in ids.split(",") if s.strip()]:
        title, text = parse(pid)
        cands = []
        if title:
            box = infobox(text)
            if box is not None:
                cands.append({"page": title, **box})
            else:
                links = set(html.unescape(urllib.parse.unquote(l)).replace("_", " ")
                            for l in re.findall(r'href="/wiki/([^"#?]+)"', text))
                for link in sorted(l for l in links if l.lower().startswith(pid.lower() + " (")):
                    t2, text2 = parse(link)
                    box = infobox(text2) if t2 else None
                    if box is not None:
                        cands.append({"page": t2, **box})
        print(team.strip(), pid, [(c["page"], c.get("Team"), c.get("Role")) for c in cands], file=sys.stderr, flush=True)
        out.append({"team": team.strip(), "id": pid, "candidates": cands})
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
