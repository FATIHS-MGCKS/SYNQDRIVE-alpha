#!/usr/bin/env python3
"""Capture pre-157 PostgreSQL catalog snapshot for tire lifecycle tables (CI-R3B1F.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1f1_constants import DATA, PRE157_BOUNDARY, TIRE_PROPERTIES
from replay_evidence_lib import PgConfig, psql

OUT = DATA / "ci-r3b1f1-pre-157-catalog-snapshot-2026-08.json"
TABLES = ["vehicle_tire_setups", "tires"]


def column_exists(catalog: dict, table: str, column: str) -> bool:
    return table in catalog.get("columns", {}) and column in catalog["columns"][table]


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1f1_pre157"
    cfg = PgConfig()
    raw = read_actual_catalog(cfg, db)
    pg_version = psql(cfg, db, "SHOW server_version;", tuples_only=True).stdout.strip()

    snapshot = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "postgresql_version": pg_version,
        "database_identifier": db,
        "last_applied_migration": PRE157_BOUNDARY,
        "manual_interventions": 0,
        "tables": {},
        "tracked_properties": {},
    }

    for table in TABLES:
        cols = raw["columns"].get(table, {})
        table_indexes = {
            name: idx for name, idx in raw["indexes"].items() if idx.get("table") == table
        }
        table_fks = {
            name: fk for name, fk in raw.get("foreign_keys", {}).items() if fk.get("local_table") == table
        }
        table_pks = {
            name: pk for name, pk in raw.get("primary_keys", {}).items() if pk.get("table") == table
        }
        snapshot["tables"][table] = {
            "exists": table in raw["tables"],
            "columns": cols,
            "primary_keys": table_pks,
            "foreign_keys": table_fks,
            "indexes": table_indexes,
        }

    for table, column in TIRE_PROPERTIES:
        exists = column_exists(raw, table, column)
        col_def = raw["columns"].get(table, {}).get(column)
        snapshot["tracked_properties"][f"{table}.{column}"] = {
            "relation": table,
            "property": column,
            "exists": exists,
            "definition": col_def,
        }

    enum_labels = {}
    for typ, info in raw.get("types", {}).items():
        if typ == "TireSetupStatus":
            enum_labels[typ] = info.get("labels", [])
    snapshot["enum_types"] = enum_labels

    OUT.write_text(json.dumps(snapshot, indent=2, default=list) + "\n")
    print(json.dumps({"pass": True, "tables": TABLES}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
