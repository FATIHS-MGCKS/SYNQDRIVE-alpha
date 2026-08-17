"""Shared constants for CI-R3B1L.2 Prisma diff parser and authority phase."""
from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
RECOVERY = REPO / "docs/audits/ci-recovery"
BACKEND = REPO / "backend"
MIG_ROOT = BACKEND / "prisma/migrations"
SCHEMA_PRISMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1L1_SHA = "b994c9cbdce75a85989f777757237bb187e62078"
R3B1L2_BRANCH = "fix/ci-r3b1l2-prisma-diff-authority-2026-08"
PARENT_BRANCH = "fix/ci-r3b1l1-exact-parity-diff-closure-2026-08"

FROZEN_DIFF_SQL = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"
FROZEN_DIFF_JSON = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.json"
OLD_CLASSIFICATION = DATA / "ci-r3b1l1-prisma-diff-scope-classification-2026-08.json"
R3B1L1_PARITY = DATA / "ci-r3b1l1-exact-final-catalog-parity-2026-08.json"
CATALOG_PATH = RECOVERY / "ci-r3a7-production-catalog-evidence-2026-08.json"
R3B1L_CANONICAL_54 = DATA / "ci-r3b1l-canonical-54-property-authority-2026-08.json"

CORRECTED_M252_SHA256 = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"

OLD_PARSER_REPORTED_OPS = 13


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
