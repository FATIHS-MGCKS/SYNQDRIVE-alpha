#!/usr/bin/env python3
"""Golden tests for CI-R3B1D.1.2 catalog-definition parity comparators."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d12_catalog_compare import compare_expected_to_actual  # noqa: E402
from ci_r3b1d12_catalog_model import (  # noqa: E402
    ExpectedCatalog,
    defaults_match,
    semantic_default_from_contract,
    semantic_default_from_pg_expr,
)


def col(table: str, name: str, typ: str, nullable: bool = False, default: dict | None = None) -> None:
    pass


class CatalogModelTests(unittest.TestCase):
    def test_text_cast_not_enum(self) -> None:
        actual = semantic_default_from_pg_expr("'open'::text", "text")
        self.assertEqual(actual["kind"], "DATABASE_LITERAL_DEFAULT")
        self.assertEqual(actual["value"], "open")

    def test_quoted_enum_cast(self) -> None:
        actual = semantic_default_from_pg_expr('\'DRAFT\'::"WorkflowStatus"', "WorkflowStatus")
        self.assertEqual(actual["kind"], "DATABASE_ENUM_DEFAULT")
        self.assertEqual(actual["value"], "DRAFT")

    def test_enum_column_no_default(self) -> None:
        col_def = {
            "postgres_type": '"TirePosition"',
            "postgres_default": None,
            "default_semantics": "NO_DATABASE_DEFAULT",
        }
        expected = semantic_default_from_contract(col_def)
        self.assertEqual(expected["kind"], "NO_DATABASE_DEFAULT")
        self.assertTrue(defaults_match(expected, {"kind": "NO_DATABASE_DEFAULT", "value": None}))

    def test_literal_default_strip_quotes(self) -> None:
        col_def = {
            "postgres_type": "TEXT",
            "postgres_default": "'open'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        expected = semantic_default_from_contract(col_def)
        actual = semantic_default_from_pg_expr("'open'::text", "text")
        self.assertTrue(defaults_match(expected, actual))

    def test_boolean_default_case_insensitive(self) -> None:
        expected = {"kind": "DATABASE_LITERAL_DEFAULT", "value": "TRUE"}
        actual = {"kind": "DATABASE_LITERAL_DEFAULT", "value": "true"}
        self.assertTrue(defaults_match(expected, actual))


class CatalogCompareTests(unittest.TestCase):
    def _expected_fk(self, on_delete: str = "CASCADE") -> ExpectedCatalog:
        exp = ExpectedCatalog()
        exp.foreign_keys["demo_fkey"] = {
            "slot": 10,
            "name": "demo_fkey",
            "local_table": "child",
            "local_columns": ["damage_id"],
            "referenced_table": "vehicle_damages",
            "referenced_columns": ["id"],
            "on_delete": on_delete,
            "on_update": "CASCADE",
            "source_action": "test",
        }
        return exp

    def _actual_fk(self, on_delete: str = "CASCADE") -> dict:
        return {
            "types": {},
            "sequences": {},
            "tables": {"child"},
            "columns": {},
            "primary_keys": {},
            "unique_constraints": {},
            "foreign_keys": {
                "demo_fkey": {
                    "local_table": "child",
                    "local_columns": ["damage_id"],
                    "referenced_table": "vehicle_damages",
                    "referenced_columns": ["id"],
                    "on_delete": on_delete,
                    "on_update": "CASCADE",
                }
            },
            "indexes": {},
        }

    def test_fk_matching_definition_pass(self) -> None:
        mismatches = compare_expected_to_actual(self._expected_fk(), self._actual_fk())
        self.assertEqual(len(mismatches), 0)

    def test_fk_wrong_on_delete_fail(self) -> None:
        mismatches = compare_expected_to_actual(self._expected_fk("CASCADE"), self._actual_fk("NO ACTION"))
        self.assertTrue(any(m.property == "on_delete" for m in mismatches))

    def test_fk_wrong_referenced_columns_fail(self) -> None:
        actual = self._actual_fk()
        actual["foreign_keys"]["demo_fkey"]["referenced_columns"] = ["other_id"]
        mismatches = compare_expected_to_actual(self._expected_fk(), actual)
        self.assertTrue(any(m.property == "referenced_columns" for m in mismatches))

    def test_index_wrong_column_order_fail(self) -> None:
        exp = ExpectedCatalog()
        exp.indexes["demo_idx"] = {
            "slot": 7,
            "name": "demo_idx",
            "table": "vendors",
            "unique": False,
            "method": "btree",
            "columns": ["a", "b"],
            "source_action": "test",
        }
        actual = {
            "types": {},
            "sequences": {},
            "tables": {"vendors"},
            "columns": {},
            "primary_keys": {},
            "unique_constraints": {},
            "foreign_keys": {},
            "indexes": {
                "demo_idx": {
                    "table": "vendors",
                    "unique": False,
                    "method": "btree",
                    "columns": ["b", "a"],
                    "valid": True,
                    "ready": True,
                }
            },
        }
        mismatches = compare_expected_to_actual(exp, actual)
        self.assertTrue(any(m.category == "index" for m in mismatches))

    def test_enum_wrong_order_fail(self) -> None:
        exp = ExpectedCatalog()
        exp.types["DemoEnum"] = {
            "slot": 8,
            "labels": ["A", "B", "C"],
            "source_action": "test",
        }
        actual = {
            "types": {"DemoEnum": {"labels": ["A", "C", "B"]}},
            "sequences": {},
            "tables": set(),
            "columns": {},
            "primary_keys": {},
            "unique_constraints": {},
            "foreign_keys": {},
            "indexes": {},
        }
        mismatches = compare_expected_to_actual(exp, actual)
        self.assertTrue(any(m.category == "enum" for m in mismatches))

    def test_jsonb_wrong_default_fail(self) -> None:
        exp = ExpectedCatalog()
        exp.tables["org_workflows"] = {"slot": 8, "source_action": "test"}
        exp.columns["org_workflows"] = {
            "scope": {
                "slot": 8,
                "type": "jsonb",
                "nullable": False,
                "default": {"kind": "DATABASE_JSON_DEFAULT", "value": {"type": "organization"}},
                "source_action": "test",
            }
        }
        actual = {
            "types": {},
            "sequences": {},
            "tables": {"org_workflows"},
            "columns": {
                "org_workflows": {
                    "scope": {
                        "type": "jsonb",
                        "nullable": False,
                        "default": {"kind": "DATABASE_JSON_DEFAULT", "value": {"type": "other"}},
                    }
                }
            },
            "primary_keys": {},
            "unique_constraints": {},
            "foreign_keys": {},
            "indexes": {},
        }
        mismatches = compare_expected_to_actual(exp, actual)
        self.assertTrue(any(m.category == "default" for m in mismatches))

    def test_column_wrong_type_fail(self) -> None:
        exp = ExpectedCatalog()
        exp.tables["demo"] = {"slot": 7, "source_action": "test"}
        exp.columns["demo"] = {
            "count": {
                "slot": 7,
                "type": "integer",
                "nullable": False,
                "default": {"kind": "NO_DATABASE_DEFAULT", "value": None},
                "source_action": "test",
            }
        }
        actual = {
            "types": {},
            "sequences": {},
            "tables": {"demo"},
            "columns": {
                "demo": {
                    "count": {
                        "type": "bigint",
                        "nullable": False,
                        "default": {"kind": "NO_DATABASE_DEFAULT", "value": None},
                    }
                }
            },
            "primary_keys": {},
            "unique_constraints": {},
            "foreign_keys": {},
            "indexes": {},
        }
        mismatches = compare_expected_to_actual(exp, actual)
        self.assertTrue(any(m.category == "type" for m in mismatches))

    def test_unique_wrong_order_fail(self) -> None:
        exp = ExpectedCatalog()
        exp.unique_constraints["demo_uq"] = {
            "slot": 11,
            "table": "demo",
            "columns": ["a", "b"],
            "source_action": "test",
        }
        actual = {
            "types": {},
            "sequences": {},
            "tables": {"demo"},
            "columns": {},
            "primary_keys": {},
            "unique_constraints": {"demo_uq": {"table": "demo", "columns": ["b", "a"]}},
            "foreign_keys": {},
            "indexes": {},
        }
        mismatches = compare_expected_to_actual(exp, actual)
        self.assertTrue(any(m.category == "unique" for m in mismatches))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
