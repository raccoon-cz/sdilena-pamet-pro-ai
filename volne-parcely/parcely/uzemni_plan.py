"""Loader územního plánu z lokálního souboru (SHP / GPKG / GML / cokoli, co čte GDAL).

Očekává polygonovou vrstvu ploch s rozdílným způsobem využití. V jednotném standardu ÚP
(MMR) je to vrstva `PlochyRZV_p` s kódem plochy v atributu `Typ` – název atributu je ale
nastavitelný, protože se mezi obcemi liší.
"""
from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

from .config import UzemniPlan
from .geo import GeoDataError, ensure_5514, find_field, fix_geometries

log = logging.getLogger("parcely")

# Jednotný standard ÚP: CasH 1 = stabilizovaná plocha, 2 = návrh (plocha změny).
CASH_POPIS = {"1": "stabilizovaná", "2": "návrh"}


class UPError(Exception):
    """Data ÚP chybí nebo nemají očekávanou strukturu."""


def _samples(gdf: gpd.GeoDataFrame, col: str, n: int = 5) -> str:
    vals = gdf[col].dropna().astype(str).unique()[:n]
    return ", ".join(vals)


def pick_layer(path: Path, vrstva: str | None) -> str | None:
    layers = pyogrio.list_layers(path)
    names = [str(n) for n, _ in layers]
    if vrstva:
        found = find_field(names, vrstva)
        if not found:
            raise UPError(f"Soubor {path} nemá vrstvu „{vrstva}“. Vrstvy v souboru: {', '.join(names)}.")
        return found
    if len(layers) <= 1:
        return None
    polygon = [str(n) for n, gt in layers if gt and "polygon" in str(gt).lower()]
    preferred = [n for n in polygon if "plochyrzv" in n.lower()]
    if len(preferred) == 1:
        return preferred[0]
    if len(polygon) == 1:
        return polygon[0]
    raise UPError(
        f"Soubor {path} má více vrstev ({', '.join(names)}). Nastav v configu 'vrstva' "
        "(v jednotném standardu ÚP je to obvykle PlochyRZV_p)."
    )


def load_up(up: UzemniPlan, nazvy_ploch: dict[str, str] | None = None) -> gpd.GeoDataFrame:
    """Načte ÚP obce. Výstup: up_kod, up_nazev, up_detail, geometry (EPSG:5514)."""
    label = f"ÚP {up.obec}"
    if not up.cesta.exists():
        raise UPError(
            f"Chybí data ÚP pro obec „{up.obec}“: soubor {up.cesta} neexistuje. "
            "Stáhni vektorová data ÚP (README, sekce Data územního plánu) a oprav 'cesta' v configu."
        )
    layer = pick_layer(up.cesta, up.vrstva)
    try:
        gdf = pyogrio.read_dataframe(up.cesta, layer=layer, encoding=up.kodovani)
    except Exception as exc:  # GDAL chyby nemají jednotnou třídu
        raise UPError(f"{label}: soubor {up.cesta} nejde přečíst: {exc}") from exc
    if gdf.empty:
        raise UPError(f"{label}: vrstva {layer or '(výchozí)'} v {up.cesta} je prázdná.")

    fields = [c for c in gdf.columns if c != gdf.geometry.name]
    kod_col = find_field(fields, up.atribut_kod)
    if not kod_col:
        ukazky = "; ".join(f"{c}: {_samples(gdf, c, 3)}" for c in fields[:15])
        raise UPError(
            f"{label}: atribut s kódem plochy „{up.atribut_kod}“ neexistuje. "
            f"Dostupné atributy (ukázky hodnot): {ukazky}. Nastav 'atribut_kod' v configu."
        )
    nazev_col = find_field(fields, up.atribut_nazev) if up.atribut_nazev else None
    if up.atribut_nazev and not nazev_col:
        log.warning("%s: atribut s názvem plochy „%s“ neexistuje, použiji názvy z configu", label, up.atribut_nazev)

    for attr, allowed in up.filtr.items():
        col = find_field(fields, attr)
        if not col:
            raise UPError(f"{label}: atribut pro filtr „{attr}“ neexistuje. Dostupné: {', '.join(fields)}.")
        before = len(gdf)
        values = gdf[col].map(lambda v: "" if pd.isna(v) else str(v).strip().removesuffix(".0"))
        gdf = gdf[values.isin([a.strip() for a in allowed])]
        log.info("%s: filtr %s ∈ %s ponechal %d z %d ploch", label, col, allowed, len(gdf), before)

    try:
        gdf = ensure_5514(gdf, label, up.crs)
    except GeoDataError as exc:
        raise UPError(str(exc)) from exc
    gdf = gdf[gdf.geometry.notna() & gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon", "GeometryCollection"])]
    gdf, _ = fix_geometries(gdf, label)

    codes = gdf[kod_col].map(lambda v: "" if pd.isna(v) else str(v).strip().upper())
    names_cfg = {str(k).upper(): v for k, v in (nazvy_ploch or {}).items()}
    if nazev_col:
        names = gdf[nazev_col].fillna("").astype(str).str.strip()
        names = names.where(names != "", codes.map(lambda c: names_cfg.get(c, "")))
    else:
        names = codes.map(lambda c: names_cfg.get(c, ""))

    info_cols = [(a, c) for a in up.atributy_info if (c := find_field(fields, a))]

    def detail(row) -> str:
        parts = []
        for attr, col in info_cols:
            v = row[col]
            if v is None or pd.isna(v) or str(v).strip() == "":
                continue
            v = str(v).strip().removesuffix(".0")
            if attr.casefold() == "cash" and v in CASH_POPIS:
                v = f"{v} ({CASH_POPIS[v]})"
            parts.append(f"{col}={v}")
        return ", ".join(parts)

    details = gdf.apply(detail, axis=1) if info_cols else pd.Series("", index=gdf.index)
    out = gpd.GeoDataFrame(
        {"up_kod": codes.values, "up_nazev": names.values, "up_detail": details.values},
        geometry=gdf.geometry.values,
        crs=gdf.crs,
    )
    log.info("%s: %d ploch, kódy: %s", label, len(out), ", ".join(sorted(out["up_kod"].unique())[:30]))
    return out


def is_target(codes: pd.Series, cilove: list[str], mode: str = "presne") -> pd.Series:
    cilove = [c.upper() for c in cilove]
    if mode == "prefix":
        return codes.map(lambda c: any(str(c).startswith(t) for t in cilove))
    return codes.isin(cilove)
