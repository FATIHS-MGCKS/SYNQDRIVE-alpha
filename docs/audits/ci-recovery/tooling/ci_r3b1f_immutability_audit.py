#!/usr/bin/env python3
"""Immutability audit for CI-R3B1F."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
MIG_ROOT = REPO / "backend/prisma/migrations"
OUT = REPO / "docs/audits/ci-recovery/data/ci-r3b1f-immutability-audit-2026-08.json"
BASE_SHA = "5acf67cc4013aec7ae42b7028f07aae083351a17"

R3B1B = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]
R3B1E = [
    "20260613203000_ci_r3b_post_vendor_predecessor_slot07",
    "20260616130000_ci_r3b_post_vendor_predecessor_slot08",
    "20260617120000_r3b_post_vendor_predecessor_slot09",
    "20260617203000_ci_r3b_post_vendor_predecessor_slot10",
    "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
    "20260716180000_r3b_post_vendor_predecessor_slot12",
    "20260716182500_ci_r3b_post_vendor_predecessor_slot13",
    "20260716200000_r3b_post_vendor_predecessor_slot14",
    "20260723245000_ci_r3b_post_vendor_predecessor_slot15",
    "20260724210000_ci_r3b_post_vendor_predecessor_slot16",
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob_sha(path: str, rev: str) -> str | None:
    proc = subprocess.run(["git", "show", f"{rev}:{path}"], cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    return hashlib.sha256(proc.stdout.encode()).hexdigest()


def main() -> int:
    migration_changes = []
    for mig in sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir()):
        rel = f"backend/prisma/migrations/{mig}/migration.sql"
        current = sha256_file(MIG_ROOT / mig / "migration.sql")
        baseline = git_blob_sha(rel, BASE_SHA)
        if baseline and baseline != current:
            migration_changes.append({"migration": mig, "baseline_sha256": baseline, "current_sha256": current})

    status = subprocess.run(["git", "status", "--short"], cwd=REPO, capture_output=True, text=True)
    diff_names = subprocess.run(
        ["git", "diff", "--name-only", BASE_SHA, "HEAD"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "baseline_sha": BASE_SHA,
        "existing_migration_sql_changed": len(migration_changes),
        "migration_changes": migration_changes,
        "r3b1b_repair_migrations_changed": sum(1 for c in migration_changes if c["migration"] in R3B1B),
        "r3b1e_repair_migrations_changed": sum(1 for c in migration_changes if c["migration"] in R3B1E),
        "tire_lifecycle_invariants_changed": any(c["migration"] == "20260716183000_tire_lifecycle_invariants" for c in migration_changes),
        "schema_prisma_changed": "backend/prisma/schema.prisma" in diff_names.stdout.splitlines(),
        "runtime_code_changed": any(
            p.startswith(("backend/src/", "frontend/")) for p in diff_names.stdout.splitlines()
        ),
        "allowed_docs_only": all(
            p.startswith("docs/audits/ci-recovery/")
            for p in status.stdout.splitlines()
            if p.strip() and not p.strip().startswith("??")
        ),
        "pass": len(migration_changes) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "migration_sql_changed": out["existing_migration_sql_changed"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
