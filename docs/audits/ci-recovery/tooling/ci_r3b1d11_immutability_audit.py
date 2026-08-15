#!/usr/bin/env python3
"""Immutability audit for CI-R3B1D.1.1 — existing migration SQL and runtime code unchanged."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
MIG_ROOT = REPO / "backend/prisma/migrations"
OUT = REPO / "docs/audits/ci-recovery/data/ci-r3b1d11-immutability-audit-2026-08.json"
BASE_SHA = "721ad893d15cfa46786a112860548ce12a2be71d"

IMMUTABLE_MIGRATIONS = [
    "20260325161141_ci_r3b_bootstrap_trip_schema_baseline",
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
    "20260424235959_ci_r3b_trip_casing_pre_shim",
    "20260425000001_ci_r3b_trip_casing_post_shim",
    "20260814130000_ci_r3b_post_replay_parity_reconciliation",
    "20260413230000_add_composite_indexes_batch_c",
    "20260613210000_vendor_management_overhaul",
    "20260425000000_retire_user_assignment_and_speeding_severity",
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob_sha(path: str, rev: str) -> str | None:
    proc = subprocess.run(["git", "show", f"{rev}:{path}"], cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    return hashlib.sha256(proc.stdout.encode()).hexdigest()


def main() -> int:
    migration_changes: list[dict] = []
    for mig in sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir()):
        rel = f"backend/prisma/migrations/{mig}/migration.sql"
        current = sha256_file(MIG_ROOT / mig / "migration.sql")
        baseline = git_blob_sha(rel, BASE_SHA)
        if baseline and baseline != current:
            migration_changes.append({"migration": mig, "baseline_sha256": baseline, "current_sha256": current})

    schema_proc = subprocess.run(
        ["git", "diff", "--name-only", BASE_SHA, "HEAD", "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    runtime_proc = subprocess.run(
        ["git", "diff", "--name-only", BASE_SHA, "HEAD", "--", "backend/src/", "frontend/"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1D.1.1",
        "baseline_sha": BASE_SHA,
        "existing_migration_sql_changed": len(migration_changes),
        "migration_changes": migration_changes,
        "schema_prisma_changed": bool(schema_proc.stdout.strip()),
        "runtime_code_changed": bool(runtime_proc.stdout.strip()),
        "immutable_targets_checked": IMMUTABLE_MIGRATIONS,
        "pass": len(migration_changes) == 0 and not schema_proc.stdout.strip() and not runtime_proc.stdout.strip(),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "migration_sql_changed": out["existing_migration_sql_changed"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
