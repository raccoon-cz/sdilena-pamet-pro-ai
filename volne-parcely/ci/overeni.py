"""Pomocné kroky pro ověření na reálných datech v CI (GitHub Actions).

    python ci/overeni.py up-cele-ku 698504 713392     # náhradní ÚP: celé KÚ jako plocha BI
    python ci/overeni.py vfr 698504                     # záloha budov z RÚIAN VFR
    python ci/overeni.py vysledky ../output/ci          # výpis Excelu do logu
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import geopandas as gpd  # noqa: E402
import pandas as pd  # noqa: E402

from parcely.config import load_config  # noqa: E402
from parcely.geo import geometry_only  # noqa: E402
from parcely.kn import KNPackage  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "ci" / "config.real.yaml"


def up_cele_ku(kody: list[str]) -> None:
    cfg = load_config(CFG)
    frames = []
    for kod in kody:
        pkg = KNPackage(cfg.cache_dir / "ku" / f"{kod}.zip")
        if pkg.has("KATASTRALNI_UZEMI_P"):
            g = pkg.read("KATASTRALNI_UZEMI_P", columns=[])
        else:
            p = pkg.read(cfg["kn"]["vrstva_parcely"], columns=[])
            g = gpd.GeoDataFrame(geometry=[p.union_all()], crs=p.crs)
        frames.append(geometry_only(g))
    up = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry", crs=frames[0].crs)
    up["Typ"] = "BI"
    up["CasH"] = 1
    out = cfg.resolve("../data/up/ci/cele_ku_bi.gpkg")
    out.parent.mkdir(parents=True, exist_ok=True)
    up.to_file(out, layer="PlochyRZV_p", driver="GPKG", engine="pyogrio")
    print(f"Náhradní ÚP: {out} ({len(up)} polygonů, plocha {up.area.sum() / 1e4:.1f} ha)")


def vfr(kod: str) -> None:
    from parcely.budovy import load_vfr_buildings
    from parcely.kn import load_buildings_from_package

    cfg = load_config(CFG)
    pkg = KNPackage(cfg.cache_dir / "ku" / f"{kod}.zip")
    obec = pkg.read(cfg["kn"]["vrstva_parcely"], columns=["OBEC_KOD"], read_geometry=False)["OBEC_KOD"]
    obec_kod = int(obec.dropna().iloc[0])
    shp = load_buildings_from_package(pkg, cfg["kn"]["vrstva_budovy"])
    print(f"BUDOVY_P v SHP balíčku KÚ {kod}: {None if shp is None else len(shp)}")
    b = load_vfr_buildings(cfg, obec_kod)
    print(f"VFR obec {obec_kod}: {len(b)} budov, typy: {b.geom_type.value_counts().to_dict()}, "
          f"plocha {b.area.sum():.0f} m², bounds {b.total_bounds.round(0).tolist()}")


def vysledky(out_dir: str) -> None:
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 20)
    pd.set_option("display.max_colwidth", 45)
    xlsx = sorted(Path(out_dir).glob("*/kandidati.xlsx"))[-1]
    k = pd.read_excel(xlsx, sheet_name="Kandidáti")
    v = pd.read_excel(xlsx, sheet_name="Lesní a vyřazené")
    print(f"== {xlsx}: kandidátů {len(k)}, lesní a vyřazené {len(v)}")
    cols = ["Skóre", "KÚ", "Číslo parcely", "Druh pozemku", "Výměra (m²)", "Podíl v ploše (%)",
            "Přístup ke komunikaci", "Vzdálenost ke komunikaci (m)", "Způsob využití", "Max. překryv budovy (m²)",
            "Budova evidovaná v KN", "ID parcely"]
    print(k[cols].head(25).to_string())
    print("\nRozdělení druhů pozemku u kandidátů:")
    print(k["Druh pozemku"].value_counts().to_string())
    print("\nPřístup:", k["Přístup ke komunikaci"].value_counts().to_dict())
    print("Budova evidovaná v KN:", k["Budova evidovaná v KN"].value_counts().to_dict())
    print("\nDůvody vyřazení (list Lesní a vyřazené):")
    print(v["Důvod vyřazení"].value_counts().to_string())
    par = pd.read_excel(xlsx, sheet_name="Parametry běhu", header=None)
    print("\nParametry běhu:")
    print(par.fillna("").to_string(index=False, header=False))
    if len(k):
        print("\nUKAZKA_ID", k["ID parcely"].iloc[0], k["Mapy.cz"].iloc[0] if "Mapy.cz" in k else "")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    {"up-cele-ku": lambda: up_cele_ku(args), "vfr": lambda: vfr(args[0]), "vysledky": lambda: vysledky(args[0])}[cmd]()
