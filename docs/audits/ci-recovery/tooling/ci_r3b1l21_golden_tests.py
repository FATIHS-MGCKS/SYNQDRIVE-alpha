#!/usr/bin/env python3
"""Golden tests for CI-R3B1L.2.1 independent coverage and scope ownership."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l2_authority_decisions import decide_operation
from ci_r3b1l2_prisma_sql_parser import ParsedStatement, get_parsed_statements, load_frozen_diff_text
from ci_r3b1l21_constants import DATA, FROZEN_DIFF_SQL
from ci_r3b1l21_independent_statement_counter import (
    assert_implementation_independence,
    count_top_level_statements,
    cross_check_with_main_parser,
    scan_top_level_statements,
)
from ci_r3b1l21_r3b_authority import build_owner_maps, resolve_index_owner
from ci_r3b1l21_scope_classifier import build_operation_record, classify_scope, resolve_owner_fields

OUT = DATA / "ci-r3b1l21-golden-tests-2026-08.json"


def run_test(name: str, fn) -> dict[str, Any]:
    try:
        ok, detail = fn()
        return {"name": name, "pass": ok, "detail": detail}
    except Exception as exc:  # noqa: BLE001
        return {"name": name, "pass": False, "detail": {"error": str(exc)}}


def main() -> int:
    owners = build_owner_maps()
    text, _ = load_frozen_diff_text()
    main_statements = [s.raw_sql for s in get_parsed_statements()]
    tests: list[dict[str, Any]] = []

    def independence_static():
        result = assert_implementation_independence()
        return result["pass"], result

    def independence_positive():
        independent = count_top_level_statements(text)
        cross = cross_check_with_main_parser(text, main_statements)
        return independent == len(main_statements) and cross["pass"], {
            "independent": independent,
            "main": len(main_statements),
            "cross_pass": cross["pass"],
        }

    def independence_negative():
        def fake_split(_sql: str) -> list[str]:
            return ["SELECT 1"] * 999

        independent = count_top_level_statements(text)
        with patch("ci_r3b1l2_prisma_sql_parser.split_sql_statements", fake_split):
            miscounted = ["SELECT 1"] * 999
            cross = cross_check_with_main_parser(text, miscounted)
        return independent != 999 and not cross["pass"] and cross["main_parser_statements"] == 999, {
            "independent_unchanged": independent,
            "cross_pass": cross["pass"],
        }

    def create_index_r3b_by_on_relation():
        stmt = ParsedStatement(
            1,
            ["CreateIndex"],
            [],
            'CREATE INDEX "brand_new_idx" ON "trip_driving_impact"("calculated_at");',
            [],
        )
        op = build_operation_record(stmt, owners)
        return op["classification"] == "R3B_SCOPE" and op["owner_table"] == "trip_driving_impact", op

    def create_unique_index_r3b_by_on_relation():
        stmt = ParsedStatement(
            1,
            [],
            [],
            'CREATE UNIQUE INDEX "brand_new_uq" ON "vehicle_trips"("id");',
            [],
        )
        op = build_operation_record(stmt, owners)
        return op["classification"] == "R3B_SCOPE", op

    def drop_index_r3b_owner():
        owners_local = {**owners, "catalog_index_to_table": {**owners["catalog_index_to_table"], "r3b_owned_idx": "trip_driving_impact"}}
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "r3b_owned_idx";', [])
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "R3B_SCOPE", op

    def drop_index_out_of_scope_positive():
        owners_local = {
            **owners,
            "migration_index_to_table": {**owners["migration_index_to_table"], "bookings_idx": "bookings"},
        }
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "bookings_idx";', [])
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "OUT_OF_SCOPE" and op["owner_resolution"] == "OWNER_OUT_OF_SCOPE", op

    def drop_index_unknown_owner():
        owners_local = {
            **owners,
            "catalog_index_to_table": {},
            "migration_index_to_table": {},
            "schema_unique_to_table": {},
            "schema_tables_by_prefix": [],
        }
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "unknown_idx";', [])
        parsed = resolve_owner_fields(stmt, owners_local)
        scope = classify_scope(parsed, owners_local)
        return scope["classification"] == "UNRESOLVED" and parsed["owner_resolution"] == "OWNER_UNKNOWN", scope

    def alter_index_unknown_unresolved():
        owners_local = {
            **owners,
            "catalog_index_to_table": {},
            "migration_index_to_table": {},
            "schema_unique_to_table": {},
            "schema_tables_by_prefix": [],
        }
        stmt = ParsedStatement(1, [], [], 'ALTER INDEX "unknown_idx" RENAME TO "other";', [])
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "UNRESOLVED", op

    def alter_table_r3b_new_constraint():
        stmt = ParsedStatement(
            1,
            [],
            [],
            'ALTER TABLE "trip_driving_impact" ADD CONSTRAINT "new_check" CHECK (true);',
            [],
        )
        op = build_operation_record(stmt, owners)
        return op["classification"] == "R3B_SCOPE", op

    def frozen_trip_driving_impact():
        target = 'ALTER TABLE "trip_driving_impact" ALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);'
        found = target in FROZEN_DIFF_SQL.read_text()
        stmt = ParsedStatement(1, ["AlterTable"], [], target.rstrip(";"), [])
        op = build_operation_record(stmt, owners)
        return found and op["classification"] == "R3B_SCOPE", op

    def prisma_drift_decision():
        op = {
            "ordinal": 1,
            "raw_sql": 'ALTER TABLE "trip_driving_impact" ALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);',
            "owner_table": "trip_driving_impact",
            "owner_column": "calculated_at",
            "property_identity": "trip_driving_impact:types",
        }
        d = decide_operation(op)
        return d["decision"] == "CURRENT_PRISMA_SCHEMA_DRIFT", d

    def semicolon_in_string_independent():
        sql = "INSERT INTO t VALUES ('a;b'); SELECT 1;"
        return count_top_level_statements(sql) == 2, {"count": count_top_level_statements(sql)}

    def dollar_quote_independent():
        sql = "SELECT $$;$$;"
        return count_top_level_statements(sql) == 1, {"count": count_top_level_statements(sql)}

    def resolve_index_owner_api():
        res, table, _ = resolve_index_owner("unknown_idx", owners)
        return res in {"OWNER_R3B", "OWNER_OUT_OF_SCOPE", "OWNER_UNKNOWN"}, {"resolution": res, "table": table}

    cases = [
        ("independence_static_check", independence_static),
        ("independence_positive_cross_check", independence_positive),
        ("independence_negative_monkeypatch", independence_negative),
        ("create_index_r3b_by_on_relation", create_index_r3b_by_on_relation),
        ("create_unique_index_r3b_by_on_relation", create_unique_index_r3b_by_on_relation),
        ("drop_index_r3b_owner", drop_index_r3b_owner),
        ("drop_index_out_of_scope_positive", drop_index_out_of_scope_positive),
        ("drop_index_unknown_owner_unresolved", drop_index_unknown_owner),
        ("alter_index_unknown_unresolved", alter_index_unknown_unresolved),
        ("alter_table_r3b_new_constraint", alter_table_r3b_new_constraint),
        ("frozen_trip_driving_impact", frozen_trip_driving_impact),
        ("prisma_drift_decision", prisma_drift_decision),
        ("semicolon_in_string_independent", semicolon_in_string_independent),
        ("dollar_quote_independent", dollar_quote_independent),
        ("resolve_index_owner_api", resolve_index_owner_api),
    ]
    for name, fn in cases:
        tests.append(run_test(name, fn))

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2.1",
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
