#!/usr/bin/env python3
"""Golden tests for evidence and generic contract gates (CI-R3B1H.1.1)."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1h111_authority_resolver import derive_repair_boundary, resolve_column_authority
from ci_r3b1h111_build_contracts import build_contracts_from_matrix
from ci_r3b1h111_constants import DATA
from ci_r3b1h111_migration249_reconciliation import build_reconciliation, find_successor_record
from ci_r3b1h111_proof_registry import REGISTRY, dispatch_contract_proof, handler_for_contract

OUT = DATA / "ci-r3b1h111-golden-tests-2026-08.json"


class GoldenTests(unittest.TestCase):
    def test_reconciliation_m_id(self) -> None:
        old = json.loads((DATA / "ci-r3b1h-insert-select-dependency-matrix-2026-08.json").read_text())
        new = json.loads((DATA / "ci-r3b1h111-insert-select-dependency-matrix-2026-08.json").read_text())
        old_rec = next(
            r
            for r in old["records"]
            if r["migration"].endswith("iam_versioned_role_assignments")
            and r.get("resolved_alias") == "m"
            and r.get("required_property") == "id"
            and r.get("classification") == "MISSING_HISTORY"
        )
        matched = find_successor_record(old_rec, new["records"])
        self.assertIsNotNone(matched)
        self.assertEqual(matched["resolved_relation"], "organization_memberships")
        self.assertEqual(matched["required_property"], "id")

    def test_permissions_authority(self) -> None:
        auth = resolve_column_authority("organization_memberships", "permissions", "20260721250000_iam_versioned_role_assignments")
        self.assertEqual(auth.status, "COMPLETE_AUTHORITY")
        self.assertEqual(auth.postgres_type, "jsonb")
        self.assertTrue(auth.nullable)

    def test_permissions_boundary_derived(self) -> None:
        boundary = derive_repair_boundary(
            "organization_memberships", "permissions", "20260721250000_iam_versioned_role_assignments"
        )
        self.assertTrue(boundary.valid)
        self.assertEqual(boundary.after_migration, "20260721240000_iam_last_selected_organization")
        self.assertEqual(boundary.before_migration, "20260721250000_iam_versioned_role_assignments")

    def test_proof_dispatch_registry(self) -> None:
        contract = {
            "contract_id": "TEST-permissions",
            "relation": "organization_memberships",
            "column": "permissions",
            "postgres_type": "jsonb",
            "nullable": True,
        }
        self.assertEqual(handler_for_contract(contract), "permissions_with_fixture")
        synthetic = {"contract_id": "TEST-synthetic", "relation": "demo_table", "column": "demo_col", "postgres_type": "text", "nullable": True}
        result = dispatch_contract_proof(synthetic, None, "unused", handler_name="synthetic_unit_only")
        self.assertTrue(result["pass"])
        self.assertIn("synthetic_unit_only", REGISTRY)


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1H.1.1",
        "pass": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
