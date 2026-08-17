"""Post-R3B1Q tail migration identity — logical planning vs physical Prisma identity."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1n2_constants import MIG_ROOT, sha256_file

PHYSICAL_TAIL_MIGRATION_NAME = "20260816110731_ci_r3b_production_history_tail_reconciliation"
TEMPORARY_TAIL_LOGICAL_NAME = "TEMPORARY_TAIL_RECONCILIATION_20260815"
EXECUTED_TAIL_SQL_SHA256 = "c158dcbbd2eb78d081d4851714dec28b0e304374eb272ec7cfe88f999cdcd899"
EXECUTED_TAIL_SQL_EVIDENCE = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "ci-r3b1q-tail-sql-2026-08.sql"
)


def physical_tail_sql_path() -> Path | None:
    path = MIG_ROOT / PHYSICAL_TAIL_MIGRATION_NAME / "migration.sql"
    return path if path.is_file() else None


def temporary_tail_prisma_directory() -> Path | None:
    path = MIG_ROOT / TEMPORARY_TAIL_LOGICAL_NAME
    return path if path.is_dir() else None


def prisma_discoverable_tail_name() -> str:
    """Return the Prisma migration directory name discoverable under backend/prisma/migrations."""
    if physical_tail_sql_path() is not None:
        return PHYSICAL_TAIL_MIGRATION_NAME
    return TEMPORARY_TAIL_LOGICAL_NAME


def tail_identity_status() -> dict[str, object]:
    physical = physical_tail_sql_path()
    temporary_dir = temporary_tail_prisma_directory()
    return {
        "physical_tail_migration_name": PHYSICAL_TAIL_MIGRATION_NAME,
        "logical_planning_tail_name": TEMPORARY_TAIL_LOGICAL_NAME,
        "physical_tail_prisma_directory_exists": physical is not None,
        "temporary_tail_prisma_directory_exists": temporary_dir is not None,
        "prisma_discoverable_tail_name": prisma_discoverable_tail_name(),
        "executed_tail_sql_sha256": EXECUTED_TAIL_SQL_SHA256,
        "source_physical_tail_sha256": sha256_file(physical) if physical else None,
        "logical_tail_is_prisma_pending_migration": temporary_dir is not None,
        "post_r3b1q_canonical_prisma_identity": PHYSICAL_TAIL_MIGRATION_NAME,
    }
