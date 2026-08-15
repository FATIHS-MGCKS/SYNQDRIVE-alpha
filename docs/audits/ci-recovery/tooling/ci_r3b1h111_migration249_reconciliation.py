"""Machine-generated Migration-249 reconciliation from matrix records (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ci_r3b1h111_constants import DATA, OLD_R3B1H_MATRIX

OUT = DATA / "ci-r3b1h111-migration249-reconciliation-2026-08.json"
SUCCESSOR_MATRIX = DATA / "ci-r3b1h111-insert-select-dependency-matrix-2026-08.json"
MIG249 = "20260721250000_iam_versioned_role_assignments"


def _old_mig249_records(old_matrix: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        r
        for r in old_matrix.get("records", [])
        if r.get("migration") == MIG249 and r.get("classification") == "MISSING_HISTORY"
    ]


def _is_alias_token(value: str | None) -> bool:
    return bool(value) and len(value) <= 2 and value.isalpha() and value.islower()


def _raw_reference(old: dict[str, Any]) -> str:
    alias = old.get("resolved_alias") or (_is_alias_token(old.get("resolved_relation")) and old.get("resolved_relation"))
    prop = old.get("required_property") or ""
    if alias:
        return f"{alias}.{prop}"
    rel = old.get("resolved_relation") or old.get("required_relation") or ""
    return f"{rel}.{prop}" if rel else prop


def find_successor_record(old: dict[str, Any], successor_records: list[dict[str, Any]]) -> dict[str, Any] | None:
    prop = old.get("required_property")
    candidates = [
        r
        for r in successor_records
        if r.get("migration") == old.get("migration")
        and r.get("statement_order") == old.get("statement_order")
        and r.get("required_property") == prop
        and r.get("dependency_context") != "INSERT_SELECT_TARGET"
    ]
    if not candidates:
        return None

    old_alias = old.get("resolved_alias")
    if not old_alias and _is_alias_token(old.get("resolved_relation")):
        old_alias = old.get("resolved_relation")

    if old_alias:
        alias_hits = [r for r in candidates if r.get("resolved_alias") == old_alias]
        if len(alias_hits) == 1:
            return alias_hits[0]
        if alias_hits:
            candidates = alias_hits

    ctx = old.get("dependency_context")
    ctx_hits = [r for r in candidates if r.get("dependency_context") == ctx]
    if len(ctx_hits) == 1:
        return ctx_hits[0]
    if ctx_hits:
        candidates = ctx_hits

    if len(candidates) == 1:
        return candidates[0]
    return None


def binding_type(record: dict[str, Any]) -> str:
    if record.get("classification") == "FALSE_POSITIVE":
        return "DERIVED_REFERENCE"
    if record.get("resolved_alias") and record.get("resolved_relation") and record.get("resolved_alias") != record.get("resolved_relation"):
        return "PHYSICAL_RELATION"
    return "PHYSICAL_RELATION"


def build_reconciliation(old_matrix_path: Path | None = None, successor_matrix_path: Path | None = None) -> dict[str, Any]:
    old_matrix = json.loads((old_matrix_path or OLD_R3B1H_MATRIX).read_text())
    successor = json.loads((successor_matrix_path or SUCCESSOR_MATRIX).read_text())
    old_records = _old_mig249_records(old_matrix)
    successor_records = successor.get("records", [])

    rows = []
    mismatches = []
    for old in old_records:
        new = find_successor_record(old, successor_records)
        row = {
            "old_record_id": old.get("id"),
            "old_record_identity": {
                "migration": old.get("migration"),
                "statement_order": old.get("statement_order"),
                "dependency_context": old.get("dependency_context"),
                "resolved_relation": old.get("resolved_relation"),
                "resolved_alias": old.get("resolved_alias"),
                "required_property": old.get("required_property"),
            },
            "raw_reference": _raw_reference(old),
            "old_classification": old.get("classification"),
            "new_matrix_record_id": new.get("id") if new else None,
            "new_matrix_record_identity": {
                "dependency_context": new.get("dependency_context") if new else None,
                "resolved_relation": new.get("resolved_relation") if new else None,
                "resolved_alias": new.get("resolved_alias") if new else None,
                "required_property": new.get("required_property") if new else None,
                "classification": new.get("classification") if new else None,
            },
            "binding_type": binding_type(new) if new else None,
            "physical_relation": new.get("resolved_relation") if new else None,
            "physical_property": new.get("required_property") if new else None,
            "creator": {
                "migration": new.get("first_creator_migration") if new else None,
                "statement": new.get("creator_statement_order") if new else None,
            },
            "new_classification": new.get("classification") if new else "UNACCOUNTED",
            "derivation_method": "matrix_lookup_by_migration_statement_property_with_alias_disambiguation",
        }
        rows.append(row)
        if new is None:
            mismatches.append({"old_record_id": old.get("id"), "reason": "no successor matrix record"})
        else:
            if row["physical_relation"] != new.get("resolved_relation") or row["physical_property"] != new.get("required_property"):
                mismatches.append({"old_record_id": old.get("id"), "reason": "physical lineage mismatch"})
            if row["new_classification"] != new.get("classification"):
                mismatches.append({"old_record_id": old.get("id"), "reason": "classification mismatch"})

    return {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "source_old_matrix": str((old_matrix_path or OLD_R3B1H_MATRIX).name),
        "source_successor_matrix": str((successor_matrix_path or SUCCESSOR_MATRIX).name),
        "old_records_total": len(old_records),
        "accounted": sum(1 for r in rows if r["new_classification"] != "UNACCOUNTED"),
        "reconciliation_mismatches": len(mismatches),
        "mismatch_records": mismatches,
        "records": rows,
        "pass": len(old_records) == 4 and len(mismatches) == 0,
    }


def main() -> int:
    doc = build_reconciliation()
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    print(json.dumps({"accounted": doc["accounted"], "mismatches": doc["reconciliation_mismatches"], "pass": doc["pass"]}, indent=2))
    return 0 if doc["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
