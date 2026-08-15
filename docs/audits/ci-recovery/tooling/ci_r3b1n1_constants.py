"""Shared constants for CI-R3B1N.1 history reconciliation and twin simulation."""
from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
WORK = REPO / "docs/audits/ci-recovery/.work/r3b1n1"

R3B1N_BRANCH = "audit/ci-r3b1n-production-exposure-2026-08"
R3B1N1_BRANCH = "audit/ci-r3b1n1-history-reconciliation-twin-simulation-2026-08"
R3B1M_BRANCH = "fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08"

DEPLOYED_SHA = "d8461e28c9b4cee121e34a1d79145d0ff6b97991"

R3B1N_LEDGER = DATA / "ci-r3b1n-production-prisma-ledger-2026-08.json"
R3B1N_LEDGER_COMPARE = DATA / "ci-r3b1n-production-ledger-vs-recovery-2026-08.json"
R3B1N_SUMMARY = DATA / "ci-r3b1n-final-production-exposure-summary-2026-08.json"

R3B1G = "20260716182730_ci_r3b_tire_setup_status_predecessor"
R3B1I = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
M252 = "20260721270000_iam_role_assignment_drift_reconciliation"
RETIRE_USER = "20260425000000_retire_user_assignment_and_speeding_severity"

PROD_VPS_A = "PROD_VPS_A"
PROD_DB_A = "PROD_DB_A"

FORBIDDEN_ARTIFACT_STRINGS = (
    "postgres://",
    "postgresql://",
    "ssh://",
    "password=",
    "password:",
    "token=",
    "secret=",
    "api_key",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
    "srv1374778.hstgr.cloud",
    "synqdrive-admin",
)

HIGH_RISK_SUBSTRINGS = (
    "ci_r3b",
    "_r3b_",
    "r3b_",
    "iam_",
    "tire",
    "trip_",
    "convergence",
    "post_replay",
    "role_assignment",
    "membership_permissions",
    "retire_user_assignment",
    R3B1G,
    R3B1I,
    M252,
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def git_rev(ref: str) -> str:
    return subprocess.check_output(["git", "rev-parse", ref], cwd=REPO, text=True).strip()


def migration_sql_path(name: str) -> str:
    return f"backend/prisma/migrations/{name}/migration.sql"


def file_state_at(ref: str, migration: str) -> dict:
    rel = migration_sql_path(migration)
    exists = subprocess.run(["git", "cat-file", "-e", f"{ref}:{rel}"], cwd=REPO, capture_output=True).returncode == 0
    sha = None
    if exists:
        content = subprocess.check_output(["git", "show", f"{ref}:{rel}"], cwd=REPO)
        sha = sha256_bytes(content)
    return {"file_present": exists, "file_sha256": sha}


def local_migration_inventory() -> dict[str, str]:
    inv: dict[str, str] = {}
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        inv[path.parent.name] = sha256_file(path)
    return inv


def is_high_risk(migration: str) -> bool:
    low = migration.lower()
    return any(token in low for token in HIGH_RISK_SUBSTRINGS)


def ensure_workdir() -> Path:
    WORK.mkdir(parents=True, exist_ok=True)
    return WORK
