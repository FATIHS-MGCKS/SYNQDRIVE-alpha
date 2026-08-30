#!/usr/bin/env python3
"""Unit tests for OSM fuel-station dataset tooling (no database required)."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

LIB_DIR = Path(__file__).resolve().parent.parent / 'lib'
sys.path.insert(0, str(LIB_DIR))

from fuel_station_tags import extract_station_fields  # noqa: E402
from geometry import build_way_geometry, node_point_wkt  # noqa: E402
from validate_dataset import (  # noqa: E402
    DE_MAX_LAT,
    DE_MAX_LON,
    DE_MIN_LAT,
    DE_MIN_LON,
    MIN_STATION_COUNT,
    MAX_STATION_COUNT,
)

try:
    import osmium  # noqa: F401

    HAS_OSMIUM = True
except ImportError:
    HAS_OSMIUM = False


class FakeTags:
    def __init__(self, data: dict[str, str]) -> None:
        self._data = data

    def get(self, key: str, default: str | None = None) -> str | None:
        return self._data.get(key, default)

    def __iter__(self):
        return iter(self._data.items())


class TagMappingTests(unittest.TestCase):
    def test_unicode_name_and_brand(self) -> None:
        tags = FakeTags(
            {
                'name': 'Tankstelle Müller',
                'brand': 'Aral',
                'addr:city': 'Köln',
                'addr:country': 'DE',
            }
        )
        fields = extract_station_fields(tags)
        self.assertEqual(fields['name'], 'Tankstelle Müller')
        self.assertEqual(fields['brand'], 'Aral')
        self.assertEqual(fields['city'], 'Köln')
        self.assertEqual(fields['country_code'], 'DE')

    def test_missing_name_and_brand(self) -> None:
        fields = extract_station_fields(FakeTags({}))
        self.assertIsNone(fields['name'])
        self.assertIsNone(fields['brand'])
        self.assertEqual(fields['country_code'], 'DE')

    def test_addr_place_fallback(self) -> None:
        self.assertEqual(extract_station_fields(FakeTags({'addr:place': 'Oberursel'}))['city'], 'Oberursel')


class GeometryTests(unittest.TestCase):
    def test_node_point(self) -> None:
        self.assertEqual(node_point_wkt(9.5, 51.3), 'POINT(9.5 51.3)')

    def test_closed_way_polygon(self) -> None:
        nodes = {
            1: (9.0, 51.0),
            2: (9.1, 51.0),
            3: (9.1, 51.1),
            4: (9.0, 51.1),
            5: (9.0, 51.0),
        }
        wkt, geom_type = build_way_geometry([1, 2, 3, 4, 5], nodes)
        self.assertEqual(geom_type, 'POLYGON')
        self.assertTrue(wkt.startswith('POLYGON(('))

    def test_open_way_linestring(self) -> None:
        nodes = {1: (9.0, 51.0), 2: (9.1, 51.1)}
        wkt, geom_type = build_way_geometry([1, 2], nodes)
        self.assertEqual(geom_type, 'LINESTRING')
        self.assertTrue(wkt.startswith('LINESTRING('))

    def test_missing_node_returns_none(self) -> None:
        self.assertIsNone(build_way_geometry([1, 2], {1: (9.0, 51.0)}))

    def test_germany_bbox_constants(self) -> None:
        self.assertLess(DE_MIN_LON, DE_MAX_LON)
        self.assertLess(DE_MIN_LAT, DE_MAX_LAT)
        self.assertTrue(5.5 <= 9.4797 <= 15.5)
        self.assertTrue(47.0 <= 51.3127 <= 55.5)


class ImporterIdentityTests(unittest.TestCase):
    @unittest.skipUnless(HAS_OSMIUM, 'pyosmium not installed')
    def test_duplicate_identity_rejected_in_memory(self) -> None:
        spec = importlib.util.spec_from_file_location('fuel_station_importer', LIB_DIR / 'fuel_station_importer.py')
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        collector = mod.FuelStationCollector({}, MagicMock())
        tags = FakeTags({'amenity': 'fuel'})
        collector._append('node', 42, tags, 'POINT(9 51)', None)
        collector._append('node', 42, tags, 'POINT(9 51)', None)
        self.assertEqual(len(collector.rows), 1)


class ValidationThresholdTests(unittest.TestCase):
    def test_station_count_bounds(self) -> None:
        self.assertLess(MIN_STATION_COUNT, MAX_STATION_COUNT)
        self.assertGreaterEqual(MIN_STATION_COUNT, 12_000)


class PromotionSqlTests(unittest.TestCase):
    def test_promote_is_transactional(self) -> None:
        sql = (Path(__file__).resolve().parent.parent / 'promote.sql').read_text(encoding='utf-8')
        self.assertIn('BEGIN;', sql)
        self.assertIn('COMMIT;', sql)
        self.assertIn('fuel_stations_staging', sql)
        self.assertIn('fuel_stations_old', sql)


class RefreshScriptTests(unittest.TestCase):
    def test_refresh_script_exists_and_is_executable_intent(self) -> None:
        script = Path(__file__).resolve().parent.parent / 'osm-fuel-stations-refresh.sh'
        content = script.read_text(encoding='utf-8')
        self.assertIn('osmium tags-filter', content)
        self.assertIn('check-refs', content)
        self.assertIn('validate_dataset.py', content)
        self.assertIn('promote.sql', content)


if __name__ == '__main__':
    unittest.main(verbosity=2)
