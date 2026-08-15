#!/usr/bin/env python3
"""Immutability audit for CI-R3B1I."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from ci_r3b1i_constants import (
    BASE_R3B1H111_SHA,
    DATA,
    IAM_CONSUMER,
    IAM_REPAIR_MIGRATION,
    MIG_ROOT,
    R3B1B_REPAIR_MIGRATIONS,
    R3B1E_REPAIR_MIGRATIONS,
    REPO,
    R3B1G_REPAIR,
    TIRE_CONSUMER,
)

OUT = DATA / "ci-r3b1i-immutability-audit-2026-08.json"
PREEXISTING = DATA / "ci-r3b1i-preexisting-migration-sha-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    baseline = json.loads(PREEXISTING.read_text())
    baseline_entries = baseline["entries"]
    migration_changes = []
    for mig, expected_sha in baseline_entries.items():
        path = MIG_ROOT / mig / "migration.sql"
        if not path.exists():
            migration_changes.append({"migration": mig, "reason": "deleted", "expected_sha256": expected_sha})
            continue
        current = sha256_file(path)
        if current != expected_sha:
            migration_changes.append({"migration": mig, "expected_sha256": expected_sha, "current_sha256": current})

    current_dirs = sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir())
    baseline_dirs = sorted(baseline_entries.keys())
    new_dirs = [d for d in current_dirs if d not in baseline_dirs]
    deleted_dirs = [d for d in baseline_dirs if d not in current_dirs]

    diff_names = subprocess.run(
        ["git", "diff", "--name-only", BASE_R3B1H111_SHA],
        cwd=REPO,
        capture_output=True,
        text=True,
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "baseline_sha": BASE_R3B1H111_SHA,
        "preexisting_migration_sql_modified": len(migration_changes),
        "migration_changes": migration_changes,
        "new_prisma_migration_directories": len(new_dirs),
        "new_directories": new_dirs,
        "deleted_directories": deleted_dirs,
        "expected_new_migration": IAM_REPAIR_MIGRATION,
        "r3b1g_repair_changed": sum(1 for c in migration_changes if c.get("migration") == R3B1G_REPAIR),
        "migration_157_changed": sum(1 for c in migration_changes if c.get("migration") == TIRE_CONSUMER),
        "migration_249_changed": sum(1 for c in migration_changes if c.get("migration") == IAM_CONSUMER),
        "schema_prisma_changed": "backend/prisma/schema.prisma" in diff_names.stdout.splitlines(),
        "runtime_code_changed": any(
            p.startswith(("backend/src/", "frontend/")) for p in diff_names.stdout.splitlines()
        ),
        "pass": len(migration_changes) == 0 and new_dirs == [IAM_REPAIR_MIGRATION] and not deleted_dirs,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "modified": out["preexisting_migration_sql_modified"], "new_dirs": new_dirs}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
