#!/usr/bin/env python3
"""Immutability audit for CI-R3B1H — no migration/schema/runtime changes since R3B1G."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from ci_r3b1h_constants import BASE_R3B1G_SHA, DATA, MIG_ROOT, PRE249_BOUNDARY, REPO

OUT = DATA / "ci-r3b1h-immutability-audit-2026-08.json"

R3B1G_REPAIR = "20260716182730_ci_r3b_tire_setup_status_predecessor"
MIG_157 = "20260716183000_tire_lifecycle_invariants"
COMPOSITE = "20260413230000_add_composite_indexes_batch_c"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def migration_dirs_at(rev: str) -> list[str]:
    out = subprocess.check_output(
        ["git", "ls-tree", "-d", "--name-only", rev, "backend/prisma/migrations/"],
        cwd=REPO,
        text=True,
    )
    return sorted(line.strip().split("/")[-1] for line in out.splitlines() if line.strip())


def migration_sql_at(rev: str, mig: str) -> str | None:
    path = f"backend/prisma/migrations/{mig}/migration.sql"
    try:
        return subprocess.check_output(["git", "show", f"{rev}:{path}"], cwd=REPO, text=True)
    except subprocess.CalledProcessError:
        return None


def main() -> int:
    baseline_dirs = migration_dirs_at(BASE_R3B1G_SHA)
    current_dirs = sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir())
    new_dirs = [d for d in current_dirs if d not in baseline_dirs]
    deleted_dirs = [d for d in baseline_dirs if d not in current_dirs]

    migration_changes = []
    for mig in baseline_dirs:
        base_sql = migration_sql_at(BASE_R3B1G_SHA, mig)
        cur_path = MIG_ROOT / mig / "migration.sql"
        if base_sql is None or not cur_path.is_file():
            migration_changes.append({"migration": mig, "reason": "missing_at_head"})
            continue
        cur_sql = cur_path.read_text()
        if cur_sql != base_sql:
            migration_changes.append(
                {
                    "migration": mig,
                    "expected_sha256": hashlib.sha256(base_sql.encode()).hexdigest(),
                    "current_sha256": sha256_file(cur_path),
                }
            )

    diff_names = subprocess.run(
        ["git", "diff", "--name-only", BASE_R3B1G_SHA],
        cwd=REPO,
        capture_output=True,
        text=True,
    ).stdout.splitlines()

    allowed_prefix = "docs/audits/ci-recovery/"
    forbidden_changes = [p for p in diff_names if p.strip() and not p.startswith(allowed_prefix)]

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "baseline_sha": BASE_R3B1G_SHA,
        "preexisting_migration_sql_modified": len(migration_changes),
        "migration_changes": migration_changes,
        "new_prisma_migration_directories": len(new_dirs),
        "new_directories": new_dirs,
        "deleted_directories": deleted_dirs,
        "r3b1g_tire_repair_changed": any(c.get("migration") == R3B1G_REPAIR for c in migration_changes),
        "migration_157_changed": any(c.get("migration") == MIG_157 for c in migration_changes),
        "migration_249_changed": any(c.get("migration") == PRE249_BOUNDARY for c in migration_changes),
        "composite_index_migration_changed": any(c.get("migration") == COMPOSITE for c in migration_changes),
        "schema_prisma_changed": "backend/prisma/schema.prisma" in diff_names,
        "runtime_code_changed": any(p.startswith(("backend/src/", "frontend/")) for p in diff_names),
        "forbidden_non_audit_changes": forbidden_changes,
        "pass": len(migration_changes) == 0
        and len(new_dirs) == 0
        and not deleted_dirs
        and not forbidden_changes,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "modified": out["preexisting_migration_sql_modified"], "new_dirs": new_dirs}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
