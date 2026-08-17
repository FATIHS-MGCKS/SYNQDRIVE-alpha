#!/usr/bin/env python3
"""Freeze pre-R3B1G migration.sql SHA-256 manifest from R3B1F.1.1 base."""
from __future__ import annotations

import hashlib
import json
import subprocess

from ci_r3b1g_constants import BASE_R3B1F111_SHA, DATA, REPO, R3B1B_REPAIR_MIGRATIONS, R3B1E_REPAIR_MIGRATIONS

OUT = DATA / "ci-r3b1g-preexisting-migration-sha-manifest-2026-08.json"


def manifest_at_rev(rev: str) -> dict[str, str]:
    out: dict[str, str] = {}
    paths = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", rev, "backend/prisma/migrations"],
        cwd=REPO,
        text=True,
    ).splitlines()
    for rel in paths:
        if rel.endswith("/migration.sql"):
            blob = subprocess.check_output(["git", "show", f"{rev}:{rel}"], cwd=REPO)
            out[rel] = hashlib.sha256(blob).hexdigest()
    return out


def main() -> int:
    files = manifest_at_rev(BASE_R3B1F111_SHA)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "baseline_sha": BASE_R3B1F111_SHA,
        "migration_count": len(files),
        "files": files,
        "r3b1b_repair_hashes": {
            m: files.get(f"backend/prisma/migrations/{m}/migration.sql") for m in R3B1B_REPAIR_MIGRATIONS
        },
        "r3b1e_repair_hashes": {
            m: files.get(f"backend/prisma/migrations/{m}/migration.sql") for m in R3B1E_REPAIR_MIGRATIONS
        },
        "slot13_hash": files.get(
            "backend/prisma/migrations/20260716182500_ci_r3b_post_vendor_predecessor_slot13/migration.sql"
        ),
        "migration_157_hash": files.get(
            "backend/prisma/migrations/20260716183000_tire_lifecycle_invariants/migration.sql"
        ),
        "pass": True,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"migration_count": len(files), "pass": True}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
