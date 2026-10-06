"""Načtení a validace konfigurace (config.yaml).

Relativní cesty v configu se berou vůči složce, ve které config leží.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ConfigError(Exception):
    """Chyba v konfiguraci, kterou musí opravit uživatel."""


DEFAULTS: dict[str, Any] = {
    "cilove_kody": ["BI", "BV", "BX", "SV", "SM"],
    # Záloha pro ÚP, které kódy jednotného standardu nepoužívají (starší ÚP mají např. „B“ =
    # „Plochy smíšené obytné“): cílové plochy se pak vyberou podle názvu. [] = vypnuto.
    "cilove_nazvy": ["bydlení", "smíšené obytné"],
    "cilove_nazvy_vyjma": ["hromadné"],
    # presne = kód plochy se musí shodovat přesně, prefix = stačí začátek (např. "BI" ~ "BI.1")
    "porovnani_kodu": "presne",
    # Názvy použité, když ÚP nemá atribut s názvem plochy. Lze přepsat v configu.
    "nazvy_ploch": {
        "BI": "bydlení individuální",
        "BH": "bydlení hromadné",
        "BV": "bydlení venkovské",
        "BX": "bydlení (specifický typ)",
        "SV": "smíšené obytné venkovské",
        "SM": "smíšené obytné městské",
    },
    "min_vymera_m2": 600,
    "max_vymera_m2": 5000,
    "min_podil_v_plose": 0.6,
    "max_vzdalenost_od_komunikace_m": 5,
    "max_prekryv_budovy_m2": 10,
    # Do listu „Lesní a vyřazené“ jdou vyřazené parcely aspoň s tímto podílem v cílové ploše
    # a aspoň s touto výměrou (drobné zbytkové parcely jsou jen šum). Stávající domy
    # (zastavěná plocha) a nevhodné parcely (komunikace, voda) se do listu nedávají.
    "vyrazene_min_podil": 0.1,
    "vyrazene_min_vymera_m2": 300,
    "skore": {
        "idealni_vymera_m2": [800, 1500],
        "vahy": {"podil": 40, "pristup": 25, "vymera": 20, "druh": 15},
    },
    # Položky lze zadat názvem z číselníku ČÚZK (SC_D_POZEMKU) nebo přímo číselným kódem.
    "druhy_pozemku": {
        "zastavena": ["zastavěná plocha a nádvoří"],
        "lesni": ["lesní pozemek"],
        "bonus": ["zahrada", "orná půda"],
        # parcely, na které se dům postavit nedá (vyřadí se); [] = vypnuto
        "nevhodne": ["vodní plocha"],
    },
    # Názvy (nebo kódy) z číselníku SC_ZP_VYUZITI_POZ, které znamenají přístupovou komunikaci.
    "pristup_zpusoby_vyuziti": ["silnice", "ostatní komunikace"],
    # Způsoby využití, které parcelu vyřadí – parcela sama je komunikace / dopravní plocha.
    "nevhodne_zpusoby_vyuziti": ["silnice", "ostatní komunikace", "dálnice", "dráha", "ostatní dopravní plocha"],
    "cache_dir": "data/cache",
    "output_dir": "output",
    "zdroje": {
        "shp_url": "https://services.cuzk.gov.cz/shp/ku/epsg-5514/{kod_ku}.zip",
        "ciselnik_url": "https://services.cuzk.gov.cz/sestavy/cis/{nazev}.zip",
        "vfr_url": "https://vdp.cuzk.gov.cz/vymenny_format/soucasna/{datum}_OB_{kod_obce}_UKSH.xml.zip",
        "pokusy": 4,
        "backoff_s": 2,
        "timeout_s": 120,
    },
    # Názvy vrstev a atributů v SHP balíčku ČÚZK. Ověř je příkazem `inspect`.
    "kn": {
        "kodovani": "cp1250",
        "vrstva_parcely": "PARCELY_KN_P",
        "vrstva_parcely_atributy": "PARCELY_KN_DEF",
        "vrstva_budovy": "BUDOVY_P",
        # klíče pro spojení polygonů s atributy; použije se první, který je v obou vrstvách unikátní
        "join_klice": ["ID_2", "ID"],
        "atributy": {
            "id_parcely": "ID_2",
            "ku_kod": "KATUZE_KOD",
            "obec_kod": "OBEC_KOD",
            "cislo": "TEXT_KM",
            "vymera": "PAR_VYMERA",
            "druh_kod": "DRUPOZ_KOD",
            "zpusob_kod": "ZPVYPA_KOD",
            "bud_id": "BUD_ID",
        },
    },
    "budovy": {
        # auto = vrstva budov z SHP balíčku, když chybí, tak RÚIAN VFR; shp | vfr | soubor | zadne
        "zdroj": "auto",
        "soubor": None,
        "vrstva": None,
    },
    "odkazy": {
        "nahlizeni": "https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?typ=parcela&id={id}",
        "vdp": "https://vdp.cuzk.gov.cz/vdp/ruian/parcely/{id}",
        "mapy": "https://mapy.com/fnc/v1/showmap?mapset=aerial&center={lon},{lat}&zoom=18&marker=true",
    },
    "mapa": {
        "ortofoto_wms": "https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer",
        "ortofoto_vrstva": "0",
        "katastr_wms": "https://services.cuzk.gov.cz/wms/local-km-wms.asp",
        "katastr_vrstvy": "hranice_parcel,parcelni_cisla",
        "zjednoduseni_up_m": 1.0,
    },
}

REQUIRED_KN_ATTRS = ("id_parcely", "cislo", "vymera", "druh_kod", "zpusob_kod")

# Atributy ÚP vypisované jako detail plochy (použijí se jen ty, které v datech jsou):
# jednotný standard (CasH, Index) i běžné varianty starších ÚP (stav/fáze plochy).
ATRIBUTY_INFO = ("CasH", "Index", "FAZE_2", "VYZNAM", "STAV")


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


@dataclass
class UzemniPlan:
    obec: str
    cesta: Path | str  # soubor, nebo URL veřejné ArcGIS služby (…/FeatureServer[/id])
    vrstva: str | None = None
    atribut_kod: str = "Typ"
    atribut_nazev: str | None = "auto"
    crs: str | None = None
    kodovani: str | None = None
    filtr: dict[str, list[str]] = field(default_factory=dict)
    # Atributy ÚP, které se vypíšou do výstupu jako doplňující informace (pokud v datech jsou).
    atributy_info: list[str] = field(default_factory=lambda: list(ATRIBUTY_INFO))
    # jen pro ArcGIS službu: podmínka dotazu na straně serveru
    where: str = "1=1"
    # přepíší globální cilove_kody / cilove_nazvy jen pro tuto obec
    cilove_kody: list[str] | None = None
    cilove_nazvy: list[str] | None = None

    @property
    def je_sluzba(self) -> bool:
        return isinstance(self.cesta, str) and self.cesta.startswith(("http://", "https://"))


@dataclass
class KatastralniUzemi:
    kod: int
    nazev: str
    obec: str
    up: UzemniPlan | None


@dataclass
class Config:
    path: Path | None
    base_dir: Path
    raw: dict[str, Any]
    ku: list[KatastralniUzemi]

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    def resolve(self, p: str | Path) -> Path:
        p = Path(p).expanduser()
        return p if p.is_absolute() else (self.base_dir / p)

    @property
    def cache_dir(self) -> Path:
        return self.resolve(self.raw["cache_dir"])

    @property
    def output_dir(self) -> Path:
        return self.resolve(self.raw["output_dir"])

    @property
    def cilove_kody(self) -> list[str]:
        return [str(k).strip().upper() for k in self.raw["cilove_kody"]]

    def parametry(self) -> list[tuple[str, Any]]:
        """Parametry pro list „Parametry běhu“."""
        r = self.raw
        return [
            ("Config", str(self.path) if self.path else "(v paměti)"),
            ("Cílové kódy ploch ÚP", ", ".join(self.cilove_kody)),
            ("Cílové názvy ploch (záloha bez kódů)", ", ".join(r["cilove_nazvy"]) or "–"),
            ("Názvy vyjma", ", ".join(r["cilove_nazvy_vyjma"]) or "–"),
            ("Porovnání kódů", r["porovnani_kodu"]),
            ("Min. výměra (m²)", r["min_vymera_m2"]),
            ("Max. výměra (m²)", r["max_vymera_m2"]),
            ("Min. podíl v ploše", r["min_podil_v_plose"]),
            ("Max. vzdálenost od komunikace (m)", r["max_vzdalenost_od_komunikace_m"]),
            ("Max. překryv budovy (m²)", r["max_prekryv_budovy_m2"]),
            ("Druh pozemku – zastavěná", ", ".join(map(str, r["druhy_pozemku"]["zastavena"]))),
            ("Druh pozemku – lesní", ", ".join(map(str, r["druhy_pozemku"]["lesni"]))),
            ("Druh pozemku – bonus ve skóre", ", ".join(map(str, r["druhy_pozemku"]["bonus"]))),
            ("Druh pozemku – nevhodný (vyřadit)", ", ".join(map(str, r["druhy_pozemku"]["nevhodne"])) or "–"),
            ("Způsoby využití = komunikace", ", ".join(map(str, r["pristup_zpusoby_vyuziti"]))),
            ("Způsoby využití – nevhodné (vyřadit)", ", ".join(map(str, r["nevhodne_zpusoby_vyuziti"])) or "–"),
            ("Ideální výměra pro skóre (m²)", "–".join(map(str, r["skore"]["idealni_vymera_m2"]))),
            ("Váhy skóre", ", ".join(f"{k}={v}" for k, v in r["skore"]["vahy"].items())),
            ("Zdroj katastrální mapy", r["zdroje"]["shp_url"]),
            ("Zdroj budov", r["budovy"]["zdroj"]),
        ]


def _parse_up(obec: str, data: dict | None, cfg_dir: Path) -> UzemniPlan | None:
    if not data:
        return None
    if not isinstance(data, dict) or not data.get("cesta"):
        raise ConfigError(f"Obec „{obec}“: u územního plánu chybí klíč 'cesta'.")
    raw_cesta = str(data["cesta"]).strip()
    if raw_cesta.startswith(("http://", "https://")):
        cesta: Path | str = raw_cesta
    else:
        cesta = Path(raw_cesta).expanduser()
        if not cesta.is_absolute():
            cesta = cfg_dir / cesta
    filtr = data.get("filtr") or {}
    if not isinstance(filtr, dict):
        raise ConfigError(f"Obec „{obec}“: 'filtr' musí být slovník {{atribut: [hodnoty]}}.")
    filtr = {str(k): [str(v) for v in (vals if isinstance(vals, list) else [vals])] for k, vals in filtr.items()}
    return UzemniPlan(
        obec=obec,
        cesta=cesta,
        vrstva=str(data["vrstva"]) if data.get("vrstva") is not None else None,
        atribut_kod=str(data.get("atribut_kod") or "Typ"),
        atribut_nazev=data.get("atribut_nazev", "auto"),
        crs=str(data["crs"]) if data.get("crs") else None,
        kodovani=data.get("kodovani"),
        filtr=filtr,
        atributy_info=[str(a) for a in (data.get("atributy_info") or ATRIBUTY_INFO)],
        where=str(data.get("where") or "1=1"),
        cilove_kody=[str(k).strip().upper() for k in data["cilove_kody"]] if data.get("cilove_kody") else None,
        cilove_nazvy=[str(k) for k in data["cilove_nazvy"]] if data.get("cilove_nazvy") is not None else None,
    )


def build_config(raw_user: dict, path: Path | None = None) -> Config:
    base_dir = path.parent.resolve() if path else Path.cwd()
    raw = _deep_merge(DEFAULTS, raw_user or {})

    errors: list[str] = []
    if not raw["cilove_kody"]:
        errors.append("'cilove_kody' nesmí být prázdné.")
    if raw["porovnani_kodu"] not in ("presne", "prefix"):
        errors.append("'porovnani_kodu' musí být 'presne' nebo 'prefix'.")
    try:
        mn, mx = float(raw["min_vymera_m2"]), float(raw["max_vymera_m2"])
        if mn <= 0 or mx <= mn:
            errors.append("Musí platit 0 < min_vymera_m2 < max_vymera_m2.")
    except (TypeError, ValueError):
        errors.append("min_vymera_m2 a max_vymera_m2 musí být čísla.")
    try:
        if not 0 <= float(raw["min_podil_v_plose"]) <= 1:
            errors.append("min_podil_v_plose musí být mezi 0 a 1 (např. 0.6).")
    except (TypeError, ValueError):
        errors.append("min_podil_v_plose musí být číslo.")
    try:
        if float(raw["max_vzdalenost_od_komunikace_m"]) < 0:
            errors.append("max_vzdalenost_od_komunikace_m nesmí být záporná.")
    except (TypeError, ValueError):
        errors.append("max_vzdalenost_od_komunikace_m musí být číslo.")
    ideal = raw["skore"]["idealni_vymera_m2"]
    if not (isinstance(ideal, list) and len(ideal) == 2 and ideal[0] <= ideal[1]):
        errors.append("skore.idealni_vymera_m2 musí být [od, do].")
    if raw["budovy"]["zdroj"] not in ("auto", "shp", "vfr", "soubor", "zadne"):
        errors.append("budovy.zdroj musí být auto | shp | vfr | soubor | zadne.")
    if raw["budovy"]["zdroj"] == "soubor" and not raw["budovy"].get("soubor"):
        errors.append("budovy.zdroj = soubor, ale chybí budovy.soubor (cesta k souboru).")
    for key in REQUIRED_KN_ATTRS:
        if not raw["kn"]["atributy"].get(key):
            errors.append(f"kn.atributy.{key} musí být vyplněné.")

    ku_list: list[KatastralniUzemi] = []
    seen: set[int] = set()
    obce = raw.get("obce") or []
    if not isinstance(obce, list):
        errors.append("'obce' musí být seznam.")
        obce = []
    for i, obec in enumerate(obce, start=1):
        if not isinstance(obec, dict) or not obec.get("nazev"):
            errors.append(f"obce[{i}]: chybí 'nazev'.")
            continue
        nazev_obce = str(obec["nazev"])
        try:
            up = _parse_up(nazev_obce, obec.get("uzemni_plan"), base_dir)
        except ConfigError as exc:
            errors.append(str(exc))
            up = None
        kus = obec.get("katastralni_uzemi") or []
        if not kus:
            errors.append(f"Obec „{nazev_obce}“ nemá žádné katastrální_uzemi.")
        for ku in kus:
            if isinstance(ku, (int, str)):
                ku = {"kod": ku}
            try:
                kod = int(ku.get("kod"))
            except (TypeError, ValueError):
                errors.append(f"Obec „{nazev_obce}“: neplatný kód KÚ {ku.get('kod')!r} (čekám 6místné číslo).")
                continue
            if kod in seen:
                errors.append(f"KÚ {kod} je v configu vícekrát.")
                continue
            seen.add(kod)
            ku_list.append(KatastralniUzemi(kod=kod, nazev=str(ku.get("nazev") or kod), obec=nazev_obce, up=up))

    if errors:
        raise ConfigError("Chyby v konfiguraci:\n  - " + "\n  - ".join(errors))
    return Config(path=path, base_dir=base_dir, raw=raw, ku=ku_list)


def load_config(path: str | Path) -> Config:
    path = Path(path)
    if not path.exists():
        raise ConfigError(
            f"Konfigurace {path} neexistuje. Zkopíruj config.example.yaml na config.yaml a uprav ji."
        )
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ConfigError(f"Config {path} není platný YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Config {path} musí být YAML slovník.")
    return build_config(data, path)
