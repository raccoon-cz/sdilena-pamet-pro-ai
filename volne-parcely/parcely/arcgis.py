"""Načtení vrstvy z veřejné ArcGIS REST služby (FeatureServer / MapServer).

Řada obcí a ORP publikuje územní plán jako veřejnou ArcGIS službu. Vrstva se stáhne přes
standardní dotaz `/query` (stránkovaně), uloží do cache jako GeoPackage a dál se s ní pracuje
jako se souborem. Do cache se ukládá i čas stažení; `download --force` ji obnoví.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import tempfile
import time
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
import requests

from .download import USER_AGENT, _describe

log = logging.getLogger("parcely")

_SERVICE_RE = re.compile(r"/(FeatureServer|MapServer)(/(\d+))?/?$", re.IGNORECASE)


class ArcGISError(Exception):
    """Služba nevrátila použitelná data."""


def is_service_url(text: str | Path) -> bool:
    s = str(text)
    return s.startswith(("http://", "https://")) and bool(_SERVICE_RE.search(s.split("?")[0]))


def _get_json(url: str, params: dict | None = None, pokusy: int = 4, backoff_s: float = 2, timeout_s: float = 120):
    last = ""
    for attempt in range(1, pokusy + 1):
        try:
            r = requests.get(url, params=params, timeout=(20, timeout_s), headers={"User-Agent": USER_AGENT})
            if r.status_code in (401, 403, 404):
                raise ArcGISError(f"{url}: HTTP {r.status_code} (služba neexistuje nebo není veřejná)")
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict) and "error" in data:
                err = data["error"]
                raise ArcGISError(f"{url}: chyba služby {err.get('code')}: {err.get('message')} {err.get('details') or ''}")
            return data
        except ArcGISError:
            raise
        except (requests.RequestException, ValueError) as exc:
            last = _describe(exc) if isinstance(exc, requests.RequestException) else f"neplatná odpověď: {exc}"
            if attempt < pokusy:
                wait = backoff_s * 2 ** (attempt - 1)
                log.warning("Dotaz na %s selhal (%s), pokus %d/%d, čekám %.0f s", url, last, attempt, pokusy, wait)
                time.sleep(wait)
    raise ArcGISError(f"{url} nedostupná ani po {pokusy} pokusech: {last}")


def list_layers(service_url: str) -> list[dict]:
    """Vrstvy služby: [{'id', 'name', 'geometryType'}]."""
    base = service_url.split("?")[0].rstrip("/")
    m = _SERVICE_RE.search(base)
    if m and m.group(3):
        base = base[: m.start(2)]
    data = _get_json(base, {"f": "json"})
    return [{"id": lyr.get("id"), "name": lyr.get("name"), "geometryType": lyr.get("geometryType")}
            for lyr in data.get("layers", [])]


def resolve_layer_url(url: str, vrstva: str | int | None = None) -> str:
    """URL konkrétní vrstvy. U URL služby bez čísla vrstvy vybere podle `vrstva` (id nebo název)
    nebo jedinou polygonovou vrstvu."""
    base = url.split("?")[0].rstrip("/")
    m = _SERVICE_RE.search(base)
    if m and m.group(3):
        return base
    layers = list_layers(base)
    popis = ", ".join(f"{lyr['id']}: {lyr['name']} ({lyr['geometryType']})" for lyr in layers)
    if vrstva is not None and str(vrstva).strip() != "":
        for lyr in layers:
            if str(lyr["id"]) == str(vrstva) or str(lyr["name"]).casefold() == str(vrstva).casefold():
                return f"{base}/{lyr['id']}"
        raise ArcGISError(f"Služba {base} nemá vrstvu „{vrstva}“. Vrstvy: {popis}")
    polygons = [lyr for lyr in layers if lyr.get("geometryType") == "esriGeometryPolygon"]
    if len(polygons) == 1:
        return f"{base}/{polygons[0]['id']}"
    raise ArcGISError(f"Služba {base} má více vrstev – nastav 'vrstva' (id nebo název). Vrstvy: {popis}")


def _cache_path(cache_dir: Path, layer_url: str, where: str) -> Path:
    key = hashlib.sha1(f"{layer_url}|{where}".encode()).hexdigest()[:12]
    name = re.sub(r"[^A-Za-z0-9]+", "_", layer_url.split("/rest/services/")[-1]).strip("_")[:60]
    return Path(cache_dir) / "up" / f"{name}_{key}.gpkg"


def fetch_layer(layer_url: str, where: str = "1=1", out_sr: int = 5514) -> gpd.GeoDataFrame:
    """Stáhne všechny prvky vrstvy (stránkovaně) a vrátí GeoDataFrame."""
    info = _get_json(layer_url, {"f": "json"})
    if info.get("type") not in (None, "Feature Layer"):
        raise ArcGISError(f"{layer_url} není vektorová vrstva (typ {info.get('type')}).")
    page = int(info.get("maxRecordCount") or 1000)
    paging = bool((info.get("advancedQueryCapabilities") or {}).get("supportsPagination"))
    base = {"where": where, "outFields": "*", "returnGeometry": "true", "outSR": out_sr, "f": "json"}

    pages: list[dict] = []
    if paging:
        offset = 0
        while True:
            data = _get_json(f"{layer_url}/query", {**base, "resultOffset": offset, "resultRecordCount": page})
            pages.append(data)
            n = len(data.get("features", []))
            offset += n
            if n == 0 or not data.get("exceededTransferLimit"):
                break
    else:
        ids = _get_json(f"{layer_url}/query", {"where": where, "returnIdsOnly": "true", "f": "json"})
        oids = sorted(ids.get("objectIds") or [])
        for i in range(0, max(len(oids), 1), page):
            chunk = oids[i:i + page]
            if not chunk:
                break
            params = {k: v for k, v in base.items() if k != "where"}
            pages.append(_get_json(f"{layer_url}/query", {**params, "objectIds": ",".join(map(str, chunk))}))

    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, data in enumerate(pages):
            if not data.get("features"):
                continue
            path = Path(tmp) / f"page_{i}.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            frames.append(pyogrio.read_dataframe(path))
    if not frames:
        raise ArcGISError(f"{layer_url}: dotaz „{where}“ nevrátil žádné prvky.")
    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry=frames[0].geometry.name, crs=frames[0].crs)
    log.info("ArcGIS %s: %d prvků (%d stran)", layer_url, len(gdf), len(pages))
    return gdf


def load_cached(cache_dir: Path, url: str, vrstva=None, where: str = "1=1", force: bool = False) -> Path:
    """Vrstvu stáhne do cache (GeoPackage) a vrátí cestu. Existující cache se použije."""
    layer_url = resolve_layer_url(url, vrstva)
    path = _cache_path(cache_dir, layer_url, where)
    if path.exists() and not force:
        log.debug("Cache ÚP: %s", path)
        return path
    gdf = fetch_layer(layer_url, where)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part.gpkg")
    tmp.unlink(missing_ok=True)
    gdf.to_file(tmp, layer="up", driver="GPKG", engine="pyogrio")
    tmp.replace(path)
    path.with_suffix(".txt").write_text(f"{layer_url}\nwhere={where}\nstaženo={time.strftime('%Y-%m-%d %H:%M')}\n",
                                        encoding="utf-8")
    log.info("ÚP ze služby uložen do cache: %s", path)
    return path
