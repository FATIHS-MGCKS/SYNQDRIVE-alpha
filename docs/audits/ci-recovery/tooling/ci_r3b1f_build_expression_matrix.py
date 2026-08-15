#!/usr/bin/env python3
"""Build expression-aware dependency matrix for migrations 157 through HEAD."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f_constants import DATA, FIRST_SCANNED, PREVIOUS_PRIMARY_DEFECTS
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
)

OUT = DATA / "ci-r3b1f-expression-aware-dependency-matrix-2026-08.json"
OLD_MATRIX = DATA / "ci-r3b1d-post-vendor-dependency-matrix-2026-08.json"
FIRST_MIG = "20260311224040_init"


def global_mig_order(all_migs: list[str], name: str | None) -> int | None:
    if name is None:
        return None
    if name in all_migs:
        return all_migs.index(name) + 1
    return None


def build_matrix(repo: Path) -> dict[str, Any]:
    mig_dir = repo / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    scope = all_migs[all_migs.index(FIRST_SCANNED) :]
    scope_ord = {m: global_mig_order(all_migs, m) for m in scope}

    ctx = AnalyzerContext(
        repo=repo,
        mig_dir=mig_dir,
        scope=scope,
        scope_ord=scope_ord,
        all_migs=all_migs,
    )
    prescan_creators(ctx)
    ctx.records.clear()
    ctx.seq = 0

    state = SchemaState()
    pre_scope = all_migs[: all_migs.index(FIRST_SCANNED)]
    for mig in pre_scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, state)

    for mig in scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        statements = split_sql_statements(sql)
        for stmt_order, stmt in enumerate(statements, 1):
            check_statement_dependencies(ctx, mig, stmt_order, stmt, state)
            apply_statement(ctx, mig, stmt_order, stmt, state)

    counts = Counter(r["classification"] for r in ctx.records)
    expr_counts = Counter(
        r["classification"]
        for r in ctx.records
        if r.get("dependency_context")
        not in {"COLUMN_REFERENCE", None}
        and r.get("dependency_context") != "COLUMN_REFERENCE"
    )
    expr_records = [r for r in ctx.records if r.get("dependency_context") not in {None, "COLUMN_REFERENCE"}]
    return {
        "schema_version": 2,
        "phase": "CI-R3B1F",
        "audit_scope": {
            "first_migration": FIRST_SCANNED,
            "last_migration": all_migs[-1],
            "history_first_migration": FIRST_MIG,
            "total_migrations_in_repository": len(all_migs),
            "migrations_scanned": len(scope),
            "pre_scope_migrations_applied_to_state": len(pre_scope),
            "dependency_checks_generated": len(ctx.records),
            "expression_predicate_records": len(expr_records),
            "scope_migrations": scope,
            "statement_level": True,
            "expression_aware": True,
        },
        "classification_totals": {
            "TOTAL": len(ctx.records),
            "VALID": counts.get("VALID", 0),
            "INTENTIONAL": counts.get("INTENTIONAL", 0),
            "MISSING_HISTORY": counts.get("MISSING_HISTORY", 0),
            "ORDERING_DEFECT": counts.get("ORDERING_DEFECT", 0),
            "CONDITIONAL_SAFE": counts.get("CONDITIONAL_SAFE", 0),
            "FALSE_POSITIVE": counts.get("FALSE_POSITIVE", 0),
            "UNRESOLVED": counts.get("UNRESOLVED", 0),
        },
        "expression_classification_totals": dict(expr_counts),
        "records": ctx.records,
    }


EXPRESSION_GAP_CONTEXTS = {
    "PARTIAL_INDEX_PREDICATE",
    "INDEX_EXPRESSION",
    "CHECK_EXPRESSION",
    "GENERATED_EXPRESSION",
    "ALTER_USING_EXPRESSION",
}


def unique_new_defects(matrix: dict[str, Any], old_matrix: dict[str, Any]) -> list[dict[str, Any]]:
    old_keys = {
        (
            r.get("required_relation") or r.get("required_object"),
            r.get("required_property"),
            r.get("required_object_type"),
        )
        for r in old_matrix.get("records", [])
        if r.get("classification") in {"MISSING_HISTORY", "ORDERING_DEFECT"}
    }
    by_obj: dict[tuple[str, str], dict[str, Any]] = {}
    for r in matrix["records"]:
        if r["classification"] not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if r["required_object_type"] != "column":
            continue
        ctx = r.get("dependency_context")
        if ctx not in EXPRESSION_GAP_CONTEXTS:
            continue
        key_obj = (r.get("required_relation") or r["required_object"], r.get("required_property") or "")
        if key_obj in old_keys:
            continue
        prev = by_obj.get(key_obj)
        if prev is None or (r["migration_order"] or 9999) < prev["first_consumer_order"]:
            by_obj[key_obj] = {
                "relation": key_obj[0],
                "property": key_obj[1],
                "classification": r["classification"],
                "first_consumer_migration": r["migration"],
                "first_consumer_order": r["migration_order"],
                "dependency_contexts": [ctx],
                "all_consumers": [r["migration"]],
            }
        else:
            prev["all_consumers"].append(r["migration"])
            if ctx and ctx not in prev["dependency_contexts"]:
                prev["dependency_contexts"].append(ctx)
    return sorted(by_obj.values(), key=lambda x: x["first_consumer_order"] or 9999)


def main() -> int:
    matrix = build_matrix(REPO)
    old = json.loads(OLD_MATRIX.read_text()) if OLD_MATRIX.exists() else {"records": []}
    new_defects = unique_new_defects(matrix, old)
    matrix["previous_primary_defects"] = PREVIOUS_PRIMARY_DEFECTS
    matrix["new_expression_derived_primary_defects"] = len(new_defects)
    matrix["total_revised_defects"] = PREVIOUS_PRIMARY_DEFECTS + len(new_defects)
    matrix["unique_new_defects"] = new_defects
    OUT.write_text(json.dumps(matrix, indent=2) + "\n")
    print(
        json.dumps(
            {
                "pass": matrix["classification_totals"]["UNRESOLVED"] == 0,
                "records": len(matrix["records"]),
                "new_defects": len(new_defects),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
