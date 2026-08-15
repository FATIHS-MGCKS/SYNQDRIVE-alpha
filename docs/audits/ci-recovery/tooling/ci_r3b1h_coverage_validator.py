#!/usr/bin/env python3
"""INSERT-SELECT coverage validator — independent construct scan vs emitted deps (CI-R3B1H)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h_constants import DATA, IAM_CONSUMER, INSERT_SELECT_GAP_CONTEXTS, REPO
from expression_dependency_extractor import referenced_identifiers_for_coverage
from insert_select_dependency_extractor import extract_insert_select_dependencies, extract_insert_select_from_migration
from sql_migration_analyzer import split_sql_statements
from sql_scope_resolver import parse_with_ctes, split_from_items, parse_from_item, _extract_where_clause, _split_select_list

OUT = DATA / "ci-r3b1h-insert-select-coverage-validation-2026-08.json"
MATRIX = DATA / "ci-r3b1h-insert-select-dependency-matrix-2026-08.json"


def independent_physical_refs(stmt: str) -> set[tuple[str, str]]:
    """Independent regex/scope scan — not calling extract_insert_select_dependencies."""
    refs: set[tuple[str, str]] = set()
    ctes, remainder = parse_with_ctes(stmt)
    m = re.search(r'INSERT\s+INTO\s+"([^"]+)"\s*\(([^)]+)\)', remainder, re.I | re.S)
    if not m:
        return refs
    target = m.group(1)
    for col in re.findall(r'"([^"]+)"', m.group(2)):
        refs.add((target, col))

    sel_m = re.search(r"\bSELECT\b", remainder, re.I)
    if not sel_m:
        return refs
    body = remainder[sel_m.end() :]
    from_m = re.search(r"\bFROM\b", body, re.I)
    if not from_m:
        return refs
    select_list = body[: from_m.start()]
    rest = body[from_m.end() :]
    where = _extract_where_clause(rest) or ""
    from_clause = rest
    if where:
        wm = re.search(r"\bWHERE\b", rest, re.I)
        if wm:
            from_clause = rest[: wm.start()]

    aliases: dict[str, str] = {}
    for part in split_from_items(from_clause.strip()):
        bind = parse_from_item(part)
        if bind.relation and bind.alias:
            aliases[bind.alias] = bind.relation
        elif bind.relation:
            aliases[bind.relation] = bind.relation

    def scan_expr(expr: str) -> None:
        for alias, col in re.findall(r'"([^"]+)"\."([^"]+)"', expr):
            if alias in aliases:
                refs.add((aliases[alias], col))
        for alias, col in re.findall(r"([a-z_][a-z0-9_]*)\.\"([^\"]+)\"", expr, re.I):
            if alias in aliases:
                refs.add((aliases[alias], col))

    for expr in _split_select_list(select_list):
        scan_expr(expr)
    scan_expr(where)
    return refs


def coverage_for_migration(mig: str, matrix_records: list[dict]) -> list[dict]:
    sql = (REPO / "backend/prisma/migrations" / mig / "migration.sql").read_text()
    gaps = []
    for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
        if not re.search(r"INSERT\s+INTO\b", stmt, re.I) or not re.search(r"\bSELECT\b", stmt, re.I):
            continue
        expected = independent_physical_refs(stmt)
        emitted = {
            (r.get("required_relation") or r.get("required_object"), r.get("required_property"))
            for r in matrix_records
            if r["migration"] == mig
            and r.get("statement_order") == stmt_order
            and r.get("dependency_context") in INSERT_SELECT_GAP_CONTEXTS
            and r.get("required_object_type") == "column"
            and r.get("classification") != "FALSE_POSITIVE"
        }
        emitted = {(t, c) for t, c in emitted if t and c}
        missing = expected - emitted
        if missing:
            gaps.append(
                {
                    "migration": mig,
                    "statement_order": stmt_order,
                    "missing": sorted(f"{t}.{c}" for t, c in missing),
                    "expected_independent": sorted(f"{t}.{c}" for t, c in expected),
                    "emitted_matrix": sorted(f"{t}.{c}" for t, c in emitted),
                }
            )
    return gaps


def main() -> int:
    matrix = json.loads(MATRIX.read_text()) if MATRIX.is_file() else {"records": [], "audit_scope": {"scope_migrations": []}}
    records = matrix.get("records", [])
    scope = matrix.get("audit_scope", {}).get("scope_migrations") or []
    if not scope:
        from replay_evidence_lib import migration_dirs
        from ci_r3b1h_constants import FIRST_SCANNED

        all_m = migration_dirs()
        scope = all_m[all_m.index(FIRST_SCANNED) :]

    all_gaps = []
    for mig in scope:
        all_gaps.extend(coverage_for_migration(mig, records))

    mig249_sql = (REPO / "backend/prisma/migrations" / IAM_CONSUMER / "migration.sql").read_text()
    mig249_deps = []
    for stmt_order, stmt, deps in extract_insert_select_from_migration(mig249_sql):
        mig249_deps.extend([(d.table, d.column) for d in deps if d.context != "INSERT_SELECT_TARGET"])
    mig249_expected = ("organization_memberships", "permissions") in mig249_deps

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "migrations_checked": len(scope),
        "coverage_gaps": len(all_gaps),
        "gaps": all_gaps,
        "migration_249_permissions_represented": mig249_expected,
        "pass": len(all_gaps) == 0 and mig249_expected,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "gaps": out["coverage_gaps"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
