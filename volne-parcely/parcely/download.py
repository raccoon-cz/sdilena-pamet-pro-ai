"""Stahování otevřených dat ČÚZK s cache a opakováním při chybě.

Stahuje se jen z otevřených distribučních služeb (SHP katastrální mapy, číselníky, VFR).
Nahlížení do KN se nikdy automaticky nevolá.
"""
from __future__ import annotations

import logging
import time
import zipfile
from pathlib import Path

import requests

from . import __version__

log = logging.getLogger("parcely")

USER_AGENT = f"volne-parcely/{__version__} (lokalni nastroj, otevrena data CUZK)"


class DownloadError(Exception):
    """Soubor se nepodařilo stáhnout."""


def is_valid_zip(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            return zf.testzip() is None
    except zipfile.BadZipFile:
        return False


def _describe(exc: Exception) -> str:
    if isinstance(exc, requests.exceptions.ProxyError):
        return "proxy odmítla spojení (síťová politika / firewall)"
    if isinstance(exc, requests.exceptions.SSLError):
        return "chyba TLS certifikátu"
    if isinstance(exc, requests.exceptions.Timeout):
        return "vypršel časový limit"
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "nelze se připojit k serveru"
    if isinstance(exc, requests.exceptions.HTTPError) and exc.response is not None:
        return f"HTTP {exc.response.status_code}"
    return str(exc)


def download(
    url: str,
    dest: Path,
    *,
    pokusy: int = 4,
    backoff_s: float = 2,
    timeout_s: float = 120,
    force: bool = False,
    session: requests.Session | None = None,
) -> tuple[Path, bool]:
    """Stáhne `url` do `dest`. Vrací (cesta, True pokud se opravdu stahovalo).

    Existující platný ZIP se znovu nestahuje. 404 se neopakuje (soubor neexistuje),
    síťové chyby a 5xx se opakují s exponenciálním čekáním backoff_s * 2^n.
    """
    dest = Path(dest)
    if not force and is_valid_zip(dest):
        log.debug("Cache: %s", dest)
        return dest, False

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    http = session or requests.Session()
    last_error: str = ""
    for attempt in range(1, pokusy + 1):
        try:
            with http.get(url, stream=True, timeout=(20, timeout_s), headers={"User-Agent": USER_AGENT}) as resp:
                if resp.status_code == 404:
                    raise DownloadError(f"{url} neexistuje (HTTP 404).")
                if resp.status_code in (401, 403, 407):
                    raise DownloadError(
                        f"{url}: přístup odepřen (HTTP {resp.status_code}). "
                        "Zkontroluj síť/proxy; ČÚZK data jsou veřejná a bez přihlášení."
                    )
                resp.raise_for_status()
                with open(tmp, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=1 << 16):
                        fh.write(chunk)
            if not is_valid_zip(tmp):
                raise requests.RequestException("stažený soubor není platný ZIP")
            tmp.replace(dest)
            log.info("Staženo %s (%.1f MB)", dest.name, dest.stat().st_size / 1e6)
            return dest, True
        except DownloadError:
            tmp.unlink(missing_ok=True)
            raise
        except (requests.RequestException, OSError) as exc:
            tmp.unlink(missing_ok=True)
            last_error = _describe(exc)
            log.debug("Stažení %s: %r", url, exc)
            if attempt < pokusy:
                wait = backoff_s * 2 ** (attempt - 1)
                log.warning("Stažení %s selhalo (%s), pokus %d/%d, čekám %.0f s", url, last_error, attempt, pokusy, wait)
                time.sleep(wait)
    raise DownloadError(f"{url} se nepodařilo stáhnout ani po {pokusy} pokusech: {last_error}")


def ku_zip_path(cache_dir: Path, kod_ku: int) -> Path:
    return Path(cache_dir) / "ku" / f"{kod_ku}.zip"


def download_ku(cfg, kod_ku: int, force: bool = False) -> tuple[Path, bool]:
    z = cfg["zdroje"]
    return download(
        z["shp_url"].format(kod_ku=kod_ku),
        ku_zip_path(cfg.cache_dir, kod_ku),
        pokusy=int(z["pokusy"]),
        backoff_s=float(z["backoff_s"]),
        timeout_s=float(z["timeout_s"]),
        force=force,
    )
