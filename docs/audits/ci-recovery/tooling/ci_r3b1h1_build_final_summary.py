#!/usr/bin/env python3
"""Build CI-R3B1H.1 final validation summary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import BASE_R3B1H_SHA, DATA, FIRST_SCANNED, R3B1H1_BRANCH, REPO

OUT = DATA / "ci-r3b1h1-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.is_file() else {}


def main() -> int:
    matrix = load("ci-r3b1h1-insert-select-dependency-matrix-2026-08.json")
    old_recon = load("ci-r3b1h1-old-missing-history-reconciliation-2026-08.json")
    mig249_recon = load("ci-r3b1h1-migration249-gap-reconciliation-2026-08.json")
    contracts = load("ci-r3b1h1-exact-predecessor-contracts-2026-08.json")
    contract_val = load("ci-r3b1h1-contract-validation-summary-2026-08.json")
    proof = load("ci-r3b1h1-targeted-consumer-proof-2026-08.json")
    coverage = load("ci-r3b1h1-insert-select-coverage-validation-2026-08.json")
    lineage = load("ci-r3b1h1-lineage-coverage-validation-2026-08.json")
    actionable = load("ci-r3b1h1-actionable-gap-coverage-2026-08.json")
    golden = load("ci-r3b1h1-insert-select-golden-tests-2026-08.json")
    immut = load("ci-r3b1h1-immutability-audit-2026-08.json")
    replay = load("ci-r3b1h1-pre249-replay-state-2026-08.json")

    mt = matrix.get("classification_totals", {})
    gaps = matrix.get("unique_actionable_gaps", [])
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()

    gates = {
        "old_90_accounted": old_recon.get("pass") is True and old_recon.get("old_missing_history_records") == 90,
        "migration_249_reconciled_4_4": mig249_recon.get("pass") is True,
        "unresolved_zero": mt.get("UNRESOLVED", 1) == 0,
        "alias_leakage_zero": lineage.get("alias_leakage", 1) == 0,
        "lineage_coverage_gaps_zero": lineage.get("lineage_coverage_gaps", 1) == 0,
        "generic_contracts_valid": contract_val.get("pass") is True,
        "uncontracted_gaps_zero": actionable.get("uncontracted_gaps", 1) == 0,
        "unproven_gaps_zero": actionable.get("unproven_gaps", 1) == 0,
        "targeted_proof_pass": proof.get("pass") is True,
        "coverage_gaps_zero": coverage.get("coverage_gaps", 1) == 0,
        "golden_tests_pass": golden.get("pass") is True,
        "immutability_pass": immut.get("pass") is True,
        "pre249_replay_pass": replay.get("pass") is True,
    }
    all_pass = all(gates.values())

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "branch": R3B1H1_BRANCH,
        "HEAD_SHA": head,
        "BASE_R3B1H_SHA": BASE_R3B1H_SHA,
        "migrations_scanned": matrix.get("audit_scope", {}).get("migrations_scanned"),
        "dependency_records": len(matrix.get("records", [])),
        "old_missing_history_records": old_recon.get("old_missing_history_records", 90),
        "old_records_accounted": old_recon.get("accounted", 0),
        "classification_totals": mt,
        "alias_leakage": lineage.get("alias_leakage", 0),
        "lineage_coverage_gaps": lineage.get("lineage_coverage_gaps", 0),
        "blocking_dependency_records": actionable.get("blocking_dependency_records", 0),
        "unique_actionable_gaps": len(gaps),
        "exact_contracts": len(contracts.get("contracts", [])),
        "uncontracted_gaps": actionable.get("uncontracted_gaps", 0),
        "targeted_proofs": len(proof.get("gap_proofs", [])),
        "unproven_gaps": actionable.get("unproven_gaps", 0),
        "generic_contract_builder_status": "PASS" if contract_val.get("pass") else "FAIL",
        "migration_249_proof": proof.get("proof_database", {}).get("migration_249_execution"),
        "synthetic_iam_proof": "PASS" if proof.get("synthetic_fixture_pass") else "FAIL",
        "immutability": {
            "existing_migration_sql_changed": immut.get("preexisting_migration_sql_modified", 0),
            "new_prisma_migrations": immut.get("new_prisma_migration_directories", 0),
            "schema_prisma_changed": immut.get("schema_prisma_changed"),
            "runtime_changed": immut.get("runtime_code_changed"),
        },
        "sweep_249_to_head": {
            "first_migration": FIRST_SCANNED,
            "classification_totals": mt,
        },
        "root_cause_summary": old_recon.get("root_cause_summary", {}),
        "gates": gates,
        "final_status": "CI_R3B1H1_INSERT_SELECT_LINEAGE_ACTIONABLE_GAP_CLOSURE_COMPLETED"
        if all_pass
        else "CI_R3B1H1_INSERT_SELECT_LINEAGE_ACTIONABLE_GAP_CLOSURE_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"], "gates": gates}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
