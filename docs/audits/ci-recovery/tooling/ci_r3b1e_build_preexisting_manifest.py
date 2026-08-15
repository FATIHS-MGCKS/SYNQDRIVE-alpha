#!/usr/bin/env python3
"""Freeze pre-R3B1E migration.sql SHA-256 manifest."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from ci_r3b1e_constants import BASE_R3B1D12_SHA, DATA, MIG_ROOT, REPO, R3B1B_REPAIR_MIGRATIONS

OUT = DATA / "ci-r3b1e-preexisting-migration-sha-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    files = manifest_at_rev(BASE_R3B1D12_SHA)
    r3b1b = {m: files.get(f"backend/prisma/migrations/{m}/migration.sql") for m in R3B1B_REPAIR_MIGRATIONS}
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1E",
        "baseline_sha": BASE_R3B1D12_SHA,
        "migration_count": len(files),
        "files": files,
        "r3b1b_repair_hashes": r3b1b,
        "pass": all(r3b1b.values()),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"migration_count": len(files), "pass": out["pass"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
