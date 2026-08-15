#!/usr/bin/env python3
"""Build CI-R3B1F.1 final validation summary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f1_constants import DATA, PREVIOUS_PRIMARY_DEFECTS, PREVIOUS_R3B1F_CANDIDATES

OUT = DATA / "ci-r3b1f1-final-validation-summary-2026-08.json"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    matrix = load("ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json")
    reclass = load("ci-r3b1f1-defect-reclassification-2026-08.json")
    contracts_doc = load("ci-r3b1f1-exact-predecessor-contracts-2026-08.json")
    contract_validation = load("ci-r3b1f1-contract-validation-summary-2026-08.json")
    coverage = load("ci-r3b1f1-expression-coverage-validation-2026-08.json")
    proof = load("ci-r3b1f1-targeted-consumer-proof-2026-08.json")
    immutability = load("ci-r3b1f1-immutability-audit-2026-08.json")
    pre157 = load("ci-r3b1f1-pre157-replay-state-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    expr_records = [
        r for r in matrix["records"] if r.get("dependency_context") not in {None, "COLUMN_REFERENCE"}
    ]
    totals = matrix["classification_totals"]
    unresolved = totals.get("UNRESOLVED", 0)
    genuine_gaps = matrix.get("corrected_genuine_gaps", 0)
    proofs = proof.get("proofs", [])
    proof_pass = sum(1 for p in proofs if p.get("pass"))
    proof_fail = sum(1 for p in proofs if not p.get("pass"))

    all_pass = (
        pre157.get("pass")
        and proof.get("pass")
        and coverage.get("pass")
        and immutability.get("pass")
        and contract_validation.get("pass")
        and reclass.get("pass")
        and reclass.get("accounted") == PREVIOUS_R3B1F_CANDIDATES
        and unresolved == 0
        and contract_validation.get("invalid_types", 1) == 0
        and contract_validation.get("missing_types", 1) == 0
        and contract_validation.get("unresolved_dependencies", 1) == 0
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "HEAD_SHA": head,
        "migrations_scanned": matrix["audit_scope"]["migrations_scanned"],
        "dependency_records": matrix["audit_scope"]["dependency_checks_generated"],
        "expression_records": len(expr_records),
        "previous_r3b1f_candidates": PREVIOUS_R3B1F_CANDIDATES,
        "previous_candidates_accounted": reclass.get("accounted"),
        "classification_totals": totals,
        "VALID": totals.get("VALID", 0),
        "MISSING_HISTORY": totals.get("MISSING_HISTORY", 0),
        "ORDERING_DEFECT": totals.get("ORDERING_DEFECT", 0),
        "FALSE_POSITIVE": totals.get("FALSE_POSITIVE", 0),
        "INTENTIONAL": totals.get("INTENTIONAL", 0),
        "CONDITIONAL_SAFE": totals.get("CONDITIONAL_SAFE", 0),
        "UNRESOLVED": unresolved,
        "previous_r3b1f_candidate_gaps": PREVIOUS_R3B1F_CANDIDATES,
        "corrected_genuine_gaps": genuine_gaps,
        "false_positives_corrected": reclass.get("false_positives_corrected"),
        "contracts": len(contracts_doc.get("contracts", [])),
        "invalid_contracts": contract_validation.get("invalid_types", 0)
        + contract_validation.get("missing_types", 0)
        + contract_validation.get("invalid_nullability", 0),
        "targeted_repair_proofs": len(proofs),
        "targeted_consumer_pass": proof_pass,
        "targeted_consumer_fail": proof_fail,
        "expression_coverage_gaps": coverage.get("expression_coverage_gaps"),
        "previous_accepted_defects": PREVIOUS_PRIMARY_DEFECTS,
        "new_confirmed_unique_defects": genuine_gaps,
        "revised_confirmed_total": PREVIOUS_PRIMARY_DEFECTS + genuine_gaps,
        "pre157_replay_pass": pre157.get("pass"),
        "immutability_pass": immutability.get("pass"),
        "final_status": "CI_R3B1F1_CREATOR_CHRONOLOGY_CONTRACT_HARDENING_COMPLETED"
        if all_pass
        else "CI_R3B1F1_CREATOR_CHRONOLOGY_CONTRACT_HARDENING_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"], "genuine_gaps": genuine_gaps}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
