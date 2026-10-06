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


# Kódy ploch s rozdílným způsobem využití (2. úroveň členění dle jednotného standardu ÚP a
# běžné varianty). Slouží jen k automatickému nalezení atributu s kódem (atribut_kod: auto).
ZNAME_KODY = {
    "BH", "BI", "BV", "BX", "BK", "SC", "SM", "SV", "SR", "SX", "SK", "RI", "RZ", "RN", "RH", "RX",
    "OV", "OS", "OM", "OH", "OK", "OL", "OX", "PV", "PZ", "PX", "ZV", "ZS", "ZO", "ZP", "ZK", "ZX",
    "DS", "DZ", "DL", "DV", "DX", "DK", "TI", "TX", "TE", "TW", "VL", "VZ", "VD", "VX", "VT", "VS",
    "WT", "W", "NZ", "NL", "NP", "NS", "NX", "NK", "NT", "NV", "NU", "XX", "KX", "ZZ",
}


def detect_code_field(gdf: gpd.GeoDataFrame) -> tuple[str | None, float]:
    """Najde atribut, jehož hodnoty nejvíc odpovídají kódům ploch (BI, SV, NZ…)."""
    best, best_share = None, 0.0
    for col in gdf.columns:
        if col == gdf.geometry.name or not (gdf[col].dtype == object or pd.api.types.is_string_dtype(gdf[col])):
            continue
        vals = gdf[col].dropna().astype(str).str.strip().str.upper()
        if vals.empty:
            continue
        prefix = vals.str.extract(r"^([A-Z]{1,2})(?:$|[^A-Z])", expand=False)
        share = float(prefix.isin(ZNAME_KODY).mean())
        if share > best_share:
            best, best_share = str(col), share
    return (best, best_share) if best_share >= 0.5 else (None, best_share)


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


def resolve_source(up: UzemniPlan, cache_dir: Path | None = None, force: bool = False) -> tuple[Path, str | None]:
    """Vrátí (soubor, vrstva). ArcGIS službu nejdřív stáhne do cache."""
    if up.je_sluzba:
        from .arcgis import ArcGISError, load_cached

        try:
            return load_cached(Path(cache_dir or "data/cache"), str(up.cesta), up.vrstva, up.where, force=force), "up"
        except ArcGISError as exc:
            raise UPError(f"ÚP {up.obec}: {exc}") from exc
    path = Path(up.cesta)
    if not path.exists():
        raise UPError(
            f"Chybí data ÚP pro obec „{up.obec}“: soubor {path} neexistuje. "
            "Stáhni vektorová data ÚP (README, sekce Data územního plánu) a oprav 'cesta' v configu."
        )
    return path, pick_layer(path, up.vrstva)


def load_up(up: UzemniPlan, nazvy_ploch: dict[str, str] | None = None, cache_dir: Path | None = None) -> gpd.GeoDataFrame:
    """Načte ÚP obce ze souboru nebo z ArcGIS služby. Výstup: up_kod, up_nazev, up_detail, geometry (EPSG:5514)."""
    label = f"ÚP {up.obec}"
    path, layer = resolve_source(up, cache_dir)
    try:
        gdf = pyogrio.read_dataframe(path, layer=layer, encoding=up.kodovani)
    except Exception as exc:  # GDAL chyby nemají jednotnou třídu
        raise UPError(f"{label}: soubor {path} nejde přečíst: {exc}") from exc
    if gdf.empty:
        raise UPError(f"{label}: vrstva {layer or '(výchozí)'} v {path} je prázdná.")

    fields = [c for c in gdf.columns if c != gdf.geometry.name]
    if up.atribut_kod.casefold() == "auto":
        kod_col, share = detect_code_field(gdf)
        if kod_col:
            log.info("%s: atribut s kódem plochy určen automaticky: %s (%.0f %% hodnot jsou kódy ploch)",
                     label, kod_col, share * 100)
    else:
        kod_col = find_field(fields, up.atribut_kod)
    if not kod_col:
        ukazky = "; ".join(f"{c}: {_samples(gdf, c, 3)}" for c in fields[:15])
        co = ("se nepodařilo určit automaticky" if up.atribut_kod.casefold() == "auto"
              else f"„{up.atribut_kod}“ neexistuje")
        raise UPError(
            f"{label}: atribut s kódem plochy {co}. "
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
