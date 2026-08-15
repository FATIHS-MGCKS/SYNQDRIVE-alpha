"""Shared constants for CI-R3B1H.1.1 evidence and generic contract gate closure."""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1H1_SHA = "dd4f317b7e799122477a48822821bac9ca0aa3d3"
R3B1H111_BRANCH = "fix/ci-r3b1h111-evidence-generic-contract-gates-2026-08"

PRE249_BOUNDARY = "20260721250000_iam_versioned_role_assignments"
FIRST_SCANNED = PRE249_BOUNDARY
IAM_CONSUMER = PRE249_BOUNDARY

IAM_HISTORICAL_SCHEMA_COMMIT = "68150912"
OLD_R3B1H_MATRIX = DATA / "ci-r3b1h-insert-select-dependency-matrix-2026-08.json"
R3B1H1_MATRIX = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"

INSERT_SELECT_GAP_CONTEXTS = {
    "INSERT_SELECT_TARGET",
    "INSERT_SELECT_EXPRESSION",
    "INSERT_SELECT_WHERE",
    "INSERT_SELECT_JOIN",
    "INSERT_SELECT_SUBQUERY",
}

ACCEPTED_RECOVERY_AUTHORITY: dict[tuple[str, str], dict] = {
    ("organization_memberships", "permissions"): {
        "postgres_type": "jsonb",
        "nullable": True,
        "default_semantics": "NO_DATABASE_DEFAULT",
        "default_value": None,
        "enum_dependency": None,
        "sources": [
            "accepted:R3B1H.permissions_contract",
            f"git:{IAM_HISTORICAL_SCHEMA_COMMIT}:OrganizationMembership.permissions:Json?",
        ],
    }
}


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
