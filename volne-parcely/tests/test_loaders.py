"""Loader SHP balíčku KN a územního plánu na syntetických souborech."""
import zipfile

import pytest

from parcely import testdata as td
from parcely.config import DEFAULTS, UzemniPlan
from parcely.kn import KNPackage, SchemaError, load_buildings_from_package, load_parcels
from parcely.uzemni_plan import UPError, load_up

KN = DEFAULTS["kn"]


@pytest.mark.parametrize("variant", [
    {},                                          # jako skutečný balíček: UTF-8, textová ID, ID_2 v obou vrstvách
    {"def_has_id2": False},                      # spojení přes ID
    {"def_has_id2": False, "def_has_id": False}, # prostorová záloha
    {"real_like": False},                        # CP1250 bez .cpg, číselná ID
])
def test_load_parcels_spojeni_atributu(tmp_path, variant):
    """Všechny způsoby spojení a obě podoby balíčku dají stejný výsledek."""
    z = td.build_kn_zip(tmp_path / "ku.zip", **variant)
    parcels, notes = load_parcels(KNPackage(z), KN, "test")
    assert len(parcels) == len(td.PARCELS)
    assert parcels.crs.to_epsg() == 5514
    by_id = parcels.set_index("id_parcely")
    s1 = by_id.loc[str(td.parcel_id("S1"))]
    assert s1["cislo"] == "st. 12"
    assert s1["druh_kod"] == td.ZASTAVENA
    assert s1["bud_id"] == 99000123
    n3 = by_id.loc[str(td.parcel_id("N3"))]
    assert n3["zpusob_kod"] == td.ZP_ZELEN
    assert n3["vymera"] == 1400
    # prázdný způsob využití → NA
    assert by_id["zpusob_kod"].isna().sum() == sum(p[4] is None for p in td.PARCELS)
    # nevalidní „motýlek“ je opravený
    assert parcels.geometry.is_valid.all()
    assert by_id.loc[str(td.parcel_id("M4"))].geometry.area == pytest.approx(2000)
    assert any("nevalidních" in n for n in notes)
    if not variant.get("def_has_id", True):
        assert any("prostorově" in n for n in notes)
    assert set(by_id.index) == {str(td.parcel_id(p[0])) for p in td.PARCELS}


def test_chybejici_atribut_hlasi_dostupne(tmp_path):
    z = td.build_kn_zip(tmp_path / "ku.zip")
    kn = {**KN, "atributy": {**KN["atributy"], "druh_kod": "DRUH_NEEXISTUJE"}}
    with pytest.raises(SchemaError) as exc:
        load_parcels(KNPackage(z), kn, "test")
    msg = str(exc.value)
    assert "DRUH_NEEXISTUJE" in msg and "DRUPOZ_KOD" in msg


def test_chybejici_vrstva(tmp_path):
    z = td.build_kn_zip(tmp_path / "ku.zip")
    with pytest.raises(SchemaError, match="chybí vrstva"):
        load_parcels(KNPackage(z), {**KN, "vrstva_parcely": "NENI"}, "test")


def test_budovy_z_balicku(tmp_path):
    z = td.build_kn_zip(tmp_path / "ku.zip")
    pkg = KNPackage(z)
    b = load_buildings_from_package(pkg, "BUDOVY_P")
    assert len(b) == len(td.BUILDINGS)
    assert load_buildings_from_package(pkg, "NENI") is None


def test_balicek_s_cpg_utf8(tmp_path):
    z = td.build_kn_zip(tmp_path / "ku.zip")
    pkg = KNPackage(z)
    assert pkg.encoding("PARCELY_KN_P") is None  # rozhoduje .cpg v balíčku
    assert pkg.read("KATASTRALNI_UZEMI_P")["NAZEV"].iloc[0] == "Testov – SYNTETICKÉ území"


def test_balicek_bez_cpg_cte_cp1250(tmp_path):
    z = td.build_kn_zip(tmp_path / "ku.zip", real_like=False)
    with zipfile.ZipFile(z) as zf:
        assert not any(n.lower().endswith(".cpg") for n in zf.namelist())
    pkg = KNPackage(z)
    df = pkg.read("KATASTRALNI_UZEMI_P")
    assert df["NAZEV"].iloc[0] == "Testov – SYNTETICKÉ území"


def test_up_prevod_z_wgs84_gpkg(tmp_path):
    path = td.build_up(tmp_path / "up.gpkg", crs=4326)
    gdf = load_up(UzemniPlan(obec="T", cesta=path), {"BI": "bydlení individuální"})
    assert gdf.crs.to_epsg() == 5514
    bi = gdf[gdf["up_kod"] == "BI"].geometry.area.max()
    # převod S-JTSK <-> WGS84 v PROJ má přesnost ~1 m (transformace se volí podle oblasti)
    assert bi == pytest.approx(300 * 82, rel=5e-3)
    assert gdf.loc[gdf["up_kod"] == "BI", "up_nazev"].iloc[0] == "bydlení individuální"
    assert "CasH=1 (stabilizovaná)" in gdf["up_detail"].iloc[0]


def test_up_neznamy_atribut(tmp_path):
    path = td.build_up(tmp_path / "up.shp")
    with pytest.raises(UPError, match="KOD_PLOCHY.*Typ"):
        load_up(UzemniPlan(obec="T", cesta=path, atribut_kod="KOD_PLOCHY"))


def test_up_chybejici_soubor(tmp_path):
    with pytest.raises(UPError, match="Chybí data ÚP pro obec „T“"):
        load_up(UzemniPlan(obec="T", cesta=tmp_path / "neni.shp"))


def test_up_filtr_atributu(tmp_path):
    path = td.build_up(tmp_path / "up.shp")
    gdf = load_up(UzemniPlan(obec="T", cesta=path, filtr={"CasH": ["2"]}))
    assert set(gdf["up_kod"]) == {"SV", "SM"}


def test_up_auto_atribut(tmp_path):
    path = td.build_up(tmp_path / "up.shp")
    gdf = load_up(UzemniPlan(obec="T", cesta=path, atribut_kod="auto"))
    assert {"BI", "SV", "SM", "NZ"} <= set(gdf["up_kod"])


def test_up_auto_atribut_bez_kodu(tmp_path):
    import geopandas as gpd
    from shapely.geometry import box

    path = tmp_path / "x.gpkg"
    gpd.GeoDataFrame({"popis": ["les", "louka"]}, geometry=[box(0, 0, 1, 1), box(1, 0, 2, 1)], crs=5514).to_file(path)
    with pytest.raises(UPError, match="nepodařilo určit automaticky"):
        load_up(UzemniPlan(obec="T", cesta=path, atribut_kod="auto"))


def test_up_stary_typ_auto_detekce(tmp_path):
    """ÚP jako Kuřim: kód ve FUKCE_2 (B, D, Z, P), označení A001…, stav S/N."""
    path = td.build_up_stary(tmp_path / "stary.gpkg")
    gdf = load_up(UzemniPlan(obec="T", cesta=path, atribut_kod="auto"))
    assert set(gdf["up_kod"]) == {"B", "Z", "D", "P"}
    assert gdf.loc[gdf["up_kod"] == "B", "up_nazev"].iloc[0] in ("Plochy smíšené obytné", "Plocha smíšená obytná")
    assert "FAZE_2=" in gdf["up_detail"].iloc[0]


def test_neuzavreny_prstenec_v_shp(tmp_path):
    """Reálná chyba z KÚ Kuřim: SHP s neuzavřeným prstencem (GEOS ho jinak odmítne)."""
    import struct

    import numpy as np
    import pyogrio.raw

    def poly_wkb(coords):
        b = struct.pack("<BI", 1, 3) + struct.pack("<I", 1) + struct.pack("<I", len(coords))
        return b + b"".join(struct.pack("<dd", x, y) for x, y in coords)

    folder = tmp_path / "123456"
    folder.mkdir()
    pyogrio.raw.write(str(folder / "PARCELY_KN_P.shp"),
                      geometry=np.array([poly_wkb([(0, 0), (40, 0), (40, 25), (0, 25)])], dtype=object),
                      field_data=[np.array(["1"]), np.array(["5"])], fields=["ID", "ID_2"],
                      geometry_type="Polygon", crs="EPSG:5514", driver="ESRI Shapefile")
    z = tmp_path / "ku.zip"
    with zipfile.ZipFile(z, "w") as zf:
        for f in folder.iterdir():
            zf.write(f, f"123456/{f.name}")
    gdf = KNPackage(z).read("PARCELY_KN_P")
    assert gdf.geometry.iloc[0].is_valid
    assert gdf.geometry.iloc[0].area == pytest.approx(1000)
