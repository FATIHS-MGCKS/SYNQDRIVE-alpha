#!/usr/bin/env python3
"""Creator-state regression fixtures and analyzer chronology tests (CI-R3B1F.1)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from migration_creator_state import parse_alter_table_actions, parse_create_table_statement
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    classify_record,
    creator_for_column,
    mig_order,
    prescan_creators,
    resolve_column_dependency,
    split_sql_statements,
    CreatorRef,
)


REPO = Path(__file__).resolve().parents[4]
MIG_DIR = REPO / "backend/prisma/migrations"


def _ctx() -> AnalyzerContext:
    all_migs = sorted(p.name for p in MIG_DIR.iterdir() if p.is_dir())
    scope = all_migs[:10]
    return AnalyzerContext(
        repo=REPO,
        mig_dir=MIG_DIR,
        scope=scope,
        scope_ord={m: i + 1 for i, m in enumerate(scope)},
        all_migs=all_migs,
    )


def _ensure_migration(ctx: AnalyzerContext, mig: str) -> None:
    if mig not in ctx.all_migs:
        ctx.all_migs.append(mig)
    if mig not in ctx.scope_ord:
        ctx.scope_ord[mig] = ctx.all_migs.index(mig) + 1


def prescan_statements(ctx: AnalyzerContext, migrations: list[tuple[str, list[str]]]) -> None:
    dummy = SchemaState()
    for mig, statements in migrations:
        _ensure_migration(ctx, mig)
        for stmt_order, stmt in enumerate(statements, 1):
            apply_statement(ctx, mig, stmt_order, stmt, dummy)


def _replay_statements(
    mig: str,
    statements: list[str],
    prescan: list[tuple[str, list[str]]] | None = None,
) -> tuple[AnalyzerContext, SchemaState, list[dict]]:
    ctx = _ctx()
    _ensure_migration(ctx, mig)
    prescan_statements(ctx, prescan or [(mig, statements)])
    state = SchemaState()
    records: list[dict] = []
    ctx.records.clear()
    for stmt_order, stmt in enumerate(statements, 1):
        check_statement_dependencies(ctx, mig, stmt_order, stmt, state)
        records.extend(ctx.records[len(records) :])
        apply_statement(ctx, mig, stmt_order, stmt, state)
    return ctx, state, records


class CreatorParserTests(unittest.TestCase):
    def test_fixture_a_multi_add_alter(self) -> None:
        stmt = """
        ALTER TABLE "sample"
          ADD COLUMN "a" TEXT,
          ADD COLUMN "b" INTEGER,
          ADD COLUMN "c" BOOLEAN;
        """
        actions = parse_alter_table_actions(stmt)
        self.assertEqual([a.column for a in actions if a.kind == "ADD_COLUMN"], ["a", "b", "c"])

    def test_fixture_b_create_table_columns(self) -> None:
        stmt = """
        CREATE TABLE sample_table (
          id UUID NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL,
          CONSTRAINT sample_table_pkey PRIMARY KEY (id)
        );
        """
        table, cols, constraints = parse_create_table_statement(stmt)
        self.assertEqual(table, "sample_table")
        self.assertEqual([c.name for c in cols], ["id", "status", "created_at"])
        self.assertEqual(constraints, [])

    def test_fixture_c_same_migration_alter_then_index(self) -> None:
        stmts = [
            'CREATE TABLE "x" ("id" TEXT);',
            'ALTER TABLE "x" ADD COLUMN "status" TEXT;',
            'CREATE INDEX "x_status_idx" ON "x"("status");',
        ]
        ctx, state, records = _replay_statements("20260101000000_fixture", stmts[1:], prescan=[("20260101000000_fixture", stmts)])
        self.assertIn("status", state.columns["x"])
        idx_records = [
            r
            for r in records
            if r.get("required_property") == "status" and r.get("dependency_context") == "INDEX_KEY"
        ]
        self.assertTrue(idx_records)
        self.assertEqual(idx_records[0]["classification"], "VALID")


class CreatorChronologyTests(unittest.TestCase):
    def test_unquoted_create_table_index_valid(self) -> None:
        stmts = [
            """CREATE TABLE health (
              id UUID NOT NULL,
              status TEXT NOT NULL,
              active BOOLEAN NOT NULL DEFAULT true
            );""",
            "CREATE INDEX health_status_idx ON health(status);",
        ]
        _, _, records = _replay_statements("20260101000001_fixture", stmts)
        rec = next(r for r in records if r.get("required_property") == "status")
        self.assertEqual(rec["classification"], "VALID")

    def test_quoted_create_table_equivalent(self) -> None:
        stmts = [
            'CREATE TABLE "health2" ("id" UUID NOT NULL, "status" TEXT NOT NULL);',
            'CREATE INDEX "health2_status_idx" ON "health2"("status");',
        ]
        _, _, records = _replay_statements("20260101000002_fixture", stmts)
        rec = next(r for r in records if r.get("required_property") == "status")
        self.assertEqual(rec["classification"], "VALID")

    def test_earlier_migration_creator(self) -> None:
        ctx = _ctx()
        mig_a = "20260101000003_a"
        mig_b = "20260101000004_b"
        ctx.all_migs = [mig_a, mig_b]
        ctx.scope_ord = {mig_a: 1, mig_b: 2}
        prescan_statements(
            ctx,
            [
                (mig_a, ['ALTER TABLE "t" ADD COLUMN "fingerprint" TEXT;']),
                (mig_b, ['CREATE INDEX "t_fingerprint_idx" ON "t"("fingerprint");']),
            ],
        )
        state = SchemaState()
        apply_statement(ctx, mig_a, 1, 'ALTER TABLE "t" ADD COLUMN "fingerprint" TEXT;', state)
        ctx.records.clear()
        check_statement_dependencies(
            ctx,
            mig_b,
            1,
            'CREATE INDEX "t_fingerprint_idx" ON "t"("fingerprint");',
            state,
        )
        rec = ctx.records[-1]
        self.assertEqual(rec["classification"], "VALID")
        self.assertEqual(rec["first_creator_migration"], mig_a)

    def test_same_migration_later_creator_ordering_defect(self) -> None:
        stmts = [
            'CREATE TABLE "t" ("id" TEXT);',
            'CREATE INDEX "t_status_idx" ON "t"("status");',
            'ALTER TABLE "t" ADD COLUMN "status" TEXT;',
        ]
        ctx = _ctx()
        mig = "20260101000005_order"
        ctx.all_migs = [mig]
        ctx.scope_ord = {mig: 1}
        prescan_statements(ctx, [(mig, stmts)])
        state = SchemaState()
        ctx.records.clear()
        for stmt_order, stmt in enumerate(stmts, 1):
            check_statement_dependencies(ctx, mig, stmt_order, stmt, state)
            apply_statement(ctx, mig, stmt_order, stmt, state)
        rec = next(r for r in ctx.records if r.get("required_property") == "status")
        self.assertEqual(rec["classification"], "ORDERING_DEFECT")

    def test_true_missing_history(self) -> None:
        stmts = [
            'CREATE TABLE "t" ("id" TEXT);',
            'CREATE INDEX "t_missing_idx" ON "t"("missing_col");',
        ]
        _, _, records = _replay_statements("20260101000006_missing", stmts[1:], prescan=[("20260101000006_missing", stmts)])
        rec = next(r for r in records if r.get("required_property") == "missing_col")
        self.assertEqual(rec["classification"], "MISSING_HISTORY")


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
