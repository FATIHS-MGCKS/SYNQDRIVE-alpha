#!/usr/bin/env python3
"""Expression dependency coverage validator for CI-R3B1F.1."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f1_constants import DATA, REPO, TIRE_CONSUMER
from expression_dependency_extractor import extract_create_index_dependencies
from sql_migration_analyzer import split_sql_statements

OUT = DATA / "ci-r3b1f1-expression-coverage-validation-2026-08.json"
MATRIX = DATA / "ci-r3b1f1-expression-aware-dependency-matrix-2026-08.json"


def coverage_for_migration(mig: str, matrix_records: list[dict]) -> dict:
    sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
    gaps = []
    for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
        if not re.search(
            r"\b(CREATE\s+(?:UNIQUE\s+)?INDEX|CHECK\s*\(|GENERATED\s+ALWAYS|USING\b|UPDATE\s+\")",
            stmt,
            re.I,
        ):
            continue
        expected: set[tuple[str, str]] = set()
        for dep in extract_create_index_dependencies(stmt):
            expected.add((dep.table, dep.column))
        emitted = {
            (r.get("required_relation") or r.get("required_object"), r.get("required_property"))
            for r in matrix_records
            if r["migration"] == mig
            and r.get("statement_order") == stmt_order
            and r.get("dependency_context")
            in {
                "INDEX_KEY",
                "INDEX_EXPRESSION",
                "PARTIAL_INDEX_PREDICATE",
            }
        }
        missing = expected - emitted
        if missing:
            gaps.append(
                {
                    "migration": mig,
                    "statement_order": stmt_order,
                    "missing": sorted([f"{t}.{c}" for t, c in missing]),
                    "expected": sorted([f"{t}.{c}" for t, c in expected]),
                    "emitted": sorted([f"{t}.{c}" for t, c in emitted if t and c]),
                }
            )
    return {"migration": mig, "coverage_gaps": gaps}


def main() -> int:
    matrix = json.loads(MATRIX.read_text())
    records = matrix["records"]
    scope = matrix["audit_scope"]["scope_migrations"]

    all_gaps = []
    for mig in scope:
        result = coverage_for_migration(mig, records)
        all_gaps.extend(result["coverage_gaps"])

    tire_sql = (REPO / "backend/prisma/migrations" / TIRE_CONSUMER / "migration.sql").read_text()
    tire_deps = extract_create_index_dependencies(tire_sql)
    tire_expected = sorted({f"{d.table}.{d.column}" for d in tire_deps})

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1F.1",
        "migrations_checked": len(scope),
        "expression_coverage_gaps": len(all_gaps),
        "gaps": all_gaps,
        "migration_157_golden_expected": tire_expected,
        "pass": len(all_gaps) == 0,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "gaps": out["expression_coverage_gaps"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
