"""Shared constants for CI-R3B1L.2.1 independent coverage and scope ownership closure."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
RECOVERY = REPO / "docs/audits/ci-recovery"
BACKEND = REPO / "backend"
MIG_ROOT = BACKEND / "prisma/migrations"
SCHEMA_PRISMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1L2_SHA = "11a5c8feed95f81f26ac240dd48e1bf786adcc92"
R3B1L21_BRANCH = "fix/ci-r3b1l21-scope-ownership-coverage-2026-08"
PARENT_BRANCH = "fix/ci-r3b1l2-prisma-diff-authority-2026-08"

FROZEN_DIFF_SQL = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"
FROZEN_DIFF_JSON = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.json"
R3B1L2_INPUT_MANIFEST = DATA / "ci-r3b1l2-prisma-diff-input-manifest-2026-08.json"
R3B1L2_CLASSIFICATION = DATA / "ci-r3b1l2-complete-prisma-diff-classification-2026-08.json"

CORRECTED_M252_SHA256 = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def verify_frozen_input_against_r3b1l2_manifest() -> dict:
    manifest = json.loads(R3B1L2_INPUT_MANIFEST.read_text())
    sql_bytes = FROZEN_DIFF_SQL.read_bytes()
    import hashlib

    sha = hashlib.sha256(sql_bytes).hexdigest()
    lines = len(FROZEN_DIFF_SQL.read_text().splitlines())
    out = {
        "path": str(FROZEN_DIFF_SQL.relative_to(REPO)),
        "sha256": sha,
        "bytes": len(sql_bytes),
        "lines": lines,
        "expected_sha256": manifest.get("sql_file_sha256"),
        "expected_bytes": manifest.get("byte_count_sql_file"),
        "expected_lines": manifest.get("line_count_sql_file"),
        "pass": sha == manifest.get("sql_file_sha256")
        and len(sql_bytes) == manifest.get("byte_count_sql_file")
        and lines == manifest.get("line_count_sql_file"),
    }
    return out
