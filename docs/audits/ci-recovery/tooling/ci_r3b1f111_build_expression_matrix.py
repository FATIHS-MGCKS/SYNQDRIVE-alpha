#!/usr/bin/env python3
"""Build CI-R3B1F.1.1 expression-aware dependency matrix with corrected creator chronology."""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_constants import DATA, EXPRESSION_GAP_CONTEXTS, FIRST_SCANNED, PREVIOUS_PRIMARY_DEFECTS
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
)

OUT = DATA / "ci-r3b1f111-expression-aware-dependency-matrix-2026-08.json"
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
    expr_records = [r for r in ctx.records if r.get("dependency_context") not in {None, "COLUMN_REFERENCE"}]
    return {
        "schema_version": 3,
        "phase": "CI-R3B1F.1.1",
        "supersedes": "ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json",
        "scope_resolution_hardened": True,
        "false_positive_model": "emit_explicit_FALSE_POSITIVE_records",
        "HEAD_SHA": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
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
            "creator_chronology_hardened": True,
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
        "records": ctx.records,
    }


def unique_genuine_gaps(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    by_obj: dict[tuple[str, str], dict[str, Any]] = {}
    for r in matrix["records"]:
        if r["classification"] not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if r["required_object_type"] != "column":
            continue
        if r.get("dependency_context") not in EXPRESSION_GAP_CONTEXTS:
            continue
        key = (r.get("required_relation") or r["required_object"], r.get("required_property") or "")
        prev = by_obj.get(key)
        if prev is None or (r["migration_order"] or 9999) < prev["first_consumer_order"]:
            by_obj[key] = {
                "relation": key[0],
                "property": key[1],
                "classification": r["classification"],
                "first_consumer_migration": r["migration"],
                "first_consumer_order": r["migration_order"],
                "first_consumer_statement": r["statement_order"],
                "dependency_contexts": [r.get("dependency_context")],
                "creator_migration": r.get("first_creator_migration"),
                "creator_statement": r.get("creator_statement_order"),
                "creator_clause": r.get("creator_clause_order"),
                "all_consumers": [r["migration"]],
            }
        else:
            prev["all_consumers"].append(r["migration"])
            ctx_name = r.get("dependency_context")
            if ctx_name and ctx_name not in prev["dependency_contexts"]:
                prev["dependency_contexts"].append(ctx_name)
    return sorted(by_obj.values(), key=lambda x: x["first_consumer_order"] or 9999)


def main() -> int:
    matrix = build_matrix(REPO)
    gaps = unique_genuine_gaps(matrix)
    matrix["previous_primary_defects"] = PREVIOUS_PRIMARY_DEFECTS
    matrix["previous_r3b1f_candidate_gaps"] = 13
    matrix["corrected_genuine_gaps"] = len(gaps)
    matrix["unique_genuine_gaps"] = gaps
    OUT.write_text(json.dumps(matrix, indent=2) + "\n")
    print(
        json.dumps(
            {
                "pass": matrix["classification_totals"]["UNRESOLVED"] == 0,
                "records": len(matrix["records"]),
                "genuine_gaps": len(gaps),
                "MISSING_HISTORY": matrix["classification_totals"]["MISSING_HISTORY"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
