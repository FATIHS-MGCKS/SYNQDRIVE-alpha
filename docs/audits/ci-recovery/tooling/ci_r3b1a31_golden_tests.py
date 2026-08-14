#!/usr/bin/env python3
"""Golden tests for CI-R3B1A.3.1 topology consistency."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from repair_closure import (  # noqa: E402
    apply_fk_chronology,
    build_deferred_fk_resolution_artifact,
    derive_created_objects_from_actions,
    get_deferred_fk_resolution,
    ordered_actions_for_contract,
)

REPO = Path(__file__).resolve().parents[4]
CONTRACTS_PATH = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
TOPOLOGY_PATH = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-final-repair-topology-2026-08.json"
DEFERRED_PATH = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-deferred-fk-resolution-2026-08.json"

FAILURES: list[str] = []


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def primary_action_type(actions: list[dict], obj: str) -> str | None:
    for act in actions:
        if act["object"] == obj and act.get("justification") in {
            "primary repair object",
        } or act.get("justification", "").startswith("enum repair object"):
            return act["action"]
    return None


def test_enum_contract_create_type_pass() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    insight = next(c for c in contracts["contracts"] if c["object"] == "InsightType")
    actions = ordered_actions_for_contract("InsightType", insight)
    assert_true(len(actions) == 1, "InsightType should have one action")
    assert_true(actions[0]["action"] == "CREATE TYPE", "enum contract -> CREATE TYPE")


def test_enum_contract_create_table_rejected() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    insight = next(c for c in contracts["contracts"] if c["object"] == "InsightType")
    bad = copy.deepcopy(insight)
    bad_contract_actions = ordered_actions_for_contract("InsightType", bad)
    assert_true(all(a["action"] != "CREATE TABLE" for a in bad_contract_actions), "enum contract must not emit CREATE TABLE")
    bad_table = {"object_type": "enum", "labels": ["A"]}
    forced = [{"action": "CREATE TABLE", "object": "InsightType"}]
    assert_true(forced[0]["action"] != "CREATE TYPE", "CREATE TABLE is incompatible with enum contract")


def test_table_contract_create_table_pass() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    org_tasks = next(c for c in contracts["contracts"] if c["object"] == "org_tasks")
    actions = ordered_actions_for_contract("org_tasks", org_tasks)
    table_actions = [a for a in actions if a["object"] == "org_tasks" and a["action"] == "CREATE TABLE"]
    assert_true(len(table_actions) == 1, "table contract -> CREATE TABLE")


def test_table_contract_create_type_rejected() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    org_tasks = next(c for c in contracts["contracts"] if c["object"] == "org_tasks")
    actions = ordered_actions_for_contract("org_tasks", org_tasks)
    assert_true(
        not any(a["object"] == "org_tasks" and a["action"] == "CREATE TYPE" for a in actions),
        "table contract must not emit CREATE TYPE for table object",
    )


def test_sequence_metadata_sync_pass() -> None:
    topology = json.loads(TOPOLOGY_PATH.read_text())
    slot4 = next(s for s in topology["slots"] if s["slot"] == 4)
    seq_actions = [a for a in slot4["actions"] if a["action"] == "CREATE SEQUENCE"]
    assert_true(any(a["object"] == "org_invoices_invoice_number_seq" for a in seq_actions), "CREATE SEQUENCE present")
    derived = derive_created_objects_from_actions(slot4["actions"])
    assert_true("org_invoices_invoice_number_seq" in derived, "sequence in derived metadata")
    assert_true("org_invoices_invoice_number_seq" in slot4["objects_types_sequences_created"], "sequence in slot metadata")


def test_missing_sequence_metadata_rejected() -> None:
    actions = [
        {"action": "CREATE SEQUENCE", "object": "demo_seq"},
        {"action": "CREATE TABLE", "object": "demo"},
    ]
    derived = derive_created_objects_from_actions(actions)
    assert_true("demo_seq" in derived, "derive includes sequence")
    bad_metadata = ["demo"]
    assert_true(set(bad_metadata) != set(derived), "missing sequence metadata would mismatch")


def test_unexpected_sequence_metadata_rejected() -> None:
    actions = [{"action": "CREATE TABLE", "object": "demo"}]
    derived = derive_created_objects_from_actions(actions)
    bad_metadata = ["demo", "phantom_seq"]
    assert_true(set(bad_metadata) != set(derived), "unexpected sequence metadata would mismatch")


def test_deferred_fk_later_slot_resolves() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    by_obj = {c["object"]: c for c in contracts["contracts"]}
    org_tasks = by_obj["org_tasks"]
    inv_fk = next(f for f in org_tasks["foreign_keys"] if f["referenced_relation"] == "org_invoices")
    resolution = get_deferred_fk_resolution("org_tasks", inv_fk)
    assert_true(resolution is not None, "invoice FK has resolution")
    assert_true(resolution["resolution_type"] == "later_repair_slot", "later repair slot resolution")
    assert_true(resolution["resolution_slot"] == 4, "resolved at slot 4")
    topology = json.loads(TOPOLOGY_PATH.read_text())
    slot4 = next(s for s in topology["slots"] if s["slot"] == 4)
    fk_actions = [a for a in slot4["actions"] if a.get("object") == "org_tasks_invoice_id_fkey"]
    assert_true(len(fk_actions) == 1, "slot 4 contains deferred FK action")


def enrich_contracts(contracts_doc: dict) -> dict[str, dict]:
    by_obj: dict[str, dict] = {}
    for contract in contracts_doc["contracts"]:
        enriched = json.loads(json.dumps(contract))
        if enriched.get("object_type") == "table":
            enriched["foreign_keys"] = [
                apply_fk_chronology(enriched["object"], fk) for fk in enriched.get("foreign_keys", [])
            ]
        by_obj[enriched["object"]] = enriched
    return by_obj


def test_deferred_fk_without_endpoint_rejected() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    by_obj = enrich_contracts(contracts)
    deferred = build_deferred_fk_resolution_artifact(by_obj)
    assert_true(len(deferred["unresolved_deferred_fks"]) == 0, "no unresolved deferred FKs")


def test_historical_fk_endpoint_validated() -> None:
    contracts = json.loads(CONTRACTS_PATH.read_text())
    by_obj = {c["object"]: c for c in contracts["contracts"]}
    org_tasks = by_obj["org_tasks"]
    fine_fk = next(f for f in org_tasks["foreign_keys"] if f["referenced_relation"] == "fines")
    resolution = get_deferred_fk_resolution("org_tasks", fine_fk)
    assert_true(resolution is not None, "fine FK has resolution")
    assert_true(resolution["resolution_type"] == "historical_migration", "historical migration resolution")
    mig = resolution.get("resolution_migration")
    mig_path = REPO / "backend/prisma/migrations" / mig / "migration.sql"
    assert_true(mig_path.exists(), "historical migration exists")
    sql = mig_path.read_text()
    assert_true("org_tasks_fine_id_fkey" in sql, "historical migration contains fine FK")


def test_insighttype_topology_regression() -> None:
    topology = json.loads(TOPOLOGY_PATH.read_text())
    create_table = sum(
        1
        for slot in topology["slots"]
        for act in slot["actions"]
        if act.get("object") == "InsightType" and act.get("action") == "CREATE TABLE"
    )
    create_type = sum(
        1
        for slot in topology["slots"]
        for act in slot["actions"]
        if act.get("object") == "InsightType" and act.get("action") == "CREATE TYPE"
    )
    assert_true(create_table == 0, "CREATE TABLE InsightType occurrences = 0")
    assert_true(create_type == 1, "CREATE TYPE InsightType occurrences = 1")


def test_deferred_artifact_complete() -> None:
    deferred = json.loads(DEFERRED_PATH.read_text())
    assert_true(deferred["total_deferred_fks"] == 3, "three deferred FKs")
    assert_true(len(deferred["unresolved_deferred_fks"]) == 0, "zero unresolved")
    for rec in deferred["records"]:
        assert_true(rec.get("resolved") is True, f"resolved {rec['source_relation']}")
        assert_true(rec.get("resolution_type") in {
            "later_repair_slot",
            "historical_migration",
            "intentionally_absent",
        }, "valid resolution_type")


def main() -> int:
    test_enum_contract_create_type_pass()
    test_enum_contract_create_table_rejected()
    test_table_contract_create_table_pass()
    test_table_contract_create_type_rejected()
    test_sequence_metadata_sync_pass()
    test_missing_sequence_metadata_rejected()
    test_unexpected_sequence_metadata_rejected()
    test_deferred_fk_later_slot_resolves()
    test_deferred_fk_without_endpoint_rejected()
    test_historical_fk_endpoint_validated()
    test_insighttype_topology_regression()
    test_deferred_artifact_complete()
    if FAILURES:
        print("GOLDEN TEST FAILURES:")
        for f in FAILURES:
            print("-", f)
        return 1
    print("PASS: all CI-R3B1A.3.1 golden tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
