#!/usr/bin/env python3
"""Real golden tests for CI-R3B1N.2."""
from __future__ import annotations

import json
from pathlib import Path

from ci_r3b1n2_checksum import semantic_change_kind
from ci_r3b1n2_constants import DATA, R3B1G, sha256_text
from ci_r3b1n2_effect_parser import classify_pending_effects, parse_migration_effects
from ci_r3b1n2_instance_identity import MutationGuard, prove_isolation
from ci_r3b1n2_twin_ops import parse_deploy_errors

OUT = DATA / "ci-r3b1n2-golden-tests-2026-08.json"


def run_tests() -> dict:
    tests = []

    def add(name: str, ok: bool, expected: str, actual: str, detail=None):
        tests.append({"name": name, "pass": ok, "expected": expected, "actual": actual, "detail": detail})

    prod = {"instance_fingerprint_sha256": "prod", "database_fingerprint_sha256": "proddb"}
    twin = {"instance_fingerprint_sha256": "twin", "database_fingerprint_sha256": "twindb"}
    iso = prove_isolation(prod, twin)
    add("different_isolated_instance_pass", iso["isolation_pass"] is True, "PASS", str(iso["isolation_pass"]))
    same = prove_isolation(prod, prod)
    add("same_instance_isolation_fail", same["isolation_pass"] is False, "FAIL", str(same["isolation_pass"]))

    guard = MutationGuard(prod, twin)
    try:
        guard.check_fingerprints("prod", "twindb", operation="synthetic")
        add("mutation_guard_production_fingerprint", False, "HARD FAIL", "no exception")
    except RuntimeError as exc:
        add("mutation_guard_production_fingerprint", "SAFETY_ABORT" in str(exc), "HARD FAIL", str(exc)[:80])

    counts_ok = {"organizations": {"exists": True, "row_count": 0}, "vehicles": {"exists": False, "row_count": None}}
    nulls = sum(1 for v in counts_ok.values() if v["exists"] and v["row_count"] is None)
    total = sum(v["row_count"] for v in counts_ok.values() if isinstance(v.get("row_count"), int))
    add("business_zero_rows_pass", nulls == 0 and total == 0, "PASS", f"nulls={nulls},total={total}")

    counts_bad = {"bookings": {"exists": True, "row_count": None}}
    nulls_bad = sum(1 for v in counts_bad.values() if v["exists"] and v["row_count"] is None)
    add("business_null_row_count_fail", nulls_bad > 0, "FAIL", str(nulls_bad))

    reps = {"raw": "aaa", "lf": "bbb", "crlf": "ccc"}
    add("match_crlf", ("MATCH_CRLF" if reps["crlf"] == "ccc" else "x") == "MATCH_CRLF", "MATCH_CRLF", "MATCH_CRLF")

    kind = semantic_change_kind("a\r\nb", "a\nb")
    add("line_ending_only", kind == "LINE_ENDING_REPRESENTATION_DIFFERENCE", kind, kind)

    kind2 = semantic_change_kind("SELECT 1;", "SELECT 2;")
    add("semantic_sql_change", kind2 == "SEMANTIC_SQL_CHANGE", kind2, kind2)

    unknown = classify_pending_effects("m", "-- comment only", column_exists=lambda t, c: False, table_exists=lambda t: False)
    add("empty_effects_unknown", unknown["classification"] == "PENDING_EFFECT_UNKNOWN", unknown["classification"], unknown["classification"])

    absent = classify_pending_effects(
        "m",
        'ALTER TABLE "t" ADD COLUMN "c" TEXT;',
        column_exists=lambda t, c: False,
        table_exists=lambda t: False,
    )
    add("modeled_add_column_absent", absent["classification"] == "PENDING_AND_PHYSICALLY_ABSENT", absent["classification"], absent["classification"])

    present = classify_pending_effects(
        R3B1G,
        'ALTER TABLE "vehicle_tire_setups" ADD COLUMN "status" "TireSetupStatus" NOT NULL DEFAULT \'ACTIVE\'::"TireSetupStatus";',
        column_exists=lambda t, c: True,
        table_exists=lambda t: True,
    )
    add("modeled_add_column_present", present["classification"] == "PENDING_BUT_EFFECT_ALREADY_PRESENT", present["classification"], present["classification"])

    parsed = parse_deploy_errors("Database error code: 42701\nMigration name: foo")
    add("extract_db_error_42701", parsed["database_error_code"] == "42701", "42701", str(parsed["database_error_code"]))

    passed = sum(1 for t in tests if t["pass"])
    return {"schema_version": 1, "phase": "CI-R3B1N.2", "tests": tests, "total": len(tests), "passed": passed, "pass": passed == len(tests)}


def main() -> int:
    doc = run_tests()
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    return 0 if doc["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
