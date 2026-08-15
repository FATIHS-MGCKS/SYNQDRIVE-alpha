#!/usr/bin/env python3
"""Scope, literal, guard, and constraint regression tests (CI-R3B1F.1.1)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f111_contract_compiler import compile_add_column_contract, parse_compiled_add_column_semantics
from ci_r3b1f111_contract_validator import is_valid_postgres_type, validate_column_contract
from expression_dependency_extractor import extract_create_index_dependencies, extract_update_dependencies
from migration_creator_state import parse_create_table_statement
from sql_migration_analyzer import (
    AnalyzerContext,
    SchemaState,
    apply_statement,
    check_statement_dependencies,
    classify_record,
    CreatorRef,
    mig_order,
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


class ScopeResolutionTests(unittest.TestCase):
    def test_update_from_scope(self) -> None:
        stmt = """
        UPDATE overrides o
        SET value = v.name
        FROM vehicles v
        WHERE o.vehicle_id = v.id;
        """
        deps = {(d.table, d.column, d.false_positive) for d in extract_update_dependencies(stmt)}
        self.assertIn(("overrides", "vehicle_id", False), deps)
        self.assertIn(("vehicles", "name", False), deps)
        self.assertIn(("vehicles", "id", False), deps)
        self.assertFalse(any(t == "overrides" and c in {"vehicles", "v"} for t, c, _ in deps))

    def test_cte_output_alias_not_physical(self) -> None:
        stmt = """
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER () AS rn FROM items
        )
        UPDATE target t
        SET duplicate = true
        FROM ranked r
        WHERE t.item_id = r.id AND r.rn > 1;
        """
        deps = extract_update_dependencies(stmt)
        self.assertTrue(any(d.false_positive and d.column == "rn" for d in deps))
        self.assertFalse(any(not d.false_positive and d.table == "target" and d.column == "rn" for d in deps))

    def test_json_key_exclusion(self) -> None:
        deps = extract_create_index_dependencies(
            "CREATE INDEX x ON t ((metadata->>'catalogKey'));"
        )
        cols = {(d.table, d.column) for d in deps}
        self.assertIn(("t", "metadata"), cols)
        self.assertNotIn(("t", "catalogKey"), cols)

    def test_guarded_drop_conditional_safe(self) -> None:
        cls = classify_record(_ctx(), "20260101000000_x", 1, "old_check", "constraint", CreatorRef("20260101000000_x", 1, 2), True, True)
        self.assertEqual(cls, "CONDITIONAL_SAFE")

    def test_unquoted_named_pk(self) -> None:
        stmt = "CREATE TABLE t (id UUID NOT NULL, CONSTRAINT t_pkey PRIMARY KEY (id));"
        _, cols, names, parsed = parse_create_table_statement(stmt)
        self.assertEqual(cols[0].name, "id")
        self.assertIn("t_pkey", names)
        pk = next(c for c in parsed if c.name == "t_pkey")
        self.assertEqual(pk.kind, "PRIMARY_KEY")
        self.assertEqual(pk.columns, ["id"])

    def test_strict_compiler_no_if_not_exists(self) -> None:
        contract = {
            "relation": "vehicle_tire_setups",
            "column": "status",
            "postgres_type": "TireSetupStatus",
            "nullable": False,
            "default_semantics": "DATABASE_ENUM_DEFAULT",
            "default_value": "ACTIVE",
            "enum_dependency": "TireSetupStatus",
            "first_consumer_migration": "20260716183000_tire_lifecycle_invariants",
            "repair_boundary": {"after_migration": "a", "before_migration": "b"},
            "provenance": {"sources": ["test"]},
        }
        sql = compile_add_column_contract(contract)
        self.assertNotIn("IF NOT EXISTS", sql.upper())
        parsed = parse_compiled_add_column_semantics(sql)
        self.assertEqual(parsed["column"], "status")


class LiteralSafetyTests(unittest.TestCase):
    def test_reject_invalid_types(self) -> None:
        for bad in ["null", "", "IS NOT NULL", "DEFAULT"]:
            self.assertFalse(is_valid_postgres_type(bad))

    def test_enum_contract(self) -> None:
        contract = {
            "relation": "vehicle_tire_setups",
            "column": "status",
            "postgres_type": "TireSetupStatus",
            "nullable": False,
            "default_semantics": "DATABASE_ENUM_DEFAULT",
            "default_value": "ACTIVE",
            "enum_dependency": "TireSetupStatus",
            "first_consumer_migration": "20260716183000_tire_lifecycle_invariants",
            "repair_boundary": {"after_migration": "a", "before_migration": "b"},
            "provenance": {"sources": ["test"]},
        }
        self.assertEqual(validate_column_contract(contract, {"TireSetupStatus"}), [])


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
