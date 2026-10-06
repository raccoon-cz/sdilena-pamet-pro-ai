"""Logika průniku, budov, přístupu, filtrů a skóre na syntetických geometriích (EPSG:5514, metry)."""
import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Polygon, box

from parcely.analysis import access, apply_filters, building_overlap, score, up_overlap
from parcely.geo import fix_geometries

CRS = 5514


def gdf(geoms, **cols):
    return gpd.GeoDataFrame(cols, geometry=list(geoms), crs=CRS)


def up(*areas):
    """areas: (kód, geometrie)"""
    return gdf([a[1] for a in areas], up_kod=[a[0] for a in areas], up_nazev=[f"název {a[0]}" for a in areas],
               up_detail=[""] * len(areas))


# --- průnik s ÚP --------------------------------------------------------------

def test_podil_cast_parcely_v_plose():
    parcels = gdf([box(0, 0, 40, 25)])  # 1000 m²
    res = up_overlap(parcels, up(("BI", box(0, 0, 28, 25))))  # 700 m²
    assert res.loc[0, "plocha_geom_m2"] == pytest.approx(1000)
    assert res.loc[0, "plocha_v_up_m2"] == pytest.approx(700)
    assert res.loc[0, "podil"] == pytest.approx(0.7)
    assert res.loc[0, "up_kod"] == "BI"
    assert res.loc[0, "up_nazev"] == "název BI"


def test_prekryvajici_se_plochy_up_se_nepocitaji_dvakrat():
    parcels = gdf([box(0, 0, 40, 25)])
    res = up_overlap(parcels, up(("BI", box(0, 0, 40, 25)), ("BI", box(0, 0, 40, 25)), ("SV", box(0, 0, 20, 25))))
    assert res.loc[0, "podil"] == pytest.approx(1.0)


def test_dominantni_kod_podle_souctu_ploch_kodu():
    parcels = gdf([box(0, 0, 100, 10)])
    # SV jeden kus 35 %, BI dva kusy 33 % + 32 % → vyhrává BI (65 %)
    res = up_overlap(parcels, up(("SV", box(0, 0, 35, 10)), ("BI", box(35, 0, 68, 10)), ("BI", box(68, 0, 100, 10))))
    assert res.loc[0, "up_kod"] == "BI"
    assert res.loc[0, "podil"] == pytest.approx(1.0)


def test_parcela_mimo_plochy_a_dotyk_hranou():
    parcels = gdf([box(0, 0, 10, 10), box(10, 0, 20, 10)])
    res = up_overlap(parcels, up(("BI", box(20, 0, 30, 10))))  # druhá parcela se jen dotýká
    assert res["podil"].tolist() == [0.0, 0.0]
    assert res["up_kod"].tolist() == ["", ""]


def test_prazdny_up():
    parcels = gdf([box(0, 0, 10, 10)])
    res = up_overlap(parcels, up())
    assert res.loc[0, "podil"] == 0.0


# --- budovy -------------------------------------------------------------------

def test_prekryv_budovy_maximum_jedne_budovy():
    parcels = gdf([box(0, 0, 30, 40), box(30, 0, 60, 40)])
    buildings = gdf([box(20, 10, 36, 20), box(40, 5, 43, 8)])  # 1. budova: 100 m² v P0, 60 m² v P1; 2.: 9 m² v P1
    res = building_overlap(parcels, buildings)
    assert res.tolist() == pytest.approx([100.0, 60.0])


def test_bez_budov():
    parcels = gdf([box(0, 0, 10, 10)])
    assert building_overlap(parcels, None).tolist() == [0.0]


# --- přístup ------------------------------------------------------------------

def test_pristup_podle_vzdalenosti():
    road = gdf([box(0, 0, 100, 8)], id_parcely=["R"])
    parcels = gdf([box(0, 8, 20, 48), box(30, 11, 50, 51), box(60, 16, 80, 56)])  # 0 m, 3 m, 8 m
    res = access(parcels, road, max_dist=5)
    assert res["vzdalenost_komunikace_m"].tolist() == pytest.approx([0, 3, 8])
    assert res["pristup"].tolist() == [True, True, False]


def test_pristup_neznamy_bez_ciselniku():
    parcels = gdf([box(0, 0, 10, 10)])
    res = access(parcels, None, max_dist=5)
    assert res["pristup"].isna().all()


def test_pristup_mimo_dosah_hledani():
    road = gdf([box(0, 0, 10, 10)], id_parcely=["R"])
    parcels = gdf([box(1000, 1000, 1010, 1010)])
    res = access(parcels, road, max_dist=5)
    assert res["pristup"].tolist() == [False]
    assert res["vzdalenost_komunikace_m"].isna().all()


# --- filtry -------------------------------------------------------------------

ZAST, LES, ZAHRADA, ORNA = 13, 10, 5, 2


def frame(rows):
    """rows: (druh, výměra, podíl, překryv budovy)"""
    return gpd.GeoDataFrame(
        {
            "druh_kod": pd.array([r[0] for r in rows], dtype="Int64"),
            "vymera": [r[1] for r in rows],
            "podil": [r[2] for r in rows],
            "budova_prekryv_m2": [r[3] for r in rows],
            "plocha_geom_m2": [r[1] for r in rows],
        },
        geometry=[box(i * 100, 0, i * 100 + 10, 10) for i in range(len(rows))],
        crs=CRS,
    )


FILTER_KW = dict(zastavena_kody={ZAST}, lesni_kody={LES}, min_vymera=600, max_vymera=5000,
                 min_podil=0.6, max_prekryv_budovy=10)


def test_filtry_v_poradi_a_pocty():
    df = frame([
        (ZAHRADA, 1000, 1.0, 0),     # 0 kandidát
        (ZAST, 1000, 1.0, 150),      # 1 zastavěná (i budova – počítá se první důvod)
        (ZAHRADA, 1000, 1.0, 10.5),  # 2 budova > 10
        (ZAHRADA, 1000, 1.0, 10.0),  # 3 budova přesně 10 → projde
        (ORNA, 599, 1.0, 0),         # 4 výměra pod
        (ORNA, 600, 1.0, 0),         # 5 výměra přesně min → projde
        (ORNA, 5001, 1.0, 0),        # 6 výměra nad
        (ORNA, 1000, 0.59, 0),       # 7 podíl pod
        (ORNA, 1000, 0.05, 0),       # 8 podíl pod, mimo list vyřazených
        (LES, 1000, 1.0, 0),         # 9 lesní
        (pd.NA, 1000, 1.0, 0),       # 10 neznámý druh → projde
    ])
    res = apply_filters(df, **FILTER_KW)
    assert set(res.kandidati.index) == {0, 3, 5, 10}
    assert set(res.lesni.index) == {9}
    assert set(res.vyrazene.index) == {1, 2, 4, 6, 7}
    assert [k["vyrazeno"] for k in res.kroky] == [0, 1, 1, 2, 2, 1]
    assert res.kroky[-1]["zbyva"] == 4
    assert res.vyrazene.loc[1, "duvod"] == "druh pozemku zastavěná plocha"
    assert res.vyrazene.loc[1, "vsechny_duvody"] == "druh pozemku zastavěná plocha; budova v parcele"


def test_lesni_ktery_neprosel_jinym_filtrem_neni_v_lesnich():
    res = apply_filters(frame([(LES, 300, 1.0, 0)]), **FILTER_KW)
    assert res.lesni.empty
    assert res.vyrazene.loc[0, "duvod"] == "výměra mimo rozsah"


def test_filtr_budov_preskocen_kdyz_budovy_chybi():
    res = apply_filters(frame([(ZAHRADA, 1000, 1.0, 500)]), **FILTER_KW, budovy_dostupne=False)
    assert list(res.kandidati.index) == [0]
    assert "přeskočeno" in res.kroky[2]["krok"]


def test_chybejici_vymera_nahradi_plocha_geometrie():
    df = frame([(ZAHRADA, None, 1.0, 0)])
    df["plocha_geom_m2"] = [800.0]
    res = apply_filters(df, **FILTER_KW)
    assert res.kandidati.loc[0, "vymera_filtr"] == 800


# --- skóre --------------------------------------------------------------------

SCORE_KW = dict(bonus_kody={ZAHRADA, ORNA}, min_vymera=600, max_vymera=5000, idealni=(800, 1500))


def score_of(druh, vymera, podil, pristup):
    df = frame([(druh, vymera, podil, 0)])
    df["pristup"] = pd.array([pristup], dtype="boolean")
    return score(df, **SCORE_KW).iloc[0]


def test_skore_maximum():
    assert score_of(ZAHRADA, 1000, 1.0, True)["skore"] == 100


def test_skore_slozky():
    s = score_of(14, 3250, 0.8, False)  # bez bonusu, výměra uprostřed mezi 1500 a 5000
    assert s["skore_podil"] == pytest.approx(32)
    assert s["skore_pristup"] == 0
    assert s["skore_vymera"] == pytest.approx(10)
    assert s["skore_druh"] == 0
    assert s["skore"] == pytest.approx(42)


def test_skore_vymera_okraje():
    assert score_of(ORNA, 600, 1.0, True)["skore_vymera"] == 0
    assert score_of(ORNA, 700, 1.0, True)["skore_vymera"] == pytest.approx(10)
    assert score_of(ORNA, 800, 1.0, True)["skore_vymera"] == 20
    assert score_of(ORNA, 1500, 1.0, True)["skore_vymera"] == 20
    assert score_of(ORNA, 5000, 1.0, True)["skore_vymera"] == 0


def test_skore_neznamy_pristup_je_nula():
    assert score_of(ORNA, 1000, 1.0, pd.NA)["skore_pristup"] == 0


# --- geometrie ----------------------------------------------------------------

def test_make_valid_motylek():
    bow = Polygon([(0, 0), (10, 10), (10, 0), (0, 10)])
    fixed, n = fix_geometries(gdf([bow, box(0, 0, 1, 1)]))
    assert n == 1
    assert fixed.geometry.is_valid.all()
    assert fixed.geometry.iloc[0].area == pytest.approx(50)
    assert fixed.geometry.iloc[0].geom_type in ("Polygon", "MultiPolygon")
