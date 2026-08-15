"""Shared constants for CI-R3B1K migration 252 identifier correction."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1J1_SHA = "b9ca9b0fb2431ec42004e2b14c1ae52fc78a0c74"
R3B1K_BRANCH = "fix/ci-r3b1k-migration252-identifier-correction-2026-08"
PARENT_BRANCH = "fix/ci-r3b1j1-namespace-parity-closure-2026-08"

MIGRATION_252 = "20260721270000_iam_role_assignment_drift_reconciliation"
MIGRATION_252_PATH = MIG_ROOT / MIGRATION_252 / "migration.sql"
PRE_252_LAST = "20260721260000_iam_role_change_applications"
IAM_CONSUMER = "20260721250000_iam_versioned_role_assignments"
IAM_REPAIR = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
R3B1G_REPAIR = "20260716182730_ci_r3b_tire_setup_status_predecessor"
TABLE_252 = "organization_role_assignment_drift_reconciliation_applications"

ORIGINAL_M252_SHA256 = "12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9"
CORRECTED_M252_SHA256 = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"

AUTHORITY_FILES = [
    "ci-r3b1j1-repair-mode-decision-2026-08.json",
    "ci-r3b1j1-identifier-only-token-diff-2026-08.json",
    "ci-r3b1j1-exact-semantic-parity-2026-08.json",
    "ci-r3b1j1-migration252-namespace-collisions-2026-08.json",
    "ci-r3b1j-canonical-identifier-repair-plan-2026-08.json",
]

APPROVED_RENAMES = {
    "organization_role_assignment_drift_reconciliation_applications_pkey": "org_role_asgn_drift_recon_apps_pkey",
    "organization_role_assignment_drift_reconciliation_applications_idempotency_key_key": "org_role_asgn_drift_recon_apps_idem_key",
    "organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx": "org_role_asgn_drift_recon_apps_org_mbr_created_idx",
    "organization_role_assignment_drift_reconciliation_applications_organization_id_fkey": "org_role_asgn_drift_recon_apps_org_id_fkey",
    "organization_role_assignment_drift_reconciliation_applications_membership_id_fkey": "org_role_asgn_drift_recon_apps_mbr_id_fkey",
}


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def load_canonical_from_plan() -> dict[str, str]:
    plan = json.loads((DATA / "ci-r3b1j-canonical-identifier-repair-plan-2026-08.json").read_text())
    return {e["raw_historical_name"]: e["canonical_corrected_name"] for e in plan["entries"]}
