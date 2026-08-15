"""Test source hash manifest for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

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

CORRECTIVE_SOURCE_FILES = [
    "ci_r3b1o4_m252_exact_parity.py",
    "ci_r3b1o4_full_catalog_delta.py",
    "ci_r3b1o4_catalog_inventory.py",
    "ci_r3b1o4_t2_stale_index_safety.py",
    "ci_r3b1o4_final_twin.py",
    "ci_r3b1o4_evidence_crossvalidation.py",
    "ci_r3b1o4_golden_tests.py",
    "ci_r3b1o4_terminal_gate.py",
    "ci_r3b1o4_run_corrective_audit.py",
]

FINAL_CORRECTIVE_SOURCE_FILES = [
    "ci_r3b1o4_m252_exact_parity.py",
    "ci_r3b1o4_catalog_authority.py",
    "ci_r3b1o4_catalog_inventory.py",
    "ci_r3b1o4_execution_set.py",
    "ci_r3b1o4_expected_catalog_effects.py",
    "ci_r3b1o4_implicit_catalog_effects.py",
    "ci_r3b1o4_catalog_engine_crossvalidation.py",
    "ci_r3b1o4_t2_stale_index_safety.py",
    "ci_r3b1o4_final_twin.py",
    "ci_r3b1o4_evidence_crossvalidation.py",
    "ci_r3b1o4_golden_tests.py",
    "ci_r3b1o4_terminal_gate.py",
    "ci_r3b1o4_run_final_corrective_audit.py",
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
        "pass": all(e["exists"] and e["sha256"] for e in entries),
    }


def write_test_source_hash_manifest() -> dict:
    manifest = build_test_source_hash_manifest()
    (DATA / "ci-r3b1o4-test-source-hash-manifest-2026-08.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def build_corrective_test_source_hash_manifest() -> dict[str, str]:
    return {name: sha256_file(TOOLING / name) for name in CORRECTIVE_SOURCE_FILES if (TOOLING / name).exists()}


def write_corrective_test_source_hash_manifest(manifest: dict[str, str]) -> dict:
    payload = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-corrective",
        "entries": [{"source_file": k, "sha256": v} for k, v in sorted(manifest.items())],
        "pass": all(manifest.values()),
    }
    (DATA / "ci-r3b1o4-corrective-test-source-hash-manifest-2026-08.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def build_final_corrective_test_source_hash_manifest() -> dict[str, str]:
    return {name: sha256_file(TOOLING / name) for name in FINAL_CORRECTIVE_SOURCE_FILES if (TOOLING / name).exists()}


def write_final_corrective_test_source_hash_manifest(manifest: dict[str, str]) -> dict:
    payload = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "entries": [{"source_file": k, "sha256": v} for k, v in sorted(manifest.items())],
        "pass": all(manifest.values()),
    }
    (DATA / "ci-r3b1o4-final-corrective-test-source-hash-manifest-2026-08.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload
