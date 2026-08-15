#!/usr/bin/env python3
"""Golden tests for INSERT ... SELECT dependency extraction (CI-R3B1H)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from insert_select_dependency_extractor import extract_insert_select_dependencies
from replay_evidence_lib import MIG_ROOT

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "ci-r3b1h-insert-select-golden-tests-2026-08.json"


def deps_set(sql: str) -> set[tuple[str, str, str]]:
    return {(d.table, d.column, d.context) for d in extract_insert_select_dependencies(sql)}


def source_cols(deps: set[tuple[str, str, str]]) -> set[tuple[str, str]]:
    return {(t, c) for t, c, ctx in deps if ctx != "INSERT_SELECT_TARGET" and not t.startswith("dst")}


def run_tests() -> list[dict]:
    results: list[dict] = []

    def check(name: str, sql: str, expected_sources: set[tuple[str, str]], forbidden: set[tuple[str, str]] | None = None):
        got = source_cols(deps_set(sql))
        missing = expected_sources - got
        extra_forbidden = (forbidden or set()) & got
        passed = not missing and not extra_forbidden
        results.append(
            {
                "test": name,
                "pass": passed,
                "expected": sorted(f"{t}.{c}" for t, c in expected_sources),
                "got": sorted(f"{t}.{c}" for t, c in got),
                "missing": sorted(f"{t}.{c}" for t, c in missing),
                "forbidden_found": sorted(f"{t}.{c}" for t, c in extra_forbidden),
            }
        )

    check(
        "basic_insert_select",
        'INSERT INTO "dst"("a", "b") SELECT s."x", s."y" FROM "src" s;',
        {("src", "x"), ("src", "y")},
    )

    check(
        "where_dependencies",
        'INSERT INTO "dst"("a") SELECT s."x" FROM "src" s WHERE s."active" = true AND s."deleted_at" IS NULL;',
        {("src", "x"), ("src", "active"), ("src", "deleted_at")},
    )

    check(
        "join_dependencies",
        'INSERT INTO "dst"("a") SELECT s."x" FROM "src" s JOIN "other" o ON o."id" = s."other_id" WHERE o."enabled" = true;',
        {("src", "x"), ("src", "other_id"), ("other", "id"), ("other", "enabled")},
    )

    check(
        "case_dependencies",
        'INSERT INTO "dst"("v") SELECT CASE WHEN s."active" THEN s."value" ELSE s."fallback" END FROM "src" s;',
        {("src", "active"), ("src", "value"), ("src", "fallback")},
    )

    check(
        "json_key_exclusion",
        'INSERT INTO "dst"("v") SELECT s."metadata"->>\'catalogKey\' FROM "src" s;',
        {("src", "metadata")},
        {("src", "catalogKey")},
    )

    check(
        "cast_exclusion",
        'INSERT INTO "dst"("v") SELECT s."permissions"::jsonb FROM "src" s;',
        {("src", "permissions")},
        {("src", "jsonb")},
    )

    check(
        "coalesce_source",
        'INSERT INTO "dst"("p") SELECT COALESCE(m."permissions", \'{}\'::jsonb) FROM "memberships" m;',
        {("memberships", "permissions")},
        {("memberships", "coalesce"), ("memberships", "jsonb")},
    )

    check(
        "string_literal_exclusion",
        'SELECT \'permissions\' FROM "src" s;',
        set(),
        {("src", "permissions")},
    )

    check(
        "function_exclusion",
        'INSERT INTO "dst"("v") SELECT lower(s."email") FROM "src" s;',
        {("src", "email")},
        {("src", "lower")},
    )

    cte_sql = """
WITH ranked AS (
  SELECT m."id", m."permissions"
  FROM "memberships" m
)
INSERT INTO "dst"("id", "permissions")
SELECT r."id", r."permissions"
FROM ranked r;
"""
    check(
        "cte_lineage",
        cte_sql,
        {("memberships", "id"), ("memberships", "permissions")},
        {("ranked", "permissions"), ("dst", "ranked")},
    )

    mig249 = (MIG_ROOT / "20260721250000_iam_versioned_role_assignments" / "migration.sql").read_text()
    stmt25 = [s for s in mig249.split(";") if 'm."permissions" IS NOT NULL' in s][0] + ";"
    got249 = deps_set(stmt25)
    perm = ("organization_memberships", "permissions", "INSERT_SELECT_WHERE")
    results.append(
        {
            "test": "real_migration_249_permissions",
            "pass": perm in got249,
            "expected": ["organization_memberships.permissions"],
            "got": sorted(f"{d[0]}.{d[1]}" for d in got249 if d[2] != "INSERT_SELECT_TARGET"),
        }
    )

    return results


def main() -> int:
    results = run_tests()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H",
        "tests": results,
        "pass": all(r["pass"] for r in results),
        "passed": sum(1 for r in results if r["pass"]),
        "total": len(results),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
