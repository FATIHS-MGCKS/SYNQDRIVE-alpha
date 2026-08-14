"""Repair dependency closure and chronology authority (CI-R3B1A.3)."""
from __future__ import annotations

from typing import Any

# Tables known to exist before any repair slot (from init / in-scope migrations).
PREEXISTING_TABLES = {
    "vehicles",
    "users",
    "organizations",
    "vehicle_service_events",
}

# Tables created only after scan scope or with no CREATE in scope through target.
POST_SCOPE_OR_MISSING_TABLES = {
    "fines",
    "vehicle_document_extractions",
}

REPAIR_SLOT_SPECS: list[dict[str, Any]] = [
    {
        "slot": 1,
        "after_migration": "20260412020000_hm_latest_state_tables",
        "before_migration": "20260412030000_platform_hardening_phase1",
        "objects": ["org_tasks"],
    },
    {
        "slot": 2,
        "after_migration": "20260412040000_audit_consent_provenance",
        "before_migration": "20260413183000_brake_health_canonical_refactor",
        "objects": ["brake_health_current"],
    },
    {
        "slot": 3,
        "after_migration": "20260413183000_brake_health_canonical_refactor",
        "before_migration": "20260413220000_battery_evidence_unique_dedup",
        "objects": ["battery_evidence"],
    },
    {
        "slot": 4,
        "after_migration": "20260413220000_battery_evidence_unique_dedup",
        "before_migration": "20260413230000_add_composite_indexes_batch_c",
        "objects": ["org_invoices", "vehicle_dtc_events"],
    },
    {
        "slot": 5,
        "after_migration": "20260417160000_add_mqtt_only_hm_sync_status",
        "before_migration": "20260417180000_add_battery_critical_insight_type",
        "objects": ["InsightType"],
    },
    {
        "slot": 6,
        "after_migration": "20260421120000_add_pickup_overdue_insight_type",
        "before_migration": "20260422010000_vehicle_current_safety_score",
        "objects": ["vehicle_driving_impact_current"],
    },
]

OBJECT_SLOT = {
    obj: spec["slot"] for spec in REPAIR_SLOT_SPECS for obj in spec["objects"]
}

FIRST_CONSUMER_BY_OBJECT = {
    "org_tasks": "20260412030000_platform_hardening_phase1",
    "brake_health_current": "20260413183000_brake_health_canonical_refactor",
    "battery_evidence": "20260413220000_battery_evidence_unique_dedup",
    "org_invoices": "20260413230000_add_composite_indexes_batch_c",
    "vehicle_dtc_events": "20260413230000_add_composite_indexes_batch_c",
    "InsightType": "20260417180000_add_battery_critical_insight_type",
    "vehicle_driving_impact_current": "20260422010000_vehicle_current_safety_score",
}

FK_CHRONOLOGY_OVERRIDES: dict[tuple[str, tuple[str, ...], str], dict[str, Any]] = {
    ("org_tasks", ("fine_id",), "fines"): {
        "chronology": "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION",
        "required_before_first_consumer": False,
        "reason": "fines has no CREATE TABLE in scope before org_tasks first consumer; 20260412030000 only adds audit columns",
        "defer_until_object_available": "fines",
    },
    ("org_tasks", ("invoice_id",), "org_invoices"): {
        "chronology": "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION",
        "required_before_first_consumer": False,
        "reason": "org_invoices repair slot 4 is after org_tasks slot 1; first consumer does not enforce FK",
        "defer_until_repair_slot": 4,
    },
    ("battery_evidence", ("vehicle_id",), "vehicles"): {
        "chronology": "REQUIRED_AT_TABLE_CREATE",
        "required_before_first_consumer": True,
        "reason": "vehicles exists from init migration",
    },
    ("battery_evidence", ("document_extraction_id",), "vehicle_document_extractions"): {
        "chronology": "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION",
        "required_before_first_consumer": False,
        "reason": "nullable FK target table has no CREATE in scan scope; first consumer only dedups/indexes",
        "defer_until_object_available": "vehicle_document_extractions",
    },
    ("battery_evidence", ("service_event_id",), "vehicle_service_events"): {
        "chronology": "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION",
        "required_before_first_consumer": False,
        "reason": "nullable optional link; first consumer does not require FK enforcement",
    },
    ("vehicle_dtc_events", ("vehicle_id",), "vehicles"): {
        "chronology": "REQUIRED_AT_TABLE_CREATE",
        "required_before_first_consumer": True,
        "reason": "vehicles exists from init migration",
    },
    ("vehicle_driving_impact_current", ("vehicle_id",), "vehicles"): {
        "chronology": "REQUIRED_AT_TABLE_CREATE",
        "required_before_first_consumer": True,
        "reason": "vehicles exists from init migration",
    },
}


def object_available_at_slot(object_name: str, slot: int) -> bool:
    if object_name in PREEXISTING_TABLES:
        return True
    obj_slot = OBJECT_SLOT.get(object_name)
    if obj_slot is None:
        return False
    return obj_slot <= slot


def apply_fk_chronology(table: str, fk: dict[str, Any]) -> dict[str, Any]:
    key = (table, tuple(fk["local_columns"]), fk["referenced_relation"])
    override = FK_CHRONOLOGY_OVERRIDES.get(key)
    out = dict(fk)
    if override:
        out["chronology"] = override["chronology"]
        out["required_before_first_consumer"] = override["required_before_first_consumer"]
        out["chronology_evidence"] = [override["reason"]]
        if "defer_until_repair_slot" in override:
            out["defer_until_repair_slot"] = override["defer_until_repair_slot"]
        if "defer_until_object_available" in override:
            out["defer_until_object_available"] = override["defer_until_object_available"]
    elif fk["referenced_relation"] in PREEXISTING_TABLES:
        out["chronology"] = "REQUIRED_AT_TABLE_CREATE"
        out["required_before_first_consumer"] = True
        out["chronology_evidence"] = [f"referenced relation {fk['referenced_relation']} preexists"]
    else:
        ref_slot = OBJECT_SLOT.get(fk["referenced_relation"])
        table_slot = OBJECT_SLOT.get(table, 999)
        if ref_slot is not None and ref_slot > table_slot:
            out["chronology"] = "CAN_BE_DEFERRED_TO_LATER_HISTORICAL_MIGRATION"
            out["required_before_first_consumer"] = False
            out["defer_until_repair_slot"] = ref_slot
            out["chronology_evidence"] = [
                f"{fk['referenced_relation']} repair slot {ref_slot} after {table} slot {table_slot}"
            ]
        else:
            out["chronology"] = "REQUIRED_BEFORE_FIRST_CONSUMER"
            out["required_before_first_consumer"] = True
            out["chronology_evidence"] = ["default: required before first consumer"]
    return out


def enrich_column_defaults(table: str, col: dict[str, Any]) -> dict[str, Any]:
    out = dict(col)
    if out.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
        seq = f"{table}_{out['column']}_seq"
        out["generation"] = {
            "mechanism": "postgresql_serial_sequence",
            "sequence_name": seq,
            "postgres_default_at_create": f"nextval('{seq}'::regclass)",
        }
        out["postgres_default"] = out["generation"]["postgres_default_at_create"]
    return out


def dedupe_enum_dependencies(deps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for dep in deps:
        key = (dep.get("schema", "public"), dep["name"])
        if key not in merged:
            merged[key] = dict(dep)
            merged[key]["evidence"] = list(dep.get("evidence", []))
        else:
            for ev in dep.get("evidence", []):
                if ev not in merged[key]["evidence"]:
                    merged[key]["evidence"].append(ev)
    return sorted(merged.values(), key=lambda x: x["name"])


def build_closure_record(
    repair_object: str,
    contract: dict[str, Any],
    slot: int,
) -> dict[str, Any]:
    direct: list[str] = []
    transitive: list[str] = []
    must_exist: list[str] = []
    deferred: list[str] = []

    for dep in contract.get("enum_dependencies", []):
        name = dep["name"]
        direct.append(name)
        must_exist.append(name)
        transitive.append(name)

    for fk in contract.get("foreign_keys", []):
        ref = fk["referenced_relation"]
        chron = fk.get("chronology", "")
        if chron == "REQUIRED_AT_TABLE_CREATE":
            if ref not in PREEXISTING_TABLES:
                direct.append(ref)
                must_exist.append(ref)
            transitive.append(ref)
        elif chron.startswith("CAN_BE_DEFERRED"):
            deferred.append(f"fk:{fk['local_columns']}->{ref}")

    for col in contract.get("columns", []):
        if col.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
            seq = col.get("generation", {}).get("sequence_name") or f"{repair_object}_{col['column']}_seq"
            direct.append(seq)
            must_exist.append(seq)
            transitive.append(seq)

    return {
        "repair_object": repair_object,
        "object_type": contract.get("object_type", "table"),
        "repair_boundary": contract.get("required_before_migration"),
        "repair_slot": slot,
        "direct_dependencies": sorted(set(direct)),
        "transitive_dependencies": sorted(set(transitive)),
        "must_exist_before": sorted(set(must_exist)),
        "can_be_deferred": sorted(set(deferred)),
        "closure_complete": True,
    }


def ordered_actions_for_contract(repair_object: str, contract: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    actions: list[dict[str, Any]] = []
    deferred: list[dict[str, Any]] = []
    order = 1

    for dep in contract.get("enum_dependencies", []):
        actions.append(
            {
                "order": order,
                "action": "CREATE TYPE",
                "object": dep["name"],
                "object_type": "enum",
                "justification": f"required by {repair_object} column types",
            }
        )
        order += 1

    for col in contract.get("columns", []):
        if col.get("default_semantics") == "IDENTITY_OR_SEQUENCE_GENERATED":
            seq = col.get("generation", {}).get("sequence_name") or f"{repair_object}_{col['column']}_seq"
            actions.append(
                {
                    "order": order,
                    "action": "CREATE SEQUENCE",
                    "object": seq,
                    "object_type": "sequence",
                    "justification": f"supports {repair_object}.{col['column']} autoincrement",
                }
            )
            order += 1

    actions.append(
        {
            "order": order,
            "action": "CREATE TABLE",
            "object": repair_object,
            "object_type": "table",
            "justification": "primary repair object",
        }
    )
    order += 1

    for fk in contract.get("foreign_keys", []):
        chron = fk.get("chronology", "")
        entry = {
            "order": order,
            "action": "ADD CONSTRAINT",
            "object": f"{repair_object}_{'_'.join(fk['local_columns'])}_fkey",
            "object_type": "foreign_key",
            "justification": f"FK {fk['local_columns']} -> {fk['referenced_relation']}",
            "fk": fk,
        }
        if chron.startswith("CAN_BE_DEFERRED"):
            deferred.append(entry)
        else:
            actions.append(entry)
            order += 1

    for idx in contract.get("required_preexisting_indexes", []):
        cols = idx.get("columns", [])
        actions.append(
            {
                "order": order,
                "action": "CREATE INDEX",
                "object": f"{repair_object}_{'_'.join(cols)}_idx",
                "object_type": "index",
                "justification": f"historical @@index {cols}",
            }
        )
        order += 1

    for uq in contract.get("unique_constraints", []):
        actions.append(
            {
                "order": order,
                "action": "ADD CONSTRAINT",
                "object": uq.get("name") or f"{repair_object}_unique",
                "object_type": "unique",
                "justification": f"unique {uq.get('columns')}",
            }
        )
        order += 1

    return actions, deferred


def build_repair_topology(contracts_by_object: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    topology: list[dict[str, Any]] = []
    for spec in REPAIR_SLOT_SPECS:
        slot = spec["slot"]
        actions: list[dict[str, Any]] = []
        deferred_actions: list[dict[str, Any]] = []
        created: list[str] = []
        action_order = 1
        for obj in spec["objects"]:
            contract = contracts_by_object[obj]
            obj_actions, obj_deferred = ordered_actions_for_contract(obj, contract)
            for act in obj_actions:
                act = dict(act)
                act["order"] = action_order
                action_order += 1
                actions.append(act)
            for dact in obj_deferred:
                dact = dict(dact)
                dact["order"] = action_order
                action_order += 1
                deferred_actions.append(dact)
            if contract.get("object_type") == "enum":
                created.append(obj)
            else:
                created.append(obj)
                for dep in contract.get("enum_dependencies", []):
                    if dep["name"] not in created:
                        created.append(dep["name"])

        # Cross-slot deferred FK: org_tasks -> org_invoices after slot 4 table exists
        if slot == 4:
            org_tasks = contracts_by_object.get("org_tasks")
            if org_tasks:
                for fk in org_tasks.get("foreign_keys", []):
                    if fk["referenced_relation"] == "org_invoices":
                        deferred_actions.append(
                            {
                                "order": action_order,
                                "action": "ADD CONSTRAINT",
                                "object": "org_tasks_invoice_id_fkey",
                                "object_type": "foreign_key",
                                "justification": "deferred from org_tasks slot 1; org_invoices now available",
                                "fk": fk,
                                "source_repair_object": "org_tasks",
                            }
                        )
                        action_order += 1

        topology.append(
            {
                "slot": slot,
                "after_migration": spec["after_migration"],
                "before_migration": spec["before_migration"],
                "objects_types_sequences_created": sorted(set(created)),
                "actions": actions,
                "deferred_actions": deferred_actions,
                "first_consumers_protected": [
                    FIRST_CONSUMER_BY_OBJECT.get(o, spec["before_migration"]) for o in spec["objects"]
                ],
                "must_execute_after": [spec["after_migration"]],
                "must_execute_before": [spec["before_migration"]],
                "closure_validated": True,
            }
        )
    return topology


def primary_and_closure_sets(contracts: list[dict[str, Any]]) -> dict[str, Any]:
    primary = sorted(c["object"] for c in contracts)
    closure_only: set[str] = set()
    for c in contracts:
        for dep in c.get("enum_dependencies", []):
            if dep["name"] not in primary:
                closure_only.add(dep["name"])
        for col in c.get("columns", []):
            gen = col.get("generation") or {}
            if gen.get("sequence_name") and gen["sequence_name"] not in primary:
                closure_only.add(gen["sequence_name"])
    return {
        "primary_historical_defects": primary,
        "required_repair_closure_objects": sorted(closure_only),
        "total_implementation_objects": sorted(set(primary) | closure_only),
    }
