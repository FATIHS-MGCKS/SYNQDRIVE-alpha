"""Shared constants for CI-R3B1N production exposure resolution."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATA = REPO / "docs/audits/ci-recovery/data"
RECOVERY = REPO / "docs/audits/ci-recovery"
MIG_ROOT = REPO / "backend/prisma/migrations"

R3B1M_BRANCH = "fix/ci-r3b1m-prisma-schema-authority-alignment-2026-08"
R3B1N_BRANCH = "audit/ci-r3b1n-production-exposure-2026-08"
PARENT_BRANCH = R3B1M_BRANCH

R3B1M_ACCEPTANCE = DATA / "ci-r3b1m-final-migration-recovery-acceptance-2026-08.json"
R3B1M_PARITY = DATA / "ci-r3b1m-final-exact-catalog-parity-2026-08.json"
R3B1M_REPLAY = DATA / "ci-r3b1m-full-fresh-replay-result-2026-08.json"
R3B1M_SCHEMA = DATA / "ci-r3b1m-schema-alignment-result-2026-08.json"
M252_MANIFEST = DATA / "ci-r3b1k-migration252-historical-exception-manifest-2026-08.json"
R3B1I_PROOF = DATA / "ci-r3b1i-targeted-iam-repair-proof-2026-08.json"
R3B1G_MANIFEST = DATA / "ci-r3b1g-tire-repair-migration-manifest-2026-08.json"

M252 = "20260721270000_iam_role_assignment_drift_reconciliation"
M249 = "20260721250000_iam_versioned_role_assignments"
M157 = "20260716160000_battery_v2_remaining_models"
R3B1G = "20260716182730_ci_r3b_tire_setup_status_predecessor"
R3B1I = "20260721245000_ci_r3b_iam_membership_permissions_predecessor"
POST_REPLAY = "20260814130000_ci_r3b_post_replay_parity_reconciliation"

ORIGINAL_M252_SHA = "12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9"
CORRECTED_M252_SHA = "415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee"

SSH_HOST = "srv1374778.hstgr.cloud"
SSH_USER = "synqdrive-admin"
SSH_KEY = Path.home() / ".ssh/id_ed25519"
PROD_DB = "synqdrive"

SECRET_PATTERNS = (
    "postgres://",
    "postgresql://",
    "password=",
    "token=",
    "secret=",
    "api_key",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence_input_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def hash_recovery_inputs() -> list[dict]:
    files = [
        (R3B1M_ACCEPTANCE, "R3B1M final migration recovery acceptance"),
        (R3B1M_PARITY, "R3B1M final exact catalog parity"),
        (R3B1M_REPLAY, "R3B1M full fresh replay result"),
        (R3B1M_SCHEMA, "R3B1M schema alignment result"),
        (M252_MANIFEST, "R3B1K migration 252 historical exception"),
        (R3B1I_PROOF, "R3B1I IAM repair proof"),
        (R3B1G_MANIFEST, "R3B1G tire repair manifest"),
    ]
    return [{"path": str(p.relative_to(REPO)), "sha256": sha256_file(p), "role": role} for p, role in files if p.exists()]
