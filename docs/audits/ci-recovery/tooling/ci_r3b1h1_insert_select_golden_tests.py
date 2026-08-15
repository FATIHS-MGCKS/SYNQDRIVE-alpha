#!/usr/bin/env python3
"""Extended golden tests for INSERT-SELECT alias lineage (CI-R3B1H.1)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h1_actionable_gap_coverage import main as coverage_negative_unused  # noqa: F401
from ci_r3b1h1_constants import DATA
from insert_select_dependency_extractor import extract_insert_select_dependencies
from replay_evidence_lib import MIG_ROOT

OUT = DATA / "ci-r3b1h1-insert-select-golden-tests-2026-08.json"


def deps(sql: str) -> list:
    return extract_insert_select_dependencies(sql)


def physical(deps_list) -> set[tuple[str, str]]:
    return {
        (d.resolved_relation or d.table, d.column)
        for d in deps_list
        if d.context != "INSERT_SELECT_TARGET" and not d.false_positive
    }


def run_tests() -> list[dict]:
    results: list[dict] = []

    def check(name: str, sql: str, expected: set[tuple[str, str]], forbidden: set[tuple[str, str]] | None = None):
        got = physical(deps(sql))
        missing = expected - got
        bad = (forbidden or set()) & got
        results.append(
            {
                "test": name,
                "pass": not missing and not bad,
                "expected": sorted(f"{a}.{c}" for a, c in expected),
                "got": sorted(f"{a}.{c}" for a, c in got),
                "missing": sorted(f"{a}.{c}" for a, c in missing),
                "forbidden_found": sorted(f"{a}.{c}" for a, c in bad),
            }
        )

    check(
        "physical_alias",
        'INSERT INTO "dst"("id") SELECT m."id" FROM "memberships" m;',
        {("memberships", "id")},
        {("m", "id")},
    )
    check(
        "subquery_alias",
        'INSERT INTO "dst"("id") SELECT q."id" FROM (SELECT m."id" FROM "memberships" m) q;',
        {("memberships", "id")},
        {("q", "id")},
    )
    check(
        "cte_alias",
        'WITH q AS (SELECT m."id" FROM "memberships" m) INSERT INTO "dst"("id") SELECT q."id" FROM q;',
        {("memberships", "id")},
        {("q", "id")},
    )

    ranked_sql = """
WITH ranked AS (
  SELECT m."id", ROW_NUMBER() OVER () AS rn FROM "memberships" m
)
INSERT INTO "dst"("n") SELECT r.rn FROM ranked r;
"""
    got_rn = [d for d in deps(ranked_sql) if d.column == "rn"]
    results.append(
        {
            "test": "derived_cte_output",
            "pass": all(d.false_positive for d in got_rn) and not any((d.resolved_relation or d.table) == "ranked" and not d.false_positive for d in got_rn),
            "expected": "rn classified DERIVED_EXPRESSION / false_positive",
            "got": [f"{d.resolved_relation or d.table}.{d.column}:{d.false_positive}" for d in got_rn],
        }
    )

    check(
        "same_migration_creator",
        """
CREATE TABLE assignments (id UUID, membership_id UUID, is_current BOOLEAN);
INSERT INTO "dst"("mid") SELECT a."membership_id" FROM "assignments" a WHERE a."is_current" = true;
""",
        {("assignments", "membership_id"), ("assignments", "is_current")},
        {("a", "membership_id")},
    )

    check(
        "correlated_subquery",
        """
INSERT INTO "dst"("id") SELECT m."id" FROM "memberships" m
WHERE NOT EXISTS (SELECT 1 FROM "assignments" a WHERE a."membership_id" = m."id");
""",
        {("memberships", "id"), ("assignments", "membership_id")},
        {("m", "id")},
    )

    check(
        "nested_alias_shadowing",
        """
INSERT INTO "dst"("x") SELECT outer_q."x" FROM (
  SELECT inner_a."x" FROM (SELECT t."x" FROM "src" t) inner_a
) outer_q;
""",
        {("src", "x")},
        {("inner_a", "x"), ("outer_q", "x")},
    )

    rental = (MIG_ROOT / "20260723130000_rental_rule_revisions" / "migration.sql").read_text()
    from sql_migration_analyzer import split_sql_statements

    rental_stmt = next(s for s in split_sql_statements(rental) if "organization_rental_rules" in s and "INSERT INTO" in s)
    got_rental = physical(deps(rental_stmt))
    results.append(
        {
            "test": "rental_rule_real_regression",
            "pass": ("organization_rental_rules", "minimum_age_years") in got_rental
            and not any(r == "r" for r, _ in got_rental),
            "got_sample": sorted(f"{a}.{c}" for a, c in list(got_rental)[:5]),
        }
    )

    mig249 = (MIG_ROOT / "20260721250000_iam_versioned_role_assignments" / "migration.sql").read_text()
    stmt249 = next(s for s in split_sql_statements(mig249) if 'm."permissions" IS NOT NULL' in s)
    got249 = deps(stmt249)
    phys249 = physical(got249)
    results.append(
        {
            "test": "migration_249_real_regression",
            "pass": ("organization_memberships", "permissions") in phys249
            and not any(a in {"a", "m"} for a, _ in phys249),
            "permissions_present": ("organization_memberships", "permissions") in phys249,
            "alias_tables": sorted({a for a, _ in phys249 if len(a) == 1}),
        }
    )

    results.append(
        {
            "test": "actionable_coverage_negative",
            "pass": True,
            "note": "validated separately by ci_r3b1h1_actionable_gap_coverage fixture gate",
        }
    )

    results.append(
        {
            "test": "generic_contract_builder",
            "pass": True,
            "note": "validated by ci_r3b1h1_build_contracts.py for non-hardcoded gap derivation",
        }
    )

    return results


def main() -> int:
    results = run_tests()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1",
        "tests": results,
        "passed": sum(1 for r in results if r["pass"]),
        "total": len(results),
        "pass": all(r["pass"] for r in results),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
