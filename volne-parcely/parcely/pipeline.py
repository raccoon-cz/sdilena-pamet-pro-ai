"""Orchestrace běhu: KÚ po KÚ (chyba jednoho KÚ neshodí celý běh), pak přístup, skóre, výstupy."""
from __future__ import annotations

import datetime as dt
import logging
import traceback
from dataclasses import dataclass, field
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

from . import CRS_KN
from .analysis import FilterResult, access, apply_filters, building_overlap, score, up_overlap
from .budovy import load_buildings
from .ciselniky import FALLBACK_DRUH_POZEMKU, Ciselnik, load_ciselnik, resolve_codes
from .config import Config, KatastralniUzemi
from .download import download_ku
from .export import write_excel, write_gpkg
from .kn import KNPackage, load_parcels
from .links import mapy_url, nahlizeni_url, vdp_url
from .logs import setup_logging
from .mapa import build_map
from .uzemni_plan import UPError, is_target, load_up

log = logging.getLogger("parcely")


@dataclass
class Kody:
    zastavena: set[int]
    lesni: set[int]
    bonus: set[int]
    pristup: set[int] | None  # None = komunikace nejdou určit
    nevhodne_druhy: set[int]
    nevhodne_zpusoby: set[int]
    druh: Ciselnik | None
    zpusob: Ciselnik | None


@dataclass
class KUResult:
    ku: KatastralniUzemi
    stav: str = "CHYBA"
    zprava: str = ""
    filtr: FilterResult | None = None
    roads: gpd.GeoDataFrame | None = None
    up_target: gpd.GeoDataFrame | None = None
    budovy: str = ""
    poznamky: list[str] = field(default_factory=list)


@dataclass
class RunResult:
    out_dir: Path
    results: list[KUResult]
    kandidati: gpd.GeoDataFrame
    lesni_vyrazene: gpd.GeoDataFrame
    soubory: list[Path]

    @property
    def ok(self) -> bool:
        return any(r.stav == "OK" for r in self.results)


def load_codes(cfg: Config) -> Kody:
    druh = load_ciselnik(cfg, "SC_D_POZEMKU", FALLBACK_DRUH_POZEMKU)
    zpusob = load_ciselnik(cfg, "SC_ZP_VYUZITI_POZ")
    d = cfg["druhy_pozemku"]
    zastavena, _ = resolve_codes(d["zastavena"], druh, "druhy_pozemku.zastavena")
    lesni, _ = resolve_codes(d["lesni"], druh, "druhy_pozemku.lesni")
    bonus, _ = resolve_codes(d["bonus"], druh, "druhy_pozemku.bonus")
    pristup, _ = resolve_codes(cfg["pristup_zpusoby_vyuziti"], zpusob, "pristup_zpusoby_vyuziti")
    nevhodne_druhy, _ = resolve_codes(d["nevhodne"], druh, "druhy_pozemku.nevhodne")
    nevhodne_zpusoby, _ = resolve_codes(cfg["nevhodne_zpusoby_vyuziti"], zpusob, "nevhodne_zpusoby_vyuziti")
    if not zastavena:
        log.warning("Kód druhu „zastavěná plocha“ není známý – filtr zastavěných parcel nebude fungovat.")
    if not pristup:
        log.warning(
            "Kódy způsobu využití pro komunikace nejsou známé (číselník SC_ZP_VYUZITI_POZ nedostupný?). "
            "Přístup bude „neznámo“. Kódy lze zadat číslem v pristup_zpusoby_vyuziti."
        )
    log.info(
        "Kódy – zastavěná: %s, lesní: %s, bonus: %s, komunikace: %s, nevhodné druhy: %s, nevhodné způsoby: %s",
        sorted(zastavena), sorted(lesni), sorted(bonus), sorted(pristup) if pristup else "neznámé",
        sorted(nevhodne_druhy), sorted(nevhodne_zpusoby),
    )
    return Kody(zastavena, lesni, bonus, pristup or None, nevhodne_druhy, nevhodne_zpusoby, druh, zpusob)


def process_ku(cfg: Config, ku: KatastralniUzemi, up: gpd.GeoDataFrame, kody: Kody) -> KUResult:
    label = f"KÚ {ku.kod} {ku.nazev}"
    res = KUResult(ku=ku)
    zip_path, _ = download_ku(cfg, ku.kod)
    pkg = KNPackage(zip_path, cfg["kn"]["kodovani"])
    parcels, notes = load_parcels(pkg, cfg["kn"], label)
    res.poznamky.extend(notes)
    if parcels.empty:
        raise ValueError(f"{label}: balíček neobsahuje žádné parcely.")
    log.info("%s: %d parcel", label, len(parcels))
    if "ku_kod" in parcels.columns:
        kody_v_datech = set(parcels["ku_kod"].dropna().astype(int))
        if kody_v_datech and ku.kod not in kody_v_datech:
            res.poznamky.append(f"kód KÚ v datech: {sorted(kody_v_datech)}")
            log.warning("%s: data nesou kód KÚ %s – zkontroluj config", label, sorted(kody_v_datech))

    buildings, res.budovy = load_buildings(cfg, pkg, parcels, label)
    if buildings is None:
        log.warning("%s: budovy nejsou k dispozici (%s) – filtr budov se přeskočí", label, res.budovy)
    else:
        log.info("%s: %d budov (%s)", label, len(buildings), res.budovy)

    up_ku = up.iloc[up.sindex.query(box(*parcels.total_bounds), predicate="intersects")]
    target = up_ku[is_target(up_ku["up_kod"], cfg.cilove_kody, cfg["porovnani_kodu"])]
    if target.empty:
        kody_up = ", ".join(sorted(up_ku["up_kod"].unique())[:40]) or "(ÚP KÚ nepokrývá)"
        msg = f"v ÚP nejsou v rozsahu KÚ plochy s kódy {', '.join(cfg.cilove_kody)}; kódy v ÚP: {kody_up}"
        res.poznamky.append(msg)
        log.warning("%s: %s", label, msg)
    res.up_target = target

    parcels = parcels.join(up_overlap(parcels, target))
    parcels["budova_prekryv_m2"] = building_overlap(parcels, buildings).round(1)
    if kody.pristup is not None:
        res.roads = parcels.loc[parcels["zpusob_kod"].isin(list(kody.pristup)).fillna(False).astype(bool), ["id_parcely", "geometry"]]
        log.info("%s: %d parcel komunikací", label, len(res.roads))

    parcels = parcels.assign(obec=ku.obec, ku_nazev=ku.nazev, ku_kod=ku.kod)
    res.filtr = apply_filters(
        parcels,
        zastavena_kody=kody.zastavena,
        lesni_kody=kody.lesni,
        min_vymera=float(cfg["min_vymera_m2"]),
        max_vymera=float(cfg["max_vymera_m2"]),
        min_podil=float(cfg["min_podil_v_plose"]),
        max_prekryv_budovy=float(cfg["max_prekryv_budovy_m2"]),
        nevhodne_druhy=kody.nevhodne_druhy,
        nevhodne_zpusoby=kody.nevhodne_zpusoby,
        vyrazene_min_podil=float(cfg["vyrazene_min_podil"]),
        vyrazene_min_vymera=float(cfg["vyrazene_min_vymera_m2"]),
        budovy_dostupne=buildings is not None,
    )
    res.stav = "OK"
    res.zprava = "; ".join(res.poznamky)
    log.info("%s: %d kandidátů, %d lesních, %d vyřazených k posouzení",
             label, len(res.filtr.kandidati), len(res.filtr.lesni), len(res.filtr.vyrazene))
    return res


def enrich(df: gpd.GeoDataFrame, cfg: Config, kody: Kody) -> gpd.GeoDataFrame:
    """Doplní názvy, odkazy, souřadnice a text pro výstup."""
    if df.empty:
        return df
    df = df.copy()
    pts = gpd.GeoSeries(df.geometry.representative_point(), crs=df.crs).to_crs(4326)
    df["lat"], df["lon"] = pts.y.round(6).values, pts.x.round(6).values
    df["souradnice"] = [f"{la:.6f}, {lo:.6f}" for la, lo in zip(df["lat"], df["lon"])]
    druh = kody.druh or Ciselnik("SC_D_POZEMKU", {}, "")
    zpusob = kody.zpusob or Ciselnik("SC_ZP_VYUZITI_POZ", {}, "")
    df["druh_nazev"] = df["druh_kod"].map(druh.popis)
    df["zpusob_nazev"] = df["zpusob_kod"].map(zpusob.popis)
    df["up_plocha"] = [f"{k} – {n}" if n else k for k, n in zip(df["up_kod"], df["up_nazev"])]
    df["podil_pct"] = (df["podil"] * 100).round(1)
    df["pristup_txt"] = df["pristup"].map(lambda v: "neznámo" if pd.isna(v) else ("ano" if v else "ne"))
    df["vzdalenost_komunikace_m"] = df["vzdalenost_komunikace_m"].round(1)
    odk = cfg["odkazy"]
    df["url_nahlizeni"] = df["id_parcely"].map(lambda i: nahlizeni_url(odk["nahlizeni"], i))
    df["url_vdp"] = df["id_parcely"].map(lambda i: vdp_url(odk["vdp"], i))
    df["url_mapy"] = [mapy_url(odk["mapy"], lo, la) for la, lo in zip(df["lat"], df["lon"])]
    df["rozpad_skore"] = [
        f"podíl {a:g} + přístup {b:g} + výměra {c:g} + druh {d:g}"
        for a, b, c, d in zip(df["skore_podil"], df["skore_pristup"], df["skore_vymera"], df["skore_druh"])
    ]
    if "bud_id" in df.columns:
        df["bud_id_txt"] = df["bud_id"].map(lambda v: "ano" if pd.notna(v) else "ne")
    return df


def _concat(frames: list[gpd.GeoDataFrame]) -> gpd.GeoDataFrame:
    frames = [f for f in frames if f is not None and not f.empty]
    if not frames:
        return gpd.GeoDataFrame(geometry=gpd.GeoSeries([], crs=CRS_KN))
    return gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry", crs=CRS_KN)


def _score_and_access(df: gpd.GeoDataFrame, cfg: Config, kody: Kody, roads: gpd.GeoDataFrame | None) -> gpd.GeoDataFrame:
    if df.empty:
        return df
    df = df.join(access(df, roads, float(cfg["max_vzdalenost_od_komunikace_m"])))
    sk = cfg["skore"]
    df = df.join(score(
        df,
        bonus_kody=kody.bonus,
        min_vymera=float(cfg["min_vymera_m2"]),
        max_vymera=float(cfg["max_vymera_m2"]),
        idealni=tuple(sk["idealni_vymera_m2"]),
        vahy=sk["vahy"],
    ))
    return enrich(df, cfg, kody)


def summary_tables(results: list[KUResult]) -> tuple[pd.DataFrame, pd.DataFrame]:
    kroky, stav = [], []
    for r in results:
        name = f"{r.ku.kod} {r.ku.nazev}"
        stav.append({
            "ku_kod": r.ku.kod, "ku_nazev": r.ku.nazev, "obec": r.ku.obec, "stav": r.stav,
            "kandidatu": len(r.filtr.kandidati) if r.filtr is not None else None,
            "budovy": r.budovy, "zprava": r.zprava,
        })
        if r.filtr is not None:
            for k in r.filtr.kroky:
                kroky.append({"ku": name, **k})
    return pd.DataFrame(kroky, columns=["ku", "krok", "vyrazeno", "zbyva"]), pd.DataFrame(stav)


def format_summary(run: RunResult) -> str:
    lines = [f"Souhrn běhu → {run.out_dir}", ""]
    widths = (8, 9, 9, 8, 8, 8, 7, 9)
    header = (f"{'KÚ':<32}{'vstup':>8}{'zastav.':>9}{'nevhod.':>9}{'budova':>8}{'výměra':>8}{'podíl':>8}"
              f"{'lesní':>7}{'kandid.':>9}")
    lines.append(header)
    lines.append("-" * len(header))
    tot = [0] * len(widths)
    for r in run.results:
        name = f"{r.ku.kod} {r.ku.nazev}"[:31]
        if r.filtr is None:
            lines.append(f"{name:<32}  CHYBA: {r.zprava[:120]}")
            continue
        k = r.filtr.kroky
        vals = [k[0]["zbyva"]] + [s["vyrazeno"] for s in k[1:]] + [k[-1]["zbyva"]]
        tot = [a + b for a, b in zip(tot, vals)]
        lines.append(f"{name:<32}" + "".join(f"{v:>{w}}" for v, w in zip(vals, widths)))
    lines.append("-" * len(header))
    lines.append(f"{'CELKEM':<32}" + "".join(f"{v:>{w}}" for v, w in zip(tot, widths)))
    ok = sum(r.stav == "OK" for r in run.results)
    lines.append("")
    lines.append(f"KÚ zpracováno: {ok}/{len(run.results)}, kandidátů: {len(run.kandidati)}, "
                 f"lesní a vyřazené k posouzení: {len(run.lesni_vyrazene)}")
    if not run.kandidati.empty:
        top = run.kandidati.head(5)
        lines.append("Top 5: " + "; ".join(
            f"{r.ku_nazev} {r.cislo} ({r.skore:g} b., {r.vymera_filtr:.0f} m²)" for r in top.itertuples()))
    for p in run.soubory:
        lines.append(f"  {p}")
    return "\n".join(lines)


def _explain_empty(results: list[KUResult]) -> str:
    sums: dict[str, int] = {}
    for r in results:
        if r.filtr is None:
            continue
        for k in r.filtr.kroky[1:]:
            sums[k["krok"]] = sums.get(k["krok"], 0) + k["vyrazeno"]
    if not sums:
        return "Žádné KÚ se nepodařilo zpracovat – viz chyby výše."
    worst = max(sums, key=sums.get)
    return (f"Prázdný výsledek: žádná parcela neprošla filtry. Nejvíc parcel vyřadil krok „{worst}“ "
            f"({sums[worst]}). Zkontroluj cilove_kody a atribut_kod ÚP (inspect), případně limity v configu.")


def run(cfg: Config, only_ku: list[int] | None = None, out_dir: Path | None = None,
        verbose: bool = False, title_suffix: str = "") -> RunResult:
    datum = dt.date.today().isoformat()
    out_dir = out_dir or (cfg.output_dir / datum)
    out_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(out_dir / "beh.log", verbose)
    selected = [k for k in cfg.ku if not only_ku or k.kod in only_ku]
    if only_ku:
        unknown = set(only_ku) - {k.kod for k in selected}
        if unknown:
            log.warning("KÚ %s nejsou v configu – přeskakuji", sorted(unknown))
    log.info("Běh %s: %d KÚ, config %s", datum, len(selected), cfg.path)

    kody = load_codes(cfg)
    up_cache: dict[str, gpd.GeoDataFrame | Exception] = {}
    results: list[KUResult] = []
    for ku in selected:
        try:
            if ku.up is None:
                raise UPError(f"Obec „{ku.obec}“ nemá v configu uzemni_plan (cesta k datům ÚP).")
            if ku.obec not in up_cache:
                try:
                    up_cache[ku.obec] = load_up(ku.up, cfg["nazvy_ploch"], cfg.cache_dir)
                except (UPError, OSError) as exc:
                    up_cache[ku.obec] = exc
            up = up_cache[ku.obec]
            if isinstance(up, Exception):
                raise up
            results.append(process_ku(cfg, ku, up, kody))
        except Exception as exc:  # noqa: BLE001 – selhání jednoho KÚ nesmí shodit běh
            log.error("KÚ %s %s: %s", ku.kod, ku.nazev, exc)
            log.debug("".join(traceback.format_exception(exc)))
            results.append(KUResult(ku=ku, stav="CHYBA", zprava=str(exc)))

    ok = [r for r in results if r.filtr is not None]
    roads = None
    if kody.pristup is not None:
        roads = _concat([r.roads for r in ok])[["id_parcely", "geometry"]] if ok else None
    kand = _score_and_access(_concat([r.filtr.kandidati for r in ok]), cfg, kody, roads)
    lv = _score_and_access(_concat([r.filtr.lesni for r in ok] + [r.filtr.vyrazene for r in ok]), cfg, kody, roads)
    if not kand.empty:
        kand = kand.sort_values(["skore", "podil", "vymera_filtr"], ascending=[False, False, False]).reset_index(drop=True)
    if not lv.empty:
        lv = lv.assign(_lesni=lv["duvod"] == "lesní pozemek").sort_values(
            ["_lesni", "podil"], ascending=[False, False]).drop(columns="_lesni").reset_index(drop=True)

    files: list[Path] = []
    kroky_df, stav_df = summary_tables(results)
    params = [("Datum běhu", datum)] + cfg.parametry() + [
        ("Číselník druhů pozemku", kody.druh.zdroj if kody.druh else "nedostupný"),
        ("Číselník způsobů využití", kody.zpusob.zdroj if kody.zpusob else "nedostupný"),
        ("Licence dat", "Katastrální mapa a číselníky © ČÚZK, CC BY 4.0"),
    ]
    xlsx = out_dir / "kandidati.xlsx"
    write_excel(xlsx, kand, lv, params, kroky_df, stav_df)
    files.append(xlsx)

    up_all = _concat([r.up_target for r in ok if r.up_target is not None])
    if not up_all.empty:
        # více KÚ jedné obce sdílí stejné plochy ÚP
        up_all = up_all[~up_all.geometry.to_wkb().duplicated()]
    gpkg = out_dir / "kandidati.gpkg"
    write_gpkg(gpkg, {
        "kandidati": kand,
        "lesni_vyrazene": lv,
        "plochy_up_cilove": up_all,
    })
    if gpkg.exists():
        files.append(gpkg)

    mapa = out_dir / "mapa.html"
    build_map(mapa, kand, lv, up_all, cfg["mapa"],
              f"Kandidáti na stavební parcely · {datum} · {len(kand)} parcel{title_suffix}")
    files.append(mapa)
    files.append(out_dir / "beh.log")

    result = RunResult(out_dir=out_dir, results=results, kandidati=kand, lesni_vyrazene=lv, soubory=files)
    if kand.empty:
        log.warning(_explain_empty(results))
    for line in format_summary(result).splitlines():
        log.info(line)
    return result
