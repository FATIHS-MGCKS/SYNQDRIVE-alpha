#!/usr/bin/env python3
"""INSERT-SELECT coverage validator (CI-R3B1H.1)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_constants import DATA, FIRST_SCANNED, INSERT_SELECT_GAP_CONTEXTS, REPO
from insert_select_dependency_extractor import extract_insert_select_dependencies
from sql_migration_analyzer import split_sql_statements

OUT = DATA / "ci-r3b1h1-insert-select-coverage-validation-2026-08.json"
MATRIX = DATA / "ci-r3b1h1-insert-select-dependency-matrix-2026-08.json"


def physical_from_extractor(stmt: str) -> set[tuple[str, str]]:
    return {
        (d.resolved_relation or d.table, d.column)
        for d in extract_insert_select_dependencies(stmt)
        if d.context != "INSERT_SELECT_TARGET" and not d.false_positive
    }


def main() -> int:
    matrix = json.loads(MATRIX.read_text()) if MATRIX.is_file() else {"records": []}
    records = matrix.get("records", [])
    scope = matrix.get("audit_scope", {}).get("scope_migrations") or []
    if not scope:
        mig_dir = REPO / "backend/prisma/migrations"
        all_m = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
        scope = all_m[all_m.index(FIRST_SCANNED) :]

    gaps = []
    for mig in scope:
        sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            if not re.search(r"INSERT\s+INTO\b", stmt, re.I) or not re.search(r"\bSELECT\b", stmt, re.I):
                continue
            expected = physical_from_extractor(stmt)
            emitted = {
                (r.get("resolved_relation") or r.get("required_relation"), r.get("required_property"))
                for r in records
                if r["migration"] == mig
                and r.get("statement_order") == stmt_order
                and r.get("dependency_context") in INSERT_SELECT_GAP_CONTEXTS
                and r.get("classification") not in {"FALSE_POSITIVE"}
            }
            emitted = {(t, c) for t, c in emitted if t and c}
            missing = expected - emitted
            if missing:
                gaps.append({"migration": mig, "statement_order": stmt_order, "missing": sorted(f"{a}.{c}" for a, c in missing)})

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "coverage_gaps": len(gaps),
        "gaps": gaps,
        "pass": len(gaps) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "gaps": out["coverage_gaps"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
