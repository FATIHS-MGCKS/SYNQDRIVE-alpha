#!/usr/bin/env python3
"""Build INSERT-SELECT dependency matrix for migrations 249→HEAD (CI-R3B1H.1)."""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import DATA, FIRST_SCANNED, INSERT_SELECT_GAP_CONTEXTS, REPO
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
)

OUT = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"


def unique_actionable(records: list[dict], table_creators: set[str]) -> list[dict]:
    by_key: dict[tuple[str, str], dict] = {}
    for r in records:
        if r["classification"] not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if r.get("dependency_context") not in INSERT_SELECT_GAP_CONTEXTS:
            continue
        if r.get("required_object_type") != "column":
            continue
        if r.get("dependency_context") == "INSERT_SELECT_TARGET":
            continue
        rel = r.get("resolved_relation") or r.get("required_relation") or r.get("required_object")
        prop = r.get("required_property") or ""
        if not rel or rel not in table_creators:
            continue
        if prop == rel or rel.endswith("_repair_log"):
            continue
        if len(rel) <= 2 and rel.isalpha() and rel.islower():
            continue
        key = (rel, prop)
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = {
                "relation": rel,
                "property": prop,
                "classification": r["classification"],
                "first_consumer_migration": r["migration"],
                "first_consumer_order": r["migration_order"],
                "first_consumer_statement": r["statement_order"],
                "all_consumers": [r["migration"]],
                "creator_migration": r.get("first_creator_migration"),
                "creator_statement": r.get("creator_statement_order"),
            }
        else:
            prev["all_consumers"].append(r["migration"])
    return sorted(by_key.values(), key=lambda x: x["first_consumer_order"] or 9999)


def build_matrix() -> dict[str, Any]:
    mig_dir = REPO / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    scope = all_migs[all_migs.index(FIRST_SCANNED) :]
    scope_ord = {m: all_migs.index(m) + 1 for m in scope}
    pre_scope = all_migs[: all_migs.index(FIRST_SCANNED)]

    ctx = AnalyzerContext(repo=REPO, mig_dir=mig_dir, scope=scope, scope_ord=scope_ord, all_migs=all_migs)
    prescan_creators(ctx)
    ctx.records.clear()
    ctx.seq = 0
    state = SchemaState()

    for mig in pre_scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, state)

    for mig in scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            check_statement_dependencies(ctx, mig, stmt_order, stmt, state)
            apply_statement(ctx, mig, stmt_order, stmt, state)

    insert_records = [
        r
        for r in ctx.records
        if r.get("dependency_context") in INSERT_SELECT_GAP_CONTEXTS
        or r.get("operation", "").startswith("INSERT SELECT")
    ]
    table_creators = set(ctx.table_creators.keys())
    counts = Counter(r["classification"] for r in insert_records)
    gaps = unique_actionable(insert_records, table_creators)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "insert_select_lineage_engine": True,
        "HEAD_SHA": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
        "audit_scope": {
            "first_migration": FIRST_SCANNED,
            "last_migration": all_migs[-1],
            "migrations_scanned": len(scope),
            "scope_migrations": scope,
            "total_migrations_in_repository": len(all_migs),
        },
        "classification_totals": {
            "TOTAL": len(insert_records),
            "VALID": counts.get("VALID", 0),
            "MISSING_HISTORY": counts.get("MISSING_HISTORY", 0),
            "ORDERING_DEFECT": counts.get("ORDERING_DEFECT", 0),
            "CONDITIONAL_SAFE": counts.get("CONDITIONAL_SAFE", 0),
            "FALSE_POSITIVE": counts.get("FALSE_POSITIVE", 0),
            "INTENTIONAL": counts.get("INTENTIONAL", 0),
            "UNRESOLVED": counts.get("UNRESOLVED", 0),
        },
        "unique_actionable_gaps": gaps,
        "records": insert_records,
    }


def main() -> int:
    matrix = build_matrix()
    OUT.write_text(json.dumps(matrix, indent=2) + "\n")
    print(json.dumps({"pass": matrix["classification_totals"]["UNRESOLVED"] == 0, **matrix["classification_totals"], "gaps": len(matrix["unique_actionable_gaps"])}, indent=2))
    return 0 if matrix["classification_totals"]["UNRESOLVED"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
