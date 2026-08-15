#!/usr/bin/env python3
"""Targeted actual-file PostgreSQL proof for R3B1G tire status repair."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1d12_catalog_model import semantic_default_from_pg_expr
from ci_r3b1g_constants import DATA, MIG_ROOT, R3B1G_REPAIR_MIGRATION, SLOT13_REPAIR, TIRE_CONSUMER
from ci_r3b1g_replay_lib import column_exists, replay_until_exclusive
from replay_evidence_lib import enum_exists, enum_labels, psql, sha256_file, table_exists, PgConfig

OUT = DATA / "ci-r3b1g-targeted-tire-repair-proof-2026-08.json"
MIG_PATH = MIG_ROOT / R3B1G_REPAIR_MIGRATION / "migration.sql"
MIG157_PATH = MIG_ROOT / TIRE_CONSUMER / "migration.sql"


def inspect_partial_indexes(cfg: PgConfig, db: str) -> dict:
    proc = psql(
        cfg,
        db,
        """
        SELECT ic.relname, tc.relname, ix.indisunique, pg_get_expr(ix.indpred, ix.indrelid),
               ix.indisvalid, ix.indisready,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
                WHERE k.attnum > 0)
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class tc ON tc.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = tc.relnamespace
        WHERE n.nspname = 'public'
          AND ic.relname IN (
            'vehicle_tire_setups_one_active_setup_per_vehicle',
            'tires_one_active_tire_per_setup_position'
          );
        """,
        tuples_only=True,
    )
    indexes = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 7:
            continue
        indexes[parts[0]] = {
            "table": parts[1],
            "unique": parts[2] == "t",
            "predicate": parts[3],
            "valid": parts[4] == "t",
            "ready": parts[5] == "t",
            "columns": [c for c in parts[6].split(",") if c],
        }
    return indexes


def verify_status_catalog(catalog: dict) -> dict:
    col = catalog["columns"].get("vehicle_tire_setups", {}).get("status")
    if not col:
        return {"pass": False, "reason": "column_missing"}
    default_info = col.get("default") or {}
    if isinstance(default_info, str):
        default_info = semantic_default_from_pg_expr(default_info, col.get("type"))
    return {
        "pass": col["type"] == "TireSetupStatus" and not col["nullable"] and default_info.get("value") == "ACTIVE",
        "type": col["type"],
        "nullable": col["nullable"],
        "default": default_info,
    }


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1g_targeted"
    cfg = PgConfig()
    replay = replay_until_exclusive(cfg, db, R3B1G_REPAIR_MIGRATION)
    if replay.get("last_applied") != SLOT13_REPAIR:
        out = {"pass": False, "reason": "pre_repair_replay_failed", "replay": replay}
        OUT.write_text(json.dumps(out, indent=2) + "\n")
        print(json.dumps(out, indent=2))
        return 1

    pre_catalog = {
        "vehicle_tire_setups_exists": table_exists(cfg, db, "vehicle_tire_setups"),
        "vehicle_id_exists": column_exists(cfg, db, "vehicle_tire_setups", "vehicle_id"),
        "removed_at_exists": column_exists(cfg, db, "vehicle_tire_setups", "removed_at"),
        "status_exists": column_exists(cfg, db, "vehicle_tire_setups", "status"),
        "TireSetupStatus_exists": enum_exists(cfg, db, "TireSetupStatus"),
        "TireSetupStatus_labels": enum_labels(cfg, db, "TireSetupStatus"),
    }
    pre_assert = (
        pre_catalog["vehicle_tire_setups_exists"]
        and pre_catalog["vehicle_id_exists"]
        and pre_catalog["removed_at_exists"]
        and not pre_catalog["status_exists"]
        and pre_catalog["TireSetupStatus_exists"]
    )
    if not pre_assert:
        out = {"pass": False, "reason": "pre_repair_catalog_assertion_failed", "pre_catalog": pre_catalog}
        OUT.write_text(json.dumps(out, indent=2) + "\n")
        return 1

    repair_proc = psql(cfg, db, "", file=MIG_PATH)
    post_catalog = read_actual_catalog(cfg, db)
    catalog_check = verify_status_catalog(post_catalog)
    mig157_proc = psql(cfg, db, "", file=MIG157_PATH)
    indexes = inspect_partial_indexes(cfg, db) if mig157_proc.returncode == 0 else {}
    idx1 = indexes.get("vehicle_tire_setups_one_active_setup_per_vehicle", {})
    idx2 = indexes.get("tires_one_active_tire_per_setup_position", {})
    idx1_pass = bool(
        idx1.get("unique")
        and idx1.get("columns") == ["vehicle_id"]
        and idx1.get("predicate")
        and "status" in idx1.get("predicate", "")
        and "removed_at" in idx1.get("predicate", "")
        and idx1.get("valid")
        and idx1.get("ready")
    )
    idx2_pass = bool(
        idx2.get("unique")
        and idx2.get("columns") == ["tire_set_id", "current_position"]
        and idx2.get("predicate")
        and "active" in idx2.get("predicate", "")
        and idx2.get("valid")
        and idx2.get("ready")
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "database_identifier": db,
        "pre_repair_replay": replay,
        "pre_repair_catalog": pre_catalog,
        "actual_migration_file_sha256": sha256_file(MIG_PATH),
        "repair_execution": "PASS" if repair_proc.returncode == 0 else "FAIL",
        "repair_sqlstate": None,
        "post_repair_catalog_parity": catalog_check,
        "consumer_migration": TIRE_CONSUMER,
        "consumer_execution": "PASS" if mig157_proc.returncode == 0 else "FAIL",
        "partial_indexes": {
            "vehicle_tire_setups_one_active_setup_per_vehicle": "PASS" if idx1_pass else "FAIL",
            "tires_one_active_tire_per_setup_position": "PASS" if idx2_pass else "FAIL",
            "definitions": indexes,
        },
        "manual_interventions": 0,
        "pass": repair_proc.returncode == 0
        and catalog_check.get("pass")
        and mig157_proc.returncode == 0
        and idx1_pass
        and idx2_pass,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
