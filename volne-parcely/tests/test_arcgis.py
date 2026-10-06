"""Načtení ÚP z ArcGIS REST služby – simulovaná služba, bez sítě."""
import pytest

from parcely import arcgis
from parcely.config import build_config
from parcely.uzemni_plan import UPError, load_up

SERVICE = "https://example.test/arcgis/rest/services/UP_test/FeatureServer"
X0, Y0 = -598600.0, -1161700.0


def ring(x1, y1, x2, y2):
    # Esri: vnější prstenec po směru hodinových ručiček
    return [[X0 + x1, Y0 + y1], [X0 + x1, Y0 + y2], [X0 + x2, Y0 + y2], [X0 + x2, Y0 + y1], [X0 + x1, Y0 + y1]]


FEATURES = [
    {"attributes": {"OBJECTID": 1, "TYP": "BI", "NAZEV": "bydlení individuální"}, "geometry": {"rings": [ring(0, 0, 100, 100)]}},
    {"attributes": {"OBJECTID": 2, "TYP": "SV", "NAZEV": "smíšené obytné venkovské"}, "geometry": {"rings": [ring(100, 0, 200, 100)]}},
    {"attributes": {"OBJECTID": 3, "TYP": "NZ", "NAZEV": "zemědělské"}, "geometry": {"rings": [ring(0, 100, 200, 200)]}},
]
FIELDS = [{"name": "OBJECTID", "type": "esriFieldTypeOID"},
          {"name": "TYP", "type": "esriFieldTypeString", "length": 10},
          {"name": "NAZEV", "type": "esriFieldTypeString", "length": 100}]


class FakeResponse:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data

    def raise_for_status(self):
        pass


@pytest.fixture
def fake_service(monkeypatch):
    calls = []

    def fake_get(url, params=None, **kwargs):
        calls.append((url, dict(params or {})))
        if url == SERVICE:
            return FakeResponse({"layers": [{"id": 0, "name": "Plochy RZV", "geometryType": "esriGeometryPolygon"},
                                            {"id": 1, "name": "Hranice", "geometryType": "esriGeometryPolyline"}]})
        if url == f"{SERVICE}/0":
            return FakeResponse({"type": "Feature Layer", "maxRecordCount": 2,
                                 "advancedQueryCapabilities": {"supportsPagination": True}})
        if url == f"{SERVICE}/0/query":
            off, cnt = int(params["resultOffset"]), int(params["resultRecordCount"])
            chunk = FEATURES[off:off + cnt]
            return FakeResponse({"geometryType": "esriGeometryPolygon",
                                 "spatialReference": {"wkid": 5514, "latestWkid": 5514},
                                 "fields": FIELDS, "features": chunk,
                                 "exceededTransferLimit": off + cnt < len(FEATURES)})
        return FakeResponse({}, status=404)

    monkeypatch.setattr(arcgis.requests, "get", fake_get)
    return calls


def test_fetch_strankovane(fake_service):
    gdf = arcgis.fetch_layer(f"{SERVICE}/0")
    assert len(gdf) == 3
    assert sorted(gdf["TYP"]) == ["BI", "NZ", "SV"]
    assert gdf.crs.to_epsg() == 5514
    assert gdf.geometry.area.round().tolist() == [10000, 10000, 20000]
    assert sum(1 for u, _ in fake_service if u.endswith("/query")) == 2


def test_vyber_polygonove_vrstvy_a_cache(fake_service, tmp_path):
    p1 = arcgis.load_cached(tmp_path, SERVICE)
    n = len(fake_service)
    p2 = arcgis.load_cached(tmp_path, SERVICE)
    assert p1 == p2 and p1.exists()
    assert len(fake_service) == n + 1  # podruhé jen výpis vrstev, data z cache


def test_neznama_vrstva(fake_service):
    with pytest.raises(arcgis.ArcGISError, match="nemá vrstvu"):
        arcgis.resolve_layer_url(SERVICE, "Neexistuje")


def test_load_up_ze_sluzby(fake_service, tmp_path):
    cfg = build_config({"obce": [{"nazev": "Test", "uzemni_plan": {"cesta": SERVICE, "atribut_kod": "TYP",
                                                                     "atribut_nazev": "NAZEV", "vrstva": "0"},
                                  "katastralni_uzemi": [999901]}]})
    up = cfg.ku[0].up
    assert up.je_sluzba and up.cesta == SERVICE
    gdf = load_up(up, cache_dir=tmp_path)
    assert set(gdf["up_kod"]) == {"BI", "SV", "NZ"}
    assert gdf.loc[gdf["up_kod"] == "BI", "up_nazev"].iloc[0] == "bydlení individuální"


def test_nedostupna_sluzba(monkeypatch, tmp_path):
    monkeypatch.setattr(arcgis.requests, "get", lambda *a, **k: FakeResponse({}, status=403))
    cfg = build_config({"obce": [{"nazev": "T", "uzemni_plan": {"cesta": SERVICE + "/0"}, "katastralni_uzemi": [1]}]})
    with pytest.raises(UPError, match="HTTP 403"):
        load_up(cfg.ku[0].up, cache_dir=tmp_path)


def test_rozpoznani_url():
    assert arcgis.is_service_url(SERVICE)
    assert arcgis.is_service_url(SERVICE + "/3")
    assert not arcgis.is_service_url("data/up/x.shp")
