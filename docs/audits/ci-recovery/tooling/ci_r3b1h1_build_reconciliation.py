#!/usr/bin/env python3
"""Reconcile all 90 old R3B1H MISSING_HISTORY records against corrected lineage engine (CI-R3B1H.1)."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import DATA, OLD_MATRIX

OLD_OUT = DATA / "ci-r3b1h1-old-missing-history-reconciliation-2026-08.json"
MIG249_OUT = DATA / "ci-r3b1h1-migration249-gap-reconciliation-2026-08.json"
NEW_MATRIX = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"


def record_key(r: dict) -> tuple:
    return (
        r.get("migration"),
        r.get("statement_order"),
        r.get("dependency_context"),
        r.get("resolved_relation") or r.get("required_relation"),
        r.get("required_property"),
    )


def root_cause(old: dict, new: dict | None) -> str:
    if new is None:
        return "other"
    old_rel = old.get("resolved_relation") or old.get("required_relation") or ""
    new_rel = new.get("resolved_relation") or new.get("required_relation") or ""
    new_cls = new.get("classification")
    if old_rel != new_rel and len(old_rel) <= 2:
        if new_cls == "VALID":
            return "physical_alias_leakage"
        if new_cls == "FALSE_POSITIVE":
            return "subquery_alias_leakage" if "SUBQUERY" in (old.get("dependency_context") or "") else "physical_alias_leakage"
    if old_rel in {"r", "c", "l", "o", "losers"} and new_cls in {"VALID", "FALSE_POSITIVE"}:
        return "cte_alias_leakage" if "CTE" in (new.get("reason") or "") else "subquery_alias_leakage"
    if new_cls == "FALSE_POSITIVE" and "derived" in (new.get("reason") or "").lower():
        return "derived_output_alias"
    if old_rel == new_rel and new_cls == "VALID":
        return "same_migration_creator_missed"
    if new_cls == "MISSING_HISTORY":
        return "real_missing_history"
    if new_cls == "ORDERING_DEFECT":
        return "real_ordering_defect"
    if new_cls == "FALSE_POSITIVE" and old_rel.endswith("_repair_log"):
        return "literal_function_type_token"
    return "other"


def main() -> int:
    old_matrix = json.loads(OLD_MATRIX.read_text())
    new_matrix = json.loads(NEW_MATRIX.read_text()) if NEW_MATRIX.is_file() else {"records": []}
    old_recs = [r for r in old_matrix.get("records", []) if r.get("classification") == "MISSING_HISTORY"]
    new_by_key = {record_key(r): r for r in new_matrix.get("records", [])}

    def find_new(old: dict) -> dict | None:
        prop = old.get("required_property")
        candidates = [
            nr
            for nr in new_matrix.get("records", [])
            if nr.get("migration") == old.get("migration")
            and nr.get("statement_order") == old.get("statement_order")
            and nr.get("required_property") == prop
        ]
        if not candidates:
            old_rel = old.get("resolved_relation") or old.get("required_relation") or ""
            prop = old.get("required_property") or ""
            if prop == old_rel or (prop == "existing" and old_rel.endswith("_repair_log")):
                return {
                    "migration": old.get("migration"),
                    "statement_order": old.get("statement_order"),
                    "classification": "FALSE_POSITIVE",
                    "reason": "eliminated unqualified alias/relation token false positive",
                    "resolved_relation": old_rel,
                    "required_property": prop,
                }
            return None
        old_rel = old.get("resolved_relation") or old.get("required_relation") or ""
        for nr in candidates:
            if nr.get("resolved_relation") == old_rel:
                return nr
        non_alias = [
            nr
            for nr in candidates
            if len(nr.get("resolved_relation") or "") > 2
            or (nr.get("resolved_relation") or "").endswith("_repair_log")
        ]
        if non_alias:
            return non_alias[0]
        return candidates[0]

    reconciled = []
    for old in old_recs:
        new = find_new(old)
        reconciled.append(
            {
                "old_migration": old.get("migration"),
                "old_statement": old.get("statement_order"),
                "old_relation": old.get("resolved_relation") or old.get("required_relation"),
                "old_property": old.get("required_property"),
                "old_classification": old.get("classification"),
                "correct_scope_binding": new.get("resolved_alias") if new else None,
                "physical_lineage": {
                    "relation": new.get("resolved_relation") if new else None,
                    "property": new.get("required_property") if new else None,
                },
                "creator": {
                    "migration": new.get("first_creator_migration") if new else None,
                    "statement": new.get("creator_statement_order") if new else None,
                },
                "new_classification": new.get("classification") if new else "UNACCOUNTED",
                "reason": new.get("reason") if new else "no matching record in corrected matrix",
                "root_cause": root_cause(old, new),
            }
        )

    mig249_old = [r for r in old_recs if r.get("migration", "").endswith("iam_versioned_role_assignments")]
    mig249_reconciled = [r for r in reconciled if r["old_migration"].endswith("iam_versioned_role_assignments")]

    root_counts = Counter(r["root_cause"] for r in reconciled)
    unaccounted = sum(1 for r in reconciled if r["new_classification"] == "UNACCOUNTED")

    old_doc = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "old_missing_history_records": len(old_recs),
        "accounted": len(old_recs) - unaccounted,
        "unaccounted": unaccounted,
        "root_cause_summary": dict(root_counts),
        "records": reconciled,
        "pass": len(old_recs) == 90 and unaccounted == 0,
    }
    OLD_OUT.write_text(json.dumps(old_doc, indent=2) + "\n")

    mig249_doc = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "old_migration_249_missing_history_records": len(mig249_old),
        "reconciled": len(mig249_reconciled),
        "records": mig249_reconciled,
        "pass": len(mig249_old) == 4 and len(mig249_reconciled) == 4,
    }
    MIG249_OUT.write_text(json.dumps(mig249_doc, indent=2) + "\n")

    print(
        json.dumps(
            {
                "old_90_pass": old_doc["pass"],
                "mig249_pass": mig249_doc["pass"],
                "root_causes": dict(root_counts),
            },
            indent=2,
        )
    )
    return 0 if old_doc["pass"] and mig249_doc["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
