"""Shared constants for CI-R3B1H.1 insert-select alias lineage closure."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
SCHEMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1H_SHA = "a2773d6c5f8d0e178df9ada285a794e83d8464e8"
R3B1H1_BRANCH = "fix/ci-r3b1h1-insert-select-lineage-closure-2026-08"

PRE249_BOUNDARY = "20260721250000_iam_versioned_role_assignments"
LAST_APPLIED_PRE249 = "20260721240000_iam_last_selected_organization"
FIRST_SCANNED = PRE249_BOUNDARY
IAM_CONSUMER = PRE249_BOUNDARY
MIG_249_ORDINAL = 249

IAM_HISTORICAL_SCHEMA_COMMIT = "68150912"

OLD_MATRIX = DATA / "ci-r3b1h-insert-select-dependency-matrix-2026-08.json"

INSERT_SELECT_GAP_CONTEXTS = {
    "INSERT_SELECT_TARGET",
    "INSERT_SELECT_EXPRESSION",
    "INSERT_SELECT_WHERE",
    "INSERT_SELECT_JOIN",
    "INSERT_SELECT_SUBQUERY",
}

PHYSICAL_BINDING_KINDS = {"TABLE", "PHYSICAL_RELATION", "TARGET_RELATION"}

KNOWN_SINGLE_LETTER_ALIASES = frozenset("abcdefghijklmnopqrstuvwxyz")

R3B1G_REPLAY = DATA / "ci-r3b1g-full-fresh-replay-result-2026-08.json"
