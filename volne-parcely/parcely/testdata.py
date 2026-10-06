"""SYNTETICKÁ testovací data: jedno vymyšlené KÚ + ÚP + číselníky.

Struktura balíčku napodobuje SHP katastrální mapy ČÚZK podle publikovaného popisu
(vrstvy PARCELY_KN_P / PARCELY_KN_DEF / BUDOVY_P, kódování CP1250 bez .cpg).
Geometrie, čísla parcel, ID i kódy způsobu využití jsou vymyšlené – data neodpovídají
žádnému skutečnému území a slouží jen k ověření logiky nástroje bez přístupu k síti.
"""
from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import make_valid
from shapely.geometry import Polygon, box

TEST_KU = 999901
TEST_OBEC_KOD = 999001
# posun do souřadnic S-JTSK (okolí Brna), aby mapa ukazovala smysluplné místo
X0, Y0 = -598600.0, -1161700.0

# kódy druhů pozemku dle číselníku ČÚZK SC_D_POZEMKU
ORNA, ZAHRADA, LES, ZASTAVENA, OSTATNI = 2, 5, 10, 13, 14
# SYNTETICKÉ kódy způsobu využití (skutečné kódy viz číselník SC_ZP_VYUZITI_POZ)
ZP_SILNICE, ZP_KOMUNIKACE, ZP_ZELEN = 901, 902, 903


def _b(x1, y1, x2, y2):
    return box(X0 + x1, Y0 + y1, X0 + x2, Y0 + y2)


# (označení, číslo parcely, geometrie, druh, způsob využití, BUD_ID)
PARCELS = [
    ("N1", "101/1", _b(0, 108, 20, 148), ZAHRADA, None, None),
    ("N2", "101/2", _b(20, 108, 45, 148), ORNA, None, None),
    ("N3", "101/3", _b(45, 108, 80, 148), OSTATNI, ZP_ZELEN, None),
    ("N4", "101/4", _b(80, 108, 95, 148), ZAHRADA, None, None),
    ("N5", "101/5", _b(95, 108, 108, 148), ZAHRADA, None, None),
    ("N6", "101/6", _b(108, 108, 140, 148), ZAHRADA, None, None),
    ("N7", "101/7", _b(140, 108, 170, 148), ZAHRADA, None, None),
    ("N8", "101/8", _b(170, 108, 200, 148), LES, None, None),
    ("N9", "101/9", _b(200, 108, 300, 148), ORNA, None, None),
    ("M1", "102/1", _b(0, 148, 30, 188), ZAHRADA, None, None),
    ("M2", "102/2", _b(30, 148, 60, 228), ORNA, None, None),
    ("M3", "102/3", _b(60, 148, 200, 188), ORNA, None, None),
    # záměrně nevalidní „motýlek“ – test make_valid; po opravě 2 trojúhelníky = 2000 m²
    ("M4", "102/4", Polygon([(X0 + 200, Y0 + 148), (X0 + 300, Y0 + 188), (X0 + 300, Y0 + 148), (X0 + 200, Y0 + 188)]),
     ORNA, None, None),
    ("S1", "st. 12", _b(0, 60, 30, 100), ZASTAVENA, None, 99000123),
    ("S2", "103/2", _b(30, 60, 60, 100), ZAHRADA, None, None),
    ("S3", "103/3", _b(60, 60, 100, 100), ZAHRADA, None, None),
    ("S4", "103/4", _b(100, 60, 145, 100), ORNA, None, None),
    ("S5", "103/5", _b(145, 60, 200, 100), OSTATNI, ZP_ZELEN, None),
    ("S6", "103/6", _b(200, 60, 300, 100), ORNA, None, None),
    ("T0", "104/1", _b(0, 0, 60, 60), ORNA, None, None),
    ("T1", "104/2", _b(60, 0, 120, 60), ORNA, None, None),
    ("T2", "104/3", _b(120, 0, 300, 60), ORNA, None, None),
    ("R1", "200/1", _b(0, 100, 300, 108), OSTATNI, ZP_KOMUNIKACE, None),
    ("R2", "200/2", _b(300, 0, 310, 300), OSTATNI, ZP_SILNICE, None),
    ("P1", "105", _b(60, 190, 300, 300), ORNA, None, None),
]

BUILDINGS = [
    _b(20, 70, 36, 80),       # dům na S1, 6 m přesahuje do S2 (60 m²)
    _b(115, 120, 118, 123),   # kůlna 9 m² na N6 (projde)
    _b(145, 120, 149, 124),   # kůlna 16 m² na N7 (vyřadí)
]

# (Typ, CasH, Index, geometrie)
UP_AREAS = [
    ("BI", 1, "", _b(0, 108, 300, 190)),
    ("BI", 1, "a", _b(0, 108, 20, 148)),  # překryv v datech ÚP – podíl se nesmí počítat dvakrát
    ("NZ", 1, "", _b(0, 190, 310, 300)),
    ("SV", 2, "", _b(60, 0, 120, 100)),
    ("SM", 2, "", _b(120, 60, 200, 100)),
    ("DS", 1, "", _b(200, 60, 300, 100)),
    ("ZV", 1, "", _b(120, 0, 300, 60)),
    ("BV", 1, "", _b(0, 60, 60, 100)),
    ("DS", 1, "", _b(0, 100, 300, 108)),
    ("DS", 1, "", _b(300, 0, 310, 300)),
]

# Očekávané výsledky (použité v testech)
EXPECTED_CANDIDATES = {"N1", "N2", "N3", "N4", "N6", "N9", "M1", "M4", "S3", "S4", "S5", "T1"}
EXPECTED_FOREST = {"N8"}
EXPECTED_REJECTED = {"S1", "S2", "N5", "N7", "M2", "M3"}


def parcel_id(label: str) -> int:
    return 99_000_000_000 + [p[0] for p in PARCELS].index(label) + 1


def _shp_files(gdf: gpd.GeoDataFrame, folder: Path, name: str, encoding: str | None, keep_cpg: bool) -> None:
    gdf.to_file(folder / f"{name}.shp", driver="ESRI Shapefile", engine="pyogrio", encoding=encoding)
    if not keep_cpg:
        (folder / f"{name}.cpg").unlink(missing_ok=True)


def build_kn_zip(dest: Path, def_has_id2: bool = False, def_has_id: bool = True) -> Path:
    """Vytvoří ZIP ve stylu ČÚZK: {kod}/PARCELY_KN_P.shp, PARCELY_KN_DEF.shp, BUDOVY_P.shp …"""
    rows = list(enumerate(PARCELS, start=1))
    poly = gpd.GeoDataFrame(
        {
            "ID": [i for i, _ in rows],
            "ID_2": [parcel_id(p[0]) for _, p in rows],
            "TYPPPD_KOD": [1] * len(rows),
            "KATUZE_KOD": [TEST_KU] * len(rows),
            "OBEC_KOD": [TEST_OBEC_KOD] * len(rows),
        },
        geometry=[p[2] for _, p in rows],
        crs=5514,
    )
    attrs = {
        "KATUZE_KOD": [TEST_KU] * len(rows),
        "TEXT_KM": [p[1] for _, p in rows],
        "PAR_VYMERA": [round(make_valid(p[2]).area) for _, p in rows],
        "DRUPOZ_KOD": [p[3] for _, p in rows],
        "ZPVYPA_KOD": [p[4] if p[4] is not None else float("nan") for _, p in rows],
        "BUD_ID": [p[5] if p[5] is not None else float("nan") for _, p in rows],
    }
    if def_has_id:
        attrs = {"ID": [i for i, _ in rows], **attrs}
    if def_has_id2:
        attrs = {"ID_2": [parcel_id(p[0]) for _, p in rows], **attrs}
    # definiční body v obráceném pořadí, ať spojení nefunguje „náhodou“ podle pořadí řádků
    pts = gpd.GeoDataFrame(attrs, geometry=[make_valid(p[2]).representative_point() for _, p in rows], crs=5514)
    pts = pts.iloc[::-1].reset_index(drop=True)
    budovy = gpd.GeoDataFrame({"ID": range(1, len(BUILDINGS) + 1)}, geometry=BUILDINGS, crs=5514)
    ku = gpd.GeoDataFrame(
        {"KATUZE_KOD": [TEST_KU], "NAZEV": ["Testov – SYNTETICKÉ území"]}, geometry=[_b(0, 0, 310, 300)], crs=5514
    )

    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp) / str(TEST_KU)
        folder.mkdir()
        _shp_files(poly, folder, "PARCELY_KN_P", "cp1250", False)
        _shp_files(pts, folder, "PARCELY_KN_DEF", "cp1250", False)
        _shp_files(budovy, folder, "BUDOVY_P", "cp1250", False)
        _shp_files(ku, folder, "KATASTRALNI_UZEMI_P", "cp1250", False)
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(folder.iterdir()):
                zf.write(f, f"{TEST_KU}/{f.name}")
    return dest


def build_up(dest: Path, crs: int = 5514) -> Path:
    gdf = gpd.GeoDataFrame(
        {"Typ": [a[0] for a in UP_AREAS], "CasH": [a[1] for a in UP_AREAS], "Index": [a[2] for a in UP_AREAS]},
        geometry=[a[3] for a in UP_AREAS],
        crs=5514,
    ).to_crs(crs)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.suffix.lower() == ".shp":
        gdf.to_file(dest, driver="ESRI Shapefile", engine="pyogrio", encoding="utf-8")
    else:
        gdf.to_file(dest, layer="PlochyRZV_p", driver="GPKG", engine="pyogrio")
    return dest


def _csv_zip(dest: Path, name: str, df: pd.DataFrame) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    df.to_csv(buf, sep=";", index=False)
    with zipfile.ZipFile(dest, "w") as zf:
        zf.writestr(f"{name}.csv", buf.getvalue().encode("cp1250"))
    return dest


def build_ciselniky(cis_dir: Path) -> list[Path]:
    druh = pd.DataFrame({
        "KOD": [ORNA, ZAHRADA, LES, ZASTAVENA, OSTATNI],
        "NAZEV": ["orná půda", "zahrada", "lesní pozemek", "zastavěná plocha a nádvoří", "ostatní plocha"],
    })
    zpusob = pd.DataFrame({
        "KOD": [ZP_SILNICE, ZP_KOMUNIKACE, ZP_ZELEN],
        "NAZEV": ["silnice", "ostatní komunikace", "zeleň"],
    })
    ku = pd.DataFrame({"KOD": [TEST_KU], "NAZEV": ["Testov"], "OBEC_KOD": [TEST_OBEC_KOD], "PLATI_DO": [""]})
    obec = pd.DataFrame({"KOD": [TEST_OBEC_KOD], "NAZEV": ["Testov"], "PLATI_DO": [""]})
    return [
        _csv_zip(cis_dir / "SC_D_POZEMKU.zip", "SC_D_POZEMKU", druh),
        _csv_zip(cis_dir / "SC_ZP_VYUZITI_POZ.zip", "SC_ZP_VYUZITI_POZ", zpusob),
        _csv_zip(cis_dir / "UI_KATASTRALNI_UZEMI.zip", "UI_KATASTRALNI_UZEMI", ku),
        _csv_zip(cis_dir / "UI_OBEC.zip", "UI_OBEC", obec),
    ]


def create_test_data(root: Path) -> list[Path]:
    """root/cache/ku/999901.zip, root/cache/cis/*.zip, root/up/testov/PlochyRZV_p.shp"""
    root = Path(root)
    up_dir = root / "up" / "testov"
    if up_dir.exists():
        shutil.rmtree(up_dir)
    paths = [build_kn_zip(root / "cache" / "ku" / f"{TEST_KU}.zip")]
    paths += build_ciselniky(root / "cache" / "cis")
    paths.append(build_up(up_dir / "PlochyRZV_p.shp"))
    return paths
