"""Evidence vs code cross-validation for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any

from ci_r3b1n2_constants import DATA, sha256_file

TOOLING = Path(__file__).resolve().parent

PRODUCER_MANIFEST = [
    {"artifact": "ci-r3b1o4-corrective-final-m252-exact-parity-2026-08.json", "module": "ci_r3b1o4_m252_exact_parity", "function": "run_m252_exact_parity"},
    {"artifact": "ci-r3b1o4-corrective-full-catalog-delta-authority-2026-08.json", "module": "ci_r3b1o4_full_catalog_delta", "function": "build_full_catalog_delta_authority"},
    {"artifact": "ci-r3b1o4-corrective-t2-stale-index-drop-safety-2026-08.json", "module": "ci_r3b1o4_t2_stale_index_safety", "function": "evaluate_t2_stale_index_drop_safety"},
    {"artifact": "ci-r3b1o4-corrective-second-deploy-idempotency-2026-08.json", "module": "ci_r3b1o4_final_twin", "function": "run_tail_reconciliation_strategy"},
    {"artifact": "ci-r3b1o4-corrective-golden-tests-2026-08.json", "module": "ci_r3b1o4_golden_tests", "function": "run_golden_tests"},
]

M252_COMPARATOR_PROPERTIES = [
    "columns",
    "primary_key",
    "unique_index.keys",
    "unique_index.include_columns",
    "unique_index.collation",
    "unique_index.opclass",
    "unique_index.sort_direction",
    "unique_index.nulls_ordering",
    "composite_index.keys",
    "composite_index.include_columns",
    "foreign_keys",
]


def _module_sha(module_name: str) -> str | None:
    path = TOOLING / f"{module_name}.py"
    return sha256_file(path) if path.exists() else None


def _function_source_sha(module_name: str, function_name: str) -> str | None:
    mod = __import__(module_name, fromlist=[function_name])
    fn = getattr(mod, function_name, None)
    if fn is None:
        return None
    return sha256_file(Path(inspect.getsourcefile(fn) or ""))


def build_evidence_code_crossvalidation(*, pre_hashes: dict[str, str], post_hashes: dict[str, str], golden_results: dict[str, Any], golden_coverage: dict[str, Any]) -> dict[str, Any]:
    producers = []
    producer_hash_mismatches = 0
    for row in PRODUCER_MANIFEST:
        module_file = f"{row['module']}.py"
        pre = pre_hashes.get(module_file)
        post = post_hashes.get(module_file)
        mismatch = pre != post
        if mismatch:
            producer_hash_mismatches += 1
        producers.append({**row, "pre_run_sha256": pre, "post_run_sha256": post, "hash_stable": not mismatch})

    executed_ids = {t["test_id"] for t in golden_results.get("tests", [])}
    coverage_ids = {r["required_test_id"] for r in golden_coverage.get("coverage_rows", [])}
    missing_in_executed = sorted(coverage_ids - executed_ids)
    missing_in_coverage = sorted(executed_ids - coverage_ids)

    m252_source = (TOOLING / "ci_r3b1o4_m252_exact_parity.py").read_text()
    reader_props = [p for p in M252_COMPARATOR_PROPERTIES if p.split(".")[0] in m252_source]
    missing_reader = [p for p in M252_COMPARATOR_PROPERTIES if p.split(".")[0] not in m252_source]
    missing_comparator = [p for p in ["include_columns", "collation", "opclass", "sort_direction", "nulls_ordering"] if p not in m252_source]
    missing_tests = [p for p in ["m252_wrong_include", "m252_wrong_collation", "m252_wrong_opclass", "m252_wrong_sort_direction", "m252_wrong_null_ordering"] if p not in executed_ids]

    evidence_code_mismatch_count = (
        producer_hash_mismatches
        + len(missing_in_executed)
        + len(missing_in_coverage)
        + len(missing_reader)
        + len(missing_comparator)
        + len(missing_tests)
    )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-corrective",
        "producers": producers,
        "claimed_properties": M252_COMPARATOR_PROPERTIES,
        "implemented_reader_properties": reader_props,
        "implemented_comparator_properties": [p for p in M252_COMPARATOR_PROPERTIES if p not in missing_comparator],
        "covered_test_properties": [p for p in ["m252_wrong_include", "m252_wrong_collation", "m252_wrong_opclass", "m252_wrong_sort_direction", "m252_wrong_null_ordering"] if p in executed_ids],
        "missing_reader_properties": missing_reader,
        "missing_comparator_properties": missing_comparator,
        "required_missing_test_coverage": missing_tests,
        "producer_hash_mismatches": producer_hash_mismatches,
        "test_definition_mismatches": len(missing_in_executed) + len(missing_in_coverage),
        "evidence_code_mismatch_count": evidence_code_mismatch_count,
        "pass": evidence_code_mismatch_count == 0,
    }


def write_evidence_code_crossvalidation(payload: dict[str, Any]) -> None:
    (DATA / "ci-r3b1o4-corrective-evidence-code-crossvalidation-2026-08.json").write_text(json.dumps(payload, indent=2) + "\n")
