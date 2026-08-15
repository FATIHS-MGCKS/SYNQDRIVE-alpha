#!/usr/bin/env python3
"""Targeted simulation: pre-157 state + temporary status repair + unchanged migration 157."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f_constants import DATA, REPO, TEMP_STATUS_REPAIR_SQL, TIRE_CONSUMER
from replay_evidence_lib import PgConfig, psql

OUT = DATA / "ci-r3b1f-tire-targeted-simulation-2026-08.json"
MIG_SQL = REPO / "backend/prisma/migrations" / TIRE_CONSUMER / "migration.sql"


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
        name, table, unique, predicate, valid, ready, cols = parts[:7]
        indexes[name] = {
            "table": table,
            "unique": unique == "t",
            "columns": cols.split(",") if cols else [],
            "predicate": predicate,
            "valid": valid == "t",
            "ready": ready == "t",
        }
    return indexes


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1f_pre157"
    cfg = PgConfig()

    repair_proc = psql(cfg, db, TEMP_STATUS_REPAIR_SQL)
    mig_proc = psql(cfg, db, MIG_SQL.read_text())

    indexes = inspect_partial_indexes(cfg, db) if mig_proc.returncode == 0 else {}

    idx1 = indexes.get("vehicle_tire_setups_one_active_setup_per_vehicle", {})
    idx2 = indexes.get("tires_one_active_tire_per_setup_position", {})

    idx1_pass = (
        idx1.get("unique")
        and idx1.get("columns") == ["vehicle_id"]
        and idx1.get("predicate")
        and "status" in idx1.get("predicate", "")
        and "removed_at" in idx1.get("predicate", "")
        and idx1.get("valid")
        and idx1.get("ready")
    )
    idx2_pass = (
        idx2.get("unique")
        and idx2.get("columns") == ["tire_set_id", "current_position"]
        and idx2.get("predicate")
        and "active" in idx2.get("predicate", "")
        and idx2.get("valid")
        and idx2.get("ready")
    )

    result = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "database_identifier": db,
        "temporary_predecessor_repair_sql": TEMP_STATUS_REPAIR_SQL.strip(),
        "temporary_repair_executed": repair_proc.returncode == 0,
        "unchanged_consumer_migration": TIRE_CONSUMER,
        "unchanged_consumer_executed": mig_proc.returncode == 0,
        "migration_157_pass": mig_proc.returncode == 0,
        "partial_index_vehicle_tire_setups_pass": idx1_pass,
        "partial_index_tires_pass": idx2_pass,
        "partial_indexes": indexes,
        "migration_error": (mig_proc.stderr or mig_proc.stdout) if mig_proc.returncode != 0 else None,
        "pass": repair_proc.returncode == 0 and mig_proc.returncode == 0 and idx1_pass and idx2_pass,
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"pass": result["pass"], "migration_157": result["migration_157_pass"]}, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
