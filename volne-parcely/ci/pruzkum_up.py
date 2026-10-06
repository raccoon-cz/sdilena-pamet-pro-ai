"""CI průzkum: struktura veřejných ArcGIS služeb s územními plány (vrstvy, atributy, počty)."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

SLUZBY = [
    "https://services5.arcgis.com/uc4BIJvwXwgPHm8D/arcgis/rest/services/Mapa_UP_WFL1/FeatureServer",
    "https://services5.arcgis.com/uc4BIJvwXwgPHm8D/arcgis/rest/services/Map_UP1_WFL1/FeatureServer",
    "https://gis.brno.cz/ags1/rest/services/Hosted/KAM_up_navrh_wgs/MapServer",
    "https://services6.arcgis.com/nSl4NxcJbmr0IlpX/arcgis/rest/services/UP_kurim/FeatureServer",
    "https://services6.arcgis.com/nSl4NxcJbmr0IlpX/arcgis/rest/services/UP_cebin/FeatureServer",
]


def get(url: str, **params):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


for svc in SLUZBY:
    print(f"== {svc}")
    try:
        d = get(svc, f="json")
    except Exception as exc:  # noqa: BLE001
        print("   ERR", exc)
        continue
    print("   popis:", (d.get("serviceDescription") or d.get("description") or "")[:200].replace("\n", " "))
    for lyr in d.get("layers", []):
        line = f"   vrstva {lyr.get('id')}: {lyr.get('name')} ({lyr.get('geometryType')})"
        if lyr.get("geometryType") != "esriGeometryPolygon" or lyr.get("subLayerIds"):
            print(line)
            continue
        try:
            info = get(f"{svc}/{lyr['id']}", f="json")
            cnt = get(f"{svc}/{lyr['id']}/query", where="1=1", returnCountOnly="true", f="json").get("count")
            fields = [f["name"] for f in info.get("fields", [])]
            print(f"{line} – {cnt} prvků, SR {info.get('extent', {}).get('spatialReference')}, pole: {', '.join(fields)}")
            cand = [f for f in fields if any(k in f.lower() for k in ("typ", "kod", "funk", "zkr", "ozn", "plocha", "rzv", "nazev"))]
            for f in cand[:4]:
                st = get(f"{svc}/{lyr['id']}/query", where="1=1", outFields=f, returnDistinctValues="true",
                         returnGeometry="false", f="json")
                vals = sorted({str(x["attributes"].get(f)) for x in st.get("features", [])})
                print(f"      {f}: {len(vals)} hodnot: {', '.join(vals[:40])}")
        except Exception as exc:  # noqa: BLE001
            print(f"{line} – ERR {exc}")
