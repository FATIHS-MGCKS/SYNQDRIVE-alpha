"""Shared constants for CI-R3B1J PostgreSQL identifier collision authority."""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1I_SHA = "27d49551c8093ae475bf9cdc9815713968ceb08c"
R3B1J_BRANCH = "fix/ci-r3b1j-identifier-collision-authority-2026-08"
PARENT_BRANCH = "fix/ci-r3b1i-iam-permissions-full-replay-2026-08"

MIGRATION_252 = "20260721270000_iam_role_assignment_drift_reconciliation"
PRE_252_LAST = "20260721260000_iam_role_change_applications"
MIGRATION_252_PATH = MIG_ROOT / MIGRATION_252 / "migration.sql"

TABLE_NAME = "organization_role_assignment_drift_reconciliation_applications"

IDENTIFIERS_IN_252 = {
    "table": TABLE_NAME,
    "pk_constraint": f"{TABLE_NAME}_pkey",
    "unique_index": f"{TABLE_NAME}_idempotency_key_key",
    "composite_index": f"{TABLE_NAME}_organization_id_membership_id_created_at_idx",
    "fk_organization": f"{TABLE_NAME}_organization_id_fkey",
    "fk_membership": f"{TABLE_NAME}_membership_id_fkey",
}


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
