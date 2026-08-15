#!/usr/bin/env python3
"""Build CI-R3B1F validation summary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f_constants import DATA

OUT = DATA / "ci-r3b1f-validation-summary-2026-08.json"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def main() -> int:
    matrix = load("ci-r3b1f-expression-aware-dependency-matrix-2026-08.json")
    coverage = load("ci-r3b1f-expression-coverage-validation-2026-08.json")
    simulation = load("ci-r3b1f-tire-targeted-simulation-2026-08.json")
    immutability = load("ci-r3b1f-immutability-audit-2026-08.json")
    pre157 = load("ci-r3b1f-pre157-replay-state-2026-08.json")
    gap = load("ci-r3b1f-tire-lifecycle-predecessor-gap-2026-08.json")
    contracts = load("ci-r3b1f-expression-gap-predecessor-contracts-2026-08.json")
    closure = load("ci-r3b1f-expression-gap-repair-closure-2026-08.json")
    topology = load("ci-r3b1f-expression-gap-repair-topology-2026-08.json")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

    expr_records = [
        r for r in matrix["records"] if r.get("dependency_context") not in {None, "COLUMN_REFERENCE"}
    ]
    unresolved = matrix["classification_totals"]["UNRESOLVED"]
    all_pass = (
        pre157.get("pass")
        and simulation.get("pass")
        and coverage.get("pass")
        and immutability.get("pass")
        and unresolved == 0
        and all(c.get("closure_complete") for c in closure.get("gaps", []))
    )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F",
        "HEAD_SHA": head,
        "remaining_migrations_scanned": matrix["audit_scope"]["migrations_scanned"],
        "first_scanned_migration": matrix["audit_scope"]["first_migration"],
        "last_scanned_migration": matrix["audit_scope"]["last_migration"],
        "dependency_records": matrix["audit_scope"]["dependency_checks_generated"],
        "expression_predicate_records": len(expr_records),
        "classification_totals": matrix["classification_totals"],
        "previous_primary_defects": matrix.get("previous_primary_defects"),
        "new_expression_derived_primary_defects": matrix.get("new_expression_derived_primary_defects"),
        "total_revised_defects": matrix.get("total_revised_defects"),
        "unique_new_defects": matrix.get("unique_new_defects", []),
        "expression_coverage_gaps": coverage.get("expression_coverage_gaps"),
        "pre157_replay_pass": pre157.get("pass"),
        "targeted_consumer_simulations": {
            "vehicle_tire_setups.status": simulation,
        },
        "contracts_count": len(contracts.get("contracts", [])),
        "closure_complete": all(c.get("closure_complete") for c in closure.get("gaps", [])),
        "topology_slots": len(topology.get("slots", [])),
        "tire_gap_missing_properties": [
            g["property"] for g in gap.get("gaps", []) if g.get("classification") == "MISSING_HISTORY"
        ],
        "immutability_pass": immutability.get("pass"),
        "final_status": "CI_R3B1F_EXPRESSION_DEPENDENCY_CLOSURE_COMPLETED"
        if all_pass
        else "CI_R3B1F_EXPRESSION_DEPENDENCY_CLOSURE_FAILED",
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"final_status": out["final_status"]}, indent=2))
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
