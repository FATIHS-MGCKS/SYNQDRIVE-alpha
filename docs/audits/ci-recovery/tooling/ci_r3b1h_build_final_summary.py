#!/usr/bin/env python3
"""Build CI-R3B1H final validation summary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h_constants import (
    BASE_R3B1G_SHA,
    DATA,
    FIRST_SCANNED,
    IAM_CONSUMER,
    LAST_APPLIED_PRE249,
    MIG_249_ORDINAL,
    R3B1G_REPLAY,
    R3B1H_BRANCH,
)

OUT = DATA / "ci-r3b1h-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.is_file() else {}


def main() -> int:
    matrix = load("ci-r3b1h-insert-select-dependency-matrix-2026-08.json")
    gap = load("ci-r3b1h-iam-predecessor-gap-matrix-2026-08.json")
    contracts = load("ci-r3b1h-exact-iam-predecessor-contracts-2026-08.json")
    contract_val = load("ci-r3b1h-contract-validation-summary-2026-08.json")
    proof = load("ci-r3b1h-targeted-iam-consumer-proof-2026-08.json")
    coverage = load("ci-r3b1h-insert-select-coverage-validation-2026-08.json")
    golden = load("ci-r3b1h-insert-select-golden-tests-2026-08.json")
    immut = load("ci-r3b1h-immutability-audit-2026-08.json")
    replay = load("ci-r3b1h-pre249-replay-state-2026-08.json")
    r3b1g = load("ci-r3b1g-full-fresh-replay-result-2026-08.json")

    mt = matrix.get("classification_totals", {})
    gaps = matrix.get("unique_actionable_gaps", [])
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=DATA.parents[2], text=True).strip()

    gates = {
        "pre249_replay_pass": replay.get("pass") is True,
        "unresolved_zero": mt.get("UNRESOLVED", 1) == 0 and gap.get("UNRESOLVED", 1) == 0,
        "contracts_valid": contract_val.get("pass") is True,
        "targeted_proof_pass": proof.get("pass") is True,
        "coverage_gaps_zero": coverage.get("coverage_gaps", 1) == 0,
        "golden_tests_pass": golden.get("pass") is True,
        "immutability_pass": immut.get("pass") is True,
        "consumer_failures_zero": proof.get("targeted_consumer_failures", 1) == 0,
    }
    all_pass = all(gates.values())

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "branch": R3B1H_BRANCH,
        "HEAD_SHA": head,
        "BASE_R3B1G_SHA": BASE_R3B1G_SHA,
        "baseline": {
            "r3b1g_first_failed_migration": r3b1g.get("first_failed_migration"),
            "r3b1g_failure_ordinal": r3b1g.get("failure_ordinal"),
            "r3b1g_sqlstate": r3b1g.get("sqlstate"),
            "r3b1g_last_applied": r3b1g.get("last_applied_migration"),
            "r3b1g_tire_repair_pass": r3b1g.get("tire_runtime", {}).get("r3b1g_repair_applied") == "PASS",
            "migration_157_pass": r3b1g.get("tire_runtime", {}).get("migration_157_applied") == "PASS",
        },
        "pre249_boundary": {
            "stop_before": IAM_CONSUMER,
            "last_applied": LAST_APPLIED_PRE249,
            "ordinal": MIG_249_ORDINAL,
            "replay_pass": replay.get("pass"),
        },
        "insert_select_analyzer": {
            "root_cause": "INSERT ... SELECT source dependencies were not wired into check_statement_dependencies before R3B1H",
            "hardened": True,
            "golden_tests_pass": golden.get("pass"),
        },
        "sweep_249_to_head": {
            "first_migration": FIRST_SCANNED,
            "last_migration": matrix.get("audit_scope", {}).get("last_migration"),
            "migrations_scanned": matrix.get("audit_scope", {}).get("migrations_scanned"),
            "dependency_records": len(matrix.get("records", [])),
            "classification_totals": mt,
        },
        "migration_249_prerequisites": {
            "classification_totals": gap.get("classification_totals", {}),
            "permissions_proof": gap.get("organization_memberships_permissions_proof"),
        },
        "exact_repair_authority": {
            "unique_actionable_gaps": len(gaps),
            "exact_contracts": len(contracts.get("contracts", [])),
            "invalid_contracts": contract_val.get("invalid_types", 0),
            "missing_types": contract_val.get("missing_types", 0),
            "missing_boundaries": contract_val.get("missing_boundaries", 0),
        },
        "targeted_postgresql": {
            "proof_pass": proof.get("pass"),
            "consumer_failures": proof.get("targeted_consumer_failures"),
            "migration_249_execution": proof.get("proof_database", {}).get("migration_249_execution"),
            "synthetic_fixture_pass": proof.get("proof_database", {}).get("fixture", {}).get("seed_pass"),
        },
        "coverage": coverage,
        "immutability": {
            "existing_migration_sql_changed": immut.get("preexisting_migration_sql_modified", 0),
            "new_prisma_migrations": immut.get("new_prisma_migration_directories", 0),
            "schema_prisma_changed": immut.get("schema_prisma_changed"),
            "runtime_changed": immut.get("runtime_code_changed"),
        },
        "gates": gates,
        "final_status": "CI_R3B1H_IAM_INSERT_SELECT_PREDECESSOR_CLOSURE_COMPLETED"
        if all_pass
        else "CI_R3B1H_IAM_INSERT_SELECT_PREDECESSOR_CLOSURE_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"], "gates": gates}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
