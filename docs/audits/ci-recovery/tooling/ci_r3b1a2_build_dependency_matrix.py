#!/usr/bin/env python3
"""Build CI-R3B1A.2 migration dependency matrix and exact predecessor DDL contracts."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from prisma_schema_authority import extract_model_contract, parse_schema  # noqa: E402
from sql_migration_analyzer import (  # noqa: E402
    build_dependency_matrix,
    unique_defect_objects,
)

OUT_MATRIX = (
    REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json"
)
OUT_CONTRACTS = (
    REPO / "docs/audits/ci-recovery/data/ci-r3b1a2-predecessor-ddl-contracts-2026-08.json"
)

DEFECT_SPECS: dict[str, dict[str, Any]] = {
    "org_tasks": {
        "classification": "MISSING_HISTORY",
        "before": "20260412030000_platform_hardening_phase1",
        "commit": "77c26dad",
        "model": "OrgTask",
        "enums": ["TaskStatus", "TaskPriority"],
        "not_yet": [
            {
                "name": "created_by_user_id",
                "object_type": "column",
                "introduced_by_migration": "20260412030000_platform_hardening_phase1",
                "reason_excluded": "Added by first consumer migration, not part of predecessor bootstrap",
            },
            {
                "name": "updated_by_user_id",
                "object_type": "column",
                "introduced_by_migration": "20260412030000_platform_hardening_phase1",
                "reason_excluded": "Added by first consumer migration, not part of predecessor bootstrap",
            },
            {
                "name": "org_tasks_created_by_user_id_idx",
                "object_type": "index",
                "introduced_by_migration": "20260412030000_platform_hardening_phase1",
                "reason_excluded": "Index on later column",
            },
        ],
        "repair_after": "20260412020000_hm_latest_state_tables",
        "repair_before": "20260412030000_platform_hardening_phase1",
    },
    "brake_health_current": {
        "classification": "MISSING_HISTORY",
        "before": "20260413183000_brake_health_canonical_refactor",
        "commit": "77c26dad",
        "model": "BrakeHealthCurrent",
        "enums": [],
        "not_yet": [
            {
                "name": "state_class",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "anchor_validation_status",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "model_coverage_ratio",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "modeled_distance_km",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "modeled_trip_count",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "modeling_source",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
            {
                "name": "baseline_warnings",
                "object_type": "column",
                "introduced_by_migration": "20260413183000_brake_health_canonical_refactor",
                "reason_excluded": "Canonical refactor column",
            },
        ],
        "repair_after": "20260412040000_audit_consent_provenance",
        "repair_before": "20260413183000_brake_health_canonical_refactor",
    },
    "battery_evidence": {
        "classification": "ORDERING_DEFECT",
        "before": "20260413220000_battery_evidence_unique_dedup",
        "commit": "17019787",
        "model": "BatteryEvidence",
        "enums": [
            "BatteryEvidenceScope",
            "BatteryEvidenceSourceType",
            "BatteryEvidenceValueType",
        ],
        "not_yet": [
            {
                "name": "battery_evidence_dedup_key",
                "object_type": "index",
                "introduced_by_migration": "20260413220000_battery_evidence_unique_dedup",
                "reason_excluded": "Dedup unique index introduced by first consumer",
            }
        ],
        "repair_after": "20260413183000_brake_health_canonical_refactor",
        "repair_before": "20260413220000_battery_evidence_unique_dedup",
        "creator_migration": "20260614120300_battery_health_tables_guard",
    },
    "org_invoices": {
        "classification": "MISSING_HISTORY",
        "before": "20260413230000_add_composite_indexes_batch_c",
        "commit": "77c26dad",
        "model": "OrgInvoice",
        "enums": ["OrgInvoiceType", "OrgInvoiceStatus"],
        "not_yet": [
            {
                "name": "org_invoices_organization_id_due_date_idx",
                "object_type": "index",
                "introduced_by_migration": "20260413230000_add_composite_indexes_batch_c",
                "reason_excluded": "Composite index added by first consumer batch",
            }
        ],
        "repair_after": "20260413220000_battery_evidence_unique_dedup",
        "repair_before": "20260413230000_add_composite_indexes_batch_c",
    },
    "vehicle_dtc_events": {
        "classification": "MISSING_HISTORY",
        "before": "20260413230000_add_composite_indexes_batch_c",
        "commit": "77c26dad",
        "model": "VehicleDtcEvent",
        "enums": ["DtcSeverity"],
        "not_yet": [
            {
                "name": "vehicle_dtc_events_vehicle_id_last_seen_at_idx",
                "object_type": "index",
                "introduced_by_migration": "20260413230000_add_composite_indexes_batch_c",
                "reason_excluded": "Composite index added by first consumer batch",
            },
            {
                "name": "vehicle_dtc_events_vehicle_id_is_active_idx",
                "object_type": "index",
                "introduced_by_migration": "20260413230000_add_composite_indexes_batch_c",
                "reason_excluded": "Composite index added by first consumer batch",
            },
        ],
        "repair_after": "20260413220000_battery_evidence_unique_dedup",
        "repair_before": "20260413230000_add_composite_indexes_batch_c",
        "share_bootstrap_with": ["org_invoices"],
    },
    "vehicle_driving_impact_current": {
        "classification": "MISSING_HISTORY",
        "before": "20260422010000_vehicle_current_safety_score",
        "commit": "77c26dad",
        "model": "VehicleDrivingImpactCurrent",
        "enums": [],
        "not_yet": [
            {
                "name": "safety_score",
                "object_type": "column",
                "introduced_by_migration": "20260422010000_vehicle_current_safety_score",
                "reason_excluded": "Safety score column added by first consumer",
            }
        ],
        "repair_after": "20260421120000_add_pickup_overdue_insight_type",
        "repair_before": "20260422010000_vehicle_current_safety_score",
    },
    "InsightType": {
        "classification": "MISSING_HISTORY",
        "before": "20260417180000_add_battery_critical_insight_type",
        "commit": "77c26dad",
        "enum_only": "InsightType",
        "enums": ["InsightType"],
        "not_yet": [
            {
                "name": "BATTERY_CRITICAL",
                "object_type": "enum_label",
                "introduced_by_migration": "20260417180000_add_battery_critical_insight_type",
                "reason_excluded": "Label added by first consumer ALTER TYPE",
            }
        ],
        "repair_after": "20260417160000_add_mqtt_only_hm_sync_status",
        "repair_before": "20260417180000_add_battery_critical_insight_type",
    },
}


def git_show_file(rev: str, path: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), "show", f"{rev}:{path}"], text=True
    )


def enum_contract(schema: str, enum_name: str, spec: dict[str, Any], defect: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_schema(schema)
    labels = parsed.enums.get(enum_name, [])
    return {
        "object": enum_name,
        "object_type": "enum",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": spec["commit"],
        "first_consumer": defect["first_consumer_migration"],
        "schema": "public",
        "type_name": enum_name,
        "labels": labels,
        "order_material": True,
        "creator": spec.get("creator_migration"),
        "relation": None,
        "columns": [],
        "primary_key": None,
        "foreign_keys": [],
        "unique_constraints": [],
        "check_constraints": [],
        "required_preexisting_indexes": [],
        "enum_dependencies": [],
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": spec.get("creator_migration"),
        },
        "evidence": [
            f"schema:{spec['commit']}:enum {enum_name}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def table_contract(schema: str, spec: dict[str, Any], defect: dict[str, Any]) -> dict[str, Any]:
    model = extract_model_contract(schema, spec["model"])
    parsed = parse_schema(schema)
    enum_deps = []
    for en in spec["enums"]:
        if en in parsed.enums:
            enum_deps.append(
                {
                    "schema": "public",
                    "name": en,
                    "labels": parsed.enums[en],
                    "order_material": True,
                    "first_consumer": defect["first_consumer_migration"],
                    "creator": None,
                    "classification": "MISSING_HISTORY"
                    if en not in {"BatteryEvidenceScope", "BatteryEvidenceSourceType", "BatteryEvidenceValueType"}
                    else "MISSING_HISTORY",
                    "evidence": [f"schema:{spec['commit']}:enum {en}"],
                }
            )
    enum_deps.extend(model["enum_dependencies"])
    return {
        "object": model["table"],
        "object_type": "table",
        "classification": spec["classification"],
        "required_before_migration": spec["before"],
        "historical_authority_commit": spec["commit"],
        "historical_prisma_model": spec["model"],
        "first_consumer": defect["first_consumer_migration"],
        "relation": {"schema": "public", "name": model["table"]},
        "columns": model["columns"],
        "primary_key": model["primary_key"],
        "foreign_keys": model["foreign_keys"],
        "unique_constraints": model["unique_constraints"],
        "check_constraints": [],
        "required_preexisting_indexes": model["required_preexisting_indexes"],
        "enum_dependencies": enum_deps,
        "not_present_yet": spec["not_yet"],
        "repair_insertion": {
            "after": spec["repair_after"],
            "before": spec["repair_before"],
            "can_share_bootstrap_with": spec.get("share_bootstrap_with", []),
            "creator_migration": spec.get("creator_migration"),
        },
        "evidence": [
            f"schema:{spec['commit']}:model {spec['model']}",
            f"matrix:first_consumer={defect['first_consumer_migration']}",
        ],
    }


def build_contracts(defects: list[dict[str, Any]]) -> dict[str, Any]:
    defect_by_obj = {d["object"]: d for d in defects}
    contracts: list[dict[str, Any]] = []
    for obj, spec in DEFECT_SPECS.items():
        defect = defect_by_obj.get(obj)
        if not defect:
            raise RuntimeError(f"matrix missing defect object {obj}")
        schema = (
            git_show_file("17019787", "backend/prisma/schema.prisma")
            if spec["commit"] == "17019787"
            else git_show_file("77c26dad", "backend/prisma/schema.prisma")
        )
        if spec.get("enum_only"):
            contracts.append(enum_contract(schema, spec["enum_only"], spec, defect))
        else:
            contracts.append(table_contract(schema, spec, defect))
    return {"schema_version": 2, "supersedes": "ci-r3b1a1-predecessor-ddl-contracts-2026-08.json", "contracts": contracts}


def build_repair_topology(defects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    repairs: list[dict[str, Any]] = []
    grouped: dict[str, list[str]] = {}
    for obj, spec in DEFECT_SPECS.items():
        key = f"{spec['repair_after']}::{spec['repair_before']}"
        grouped.setdefault(key, []).append(obj)
    slot = 1
    for key, objects in sorted(grouped.items(), key=lambda kv: DEFECT_SPECS[kv[1][0]]["repair_after"]):
        spec = DEFECT_SPECS[objects[0]]
        repairs.append(
            {
                "insertion_slot": slot,
                "insert_after": spec["repair_after"],
                "insert_before": spec["repair_before"],
                "objects_created": objects,
                "must_execute_after": [spec["repair_after"]],
                "must_execute_before": [spec["repair_before"]],
                "first_consumer_protected": [DEFECT_SPECS[o]["before"] for o in objects],
                "share_bootstrap": spec.get("share_bootstrap_with", []),
                "reason": "Derived from corrected MISSING_HISTORY/ORDERING_DEFECT matrix + exact contracts",
            }
        )
        slot += 1
    return repairs


def main() -> int:
    matrix = build_dependency_matrix(REPO)
    defects = unique_defect_objects(matrix)
    matrix["unique_genuine_defect_objects"] = defects
    matrix["repair_topology_candidate"] = build_repair_topology(defects)
    contracts = build_contracts(defects)

    OUT_MATRIX.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATRIX.write_text(json.dumps(matrix, indent=2) + "\n")
    OUT_CONTRACTS.write_text(json.dumps(contracts, indent=2) + "\n")

    totals = matrix["classification_totals"]
    print(json.dumps(totals, indent=2))
    print("defect objects:", [d["object"] for d in defects])
    if totals["UNRESOLVED"] != 0:
        print("FAIL: UNRESOLVED != 0")
        return 1
    if sum(totals[k] for k in totals if k != "TOTAL") != totals["TOTAL"]:
        print("FAIL: classification sum mismatch")
        return 1
    expected = set(DEFECT_SPECS.keys())
    actual = {d["object"] for d in defects}
    if actual != expected:
        print("FAIL: defect object set mismatch")
        print(" expected:", sorted(expected))
        print(" actual:", sorted(actual))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
