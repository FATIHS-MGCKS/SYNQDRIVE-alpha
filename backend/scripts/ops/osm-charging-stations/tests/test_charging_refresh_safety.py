#!/usr/bin/env python3
"""Integration tests for charging dataset refresh safety (I11/I12/I14)."""
from __future__ import annotations

import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB_DIR = ROOT / 'lib'
sys.path.insert(0, str(LIB_DIR))

LIVE_VERSION = 'charging-live-l1-test'
BAD_VERSION = 'charging-staging-l2-bad-test'


def _require_integration() -> None:
    if os.environ.get('CHARGING_REFRESH_SAFETY_INTEGRATION') != '1':
        raise unittest.SkipTest('CHARGING_REFRESH_SAFETY_INTEGRATION not enabled')
    if not os.environ.get('DATABASE_URL'):
        raise unittest.SkipTest('DATABASE_URL not set')


def _connect():
    import psycopg2

    url = os.environ['DATABASE_URL'].split('?', 1)[0]
    return psycopg2.connect(url)


def _apply_schema(conn) -> None:
    schema_sql = (ROOT / 'schema.sql').read_text(encoding='utf-8')
    statements = [
        s.strip()
        for s in schema_sql.split(';')
        if s.strip() and not s.strip().startswith('--')
    ]
    with conn.cursor() as cur:
        for statement in statements:
            cur.execute(f'{statement};')
    conn.commit()


class RefreshSafetyIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _require_integration()
        cls.conn = _connect()
        _apply_schema(cls.conn)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()

    def _seed_live_l1(self) -> None:
        with self.conn.cursor() as cur:
            cur.execute('TRUNCATE osm.charging_stations CASCADE')
            cur.execute('TRUNCATE osm.charging_station_dataset_metadata CASCADE')
            cur.execute('TRUNCATE osm.charging_stations_staging')
            cur.execute('TRUNCATE osm.charging_station_dataset_metadata_staging')
            cur.execute(
                """
                INSERT INTO osm.charging_stations (
                  osm_type, osm_id, name, geom, centroid, dataset_version, tags
                ) VALUES (
                  'node', 9001, 'Live L1',
                  ST_SetSRID(ST_MakePoint(8.1, 50.1), 4326),
                  ST_SetSRID(ST_MakePoint(8.1, 50.1), 4326)::geography,
                  %s,
                  '{"amenity":"charging_station"}'::jsonb
                )
                """,
                (LIVE_VERSION,),
            )
            cur.execute(
                """
                INSERT INTO osm.charging_station_dataset_metadata (
                  dataset_version, station_count, imported_at, promoted_at, is_current
                ) VALUES (%s, 1, now(), now(), true)
                """,
                (LIVE_VERSION,),
            )
        self.conn.commit()

    def test_i11_invalid_geometry_fails_validation_and_preserves_live(self) -> None:
        from validate_dataset import run_validation

        self._seed_live_l1()
        with self.conn.cursor() as cur:
            cur.execute('TRUNCATE osm.charging_stations_staging')
            cur.execute(
                """
                INSERT INTO osm.charging_stations_staging (
                  osm_type, osm_id, name, geom, centroid, dataset_version, tags
                ) VALUES (
                  'way', 9101, 'Invalid',
                  ST_SetSRID(ST_GeomFromText(
                    'POLYGON((0 0, 1 1, 1 0, 0 1, 0 0))'
                  ), 4326),
                  ST_SetSRID(ST_PointOnSurface(ST_GeomFromText(
                    'POLYGON((0 0, 1 1, 1 0, 0 1, 0 0))'
                  )), 4326)::geography,
                  %s,
                  '{"amenity":"charging_station"}'::jsonb
                )
                """,
                (BAD_VERSION,),
            )
            cur.execute(
                """
                INSERT INTO osm.charging_station_dataset_metadata_staging (
                  dataset_version, station_count, imported_at, is_current
                ) VALUES (%s, 1, now(), false)
                """,
                (BAD_VERSION,),
            )
        self.conn.commit()

        result = run_validation(self.conn, BAD_VERSION)
        self.assertFalse(result.ok)
        self.assertTrue(any(c['name'] == 'M_valid_geometries' and not c['passed'] for c in result.checks))

        with self.conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM osm.charging_stations')
            live_count = int(cur.fetchone()[0])
            cur.execute(
                'SELECT dataset_version FROM osm.charging_station_dataset_metadata WHERE is_current = true'
            )
            current = cur.fetchone()[0]
        self.assertEqual(live_count, 1)
        self.assertEqual(current, LIVE_VERSION)

    def test_i12_failed_validation_blocks_promotion_and_preserves_l1(self) -> None:
        from validate_dataset import run_validation

        self._seed_live_l1()
        with self.conn.cursor() as cur:
            cur.execute('TRUNCATE osm.charging_stations_staging')
            cur.execute(
                """
                INSERT INTO osm.charging_stations_staging (
                  osm_type, osm_id, name, geom, centroid, dataset_version, tags
                ) VALUES (
                  'node', 9201, 'Staging Good',
                  ST_SetSRID(ST_MakePoint(8.2, 50.2), 4326),
                  ST_SetSRID(ST_MakePoint(8.2, 50.2), 4326)::geography,
                  %s,
                  '{"amenity":"charging_station","motorcar":"no"}'::jsonb
                )
                """,
                (BAD_VERSION,),
            )
            cur.execute(
                """
                INSERT INTO osm.charging_station_dataset_metadata_staging (
                  dataset_version, station_count, imported_at, is_current
                ) VALUES (%s, 1, now(), false)
                """,
                (BAD_VERSION,),
            )
        self.conn.commit()

        result = run_validation(self.conn, BAD_VERSION)
        self.assertFalse(result.ok)
        self.assertTrue(any(c['name'] == 'J_no_motorcar_no' and not c['passed'] for c in result.checks))

        proc = subprocess.run(
            [
                sys.executable,
                str(LIB_DIR / 'validate_dataset.py'),
                '--dataset-version',
                BAD_VERSION,
            ],
            env={**os.environ},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(proc.returncode, 0)

        with self.conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM osm.charging_stations WHERE dataset_version = %s', (LIVE_VERSION,))
            l1_count = int(cur.fetchone()[0])
            cur.execute(
                'SELECT dataset_version FROM osm.charging_station_dataset_metadata WHERE is_current = true'
            )
            current = cur.fetchone()[0]
        self.assertEqual(l1_count, 1)
        self.assertEqual(current, LIVE_VERSION)


if __name__ == '__main__':
    unittest.main(verbosity=2)
