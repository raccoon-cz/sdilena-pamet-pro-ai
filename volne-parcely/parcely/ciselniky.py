"""Číselníky ČÚZK (druh pozemku, způsob využití, KÚ, obce).

Zdroj: https://services.cuzk.gov.cz/sestavy/cis/{NAZEV}.zip – CSV v CP1250, oddělovač „;“.
"""
from __future__ import annotations

import logging
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .download import DownloadError, download

log = logging.getLogger("parcely")

# Záloha pro případ, že číselník nejde stáhnout. Obsahuje jen kódy, které jsou ověřené
# z publikovaného rozboru dat ČÚZK; ostatní kódy se zobrazí jako „kód N“.
FALLBACK_DRUH_POZEMKU: dict[int, str] = {
    2: "orná půda",
    5: "zahrada",
    10: "lesní pozemek",
    11: "vodní plocha",
    13: "zastavěná plocha a nádvoří",
    14: "ostatní plocha",
}


@dataclass
class Ciselnik:
    nazev: str
    hodnoty: dict[int, str]
    zdroj: str

    def popis(self, kod) -> str:
        if kod is None or pd.isna(kod):
            return ""
        return self.hodnoty.get(int(kod), f"kód {int(kod)}")


def normalize(text: str) -> str:
    """Porovnávací tvar: bez diakritiky, malá písmena, jednoduché mezery."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(text.casefold().split())


def read_csv_from_zip(path: Path) -> pd.DataFrame:
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not names:
            raise ValueError(f"{path.name} neobsahuje CSV.")
        with zf.open(names[0]) as fh:
            df = pd.read_csv(fh, sep=";", encoding="cp1250", dtype=str, keep_default_na=False)
    df.columns = [str(c).strip().upper() for c in df.columns]
    return df


def _fetch(cfg, nazev: str) -> Path:
    z = cfg["zdroje"]
    path, _ = download(
        z["ciselnik_url"].format(nazev=nazev),
        Path(cfg.cache_dir) / "cis" / f"{nazev}.zip",
        pokusy=int(z["pokusy"]),
        backoff_s=float(z["backoff_s"]),
        timeout_s=float(z["timeout_s"]),
    )
    return path


def load_ciselnik(cfg, nazev: str, fallback: dict[int, str] | None = None) -> Ciselnik | None:
    try:
        path = _fetch(cfg, nazev)
        df = read_csv_from_zip(path)
        if "KOD" not in df.columns or "NAZEV" not in df.columns:
            raise ValueError(f"číselník {nazev} nemá sloupce KOD a NAZEV (má: {', '.join(df.columns)})")
        hodnoty: dict[int, str] = {}
        for kod, nazev_hodnoty in zip(df["KOD"], df["NAZEV"]):
            try:
                hodnoty[int(kod)] = str(nazev_hodnoty).strip()
            except ValueError:
                continue
        log.info("Číselník %s: %d položek", nazev, len(hodnoty))
        return Ciselnik(nazev, hodnoty, str(path))
    except (DownloadError, ValueError, zipfile.BadZipFile, OSError) as exc:
        if fallback:
            log.warning("Číselník %s nejde načíst (%s) – používám vestavěnou neúplnou zálohu.", nazev, exc)
            return Ciselnik(nazev, dict(fallback), "vestavěná záloha (neúplná)")
        log.warning("Číselník %s nejde načíst (%s).", nazev, exc)
        return None


def resolve_codes(items: list, ciselnik: Ciselnik | None, popis: str) -> tuple[set[int], list[str]]:
    """Převede položky configu (názvy nebo kódy) na množinu kódů. Vrací (kódy, nenalezené)."""
    codes: set[int] = set()
    missing: list[str] = []
    for item in items or []:
        if isinstance(item, int) or str(item).strip().isdigit():
            codes.add(int(item))
            continue
        if ciselnik is None:
            missing.append(str(item))
            continue
        wanted = normalize(item)
        found = [k for k, v in ciselnik.hodnoty.items() if normalize(v) == wanted]
        if found:
            codes.update(found)
        else:
            missing.append(str(item))
    if missing:
        dostupne = ", ".join(sorted(set(ciselnik.hodnoty.values()))) if ciselnik else "číselník nedostupný"
        log.warning("%s: nenalezeno v číselníku: %s (dostupné: %s)", popis, ", ".join(missing), dostupne)
    return codes, missing


def hledej_ku(cfg, text: str) -> pd.DataFrame:
    """Vyhledá platná katastrální území podle názvu KÚ nebo obce."""
    ku = read_csv_from_zip(_fetch(cfg, "UI_KATASTRALNI_UZEMI"))
    obce = read_csv_from_zip(_fetch(cfg, "UI_OBEC"))
    for df, label in ((ku, "UI_KATASTRALNI_UZEMI"), (obce, "UI_OBEC")):
        if "KOD" not in df.columns or "NAZEV" not in df.columns:
            raise ValueError(f"{label} nemá očekávané sloupce KOD/NAZEV (má: {', '.join(df.columns)})")
    if "PLATI_DO" in ku.columns:
        ku = ku[ku["PLATI_DO"].str.strip() == ""]
    if "PLATI_DO" in obce.columns:
        obce = obce[obce["PLATI_DO"].str.strip() == ""]
    obce = obce[["KOD", "NAZEV"]].rename(columns={"KOD": "OBEC_KOD", "NAZEV": "OBEC"})
    out = ku.merge(obce, on="OBEC_KOD", how="left") if "OBEC_KOD" in ku.columns else ku.assign(OBEC="")
    wanted = normalize(text)
    mask = out["NAZEV"].map(normalize).str.contains(wanted, regex=False) | out["OBEC"].fillna("").map(
        normalize
    ).str.contains(wanted, regex=False)
    cols = [c for c in ("KOD", "NAZEV", "OBEC_KOD", "OBEC") if c in out.columns]
    return out.loc[mask, cols].sort_values("NAZEV").reset_index(drop=True)
