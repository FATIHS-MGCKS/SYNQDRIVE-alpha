#!/usr/bin/env python3
"""Write stable input provenance for CI-R3B1I (no self-referential final commit SHA)."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from ci_r3b1i_constants import (
    ACCEPTED_CONTRACT,
    BASE_R3B1H111_SHA,
    DATA,
    PARENT_BRANCH,
    R3B1I_BRANCH,
    REPO,
    evidence_input_sha,
    parent_branch_sha,
)

OUT = DATA / "ci-r3b1i-input-provenance-2026-08.json"
AUTHORITY_FILES = [
    DATA / "ci-r3b1h111-exact-predecessor-contracts-2026-08.json",
    DATA / "ci-r3b1h111-targeted-consumer-proof-2026-08.json",
    DATA / "ci-r3b1h111-final-validation-summary-2026-08.json",
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    authority = {}
    for path in AUTHORITY_FILES:
        authority[path.name] = sha256_file(path) if path.is_file() else None
    base_main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=REPO, text=True).strip()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "branch": R3B1I_BRANCH,
        "parent_branch": PARENT_BRANCH,
        "evidence_input_sha": evidence_input_sha(),
        "parent_branch_sha": parent_branch_sha(),
        "base_main_sha": base_main,
        "authority_source_sha": authority,
        "accepted_contract": ACCEPTED_CONTRACT,
        "provenance_model": "input_only_no_self_referential_final_commit_sha",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"evidence_input_sha": out["evidence_input_sha"], "parent_branch_sha": out["parent_branch_sha"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
