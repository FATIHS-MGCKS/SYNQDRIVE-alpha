#!/usr/bin/env python3
"""Build CI-R3B1D vendor predecessor DDL authority, closure, and repair topology."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1d_build_post_vendor_matrix import build_post_vendor_matrix  # noqa: E402
from prisma_schema_authority import extract_model_contract, parse_schema  # noqa: E402
from repair_closure import (  # noqa: E402
    apply_fk_chronology,
    build_closure_record,
    dedupe_enum_dependencies,
    enrich_column_defaults,
    ordered_actions_for_contract,
)
from sql_migration_analyzer import unique_defect_objects  # noqa: E402

SCHEMA_REV = "03a6cdfe^"
HISTORICAL_AUTHORITY_COMMIT = "03a6cdfe"

OUT_CONTRACTS = REPO / "docs/audits/ci-recovery/data/ci-r3b1d-vendor-predecessor-ddl-contracts-2026-08.json"
OUT_CLOSURE = REPO / "docs/audits/ci-recovery/data/ci-r3b1d-repair-dependency-closure-2026-08.json"
OUT_TOPOLOGY = REPO / "docs/audits/ci-recovery/data/ci-r3b1d-final-repair-topology-2026-08.json"

VENDOR_SLOT = 7
REPAIR_AFTER = "20260613200000_booking_document_lifecycle"
REPAIR_BEFORE = "20260613210000_vendor_management_overhaul"
FIRST_CONSUMER = REPAIR_BEFORE

KNOWN_VALID_OBJECTS: dict[str, dict[str, Any]] = {
    "ActivityEntity": {
        "classification": "VALID",
        "object_type": "enum",
        "reason": "Created in init migration; extended by audit migrations before vendor overhaul",
        "creator_migration": "20260311224040_init",
        "evidence": [
            "backend/prisma/migrations/20260311224040_init/migration.sql:CREATE TYPE ActivityEntity",
            "backend/prisma/migrations/20260412040000_audit_consent_provenance/migration.sql:ALTER TYPE ActivityEntity",
        ],
    },
    "org_invoices": {
        "classification": "VALID",
        "object_type": "table",
        "reason": "Historical predecessor repaired in CI-R3B1B slot 4",
        "creator_migration": "20260413225000_ci_r3b_historical_predecessor_slot4",
        "evidence": [
            "backend/prisma/migrations/20260413225000_ci_r3b_historical_predecessor_slot4/migration.sql:CREATE TABLE org_invoices",
            "ci-r3b1b-historical-predecessor-repair-full-replay-2026-08.md:slot 4",
        ],
    },
}

VENDOR_DEFECT_SPECS: dict[str, dict[str, Any]] = {
    "VendorCategory": {
        "classification": "MISSING_HISTORY",
        "before": FIRST_CONSUMER,
        "model": None,
        "enum_only": "VendorCategory",
        "enums": ["VendorCategory"],
        "not_yet": [
            {
                "name": "INSURANCE",
                "object_type": "enum_label",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Label added by vendor management overhaul",
            },
            {
                "name": "APPRAISER",
                "object_type": "enum_label",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Label added by vendor management overhaul",
            },
            {
                "name": "TOWING",
                "object_type": "enum_label",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Label added by vendor management overhaul",
            },
            {
                "name": "DEALERSHIP",
                "object_type": "enum_label",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Label added by vendor management overhaul",
            },
            {
                "name": "OEM_SERVICE",
                "object_type": "enum_label",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Label added by vendor management overhaul",
            },
        ],
        "repair_after": REPAIR_AFTER,
        "repair_before": REPAIR_BEFORE,
    },
    "vendors": {
        "classification": "MISSING_HISTORY",
        "before": FIRST_CONSUMER,
        "model": "Vendor",
        "enums": ["VendorCategory", "VendorSourceType"],
        "not_yet": [
            {
                "name": "source",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "VendorSource column added by vendor management overhaul",
            },
            {
                "name": "external_place_id",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Mapbox POI column added by vendor management overhaul",
            },
            {
                "name": "address_line2",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Address extension added by vendor management overhaul",
            },
        ],
        "repair_after": REPAIR_AFTER,
        "repair_before": REPAIR_BEFORE,
        "share_bootstrap_with": ["vendor_vehicles"],
    },
    "vendor_vehicles": {
        "classification": "MISSING_HISTORY",
        "before": FIRST_CONSUMER,
        "model": "VendorVehicle",
        "enums": [],
        "not_yet": [
            {
                "name": "relation_type",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "VendorVehicleRelationType column added by vendor management overhaul",
            },
            {
                "name": "is_preferred",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Lifecycle metadata added by vendor management overhaul",
            },
            {
                "name": "priority",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Lifecycle metadata added by vendor management overhaul",
            },
            {
                "name": "valid_from",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Lifecycle metadata added by vendor management overhaul",
            },
            {
                "name": "valid_until",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Lifecycle metadata added by vendor management overhaul",
            },
            {
                "name": "updated_at",
                "object_type": "column",
                "introduced_by_migration": FIRST_CONSUMER,
                "reason_excluded": "Lifecycle metadata added by vendor management overhaul",
            },
        ],
        "repair_after": REPAIR_AFTER,
        "repair_before": REPAIR_BEFORE,
        "share_bootstrap_with": ["vendors"],
    },
}

PRIMARY_VENDOR_DEFECTS = ["VendorCategory", "vendors", "vendor_vehicles"]


def git_show_file(rev: str, path: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), "show", f"{rev}:{path}"], text=True
    )


def enum_contract(
    schema: str, enum_name: str, spec: dict[str, Any], defect: dict[str, Any]
) -> dict[str, Any]:
    parsed = parse_schema(schema)
    labels = parsed.enums.get(enum_name, [])
    excluded = {item["name"] for item in spec["not_yet"]}
    historical_labels = [label for label in labels if label not in excluded]
    return {
        "object": enum_name,
        "object_type": "enum",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": HISTORICAL_AUTHORITY_COMMIT,
        "historical_schema_revision": SCHEMA_REV,
        "first_consumer": defect["first_consumer_migration"],
        "repair_slot": VENDOR_SLOT,
        "schema": "public",
        "type_name": enum_name,
        "labels": historical_labels,
        "order_material": True,
        "creator": None,
        "relation": None,
        "columns": [],
        "primary_key": None,
        "foreign_keys": [],
        "unique_constraints": [],
        "check_constraints": [],
        "required_preexisting_indexes": [],
        "enum_dependencies": [],
        "create_time_prerequisites": [],
        "required_before_first_consumer": [],
        "deferred_constraints": [],
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": None,
        },
        "evidence": [
            f"schema:{HISTORICAL_AUTHORITY_COMMIT}:enum {enum_name}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def table_contract(schema: str, spec: dict[str, Any], defect: dict[str, Any]) -> dict[str, Any]:
    model = extract_model_contract(schema, spec["model"])
    table = model["table"]
    enum_deps = dedupe_enum_dependencies(model["enum_dependencies"])
    columns = [enrich_column_defaults(table, col) for col in model["columns"]]
    foreign_keys = [apply_fk_chronology(table, fk) for fk in model["foreign_keys"]]

    if table == "vendor_vehicles":
        for fk in foreign_keys:
            if fk["referenced_relation"] == "vendors":
                fk["chronology"] = "CAN_BE_DEFERRED_TO_LATER_REPAIR_SLOT"
                fk["required_before_first_consumer"] = False
                fk["defer_until_repair_slot"] = VENDOR_SLOT
                fk["chronology_evidence"] = [
                    "vendors repair object in same slot 7 bootstrap; FK enforced after vendors CREATE TABLE"
                ]

    deferred = [fk for fk in foreign_keys if fk.get("chronology", "").startswith("CAN_BE_DEFERRED")]
    required_before_fc = [
        f"{fk['local_columns']}->{fk['referenced_relation']}.{fk['referenced_columns']}"
        for fk in foreign_keys
        if fk.get("required_before_first_consumer")
    ]

    return {
        "object": table,
        "object_type": "table",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": HISTORICAL_AUTHORITY_COMMIT,
        "historical_schema_revision": SCHEMA_REV,
        "historical_prisma_model": spec["model"],
        "first_consumer": defect["first_consumer_migration"],
        "repair_slot": VENDOR_SLOT,
        "relation": {"schema": "public", "name": table},
        "columns": columns,
        "primary_key": model["primary_key"],
        "foreign_keys": foreign_keys,
        "unique_constraints": model["unique_constraints"],
        "check_constraints": [],
        "required_preexisting_indexes": model["required_preexisting_indexes"],
        "enum_dependencies": enum_deps,
        "create_time_prerequisites": [dep["name"] for dep in enum_deps],
        "required_before_first_consumer": required_before_fc,
        "deferred_constraints": deferred,
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": None,
        },
        "evidence": [
            f"schema:{HISTORICAL_AUTHORITY_COMMIT}:model {spec['model']}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def build_vendor_contracts(defects: list[dict[str, Any]]) -> dict[str, Any]:
    defect_by_obj = {d["object"]: d for d in defects}
    schema = git_show_file(SCHEMA_REV, "backend/prisma/schema.prisma")
    contracts: list[dict[str, Any]] = []
    for obj in PRIMARY_VENDOR_DEFECTS:
        spec = VENDOR_DEFECT_SPECS[obj]
        defect = defect_by_obj.get(obj)
        if defect is None:
            raise RuntimeError(f"matrix missing defect object {obj}")
        if spec.get("enum_only"):
            contracts.append(enum_contract(schema, spec["enum_only"], spec, defect))
        else:
            contracts.append(table_contract(schema, spec, defect))

    vendor_source_type = parse_schema(schema).enums.get("VendorSourceType", [])
    contracts.append(
        {
            "object": "VendorSourceType",
            "object_type": "enum",
            "classification": "REPAIR_CLOSURE",
            "required_before_migration": FIRST_CONSUMER,
            "historical_authority_commit": HISTORICAL_AUTHORITY_COMMIT,
            "historical_schema_revision": SCHEMA_REV,
            "first_consumer": FIRST_CONSUMER,
            "repair_slot": VENDOR_SLOT,
            "schema": "public",
            "type_name": "VendorSourceType",
            "labels": vendor_source_type,
            "order_material": True,
            "creator": None,
            "relation": None,
            "columns": [],
            "primary_key": None,
            "foreign_keys": [],
            "unique_constraints": [],
            "check_constraints": [],
            "required_preexisting_indexes": [],
            "enum_dependencies": [],
            "create_time_prerequisites": [],
            "required_before_first_consumer": [],
            "deferred_constraints": [],
            "not_present_yet": [],
            "repair_insertion": {
                "after": REPAIR_AFTER,
                "before": REPAIR_BEFORE,
                "can_share_bootstrap_with": ["vendors"],
                "creator_migration": None,
            },
            "evidence": [
                f"schema:{HISTORICAL_AUTHORITY_COMMIT}:enum VendorSourceType",
                "closure:required by vendors.source_type column",
            ],
        }
    )
    return {
        "schema_version": 1,
        "historical_schema_revision": SCHEMA_REV,
        "historical_authority_commit": HISTORICAL_AUTHORITY_COMMIT,
        "known_valid_objects": KNOWN_VALID_OBJECTS,
        "primary_historical_defects": PRIMARY_VENDOR_DEFECTS,
        "contracts": contracts,
    }


def build_vendor_topology(contracts_by_object: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    object_order = ["VendorCategory", "VendorSourceType", "vendors", "vendor_vehicles"]
    actions: list[dict[str, Any]] = []
    action_order = 1
    for obj in object_order:
        contract = contracts_by_object[obj]
        for act in ordered_actions_for_contract(obj, contract):
            act = dict(act)
            act["order"] = action_order
            action_order += 1
            actions.append(act)

    for fk in contracts_by_object["vendor_vehicles"].get("foreign_keys", []):
        if fk.get("chronology", "").startswith("CAN_BE_DEFERRED"):
            actions.append(
                {
                    "order": action_order,
                    "action": "ADD CONSTRAINT",
                    "object": "vendor_vehicles_vendor_id_fkey",
                    "object_type": "foreign_key",
                    "justification": "Deferred vendors FK resolved after vendors CREATE in slot 7",
                    "fk": fk,
                    "source_repair_object": "vendor_vehicles",
                    "resolves_deferred_from_slot": VENDOR_SLOT,
                    "resolution_type": "same_repair_slot",
                }
            )
            action_order += 1

    created = sorted(
        {
            act["object"]
            for act in actions
            if act.get("action") in {"CREATE TYPE", "CREATE TABLE", "CREATE SEQUENCE"}
        }
    )
    return [
        {
            "slot": VENDOR_SLOT,
            "after_migration": REPAIR_AFTER,
            "before_migration": REPAIR_BEFORE,
            "objects_types_sequences_created": created,
            "actions": actions,
            "deferred_actions": [],
            "first_consumers_protected": [FIRST_CONSUMER],
            "must_execute_after": [REPAIR_AFTER],
            "must_execute_before": [REPAIR_BEFORE],
            "closure_validated": True,
            "reason": "Vendor predecessor repair slot between booking_document_lifecycle and vendor_management_overhaul",
        }
    ]


def main() -> int:
    matrix = build_post_vendor_matrix(REPO)
    defects = unique_defect_objects(
        {"dependencies": matrix["records"], "classification_totals": matrix["classification_totals"]}
    )
    contracts_doc = build_vendor_contracts(defects)
    contracts = contracts_doc["contracts"]
    by_obj = {c["object"]: c for c in contracts}

    closure_records = [
        build_closure_record(obj, by_obj[obj], VENDOR_SLOT)
        for obj in ["vendors", "vendor_vehicles"]
        if obj in by_obj
    ]
    topology = build_vendor_topology(by_obj)

    closure_doc = {
        "schema_version": 1,
        "repair_slot": VENDOR_SLOT,
        "known_valid_objects": KNOWN_VALID_OBJECTS,
        "primary_historical_defects": PRIMARY_VENDOR_DEFECTS,
        "required_repair_closure_objects": ["VendorSourceType"],
        "records": closure_records,
    }
    topology_doc = {
        "schema_version": 1,
        "supersedes": None,
        "target_first_consumer": FIRST_CONSUMER,
        "known_valid_objects": KNOWN_VALID_OBJECTS,
        "primary_historical_defects": PRIMARY_VENDOR_DEFECTS,
        "required_repair_closure_objects": ["VendorSourceType"],
        "slots": topology,
    }

    OUT_CONTRACTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_CONTRACTS.write_text(json.dumps(contracts_doc, indent=2) + "\n")
    OUT_CLOSURE.write_text(json.dumps(closure_doc, indent=2) + "\n")
    OUT_TOPOLOGY.write_text(json.dumps(topology_doc, indent=2) + "\n")

    totals = matrix["classification_totals"]
    print("matrix totals:", json.dumps(totals, indent=2))
    print("primary defects:", PRIMARY_VENDOR_DEFECTS)
    print("known valid:", list(KNOWN_VALID_OBJECTS))
    print("repair slot:", VENDOR_SLOT, "after", REPAIR_AFTER, "before", REPAIR_BEFORE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
