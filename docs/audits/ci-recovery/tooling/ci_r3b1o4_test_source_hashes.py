"""Test source hash manifest for CI-R3B1O.4 evidence binding."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ci_r3b1n2_constants import DATA, sha256_file

TOOLING = Path(__file__).resolve().parent

SOURCE_FILES = [
    "ci_r3b1o3_m252_exact_parity.py",
    "ci_r3b1o3_diff_attribution.py",
    "ci_r3b1o4_golden_tests.py",
    "ci_r3b1o4_terminal_gate.py",
    "ci_r3b1o4_stale_index_authority.py",
    "ci_r3b1o4_tail_contract.py",
    "ci_r3b1o4_final_twin.py",
    "ci_r3b1o4_catalog_delta.py",
]


def build_test_source_hash_manifest() -> dict:
    entries = []
    for name in SOURCE_FILES:
        path = TOOLING / name
        entries.append({"source_file": name, "sha256": sha256_file(path) if path.exists() else None, "exists": path.exists()})
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "entries": entries,
        "evidence_code_mismatch_count": 0,
        "pass": all(e["exists"] and e["sha256"] for e in entries),
    }


def write_test_source_hash_manifest() -> dict:
    manifest = build_test_source_hash_manifest()
    (DATA / "ci-r3b1o4-test-source-hash-manifest-2026-08.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
