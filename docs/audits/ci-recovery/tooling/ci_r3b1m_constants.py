"""Shared constants for CI-R3B1M Prisma schema authority alignment."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
RECOVERY = REPO / "docs/audits/ci-recovery"
BACKEND = REPO / "backend"
MIG_ROOT = BACKEND / "prisma/migrations"
SCHEMA_PRISMA = BACKEND / "prisma/schema.prisma"

BASE_R3B1L21_SHA = "838605eada97189f52b6332f943e36bbed387449"
R3B1M_BRANCH = "fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08"
PARENT_BRANCH = "fix/ci-r3b1l21-scope-ownership-coverage-2026-08"

FROZEN_DIFF_SQL = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"
FROZEN_DIFF_JSON = DATA / "ci-r3b1l1-prisma-schema-db-diff-2026-08.json"
R3B1L21_SUMMARY = DATA / "ci-r3b1l21-final-validation-summary-2026-08.json"
R3B1L21_CLASSIFICATION = DATA / "ci-r3b1l21-complete-prisma-diff-classification-2026-08.json"
R3B1L21_AUTHORITY = DATA / "ci-r3b1l21-r3b-scope-drift-authority-2026-08.json"
R3B1L2_INPUT_MANIFEST = DATA / "ci-r3b1l2-prisma-diff-input-manifest-2026-08.json"

CORRECTED_M252_SHA256 = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"
FULL_REPLAY_DB = "ci_r3b1m_final_replay"
POST_ALIGN_REPLAY_DB = "ci_r3b1m_post_align_replay"

PG_IDENTIFIER_MAX = 63


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def pg_trunc_identifier(name: str) -> str:
    return name[:PG_IDENTIFIER_MAX]


def hash_authority_inputs() -> dict:
    files = [
        (R3B1L21_SUMMARY, "R3B1L21 final validation summary"),
        (R3B1L21_CLASSIFICATION, "R3B1L21 complete classification"),
        (R3B1L21_AUTHORITY, "R3B1L21 drift authority"),
        (FROZEN_DIFF_SQL, "frozen Prisma diff SQL"),
        (RECOVERY / "ci-r3a7-production-catalog-evidence-2026-08.json", "R3A.7 production catalog"),
        (DATA / "ci-r3b1l-canonical-54-property-authority-2026-08.json", "R3B1L canonical 54"),
        (DATA / "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json", "R3B1K migration 252 authority"),
    ]
    entries = []
    for path, role in files:
        entries.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path), "role": role})
    frozen = next(e for e in entries if e["path"].endswith("ci-r3b1l1-prisma-schema-db-diff-2026-08.sql"))
    manifest = json.loads(R3B1L2_INPUT_MANIFEST.read_text())
    return {
        "entries": entries,
        "frozen_diff_sha256": frozen["sha256"],
        "frozen_diff_bytes": manifest.get("byte_count_sql_file"),
        "frozen_diff_lines": manifest.get("line_count_sql_file"),
        "manifest_consistent": frozen["sha256"] == manifest.get("sql_file_sha256"),
    }
