#!/usr/bin/env python3
"""CI-R3B1I preflight validation summary."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_authority_resolver import derive_repair_boundary, resolve_column_authority
from ci_r3b1h111_build_contracts import build_contracts_from_matrix
from ci_r3b1i_constants import DATA, evidence_input_sha

MATRIX = DATA / "ci-r3b1i-preflight-dependency-matrix-2026-08.json"
LINEAGE = DATA / "ci-r3b1i-lineage-coverage-validation-2026-08.json"
ACTIONABLE_TESTS = DATA / "ci-r3b1i-preflight-actionable-tests-2026-08.json"
OUT = DATA / "ci-r3b1i-preflight-validation-summary-2026-08.json"


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    lineage = json.loads(LINEAGE.read_text()) if LINEAGE.is_file() else {"pass": False}
    actionable_tests = json.loads(ACTIONABLE_TESTS.read_text()) if ACTIONABLE_TESTS.is_file() else {"pass": False}
    built = build_contracts_from_matrix(matrix)
    gaps = matrix.get("unique_actionable_gaps", [])
    blocking = sum(
        1
        for r in matrix.get("records", [])
        if r.get("classification") in {"MISSING_HISTORY", "ORDERING_DEFECT"}
    )
    preflight_pass = (
        matrix["classification_totals"]["UNRESOLVED"] == 0
        and lineage.get("pass")
        and actionable_tests.get("pass")
        and built["summary"]["pass"]
        and lineage.get("physical_alias_leakage", 1) == 0
        and lineage.get("derived_lineage_gaps", 1) == 0
        and lineage.get("qualified_reference_coverage_gaps", 1) == 0
    )
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
        "classification_totals": matrix["classification_totals"],
        "blocking_dependency_records": blocking,
        "unique_actionable_gaps": len(gaps),
        "actionable_gaps": gaps,
        "physical_alias_leakage": lineage.get("physical_alias_leakage"),
        "derived_lineage_gaps": lineage.get("derived_lineage_gaps"),
        "qualified_reference_coverage_gaps": lineage.get("qualified_reference_coverage_gaps"),
        "context_whitelist_removed": actionable_tests.get("pass"),
        "repair_log_exclusion_removed": actionable_tests.get("pass"),
        "false_positive_lineage_validated": lineage.get("pass"),
        "contracts": built["summary"]["exact_contracts"],
        "uncontracted_gaps": built["summary"]["uncontracted_gaps"],
        "generic_contracts_valid": built["summary"]["pass"],
        "implementation_gate_pass": preflight_pass and len(gaps) >= 1,
        "pass": preflight_pass,
        "final_status": "CI_R3B1I_PREFLIGHT_PASS" if preflight_pass else "CI_R3B1I_PREFLIGHT_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "gaps": len(gaps), "status": out["final_status"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
