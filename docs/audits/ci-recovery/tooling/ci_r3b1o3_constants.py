"""Shared constants for CI-R3B1O.3."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1o2_constants import *  # noqa: F403

R3B1O2_BRANCH = "fix/ci-r3b1o2-m252-prisma-mapping-diff-closure-2026-08"
R3B1O3_BRANCH = "audit/ci-r3b1o3-final-strategy-gate-closure-2026-08"
WORK_R3B1O3 = REPO / "docs/audits/ci-recovery/.work/r3b1o3"  # noqa: F405

FINAL_STRATEGY_DB_PREFIX = "r3b1o3_corrective_final_winning"

R3B1O3_INPUTS = [
    "backend/prisma/schema.prisma",
    f"backend/prisma/migrations/{M252}/migration.sql",  # noqa: F405
    "ci-r3b1o2-final-prisma-diff-2026-08.sql",
    "ci-r3b1o2-final-prisma-diff-classification-2026-08.json",
    "ci-r3b1o2-index-owner-inventory-2026-08.json",
    "ci-r3b1o2-final-m252-exact-parity-2026-08.json",
    "ci-r3b1o2-final-r3b-parity-2026-08.json",
    "ci-r3b1o2-second-deploy-idempotency-2026-08.json",
    "ci-r3b1o2-final-alignment-diff-closure-summary-2026-08.json",
]

STRATEGY_CONTRACT = {
    "resolves": [
        "20260716182730_ci_r3b_tire_setup_status_predecessor",
        "20260721245000_ci_r3b_iam_membership_permissions_predecessor",
    ],
    "forward_migration_purpose": "append_only_m252_forward_reconciliation",
    "forward_sql_source": M252,  # noqa: F405
}


def ensure_r3b1o3_workdir() -> Path:
    WORK_R3B1O3.mkdir(parents=True, exist_ok=True)
    return WORK_R3B1O3
