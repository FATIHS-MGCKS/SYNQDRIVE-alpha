#!/usr/bin/env python3
"""Read-only production forensic extract for 2026-09-04 KS MX REFUEL incident.
Outputs JSON to stdout. Does not print secrets."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse
from typing import Any

VEHICLE_ID = "a60c0749-a7cd-494e-b5b9-dea3c6b97d63"
EVENT_IDS = (
    "3892fda9-fec6-4412-b735-918ccee75b38",
    "5e0d7e51-42d2-464d-897f-844854614579",
)
WINDOW_FROM_UTC = "2026-09-04 03:30:00"
WINDOW_TO_UTC = "2026-09-04 04:10:00"


def load_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")
    return env


def clean_db_url(url: str) -> str:
    u = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse((u.scheme, u.netloc, u.path, "", "", ""))


def psql_json(db_url: str, sql: str) -> list[dict[str, Any]]:
    proc = subprocess.run(
        ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return [{"error": proc.stderr.strip()}]
    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
    if not lines:
        return []
    headers = lines[0].split("\t")
    rows = []
    for ln in lines[1:]:
        vals = ln.split("\t")
        rows.append(dict(zip(headers, vals)))
    return rows


def psql_query(db_url: str, sql: str) -> str:
    proc = subprocess.run(
        ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return proc.stderr.strip()
    return proc.stdout.strip()


def query_clickhouse(ch_url: str) -> dict[str, Any]:
    try:
        from clickhouse_connect import get_client
    except ImportError:
        return {"available": False, "error": "clickhouse_connect not installed"}

    try:
        client = get_client(dsn=ch_url)
        q = f"""
        SELECT
          formatDateTime(ts, '%Y-%m-%d %H:%i:%S') AS ts_utc,
          signal_name,
          value_num,
          latitude,
          longitude,
          speed_kmh,
          source
        FROM telemetry_hf_points
        WHERE vehicle_id = '{VEHICLE_ID}'
          AND ts >= toDateTime64('{WINDOW_FROM_UTC}', 3, 'UTC')
          AND ts < toDateTime64('{WINDOW_TO_UTC}', 3, 'UTC')
          AND signal_name IN (
            'powertrainFuelSystemAbsoluteLevel',
            'powertrainFuelSystemRelativeLevel',
            'currentLocationLatitude',
            'currentLocationLongitude',
            'speed',
            'odometer'
          )
        ORDER BY ts
        LIMIT 5000
        """
        result = client.query(q)
        cols = result.column_names
        rows = [dict(zip(cols, row)) for row in result.result_rows]
        return {"available": True, "row_count": len(rows), "rows": rows}
    except Exception as e:  # noqa: BLE001
        return {"available": False, "error": str(e)}


def main() -> None:
    env_path = os.environ.get("BACKEND_ENV", "/opt/synqdrive/shared/backend.env")
    env = load_env(env_path)
    db_url = clean_db_url(env["DATABASE_URL"])

    out: dict[str, Any] = {
        "deploy_current": os.readlink("/opt/synqdrive/current")
        if os.path.islink("/opt/synqdrive/current")
        else None,
        "flags": {
            "FUEL_STATION_ENRICHMENT_ENABLED": env.get("FUEL_STATION_ENRICHMENT_ENABLED"),
            "FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED": env.get(
                "FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED"
            ),
            "SCHEDULER_LEADER_ELECTION_ENABLED": env.get("SCHEDULER_LEADER_ELECTION_ENABLED"),
            "FUEL_STATION_ENRICHMENT_CUTOVER_AT": (env.get("FUEL_STATION_ENRICHMENT_CUTOVER_AT") or "")[
                :24
            ],
        },
    }

    out["events"] = psql_json(
        db_url,
        """
        SELECT id, start_time, end_time, confidence, fuel_delta_liters, fuel_delta_percent,
               start_latitude, start_longitude, end_latitude, end_longitude,
               fuel_level_rise_start, fuel_level_rise_end, fuel_level_rise_duration_seconds,
               dimo_segment_id, created_at, updated_at, odometer_start_km, odometer_end_km
        FROM vehicle_energy_events
        WHERE id IN (
          '3892fda9-fec6-4412-b735-918ccee75b38',
          '5e0d7e51-42d2-464d-897f-844854614579'
        );
        """,
    )

    out["enrichments"] = psql_json(
        db_url,
        """
        SELECT energy_event_id, processing_status, resolution_status, input_latitude,
               input_longitude, resolver_version, osm_dataset_version, resolved_at
        FROM vehicle_energy_event_fuel_station_enrichments
        WHERE energy_event_id IN (
          '3892fda9-fec6-4412-b735-918ccee75b38',
          '5e0d7e51-42d2-464d-897f-844854614579'
        );
        """,
    )

    out["esso_station"] = psql_json(
        db_url,
        """
        SELECT osm_type, osm_id, name, brand, street, housenumber, postcode, city,
               ST_Y(ST_Centroid(geom::geometry)) AS lat,
               ST_X(ST_Centroid(geom::geometry)) AS lon
        FROM osm.fuel_stations
        WHERE osm_id = 260122108;
        """,
    )

    out["nearby_from_esso"] = psql_json(
        db_url,
        """
        SELECT osm_type, osm_id, name, brand,
               ROUND(ST_Distance(
                 centroid,
                 (SELECT centroid FROM osm.fuel_stations WHERE osm_id = 260122108 LIMIT 1)
               )::numeric, 1) AS dist_m
        FROM osm.fuel_stations
        WHERE ST_DWithin(
          centroid,
          (SELECT centroid FROM osm.fuel_stations WHERE osm_id = 260122108 LIMIT 1),
          500
        )
        ORDER BY dist_m
        LIMIT 20;
        """,
    )

    ch_url = env.get("CLICKHOUSE_URL")
    if ch_url:
        out["clickhouse_hf"] = query_clickhouse(ch_url)
    else:
        out["clickhouse_hf"] = {"available": False, "error": "CLICKHOUSE_URL unset"}

    # telemetry_snapshots in postgres if mirrored
    out["pg_snapshots_count"] = psql_query(
        db_url,
        f"""
        SELECT COUNT(*) FROM telemetry_snapshots
        WHERE vehicle_id = '{VEHICLE_ID}'
          AND captured_at >= '{WINDOW_FROM_UTC}'::timestamptz
          AND captured_at < '{WINDOW_TO_UTC}'::timestamptz;
        """,
    )

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
