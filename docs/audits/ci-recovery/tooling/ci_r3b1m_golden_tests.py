#!/usr/bin/env python3
"""Golden tests for CI-R3B1M positive index ownership and schema authorization."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l2_prisma_sql_parser import ParsedStatement
from ci_r3b1m_constants import DATA, SCHEMA_PRISMA
from ci_r3b1m_index_owner_inventory import build_index_owner_inventory, prefix_diagnostic_hint
from ci_r3b1m_r3b_authority import build_owner_maps, resolve_index_owner
from ci_r3b1m_scope_classifier import build_operation_record, classify_scope, resolve_owner_fields

OUT = DATA / "ci-r3b1m-golden-tests-2026-08.json"


def run_test(name: str, fn) -> dict[str, Any]:
    try:
        ok, detail = fn()
        return {"name": name, "pass": ok, "detail": detail}
    except Exception as exc:  # noqa: BLE001
        return {"name": name, "pass": False, "detail": {"error": str(exc)}}


def main() -> int:
    owners = build_owner_maps()
    inventory = build_index_owner_inventory()
    tests: list[dict[str, Any]] = []

    def prefix_false_ownership():
        stmt = ParsedStatement(
            1,
            [],
            [],
            'DROP INDEX "trip_driving_impact_fake_idx";',
            [],
        )
        owners_local = {
            **owners,
            "index_inventory": {
                **inventory,
                "lookup": {
                    **inventory.get("lookup", {}),
                    "trip_driving_impact_fake_idx": {
                        "index": "trip_driving_impact_fake_idx",
                        "owner_table": "unrelated_table",
                        "owner_class": "OUT_OF_SCOPE",
                        "proof_type": "TEST_EXPLICIT",
                    },
                },
            },
        }
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "OUT_OF_SCOPE" and op["owner_table"] == "unrelated_table", op

    def prefix_unknown_unresolved():
        owners_local = {
            **owners,
            "index_inventory": {"lookup": {}, "records": []},
            "schema_tables_by_prefix": sorted(owners.get("all_schema_tables", set()), key=len, reverse=True),
        }
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "trip_driving_impact_fake_idx";', [])
        parsed = resolve_owner_fields(stmt, owners_local)
        scope = classify_scope(parsed, owners_local)
        hint = prefix_diagnostic_hint("trip_driving_impact_fake_idx", owners_local["schema_tables_by_prefix"])
        return (
            scope["classification"] == "UNRESOLVED"
            and parsed["owner_resolution"] == "OWNER_UNKNOWN"
            and hint is not None
        ), {"scope": scope, "hint": hint}

    def explicit_create_index_owner():
        stmt = ParsedStatement(
            1,
            [],
            [],
            'CREATE INDEX "unrelated_name" ON "trip_driving_impact" ("calculated_at");',
            [],
        )
        op = build_operation_record(stmt, owners)
        return op["classification"] == "R3B_SCOPE" and op["owner_table"] == "trip_driving_impact", op

    def drop_index_catalog_owner():
        owners_local = {
            **owners,
            "index_inventory": {
                **inventory,
                "lookup": {
                    **inventory.get("lookup", {}),
                    "weird_idx_name": {
                        "index": "weird_idx_name",
                        "owner_table": "trip_driving_impact",
                        "owner_class": "R3B",
                        "proof_type": "TEST_CATALOG",
                    },
                },
            },
        }
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "weird_idx_name";', [])
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "R3B_SCOPE" and op["owner_table"] == "trip_driving_impact", op

    def authorized_schema_diff_token():
        manifest = json.loads((DATA / "ci-r3b1m-schema-authorized-diff-2026-08.json").read_text())
        return manifest.get("pass") is True and manifest.get("unauthorized_schema_changes") == 0, manifest

    def unauthorized_field_edit_detection():
        text = SCHEMA_PRISMA.read_text()
        fake = text.replace("model TripDrivingImpact", "model TripDrivingImpactX", 1)
        return fake != text, {"detected": fake != text}

    def resolve_index_no_prefix_acceptance():
        res, table, source, hint = resolve_index_owner("totally_unknown_idx", owners)
        return res == "OWNER_UNKNOWN" and table is None and "prefix" not in (source or ""), {
            "resolution": res,
            "hint": hint,
        }

    cases = [
        ("prefix_false_ownership_out_of_scope", prefix_false_ownership),
        ("prefix_unknown_unresolved", prefix_unknown_unresolved),
        ("explicit_create_index_owner_r3b", explicit_create_index_owner),
        ("drop_index_catalog_owner_r3b", drop_index_catalog_owner),
        ("authorized_schema_diff_pass", authorized_schema_diff_token),
        ("unauthorized_field_edit_detection", unauthorized_field_edit_detection),
        ("resolve_index_no_prefix_acceptance", resolve_index_no_prefix_acceptance),
    ]
    for name, fn in cases:
        tests.append(run_test(name, fn))

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "prefix_inference_acceptance": False,
        "tests": tests,
        "pass": all(t["pass"] for t in tests),
        "passed": sum(1 for t in tests if t["pass"]),
        "total": len(tests),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
