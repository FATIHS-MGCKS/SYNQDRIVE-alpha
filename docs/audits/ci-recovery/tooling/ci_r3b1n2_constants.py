"""Shared constants for CI-R3B1N.2."""
from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
WORK = REPO / "docs/audits/ci-recovery/.work/r3b1n2"
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"

R3B1N1_BRANCH = "audit/ci-r3b1n1-history-reconciliation-twin-simulation-2026-08"
R3B1N2_BRANCH = "audit/ci-r3b1n2-isolated-twin-provenance-closure-2026-08"
R3B1M_BRANCH = "fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08"
DEPLOYED_SHA = "d8461e28c9b4cee121e34a1d79145d0ff6b97991"

R3B1N_LEDGER = DATA / "ci-r3b1n-production-prisma-ledger-2026-08.json"
R3B1N1_SUMMARY = DATA / "ci-r3b1n1-final-history-reconciliation-summary-2026-08.json"

R3B1G = "20260716182730_ci_r3b_tire_setup_status_predecessor"
R3B1I = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
M252 = "20260721270000_iam_role_assignment_drift_reconciliation"

R3B1N1_INPUTS = [
    "ci-r3b1n1-twin-migrate-deploy-result-2026-08.json",
    "ci-r3b1n1-production-twin-fidelity-2026-08.json",
    "ci-r3b1n1-prisma-checksum-semantics-2026-08.json",
    "ci-r3b1n1-checksum-provenance-classification-2026-08.json",
    "ci-r3b1n1-repo-only-pending-effect-matrix-2026-08.json",
    "ci-r3b1n1-migration252-forensic-timeline-2026-08.json",
    "ci-r3b1n1-final-history-reconciliation-summary-2026-08.json",
]

BUSINESS_TABLES = (
    "organizations",
    "organization_memberships",
    "vehicles",
    "bookings",
    "vehicle_trips",
)

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


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def git_rev(ref: str) -> str:
    return subprocess.check_output(["git", "rev-parse", ref], cwd=REPO, text=True).strip()


def migration_sql_path(name: str) -> str:
    return f"backend/prisma/migrations/{name}/migration.sql"


def file_bytes_at(ref: str, migration: str) -> bytes | None:
    rel = migration_sql_path(migration)
    if subprocess.run(["git", "cat-file", "-e", f"{ref}:{rel}"], cwd=REPO, capture_output=True).returncode != 0:
        return None
    return subprocess.check_output(["git", "show", f"{ref}:{rel}"], cwd=REPO)


def checksum_representations(content: bytes) -> dict[str, str]:
    text = content.decode("utf-8")
    lf = text.replace("\r\n", "\n").replace("\r", "\n")
    crlf = lf.replace("\n", "\r\n")
    return {"raw": sha256_bytes(content), "lf": sha256_text(lf), "crlf": sha256_text(crlf)}


def ensure_workdir() -> Path:
    WORK.mkdir(parents=True, exist_ok=True)
    return WORK


def local_migration_inventory() -> dict[str, str]:
    inv: dict[str, str] = {}
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        inv[path.parent.name] = sha256_file(path)
    return inv
