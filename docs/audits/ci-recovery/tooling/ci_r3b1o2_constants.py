"""Shared constants for CI-R3B1O.2."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1o1_constants import *  # noqa: F403

R3B1O1_BRANCH = "audit/ci-r3b1o1-final-strategy-acceptance-2026-08"
R3B1O2_BRANCH = "fix/ci-r3b1o2-m252-prisma-mapping-diff-closure-2026-08"
WORK_R3B1O2 = REPO / "docs/audits/ci-recovery/.work/r3b1o2"  # noqa: F405

M252_CANONICAL = {
    "PK": "org_role_asgn_drift_recon_apps_pkey",
    "UNIQUE": "org_role_asgn_drift_recon_apps_idem_key",
    "INDEX": "org_role_asgn_drift_recon_apps_org_mbr_created_idx",
    "ORG_FK": "org_role_asgn_drift_recon_apps_org_id_fkey",
    "MEMBERSHIP_FK": "org_role_asgn_drift_recon_apps_mbr_id_fkey",
}

R3B1O2_INPUTS = [
    "backend/prisma/schema.prisma",
    f"backend/prisma/migrations/{M252}/migration.sql",  # noqa: F405
    "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json",
    "ci-r3b1o1-m252-physical-authority-2026-08.json",
    "ci-r3b1o1-m252-prisma-authority-comparison-2026-08.json",
    "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.sql",
    "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.json",
    "ci-r3b1o1-m252-forward-exact-parity-2026-08.json",
    "ci-r3b1o1-final-winning-twin-r3b-parity-2026-08.json",
    "ci-r3b1o1-second-deploy-idempotency-2026-08.json",
]

R3B1O1_FROZEN_DIFF_SQL = DATA / "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.sql"  # noqa: F405
R3B1O1_FROZEN_DIFF_JSON = DATA / "ci-r3b1o1-final-winning-twin-prisma-diff-2026-08.json"  # noqa: F405

FINAL_STRATEGY_DB_PREFIX = "r3b1o2_final_winning"


def ensure_r3b1o2_workdir() -> Path:
    WORK_R3B1O2.mkdir(parents=True, exist_ok=True)
    return WORK_R3B1O2
