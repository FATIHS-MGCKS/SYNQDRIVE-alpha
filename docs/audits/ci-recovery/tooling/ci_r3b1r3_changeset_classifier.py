#!/usr/bin/env python3
"""R3B1R.3 PR changeset classifier with recovery/security/test-fixture buckets."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]

RECOVERY_SCRIPT_PREFIXES = (
    "backend/scripts/apply-m252-",
    "backend/scripts/history-bridge-",
    "backend/scripts/verify-history-bridge-",
    "backend/scripts/verify-m252-",
    "backend/scripts/sql/history-bridge-",
)


def classify_path(path: str) -> str:
    p = path.replace("\\", "/")
    lower = p.lower()
    if lower.startswith("backend/prisma/migrations/"):
        return "MIGRATION_HISTORY"
    if lower == "backend/prisma/schema.prisma":
        return "PRISMA_SCHEMA"
    if lower.startswith("docs/audits/"):
        return "AUDIT_EVIDENCE"
    if "tooling/" in lower or lower.startswith("docs/audits/ci-recovery/tooling/"):
        return "RECOVERY_TOOLING"
    if lower.startswith(".github/workflows/"):
        return "SECURITY_CI"
    if any(lower.startswith(prefix) for prefix in RECOVERY_SCRIPT_PREFIXES):
        return "RECOVERY_TOOLING"
    if lower.startswith("frontend/e2e/") and lower.endswith("-fixtures.ts"):
        return "TEST_FIXTURE"
    if "/test" in lower or lower.endswith(".spec.ts") or lower.endswith(".test.ts"):
        return "TESTS"
    if lower.endswith("package-lock.json") or lower.endswith("package.json"):
        return "DEPENDENCIES"
    if lower.startswith("scripts/audits/"):
        return "SECURITY_CI"
    if lower.startswith("backend/src/") or lower.startswith("frontend/src/"):
        return "APPLICATION_RUNTIME"
    return "OTHER"


def classify_pr_changeset(*, main_sha: str, pr_sha: str) -> dict[str, Any]:
    diff = subprocess.check_output(
        ["git", "-C", str(REPO), "diff", "--name-status", f"{main_sha}...{pr_sha}"],
        text=True,
    )
    buckets: dict[str, list[str]] = {
        "MIGRATION_HISTORY": [],
        "PRISMA_SCHEMA": [],
        "RECOVERY_TOOLING": [],
        "SECURITY_CI": [],
        "TEST_FIXTURE": [],
        "TESTS": [],
        "AUDIT_EVIDENCE": [],
        "APPLICATION_RUNTIME": [],
        "DEPENDENCIES": [],
        "OTHER": [],
    }
    secret = cache = 0
    file_dispositions: list[dict[str, Any]] = []
    for ln in diff.splitlines():
        if not ln.strip():
            continue
        status, path = ln.split("\t", 1)[0], ln.split("\t", 1)[1]
        p = path.lower()
        if "__pycache__" in p or p.endswith(".pyc"):
            cache += 1
            continue
        if ".env" in p and not p.endswith(".example"):
            secret += 1
        bucket = classify_path(path)
        buckets[bucket].append(path)
        if bucket == "OTHER":
            prov = subprocess.check_output(
                ["git", "-C", str(REPO), "log", "--oneline", f"{main_sha}..{pr_sha}", "--", path],
                text=True,
            ).strip().splitlines()
            file_dispositions.append(
                {
                    "path": path,
                    "status": status,
                    "bucket": bucket,
                    "commit_provenance": prov[:3],
                    "needed_in_final_pr": None,
                    "safe_to_revert": None,
                }
            )
    return {
        "buckets": {k: len(v) for k, v in buckets.items()},
        "bucket_paths": buckets,
        "true_unrelated_changes": len(buckets["OTHER"]),
        "pr_changeset_classification_consistent": len(buckets["OTHER"]) == 0,
        "accidental_generated_files": cache,
        "python_cache_files": cache,
        "secret_files": secret,
        "file_dispositions": file_dispositions,
    }
