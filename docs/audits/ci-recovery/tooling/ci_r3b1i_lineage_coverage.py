"""CI-R3B1I hardened lineage coverage with column-level derived proofs."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1i_constants import DATA, REPO
from ci_r3b1i_derived_lineage import prove_false_positive_record, reference_is_covered, trace_qualified_column
from ci_r3b1h111_lineage_coverage import independent_qualified_references, relation_inventory_at
from sql_migration_analyzer import split_sql_statements

OUT = DATA / "ci-r3b1i-lineage-coverage-validation-2026-08.json"


def physical_alias_leakage(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    leaks = []
    for record in records:
        if record.get("classification") in {"FALSE_POSITIVE", "INTENTIONAL", "CONDITIONAL_SAFE"}:
            continue
        if record.get("dependency_context") == "INSERT_SELECT_TARGET":
            continue
        rel = record.get("resolved_relation") or record.get("required_relation") or ""
        if not rel:
            continue
        inventory = relation_inventory_at(record["migration"], record["statement_order"])
        if rel not in inventory:
            leaks.append(
                {
                    "id": record.get("id"),
                    "migration": record.get("migration"),
                    "statement_order": record.get("statement_order"),
                    "resolved_relation": rel,
                    "required_property": record.get("required_property"),
                    "classification": record.get("classification"),
                }
            )
    return leaks


def derived_lineage_gaps(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps = []
    by_stmt: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for record in records:
        by_stmt.setdefault((record["migration"], record["statement_order"]), []).append(record)

    for (migration, stmt_order), stmt_records in by_stmt.items():
        sql = (REPO / "backend/prisma/migrations" / migration / "migration.sql").read_text()
        stmts = split_sql_statements(sql)
        if stmt_order < 1 or stmt_order > len(stmts):
            continue
        stmt = stmts[stmt_order - 1]
        inventory = relation_inventory_at(migration, stmt_order)
        for record in stmt_records:
            if record.get("classification") not in {"FALSE_POSITIVE", "DERIVED_REFERENCE"}:
                continue
            if record.get("dependency_context") == "INSERT_SELECT_TARGET":
                continue
            proof = prove_false_positive_record(record, stmt, inventory)
            if not proof.get("pass"):
                gaps.append(
                    {
                        "id": record.get("id"),
                        "migration": migration,
                        "statement_order": stmt_order,
                        "alias": record.get("resolved_alias") or record.get("resolved_relation"),
                        "property": record.get("required_property"),
                        "reason": proof.get("reason"),
                        "proof": proof,
                    }
                )
    return gaps


def qualified_reference_coverage_gaps(records: list[dict[str, Any]], scope: list[str]) -> list[dict[str, Any]]:
    gaps = []
    by_stmt: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for record in records:
        if record.get("dependency_context") == "INSERT_SELECT_TARGET":
            continue
        key = (record["migration"], record.get("statement_order"))
        by_stmt.setdefault(key, []).append(record)

    for mig in scope:
        sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            if not re.search(r"INSERT\s+INTO\b", stmt, re.I) or not re.search(r"\bSELECT\b", stmt, re.I):
                continue
            stmt_records = by_stmt.get((mig, stmt_order), [])
            inventory = relation_inventory_at(mig, stmt_order)
            for rel, col in independent_qualified_references(stmt):
                covered, proof = reference_is_covered(rel, col, stmt, stmt_records, inventory)
                if not covered:
                    gaps.append(
                        {
                            "migration": mig,
                            "statement_order": stmt_order,
                            "reference": f"{rel}.{col}",
                            "proof": proof,
                        }
                    )
    return gaps


def build_lineage_report(matrix_path: Path) -> dict[str, Any]:
    matrix = json.loads(matrix_path.read_text())
    records = matrix.get("records", [])
    scope = matrix.get("audit_scope", {}).get("scope_migrations") or []
    alias_leaks = physical_alias_leakage(records)
    qr_gaps = qualified_reference_coverage_gaps(records, scope)
    derived_gaps = derived_lineage_gaps(records)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "physical_alias_leakage": len(alias_leaks),
        "physical_alias_leakage_records": alias_leaks,
        "derived_lineage_gaps": len(derived_gaps),
        "derived_lineage_gap_records": derived_gaps,
        "qualified_reference_coverage_gaps": len(qr_gaps),
        "qualified_reference_gaps": qr_gaps,
        "pass": len(alias_leaks) == 0 and len(qr_gaps) == 0 and len(derived_gaps) == 0,
    }


def main() -> int:
    matrix_path = DATA / "ci-r3b1i-preflight-dependency-matrix-2026-08.json"
    if not matrix_path.is_file():
        print(json.dumps({"pass": False, "reason": "matrix_missing"}, indent=2))
        return 1
    report = build_lineage_report(matrix_path)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "pass": report["pass"],
                "physical_alias_leakage": report["physical_alias_leakage"],
                "derived_lineage_gaps": report["derived_lineage_gaps"],
                "qualified_reference_coverage_gaps": report["qualified_reference_coverage_gaps"],
            },
            indent=2,
        )
    )
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
