"""Shared constants for CI-R3B1O."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1n2_constants import *  # noqa: F403

R3B1N2_BRANCH = "audit/ci-r3b1n2-isolated-twin-provenance-closure-2026-08"
R3B1O_BRANCH = "audit/ci-r3b1o-reconciliation-strategy-simulation-2026-08"
WORK_R3B1O = REPO / "docs/audits/ci-recovery/.work/r3b1o"  # noqa: F405

R3B1G = "20260716182730_ci_r3b_tire_setup_status_predecessor"
R3B1I = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
M252 = "20260721270000_iam_role_assignment_drift_reconciliation"
M252_TABLE = "organization_role_assignment_drift_reconciliation_applications"
HM_DUAL_APP = "20260412013110_hm_dual_app_container_type"

GOLDEN_BASELINE_DB_PREFIX = "r3b1o_golden_baseline"
STRATEGY_DB_PREFIX = "r3b1o_strategy"

R3B1N2_ARTIFACTS = [
    "ci-r3b1n2-final-isolated-twin-provenance-summary-2026-08.json",
    "ci-r3b1n2-checksum-provenance-closure-2026-08.json",
    "ci-r3b1n2-isolated-twin-migrate-deploy-result-2026-08.json",
    "ci-r3b1n2-production-deployment-blocker-baseline-2026-08.json",
    "ci-r3b1n2-twin-isolation-proof-2026-08.json",
]


def ensure_r3b1o_workdir() -> Path:  # noqa: F405
    WORK_R3B1O.mkdir(parents=True, exist_ok=True)
    return WORK_R3B1O
