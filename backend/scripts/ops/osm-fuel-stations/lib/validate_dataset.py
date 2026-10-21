#!/usr/bin/env python3
"""Validation gates for osm.fuel_stations_staging before atomic promotion."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import psycopg2

# Germany envelope with small margin (WGS84).
DE_MIN_LON = 5.5
DE_MAX_LON = 15.5
DE_MIN_LAT = 47.0
DE_MAX_LAT = 55.5

MIN_STATION_COUNT = 12_000
MAX_STATION_COUNT = 25_000
MIN_IN_DE_RATIO = 0.99


@dataclass
class ValidationResult:
    ok: bool
    checks: list[dict[str, object]]


def run_validation(conn: 'psycopg2.extensions.connection', dataset_version: str) -> ValidationResult:
    checks: list[dict[str, object]] = []

    def record(name: str, passed: bool, detail: object) -> None:
        checks.append({'name': name, 'passed': passed, 'detail': detail})

    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM osm.fuel_stations_staging')
        total = int(cur.fetchone()[0])
        record(
            'A_non_empty',
            total > 0,
            {'count': total, 'min': MIN_STATION_COUNT, 'max': MAX_STATION_COUNT},
        )
        record(
            'B_plausible_count',
            MIN_STATION_COUNT <= total <= MAX_STATION_COUNT,
            {'count': total},
        )

        cur.execute(
            """
            SELECT osm_type, osm_id, COUNT(*) AS c
            FROM osm.fuel_stations_staging
            GROUP BY 1, 2
            HAVING COUNT(*) > 1
            LIMIT 5
            """
        )
        dupes = cur.fetchall()
        record('C_no_duplicates', len(dupes) == 0, {'sample': dupes})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.fuel_stations_staging
            WHERE geom IS NULL OR centroid IS NULL
            """
        )
        null_geom = int(cur.fetchone()[0])
        record('D_geometry_present', null_geom == 0, {'null_count': null_geom})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.fuel_stations_staging
            WHERE ST_SRID(geom) <> 4326
            """
        )
        bad_srid = int(cur.fetchone()[0])
        record('E_srid_4326', bad_srid == 0, {'bad_srid_count': bad_srid})

        cur.execute(
            f"""
            SELECT COUNT(*) FROM osm.fuel_stations_staging
            WHERE ST_X(centroid::geometry) BETWEEN {DE_MIN_LON} AND {DE_MAX_LON}
              AND ST_Y(centroid::geometry) BETWEEN {DE_MIN_LAT} AND {DE_MAX_LAT}
            """
        )
        in_de = int(cur.fetchone()[0])
        ratio = (in_de / total) if total else 0.0
        record(
            'F_germany_envelope',
            ratio >= MIN_IN_DE_RATIO,
            {'in_de': in_de, 'total': total, 'ratio': round(ratio, 4)},
        )

        cur.execute(
            """
            SELECT COUNT(*) FROM pg_indexes
            WHERE schemaname = 'osm' AND tablename = 'fuel_stations_staging'
              AND indexdef ILIKE '%USING gist%'
            """
        )
        gist_count = int(cur.fetchone()[0])
        record('G_spatial_indexes', gist_count >= 2, {'gist_index_count': gist_count})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.fuel_stations_staging fs
            WHERE ST_DWithin(
              fs.centroid,
              ST_SetSRID(ST_MakePoint(9.5, 51.3), 4326)::geography,
              50000
            )
            """
        )
        dwithin_ok = int(cur.fetchone()[0]) > 0
        record('H_st_dwithin_smoke', dwithin_ok, {'matches_near_kassel_region': dwithin_ok})

        cur.execute(
            """
            SELECT COUNT(*) FROM osm.fuel_stations_staging
            WHERE dataset_version = %s
            """,
            (dataset_version,),
        )
        version_ok = int(cur.fetchone()[0]) == total
        record('I_dataset_version', version_ok, {'dataset_version': dataset_version})

        cur.execute(
            """
            SELECT dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
                   station_count, downloaded_at
            FROM osm.dataset_metadata_staging
            WHERE dataset_version = %s
            """,
            (dataset_version,),
        )
        meta_row = cur.fetchone()
        provenance_ok = (
            meta_row is not None
            and meta_row[0] == dataset_version
            and bool(meta_row[1])
            and bool(meta_row[4])
            and int(meta_row[4]) == total
        )
        record(
            'J_source_provenance',
            provenance_ok,
            {
                'dataset_version': meta_row[0] if meta_row else None,
                'source_url': meta_row[1] if meta_row else None,
                'station_count': meta_row[4] if meta_row else None,
            },
        )

        cur.execute(
            """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema NOT IN ('osm', 'pg_catalog', 'information_schema')
              AND table_name LIKE 'planet_osm%'
            """
        )
        planet = int(cur.fetchone()[0])
        record('L_no_planet_osm_tables', planet == 0, {'planet_osm_tables': planet})

        # K. sample stations near Kassel
        cur.execute(
            """
            SELECT name, brand, operator,
                   ROUND(ST_Distance(centroid, ST_SetSRID(ST_MakePoint(9.4797, 51.3127), 4326)::geography)::numeric, 1) AS dist_m
            FROM osm.fuel_stations_staging
            ORDER BY centroid <-> ST_SetSRID(ST_MakePoint(9.4797, 51.3127), 4326)::geography
            LIMIT 3
            """
        )
        kassel_samples = [
            {'name': r[0], 'brand': r[1], 'operator': r[2], 'distance_m': float(r[3]) if r[3] is not None else None}
            for r in cur.fetchall()
        ]
        record('K_kassel_samples', len(kassel_samples) > 0, {'samples': kassel_samples})

    critical = [
        c for c in checks if c['name'] in {
            'A_non_empty',
            'B_plausible_count',
            'C_no_duplicates',
            'D_geometry_present',
            'E_srid_4326',
            'F_germany_envelope',
            'G_spatial_indexes',
            'H_st_dwithin_smoke',
            'I_dataset_version',
            'J_source_provenance',
            'L_no_planet_osm_tables',
        }
    ]
    ok = all(bool(c['passed']) for c in critical)
    return ValidationResult(ok=ok, checks=checks)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset-version', required=True)
    parser.add_argument('--database-url', default=None)
    parser.add_argument('--json-out', default=None, help='Write validation report JSON')
    args = parser.parse_args()

    database_url = args.database_url
    if not database_url:
        import os

        database_url = os.environ.get('OSM_FUEL_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not database_url:
        print('ERROR: database URL required', file=sys.stderr)
        return 2

    import psycopg2

    conn = psycopg2.connect(database_url.split('?', 1)[0])
    try:
        result = run_validation(conn, args.dataset_version)
    finally:
        conn.close()

    payload = {'ok': result.ok, 'checks': result.checks}
    text = json.dumps(payload, indent=2)
    if args.json_out:
        with open(args.json_out, 'w', encoding='utf-8') as fh:
            fh.write(text)
    print(text)
    return 0 if result.ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
