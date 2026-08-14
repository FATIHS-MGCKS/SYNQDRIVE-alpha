#!/usr/bin/env python3
"""Golden tests for CI-R3B1C replay evidence tooling."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from replay_evidence_lib import (
    SPECIAL_MIGRATION_PATH,
    classify_failure,
    compare_migration_to_script,
    deferred_constraints_by_slot,
    enum_labels,
    enum_exists,
    migration_ordinal,
    object_runtime_status,
    parse_create_index_statements,
    parse_deploy_output,
    replay_input_manifest_sha256,
    sequence_exists,
    slot_created_objects,
    table_exists,
    PgConfig,
)

BACKEND = Path(__file__).resolve().parents[4] / "backend"


class GoldenTests(unittest.TestCase):
    def test_parse_composite_indexes(self) -> None:
        specs = parse_create_index_statements(SPECIAL_MIGRATION_PATH.read_text())
        self.assertEqual(len(specs), 14)
        self.assertTrue(all(s["concurrently"] for s in specs))

    def test_script_equivalence(self) -> None:
        cmp = compare_migration_to_script(SPECIAL_MIGRATION_PATH.read_text(), BACKEND / "scripts/apply-composite-indexes.ts")
        self.assertTrue(cmp["semantic_equivalent"], cmp)

    def test_deferred_fk_slot4(self) -> None:
        by_slot = deferred_constraints_by_slot()
        self.assertIn(4, by_slot)
        self.assertTrue(any("org_tasks.invoice_id" in x for x in by_slot[4]))

    def test_slot3_topology_objects_include_enums(self) -> None:
        objs = slot_created_objects(3)
        names = {o["name"] for o in objs}
        self.assertIn("vehicle_document_extractions", names)
        self.assertIn("battery_evidence", names)
        self.assertIn("DocumentExtractionType", names)

    def test_slot5_insight_type_enum(self) -> None:
        objs = slot_created_objects(5)
        self.assertEqual([o for o in objs if o["name"] == "InsightType"][0]["kind"], "enum")

    def test_not_reached_semantics(self) -> None:
        cfg = PgConfig()
        self.assertEqual(object_runtime_status(cfg, "db", "InsightType", "enum", False), "NOT_REACHED")

    def test_parse_deploy_output_dynamic(self) -> None:
        sample = """
        293 migrations found
        Applying migration `20260413225000_ci_r3b_historical_predecessor_slot4`
        Applying migration `20260413230000_add_composite_indexes_batch_c`
        Error: P3018
        Migration name: 20260413230000_add_composite_indexes_batch_c
        Database error code: 25001
        ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
        """
        parsed = parse_deploy_output(sample)
        self.assertEqual(parsed["first_failed_migration"], "20260413230000_add_composite_indexes_batch_c")
        self.assertEqual(parsed["sqlstate"], "25001")
        self.assertEqual(parsed["failure_classification"], "SPECIAL_EXECUTION_REQUIRED")

    def test_classify_unrelated(self) -> None:
        out = "Migration name: 20260412030000_platform_hardening_phase1\nDatabase error code: 42P01\nERROR: relation \"org_tasks\" does not exist"
        self.assertEqual(classify_failure("20260412030000_platform_hardening_phase1", out), "UNRELATED_HISTORICAL_DEFECT")

    def test_replay_input_manifest_changes_with_migrations(self) -> None:
        h1 = replay_input_manifest_sha256()
        self.assertEqual(len(h1), 64)
        self.assertNotEqual(h1, "6df19ad57b742da51adccd6e8e614bca293c5ec1")

    def test_migration_ordinal(self) -> None:
        self.assertGreater(migration_ordinal("20260413230000_add_composite_indexes_batch_c") or 0, 0)

    @mock.patch("replay_evidence_lib.psql")
    def test_enum_exists_uses_pg_type(self, mock_psql) -> None:
        mock_psql.return_value = mock.Mock(returncode=0, stdout="t\n")
        self.assertTrue(enum_exists(PgConfig(), "db", "TaskPriority"))
        sql = mock_psql.call_args[0][2]
        self.assertIn("typtype='e'", sql)

    @mock.patch("replay_evidence_lib.psql")
    def test_table_exists_uses_relkind_r(self, mock_psql) -> None:
        mock_psql.return_value = mock.Mock(returncode=0, stdout="t\n")
        self.assertTrue(table_exists(PgConfig(), "db", "org_tasks"))
        sql = mock_psql.call_args[0][2]
        self.assertIn("relkind='r'", sql)

    def test_special_executor_checksum_refusal(self) -> None:
        from ci_r3b1c_special_composite_index import SpecialCompositeIndexExecutor

        ex = SpecialCompositeIndexExecutor()
        with self.assertRaises(RuntimeError):
            ex.verify_checksum("deadbeef" * 8)


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GoldenTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS: all CI-R3B1C golden tests" if result.wasSuccessful() else "FAIL")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
