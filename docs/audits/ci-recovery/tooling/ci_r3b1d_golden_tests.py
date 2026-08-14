#!/usr/bin/env python3
"""Golden tests for CI-R3B1D harness hardening and vendor predecessor authority."""
from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys_path = Path(__file__).resolve().parent
import sys

sys.path.insert(0, str(sys_path))

from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor  # noqa: E402
from replay_evidence_lib import (  # noqa: E402
    DATA,
    REPO,
    SPECIAL_MIGRATION_EXPECTED_SHA256,
    SPECIAL_MIGRATION_PATH,
    TRANSACTION_PATTERNS,
    audit_transaction_sensitive_migrations,
    parse_create_index_statements,
    replay_input_manifest_files,
    replay_input_manifest_sha256,
    sha256_file,
)


class HarnessGoldenTests(unittest.TestCase):
    def test_pinned_sha_matches_migration_file(self) -> None:
        self.assertEqual(sha256_file(SPECIAL_MIGRATION_PATH), SPECIAL_MIGRATION_EXPECTED_SHA256)

    def test_executor_refuses_mismatched_observed_hash_via_constructor_path(self) -> None:
        ex = SpecialCompositeIndexExecutor(accepted_sha256=SPECIAL_MIGRATION_EXPECTED_SHA256)
        with self.assertRaises(RuntimeError):
            ex.verify_checksum("deadbeef" * 8)

    def test_executor_refuses_wrong_pinned_accepted_hash(self) -> None:
        ex = SpecialCompositeIndexExecutor(accepted_sha256="a" * 64)
        with self.assertRaises(RuntimeError):
            ex.run("unused_db_should_not_matter", reconcile=False)

    def test_replay_manifest_includes_tooling_and_migrations(self) -> None:
        files = replay_input_manifest_files()
        paths = {f["path"] for f in files}
        self.assertTrue(any(p.startswith("backend/prisma/migrations/") for p in paths))
        self.assertIn("docs/audits/ci-recovery/tooling/replay_evidence_lib.py", paths)
        self.assertIn("docs/audits/ci-recovery/tooling/ci_r3b1c_special_composite_index.py", paths)
        self.assertIn("docs/audits/ci-recovery/data/ci-r3b1c-special-replay-authority-2026-08.json", paths)

    def test_manifest_changes_when_tooling_bytes_change(self) -> None:
        h1 = replay_input_manifest_sha256()
        lib_path = REPO / "docs/audits/ci-recovery/tooling/replay_evidence_lib.py"
        original = lib_path.read_text()
        try:
            lib_path.write_text(original + "\n# r3b1d manifest probe\n")
            h2 = replay_input_manifest_sha256()
            self.assertNotEqual(h1, h2)
        finally:
            lib_path.write_text(original)

    def test_create_index_concurrently_detected(self) -> None:
        sql = 'CREATE INDEX CONCURRENTLY "foo_idx" ON "bar"("id");'
        self.assertTrue(any(label == "CREATE INDEX CONCURRENTLY" and p.search(sql) for label, p, _ in TRANSACTION_PATTERNS))

    def test_create_unique_index_concurrently_detected(self) -> None:
        sql = "CREATE UNIQUE INDEX CONCURRENTLY\n  \"foo_idx\" ON \"bar\"(\"id\");"
        matched = False
        for label, pattern, cls in TRANSACTION_PATTERNS:
            if label == "CREATE UNIQUE INDEX CONCURRENTLY" and pattern.search(sql):
                matched = True
                self.assertEqual(cls, "SPECIAL_EXECUTION_REQUIRED")
        self.assertTrue(matched)

    def test_non_concurrent_unique_index_not_special(self) -> None:
        sql = 'CREATE UNIQUE INDEX "foo_idx" ON "bar"("id");'
        special = [label for label, pattern, cls in TRANSACTION_PATTERNS if cls == "SPECIAL_EXECUTION_REQUIRED" and pattern.search(sql)]
        self.assertEqual(special, [])

    def test_non_concurrent_index_not_special(self) -> None:
        sql = 'CREATE INDEX "foo_idx" ON "bar"("id");'
        special = [label for label, pattern, cls in TRANSACTION_PATTERNS if cls == "SPECIAL_EXECUTION_REQUIRED" and pattern.search(sql)]
        self.assertEqual(special, [])

    def test_multiline_unique_concurrent_detected(self) -> None:
        sql = "CREATE\n  UNIQUE\n  INDEX\n  CONCURRENTLY\n  \"x\" ON \"y\"(\"z\");"
        self.assertTrue(re.search(r"\bCREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\b", sql, re.I))

    def test_drop_index_concurrently_detected(self) -> None:
        sql = "DROP INDEX CONCURRENTLY IF EXISTS foo;"
        self.assertTrue(any(label == "DROP INDEX CONCURRENTLY" and p.search(sql) for label, p, _ in TRANSACTION_PATTERNS))

    def test_reindex_concurrently_detected(self) -> None:
        sql = "REINDEX INDEX CONCURRENTLY foo;"
        self.assertTrue(any(label == "REINDEX CONCURRENTLY" and p.search(sql) for label, p, _ in TRANSACTION_PATTERNS))

    def test_refresh_materialized_view_concurrently_detected(self) -> None:
        sql = "REFRESH MATERIALIZED VIEW CONCURRENTLY mv;"
        self.assertTrue(
            any(label == "REFRESH MATERIALIZED VIEW CONCURRENTLY" and p.search(sql) for label, p, _ in TRANSACTION_PATTERNS)
        )
    def test_transaction_inventory_unresolved_zero(self) -> None:
        inv = audit_transaction_sensitive_migrations()
        self.assertEqual(inv["unresolved_count"], 0)

    def test_composite_migration_still_parses_fourteen_indexes(self) -> None:
        specs = parse_create_index_statements(SPECIAL_MIGRATION_PATH.read_text())
        self.assertEqual(len(specs), 14)
        self.assertTrue(all(s["concurrently"] for s in specs))


class VendorAuthorityGoldenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contracts = json.loads((DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json").read_text())
        cls.by_obj = {c["object"]: c for c in cls.contracts["contracts"]}

    def test_vendor_category_missing_history(self) -> None:
        self.assertEqual(self.by_obj["VendorCategory"]["classification"], "MISSING_HISTORY")

    def test_vendor_category_exact_base_labels(self) -> None:
        labels = self.by_obj["VendorCategory"]["labels"]
        self.assertEqual(len(labels), 11)
        self.assertNotIn("INSURANCE", labels)

    def test_vendors_missing_history(self) -> None:
        self.assertEqual(self.by_obj["vendors"]["classification"], "MISSING_HISTORY")

    def test_vendors_missing_overhaul_column_in_predecessor(self) -> None:
        cols = {c["column"] for c in self.by_obj["vendors"]["columns"]}
        self.assertNotIn("source", cols)
        self.assertNotIn("external_place_id", cols)

    def test_vendors_required_base_column_present(self) -> None:
        cols = {c["column"] for c in self.by_obj["vendors"]["columns"]}
        self.assertIn("category", cols)
        self.assertIn("organization_id", cols)

    def test_vendor_vehicles_missing_history(self) -> None:
        self.assertEqual(self.by_obj["vendor_vehicles"]["classification"], "MISSING_HISTORY")

    def test_vendor_vehicles_missing_overhaul_columns(self) -> None:
        cols = {c["column"] for c in self.by_obj["vendor_vehicles"]["columns"]}
        for col in ["relation_type", "is_preferred", "priority", "valid_from", "valid_until", "updated_at"]:
            self.assertNotIn(col, cols)

    def test_activity_entity_valid_in_known_objects(self) -> None:
        self.assertEqual(self.contracts["known_valid_objects"]["ActivityEntity"]["classification"], "VALID")

    def test_org_invoices_valid_before_vendor_id(self) -> None:
        inv = self.contracts["known_valid_objects"]["org_invoices"]
        self.assertEqual(inv["classification"], "VALID")

    def test_vendor_source_and_relation_type_not_predecessor_defects(self) -> None:
        matrix = json.loads((DATA / "ci-r3b1d-post-vendor-dependency-matrix-2026-08.json").read_text())
        vendor_ops = [
            r for r in matrix["records"]
            if r["migration"] == "20260613210000_vendor_management_overhaul"
            and r["required_object"] in {"VendorSource", "VendorVehicleRelationType"}
            and r["operation"].startswith("CREATE TYPE")
        ]
        self.assertTrue(all(r["classification"] != "MISSING_HISTORY" for r in vendor_ops))


def main() -> int:
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(HarnessGoldenTests))
    suite.addTests(loader.loadTestsFromTestCase(VendorAuthorityGoldenTests))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS: all CI-R3B1D golden tests" if result.wasSuccessful() else "FAIL")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
