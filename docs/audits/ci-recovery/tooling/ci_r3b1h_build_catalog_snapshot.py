#!/usr/bin/env python3
"""Capture pre-249 PostgreSQL catalog snapshot for IAM relations (CI-R3B1H)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1h_constants import DATA, IAM_RELATIONS, MEMBERSHIP_MATRIX_FIELDS, ROLE_MATRIX_FIELDS
from replay_evidence_lib import PgConfig

OUT = DATA / "ci-r3b1h-pre-249-catalog-snapshot-2026-08.json"


def relation_snapshot(catalog: dict, table: str) -> dict:
    exists = table in catalog["tables"]
    cols = catalog["columns"].get(table, {})
    pks = [v for v in catalog["primary_keys"].values() if v["table"] == table]
    uniques = [v for v in catalog["unique_constraints"].values() if v["table"] == table]
    fks = [v for v in catalog["foreign_keys"].values() if v["local_table"] == table]
    indexes = [v for v in catalog["indexes"].values() if v["table"] == table]
    return {
        "table_exists": exists,
        "columns": {name: cols.get(name) for name in sorted(cols) if name in cols},
        "all_column_names": sorted(cols.keys()),
        "primary_keys": pks,
        "unique_constraints": uniques,
        "foreign_keys": fks,
        "indexes": indexes,
    }


def membership_matrix(catalog: dict) -> list[dict]:
    cols = catalog["columns"].get("organization_memberships", {})
    rows = []
    for field in MEMBERSHIP_MATRIX_FIELDS:
        col = cols.get(field)
        rows.append(
            {
                "logical_field": field,
                "physical_column": field,
                "exists": col is not None,
                "type": col["type"] if col else None,
                "nullable": col["nullable"] if col else None,
                "default": col["default"] if col else None,
            }
        )
    return rows


def role_matrix(catalog: dict) -> list[dict]:
    cols = catalog["columns"].get("organization_roles", {})
    rows = []
    for field in ROLE_MATRIX_FIELDS:
        col = cols.get(field)
        rows.append(
            {
                "logical_field": field,
                "physical_column": field,
                "exists": col is not None,
                "type": col["type"] if col else None,
                "nullable": col["nullable"] if col else None,
                "default": col["default"] if col else None,
            }
        )
    return rows


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1h_pre249"
    cfg = PgConfig()
    catalog = read_actual_catalog(cfg, db)
    snapshot = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "database_identifier": db,
        "boundary": "before_20260721250000_iam_versioned_role_assignments",
        "relations": {rel: relation_snapshot(catalog, rel) for rel in IAM_RELATIONS},
        "organization_memberships_matrix": membership_matrix(catalog),
        "organization_roles_matrix": role_matrix(catalog),
    }
    OUT.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(json.dumps({"tables": len(snapshot["relations"]), "membership_columns": len(catalog["columns"].get("organization_memberships", {}))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
