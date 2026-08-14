#!/usr/bin/env python3
"""Build CI-R3B1D post-vendor migration dependency matrix (static audit)."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sql_migration_analyzer import (  # noqa: E402
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    prescan_creators,
    split_sql_statements,
    unique_defect_objects,
)

OUT_MATRIX = (
    REPO / "docs/audits/ci-recovery/data/ci-r3b1d-post-vendor-dependency-matrix-2026-08.json"
)

FIRST_MIG = "20260311224040_init"
SCOPE_FIRST = "20260613210000_vendor_management_overhaul"


def global_mig_order(all_migs: list[str], name: str | None) -> int | None:
    if name is None:
        return None
    if name in all_migs:
        return all_migs.index(name) + 1
    return None


def build_post_vendor_matrix(repo: Path) -> dict[str, Any]:
    mig_dir = repo / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    scope = all_migs[all_migs.index(SCOPE_FIRST) :]
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
    pre_scope = all_migs[: all_migs.index(SCOPE_FIRST)]
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
    total = len(ctx.records)
    return {
        "schema_version": 1,
        "audit_scope": {
            "first_migration": SCOPE_FIRST,
            "last_migration": all_migs[-1],
            "history_first_migration": FIRST_MIG,
            "total_migrations_in_repository": len(all_migs),
            "migrations_scanned": len(scope),
            "pre_scope_migrations_applied_to_state": len(pre_scope),
            "dependency_checks_generated": total,
            "scope_migrations": scope,
            "statement_level": True,
            "creator_prescan_scope": "full_history_from_init",
            "state_warmup_scope": f"{FIRST_MIG}_through_{pre_scope[-1] if pre_scope else 'none'}",
        },
        "classification_totals": {
            "TOTAL": total,
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


def main() -> int:
    matrix = build_post_vendor_matrix(REPO)
    defects = unique_defect_objects(
        {"dependencies": matrix["records"], "classification_totals": matrix["classification_totals"]}
    )
    matrix["unique_genuine_defect_objects"] = defects

    OUT_MATRIX.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATRIX.write_text(json.dumps(matrix, indent=2) + "\n")

    totals = matrix["classification_totals"]
    print(json.dumps(totals, indent=2))
    print("unique defect objects:", [d["object"] for d in defects])
    if totals["UNRESOLVED"] != 0:
        print("FAIL: UNRESOLVED != 0")
        return 1
    if sum(totals[k] for k in totals if k != "TOTAL") != totals["TOTAL"]:
        print("FAIL: classification sum mismatch")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
