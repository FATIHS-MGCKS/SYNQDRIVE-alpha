#!/usr/bin/env python3
"""Contract validator golden tests for CI-R3B1F.1."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1f1_contract_validator import is_valid_postgres_type, validate_column_contract


def base_contract(**overrides):
    contract = {
        "relation": "sample",
        "column": "col",
        "postgres_type": "text",
        "nullable": True,
        "default_semantics": "NO_DATABASE_DEFAULT",
        "first_consumer_migration": "20260101000000_test",
        "repair_boundary": {"after_migration": "20260101000000_a", "before_migration": "20260101000001_b"},
        "provenance": {"sources": ["test"]},
    }
    contract.update(overrides)
    return contract


class ContractValidatorTests(unittest.TestCase):
    def test_reject_invalid_type_fragments(self) -> None:
        for bad in ["null", "", "IS NOT NULL", "NOT NULL", "DEFAULT", "PRIMARY KEY", "ADD COLUMN"]:
            self.assertFalse(is_valid_postgres_type(bad), bad)

    def test_accept_builtin_and_enum_types(self) -> None:
        self.assertTrue(is_valid_postgres_type("uuid"))
        self.assertTrue(is_valid_postgres_type("TireSetupStatus", {"TireSetupStatus"}))

    def test_enum_contract_passes_with_known_enum(self) -> None:
        contract = base_contract(
            postgres_type="TireSetupStatus",
            nullable=False,
            default_semantics="DATABASE_ENUM_DEFAULT",
            default_value="ACTIVE",
            enum_dependency="TireSetupStatus",
        )
        errors = validate_column_contract(contract, {"TireSetupStatus"})
        self.assertEqual(errors, [])

    def test_enum_contract_fails_without_enum(self) -> None:
        contract = base_contract(
            postgres_type="TireSetupStatus",
            nullable=False,
            default_semantics="DATABASE_ENUM_DEFAULT",
            default_value="ACTIVE",
            enum_dependency="TireSetupStatus",
        )
        errors = validate_column_contract(contract, set())
        self.assertTrue(any("missing_enum_dependency" in e for e in errors))


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
