#!/usr/bin/env python3
"""Lean OSM fuel-station importer: filtered PBF → osm.fuel_stations_staging."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import osmium
import psycopg2
from psycopg2.extras import execute_batch

from fuel_station_tags import extract_station_fields
from geometry import build_way_geometry, node_point_wkt

# Representative geography point (centroid column):
# - POINT: same as geom
# - POLYGON/MULTIPOLYGON: ST_PointOnSurface(geom) — guaranteed inside polygon
# - LINESTRING: ST_LineInterpolatePoint(geom, 0.5) — midpoint along line
REPRESENTATIVE_POINT_SQL = """
CASE GeometryType(g.geom)
  WHEN 'POINT' THEN g.geom::geography
  WHEN 'LINESTRING' THEN ST_LineInterpolatePoint(g.geom, 0.5)::geography
  ELSE ST_PointOnSurface(g.geom)::geography
END
"""

INSERT_SQL = f"""
INSERT INTO osm.fuel_stations_staging (
  osm_type, osm_id, name, brand, operator, ref,
  street, housenumber, postcode, city, country_code, opening_hours,
  geom, centroid, source_timestamp, dataset_version, tags
)
SELECT
  %(osm_type)s, %(osm_id)s, %(name)s, %(brand)s, %(operator)s, %(ref)s,
  %(street)s, %(housenumber)s, %(postcode)s, %(city)s, %(country_code)s, %(opening_hours)s,
  ST_SetSRID(ST_GeomFromText(%(geom_wkt)s), 4326),
  ({REPRESENTATIVE_POINT_SQL.replace('g.geom', 'ST_SetSRID(ST_GeomFromText(%(geom_wkt)s), 4326)')}),
  %(source_timestamp)s, %(dataset_version)s, %(tags)s::jsonb
FROM (SELECT 1) AS _dummy
"""


class NodeIndexHandler(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.locations: dict[int, tuple[float, float]] = {}

    def node(self, n: osmium.osm.Node) -> None:
        self.locations[n.id] = (n.location.lon, n.location.lat)


class FuelStationCollector(osmium.SimpleHandler):
    def __init__(self, node_locations: dict[int, tuple[float, float]], wkt_factory: osmium.geom.WKTFactory) -> None:
        super().__init__()
        self.node_locations = node_locations
        self.wkt_factory = wkt_factory
        self.rows: list[dict[str, Any]] = []
        self.seen: set[tuple[str, int]] = set()

    def _append(self, osm_type: str, osm_id: int, tags: osmium.osm.TagList, geom_wkt: str, timestamp: int | None) -> None:
        key = (osm_type, osm_id)
        if key in self.seen:
            return
        self.seen.add(key)
        fields = extract_station_fields(tags)
        source_ts = None
        if timestamp:
            if isinstance(timestamp, datetime):
                source_ts = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
            else:
                source_ts = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        self.rows.append(
            {
                'osm_type': osm_type,
                'osm_id': osm_id,
                'geom_wkt': geom_wkt,
                'source_timestamp': source_ts,
                'dataset_version': None,  # filled by caller
                'tags': json.dumps(fields.pop('tags')),
                **fields,
            }
        )

    def node(self, n: osmium.osm.Node) -> None:
        if n.tags.get('amenity') != 'fuel':
            return
        self._append('node', n.id, n.tags, node_point_wkt(n.location.lon, n.location.lat), n.timestamp)

    def way(self, w: osmium.osm.Way) -> None:
        if w.tags.get('amenity') != 'fuel':
            return
        node_refs = [node.ref for node in w.nodes]
        built = build_way_geometry(node_refs, self.node_locations)
        if built is None:
            try:
                geom_wkt = self.wkt_factory.create_linestring(w)
            except Exception:
                return
        else:
            geom_wkt, _ = built
        self._append('way', w.id, w.tags, geom_wkt, w.timestamp)

    def relation(self, r: osmium.osm.Relation) -> None:
        if r.tags.get('amenity') != 'fuel':
            return
        try:
            geom_wkt = self.wkt_factory.create_multipolygon(r)
        except Exception:
            try:
                geom_wkt = self.wkt_factory.create_polygon(r)
            except Exception:
                return
        self._append('relation', r.id, r.tags, geom_wkt, r.timestamp)


def import_pbf(pbf_path: Path, dataset_version: str) -> list[dict[str, Any]]:
    index = NodeIndexHandler()
    index.apply_file(str(pbf_path), locations=True)

    wkt_factory = osmium.geom.WKTFactory()
    collector = FuelStationCollector(index.locations, wkt_factory)
    collector.apply_file(str(pbf_path), locations=True)

    for row in collector.rows:
        row['dataset_version'] = dataset_version
    return collector.rows


def _normalize_database_url(url: str) -> str:
    return url.split('?', 1)[0]


def load_to_staging(conn: psycopg2.extensions.connection, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
    with conn.cursor() as cur:
        cur.execute('TRUNCATE osm.fuel_stations_staging')
        execute_batch(cur, INSERT_SQL, rows, page_size=batch_size)
    conn.commit()
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description='Import filtered OSM fuel PBF into osm.fuel_stations_staging')
    parser.add_argument('--pbf', required=True, help='Filtered fuel-only .osm.pbf path')
    parser.add_argument('--dataset-version', required=True, help='e.g. geofabrik-germany-20260830')
    parser.add_argument('--database-url', default=None, help='PostgreSQL URL (or OSM_FUEL_DATABASE_URL)')
    args = parser.parse_args()

    database_url = args.database_url
    if not database_url:
        import os

        database_url = os.environ.get('OSM_FUEL_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not database_url:
        print('ERROR: --database-url or DATABASE_URL required', file=sys.stderr)
        return 2

    pbf_path = Path(args.pbf)
    if not pbf_path.is_file() or pbf_path.stat().st_size == 0:
        print(f'ERROR: invalid PBF: {pbf_path}', file=sys.stderr)
        return 2

    rows = import_pbf(pbf_path, args.dataset_version)
    print(f'Collected {len(rows)} fuel station objects from PBF')

    conn = psycopg2.connect(_normalize_database_url(database_url))
    try:
        count = load_to_staging(conn, rows)
        print(f'Loaded {count} rows into osm.fuel_stations_staging')
    finally:
        conn.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
