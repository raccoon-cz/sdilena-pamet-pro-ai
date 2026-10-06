"""Odkazy na parcelu. Nástroj odkazy jen generuje – nikdy je sám neotevírá ani nevolá."""
from __future__ import annotations

from urllib.parse import quote


def nahlizeni_url(template: str, id_parcely: str) -> str:
    """Nahlížení do KN podle ID parcely (ISKN/RÚIAN, v SHP atribut ID_2)."""
    return template.format(id=quote(str(id_parcely), safe=""))


def vdp_url(template: str, id_parcely: str) -> str:
    """Detail parcely ve Veřejném dálkovém přístupu RÚIAN (VDP)."""
    return template.format(id=quote(str(id_parcely), safe=""))


def mapy_url(template: str, lon: float, lat: float) -> str:
    return template.format(lon=f"{lon:.6f}", lat=f"{lat:.6f}")
