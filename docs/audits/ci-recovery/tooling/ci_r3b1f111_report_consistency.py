#!/usr/bin/env python3
"""Validate report counters match machine evidence (CI-R3B1F.1.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    summary = load("ci-r3b1f111-final-validation-summary-2026-08.json")
    reconciliation = load("ci-r3b1f111-defect-reconciliation-2026-08.json")
    contract_val = load("ci-r3b1f111-contract-validation-summary-2026-08.json")
    proof = load("ci-r3b1f111-targeted-consumer-proof-2026-08.json")

    checks = [
        ("reconciled", reconciliation["accounted"], summary["previous_records_reconciled"]),
        ("missing_history", summary["MISSING_HISTORY"], summary["corrected_genuine_gaps"]),
        ("ordering_defect", summary["ORDERING_DEFECT"], 0),
        ("unresolved", summary["UNRESOLVED"], 0),
        ("contracts", summary["exact_contracts"], len(load("ci-r3b1f111-exact-predecessor-contracts-2026-08.json").get("contracts", []))),
        ("proofs", summary["targeted_repair_proofs"], len(proof.get("proofs", []))),
        ("invalid_types", contract_val.get("invalid_types", 0), 0),
        ("coverage_gaps", summary["expression_coverage_gaps"], 0),
    ]
    mismatches = [f"{name}: expected {exp}, got {act}" for name, act, exp in checks if act != exp]
    out = {"mismatch_count": len(mismatches), "mismatches": mismatches, "pass": len(mismatches) == 0}
    print(json.dumps(out, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
