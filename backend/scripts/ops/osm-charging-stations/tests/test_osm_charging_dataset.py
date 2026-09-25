#!/usr/bin/env python3
"""Unit tests for OSM charging-station dataset tooling (no database required)."""
from __future__ import annotations

import importlib.util
import sys
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
    @unittest.skipUnless(HAS_OSMIUM, 'pyosmium not installed')
    def test_duplicate_identity_rejected_in_memory(self) -> None:
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


class PromotionSqlTests(unittest.TestCase):
    def test_promote_is_transactional(self) -> None:
        sql = (Path(__file__).resolve().parent.parent / 'promote.sql').read_text(encoding='utf-8')
        self.assertIn('BEGIN;', sql)
        self.assertIn('COMMIT;', sql)
        self.assertIn('charging_stations_staging', sql)
        self.assertIn('charging_stations_old', sql)


class GeometryTests(unittest.TestCase):
    def test_node_point(self) -> None:
        self.assertEqual(node_point_wkt(8.0, 50.0), 'POINT(8.0 50.0)')


if __name__ == '__main__':
    unittest.main(verbosity=2)
