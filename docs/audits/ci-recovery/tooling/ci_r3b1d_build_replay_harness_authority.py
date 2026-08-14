#!/usr/bin/env python3
"""Build CI-R3B1D replay harness authority and transaction-sensitive inventory."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1c_special_composite_index import build_authority  # noqa: E402
from replay_evidence_lib import (  # noqa: E402
    DATA,
    REPO,
    audit_transaction_sensitive_migrations,
    replay_input_manifest_files,
    replay_input_manifest_sha256,
    replay_provenance,
    special_migration_hash_status,
    REPLAY_INPUT_MANIFEST_HASH_EXCLUDE,
)

OUT_HARNESS = DATA / "ci-r3b1d-replay-harness-authority-2026-08.json"
OUT_INVENTORY = DATA / "ci-r3b1d-transaction-sensitive-migration-inventory-2026-08.json"
PRE_R3B1D_SHA = "9583d04f5d331f41e2b0e17a9cad3782062860d3"


def git_head() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()


def main() -> int:
    special_auth = build_authority()
    hash_status = special_migration_hash_status()
    inventory = audit_transaction_sensitive_migrations()
    provenance = replay_provenance()
    manifest_files = replay_input_manifest_files()

    harness = {
        "schema_version": 1,
        "phase": "CI-R3B1D",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "PRE_R3B1D_SHA": PRE_R3B1D_SHA,
        "BASE_COMMIT_SHA": provenance["BASE_COMMIT_SHA"],
        "BASE_GIT_TREE_SHA": provenance["BASE_GIT_TREE_SHA"],
        "working_tree_clean_at_generation": provenance["working_tree_clean_at_replay_start"],
        "provenance_model": "working_tree_byte_manifest",
        "provenance_note": (
            "REPLAY_INPUT_MANIFEST_SHA256 hashes actual working-tree bytes of every replay-affecting file; "
            "BASE_GIT_TREE_SHA alone does not identify uncommitted tooling changes."
        ),
        "special_migration": hash_status["migration"],
        "accepted_immutable_sha256": hash_status["accepted_sha256"],
        "observed_sha256": hash_status["observed_sha256"],
        "sha256_match": hash_status["match"],
        "self_authorization_forbidden": True,
        "replay_input_files": manifest_files,
        "replay_input_manifest_hash_excludes": sorted(REPLAY_INPUT_MANIFEST_HASH_EXCLUDE),
        "replay_input_file_count": len(manifest_files),
        "REPLAY_INPUT_MANIFEST_SHA256": replay_input_manifest_sha256(),
        "transaction_sensitive_scan": {
            "migrations_scanned": inventory["migrations_scanned"],
            "transaction_sensitive_statements": inventory["transaction_sensitive_statements"],
            "special_execution_required_migrations": inventory["special_execution_required_migrations"],
            "unresolved_count": inventory["unresolved_count"],
        },
        "special_replay_authority": special_auth,
    }

    OUT_HARNESS.parent.mkdir(parents=True, exist_ok=True)
    OUT_HARNESS.write_text(json.dumps(harness, indent=2) + "\n")
    OUT_INVENTORY.write_text(json.dumps(inventory, indent=2) + "\n")

    print(json.dumps(
        {
            "harness_path": str(OUT_HARNESS.relative_to(REPO)),
            "inventory_path": str(OUT_INVENTORY.relative_to(REPO)),
            "sha256_match": hash_status["match"],
            "manifest_sha256": harness["REPLAY_INPUT_MANIFEST_SHA256"],
            "unresolved": inventory["unresolved_count"],
            "special_migrations": inventory["special_execution_required_migrations"],
        },
        indent=2,
    ))
    return 0 if hash_status["match"] and inventory["unresolved_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
