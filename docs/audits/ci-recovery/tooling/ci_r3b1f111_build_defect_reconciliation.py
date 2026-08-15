#!/usr/bin/env python3
"""Reconcile all 20 previous R3B1F.1 defect records (CI-R3B1F.1.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_constants import (
    DATA,
    PREVIOUS_MISSING_HISTORY,
    PREVIOUS_ORDERING_DEFECTS,
    PREVIOUS_R3B1F1_DEFECT_RECORDS,
    R3B1F1_MATRIX,
)

MATRIX = DATA / "ci-r3b1f111-expression-aware-dependency-matrix-2026-08.json"
OUT = DATA / "ci-r3b1f111-defect-reconciliation-2026-08.json"
OLD = json.loads(R3B1F1_MATRIX.read_text())


def find_column_record(matrix: dict, relation: str, prop: str, ctx: str | None = None) -> dict | None:
    recs = [
        r
        for r in matrix["records"]
        if r.get("required_object_type") == "column"
        and r.get("required_relation") == relation
        and r.get("required_property") == prop
        and (ctx is None or r.get("dependency_context") == ctx)
    ]
    return sorted(recs, key=lambda r: (r["migration_order"] or 9999, r["statement_order"]))[0] if recs else None


def find_constraint_record(matrix: dict, name: str) -> dict | None:
    recs = [r for r in matrix["records"] if r.get("required_object") == name and r.get("operation") == "DROP CONSTRAINT"]
    return recs[0] if recs else None


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    rows = []

    for relation, prop, ctx in PREVIOUS_MISSING_HISTORY:
        old_recs = [
            r
            for r in OLD["records"]
            if r.get("required_object_type") == "column"
            and r.get("required_relation") == relation
            and r.get("required_property") == prop
            and r.get("dependency_context") == ctx
            and r["classification"] == "MISSING_HISTORY"
        ]
        old = old_recs[0] if old_recs else None
        new = find_column_record(matrix, relation, prop, ctx)
        acceptable = {"FALSE_POSITIVE", "VALID", "NOT_FOUND", "CONDITIONAL_SAFE", "INTENTIONAL"}
        if relation == "vehicle_tire_setups" and prop == "status":
            ok = new and new["classification"] == "MISSING_HISTORY"
        else:
            ok = new is None or new["classification"] in acceptable
        rows.append(
            {
                "kind": "MISSING_HISTORY",
                "relation": relation,
                "property": prop,
                "dependency_context": ctx,
                "old_classification": old["classification"] if old else "MISSING_HISTORY",
                "old_dependency": f"{relation}.{prop}",
                "correct_semantic_interpretation": new.get("resolved_scope_type") if new else "suppressed",
                "new_classification": new["classification"] if new else "NOT_FOUND",
                "real_creator": new.get("first_creator_migration") if new else None,
                "reason": new.get("reason") if new else "suppressed before dependency emission",
                "reconciled_pass": ok,
            }
        )

    for name in PREVIOUS_ORDERING_DEFECTS:
        old = find_constraint_record(OLD, name)
        new = find_constraint_record(matrix, name)
        rows.append(
            {
                "kind": "ORDERING_DEFECT",
                "constraint": name,
                "old_classification": old["classification"] if old else "ORDERING_DEFECT",
                "old_dependency": name,
                "correct_semantic_interpretation": "DROP IF EXISTS guard permits absence",
                "new_classification": new["classification"] if new else "NOT_FOUND",
                "real_creator": new.get("first_creator_migration") if new else None,
                "reason": "Guarded DROP CONSTRAINT IF EXISTS classified CONDITIONAL_SAFE",
                "reconciled_pass": bool(new and new["classification"] == "CONDITIONAL_SAFE"),
            }
        )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1.1",
        "previous_missing_history": len(PREVIOUS_MISSING_HISTORY),
        "previous_ordering_defect": len(PREVIOUS_ORDERING_DEFECTS),
        "previous_defect_records": PREVIOUS_R3B1F1_DEFECT_RECORDS,
        "accounted": len(rows),
        "rows": rows,
        "pass": len(rows) == PREVIOUS_R3B1F1_DEFECT_RECORDS and all(r.get("reconciled_pass") for r in rows),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"accounted": out["accounted"], "pass": out["pass"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
