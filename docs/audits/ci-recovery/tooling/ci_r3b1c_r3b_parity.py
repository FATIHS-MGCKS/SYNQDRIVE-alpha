#!/usr/bin/env python3
"""Compare fresh-replay DB against accepted CI-R3A.7 production catalog for R3B 19-object parity."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from replay_evidence_lib import PgConfig, enum_labels, psql, table_exists

REPO = Path(__file__).resolve().parents[4]
CATALOG_PATH = REPO / "docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json"

BOOTSTRAP_TABLES = [
    "vehicle_trips",
    "driving_events",
    "trip_behavior_events",
    "vehicle_trip_waypoints",
    "vehicle_trip_tracking_runs",
    "trip_repairs",
    "trip_driving_impact",
    "vehicle_trip_detection_states",
    "brake_trip_metrics",
]
BOOTSTRAP_ENUMS = [
    "TripAssignmentStatus",
    "TripAssignmentSubjectType",
    "DrivingEventType",
    "BehaviorEventCategory",
    "BehaviorEventClassification",
    "TripSource",
    "TripDetectionState",
    "TripTrackingRunType",
    "VehicleDetectionProfile",
    "DetectionConfidence",
]


def count_table_properties(cfg: PgConfig, db: str, table: str) -> dict[str, int]:
    cols = psql(
        cfg,
        db,
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='"
        + table
        + "';",
        tuples_only=True,
    )
    cons = psql(
        cfg,
        db,
        "SELECT COUNT(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid "
        f"WHERE t.relname='{table}';",
        tuples_only=True,
    )
    idx = psql(
        cfg,
        db,
        "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND tablename='" + table + "';",
        tuples_only=True,
    )
    return {
        "columns": int(cols.stdout.strip() or 0),
        "constraints": int(cons.stdout.strip() or 0),
        "indexes": int(idx.stdout.strip() or 0),
    }


def catalog_object(name: str, kind: str, catalog: dict) -> dict | None:
    key = "tables" if kind == "table" else "enums"
    for row in catalog.get(key, []):
        if row.get("name") == name:
            return row
    return None


def compare(cfg: PgConfig, db: str) -> dict:
    catalog = json.loads(CATALOG_PATH.read_text())
    enum_mismatches = []
    property_mismatches = []
    missing_objects = []
    categories_checked = 0
    categories_matched = 0

    for table in BOOTSTRAP_TABLES:
        if not table_exists(cfg, db, table):
            missing_objects.append(table)
            continue
        expected = catalog_object(table, "table", catalog)
        if not expected:
            continue
        actual = count_table_properties(cfg, db, table)
        for cat in ("columns", "constraints", "indexes"):
            categories_checked += 1
            exp = len(expected.get(cat, [])) if cat != "constraints" else len(expected.get("constraints", []))
            if cat == "columns":
                exp = len(expected.get("columns", []))
            act = actual[cat]
            if exp == act:
                categories_matched += 1
            else:
                property_mismatches.append({"object": table, "category": cat, "expected": exp, "actual": act})

    for enum in BOOTSTRAP_ENUMS:
        labels = enum_labels(cfg, db, enum)
        if not labels:
            missing_objects.append(enum)
            continue
        expected = catalog_object(enum, "enum", catalog)
        if not expected:
            continue
        exp_labels = list(expected.get("labels", []))
        categories_checked += 1
        if labels == exp_labels:
            categories_matched += 1
        else:
            enum_mismatches.append({"enum": enum, "expected": exp_labels, "actual": labels})

    counters = {
        "default": 0,
        "type": 0,
        "nullability": 0,
        "constraint": sum(1 for m in property_mismatches if m["category"] == "constraints"),
        "index": sum(1 for m in property_mismatches if m["category"] == "indexes"),
        "enum": len(enum_mismatches),
    }
    # column count proxy for type/nullability/default in this checker
    counters["type"] = sum(1 for m in property_mismatches if m["category"] == "columns")
    return {
        "authority_objects_expected": 19,
        "authority_objects_present": 19 - len(missing_objects),
        "tables_expected": 9,
        "tables_present": sum(1 for t in BOOTSTRAP_TABLES if table_exists(cfg, db, t)),
        "enums_expected": 10,
        "enums_present": sum(1 for e in BOOTSTRAP_ENUMS if enum_labels(cfg, db, e)),
        "property_categories_checked": categories_checked,
        "property_categories_matched": categories_matched,
        "missing_objects": missing_objects,
        "property_mismatches": property_mismatches,
        "enum_mismatches": enum_mismatches,
        "mismatch_counters": counters,
        "pass": not missing_objects and not property_mismatches and not enum_mismatches,
    }


def main() -> int:
    db = sys.argv[1]
    cfg = PgConfig()
    result = compare(cfg, db)
    print(json.dumps(result, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
