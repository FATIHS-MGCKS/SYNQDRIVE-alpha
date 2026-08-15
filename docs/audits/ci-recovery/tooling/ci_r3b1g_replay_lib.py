"""Replay helpers for CI-R3B1G targeted pre-repair and boundary proofs."""
from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor
from replay_evidence_lib import MIG_ROOT, SPECIAL_MIGRATION, migration_dirs, psql, recreate_db, sha256_file, PgConfig

BACKEND = Path(__file__).resolve().parents[4] / "backend"

PRISMA_MIGRATIONS_DDL = """
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
"""


def bootstrap_prisma_migrations(cfg: PgConfig, db: str) -> None:
    proc = psql(cfg, db, PRISMA_MIGRATIONS_DDL)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


def record_migration_applied(cfg: PgConfig, db: str, migration_name: str) -> None:
    checksum = sha256_file(MIG_ROOT / migration_name / "migration.sql")
    mig_id = str(uuid.uuid4())
    proc = psql(
        cfg,
        db,
        "INSERT INTO \"_prisma_migrations\" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) "
        f"VALUES ('{mig_id}', '{checksum}', NOW(), '{migration_name}', NOW(), 1);",
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


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


def replay_until_exclusive(cfg: PgConfig, db: str, stop_before: str) -> dict:
    """Apply actual migration.sql files in order until stop_before (exclusive)."""
    recreate_db(cfg, db)
    bootstrap_prisma_migrations(cfg, db)
    applied: list[str] = []
    special_steps: list[dict] = []

    for mig in migration_dirs():
        if mig == stop_before:
            break
        if mig == SPECIAL_MIGRATION:
            result = SpecialCompositeIndexExecutor(cfg).run(db, reconcile=False)
            record_migration_applied(cfg, db, mig)
            special_steps.append(result)
            applied.append(mig)
            continue
        path = MIG_ROOT / mig / "migration.sql"
        proc = psql(cfg, db, "", file=path)
        if proc.returncode != 0:
            return {
                "pass": False,
                "applied": applied,
                "failed_migration": mig,
                "error": (proc.stderr or proc.stdout or "").strip(),
                "special_steps": special_steps,
            }
        record_migration_applied(cfg, db, mig)
        applied.append(mig)

    pg_version = psql(cfg, db, "SHOW server_version;", tuples_only=True).stdout.strip()
    expected_last = migration_dirs()[migration_dirs().index(stop_before) - 1]
    return {
        "pass": bool(applied) and applied[-1] == expected_last,
        "applied_count": len(applied),
        "last_applied": applied[-1] if applied else None,
        "stop_before": stop_before,
        "special_steps": special_steps,
        "postgresql_version": pg_version,
        "manual_interventions": 0,
        "production_connection": False,
    }


def column_exists(cfg: PgConfig, db: str, table: str, column: str) -> bool:
    proc = psql(
        cfg,
        db,
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_schema='public' AND table_name='{table}' AND column_name='{column}');",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"
