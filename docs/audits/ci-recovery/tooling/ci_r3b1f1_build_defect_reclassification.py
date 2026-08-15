#!/usr/bin/env python3
"""Reclassify all 13 R3B1F candidate gaps against corrected creator chronology."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f1_constants import DATA, R3B1F_CANDIDATES, R3B1F_MATRIX

MATRIX = DATA / "ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json"
OUT = DATA / "ci-r3b1f1-defect-reclassification-2026-08.json"
OLD = json.loads(R3B1F_MATRIX.read_text())


def candidate_records(matrix: dict, relation: str, prop: str) -> list[dict]:
    return [
        r
        for r in matrix["records"]
        if r.get("required_object_type") == "column"
        and (r.get("required_relation") or r.get("required_object")) == relation
        and r.get("required_property") == prop
        and r.get("dependency_context") in {
            "PARTIAL_INDEX_PREDICATE",
            "INDEX_KEY",
            "INDEX_EXPRESSION",
            "CHECK_EXPRESSION",
        }
    ]


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    rows = []
    false_positives = 0
    confirmed_missing = 0
    for relation, prop in R3B1F_CANDIDATES:
        old = next((d for d in OLD.get("unique_new_defects", []) if d["relation"] == relation and d["property"] == prop), None)
        recs = candidate_records(matrix, relation, prop)
        primary = sorted(recs, key=lambda r: (r["migration_order"] or 9999, r["statement_order"]))[0] if recs else None
        new_cls = primary["classification"] if primary else "NOT_FOUND"
        if new_cls == "VALID":
            false_positives += 1
        elif new_cls == "MISSING_HISTORY":
            confirmed_missing += 1
        rows.append(
            {
                "relation": relation,
                "property": prop,
                "r3b1f_candidate": True,
                "old_classification": old.get("classification") if old else "MISSING_HISTORY",
                "old_first_consumer": old.get("first_consumer_migration") if old else None,
                "corrected_creator_migration": primary.get("first_creator_migration") if primary else None,
                "corrected_creator_statement": primary.get("creator_statement_order") if primary else None,
                "corrected_creator_clause": primary.get("creator_clause_order") if primary else None,
                "consumer_migration": primary.get("migration") if primary else None,
                "consumer_statement": primary.get("statement_order") if primary else None,
                "new_classification": new_cls,
                "reason": (
                    "Creator chronology corrected; column creator exists before consumer."
                    if new_cls == "VALID"
                    else "No historical creator before first expression consumer."
                    if new_cls == "MISSING_HISTORY"
                    else f"Reclassified as {new_cls}"
                ),
            }
        )

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "previous_r3b1f_candidates": len(R3B1F_CANDIDATES),
        "accounted": len(rows),
        "false_positives_corrected": false_positives,
        "confirmed_missing_history": confirmed_missing,
        "rows": rows,
        "pass": len(rows) == len(R3B1F_CANDIDATES),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"accounted": out["accounted"], "false_positives": false_positives, "confirmed_missing": confirmed_missing}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
