#!/usr/bin/env python3
"""Build CI-R3B1F.1.1 final validation summary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_constants import (
    DATA,
    FALSE_POSITIVE_MODEL,
    PREVIOUS_PRIMARY_DEFECTS,
    PREVIOUS_R3B1F1_DEFECT_RECORDS,
    PREVIOUS_R3B1F1_MISSING_HISTORY,
    PREVIOUS_R3B1F1_ORDERING_DEFECT,
)

OUT = DATA / "ci-r3b1f111-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    matrix = load("ci-r3b1f111-expression-aware-dependency-matrix-2026-08.json")
    reconciliation = load("ci-r3b1f111-defect-reconciliation-2026-08.json")
    contracts_doc = load("ci-r3b1f111-exact-predecessor-contracts-2026-08.json")
    contract_validation = load("ci-r3b1f111-contract-validation-summary-2026-08.json")
    coverage = load("ci-r3b1f111-expression-coverage-validation-2026-08.json")
    proof = load("ci-r3b1f111-targeted-consumer-proof-2026-08.json")
    immutability = load("ci-r3b1f111-immutability-audit-2026-08.json")
    pre157 = load("ci-r3b1f111-pre157-replay-state-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    expr_records = [
        r for r in matrix["records"] if r.get("dependency_context") not in {None, "COLUMN_REFERENCE"}
    ]
    totals = matrix["classification_totals"]
    unresolved = totals.get("UNRESOLVED", 0)
    genuine_gaps = matrix.get("corrected_genuine_gaps", 0)
    actionable = totals.get("MISSING_HISTORY", 0) + totals.get("ORDERING_DEFECT", 0) + unresolved
    proofs = proof.get("proofs", [])
    compiled = contracts_doc.get("compiled", [])
    strict_no_if_not_exists = all("IF NOT EXISTS" not in row.get("compiled_sql", "").upper() for row in compiled)

    all_pass = (
        pre157.get("pass")
        and proof.get("pass")
        and coverage.get("pass")
        and immutability.get("pass")
        and contract_validation.get("pass")
        and reconciliation.get("pass")
        and reconciliation.get("accounted") == PREVIOUS_R3B1F1_DEFECT_RECORDS
        and unresolved == 0
        and totals.get("ORDERING_DEFECT", 0) == 0
        and genuine_gaps == 1
        and actionable == 1
        and contract_validation.get("invalid_types", 1) == 0
        and contract_validation.get("unresolved_dependencies", 1) == 0
        and strict_no_if_not_exists
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1.1",
        "HEAD_SHA": head,
        "migrations_scanned": matrix["audit_scope"]["migrations_scanned"],
        "dependency_records": matrix["audit_scope"]["dependency_checks_generated"],
        "expression_records": len(expr_records),
        "previous_missing_history": PREVIOUS_R3B1F1_MISSING_HISTORY,
        "previous_ordering_defect": PREVIOUS_R3B1F1_ORDERING_DEFECT,
        "previous_records_reconciled": reconciliation.get("accounted"),
        "classification_totals": totals,
        "VALID": totals.get("VALID", 0),
        "MISSING_HISTORY": totals.get("MISSING_HISTORY", 0),
        "ORDERING_DEFECT": totals.get("ORDERING_DEFECT", 0),
        "CONDITIONAL_SAFE": totals.get("CONDITIONAL_SAFE", 0),
        "FALSE_POSITIVE": totals.get("FALSE_POSITIVE", 0),
        "INTENTIONAL": totals.get("INTENTIONAL", 0),
        "UNRESOLVED": unresolved,
        "actionable_genuine_gaps": actionable,
        "corrected_genuine_gaps": genuine_gaps,
        "exact_contracts": len(contracts_doc.get("contracts", [])),
        "targeted_repair_proofs": len(proofs),
        "targeted_consumer_pass": sum(1 for p in proofs if p.get("pass")),
        "targeted_consumer_fail": sum(1 for p in proofs if not p.get("pass")),
        "expression_coverage_gaps": coverage.get("expression_coverage_gaps"),
        "false_positive_model": FALSE_POSITIVE_MODEL,
        "strict_add_column_no_if_not_exists": strict_no_if_not_exists,
        "previous_accepted_defects": PREVIOUS_PRIMARY_DEFECTS,
        "new_confirmed_unique_defects": genuine_gaps,
        "revised_confirmed_total": PREVIOUS_PRIMARY_DEFECTS + genuine_gaps,
        "pre157_replay_pass": pre157.get("pass"),
        "immutability_pass": immutability.get("pass"),
        "final_status": "CI_R3B1F111_SQL_SCOPE_CLASSIFICATION_CLOSURE_COMPLETED"
        if all_pass
        else "CI_R3B1F111_SQL_SCOPE_CLASSIFICATION_CLOSURE_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"], "actionable": actionable}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
