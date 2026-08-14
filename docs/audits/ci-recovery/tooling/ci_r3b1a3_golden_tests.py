#!/usr/bin/env python3
"""Golden tests for CI-R3B1A.3 dependency closure and chronology."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from prisma_schema_authority import parse_default  # noqa: E402
from repair_closure import apply_fk_chronology  # noqa: E402
from sql_migration_analyzer import (  # noqa: E402
    AnalyzerContext,
    CreatorRef,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    creator_for_column,
    creator_for_table,
    mig_order,
    register_table,
    split_sql_statements,
)

REPO = Path(__file__).resolve().parents[4]
FAILURES: list[str] = []


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def test_column_fallback_removed() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1", "mig2"],
        scope_ord={"mig1": 1, "mig2": 2},
        all_migs=["mig1", "mig2"],
    )
    register_table(ctx, "example_table", "mig1", 1)
    ctx.column_creators["example_table"]["id"] = CreatorRef("mig1", 1, 1)
    assert_true(creator_for_table(ctx, "example_table") is not None, "table creator exists")
    assert_true(creator_for_column(ctx, "example_table", "missing_column") is None, "no column fallback")

    state = SchemaState()
    state.tables.add("example_table")
    state.columns["example_table"].add("id")
    sql = 'ALTER TABLE "example_table" ALTER COLUMN "missing_column" SET NOT NULL;'
    check_statement_dependencies(ctx, "mig2", 1, sql, state)
    rows = [r for r in ctx.records if r.get("required_property") == "missing_column"]
    assert_true(rows and rows[0]["classification"] != "VALID", "missing column not VALID")
    assert_true(rows and rows[0]["classification"] == "MISSING_HISTORY", "missing column MISSING_HISTORY")


def test_existing_column_valid() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1", "mig2"],
        scope_ord={"mig1": 1, "mig2": 2},
        all_migs=["mig1", "mig2"],
    )
    register_table(ctx, "example_table", "mig1", 1)
    ctx.column_creators["example_table"]["foo"] = CreatorRef("mig1", 1, 1)
    state = SchemaState()
    state.tables.add("example_table")
    state.columns["example_table"].add("foo")
    sql = 'ALTER TABLE "example_table" ALTER COLUMN "foo" SET NOT NULL;'
    check_statement_dependencies(ctx, "mig2", 1, sql, state)
    rows = [r for r in ctx.records if r.get("required_property") == "foo"]
    assert_true(rows and rows[0]["classification"] == "VALID", "existing column VALID")


def test_use_before_add_column() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1"],
        scope_ord={"mig1": 1},
        all_migs=["mig1"],
    )
    register_table(ctx, "demo", "mig1", 1)
    state = SchemaState()
    state.tables.add("demo")
    sql = """
ALTER TABLE "demo" ALTER COLUMN "foo" SET NOT NULL;
ALTER TABLE "demo" ADD COLUMN "foo" TEXT;
"""
    for n, stmt in enumerate(split_sql_statements(sql), 1):
        check_statement_dependencies(ctx, "mig1", n, stmt, state)
        apply_statement(ctx, "mig1", n, stmt, state)
    rows = [r for r in ctx.records if r.get("required_property") == "foo"]
    assert_true(any(r["classification"] in {"MISSING_HISTORY", "ORDERING_DEFECT"} for r in rows), "use before add defect")


def test_add_column_before_use() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1"],
        scope_ord={"mig1": 1},
        all_migs=["mig1"],
    )
    register_table(ctx, "demo", "mig1", 1)
    state = SchemaState()
    state.tables.add("demo")
    sql = """
ALTER TABLE "demo" ADD COLUMN "foo" TEXT;
ALTER TABLE "demo" ALTER COLUMN "foo" SET NOT NULL;
"""
    for n, stmt in enumerate(split_sql_statements(sql), 1):
        check_statement_dependencies(ctx, "mig1", n, stmt, state)
        apply_statement(ctx, "mig1", n, stmt, state)
    alter_rows = [
        r
        for r in ctx.records
        if r.get("required_property") == "foo" and "ALTER COLUMN" in r["operation"]
    ]
    assert_true(alter_rows and alter_rows[-1]["classification"] == "VALID", "add then alter valid")


def test_enum_use_before_create() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1"],
        scope_ord={"mig1": 1},
        all_migs=["mig1"],
    )
    state = SchemaState()
    sql = """
CREATE TABLE "demo" ("kind" "InsightType" NOT NULL);
CREATE TYPE "InsightType" AS ENUM ('A');
"""
    bad = []
    for n, stmt in enumerate(split_sql_statements(sql), 1):
        before = len(ctx.records)
        check_statement_dependencies(ctx, "mig1", n, stmt, state)
        for r in ctx.records[before:]:
            if r["required_object"] == "InsightType":
                bad.append(r["classification"])
        apply_statement(ctx, "mig1", n, stmt, state)
    assert_true("MISSING_HISTORY" in bad or "ORDERING_DEFECT" in bad, "enum use before create defect")


def test_enum_create_before_use() -> None:
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=REPO / "backend/prisma/migrations",
        scope=["mig1"],
        scope_ord={"mig1": 1},
        all_migs=["mig1"],
    )
    state = SchemaState()
    sql = """
CREATE TYPE "InsightType" AS ENUM ('A');
CREATE TABLE "demo" ("kind" "InsightType" NOT NULL);
"""
    enum_records = []
    for n, stmt in enumerate(split_sql_statements(sql), 1):
        before = len(ctx.records)
        check_statement_dependencies(ctx, "mig1", n, stmt, state)
        enum_records.extend(
            r
            for r in ctx.records[before:]
            if r["required_object"] == "InsightType" and "enum" in r["operation"].lower()
        )
        apply_statement(ctx, "mig1", n, stmt, state)
    assert_true(len(enum_records) == 0, "enum create before use produces no enum defect records")


def test_immediate_unavailable_fk() -> None:
    fk = apply_fk_chronology(
        "org_tasks",
        {
            "local_columns": ["invoice_id"],
            "referenced_relation": "org_invoices",
            "referenced_columns": ["id"],
            "on_delete": "SET NULL",
            "on_update": "CASCADE",
        },
    )
    assert_true(fk["chronology"].startswith("CAN_BE_DEFERRED"), "unavailable FK deferred")
    assert_true(not fk["required_before_first_consumer"], "deferred FK not required before FC")


def test_deferred_fk_allows_table() -> None:
    contracts = json.loads(
        (REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json").read_text()
    )
    org_tasks = next(c for c in contracts["contracts"] if c["object"] == "org_tasks")
    inv = next(f for f in org_tasks["foreign_keys"] if f["referenced_relation"] == "org_invoices")
    assert_true(any(c["column"] == "invoice_id" for c in org_tasks["columns"]), "invoice_id column exists")
    assert_true(inv["chronology"].startswith("CAN_BE_DEFERRED"), "invoice FK deferred")


def test_duplicate_enum_validator() -> None:
    contracts = json.loads(
        (REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json").read_text()
    )
    for c in contracts["contracts"]:
        keys = [(d.get("schema", "public"), d["name"]) for d in c.get("enum_dependencies", [])]
        assert_true(len(keys) == len(set(keys)), f"{c['object']} duplicate enum deps")


def test_default_semantics() -> None:
    cases = [
        ("@default(uuid())", "String", "APPLICATION_OR_PRISMA_GENERATED"),
        ("@default(now())", "DateTime", "DATABASE_DEFAULT"),
        ("@default(autoincrement())", "Int", "IDENTITY_OR_SEQUENCE_GENERATED"),
        ("@default(OPEN)", "TaskStatus", "DATABASE_DEFAULT"),
        ("@default(1.0)", "Float", "DATABASE_DEFAULT"),
        ("@default(0)", "Int", "DATABASE_DEFAULT"),
        ("@default(false)", "Boolean", "DATABASE_DEFAULT"),
    ]
    for expr, typ, expected in cases:
        got = parse_default(expr, typ)["default_semantics"]
        assert_true(got == expected, f"{expr} expected {expected} got {got}")


def main() -> int:
    test_column_fallback_removed()
    test_existing_column_valid()
    test_use_before_add_column()
    test_add_column_before_use()
    test_enum_use_before_create()
    test_enum_create_before_use()
    test_immediate_unavailable_fk()
    test_deferred_fk_allows_table()
    test_duplicate_enum_validator()
    test_default_semantics()
    if FAILURES:
        print("GOLDEN TEST FAILURES:")
        for f in FAILURES:
            print("-", f)
        return 1
    print("PASS: all CI-R3B1A.3 golden tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
