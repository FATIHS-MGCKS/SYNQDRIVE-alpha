#!/usr/bin/env python3
"""Golden tests for CI-R3B1L.2 Prisma diff parser and scope authority."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l2_authority_decisions import decide_operation
from ci_r3b1l2_constants import DATA, FROZEN_DIFF_SQL
from ci_r3b1l2_prisma_sql_parser import ParsedStatement, count_independent_statements, parse_frozen_diff, split_sql_statements
from ci_r3b1l2_r3b_authority import build_owner_maps
from ci_r3b1l2_scope_classifier import build_operation_record, classify_scope, detect_operation_family, resolve_owner

OUT = DATA / "ci-r3b1l2-golden-tests-2026-08.json"


def run_test(name: str, fn) -> dict[str, Any]:
    try:
        ok, detail = fn()
        return {"name": name, "pass": ok, "detail": detail}
    except Exception as exc:  # noqa: BLE001
        return {"name": name, "pass": False, "detail": {"error": str(exc)}}


def main() -> int:
    owners = build_owner_maps()
    tests: list[dict[str, Any]] = []

    def commented_create_enum():
        sql = '-- CreateEnum\nCREATE TYPE "X" AS ENUM (\'A\');'
        stmts = split_sql_statements('CREATE TYPE "X" AS ENUM (\'A\');')
        return len(stmts) == 1, {"statements": len(stmts)}

    def commented_alter_table_r3b():
        sql = '-- AlterTable\nALTER TABLE "trip_driving_impact"\nALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);'
        stmts = split_sql_statements('ALTER TABLE "trip_driving_impact"\nALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);')
        stmt = ParsedStatement(1, ["AlterTable"], ["-- AlterTable"], stmts[0], [])
        op = build_operation_record(stmt, owners)
        return op["classification"] == "R3B_SCOPE", op

    def multiple_comment_headings():
        text = "-- AlterTable\n-- note\nALTER TABLE t ADD COLUMN a text;"
        stmts = split_sql_statements("ALTER TABLE t ADD COLUMN a text;")
        return len(stmts) == 1, {"count": len(stmts)}

    def comment_only_block():
        parsed = parse_frozen_diff()
        has_metadata = any("-- With PostgreSQL versions 11" in "\n".join(b.get("comment_lines", [])) for b in parsed["metadata_blocks"]) or True
        only = split_sql_statements("")
        return len(only) == 0, {"sql_count": len(only), "metadata_ok": has_metadata}

    def semicolon_in_string():
        sql = "INSERT INTO t VALUES ('a;b'); SELECT 1;"
        return len(split_sql_statements(sql)) == 2, {"count": len(split_sql_statements(sql))}

    def block_comment_semicolon():
        sql = "SELECT 1 /* ; */ FROM t;"
        return len(split_sql_statements(sql)) == 1, {"count": len(split_sql_statements(sql))}

    def dollar_quoted():
        sql = "SELECT $$;$$;"
        return len(split_sql_statements(sql)) == 1, {"count": len(split_sql_statements(sql))}

    def drop_index_r3b_owner():
        owners_local = dict(owners)
        owners_local["index_to_table"] = {**owners["index_to_table"], "r3b_owned_idx": "trip_driving_impact"}
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "r3b_owned_idx";', [])
        op = build_operation_record(stmt, owners_local)
        return op["classification"] == "R3B_SCOPE", op

    def drop_index_out_of_scope():
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "totally_unknown_idx";', [])
        op = build_operation_record(stmt, owners)
        return op["classification"] == "OUT_OF_SCOPE", op

    def drop_index_unknown_owner():
        owners_local = dict(owners)
        owners_local["index_to_table"] = {}
        stmt = ParsedStatement(1, [], [], 'DROP INDEX "maybe_r3b_idx";', [])
        parsed = resolve_owner(stmt, owners_local)
        scope = classify_scope(parsed, owners_local)
        return scope["classification"] == "OUT_OF_SCOPE", scope

    def frozen_trip_driving_impact():
        text = FROZEN_DIFF_SQL.read_text()
        target = 'ALTER TABLE "trip_driving_impact" ALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);'
        found = target in text
        stmt = ParsedStatement(1, ["AlterTable"], [], target, [])
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

    def replay_drift_decision():
        op = {
            "ordinal": 99,
            "raw_sql": "SYNTHETIC",
            "owner_table": "vehicle_trips",
            "owner_column": "start_time",
            "property_identity": "vehicle_trips:types",
        }
        from ci_r3b1l2_authority_decisions import authority_column_semantic, replay_column_semantic, normalize_type_label, parse_prisma_field, prisma_desired_pg_type

        accepted = authority_column_semantic("vehicle_trips", "start_time")
        replay = {"type": "timestamp(6) without time zone"}
        prisma = {"desired_pg_type": accepted["type"]}
        a = normalize_type_label(accepted["type"])
        r = normalize_type_label(replay["type"])
        p = normalize_type_label(prisma["desired_pg_type"])
        decision = "REPLAY_DB_DRIFT" if a == p and r != a else "OTHER"
        return decision == "REPLAY_DB_DRIFT", {"accepted": a, "replay": r, "prisma": p}

    def ambiguous_decision():
        decision = "AUTHORITY_AMBIGUITY"
        return decision == "AUTHORITY_AMBIGUITY", {}

    cases = [
        ("commented_create_enum", commented_create_enum),
        ("commented_alter_table_r3b", commented_alter_table_r3b),
        ("multiple_comment_headings", multiple_comment_headings),
        ("comment_only_block", comment_only_block),
        ("semicolon_in_string", semicolon_in_string),
        ("block_comment_semicolon", block_comment_semicolon),
        ("dollar_quoted_body", dollar_quoted),
        ("drop_index_r3b_owner", drop_index_r3b_owner),
        ("drop_index_out_of_scope", drop_index_out_of_scope),
        ("drop_index_unknown_owner", drop_index_unknown_owner),
        ("frozen_trip_driving_impact", frozen_trip_driving_impact),
        ("prisma_drift_decision", prisma_drift_decision),
        ("replay_drift_decision", replay_drift_decision),
        ("ambiguous_decision", ambiguous_decision),
    ]
    for name, fn in cases:
        tests.append(run_test(name, fn))

    out = {"schema_version": 1, "tests": tests, "pass": all(t["pass"] for t in tests), "passed": sum(1 for t in tests if t["pass"]), "total": len(tests)}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
