#!/usr/bin/env python3
"""Replay migrations through Slot 13 and stop before migration 157 (CI-R3B1F.1)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor
from ci_r3b1f1_constants import DATA, PRE157_BOUNDARY, TIRE_CONSUMER
from replay_evidence_lib import (
    SPECIAL_MIGRATION,
    migration_dirs,
    migration_ordinal,
    parse_deploy_output,
    psql,
    recreate_db,
    PgConfig,
)

BACKEND = Path(__file__).resolve().parents[4] / "backend"
OUT = DATA / "ci-r3b1f1-pre157-replay-state-2026-08.json"


def prisma_deploy(cfg: PgConfig, db: str) -> tuple[int, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = cfg.url(db)
    proc = subprocess.run(
        ["npx", "prisma", "migrate", "deploy"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def migration_history(cfg: PgConfig, db: str) -> list[str]:
    proc = psql(
        cfg,
        db,
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at;",
        tuples_only=True,
    )
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def run_pre157_replay(db_name: str = "synqdrive_r3b1f1_pre157") -> dict:
    cfg = PgConfig()
    recreate_db(cfg, db_name)
    special_steps = []
    reconciliations = []

    while True:
        code, output = prisma_deploy(cfg, db_name)
        if code == 0:
            break
        parsed = parse_deploy_output(output)
        failed = parsed.get("first_failed_migration")
        if failed == SPECIAL_MIGRATION:
            result = SpecialCompositeIndexExecutor(cfg).run(db_name, reconcile=True)
            special_steps.append(result)
            reconciliations.append(result["migration_state_reconciliation"])
            continue
        hist = migration_history(cfg, db_name)
        last_applied = hist[-1] if hist else parsed.get("last_applied_migration")
        pg_version = psql(cfg, db_name, "SHOW server_version;", tuples_only=True).stdout.strip()
        return {
            "postgresql_version": pg_version,
            "database_identifier": db_name,
            "production_connection": False,
            "manual_interventions": 0,
            "special_composite_replay_steps": special_steps,
            "migration_state_reconciliations": reconciliations,
            "migrations_applied": len(hist),
            "last_applied": last_applied,
            "stop_boundary": PRE157_BOUNDARY,
            "first_failed_migration": failed,
            "failure_ordinal": migration_ordinal(failed or ""),
            "sqlstate": parsed.get("sqlstate"),
            "error_message": parsed.get("error_message"),
            "reached_stop_boundary": last_applied == PRE157_BOUNDARY,
            "consumer_not_executed": TIRE_CONSUMER,
            "pass": last_applied == PRE157_BOUNDARY and failed == TIRE_CONSUMER,
        }

    hist = migration_history(cfg, db_name)
    pg_version = psql(cfg, db_name, "SHOW server_version;", tuples_only=True).stdout.strip()
    return {
        "postgresql_version": pg_version,
        "database_identifier": db_name,
        "production_connection": False,
        "manual_interventions": 0,
        "special_composite_replay_steps": special_steps,
        "migration_state_reconciliations": reconciliations,
        "migrations_applied": len(hist),
        "last_applied": hist[-1] if hist else None,
        "stop_boundary": PRE157_BOUNDARY,
        "reached_stop_boundary": (hist[-1] if hist else None) == PRE157_BOUNDARY,
        "consumer_not_executed": TIRE_CONSUMER,
        "pass": False,
        "notes": "Unexpected full deploy success before tire consumer failure boundary",
    }


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else "synqdrive_r3b1f1_pre157"
    result = run_pre157_replay(db)
    result["migration_directories"] = len(migration_dirs())
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"pass": result.get("pass"), "last_applied": result.get("last_applied")}, indent=2))
    return 0 if result.get("pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
