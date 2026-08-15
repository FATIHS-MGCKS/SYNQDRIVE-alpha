#!/usr/bin/env python3
"""Build CI-R3B1H.1.1 final validation summary."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_constants import BASE_R3B1H1_SHA, DATA, R3B1H111_BRANCH, evidence_input_sha

OUT = DATA / "ci-r3b1h111-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.is_file() else {}


def main() -> int:
    matrix = load("ci-r3b1h111-insert-select-dependency-matrix-2026-08.json")
    mig249 = load("ci-r3b1h111-migration249-reconciliation-2026-08.json")
    lineage = load("ci-r3b1h111-lineage-coverage-validation-2026-08.json")
    actionable = load("ci-r3b1h111-actionable-gap-coverage-2026-08.json")
    contracts = load("ci-r3b1h111-contract-validation-summary-2026-08.json")
    proof = load("ci-r3b1h111-targeted-consumer-proof-2026-08.json")
    completion = load("ci-r3b1h111-completion-gate-tests-2026-08.json")
    golden = load("ci-r3b1h111-golden-tests-2026-08.json")
    immut = load("ci-r3b1h111-immutability-audit-2026-08.json")
    replay = load("ci-r3b1h111-pre249-replay-state-2026-08.json")
    cache_scan = load("ci-r3b1h111-cache-discipline-2026-08.json")

    mt = matrix.get("classification_totals", {})
    gates = {
        "migration249_reconciliation": mig249.get("pass") is True and mig249.get("reconciliation_mismatches", 1) == 0,
        "unresolved_zero": mt.get("UNRESOLVED", 1) == 0,
        "physical_alias_leakage_zero": lineage.get("physical_alias_leakage", 1) == 0,
        "derived_lineage_gaps_zero": lineage.get("derived_lineage_gaps", 1) == 0,
        "qualified_reference_coverage_gaps_zero": lineage.get("qualified_reference_coverage_gaps", 1) == 0,
        "uncontracted_gaps_zero": actionable.get("uncontracted_gaps", 1) == 0,
        "invalid_contracts_zero": actionable.get("invalid_contracts", 1) == 0,
        "unproven_gaps_zero": actionable.get("unproven_gaps", 1) == 0,
        "negative_uncontracted_test": completion.get("negative_uncontracted_gap_test") is True,
        "negative_unproven_test": completion.get("negative_unproven_gap_test") is True,
        "positive_multi_gap_test": completion.get("positive_multi_gap_test") is True,
        "generic_contracts_valid": contracts.get("pass") is True,
        "targeted_proof_pass": proof.get("pass") is True,
        "golden_tests_pass": golden.get("pass") is True,
        "immutability_pass": immut.get("pass") is True,
        "pre249_replay_pass": replay.get("pass") is True,
        "cache_discipline_pass": cache_scan.get("pass") is True,
    }
    all_pass = all(gates.values())

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "branch": R3B1H111_BRANCH,
        "BASE_R3B1H1_SHA": BASE_R3B1H1_SHA,
        "evidence_input_sha": matrix.get("evidence_input_sha") or evidence_input_sha(),
        "migrations_scanned": matrix.get("audit_scope", {}).get("migrations_scanned"),
        "dependency_records": len(matrix.get("records", [])),
        "classification_totals": mt,
        "migration249_reconciliation": {
            "total": mig249.get("old_records_total", 0),
            "matched": mig249.get("accounted", 0),
            "mismatches": mig249.get("reconciliation_mismatches", 0),
        },
        "physical_alias_leakage": lineage.get("physical_alias_leakage", 0),
        "derived_lineage_gaps": lineage.get("derived_lineage_gaps", 0),
        "qualified_reference_coverage_gaps": lineage.get("qualified_reference_coverage_gaps", 0),
        "blocking_dependency_records": actionable.get("blocking_dependency_records", 0),
        "unique_actionable_gaps": actionable.get("unique_actionable_gaps", 0),
        "contracts": contracts.get("exact_contracts", 0),
        "uncontracted_gaps": actionable.get("uncontracted_gaps", 0),
        "invalid_contracts": actionable.get("invalid_contracts", 0),
        "targeted_proofs": actionable.get("targeted_proofs", 0),
        "unproven_gaps": actionable.get("unproven_gaps", 0),
        "negative_uncontracted_gap_test": completion.get("negative_uncontracted_gap_test"),
        "negative_unproven_gap_test": completion.get("negative_unproven_gap_test"),
        "positive_multi_gap_test": completion.get("positive_multi_gap_test"),
        "permissions_proof": proof.get("pass"),
        "synthetic_iam_proof": proof.get("synthetic_fixture_pass"),
        "migration_changes": immut.get("preexisting_migration_sql_modified", 0),
        "new_migration_dirs": immut.get("new_prisma_migration_directories", 0),
        "cache_artifacts": cache_scan.get("tracked_cache_files", 0),
        "gates": gates,
        "final_status": "CI_R3B1H111_EVIDENCE_GENERIC_CONTRACT_GATE_CLOSURE_COMPLETED"
        if all_pass
        else "CI_R3B1H111_EVIDENCE_GENERIC_CONTRACT_GATE_CLOSURE_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"], "gates": gates}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
