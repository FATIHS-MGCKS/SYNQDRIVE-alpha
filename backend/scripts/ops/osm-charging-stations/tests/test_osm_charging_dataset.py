#!/usr/bin/env python3
"""Unit tests for OSM charging-station dataset tooling (no database required)."""
from __future__ import annotations

import os
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

LIB_DIR = Path(__file__).resolve().parent.parent / 'lib'
sys.path.insert(0, str(LIB_DIR))

from charging_station_tags import (  # noqa: E402
    extract_station_fields,
    is_charging_station_amenity,
    is_motor_vehicle_excluded,
)
from geometry import build_way_geometry, node_point_wkt  # noqa: E402

try:
    import osmium  # noqa: F401

    HAS_OSMIUM = True
except ImportError:
    HAS_OSMIUM = False

if os.environ.get('CHARGING_OSM_TESTS_REQUIRED') == '1' and not HAS_OSMIUM:
    raise SystemExit('ERROR: pyosmium required when CHARGING_OSM_TESTS_REQUIRED=1')


class FakeTags:
    def __init__(self, data: dict[str, str]) -> None:
        self._data = data

    def get(self, key: str, default: str | None = None) -> str | None:
        return self._data.get(key, default)

    def __iter__(self):
        return iter(self._data.items())


class TagFilterTests(unittest.TestCase):
    def test_charging_station_amenity(self) -> None:
        self.assertTrue(is_charging_station_amenity(FakeTags({'amenity': 'charging_station'})))
        self.assertFalse(is_charging_station_amenity(FakeTags({'amenity': 'fuel'})))
        self.assertFalse(is_charging_station_amenity(FakeTags({'amenity': 'device_charging_station'})))

    def test_motorcar_no_excluded(self) -> None:
        self.assertTrue(is_motor_vehicle_excluded(FakeTags({'motorcar': 'no'})))
        self.assertTrue(is_motor_vehicle_excluded(FakeTags({'motor_vehicle': 'no'})))
        self.assertFalse(is_motor_vehicle_excluded(FakeTags({'amenity': 'charging_station'})))

    def test_brand_operator_network(self) -> None:
        fields = extract_station_fields(
            FakeTags(
                {
                    'amenity': 'charging_station',
                    'brand': 'IONITY',
                    'operator': 'IONITY GmbH',
                    'network': 'IONITY',
                    'addr:street': 'Autobahn',
                    'socket:future_socket': '2',
                }
            )
        )
        self.assertEqual(fields['brand'], 'IONITY')
        self.assertEqual(fields['operator'], 'IONITY GmbH')
        self.assertEqual(fields['network'], 'IONITY')
        self.assertIn('socket:future_socket', fields['tags'])


class ImporterIdentityTests(unittest.TestCase):
    def test_duplicate_identity_rejected_in_memory(self) -> None:
        if not HAS_OSMIUM:
            fake = types.SimpleNamespace()

            class SimpleHandler:
                def __init__(self) -> None:
                    pass

            fake.SimpleHandler = SimpleHandler
            fake.osm = types.SimpleNamespace(Node=object, Way=object, Relation=object, TagList=object)
            fake.geom = types.SimpleNamespace(WKTFactory=MagicMock)
            sys.modules['osmium'] = fake
        if 'psycopg2' not in sys.modules:
            psycopg2 = types.ModuleType('psycopg2')
            psycopg2.extras = types.SimpleNamespace(execute_batch=lambda *args, **kwargs: None)
            sys.modules['psycopg2'] = psycopg2
            sys.modules['psycopg2.extras'] = psycopg2.extras

        spec = importlib.util.spec_from_file_location(
            'charging_station_importer', LIB_DIR / 'charging_station_importer.py'
        )
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        collector = mod.ChargingStationCollector({}, MagicMock())
        tags = FakeTags({'amenity': 'charging_station'})
        collector._append('node', 42, tags, 'POINT(9 51)', None)
        collector._append('node', 42, tags, 'POINT(9 51)', None)
        self.assertEqual(len(collector.rows), 1)


class ImporterGeometryTypeTests(unittest.TestCase):
    def _ensure_importer_deps_stub(self) -> None:
        if not HAS_OSMIUM and 'osmium' not in sys.modules:
            fake = types.SimpleNamespace()

            class SimpleHandler:
                def __init__(self) -> None:
                    pass

            fake.SimpleHandler = SimpleHandler
            fake.osm = types.SimpleNamespace(Node=object, Way=object, Relation=object, TagList=object)
            fake.geom = types.SimpleNamespace(WKTFactory=MagicMock)
            sys.modules['osmium'] = fake

        if 'psycopg2' not in sys.modules:
            psycopg2 = types.ModuleType('psycopg2')
            psycopg2.extras = types.SimpleNamespace(execute_batch=lambda *args, **kwargs: None)
            sys.modules['psycopg2'] = psycopg2
            sys.modules['psycopg2.extras'] = psycopg2.extras

    def _load_importer(self):
        self._ensure_importer_deps_stub()
        spec = importlib.util.spec_from_file_location(
            'charging_station_importer', LIB_DIR / 'charging_station_importer.py'
        )
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_i1_node_import(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append('node', 1, FakeTags({'amenity': 'charging_station'}), 'POINT(8 50)', None)
        self.assertEqual(len(collector.rows), 1)
        self.assertEqual(collector.rows[0]['osm_type'], 'node')

    def test_i2_way_import(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append('way', 2, FakeTags({'amenity': 'charging_station'}), 'LINESTRING(8 50, 8.1 50.1)', None)
        self.assertEqual(collector.rows[0]['osm_type'], 'way')

    def test_i3_relation_import(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append(
            'relation',
            3,
            FakeTags({'amenity': 'charging_station'}),
            'POLYGON((8 50, 8.1 50, 8.1 50.1, 8 50.1, 8 50))',
            None,
        )
        self.assertEqual(collector.rows[0]['osm_type'], 'relation')

    def test_i4_fuel_ignored(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append('node', 4, FakeTags({'amenity': 'fuel'}), 'POINT(8 50)', None)
        self.assertEqual(len(collector.rows), 0)

    def test_i5_device_charger_ignored(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append(
            'node',
            5,
            FakeTags({'amenity': 'device_charging_station'}),
            'POINT(8 50)',
            None,
        )
        self.assertEqual(len(collector.rows), 0)

    def test_i6_motorcar_no_ignored(self) -> None:
        mod = self._load_importer()
        collector = mod.ChargingStationCollector({}, MagicMock())
        collector._append(
            'node',
            6,
            FakeTags({'amenity': 'charging_station', 'motorcar': 'no'}),
            'POINT(8 50)',
            None,
        )
        self.assertEqual(len(collector.rows), 0)


class PromotionSqlTests(unittest.TestCase):
    def test_promote_is_transactional(self) -> None:
        sql = (Path(__file__).resolve().parent.parent / 'promote.sql').read_text(encoding='utf-8')
        self.assertIn('BEGIN;', sql)
        self.assertIn('COMMIT;', sql)
        self.assertIn('charging_stations_staging', sql)
        self.assertIn('charging_stations_old', sql)

    def test_i13_single_current_metadata_on_promote(self) -> None:
        sql = (Path(__file__).resolve().parent.parent / 'promote.sql').read_text(encoding='utf-8')
        self.assertIn(
            'UPDATE osm.charging_station_dataset_metadata SET is_current = false WHERE is_current = true',
            sql,
        )
        self.assertIn('is_current', sql)


class GeometryTests(unittest.TestCase):
    def test_node_point(self) -> None:
        self.assertEqual(node_point_wkt(8.0, 50.0), 'POINT(8.0 50.0)')


if __name__ == '__main__':
    unittest.main(verbosity=2)
