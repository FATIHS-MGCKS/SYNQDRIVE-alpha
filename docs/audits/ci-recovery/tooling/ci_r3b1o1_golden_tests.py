#!/usr/bin/env python3
"""Golden tests for CI-R3B1O.1."""
from __future__ import annotations

from ci_r3b1o1_m252_authority import build_m252_physical_authority, compare_m252_exact_parity
from ci_r3b1o1_m252_prisma import compare_prisma_to_m252_authority
from ci_r3b1o1_sql_classifier import StatementType, classify_migration_data_risk, classify_statement, migration_has_dml, parse_migration_statements
from ci_r3b1o_constants import MIG_ROOT, M252


def run_golden_tests() -> dict:
    tests = []

    def add(name: str, ok: bool, expected: str, actual: str):
        tests.append({"name": name, "pass": ok, "expected": expected, "actual": actual})

    cascade_sql = """
ALTER TABLE "x"
ADD CONSTRAINT "fk" FOREIGN KEY ("a") REFERENCES "y"("id") ON DELETE CASCADE;
"""
    add(
        "on_delete_cascade_is_ddl",
        classify_statement(cascade_sql) == StatementType.ALTER_TABLE,
        "ALTER TABLE",
        classify_statement(cascade_sql).value,
    )
    add(
        "on_delete_cascade_not_dml",
        not migration_has_dml(cascade_sql),
        "no DML",
        str(migration_has_dml(cascade_sql)),
    )

    delete_sql = 'DELETE FROM "x" WHERE id = 1;'
    add("delete_from_is_dml", classify_statement(delete_sql) == StatementType.DELETE, "DELETE", classify_statement(delete_sql).value)

    comment_sql = "-- DELETE old rows\nCREATE INDEX \"i\" ON \"t\"(\"c\");"
    add("comment_delete_not_dml", not migration_has_dml(comment_sql), "no DML", str(migration_has_dml(comment_sql)))

    string_sql = "CREATE INDEX \"i\" ON \"t\"(\"c\") WHERE note = 'DELETE old rows';"
    add("string_delete_word_not_dml_statement", not migration_has_dml(string_sql), "no DML", str(migration_has_dml(string_sql)))

    cte_sql = "WITH x AS (SELECT 1) UPDATE \"t\" SET c = 1;"
    add("cte_update_is_dml", classify_statement(cte_sql) == StatementType.UPDATE, "UPDATE", classify_statement(cte_sql).value)

    m252_sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    stmts = parse_migration_statements(m252_sql)
    add("m252_no_dml", not migration_has_dml(m252_sql), "no DML", str(migration_has_dml(m252_sql)))
    add("m252_on_delete_fk_count", sum(1 for s in stmts if "ON DELETE CASCADE" in s["sql"]) >= 2, ">=2", str(sum(1 for s in stmts if "ON DELETE CASCADE" in s["sql"])))

    cls, _, _ = classify_migration_data_risk(m252_sql)
    add("m252_data_risk_not_high", cls != "DATA_DEPENDENT_HIGH", "not HIGH", cls)

    prisma_cmp = compare_prisma_to_m252_authority()
    add("prisma_m252_mapping_drift_detected", prisma_cmp["drift_count"] > 0, ">0", str(prisma_cmp["drift_count"]))

    authority = build_m252_physical_authority()

    def missing_fk_run_sql(q: str) -> str:
        if "pg_constraint" in q or "pg_index" in q:
            return ""
        if "information_schema.tables" in q:
            return "1"
        if "pg_attribute" in q:
            return "text|NO|"
        return "0"

    bad = compare_m252_exact_parity(authority, missing_fk_run_sql)
    add("m252_missing_fk_fails_parity", bad["pass"] is False, "FAIL", str(bad["pass"]))

    passed = sum(1 for t in tests if t["pass"])
    return {"schema_version": 1, "phase": "CI-R3B1O.1", "tests": tests, "total": len(tests), "passed": passed, "pass": passed == len(tests)}
