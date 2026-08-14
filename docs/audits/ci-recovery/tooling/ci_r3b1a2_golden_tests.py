#!/usr/bin/env python3
"""Golden tests for CI-R3B1A.2 analyzer and validator."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from prisma_schema_authority import extract_model_contract, parse_default, prisma_scalar_to_postgres  # noqa: E402
from sql_migration_analyzer import (  # noqa: E402
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    classify_record,
    CreatorRef,
    split_sql_statements,
)

FAILURES: list[str] = []


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def test_type_mapping() -> None:
    assert_true(prisma_scalar_to_postgres("String", "") == "TEXT", "String->TEXT")
    assert_true(
        prisma_scalar_to_postgres("DateTime", "") == "TIMESTAMP(3) WITHOUT TIME ZONE",
        "DateTime mapping",
    )
    assert_true(prisma_scalar_to_postgres("Json", "") == "JSONB", "Json->JSONB")
    assert_true(prisma_scalar_to_postgres("Int", "") == "INTEGER", "Int->INTEGER")


def test_map_resolution() -> None:
    schema = """
model Vehicle {
  vehicleId String @map("vehicle_id")
  @@map("vehicles")
}
"""
    # use OrgTask fineId instead since Vehicle model incomplete
    schema = subprocess.check_output(
        ["git", "-C", str(Path(__file__).resolve().parents[4]), "show", "77c26dad:backend/prisma/schema.prisma"],
        text=True,
    )
    c = extract_model_contract(schema, "OrgTask")
    cols = {x["prisma_field"]: x["column"] for x in c["columns"]}
    assert_true(cols.get("vehicleId") == "vehicle_id", "vehicleId maps to vehicle_id")


def test_relation_exclusion() -> None:
    schema = subprocess.check_output(
        ["git", "-C", str(Path(__file__).resolve().parents[4]), "show", "77c26dad:backend/prisma/schema.prisma"],
        text=True,
    )
    c = extract_model_contract(schema, "OrgTask")
    col_names = {x["column"] for x in c["columns"]}
    assert_true("fine" not in col_names, "OrgTask.fine excluded")
    assert_true("invoice" not in col_names, "OrgTask.invoice excluded")
    assert_true("fine_id" in col_names, "fine_id present")


def test_fk_extraction() -> None:
    schema = subprocess.check_output(
        ["git", "-C", str(Path(__file__).resolve().parents[4]), "show", "17019787:backend/prisma/schema.prisma"],
        text=True,
    )
    c = extract_model_contract(schema, "BatteryEvidence")
    fks = {(tuple(f["local_columns"]), f["referenced_relation"], f["on_delete"]) for f in c["foreign_keys"]}
    assert_true((("vehicle_id",), "vehicles", "CASCADE") in fks, "BatteryEvidence vehicle FK")
    assert_true("vehicle" not in {x["column"] for x in c["columns"]}, "vehicle nav excluded")


def test_unique_extraction() -> None:
    schema = subprocess.check_output(
        ["git", "-C", str(Path(__file__).resolve().parents[4]), "show", "77c26dad:backend/prisma/schema.prisma"],
        text=True,
    )
    c = extract_model_contract(schema, "OrgInvoice")
    uniques = c["unique_constraints"]
    assert_true(any("invoice_number" in u["columns"] for u in uniques), "invoice_number unique")


def test_default_parsing() -> None:
    for expr, expected in [
        ('@default(uuid())', "uuid()"),
        ('@default(now())', "now()"),
        ('@default(autoincrement())', "autoincrement()"),
        ('@default(OPEN)', "OPEN"),
    ]:
        got = parse_default(expr)["prisma_default"]
        assert_true(got == expected, f"default parse {expr} got {got}")


def test_enum_dependency_ordering() -> None:
    repo = Path(__file__).resolve().parents[4]
    ctx = AnalyzerContext(
        repo=repo,
        mig_dir=repo / "backend/prisma/migrations",
        scope=["test_mig"],
        scope_ord={"test_mig": 1},
        all_migs=["test_mig"],
    )
    state = SchemaState()
    sql_use_before_create = """
CREATE TABLE "demo" ("kind" "InsightType" NOT NULL);
CREATE TYPE "InsightType" AS ENUM ('A');
"""
    stmts = split_sql_statements(sql_use_before_create)
    classes = []
    for n, stmt in enumerate(stmts, 1):
        before = len(ctx.records)
        check_statement_dependencies(ctx, "test_mig", n, stmt, state)
        for rec in ctx.records[before:]:
            if rec["required_object"] == "InsightType":
                classes.append(rec["classification"])
        apply_statement(ctx, "test_mig", n, stmt, state)
    assert_true("MISSING_HISTORY" in classes, "enum use before create classified defect")


def test_statement_order_create_before_use() -> None:
    repo = Path(__file__).resolve().parents[4]
    ctx = AnalyzerContext(
        repo=repo,
        mig_dir=repo / "backend/prisma/migrations",
        scope=["test_mig"],
        scope_ord={"test_mig": 1},
        all_migs=["test_mig"],
    )
    state = SchemaState()
    sql = """
CREATE TABLE "demo" ("id" TEXT PRIMARY KEY);
CREATE INDEX "demo_id_idx" ON "demo"("id");
"""
    for n, stmt in enumerate(split_sql_statements(sql), 1):
        check_statement_dependencies(ctx, "test_mig", n, stmt, state)
        apply_statement(ctx, "test_mig", n, stmt, state)
    idx_rows = [r for r in ctx.records if r["operation"] == "CREATE INDEX"]
    assert_true(idx_rows and idx_rows[0]["classification"] == "VALID", "create before index valid")


def test_missing_column_detection() -> None:
    repo = Path(__file__).resolve().parents[4]
    ctx = AnalyzerContext(
        repo=repo,
        mig_dir=repo / "backend/prisma/migrations",
        scope=["test_mig"],
        scope_ord={"test_mig": 1},
        all_migs=["test_mig"],
    )
    state = SchemaState()
    state.tables.add("demo")
    state.columns["demo"].add("id")
    sql = 'ALTER TABLE "demo" ALTER COLUMN "missing_col" TYPE TEXT;'
    check_statement_dependencies(ctx, "test_mig", 1, sql, state)
    rows = [r for r in ctx.records if r.get("required_property") == "missing_col"]
    assert_true(rows and rows[0]["classification"] == "MISSING_HISTORY", "missing column detected")


def main() -> int:
    test_type_mapping()
    test_map_resolution()
    test_relation_exclusion()
    test_fk_extraction()
    test_unique_extraction()
    test_default_parsing()
    test_enum_dependency_ordering()
    test_statement_order_create_before_use()
    test_missing_column_detection()
    if FAILURES:
        print("GOLDEN TEST FAILURES:")
        for f in FAILURES:
            print("-", f)
        return 1
    print("PASS: all golden tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
