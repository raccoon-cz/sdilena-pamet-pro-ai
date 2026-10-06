"""Výpis struktury dat (vrstvy, atributy, ukázky hodnot) – pro KN balíček i soubor ÚP."""
from __future__ import annotations

from dataclasses import dataclass

import pyogrio


@dataclass
class FieldInfo:
    name: str
    dtype: str
    samples: list[str]
    nulls: int


@dataclass
class LayerInfo:
    name: str
    geometry_type: str | None
    features: int
    crs: str | None
    encoding: str | None
    fields: list[FieldInfo]


def describe_layer(path: str, layer: str | None = None, encoding: str | None = None,
                   samples: int = 3, max_features: int = 2000) -> LayerInfo:
    info = pyogrio.read_info(path, layer=layer, encoding=encoding)
    df = pyogrio.read_dataframe(path, layer=layer, encoding=encoding, max_features=max_features, read_geometry=False)
    fields = []
    for name, dtype in zip(info["fields"], info["dtypes"]):
        col = df[name] if name in df.columns else None
        vals = [] if col is None else [str(v) for v in col.dropna().astype(str).unique()[:samples]]
        nulls = 0 if col is None else int(col.isna().sum())
        fields.append(FieldInfo(str(name), str(dtype), vals, nulls))
    return LayerInfo(
        name=layer or str(pyogrio.list_layers(path)[0][0]),
        geometry_type=info.get("geometry_type"),
        features=int(info.get("features") or 0),
        crs=info.get("crs"),
        encoding=f"{encoding} (z configu, SHP bez .cpg)" if encoding else info.get("encoding"),
        fields=fields,
    )


def value_counts(path: str, field: str, layer: str | None = None, encoding: str | None = None, top: int = 40):
    df = pyogrio.read_dataframe(path, layer=layer, encoding=encoding, columns=[field], read_geometry=False)
    return df[field].value_counts(dropna=False).head(top)


def format_layer(li: LayerInfo, sample_rows: int = 2000) -> str:
    out = [
        f"■ {li.name}  [{li.geometry_type or 'bez geometrie'}]  záznamů: {li.features:,}".replace(",", " "),
        f"  CRS: {li.crs or '—'}   kódování: {li.encoding or '—'}",
        f"  {'atribut':<14}{'typ':<10}{'NULL*':>6}  ukázky hodnot",
    ]
    for f in li.fields:
        out.append(f"  {f.name:<14}{f.dtype:<10}{f.nulls:>6}  {' | '.join(f.samples)}")
    out.append(f"  * NULL v prvních {sample_rows} záznamech")
    return "\n".join(out)
