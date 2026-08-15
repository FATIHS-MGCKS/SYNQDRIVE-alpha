#!/usr/bin/env python3
"""Python cache discipline scan (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from ci_r3b1h111_constants import DATA, REPO

OUT = DATA / "ci-r3b1h111-cache-discipline-2026-08.json"


def main() -> int:
    tracked = subprocess.check_output(["git", "ls-files"], cwd=REPO, text=True).splitlines()
    tracked_cache = [p for p in tracked if "__pycache__/" in p or p.endswith((".pyc", ".pyo", ".pyd"))]
    find_dirs = subprocess.check_output(
        ["find", "docs/audits/ci-recovery", "-type", "d", "-name", "__pycache__"],
        cwd=REPO,
        text=True,
    ).strip().splitlines()
    find_dirs = [x for x in find_dirs if x]
    find_files = subprocess.check_output(
        ["find", "docs/audits/ci-recovery", "-type", "f", "-name", "*.py[co]"],
        cwd=REPO,
        text=True,
    ).strip().splitlines()
    find_files = [x for x in find_files if x]
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "tracked_cache_files": len(tracked_cache),
        "tracked_cache_paths": tracked_cache,
        "untracked_cache_dirs": len(find_dirs),
        "untracked_cache_files": len(find_files),
        "pass": len(tracked_cache) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "tracked_cache_files": out["tracked_cache_files"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
