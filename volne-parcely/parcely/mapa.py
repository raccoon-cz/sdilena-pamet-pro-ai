"""Interaktivní mapa (folium): ortofoto ČÚZK, plochy ÚP, kandidáti podle skóre."""
from __future__ import annotations

import html
import logging
from pathlib import Path

import branca.colormap as cm
import folium
import geopandas as gpd
import pandas as pd

log = logging.getLogger("parcely")

# barvy ploch ÚP mimo červeno-zelenou škálu skóre
UP_PALETTE = ["#2166ac", "#8073ac", "#b35806", "#35978f", "#c51b7d", "#542788", "#4393c3", "#878787"]
SCORE_CMAP = cm.LinearColormap(["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"], vmin=0, vmax=100,
                               caption="Skóre kandidáta (0–100)")


def _e(v) -> str:
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return ""
    return html.escape(str(v))


def _link(url, text: str) -> str:
    if not url or (not isinstance(url, str) and pd.isna(url)):
        return ""
    return f'<a href="{html.escape(str(url), quote=True)}" target="_blank" rel="noopener">{html.escape(text)}</a>'


def popup_html(r: pd.Series) -> str:
    rows = [
        ("Skóre", r.get("skore")),
        ("Obec / KÚ", f"{_e(r.get('obec'))} / {_e(r.get('ku_nazev'))}"),
        ("Parcela", r.get("cislo")),
        ("Druh pozemku", r.get("druh_nazev")),
        ("Výměra", f"{r.get('vymera_filtr'):,.0f} m²".replace(",", " ") if pd.notna(r.get("vymera_filtr")) else ""),
        ("Plocha ÚP", r.get("up_plocha")),
        ("Podíl v ploše", f"{r.get('podil_pct')} %"),
        ("Přístup", r.get("pristup_txt")),
    ]
    if r.get("duvod"):
        rows.insert(0, ("Vyřazeno", r.get("duvod")))
    body = "".join(
        f"<tr><th style='text-align:left;padding-right:8px'>{_e(k)}</th><td>{v if k == 'Obec / KÚ' else _e(v)}</td></tr>"
        for k, v in rows
    )
    links = " · ".join(
        x for x in (_link(r.get("url_nahlizeni"), "Nahlížení do KN"), _link(r.get("url_vdp"), "RÚIAN"),
                    _link(r.get("url_mapy"), "Mapy.cz")) if x
    )
    return f"<table style='font-size:12px'>{body}</table><div style='margin-top:6px'>{links}</div>"


def _to_wgs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    return gdf.to_crs(4326)


def build_map(
    out_path: Path,
    kandidati: gpd.GeoDataFrame,
    lesni_vyrazene: gpd.GeoDataFrame,
    up_target: gpd.GeoDataFrame | None,
    mapa_cfg: dict,
    title: str,
) -> None:
    m = folium.Map(location=[49.2, 16.6], zoom_start=13, tiles=None, control_scale=True)
    folium.raster_layers.WmsTileLayer(
        url=mapa_cfg["ortofoto_wms"], layers=mapa_cfg["ortofoto_vrstva"], fmt="image/jpeg", transparent=False,
        version="1.1.1", name="Ortofoto ČÚZK (WMS)", attr="© ČÚZK", overlay=False, control=True, max_zoom=21,
    ).add_to(m)
    folium.TileLayer("OpenStreetMap", name="OpenStreetMap", overlay=False, control=True, show=False).add_to(m)
    if mapa_cfg.get("katastr_wms"):
        folium.raster_layers.WmsTileLayer(
            url=mapa_cfg["katastr_wms"], layers=mapa_cfg["katastr_vrstvy"], fmt="image/png", transparent=True,
            version="1.1.1", name="Katastrální mapa ČÚZK (WMS)", attr="© ČÚZK", overlay=True, show=False,
            max_zoom=21,
        ).add_to(m)

    bounds_src = []
    if up_target is not None and not up_target.empty:
        up = up_target[["up_kod", "up_nazev", "geometry"]].copy()
        tol = float(mapa_cfg.get("zjednoduseni_up_m") or 0)
        if tol > 0:
            up["geometry"] = up.geometry.simplify(tol, preserve_topology=True)
        up = _to_wgs(up)
        colors = {k: UP_PALETTE[i % len(UP_PALETTE)] for i, k in enumerate(sorted(up["up_kod"].unique()))}
        folium.GeoJson(
            up,
            name="Plochy ÚP (cílové kódy)",
            style_function=lambda f: {
                "color": colors.get(f["properties"]["up_kod"], "#666"), "weight": 1,
                "fillColor": colors.get(f["properties"]["up_kod"], "#666"), "fillOpacity": 0.2,
            },
            tooltip=folium.GeoJsonTooltip(["up_kod", "up_nazev"], aliases=["Kód", "Plocha"]),
        ).add_to(m)
        bounds_src.append(up)

    if lesni_vyrazene is not None and not lesni_vyrazene.empty:
        lv = _to_wgs(lesni_vyrazene.copy())
        lv["popup"] = lv.apply(popup_html, axis=1)
        lv = lv[["popup", "duvod", "cislo", "geometry"]]
        folium.GeoJson(
            lv,
            name="Lesní a vyřazené",
            show=False,
            style_function=lambda f: {
                "color": "#2d6a4f" if f["properties"]["duvod"] == "lesní pozemek" else "#555555",
                "weight": 1, "fillOpacity": 0.25, "dashArray": "4",
            },
            tooltip=folium.GeoJsonTooltip(["cislo", "duvod"], aliases=["Parcela", "Vyřazeno"]),
            popup=folium.GeoJsonPopup(["popup"], labels=False, localize=False, max_width=360),
        ).add_to(m)

    if kandidati is not None and not kandidati.empty:
        k = _to_wgs(kandidati.copy())
        k["popup"] = k.apply(popup_html, axis=1)
        k["barva"] = k["skore"].map(lambda s: SCORE_CMAP(float(s)))
        k = k[["popup", "barva", "skore", "cislo", "geometry"]]
        folium.GeoJson(
            k,
            name="Kandidáti (plochy)",
            style_function=lambda f: {
                "color": f["properties"]["barva"], "weight": 3,
                "fillColor": f["properties"]["barva"], "fillOpacity": 0.45,
            },
            highlight_function=lambda f: {"weight": 5, "fillOpacity": 0.7},
            tooltip=folium.GeoJsonTooltip(["cislo", "skore"], aliases=["Parcela", "Skóre"]),
            popup=folium.GeoJsonPopup(["popup"], labels=False, localize=False, max_width=360),
        ).add_to(m)
        body = folium.FeatureGroup(name="Kandidáti (body)", show=True)
        pts = k.copy()
        pts["geometry"] = kandidati.geometry.representative_point().to_crs(4326).values
        for _, r in pts.iterrows():
            folium.CircleMarker(
                location=[r.geometry.y, r.geometry.x], radius=5, color="#222", weight=1,
                fill=True, fill_color=r["barva"], fill_opacity=0.95,
                popup=folium.Popup(r["popup"], max_width=360), tooltip=f"{r['cislo']} · skóre {r['skore']}",
            ).add_to(body)
        body.add_to(m)
        bounds_src.insert(0, k)
        SCORE_CMAP.add_to(m)

    if bounds_src:
        minx, miny, maxx, maxy = bounds_src[0].total_bounds
        m.fit_bounds([[miny, minx], [maxy, maxx]])

    m.get_root().html.add_child(folium.Element(
        "<div style='position:fixed;top:10px;left:50px;z-index:9999;background:rgba(255,255,255,.9);"
        "padding:6px 10px;border-radius:4px;font:14px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)'>"
        f"{html.escape(title)}</div>"
    ))
    folium.LayerControl(collapsed=False).add_to(m)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    m.save(str(out_path))
    log.info("Mapa: %s", out_path)
