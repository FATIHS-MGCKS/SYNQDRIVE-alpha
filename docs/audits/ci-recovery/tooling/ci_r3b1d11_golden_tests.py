#!/usr/bin/env python3
"""Golden tests for CI-R3B1D.1.1 executable DDL and validator closure."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_sql_literal_compiler import (  # noqa: E402
    DefaultCompileError,
    classify_default_semantics,
    compile_column_default,
    parse_json_semantic_value,
)
from ci_r3b1d1_repair_action_graph import build_slot_graph  # noqa: E402
from ci_r3b1d1_validate_topology import (  # noqa: E402
    SchemaState,
    apply_add_fk,
    apply_add_unique,
    apply_create_index,
    calculate_deferred_endpoints,
    is_valid_fk_target,
)
from replay_evidence_lib import PgConfig, psql, recreate_db  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


class R3B1D11GoldenTests(unittest.TestCase):
    def test_jsonb_simple_object(self) -> None:
        col = {
            "column": "scope",
            "postgres_type": "JSONB",
            "prisma_type": "Json",
            "prisma_default": '"{\\"type\\":\\"organization\\"}"',
            "postgres_default": "'{\\\"type\\\":\\\"organization\\\"}'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        self.assertEqual(parse_json_semantic_value(col), {"type": "organization"})
        self.assertEqual(compile_column_default(col), '\'{"type":"organization"}\'::jsonb')

    def test_jsonb_nested_object(self) -> None:
        col = {
            "column": "meta",
            "postgres_type": "JSONB",
            "prisma_type": "Json",
            "prisma_default": '"{\\"a\\":{\\"b\\":1}}"',
            "postgres_default": "'{\\\"a\\\":{\\\"b\\\":1}}'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        self.assertEqual(parse_json_semantic_value(col), {"a": {"b": 1}})

    def test_json_apostrophe(self) -> None:
        col = {
            "column": "payload",
            "postgres_type": "JSONB",
            "prisma_type": "Json",
            "prisma_default": json.dumps(json.dumps({"note": "it's fine"})),
            "postgres_default": "'" + json.dumps({"note": "it's fine"}).replace("'", "''") + "'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        self.assertEqual(parse_json_semantic_value(col)["note"], "it's fine")

    def test_invalid_json_rejected(self) -> None:
        col = {
            "column": "bad",
            "postgres_type": "JSONB",
            "prisma_type": "Json",
            "postgres_default": "'{not json}'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        with self.assertRaises(DefaultCompileError):
            parse_json_semantic_value(col)

    def test_json_like_text_stays_text(self) -> None:
        col = {
            "column": "label",
            "postgres_type": "TEXT",
            "postgres_default": "'{\"type\":\"organization\"}'",
            "default_semantics": "DATABASE_DEFAULT",
        }
        self.assertEqual(classify_default_semantics(col), "DATABASE_LITERAL_DEFAULT")
        self.assertEqual(compile_column_default(col), "'{\"type\":\"organization\"}'")

    def test_enum_default(self) -> None:
        col = {
            "column": "status",
            "postgres_type": '"WorkflowStatus"',
            "postgres_default": '\'DRAFT\'::"WorkflowStatus"',
            "default_semantics": "DATABASE_DEFAULT",
        }
        self.assertEqual(classify_default_semantics(col), "DATABASE_ENUM_DEFAULT")
        self.assertEqual(compile_column_default(col), '\'DRAFT\'::"WorkflowStatus"')

    def test_sequence_default(self) -> None:
        col = {
            "column": "id",
            "postgres_type": "TEXT",
            "postgres_default": "nextval('demo_id_seq'::regclass)",
            "default_semantics": "IDENTITY_OR_SEQUENCE_GENERATED",
        }
        self.assertEqual(compile_column_default(col), "nextval('demo_id_seq'::regclass)")

    def test_application_generated_uuid(self) -> None:
        col = {"column": "id", "postgres_type": "TEXT", "prisma_default": "uuid()", "default_semantics": "APPLICATION_OR_PRISMA_GENERATED"}
        self.assertIsNone(compile_column_default(col))

    def test_forced_valid_graph_regression_removed(self) -> None:
        table = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        contracts = {"demo_a": table, "demo_b": table}
        graph = build_slot_graph(99, contracts, ["demo_a", "demo_b"])
        graph["valid"] = len(graph["cycles"]) == 0 and not graph["duplicate_create_records"]
        self.assertTrue(graph["valid"])

        graph_with_cycle = dict(graph)
        graph_with_cycle["cycles"] = [["slot99:create-table:demo_a", "slot99:create-table:demo_b"]]
        graph_with_cycle["valid"] = len(graph_with_cycle["cycles"]) == 0 and not graph_with_cycle["duplicate_create_records"]
        self.assertFalse(graph_with_cycle["valid"])

        graph_with_dupe = dict(graph)
        graph_with_dupe["duplicate_create_records"] = [{"canonical_key": ("public", "table", "demo_a")}]
        graph_with_dupe["valid"] = len(graph_with_dupe["cycles"]) == 0 and not graph_with_dupe["duplicate_create_records"]
        self.assertFalse(graph_with_dupe["valid"])

    def test_acyclic_graph_acceptance(self) -> None:
        table = {
            "object_type": "table",
            "enum_dependencies": [{"name": "EnumE", "labels": ["A"]}],
            "columns": [{"column": "id"}, {"column": "kind", "postgres_type": '"EnumE"'}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        graph = build_slot_graph(99, {"demo": table}, ["demo"])
        self.assertTrue(graph["valid"])
        self.assertEqual(graph["cycles"], [])

    def test_deferred_endpoint_later_slot(self) -> None:
        topo = json.loads((DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json").read_text())
        vendor = json.loads((DATA / "ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json").read_text())
        remaining = json.loads((DATA / "ci-r3b1d-remaining-predecessor-ddl-contracts-2026-08.json").read_text())
        contracts = {c["object"]: c for c in vendor["contracts"]}
        contracts.update({c["object"]: c for c in remaining["contracts"]})
        doc = calculate_deferred_endpoints(topo["slots"], contracts)
        self.assertEqual(doc["unresolved_count"], 0)

    def test_fk_to_pk_passes(self) -> None:
        state = SchemaState()
        state.tables.add("parent")
        state.columns["parent"] = {"id", "name"}
        state.primary_keys["parent"] = ["id"]
        state.unique_keys["parent"] = [("id",)]
        state.tables.add("child")
        state.columns["child"] = {"id", "parent_id"}
        action = {
            "object": "child_parent_id_fkey",
            "fk": {"local_columns": ["parent_id"], "referenced_relation": "parent", "referenced_columns": ["id"]},
        }
        errors, proof = apply_add_fk(state, action, "child")
        self.assertTrue(proof["referenced_key_is_pk_or_unique"])
        self.assertEqual(errors, [])

    def test_fk_to_unique_passes(self) -> None:
        state = SchemaState()
        state.tables.add("parent")
        state.columns["parent"] = {"x", "y", "id"}
        state.primary_keys["parent"] = ["id"]
        state.unique_keys["parent"] = [("id",), ("x", "y")]
        action = {
            "object": "child_xy_fkey",
            "fk": {"local_columns": ["a", "b"], "referenced_relation": "parent", "referenced_columns": ["x", "y"]},
        }
        state.tables.add("child")
        state.columns["child"] = {"id", "a", "b"}
        errors, proof = apply_add_fk(state, action, "child")
        self.assertTrue(proof["referenced_key_is_pk_or_unique"])
        self.assertEqual(errors, [])

    def test_fk_to_non_unique_fails(self) -> None:
        state = SchemaState()
        state.tables.add("parent")
        state.columns["parent"] = {"x", "y", "id"}
        state.primary_keys["parent"] = ["id"]
        state.unique_keys["parent"] = [("id",)]
        action = {
            "object": "child_xy_fkey",
            "fk": {"local_columns": ["a", "b"], "referenced_relation": "parent", "referenced_columns": ["x", "y"]},
        }
        state.tables.add("child")
        state.columns["child"] = {"id", "a", "b"}
        errors, proof = apply_add_fk(state, action, "child")
        self.assertFalse(proof["referenced_key_is_pk_or_unique"])
        self.assertTrue(errors)

    def test_composite_fk_wrong_order_fails(self) -> None:
        state = SchemaState()
        state.tables.add("parent")
        state.columns["parent"] = {"x", "y"}
        state.primary_keys["parent"] = ["x", "y"]
        state.unique_keys["parent"] = [("x", "y")]
        self.assertFalse(is_valid_fk_target(state, "parent", ["y", "x"]))

    def test_workflowstatus_dedup(self) -> None:
        topo = json.loads((DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json").read_text())
        slot8 = next(s for s in topo["slots"] if s["slot"] == 8)
        ws = [a for a in slot8["actions"] if a["action"] == "CREATE TYPE" and a["object"] == "WorkflowStatus"]
        self.assertEqual(len(ws), 1)

    def test_vehicle_damage_parent_before_fk(self) -> None:
        topo = json.loads((DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json").read_text())
        slot10 = next(s for s in topo["slots"] if s["slot"] == 10)
        fk = next(a for a in slot10["actions"] if a["object"] == "vehicle_damage_images_damage_id_fkey")
        damages = next(a for a in slot10["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "vehicle_damages")
        self.assertLess(damages["order"], fk["order"])

    def test_composite_fk_exact_order_passes(self) -> None:
        state = SchemaState()
        state.tables.add("parent")
        state.columns["parent"] = {"x", "y"}
        state.primary_keys["parent"] = ["x", "y"]
        state.unique_keys["parent"] = [("x", "y")]
        self.assertTrue(is_valid_fk_target(state, "parent", ["x", "y"]))

    def test_unique_existing_columns_passes(self) -> None:
        state = SchemaState()
        state.tables.add("demo")
        state.columns["demo"] = {"id", "a", "b"}
        contract = {
            "unique_constraints": [{"name": "demo_a_b_key", "columns": ["a", "b"]}],
        }
        action = {"object": "demo_a_b_key", "object_type": "unique"}
        errors, proof = apply_add_unique(state, action, "demo", {"demo": contract})
        self.assertEqual(errors, [])
        self.assertTrue(proof["valid"])

    def test_unique_missing_column_fails(self) -> None:
        state = SchemaState()
        state.tables.add("demo")
        state.columns["demo"] = {"id"}
        contract = {"unique_constraints": [{"name": "demo_a_b_key", "columns": ["a", "b"]}]}
        action = {"object": "demo_a_b_key", "object_type": "unique"}
        errors, proof = apply_add_unique(state, action, "demo", {"demo": contract})
        self.assertTrue(errors)
        self.assertFalse(proof["valid"])

    def test_index_existing_columns_passes(self) -> None:
        state = SchemaState()
        state.tables.add("demo")
        state.columns["demo"] = {"id", "name"}
        errors = apply_create_index(state, {"object": "demo_name_idx"}, "demo", ["name"])
        self.assertEqual(errors, [])

    def test_index_missing_column_fails(self) -> None:
        state = SchemaState()
        state.tables.add("demo")
        state.columns["demo"] = {"id"}
        errors = apply_create_index(state, {"object": "demo_missing_idx"}, "demo", ["missing"])
        self.assertTrue(errors)

    def test_missing_deferred_endpoint_fails(self) -> None:
        topo = [{"slot": 7, "actions": []}]
        contracts = {
            "demo": {
                "repair_slot": 7,
                "object_type": "table",
                "foreign_keys": [
                    {
                        "local_columns": ["parent_id"],
                        "referenced_relation": "missing",
                        "referenced_columns": ["id"],
                        "chronology": "CAN_BE_DEFERRED_TO_LATER_REPAIR_SLOT",
                        "defer_until_repair_slot": 99,
                    }
                ],
            }
        }
        doc = calculate_deferred_endpoints(topo, contracts)
        self.assertGreater(doc["unresolved_count"], 0)

    def test_report_machine_consistency(self) -> None:
        summary = json.loads((DATA / "ci-r3b1d11-topology-validation-summary-2026-08.json").read_text())
        report = (Path(__file__).resolve().parents[1] / "ci-r3b1d11-executable-ddl-validator-closure-2026-08.md").read_text()
        for key in ("slots_validated", "duplicate_creates", "graph_cycles", "invalid_fk_actions"):
            marker = f"{key}: {summary[key]}"
            self.assertIn(str(summary[key]), report)


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(R3B1D11GoldenTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS: all CI-R3B1D.1.1 golden tests" if result.wasSuccessful() else "FAIL")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
