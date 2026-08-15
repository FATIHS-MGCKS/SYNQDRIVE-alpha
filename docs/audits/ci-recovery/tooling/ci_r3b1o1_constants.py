"""Shared constants for CI-R3B1O.1."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1o_constants import *  # noqa: F403

R3B1O_BRANCH = "audit/ci-r3b1o-reconciliation-strategy-simulation-2026-08"
R3B1O1_BRANCH = "audit/ci-r3b1o1-final-strategy-acceptance-2026-08"
WORK_R3B1O1 = REPO / "docs/audits/ci-recovery/.work/r3b1o1"  # noqa: F405

M252_TABLE = "organization_role_assignment_drift_reconciliation_applications"
M252_AUTHORITY_MANIFEST = DATA / "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json"  # noqa: F405
R3B1M_FINAL_PARITY = DATA / "ci-r3b1m-final-exact-catalog-parity-2026-08.json"  # noqa: F405
FROZEN_DIFF_SQL = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"  # noqa: F405

R3B1O_INPUTS = [
    "ci-r3b1o-strategy-results-2026-08.json",
    "ci-r3b1o-selected-reconciliation-strategy-2026-08.json",
    "ci-r3b1o-migration-effect-equivalence-contracts-2026-08.json",
    "ci-r3b1o-checksum-provenance-preflight-2026-08.json",
    "ci-r3b1o-production-data-dependency-risk-2026-08.json",
    "ci-r3b1o-final-strategy-simulation-summary-2026-08.json",
    "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json",
    "ci-r3b1m-final-exact-catalog-parity-2026-08.json",
]

FINAL_STRATEGY_DB_PREFIX = "r3b1o1_final_winning"


def ensure_r3b1o1_workdir() -> Path:
    WORK_R3B1O1.mkdir(parents=True, exist_ok=True)
    return WORK_R3B1O1
