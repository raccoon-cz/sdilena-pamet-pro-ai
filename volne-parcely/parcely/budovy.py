"""Zdroj obrysů budov: vrstva v SHP balíčku KN, RÚIAN VFR, nebo lokální soubor."""
from __future__ import annotations

import calendar
import datetime as dt
import logging
import zipfile
from pathlib import Path

import geopandas as gpd
import pyogrio

from .download import DownloadError, download
from .geo import ensure_5514, fix_geometries, geometry_only
from .kn import KNPackage, SchemaError, load_buildings_from_package

log = logging.getLogger("parcely")


def _last_days_of_previous_months(today: dt.date, count: int = 3) -> list[dt.date]:
    out = []
    y, m = today.year, today.month
    for _ in range(count):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(dt.date(y, m, calendar.monthrange(y, m)[1]))
    return out


def load_vfr_buildings(cfg, kod_obce: int, today: dt.date | None = None) -> gpd.GeoDataFrame:
    """Obrysy stavebních objektů obce z výměnného formátu RÚIAN (soubor po obcích).

    Soubory po obcích nesou v názvu poslední den měsíce; zkouší se poslední tři měsíce.
    """
    z = cfg["zdroje"]
    dest = None
    last_err = ""
    for datum in _last_days_of_previous_months(today or dt.date.today()):
        stamp = datum.strftime("%Y%m%d")
        url = z["vfr_url"].format(datum=stamp, kod_obce=kod_obce)
        target = Path(cfg.cache_dir) / "vfr" / f"{stamp}_OB_{kod_obce}_UKSH.xml.zip"
        try:
            dest, _ = download(url, target, pokusy=int(z["pokusy"]), backoff_s=float(z["backoff_s"]),
                               timeout_s=float(z["timeout_s"]))
            break
        except DownloadError as exc:
            last_err = str(exc)
    if dest is None:
        raise DownloadError(f"VFR obce {kod_obce} se nepodařilo stáhnout: {last_err}")

    with zipfile.ZipFile(dest) as zf:
        xml = [n for n in zf.namelist() if n.lower().endswith(".xml")]
    if not xml:
        raise SchemaError(f"{dest.name} neobsahuje XML.")
    path = f"/vsizip/{Path(dest).resolve().as_posix()}/{xml[0]}"
    try:
        # Vrstva má více geometrických sloupců; obrys budovy je v OriginalniHranice.
        gdf = pyogrio.read_dataframe(path, sql="SELECT OriginalniHranice FROM StavebniObjekty")
    except Exception as exc:  # noqa: BLE001 – GDAL hlásí různé třídy chyb
        log.info("VFR: výběr geometrie OriginalniHranice selhal (%s), čtu výchozí geometrii", exc)
        gdf = pyogrio.read_dataframe(path, layer="StavebniObjekty")
    gdf = gdf[gdf.geometry.notna() & gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if gdf.empty:
        raise SchemaError("VFR: vrstva StavebniObjekty neobsahuje polygony budov.")
    gdf = ensure_5514(gdf, f"VFR obec {kod_obce}")
    gdf, _ = fix_geometries(gdf, f"VFR obec {kod_obce}")
    return geometry_only(gdf).reset_index(drop=True)


def load_buildings(cfg, pkg: KNPackage, parcels: gpd.GeoDataFrame, label: str) -> tuple[gpd.GeoDataFrame | None, str]:
    """Vrací (budovy, popis zdroje). Když budovy nejsou k dispozici, vrací (None, důvod)."""
    b_cfg = cfg["budovy"]
    zdroj = b_cfg["zdroj"]
    layer = cfg["kn"]["vrstva_budovy"]
    if zdroj == "zadne":
        return None, "vypnuto v configu (budovy.zdroj = zadne)"

    if zdroj in ("auto", "shp"):
        b = load_buildings_from_package(pkg, layer, label)
        if b is not None:
            return b, f"SHP balíček ({layer})"
        if zdroj == "shp":
            raise SchemaError(f"V balíčku chybí vrstva budov {layer}. Dostupné: {', '.join(pkg.layers)}.")
        log.info("%s: vrstva %s v balíčku není, zkouším RÚIAN VFR", label, layer)

    if zdroj == "soubor":
        path = cfg.resolve(b_cfg["soubor"])
        if not path.exists():
            raise FileNotFoundError(f"Soubor s budovami {path} neexistuje (budovy.soubor).")
        gdf = pyogrio.read_dataframe(path, layer=b_cfg.get("vrstva"))
        gdf = ensure_5514(gdf, f"budovy {path.name}")
        gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
        gdf, _ = fix_geometries(gdf, "budovy")
        minx, miny, maxx, maxy = parcels.total_bounds
        gdf = gdf.cx[minx:maxx, miny:maxy]
        return geometry_only(gdf).reset_index(drop=True), f"soubor {path.name}"

    # VFR
    if "obec_kod" not in parcels.columns or parcels["obec_kod"].dropna().empty:
        return None, "RÚIAN VFR: v datech parcel chybí kód obce (OBEC_KOD)"
    frames = []
    for kod in sorted(parcels["obec_kod"].dropna().unique()):
        try:
            frames.append(load_vfr_buildings(cfg, int(kod)))
        except (DownloadError, SchemaError, OSError) as exc:
            log.warning("%s: budovy z VFR obce %s nejsou k dispozici: %s", label, kod, exc)
    if not frames:
        return None, "RÚIAN VFR nedostupný"
    gdf = gpd.GeoDataFrame(geometry=[g for f in frames for g in f.geometry], crs=frames[0].crs)
    return gdf, "RÚIAN VFR (StavebniObjekty)"
