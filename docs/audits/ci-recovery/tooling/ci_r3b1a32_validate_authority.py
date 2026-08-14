#!/usr/bin/env python3
"""Validator for CI-R3B1A.3.2 document-extraction FK authority."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from document_extraction_authority import DOCUMENT_EXTRACTION_FK_KEY, HISTORICAL_EVIDENCE  # noqa: E402
from repair_closure import (  # noqa: E402
    CREATION_ACTION_TYPES,
    PRIMARY_HISTORICAL_DEFECTS,
    apply_fk_chronology,
    derive_created_objects_from_actions,
    get_deferred_fk_resolution,
    object_available_at_slot,
)

REPO = Path(__file__).resolve().parents[4]
CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-predecessor-ddl-contracts-2026-08.json"
TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-final-repair-topology-2026-08.json"
DEFERRED = REPO / "docs/audits/ci-recovery/data/ci-r3b1a32-deferred-fk-resolution-2026-08.json"
TARGET_MIGRATION = (
    REPO / "backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql"
)
TARGET_SHA256 = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"

COUNTS = {
    "document_extraction_authority_gaps": 0,
    "invalid_intentionally_absent": 0,
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


def validate_intentionally_absent(records: list[dict], errors: list[str]) -> None:
    for rec in records:
        if rec.get("resolution_type") != "intentionally_absent":
            continue
        authority = rec.get("absence_authority") or {}
        if authority.get("physical_fk_expected") is not False:
            bump(
                "invalid_intentionally_absent",
                f"{rec['source_relation']}.{rec['local_columns']}: intentionally_absent without physical_fk_expected=false",
                errors,
            )
        if not authority.get("relation_mode"):
            bump(
                "invalid_intentionally_absent",
                f"{rec['source_relation']}.{rec['local_columns']}: missing absence_authority.relation_mode",
                errors,
            )
        if not authority.get("historical_commit"):
            bump(
                "invalid_intentionally_absent",
                f"{rec['source_relation']}.{rec['local_columns']}: missing absence_authority.historical_commit",
                errors,
            )
        if not authority.get("reason"):
            bump(
                "invalid_intentionally_absent",
                f"{rec['source_relation']}.{rec['local_columns']}: missing absence_authority.reason",
                errors,
            )


def validate_document_extraction_chain(
    contracts_doc: dict,
    topology_doc: dict,
    deferred_doc: dict,
    errors: list[str],
) -> None:
    by_obj = enriched_contracts(contracts_doc)
    vde = by_obj.get("vehicle_document_extractions")
    battery = by_obj.get("battery_evidence")
    if not vde:
        bump("document_extraction_authority_gaps", "missing vehicle_document_extractions contract", errors)
        return
    if not battery:
        bump("document_extraction_authority_gaps", "missing battery_evidence contract", errors)
        return

    if vde.get("classification") != "MISSING_HISTORY":
        bump(
            "document_extraction_authority_gaps",
            f"vehicle_document_extractions classification={vde.get('classification')} expected MISSING_HISTORY",
            errors,
        )
    if vde.get("historical_evidence", {}).get("physical_fk_expected") is not True:
        bump("document_extraction_authority_gaps", "vehicle_document_extractions historical_evidence incomplete", errors)

    doc_fk = next(
        (f for f in battery.get("foreign_keys", []) if f["referenced_relation"] == "vehicle_document_extractions"),
        None,
    )
    if not doc_fk:
        bump("document_extraction_authority_gaps", "battery_evidence missing document_extraction FK contract", errors)
        return
    if not any(c["column"] == "document_extraction_id" for c in battery.get("columns", [])):
        bump("document_extraction_authority_gaps", "battery_evidence missing document_extraction_id column", errors)

    resolution = get_deferred_fk_resolution("battery_evidence", doc_fk)
    if not resolution:
        bump("document_extraction_authority_gaps", "battery_evidence document_extraction FK has no resolution", errors)
        return
    if resolution.get("resolution_type") == "intentionally_absent":
        bump(
            "document_extraction_authority_gaps",
            "battery_evidence.document_extraction_id cannot be intentionally_absent",
            errors,
        )
    if resolution.get("physical_fk_expected") is not True:
        bump(
            "document_extraction_authority_gaps",
            "document extraction FK must have physical_fk_expected=true",
            errors,
        )
    if resolution.get("resolution_type") != "later_repair_slot" or resolution.get("resolution_slot") != 3:
        bump(
            "document_extraction_authority_gaps",
            f"document extraction FK resolution must be later_repair_slot 3, got {resolution.get('resolution_type')} {resolution.get('resolution_slot')}",
            errors,
        )

    slot3 = next((s for s in topology_doc["slots"] if s["slot"] == 3), None)
    if not slot3:
        bump("document_extraction_authority_gaps", "slot 3 missing", errors)
        return

    vde_create = next(
        (a for a in slot3["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "vehicle_document_extractions"),
        None,
    )
    be_create = next(
        (a for a in slot3["actions"] if a["action"] == "CREATE TABLE" and a["object"] == "battery_evidence"),
        None,
    )
    fk_action = next(
        (a for a in slot3["actions"] if a.get("object") == "battery_evidence_document_extraction_id_fkey"),
        None,
    )
    if not vde_create or not be_create or not fk_action:
        bump("document_extraction_authority_gaps", "slot 3 missing VDE CREATE, battery_evidence CREATE, or FK action", errors)
    elif not (vde_create["order"] < be_create["order"] < fk_action["order"]):
        bump(
            "document_extraction_authority_gaps",
            "slot 3 chronology must be VDE CREATE -> battery_evidence CREATE -> document_extraction FK",
            errors,
        )

    key = (
        "battery_evidence",
        tuple(doc_fk["local_columns"]),
        "vehicle_document_extractions",
    )
    artifact = next(
        (
            r
            for r in deferred_doc.get("records", [])
            if (
                r["source_relation"],
                tuple(r["local_columns"]),
                r["referenced_relation"],
            )
            == key
        ),
        None,
    )
    if not artifact or artifact.get("resolution_type") == "intentionally_absent":
        bump("document_extraction_authority_gaps", "deferred artifact still intentionally_absent or missing", errors)


def validate_created_metadata(topology_doc: dict, errors: list[str]) -> None:
    for slot in topology_doc["slots"]:
        slot_no = slot["slot"]
        actions = slot["actions"]
        derived = derive_created_objects_from_actions(actions)
        metadata = sorted(slot.get("objects_types_sequences_created", []))
        if metadata != derived:
            bump(
                "unexpected_created_object_metadata",
                f"slot {slot_no}: metadata {metadata} != derived {derived}",
                errors,
            )
        dupes = [k for k, v in Counter(metadata).items() if v > 1]
        for obj in dupes:
            bump("duplicate_created_object_metadata", f"slot {slot_no}: duplicate {obj}", errors)


def validate_deferred_fks(
    contracts_doc: dict,
    topology_doc: dict,
    deferred_doc: dict,
    errors: list[str],
) -> None:
    by_obj = enriched_contracts(contracts_doc)
    if deferred_doc.get("unresolved_deferred_fks"):
        for item in deferred_doc["unresolved_deferred_fks"]:
            bump("unresolved_deferred_fks", f"unresolved {item}", errors)

    records = {
        (r["source_relation"], tuple(r["local_columns"]), r["referenced_relation"]): r
        for r in deferred_doc.get("records", [])
    }

    for table, contract in by_obj.items():
        if contract.get("object_type") != "table":
            continue
        for fk in contract.get("foreign_keys", []):
            if not fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
                continue
            resolution = get_deferred_fk_resolution(table, fk)
            artifact = records.get((table, tuple(fk["local_columns"]), fk["referenced_relation"]))
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
                name = f"{table}_{'_'.join(fk['local_columns'])}_fkey"
                if not any(a.get("object") == name and a.get("action") == "ADD CONSTRAINT" for a in target_slot["actions"]):
                    bump("unresolved_deferred_fks", f"slot {slot} missing ADD CONSTRAINT {name}", errors)
                ref = fk["referenced_relation"]
                if not object_available_at_slot(ref, slot):
                    bump("unresolved_deferred_fks", f"slot {slot}: referenced {ref} unavailable", errors)
            elif rtype == "historical_migration":
                mig_name = resolution.get("resolution_migration")
                mig_path = REPO / "backend/prisma/migrations" / mig_name / "migration.sql"
                if not mig_path.exists():
                    bump("unresolved_deferred_fks", f"migration missing {mig_name}", errors)
                    continue
                name = f"{table}_{'_'.join(fk['local_columns'])}_fkey"
                if name not in mig_path.read_text():
                    bump("unresolved_deferred_fks", f"migration {mig_name} missing {name}", errors)


def validate_primary_closure_counts(topology_doc: dict, errors: list[str]) -> None:
    primary = topology_doc.get("primary_historical_defects", [])
    closure = topology_doc.get("required_repair_closure_objects", [])
    if len(primary) != 7:
        bump("document_extraction_authority_gaps", f"primary defect count={len(primary)} expected 7", errors)
    if set(primary) != PRIMARY_HISTORICAL_DEFECTS:
        bump("document_extraction_authority_gaps", "primary defect set mismatch", errors)
    if "vehicle_document_extractions" not in closure:
        bump("document_extraction_authority_gaps", "vehicle_document_extractions missing from closure", errors)
    if "DocumentExtractionType" not in closure or "DocumentExtractionStatus" not in closure:
        bump("document_extraction_authority_gaps", "DocumentExtraction enums missing from closure", errors)


def main() -> int:
    contracts = json.loads(CONTRACTS.read_text())
    topology = json.loads(TOPOLOGY.read_text())
    deferred = json.loads(DEFERRED.read_text())
    errors: list[str] = []

    current_sha = hashlib.sha256(TARGET_MIGRATION.read_bytes()).hexdigest()
    if current_sha != TARGET_SHA256:
        errors.append(f"target migration SHA mismatch {current_sha}")

    validate_primary_closure_counts(topology, errors)
    validate_document_extraction_chain(contracts, topology, deferred, errors)
    validate_intentionally_absent(deferred.get("records", []), errors)
    validate_created_metadata(topology, errors)
    validate_deferred_fks(contracts, topology, deferred, errors)

    if HISTORICAL_EVIDENCE.get("historical_create_table_found") is not False:
        bump("document_extraction_authority_gaps", "historical evidence must record no CREATE TABLE", errors)
    if HISTORICAL_EVIDENCE.get("physical_fk_expected") is not True:
        bump("document_extraction_authority_gaps", "historical evidence must expect physical FK", errors)

    if errors:
        print("VALIDATION FAILURES:")
        for e in errors:
            print(f"- {e}")
        print("COUNTS:", json.dumps(COUNTS, indent=2))
        return 1

    print("PASS: CI-R3B1A.3.2 document-extraction authority validated")
    print("COUNTS:", json.dumps(COUNTS, indent=2))
    print("primary:", len(topology["primary_historical_defects"]))
    print("closure:", len(topology["required_repair_closure_objects"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
