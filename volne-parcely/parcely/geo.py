"""Společné geometrické pomůcky: sjednocení CRS a oprava geometrií."""
from __future__ import annotations

import logging

import geopandas as gpd
import numpy as np
import shapely
from pyproj import CRS

from . import CRS_KN

log = logging.getLogger("parcely")


class GeoDataError(Exception):
    """Data nejdou zpracovat (CRS, geometrie)."""


def ensure_5514(gdf: gpd.GeoDataFrame, label: str, fallback_crs: str | None = None) -> gpd.GeoDataFrame:
    """Vrátí data v EPSG:5514. Bez CRS použije fallback z configu, jinak chyba."""
    if gdf.crs is None:
        if not fallback_crs:
            raise GeoDataError(
                f"{label}: data nemají souřadnicový systém (chybí .prj). "
                "Doplň do configu 'crs', např. crs: EPSG:5514."
            )
        gdf = gdf.set_crs(CRS.from_user_input(fallback_crs))
    if gdf.crs.to_epsg(min_confidence=70) == CRS_KN:
        return gdf.set_crs(CRS_KN, allow_override=True)
    log.info("%s: převádím z %s do EPSG:%d", label, gdf.crs.name, CRS_KN)
    return gdf.to_crs(CRS_KN)


def _polygonal(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    parts = [p for p in shapely.get_parts(geom) if p.geom_type in ("Polygon", "MultiPolygon") and not p.is_empty]
    if not parts:
        return None
    return shapely.union_all(parts)


def fix_geometries(gdf: gpd.GeoDataFrame, label: str = "") -> tuple[gpd.GeoDataFrame, int]:
    """Opraví nevalidní polygony (make_valid) a zahodí prázdné. Vrací (data, počet opravených)."""
    geoms = gdf.geometry.values
    missing = shapely.is_missing(geoms)
    invalid = ~missing & ~shapely.is_valid(geoms)
    n_fixed = int(invalid.sum())
    if n_fixed:
        fixed = shapely.make_valid(np.asarray(geoms[invalid]))
        fixed = np.array([_polygonal(g) for g in fixed], dtype=object)
        gdf = gdf.copy()
        gdf.loc[invalid, gdf.geometry.name] = fixed
        log.info("%s: opraveno %d nevalidních geometrií (make_valid)", label or "data", n_fixed)
    empty = gdf.geometry.isna() | gdf.geometry.is_empty
    if empty.any():
        log.info("%s: vynecháno %d prázdných geometrií", label or "data", int(empty.sum()))
        gdf = gdf.loc[~empty]
    return gdf, n_fixed


def find_field(fields, name: str) -> str | None:
    """Najde název sloupce bez ohledu na velikost písmen."""
    wanted = name.casefold()
    for f in fields:
        if str(f).casefold() == wanted:
            return str(f)
    return None


def geometry_only(gdf: gpd.GeoDataFrame, keep: list[str] | None = None) -> gpd.GeoDataFrame:
    """Vybere sloupce `keep` + geometrii a geometrický sloupec pojmenuje „geometry“."""
    out = gdf[(keep or []) + [gdf.geometry.name]]
    if out.geometry.name != "geometry":
        out = out.rename_geometry("geometry")
    return out
