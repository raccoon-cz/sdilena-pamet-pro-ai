"""Výpočetní logika: průnik s ÚP, překryv budov, přístup, filtry a skóre.

Všechny funkce pracují s GeoDataFrame v EPSG:5514 (metry) a nemají vedlejší efekty,
takže jdou testovat na syntetických geometriích.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely


def _pair_intersection_area(left: gpd.GeoDataFrame, right: gpd.GeoDataFrame, pairs: pd.DataFrame) -> np.ndarray:
    a = left.geometry.loc[pairs.index].values
    b = right.geometry.loc[pairs["index_right"]].values
    return shapely.area(shapely.intersection(np.asarray(a), np.asarray(b)))


def up_overlap(parcels: gpd.GeoDataFrame, up_target: gpd.GeoDataFrame) -> pd.DataFrame:
    """Plocha a podíl průniku parcel s cílovými plochami ÚP.

    Podíl se počítá vůči sjednocení cílových ploch, takže případné překryvy ploch v datech ÚP
    se nezapočítají dvakrát. Kód/název je ten, jehož plochy pokrývají z parcely nejvíc.
    """
    area = parcels.geometry.area
    out = pd.DataFrame(
        {
            "plocha_geom_m2": area,
            "plocha_v_up_m2": 0.0,
            "podil": 0.0,
            "up_kod": "",
            "up_nazev": "",
            "up_detail": "",
        },
        index=parcels.index,
    )
    if up_target is None or up_target.empty or parcels.empty:
        return out

    left = parcels[["geometry"]]
    union = shapely.union_all(np.asarray(up_target.geometry.values))
    parts = [p for p in shapely.get_parts(union) if p.geom_type in ("Polygon", "MultiPolygon") and not p.is_empty]
    if parts:
        parts_gdf = gpd.GeoDataFrame(geometry=parts, crs=parcels.crs)
        pairs = gpd.sjoin(left, parts_gdf, predicate="intersects", how="inner")
        if not pairs.empty:
            inter = pd.Series(_pair_intersection_area(left, parts_gdf, pairs), index=pairs.index)
            sums = inter.groupby(level=0).sum()
            out.loc[sums.index, "plocha_v_up_m2"] = sums.values
            out["podil"] = (out["plocha_v_up_m2"] / out["plocha_geom_m2"].where(out["plocha_geom_m2"] > 0)).fillna(0).clip(0, 1)

    target = up_target[["up_kod", "up_nazev", "up_detail", "geometry"]].reset_index(drop=True)
    pairs = gpd.sjoin(left, target, predicate="intersects", how="inner")
    if pairs.empty:
        return out
    pairs = pairs.assign(a=_pair_intersection_area(left, target, pairs))
    pairs = pairs[pairs["a"] > 0]
    if pairs.empty:
        return out
    pairs = pairs.reset_index(names="pidx")
    by_code = pairs.groupby(["pidx", "up_kod"], as_index=False)["a"].sum()
    best_code = by_code.sort_values(["pidx", "a"], ascending=[True, False]).drop_duplicates("pidx")
    # název a detail z největšího prvku vítězného kódu
    biggest = pairs.sort_values("a", ascending=False).drop_duplicates(["pidx", "up_kod"])
    best = best_code[["pidx", "up_kod"]].merge(biggest[["pidx", "up_kod", "up_nazev", "up_detail"]], on=["pidx", "up_kod"])
    best = best.set_index("pidx")
    out.loc[best.index, ["up_kod", "up_nazev", "up_detail"]] = best[["up_kod", "up_nazev", "up_detail"]].values
    return out


def building_overlap(parcels: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame | None) -> pd.Series:
    """Největší plocha (m²), kterou do parcely zasahuje jedna budova. Bez budov 0."""
    out = pd.Series(0.0, index=parcels.index, name="budova_prekryv_m2")
    if buildings is None or buildings.empty or parcels.empty:
        return out
    b = buildings[["geometry"]].reset_index(drop=True)
    left = parcels[["geometry"]]
    pairs = gpd.sjoin(left, b, predicate="intersects", how="inner")
    if pairs.empty:
        return out
    inter = pd.Series(_pair_intersection_area(left, b, pairs), index=pairs.index)
    mx = inter.groupby(level=0).max()
    out.loc[mx.index] = mx.values
    return out


def access(
    parcels: gpd.GeoDataFrame,
    roads: gpd.GeoDataFrame | None,
    max_dist: float,
    search_dist: float = 100.0,
) -> pd.DataFrame:
    """Vzdálenost k nejbližší parcele-komunikaci a příznak přístupu (vzdálenost ≤ max_dist).

    Když komunikace nejde určit (roads je None), je přístup NA = neznámý.
    Parcela, která sama je komunikací, má vzdálenost 0.
    """
    out = pd.DataFrame(
        {"vzdalenost_komunikace_m": np.nan, "pristup": pd.array([pd.NA] * len(parcels), dtype="boolean")},
        index=parcels.index,
    )
    if roads is None or parcels.empty:
        return out
    out["pristup"] = False
    if roads.empty:
        return out
    near = gpd.sjoin_nearest(
        parcels[["geometry"]],
        roads[["geometry"]].reset_index(drop=True),
        how="inner",
        max_distance=max(search_dist, max_dist),
        distance_col="dist",
    )
    if not near.empty:
        d = near["dist"].groupby(level=0).min()
        out.loc[d.index, "vzdalenost_komunikace_m"] = d.values
    out["pristup"] = (out["vzdalenost_komunikace_m"] <= max_dist + 1e-9).astype("boolean")
    return out


@dataclass
class FilterResult:
    kandidati: gpd.GeoDataFrame
    lesni: gpd.GeoDataFrame
    vyrazene: gpd.GeoDataFrame
    kroky: list[dict] = field(default_factory=list)


STEP_LABELS = {
    "zastavena": "druh pozemku zastavěná plocha",
    "nevhodna": "nevhodný druh / způsob využití",
    "budova": "budova v parcele",
    "vymera": "výměra mimo rozsah",
    "podil": "podíl v ploše ÚP pod limitem",
    "lesni": "lesní pozemek",
}


def effective_area(df: pd.DataFrame) -> pd.Series:
    """Výměra z katastru; když chybí, plocha geometrie."""
    vym = pd.to_numeric(df["vymera"], errors="coerce")
    if "plocha_geom_m2" in df.columns:
        vym = vym.fillna(df["plocha_geom_m2"].round())
    return vym


def apply_filters(
    df: gpd.GeoDataFrame,
    *,
    zastavena_kody: set[int],
    lesni_kody: set[int],
    min_vymera: float,
    max_vymera: float,
    min_podil: float,
    max_prekryv_budovy: float,
    nevhodne_druhy: set[int] = frozenset(),
    nevhodne_zpusoby: set[int] = frozenset(),
    vyrazene_min_podil: float = 0.1,
    vyrazene_min_vymera: float = 0.0,
    budovy_dostupne: bool = True,
) -> FilterResult:
    """Postupně aplikuje filtry a počítá, kolik parcel každý krok vyřadil.

    Pořadí: zastavěná plocha → nevhodná (komunikace, voda) → budova → výměra → podíl v ÚP → lesní.
    """
    druh = df["druh_kod"]
    zpusob = df["zpusob_kod"] if "zpusob_kod" in df.columns else pd.Series(pd.NA, index=df.index, dtype="Int64")
    vym = effective_area(df)
    flags = {
        "zastavena": druh.isin(list(zastavena_kody)).fillna(False).astype(bool),
        "nevhodna": (druh.isin(list(nevhodne_druhy)) | zpusob.isin(list(nevhodne_zpusoby))).fillna(False).astype(bool),
        "budova": (df["budova_prekryv_m2"] > max_prekryv_budovy) if budovy_dostupne else pd.Series(False, index=df.index),
        "vymera": (vym < min_vymera) | (vym > max_vymera),
        "podil": df["podil"] < min_podil,
        "lesni": druh.isin(list(lesni_kody)).fillna(False).astype(bool),
    }
    remaining = pd.Series(True, index=df.index)
    first = pd.Series("", index=df.index, dtype=object)
    kroky = [{"krok": "vstup (všechny parcely KÚ)", "vyrazeno": 0, "zbyva": int(len(df))}]
    for key, label in STEP_LABELS.items():
        removed = remaining & flags[key]
        first[removed] = label
        remaining &= ~flags[key]
        if key == "budova" and not budovy_dostupne:
            label += " (přeskočeno – budovy nedostupné)"
        kroky.append({"krok": label, "vyrazeno": int(removed.sum()), "zbyva": int(remaining.sum())})

    fl = pd.DataFrame(flags)[list(STEP_LABELS)].to_numpy(dtype=bool).astype(object)
    labels = np.array([f"{v}; " for v in STEP_LABELS.values()], dtype=object)
    all_reasons = pd.Series((fl * labels).sum(axis=1) if len(df) else [], index=df.index, dtype=object)
    all_reasons = all_reasons.astype(str).str.removesuffix("; ")
    df = df.assign(vymera_filtr=vym, duvod=first, vsechny_duvody=all_reasons)
    lesni = df[first == STEP_LABELS["lesni"]]
    # K ručnímu posouzení jen „těsně vyřazené“: ne stávající domy, komunikace, voda a drobné zbytky.
    bez_sumu = ~first.isin(["", STEP_LABELS["lesni"], STEP_LABELS["zastavena"], STEP_LABELS["nevhodna"]])
    vyrazene = df[bez_sumu & (df["podil"] >= vyrazene_min_podil) & ~(vym < vyrazene_min_vymera)]
    return FilterResult(kandidati=df[remaining], lesni=lesni, vyrazene=vyrazene, kroky=kroky)


def score(
    df: pd.DataFrame,
    *,
    bonus_kody: set[int],
    min_vymera: float,
    max_vymera: float,
    idealni: tuple[float, float] = (800, 1500),
    vahy: dict[str, float] | None = None,
) -> pd.DataFrame:
    """Skóre 0–100: podíl v ploše (40), přístup (25), výměra blízko ideálu (20), druh pozemku (15).

    Výměra v ideálním rozsahu dostane plné body, směrem k min/max limitu lineárně klesá k nule.
    """
    w = {"podil": 40, "pristup": 25, "vymera": 20, "druh": 15, **(vahy or {})}
    lo, hi = idealni
    vym = effective_area(df).astype(float)
    below = ((vym - min_vymera) / max(lo - min_vymera, 1.0)).clip(0, 1)
    above = ((max_vymera - vym) / max(max_vymera - hi, 1.0)).clip(0, 1)
    vym_score = np.where(vym < lo, below, np.where(vym > hi, above, 1.0))

    s = pd.DataFrame(index=df.index)
    s["skore_podil"] = w["podil"] * df["podil"].astype(float).clip(0, 1)
    s["skore_pristup"] = w["pristup"] * df["pristup"].astype("boolean").fillna(False).astype(float)
    s["skore_vymera"] = w["vymera"] * pd.Series(vym_score, index=df.index).fillna(0)
    s["skore_druh"] = w["druh"] * df["druh_kod"].isin(list(bonus_kody)).fillna(False).astype(float)
    s["skore"] = s.sum(axis=1).round(1)
    return s.round(1)
