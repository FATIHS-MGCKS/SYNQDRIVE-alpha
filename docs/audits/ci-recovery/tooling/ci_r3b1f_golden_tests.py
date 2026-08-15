#!/usr/bin/env python3
"""Golden tests for CI-R3B1F expression dependency extraction."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from expression_dependency_extractor import (
    extract_check_dependencies,
    extract_columns_from_expression,
    extract_create_index_dependencies,
    extract_statement_expression_dependencies,
)
from sql_migration_analyzer import split_sql_statements


REPO = Path(__file__).resolve().parents[4]
MIG157 = REPO / "backend/prisma/migrations/20260716183000_tire_lifecycle_invariants/migration.sql"


class ExpressionExtractorTests(unittest.TestCase):
    def test_migration_157_dependencies(self) -> None:
        sql = MIG157.read_text()
        deps = extract_create_index_dependencies(sql)
        cols = sorted({f"{d.table}.{d.column}" for d in deps})
        self.assertIn("vehicle_tire_setups.vehicle_id", cols)
        self.assertIn("vehicle_tire_setups.status", cols)
        self.assertIn("vehicle_tire_setups.removed_at", cols)
        self.assertIn("tires.tire_set_id", cols)
        self.assertIn("tires.current_position", cols)
        self.assertIn("tires.active", cols)

    def test_partial_unique_index_fixture(self) -> None:
        stmt = """
        CREATE UNIQUE INDEX x ON "t"("a", "b") WHERE "col_c" = true AND "col_d" IS NULL;
        """
        deps = extract_create_index_dependencies(stmt)
        cols = {d.column for d in deps if d.table == "t"}
        self.assertEqual(cols, {"a", "b", "col_c", "col_d"})

    def test_expression_index_fixture(self) -> None:
        stmt = 'CREATE INDEX x ON "users" (lower("email"));'
        deps = extract_create_index_dependencies(stmt)
        self.assertEqual(
            [(d.table, d.column) for d in deps if d.context == "INDEX_EXPRESSION"],
            [("users", "email")],
        )

    def test_check_fixture(self) -> None:
        stmt = 'ALTER TABLE booking ADD CONSTRAINT valid_range CHECK (start_at <= end_at);'
        deps = extract_check_dependencies(stmt, "booking")
        cols = sorted({d.column for d in deps})
        self.assertEqual(cols, ["end_at", "start_at"])

    def test_cast_enum_label_fixture(self) -> None:
        cols = extract_columns_from_expression("status::text = 'ACTIVE'", "vehicle_tire_setups")
        self.assertEqual(cols, [("vehicle_tire_setups", "status")])
        all_cols = {c for _, c in cols}
        self.assertNotIn("text", all_cols)
        self.assertNotIn("ACTIVE", all_cols)

    def test_function_name_excluded(self) -> None:
        cols = {c for _, c in extract_columns_from_expression("lower(status_text) = 'active'", "users")}
        self.assertEqual(cols, {"status_text"})
        self.assertNotIn("lower", cols)
        self.assertNotIn("active", cols)

    def test_is_null_predicate(self) -> None:
        cols = {c for _, c in extract_columns_from_expression("removed_at IS NULL", "vehicle_tire_setups")}
        self.assertEqual(cols, {"removed_at"})

    def test_boolean_predicate(self) -> None:
        for expr in ("active", "active = true", "NOT active"):
            cols = {c for _, c in extract_columns_from_expression(expr, "tires")}
            self.assertIn("active", cols)

    def test_qualified_identifier(self) -> None:
        cols = extract_columns_from_expression('"vehicle_tire_setups"."status" = \'ACTIVE\'', None)
        self.assertEqual(cols, [("vehicle_tire_setups", "status")])

    def test_multi_column_predicate(self) -> None:
        cols = {c for _, c in extract_columns_from_expression("start_at < end_at", "booking")}
        self.assertEqual(cols, {"start_at", "end_at"})


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExpressionExtractorTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
