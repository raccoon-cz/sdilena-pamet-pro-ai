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
# běžné varianty) a jednopísmenné kódy starších ÚP (B, S, O, D, …). Slouží jen k automatickému
# nalezení atributu s kódem (atribut_kod: auto).
ZNAME_KODY = {
    "BH", "BI", "BV", "BX", "BK", "SC", "SM", "SV", "SR", "SX", "SK", "RI", "RZ", "RN", "RH", "RX",
    "OV", "OS", "OM", "OH", "OK", "OL", "OX", "PV", "PZ", "PX", "ZV", "ZS", "ZO", "ZP", "ZK", "ZX",
    "DS", "DZ", "DL", "DV", "DX", "DK", "TI", "TX", "TE", "TW", "VL", "VZ", "VD", "VX", "VT", "VS",
    "WT", "W", "NZ", "NL", "NP", "NS", "NX", "NK", "NT", "NV", "NU", "XX", "KX", "ZZ",
}
JEDNOPISMENNE = set("ABDHKLNOPRSTUVWXZ")


def _text_columns(gdf: gpd.GeoDataFrame) -> list[str]:
    return [str(c) for c in gdf.columns if c != gdf.geometry.name
            and (gdf[c].dtype == object or pd.api.types.is_string_dtype(gdf[c]))]


def detect_code_field(gdf: gpd.GeoDataFrame) -> tuple[str | None, float]:
    """Najde atribut s kódem plochy (BI, SV, NZ… nebo jednopísmenné B, D, Z…).

    Rozhoduje podíl hodnot, které vypadají jako kód; při shodě vyhraje atribut s víc různými
    hodnotami (např. funkce plochy proti stavu S/N).
    """
    best, best_key = None, (0.0, 0)
    for col in _text_columns(gdf):
        vals = gdf[col].dropna().astype(str).str.strip().str.upper()
        vals = vals[vals != ""]
        if vals.empty:
            continue
        prefix = vals.str.extract(r"^([A-Z]{1,2})(?:$|[^A-Z])", expand=False)
        ok = prefix.isin(ZNAME_KODY) | prefix.isin(JEDNOPISMENNE)
        share = float(ok.mean())
        distinct = int(vals[ok].nunique())
        if distinct < 3 or distinct > 60:  # S/N není funkce plochy; stovky hodnot = označení plochy
            continue
        if len(vals) >= 5 and vals.nunique() / len(vals) > 0.8:  # téměř unikátní = identifikátor (A001…)
            continue
        key = (round(share, 2), distinct)
        if key > best_key:
            best, best_key = col, key
    return (best, best_key[0]) if best_key[0] >= 0.8 else (None, best_key[0])


def detect_name_field(gdf: gpd.GeoDataFrame, kod_col: str) -> str | None:
    """Najde atribut s názvem plochy: text „Plochy …“, který je jednoznačně určen kódem."""
    from .ciselniky import normalize

    best, best_n = None, 0
    codes = gdf[kod_col].astype(str).str.strip()
    for col in _text_columns(gdf):
        if col == kod_col:
            continue
        vals = gdf[col].fillna("").astype(str).str.strip()
        if (vals.map(normalize).str.startswith("ploch")).mean() < 0.5:
            continue
        pairs = pd.DataFrame({"k": codes, "n": vals}).drop_duplicates()
        if pairs["k"].nunique() / max(len(pairs), 1) < 0.9:  # název musí být funkcí kódu
            continue
        n = int(vals.nunique())
        if n > best_n:
            best, best_n = col, n
    return best


def _stems(term: str) -> list[str]:
    from .ciselniky import normalize

    return [w[:5] for w in normalize(term).replace("-", " ").split() if w]


def name_matches(name: str, terms: list[str]) -> bool:
    """Shoda názvu s hledaným výrazem: každé slovo výrazu (prvních 5 znaků) začíná některé slovo názvu.

    „smíšené obytné“ tak najde „Plochy smíšené obytné“ i „Plocha smíšená obytná“.
    """
    from .ciselniky import normalize

    words = normalize(name).replace("-", " ").replace("(", " ").replace(")", " ").split()
    for term in terms:
        stems = _stems(term)
        if stems and all(any(w.startswith(st) for w in words) for st in stems):
            return True
    return False


def select_targets(up: gpd.GeoDataFrame, kody: list[str], nazvy: list[str], vyjma: list[str],
                   mode: str = "presne", label: str = "ÚP") -> pd.Series:
    """Příznak cílové plochy. Primárně podle kódů; když ÚP žádný z kódů nemá, podle názvů."""
    by_code = is_target(up["up_kod"], kody, mode)
    if by_code.any() or not nazvy:
        return by_code
    names = up["up_nazev"].fillna("").astype(str)
    mask = names.map(lambda n: name_matches(n, nazvy)) & ~names.map(lambda n: name_matches(n, vyjma) if vyjma else False)
    vybrano = sorted({f"{k} {n}".strip() for k, n in zip(up.loc[mask, "up_kod"], names[mask])})
    if vybrano:
        log.info("%s: kódy %s v ÚP nejsou – cílové plochy vybrány podle názvu (%s): %s",
                 label, ", ".join(kody), ", ".join(nazvy), "; ".join(vybrano))
    else:
        log.warning("%s: ÚP neobsahuje kódy %s ani plochy s názvem %s. Kódy v ÚP: %s",
                    label, ", ".join(kody), ", ".join(nazvy),
                    "; ".join(sorted({f"{k} {n}".strip() for k, n in zip(up["up_kod"], names)})[:40]))
    return mask


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
    if up.atribut_nazev and up.atribut_nazev.casefold() == "auto":
        nazev_col = detect_name_field(gdf, kod_col)
        if nazev_col:
            log.info("%s: atribut s názvem plochy určen automaticky: %s", label, nazev_col)
    else:
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
