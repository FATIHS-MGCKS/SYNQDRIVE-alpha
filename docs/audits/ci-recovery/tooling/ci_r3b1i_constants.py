"""Shared constants for CI-R3B1I IAM permissions repair and full replay."""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1H111_SHA = "37d0904500024bf51dd712fb7398d91dd54c0411"
R3B1I_BRANCH = "fix/ci-r3b1i-iam-permissions-full-replay-2026-08"
PARENT_BRANCH = "fix/ci-r3b1h111-evidence-generic-contract-gates-2026-08"

FIRST_SCANNED = "20260721250000_iam_versioned_role_assignments"
IAM_PREDECESSOR = "20260721240000_iam_last_selected_organization"
IAM_CONSUMER = FIRST_SCANNED
IAM_REPAIR_MIGRATION = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"

R3B1G_REPAIR = "20260716182730_ci_r3b_tire_setup_status_predecessor"
TIRE_CONSUMER = "20260716183000_tire_lifecycle_invariants"
SPECIAL_MIGRATION = "20260413230000_add_composite_indexes_batch_c"

R3B1B_REPAIR_MIGRATIONS = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]

R3B1E_REPAIR_MIGRATIONS = [
    "20260613203000_ci_r3b_post_vendor_predecessor_slot07",
    "20260616130000_ci_r3b_post_vendor_predecessor_slot08",
    "20260617120000_r3b_post_vendor_predecessor_slot09",
    "20260617203000_ci_r3b_post_vendor_predecessor_slot10",
    "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
    "20260716180000_r3b_post_vendor_predecessor_slot12",
    "20260716182500_ci_r3b_post_vendor_predecessor_slot13",
    "20260716200000_r3b_post_vendor_predecessor_slot14",
    "20260723245000_ci_r3b_post_vendor_predecessor_slot15",
    "20260724210000_ci_r3b_post_vendor_predecessor_slot16",
]

ACCEPTED_CONTRACT = {
    "relation": "organization_memberships",
    "column": "permissions",
    "postgres_type": "jsonb",
    "nullable": True,
    "default_semantics": "NO_DATABASE_DEFAULT",
    "default_value": None,
    "first_consumer_migration": IAM_CONSUMER,
}


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def parent_branch_sha() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", f"origin/{PARENT_BRANCH}"], cwd=REPO, text=True
    ).strip()
