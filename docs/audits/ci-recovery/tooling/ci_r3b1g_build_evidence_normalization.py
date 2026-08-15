#!/usr/bin/env python3
"""Normalize R3B1F.1.1 evidence metadata for R3B1G successor tooling."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from ci_r3b1g_constants import BASE_R3B1F111_SHA, DATA, FINAL_SUMMARY_PATH, R3B1F111_BRANCH, REPO

OUT = DATA / "ci-r3b1g-r3b1f111-evidence-normalization-2026-08.json"


def git_scope_audit() -> dict:
    status = subprocess.run(["git", "status", "--short"], cwd=REPO, capture_output=True, text=True)
    lines = [ln for ln in status.stdout.splitlines() if ln.strip()]
    allowed_prefixes = (
        "?? backend/prisma/migrations/",
        "?? docs/audits/ci-recovery/",
        " M docs/audits/ci-recovery/",
        "A  docs/audits/ci-recovery/",
        " M backend/prisma/migrations/",
        "A  backend/prisma/migrations/",
        "?? backend/prisma/migrations/",
    )
    disallowed = []
    for line in lines:
        path = line[3:].strip() if len(line) > 3 else line.strip()
        if path.endswith("__pycache__/") or "/__pycache__/" in path:
            continue
        if any(line.startswith(p) or path.startswith(p.replace("?? ", "").replace(" M ", "").replace("A  ", "")) for p in allowed_prefixes):
            continue
        if line.startswith("?? docs/audits/ci-recovery/") or line.startswith(" M docs/audits/ci-recovery/"):
            continue
        if line.startswith("?? backend/prisma/migrations/") or line.startswith(" M backend/prisma/migrations/") or line.startswith("A  backend/prisma/migrations/"):
            continue
        disallowed.append(line)
    return {
        "working_tree_lines": lines,
        "disallowed_lines": disallowed,
        "allowed_docs_and_new_migration_only": len(disallowed) == 0,
    }


def main() -> int:
    remote_head = subprocess.check_output(
        ["git", "rev-parse", f"origin/{R3B1F111_BRANCH}"],
        cwd=REPO,
        text=True,
    ).strip()
    local_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    summary = json.loads(FINAL_SUMMARY_PATH.read_text()) if FINAL_SUMMARY_PATH.exists() else {}
    stale_head = summary.get("HEAD_SHA")
    scope = git_scope_audit()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1G",
        "R3B1F111_REMOTE_HEAD": remote_head,
        "R3B1F111_DRAFT_PR": "#1033",
        "LOCAL_HEAD": local_head,
        "stale_summary_HEAD_SHA": stale_head,
        "stale_head_note": "Historical artifact recorded pre-push SHA; successor phases use resolved remote HEAD."
        if stale_head and stale_head != remote_head
        else None,
        "scope_audit": scope,
        "verified_inputs": {
            "final_summary_exists": FINAL_SUMMARY_PATH.exists(),
            "MISSING_HISTORY": summary.get("MISSING_HISTORY"),
            "ORDERING_DEFECT": summary.get("ORDERING_DEFECT"),
            "UNRESOLVED": summary.get("UNRESOLVED"),
        },
        "pass": summary.get("MISSING_HISTORY") == 1
        and summary.get("ORDERING_DEFECT") == 0
        and summary.get("UNRESOLVED") == 0
        and summary.get("final_status") == "CI_R3B1F111_SQL_SCOPE_CLASSIFICATION_CLOSURE_COMPLETED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "remote_head": remote_head}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
