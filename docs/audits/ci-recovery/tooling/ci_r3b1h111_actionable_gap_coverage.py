#!/usr/bin/env python3
"""Actionable gap coverage gate (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_constants import DATA, INSERT_SELECT_GAP_CONTEXTS

MATRIX = DATA / "ci-r3b1h111-insert-select-dependency-matrix-2026-08.json"
CONTRACTS = DATA / "ci-r3b1h111-contract-validation-summary-2026-08.json"
PROOF = DATA / "ci-r3b1h111-targeted-consumer-proof-2026-08.json"
OUT = DATA / "ci-r3b1h111-actionable-gap-coverage-2026-08.json"


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    contract_summary = json.loads(CONTRACTS.read_text()) if CONTRACTS.is_file() else {}
    proof_doc = json.loads(PROOF.read_text()) if PROOF.is_file() else {}

    blocking = [
        r
        for r in matrix.get("records", [])
        if r.get("classification") in {"MISSING_HISTORY", "ORDERING_DEFECT"}
        and r.get("dependency_context") in INSERT_SELECT_GAP_CONTEXTS
        and r.get("dependency_context") != "INSERT_SELECT_TARGET"
    ]
    gaps = matrix.get("unique_actionable_gaps", [])
    gap_keys = {(g["relation"], g["property"]) for g in gaps}
    contracts_count = contract_summary.get("exact_contracts", 0)
    contract_keys = set()
    contracts_file = DATA / "ci-r3b1h111-exact-predecessor-contracts-2026-08.json"
    if contracts_file.is_file():
        contract_keys = {(c["relation"], c["column"]) for c in json.loads(contracts_file.read_text()).get("contracts", [])}

    uncontracted = sorted(gap_keys - contract_keys)
    proofs = proof_doc.get("gap_proofs", [])
    proven = {(p["relation"], p["column"]) for p in proofs if p.get("pass")}
    unproven = sorted(gap_keys - proven)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "blocking_dependency_records": len(blocking),
        "unique_actionable_gaps": len(gaps),
        "contracts_produced": contracts_count,
        "contracts_validated": contract_summary.get("pass", False),
        "targeted_proofs": len(proofs),
        "uncontracted_gaps": len(uncontracted),
        "uncontracted": [{"relation": r, "property": c} for r, c in uncontracted],
        "invalid_contracts": len(contract_summary.get("validation_errors", [])),
        "unproven_gaps": len(unproven),
        "unproven": [{"relation": r, "property": c} for r, c in unproven],
        "pass": len(uncontracted) == 0 and len(unproven) == 0 and contract_summary.get("pass", False),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "uncontracted": out["uncontracted_gaps"], "unproven": out["unproven_gaps"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
