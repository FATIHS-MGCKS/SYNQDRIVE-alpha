#!/usr/bin/env python3
"""Validation gates for osm.charging_stations_staging before atomic promotion."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import psycopg2

MIN_LON = -180.0
MAX_LON = 180.0
MIN_LAT = -90.0
MAX_LAT = 90.0


@dataclass
class ValidationResult:
    ok: bool
    checks: list[dict[str, object]]


def run_validation(conn: 'psycopg2.extensions.connection', dataset_version: str) -> ValidationResult:
    checks: list[dict[str, object]] = []

    def record(name: str, passed: bool, detail: object) -> None:
        checks.append({'name': name, 'passed': passed, 'detail': detail})

    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM osm.charging_stations_staging')
        total = int(cur.fetchone()[0])
        record('A_non_empty', total > 0, {'count': total})

        cur.execute(
            """
            SELECT osm_type, osm_id, COUNT(*) AS c
            FROM osm.charging_stations_staging
            GROUP BY 1, 2
            HAVING COUNT(*) > 1
            LIMIT 5
            """
        )
        dupes = cur.fetchall()
        record('B_no_duplicates', len(dupes) == 0, {'sample': dupes})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE geom IS NULL OR centroid IS NULL
            """
        )
        null_geom = int(cur.fetchone()[0])
        record('C_geometry_present', null_geom == 0, {'null_count': null_geom})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE ST_SRID(geom) <> 4326
            """
        )
        bad_srid = int(cur.fetchone()[0])
        record('D_srid_4326', bad_srid == 0, {'bad_srid_count': bad_srid})

        cur.execute(
            f"""
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE ST_X(centroid::geometry) BETWEEN {MIN_LON} AND {MAX_LON}
              AND ST_Y(centroid::geometry) BETWEEN {MIN_LAT} AND {MAX_LAT}
            """
        )
        in_bounds = int(cur.fetchone()[0])
        record('E_lat_lon_bounds', in_bounds == total, {'in_bounds': in_bounds, 'total': total})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE dataset_version IS NULL OR btrim(dataset_version) = ''
            """
        )
        missing_version = int(cur.fetchone()[0])
        record('F_dataset_version_populated', missing_version == 0, {'missing': missing_version})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE country_code IS NOT NULL AND length(country_code) <> 2
            """
        )
        bad_country = int(cur.fetchone()[0])
        record('G_country_code_valid', bad_country == 0, {'bad_country_count': bad_country})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE tags->>'amenity' = 'fuel'
            """
        )
        fuel_contam = int(cur.fetchone()[0])
        record('H_no_fuel_contamination', fuel_contam == 0, {'fuel_count': fuel_contam})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE tags->>'amenity' = 'device_charging_station'
            """
        )
        device_contam = int(cur.fetchone()[0])
        record('I_no_device_charging_station', device_contam == 0, {'device_count': device_contam})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.charging_stations_staging
            WHERE lower(coalesce(tags->>'motorcar', '')) IN ('no', 'private')
               OR lower(coalesce(tags->>'motor_vehicle', '')) = 'no'
            """
        )
        motor_excluded = int(cur.fetchone()[0])
        record('J_no_motorcar_no', motor_excluded == 0, {'excluded_count': motor_excluded})

        cur.execute(
            """
            SELECT COUNT(*) FROM pg_indexes
            WHERE schemaname = 'osm' AND tablename = 'charging_stations_staging'
              AND indexdef ILIKE '%USING gist%'
            """
        )
        gist_count = int(cur.fetchone()[0])
        record('K_spatial_indexes', gist_count >= 2, {'gist_index_count': gist_count})

        cur.execute(
            """
            SELECT station_count FROM osm.charging_station_dataset_metadata_staging
            WHERE dataset_version = %s
            LIMIT 1
            """,
            (dataset_version,),
        )
        meta_row = cur.fetchone()
        meta_count = int(meta_row[0]) if meta_row else None
        record(
            'L_metadata_count_matches',
            meta_count is not None and meta_count == total,
            {'metadata_count': meta_count, 'staging_count': total},
        )

    ok = all(check['passed'] for check in checks)
    return ValidationResult(ok=ok, checks=checks)


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate osm.charging_stations_staging')
    parser.add_argument('--dataset-version', required=True)
    parser.add_argument('--database-url', default=None)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()

    import os

    database_url = args.database_url or os.environ.get('OSM_CHARGING_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not database_url:
        print('ERROR: database URL required', file=sys.stderr)
        return 2

    import psycopg2

    conn = psycopg2.connect(database_url.split('?', 1)[0])
    try:
        result = run_validation(conn, args.dataset_version)
    finally:
        conn.close()

    if args.json:
        print(json.dumps({'ok': result.ok, 'checks': result.checks}, indent=2))
    else:
        for check in result.checks:
            status = 'PASS' if check['passed'] else 'FAIL'
            print(f"{status} {check['name']}: {check['detail']}")

    return 0 if result.ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
