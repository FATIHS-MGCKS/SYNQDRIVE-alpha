#!/usr/bin/env python3
"""Validator for CI-R3B1A.3.1 topology consistency authority."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from repair_closure import (  # noqa: E402
    CREATION_ACTION_TYPES,
    apply_fk_chronology,
    derive_created_objects_from_actions,
    get_deferred_fk_resolution,
    object_available_at_slot,
)

REPO = Path(__file__).resolve().parents[4]
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a3-predecessor-ddl-contracts-2026-08.json"
TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-final-repair-topology-2026-08.json"
DEFERRED = REPO / "docs/audits/ci-recovery/data/ci-r3b1a31-deferred-fk-resolution-2026-08.json"
TARGET_MIGRATION = (
    REPO / "backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
)
TARGET_SHA256 = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"

COMPATIBLE_ACTIONS = {
    "table": {"CREATE TABLE"},
    "enum": {"CREATE TYPE"},
    "sequence": {"CREATE SEQUENCE"},
}

COUNTS = {
    "invalid_object_type_action_mappings": 0,
    "missing_created_object_metadata": 0,
    "unexpected_created_object_metadata": 0,
    "duplicate_created_object_metadata": 0,
    "invalid_sequence_chronology": 0,
    "invalid_type_chronology": 0,
    "invalid_immediate_fk_chronology": 0,
    "unresolved_deferred_fks": 0,
    "invalid_repair_slots": 0,
}


def bump(key: str, msg: str, errors: list[str]) -> None:
    COUNTS[key] += 1
    errors.append(msg)


def action_creations(actions: list[dict]) -> list[str]:
    return sorted(a["object"] for a in actions if a.get("action") in CREATION_ACTION_TYPES)


def validate_contract_action_semantics(
    contracts_doc: dict,
    topology_doc: dict,
    errors: list[str],
) -> None:
    by_obj = {c["object"]: c for c in contracts_doc["contracts"]}
    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        primary_actions: dict[str, list[str]] = {}
        for act in slot["actions"]:
            obj = act["object"]
            action = act["action"]
            if action in {"CREATE TABLE", "CREATE TYPE"} and (
                act.get("justification") == "primary repair object"
                or act.get("justification", "").startswith("enum repair object")
            ):
                primary_actions.setdefault(obj, []).append(action)

        for obj, actions in primary_actions.items():
            contract = by_obj.get(obj)
            if not contract:
                continue
            obj_type = contract.get("object_type", "table")
            expected = COMPATIBLE_ACTIONS.get(obj_type, set())
            for action in actions:
                if action not in expected:
                    bump(
                        "invalid_object_type_action_mappings",
                        f"slot {slot_no}: {obj} contract object_type={obj_type} incompatible with {action}",
                        errors,
                    )

    insight = by_obj.get("InsightType")
    if not insight or insight.get("object_type") != "enum":
        bump("invalid_object_type_action_mappings", "InsightType contract must be enum", errors)
    create_table_insight = sum(
        1
        for slot in topology_doc["slots"]
        for act in slot["actions"]
        if act.get("object") == "InsightType" and act.get("action") == "CREATE TABLE"
    )
    create_type_insight = sum(
        1
        for slot in topology_doc["slots"]
        for act in slot["actions"]
        if act.get("object") == "InsightType" and act.get("action") == "CREATE TYPE"
    )
    if create_table_insight != 0:
        bump(
            "invalid_object_type_action_mappings",
            f"InsightType CREATE TABLE occurrences={create_table_insight}, expected 0",
            errors,
        )
    if create_type_insight != 1:
        bump(
            "invalid_object_type_action_mappings",
            f"InsightType CREATE TYPE occurrences={create_type_insight}, expected 1",
            errors,
        )


def validate_created_metadata(topology_doc: dict, errors: list[str]) -> None:
    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        actions = slot["actions"]
        expected = action_creations(actions)
        metadata = sorted(slot.get("objects_types_sequences_created", []))
        derived = derive_created_objects_from_actions(actions)

        if metadata != derived:
            bump(
                "unexpected_created_object_metadata",
                f"slot {slot_no}: metadata not derived from actions metadata={metadata} derived={derived}",
                errors,
            )

        action_set = set(expected)
        meta_set = set(metadata)
        missing = sorted(action_set - meta_set)
        unexpected = sorted(meta_set - action_set)
        dupes = [k for k, v in Counter(metadata).items() if v > 1]

        for obj in missing:
            bump(
                "missing_created_object_metadata",
                f"slot {slot_no}: missing metadata for created object {obj}",
                errors,
            )
        for obj in unexpected:
            bump(
                "unexpected_created_object_metadata",
                f"slot {slot_no}: unexpected metadata object {obj}",
                errors,
            )
        for obj in dupes:
            bump(
                "duplicate_created_object_metadata",
                f"slot {slot_no}: duplicate metadata object {obj}",
                errors,
            )


def enriched_contracts(contracts_doc: dict) -> dict[str, dict]:
    by_obj: dict[str, dict] = {}
    for contract in contracts_doc["contracts"]:
        enriched = json.loads(json.dumps(contract))
        if enriched.get("object_type") == "table":
            enriched["foreign_keys"] = [
                apply_fk_chronology(enriched["object"], fk) for fk in enriched.get("foreign_keys", [])
            ]
        by_obj[enriched["object"]] = enriched
    return by_obj


def validate_deferred_fks(
    contracts_doc: dict,
    topology_doc: dict,
    deferred_doc: dict,
    errors: list[str],
) -> None:
    by_obj = enriched_contracts(contracts_doc)
    if deferred_doc.get("unresolved_deferred_fks"):
        for item in deferred_doc["unresolved_deferred_fks"]:
            bump("unresolved_deferred_fks", f"unresolved deferred FK {item}", errors)

    records = {(
        r["source_relation"],
        tuple(r["local_columns"]),
        r["referenced_relation"],
    ): r for r in deferred_doc.get("records", [])}

    for table, contract in by_obj.items():
        if contract.get("object_type") != "table":
            continue
        for fk in contract.get("foreign_keys", []):
            if not fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
                continue
            key = (table, tuple(fk["local_columns"]), fk["referenced_relation"])
            resolution = get_deferred_fk_resolution(table, fk)
            artifact = records.get(key)
            if not resolution or not artifact or not artifact.get("resolved"):
                bump(
                    "unresolved_deferred_fks",
                    f"missing resolution for {table}.{fk['local_columns']}->{fk['referenced_relation']}",
                    errors,
                )
                continue

            rtype = resolution["resolution_type"]
            if rtype == "later_repair_slot":
                slot = resolution.get("resolution_slot")
                target_slot = next((s for s in topology_doc["slots"] if s["slot"] == slot), None)
                if not target_slot:
                    bump("unresolved_deferred_fks", f"resolution slot {slot} missing", errors)
                    continue
                fk_actions = [
                    a
                    for a in target_slot["actions"]
                    if a.get("action") == "ADD CONSTRAINT"
                    and a.get("object") == f"{table}_{'_'.join(fk['local_columns'])}_fkey"
                ]
                if not fk_actions:
                    bump(
                        "unresolved_deferred_fks",
                        f"slot {slot} missing ADD CONSTRAINT for {table}.{fk['local_columns']}",
                        errors,
                    )
                ref = fk["referenced_relation"]
                if not object_available_at_slot(ref, slot):
                    bump(
                        "unresolved_deferred_fks",
                        f"slot {slot}: referenced relation {ref} unavailable before FK",
                        errors,
                    )
                local_table_slot = contract.get("repair_slot", 0)
                if local_table_slot > slot:
                    bump(
                        "unresolved_deferred_fks",
                        f"FK resolution slot {slot} before local table slot {local_table_slot}",
                        errors,
                    )
            elif rtype == "historical_migration":
                mig_name = resolution.get("resolution_migration")
                mig_path = REPO / "backend/prisma/migrations" / mig_name / "migration.sql"
                if not mig_path.exists():
                    bump("unresolved_deferred_fks", f"migration missing {mig_name}", errors)
                    continue
                sql = mig_path.read_text()
                name = f'{table}_{"_".join(fk["local_columns"])}_fkey'
                if name not in sql:
                    bump(
                        "unresolved_deferred_fks",
                        f"migration {mig_name} missing FK SQL for {table}.{fk['local_columns']}",
                        errors,
                    )
            elif rtype == "intentionally_absent":
                if not resolution.get("evidence"):
                    bump(
                        "unresolved_deferred_fks",
                        f"intentionally_absent FK {table}.{fk['local_columns']} lacks evidence",
                        errors,
                    )
            else:
                bump("unresolved_deferred_fks", f"unknown resolution_type {rtype}", errors)


def validate_chronology(
    contracts_doc: dict,
    topology_doc: dict,
    errors: list[str],
) -> None:
    by_obj = {c["object"]: c for c in contracts_doc["contracts"]}
    available: set[str] = {"vehicles", "users", "organizations", "vehicle_service_events"}

    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        seen_types: set[str] = set()
        seen_sequences: set[str] = set()
        slot_available = set(available)

        for act in sorted(slot["actions"], key=lambda a: a["order"]):
            if act["action"] == "CREATE TYPE":
                if act["object"] in seen_types:
                    bump(
                        "invalid_type_chronology",
                        f"slot {slot_no}: duplicate CREATE TYPE {act['object']}",
                        errors,
                    )
                seen_types.add(act["object"])
            if act["action"] == "CREATE SEQUENCE":
                if act["object"] in seen_sequences:
                    bump(
                        "invalid_sequence_chronology",
                        f"slot {slot_no}: duplicate CREATE SEQUENCE {act['object']}",
                        errors,
                    )
                seen_sequences.add(act["object"])
            if act["action"] == "CREATE TABLE":
                obj = act["object"]
                contract = by_obj.get(obj)
                if contract:
                    for dep in contract.get("create_time_prerequisites", []):
                        if dep not in slot_available:
                            prior = [
                                a
                                for a in slot["actions"]
                                if a["object"] == dep and a["order"] < act["order"]
                            ]
                            if not prior:
                                bump(
                                    "invalid_type_chronology",
                                    f"slot {slot_no}: {obj} create before prerequisite {dep}",
                                    errors,
                                )
                    for col in contract.get("columns", []):
                        if col.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
                            seq = col.get("generation", {}).get("sequence_name") or f"{obj}_{col['column']}_seq"
                            prior_seq = [
                                a
                                for a in slot["actions"]
                                if a.get("object") == seq and a["order"] < act["order"]
                            ]
                            if not prior_seq:
                                bump(
                                    "invalid_sequence_chronology",
                                    f"slot {slot_no}: {obj} create before sequence {seq}",
                                    errors,
                                )
            if act["action"] == "ADD CONSTRAINT" and act.get("fk"):
                fk = act["fk"]
                chron = fk.get("chronology", "")
                if chron == "REQUIRED_AT_TABLE_CREATE" or act.get("resolution_type") == "later_repair_slot":
                    ref = fk["referenced_relation"]
                    if ref not in slot_available:
                        bump(
                            "invalid_immediate_fk_chronology",
                            f"slot {slot_no}: FK to unavailable {ref}",
                            errors,
                        )
            if act["action"] in CREATION_ACTION_TYPES:
                slot_available.add(act["object"])

        available.update(slot_available)

        if slot.get("deferred_actions"):
            bump(
                "invalid_repair_slots",
                f"slot {slot_no}: deferred_actions must be empty in A.3.1 topology",
                errors,
            )
        if not slot.get("closure_validated"):
            bump("invalid_repair_slots", f"slot {slot_no} not closure_validated", errors)


def main() -> int:
    contracts = json.loads(CONTRACTS.read_text())
    topology = json.loads(TOPOLOGY.read_text())
    deferred = json.loads(DEFERRED.read_text())
    errors: list[str] = []

    current_sha = hashlib.sha256(TARGET_MIGRATION.read_bytes()).hexdigest()
    if current_sha != TARGET_SHA256:
        errors.append(f"target migration SHA mismatch {current_sha}")

    validate_contract_action_semantics(contracts, topology, errors)
    validate_created_metadata(topology, errors)
    validate_deferred_fks(contracts, topology, deferred, errors)
    validate_chronology(contracts, topology, errors)

    if errors:
        print("VALIDATION FAILURES:")
        for e in errors:
            print(f"- {e}")
        print("COUNTS:", json.dumps(COUNTS, indent=2))
        return 1

    print("PASS: CI-R3B1A.3.1 topology validated")
    print("COUNTS:", json.dumps(COUNTS, indent=2))
    print("target_sha_match:", current_sha == TARGET_SHA256)
    return 0


if __name__ == "__main__":
    sys.exit(main())
