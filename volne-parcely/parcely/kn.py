"""Čtení SHP balíčku katastrální mapy ČÚZK (jedno katastrální území = jeden ZIP).

Balíček se čte přímo ze ZIPu (GDAL /vsizip/), nerozbaluje se. Názvy vrstev a atributů
jsou v configu (sekce `kn`), loader je hledá bez ohledu na velikost písmen a při
nesouladu vypíše, co v datech skutečně je.
"""
from __future__ import annotations

import logging
import warnings
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

from .config import REQUIRED_KN_ATTRS
from .geo import ensure_5514, find_field, fix_geometries, geometry_only

log = logging.getLogger("parcely")


class SchemaError(Exception):
    """Data nemají očekávanou strukturu (vrstva nebo atribut chybí)."""


class KNPackage:
    def __init__(self, zip_path: str | Path, encoding: str | None = "cp1250"):
        self.zip_path = Path(zip_path).resolve()
        with zipfile.ZipFile(self.zip_path) as zf:
            names = zf.namelist()
        self.members = {Path(n).stem.upper(): n for n in names if n.lower().endswith(".shp")}
        self._has_cpg = {Path(n).stem.upper() for n in names if n.lower().endswith(".cpg")}
        self.default_encoding = encoding
        self.files = names

    @property
    def layers(self) -> list[str]:
        return sorted(self.members)

    def has(self, layer: str) -> bool:
        return layer.upper() in self.members

    def path(self, layer: str) -> str:
        return f"/vsizip/{self.zip_path.as_posix()}/{self.members[layer.upper()]}"

    def encoding(self, layer: str) -> str | None:
        # Když balíček nese .cpg, nech kódování na GDALu; jinak použij kódování z configu.
        return None if layer.upper() in self._has_cpg else self.default_encoding

    def fields(self, layer: str) -> list[str]:
        info = pyogrio.read_info(self.path(layer), encoding=self.encoding(layer))
        return [str(f) for f in info["fields"]]

    def read(self, layer: str, columns: list[str] | None = None, read_geometry: bool = True):
        # on_invalid="fix": SHP ČÚZK obsahují i neuzavřené prstence (GDAL je jen ohlásí varováním)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            gdf = pyogrio.read_dataframe(
                self.path(layer), columns=columns, read_geometry=read_geometry, encoding=self.encoding(layer),
                on_invalid="fix",
            )
        for msg in {str(w.message).split(".")[0] for w in caught}:
            log.info("%s %s: %s (geometrie opravena)", self.zip_path.name, layer, msg)
        return gdf

    def require(self, layer: str, config_key: str) -> None:
        if not self.has(layer):
            raise SchemaError(
                f"V balíčku {self.zip_path.name} chybí vrstva {layer}. "
                f"Dostupné vrstvy: {', '.join(self.layers) or '(žádné .shp)'}. "
                f"Oprav {config_key} v configu (zjisti příkazem inspect)."
            )


def _to_id_string(series: pd.Series) -> pd.Series:
    """ID parcely jako text bez desetinné části (DBF ho může vrátit jako float)."""
    num = pd.to_numeric(series, errors="coerce")
    if num.notna().all():
        return num.astype("int64").astype(str)
    return series.astype(str).str.strip().str.replace(r"\.0$", "", regex=True)


def _norm_key(series: pd.Series) -> pd.Series:
    num = pd.to_numeric(series, errors="coerce")
    if num.notna().all():
        return num.astype("int64")
    return series.astype(str).str.strip()


def _join_key(p_df: pd.DataFrame, d_df: pd.DataFrame, candidates: list[str]) -> tuple[str, str] | None:
    for key in candidates:
        pk, dk = find_field(p_df.columns, key), find_field(d_df.columns, key)
        if not pk or not dk:
            continue
        p_vals, d_vals = p_df[pk].dropna(), d_df[dk].dropna()
        if p_vals.is_unique and d_vals.is_unique and len(p_vals) == len(p_df) and len(d_vals) == len(d_df):
            return pk, dk
        log.debug("Klíč %s není v obou vrstvách unikátní/úplný, zkouším další", key)
    return None


def load_parcels(pkg: KNPackage, kn_cfg: dict, label: str = "") -> tuple[gpd.GeoDataFrame, list[str]]:
    """Načte parcely jednoho KÚ do jednotné tabulky.

    Sloupce výsledku: id_parcely (str), ku_kod, obec_kod, cislo, vymera, druh_kod, zpusob_kod,
    bud_id, geometry (EPSG:5514). Vrací i seznam poznámek ke kvalitě dat.
    """
    notes: list[str] = []
    lp, ld = kn_cfg["vrstva_parcely"], kn_cfg["vrstva_parcely_atributy"]
    pkg.require(lp, "kn.vrstva_parcely")
    p_fields = pkg.fields(lp)
    d_fields = pkg.fields(ld) if pkg.has(ld) else []

    plan: dict[str, tuple[str, str]] = {}  # logický název -> (vrstva P/D, skutečný sloupec)
    missing: list[str] = []
    for logical, src in kn_cfg["atributy"].items():
        if not src:
            continue
        if f := find_field(p_fields, src):
            plan[logical] = ("P", f)
        elif f := find_field(d_fields, src):
            plan[logical] = ("D", f)
        elif logical in REQUIRED_KN_ATTRS:
            missing.append(f"{logical} = {src}")
    if missing:
        raise SchemaError(
            f"{label}: v datech chybí atributy {', '.join(missing)}.\n"
            f"  {lp}: {', '.join(p_fields)}\n"
            f"  {ld}: {', '.join(d_fields) or '(vrstva chybí)'}\n"
            "  Uprav kn.atributy v configu podle výpisu příkazu inspect."
        )

    join_keys = [k for k in kn_cfg.get("join_klice", []) if k]
    p_cols = sorted({f for w, f in plan.values() if w == "P"} | {f for k in join_keys if (f := find_field(p_fields, k))})
    parcels = pkg.read(lp, columns=p_cols)
    parcels = ensure_5514(parcels, f"{label} {lp}")

    rename = {f: logical for logical, (w, f) in plan.items() if w == "P"}
    if any(w == "D" for w, _ in plan.values()):
        d_cols = sorted({f for w, f in plan.values() if w == "D"} | {f for k in join_keys if (f := find_field(d_fields, k))})
        attrs = pkg.read(ld, columns=d_cols)
        attrs = ensure_5514(attrs, f"{label} {ld}")
        d_rename = {f: logical for logical, (w, f) in plan.items() if w == "D"}
        right = pd.DataFrame({logical: attrs[f].values for f, logical in d_rename.items()})
        key = _join_key(parcels, attrs, join_keys)
        if key:
            pk, dk = key
            right["__key"] = _norm_key(attrs[dk]).values
            left_key = _norm_key(parcels[pk])
            merged = parcels.assign(__key=left_key.values).merge(right, on="__key", how="left", indicator=True)
            matched = (merged["_merge"] == "both").to_numpy()
            merged = merged.drop(columns=["__key", "_merge"])
            log.debug("%s: atributy spojeny přes klíč %s", label, pk)
        else:
            # Záloha: definiční bod leží uvnitř své parcely.
            pts = gpd.GeoDataFrame(right, geometry=attrs.geometry.values, crs=attrs.crs)
            joined = gpd.sjoin(pts, parcels[[parcels.geometry.name]], predicate="within", how="inner")
            joined = joined[~joined["index_right"].duplicated(keep=False)]
            right_by_parcel = pd.DataFrame(joined[list(d_rename.values()) + ["index_right"]]).set_index("index_right")
            merged = parcels.join(right_by_parcel, how="left")
            matched = parcels.index.isin(right_by_parcel.index)
            notes.append("atributy spojeny prostorově (definiční bod v polygonu)")
            log.info("%s: žádný společný unikátní klíč (%s), spojuji prostorově", label, ", ".join(join_keys))
        unmatched = int((~matched).sum())
        if unmatched:
            notes.append(f"{unmatched} polygonů bez atributů vynecháno")
            log.warning("%s: %d polygonů parcel nemá atributy – vynechávám", label, unmatched)
            merged = merged.loc[matched]
        parcels = gpd.GeoDataFrame(merged, geometry=parcels.geometry.name, crs=parcels.crs)

    parcels = parcels.rename(columns=rename)
    keep = [c for c in ("id_parcely", "ku_kod", "obec_kod", "cislo", "vymera", "druh_kod", "zpusob_kod", "bud_id")
            if c in parcels.columns]
    parcels = geometry_only(parcels, keep)

    parcels["id_parcely"] = _to_id_string(parcels["id_parcely"])
    parcels["cislo"] = parcels["cislo"].astype(str).str.strip()
    parcels["vymera"] = pd.to_numeric(parcels["vymera"], errors="coerce")
    # Prázdný způsob využití je v DBF uložen jako „****“ – převede se na NA.
    for col in ("druh_kod", "zpusob_kod", "ku_kod", "obec_kod"):
        if col in parcels.columns:
            parcels[col] = pd.to_numeric(parcels[col], errors="coerce").astype("Int64")
    if "bud_id" in parcels.columns:
        bud = pd.to_numeric(parcels["bud_id"], errors="coerce")
        parcels["bud_id"] = bud.where(bud > 0).astype("Int64")

    parcels, n_fixed = fix_geometries(parcels, f"{label} parcely")
    if n_fixed:
        notes.append(f"{n_fixed} nevalidních geometrií parcel opraveno")
    dup = parcels["id_parcely"].duplicated()
    if dup.any():
        notes.append(f"{int(dup.sum())} duplicitních ID parcel")
        log.warning("%s: %d duplicitních ID parcel – ponechávám první výskyt", label, int(dup.sum()))
        parcels = parcels.loc[~dup]
    return parcels.reset_index(drop=True), notes


def load_buildings_from_package(pkg: KNPackage, layer: str, label: str = "") -> gpd.GeoDataFrame | None:
    if not pkg.has(layer):
        return None
    gdf = pkg.read(layer, columns=[])
    gdf = ensure_5514(gdf, f"{label} {layer}")
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    gdf, _ = fix_geometries(gdf, f"{label} budovy")
    return geometry_only(gdf).reset_index(drop=True)
