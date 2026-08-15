#!/usr/bin/env python3
"""Build CI-R3B1I preflight dependency matrix (249→HEAD)."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_actionable_gaps import derive_unique_actionable_gaps
from ci_r3b1h111_authority_resolver import derive_repair_boundary
from ci_r3b1i_constants import DATA, FIRST_SCANNED, REPO, evidence_input_sha
from ci_r3b1h111_constants import INSERT_SELECT_GAP_CONTEXTS
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
)

OUT = DATA / "ci-r3b1i-preflight-dependency-matrix-2026-08.json"


def build_matrix() -> dict:
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
    provisional = derive_unique_actionable_gaps(insert_records, table_creators)
    boundary_by_gap = {}
    for gap in provisional:
        boundary = derive_repair_boundary(gap["relation"], gap["property"], gap["first_consumer_migration"])
        if boundary.valid and boundary.after_migration:
            boundary_by_gap[(gap["relation"], gap["property"])] = {
                "after_migration": boundary.after_migration,
                "before_migration": boundary.before_migration,
            }
    gaps = derive_unique_actionable_gaps(insert_records, table_creators, boundary_by_gap)
    counts = Counter(r["classification"] for r in insert_records)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
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
    print(
        json.dumps(
            {
                "pass": matrix["classification_totals"]["UNRESOLVED"] == 0,
                **matrix["classification_totals"],
                "gaps": len(matrix["unique_actionable_gaps"]),
            },
            indent=2,
        )
    )
    return 0 if matrix["classification_totals"]["UNRESOLVED"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
