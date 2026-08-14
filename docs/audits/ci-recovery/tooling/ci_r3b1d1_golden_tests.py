#!/usr/bin/env python3
"""Golden tests for CI-R3B1D.1 repair topology graph engine."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d1_repair_action_graph import (  # noqa: E402
    build_slot_graph,
    dedupe_create_actions,
)
from ci_r3b1d1_validate_topology import SchemaState, simulate_slot_actions, bootstrap_preexisting_state  # noqa: E402
from repair_closure import ordered_actions_for_contract  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"


class GraphGoldenTests(unittest.TestCase):
    def test_workflowstatus_dedup(self) -> None:
        ws_contract = {
            "object_type": "enum",
            "labels": ["ACTIVE", "DRAFT", "DISABLED"],
            "enum_dependencies": [],
            "columns": [],
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        ow_contract = {
            "object_type": "table",
            "enum_dependencies": [{"name": "WorkflowStatus", "labels": ["ACTIVE", "DRAFT", "DISABLED"]}],
            "columns": [{"column": "id"}, {"column": "status", "postgres_type": '"WorkflowStatus"'}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        contracts = {"WorkflowStatus": ws_contract, "org_workflows": ow_contract}
        graph = build_slot_graph(8, contracts, ["WorkflowStatus", "org_workflows"])
        creates = [a for a in graph["actions"] if a["action"] == "CREATE TYPE" and a["object"] == "WorkflowStatus"]
        self.assertEqual(len(creates), 1)
        tables = [a for a in graph["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "org_workflows"]
        self.assertEqual(len(tables), 1)
        ws_order = creates[0]["order"]
        self.assertLess(ws_order, tables[0]["order"])

    def test_parent_before_fk_not_lexical(self) -> None:
        child = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}, {"column": "parent_id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [
                {
                    "local_columns": ["parent_id"],
                    "referenced_relation": "aaa_parent",
                    "referenced_columns": ["id"],
                    "chronology": "REQUIRED_BEFORE_FIRST_CONSUMER",
                }
            ],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        parent = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        contracts = {"zzz_child": child, "aaa_parent": parent}
        graph = build_slot_graph(99, contracts, ["zzz_child", "aaa_parent"])
        fk = next(a for a in graph["actions"] if a["action"] == "ADD CONSTRAINT")
        parent_create = next(a for a in graph["actions"] if a["object"] == "aaa_parent")
        self.assertLess(parent_create["order"], fk["order"])

    def test_deferred_fk_omitted_from_immediate_actions(self) -> None:
        child = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}, {"column": "parent_id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [
                {
                    "local_columns": ["parent_id"],
                    "referenced_relation": "missing_parent",
                    "referenced_columns": ["id"],
                    "chronology": "CAN_BE_DEFERRED_TO_LATER_REPAIR_SLOT",
                }
            ],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        contracts = {"child_table": child}
        graph = build_slot_graph(99, contracts, ["child_table"])
        fks = [a for a in graph["actions"] if a["action"] == "ADD CONSTRAINT"]
        self.assertEqual(fks, [])

    def test_cycle_rejection_in_slot_validation(self) -> None:
        slot = {
            "slot": 99,
            "actions": [{"order": 1, "action": "CREATE TABLE", "object": "table_a", "object_type": "table"}],
            "graph_validation": {"cycles": [["slot99:create-table:table_a", "slot99:create-table:table_b"]], "valid": False},
        }
        contract = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        result = simulate_slot_actions(slot, {"table_a": contract}, SchemaState())
        self.assertFalse(result["pass"])

    def test_index_requires_column(self) -> None:
        contract = {
            "object_type": "table",
            "enum_dependencies": [],
            "columns": [{"column": "id"}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [{"columns": ["missing_col"]}],
            "unique_constraints": [],
        }
        slot = {
            "slot": 99,
            "actions": [
                {"order": 1, "action": "CREATE TABLE", "object": "demo", "object_type": "table"},
                {"order": 2, "action": "CREATE INDEX", "object": "demo_missing_col_idx", "object_type": "index"},
            ],
        }
        fail = simulate_slot_actions(slot, {"demo": contract}, SchemaState())
        self.assertFalse(fail["pass"])
        contract["columns"].append({"column": "missing_col"})
        slot2 = dict(slot)
        pass_res = simulate_slot_actions(slot2, {"demo": contract}, SchemaState())
        self.assertTrue(pass_res["pass"])

    def test_enum_before_table_order(self) -> None:
        table = {
            "object_type": "table",
            "enum_dependencies": [{"name": "EnumE", "labels": ["A"]}],
            "columns": [{"column": "id"}, {"column": "kind", "postgres_type": '"EnumE"'}],
            "primary_key": {"columns": ["id"]},
            "foreign_keys": [],
            "required_preexisting_indexes": [],
            "unique_constraints": [],
        }
        contracts = {"zzz_table": table}
        graph = build_slot_graph(99, contracts, ["zzz_table"])
        enum_act = next(a for a in graph["actions"] if a["action"] == "CREATE TYPE")
        table_act = next(a for a in graph["actions"] if a["action"] == "CREATE TABLE")
        self.assertEqual(enum_act["object"], "EnumE")
        self.assertLess(enum_act["order"], table_act["order"])

    def test_r3b1d_slot8_regression(self) -> None:
        topo = json.loads((DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json").read_text())
        slot8 = next(s for s in topo["slots"] if s["slot"] == 8)
        ws = [a for a in slot8["actions"] if a["action"] == "CREATE TYPE" and a["object"] == "WorkflowStatus"]
        self.assertEqual(len(ws), 1)

    def test_r3b1d_slot10_fk_regression(self) -> None:
        topo = json.loads((DATA / "ci-r3b1d1-post-vendor-repair-topology-2026-08.json").read_text())
        slot10 = next(s for s in topo["slots"] if s["slot"] == 10)
        fk = next(a for a in slot10["actions"] if a["object"] == "vehicle_damage_images_damage_id_fkey")
        damages = next(a for a in slot10["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "vehicle_damages")
        self.assertLess(damages["order"], fk["order"])


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GraphGoldenTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS: all CI-R3B1D.1 golden tests" if result.wasSuccessful() else "FAIL")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
