#!/usr/bin/env python3
"""Write post-commit provenance artifact (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from ci_r3b1h111_constants import DATA, R3B1H111_BRANCH, REPO

OUT = DATA / "ci-r3b1h111-post-commit-provenance-2026-08.json"


def main() -> int:
    base_main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=REPO, text=True).strip()
    local_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    remote_head = subprocess.check_output(
        ["git", "rev-parse", f"origin/{R3B1H111_BRANCH}"], cwd=REPO, text=True
    ).strip()
    draft_pr_head = sys.argv[1] if len(sys.argv) > 1 else remote_head
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "branch": R3B1H111_BRANCH,
        "final_commit_sha": local_head,
        "remote_branch_sha": remote_head,
        "draft_pr_head_sha": draft_pr_head,
        "base_main_sha": base_main,
        "all_final_heads_equal": local_head == remote_head == draft_pr_head,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"all_equal": out["all_final_heads_equal"], "sha": local_head}, indent=2))
    return 0 if out["all_final_heads_equal"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
