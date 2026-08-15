"""Shared constants for CI-R3B1J.1 namespace and semantic parity closure."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"
R3B1J_DATA = DATA

BASE_R3B1J_SHA = "9e8c24da936ee98eb47cbed6c34b6ee7dcbb9a10"
R3B1J1_BRANCH = "fix/ci-r3b1j1-namespace-parity-closure-2026-08"
PARENT_BRANCH = "fix/ci-r3b1j-identifier-collision-authority-2026-08"

MIGRATION_252 = "20260721270000_iam_role_assignment_drift_reconciliation"
MIGRATION_252_PATH = MIG_ROOT / MIGRATION_252 / "migration.sql"
PRE_252_STOP = MIGRATION_252
LEGAL_HOLD_MIGRATION = "20260722250000_legal_document_retention_legal_hold"
TABLE_252 = "organization_role_assignment_drift_reconciliation_applications"

CANONICAL_PLAN_PATH = DATA / "ci-r3b1j-canonical-identifier-repair-plan-2026-08.json"


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def load_canonical_renames() -> dict[str, str]:
    plan = json.loads(CANONICAL_PLAN_PATH.read_text())
    return {e["raw_historical_name"]: e["canonical_corrected_name"] for e in plan["entries"]}


def load_approved_name_pairs() -> list[dict]:
    plan = json.loads(CANONICAL_PLAN_PATH.read_text())
    return plan["entries"]
