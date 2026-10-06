"""CI průzkum: kde jsou veřejně dotazovatelná vektorová data ÚP (ArcGIS Online, Hub JMK)."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


QUERIES = ["owner:mukuoi", "plochy s rozdílným způsobem využití", "UP_ AND (Brno OR jihomoravský OR JMK)"]

for q in QUERIES:
    url = "https://www.arcgis.com/sharing/rest/search?" + urllib.parse.urlencode(
        {"q": f'({q}) AND (type:"Feature Service" OR type:"Map Service")', "num": 40, "f": "json"})
    try:
        d = get(url)
    except Exception as exc:  # noqa: BLE001
        print("AGOL", q, "ERR", exc)
        continue
    print(f"== AGOL '{q}': {d.get('total')} výsledků")
    for it in d.get("results", []):
        print(" -", it.get("title"), "|", it.get("type"), "|", it.get("owner"), "|", it.get("url"), "|", it.get("access"))

for folder in ("PUBLIC", "OD", "KAM", "Hosted"):
    try:
        d = get(f"https://gis.brno.cz/ags1/rest/services/{folder}?f=json")
        names = [f"{s['name']} ({s['type']})" for s in d.get("services", [])]
        print(f"== gis.brno.cz/ags1 {folder}: {len(names)} služeb")
        for n in names:
            if any(k in n.lower() for k in ("up", "uzem", "územ", "plan", "plán", "rzv", "funk")):
                print(" -", n)
    except Exception as exc:  # noqa: BLE001
        print("Brno", folder, "ERR", exc)

try:
    d = get("https://geodata-jmkgis.opendata.arcgis.com/api/search/v1/collections/all/items?"
            + urllib.parse.urlencode({"q": "územní plán", "limit": 50}))
    print("== JMK hub:", d.get("numberMatched"))
    for f in d.get("features", []):
        p = f.get("properties", {})
        print(" -", p.get("title"), "|", p.get("type"), "|", p.get("url"))
except Exception as exc:  # noqa: BLE001
    print("JMK hub ERR", exc)
