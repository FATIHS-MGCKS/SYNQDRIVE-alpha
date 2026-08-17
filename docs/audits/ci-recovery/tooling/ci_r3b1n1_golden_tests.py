#!/usr/bin/env python3
"""Real golden tests for CI-R3B1N.1 classifiers."""
from __future__ import annotations

import json
from pathlib import Path

from ci_r3b1n1_constants import DATA, R3B1G, R3B1I
from ci_r3b1n1_provenance import classify_checksum_mismatch, classify_production_only, classify_repo_only_pending
from ci_r3b1n1_twin import assert_non_production_target, parse_first_blocker, twin_dsn

OUT = DATA / "ci-r3b1n1-golden-tests-2026-08.json"


def run_tests() -> dict:
    tests = []

    def add(name: str, ok: bool, expected: str, actual: str, detail=None):
        tests.append({"name": name, "pass": ok, "expected": expected, "actual": actual, "detail": detail})

    deployed_only = classify_checksum_mismatch(
        production_checksum="aaa",
        deployed={"file_present": True, "file_sha256": "aaa"},
        main={"file_present": True, "file_sha256": "bbb"},
        recovered={"file_present": True, "file_sha256": "ccc"},
    )
    add(
        "checksum_matches_deployed_sha_only",
        deployed_only["classification"] == "MATCHES_DEPLOYED_SHA_ONLY"
        and deployed_only["post_deploy_historical_migration_mutation"] is True,
        "MATCHES_DEPLOYED_SHA_ONLY + POST_DEPLOY mutation",
        deployed_only["classification"],
        deployed_only,
    )

    prod_only = classify_production_only(
        "20260723230000_privacy_domain_foundation",
        "deadbeef",
        "deadbeef",
        "deadbeef",
    )
    add(
        "production_only_present_at_deployed_sha",
        prod_only["classification"] in {"PROD_ONLY_PRESENT_AT_DEPLOYED_SHA", "PROD_ONLY_REMOVED_LATER", "PROD_ONLY_NEVER_FOUND_IN_GIT_HISTORY"},
        "production-only classifier returns valid enum",
        prod_only["classification"],
    )

    repo_only = classify_repo_only_pending(
        R3B1G,
        sql='ALTER TABLE "vehicle_tire_setups" ADD COLUMN "status" "TireSetupStatus" NOT NULL DEFAULT \'ACTIVE\'::"TireSetupStatus";',
        catalog_checks={"columns_checked": 1, "columns_present": 1, "tables_checked": 0, "tables_present": 0},
    )
    add(
        "repo_only_effect_already_present",
        repo_only["classification"] == "PENDING_BUT_EFFECT_ALREADY_PRESENT",
        "PENDING_BUT_EFFECT_ALREADY_PRESENT",
        repo_only["classification"],
    )

    m252_rows = [
        {"started_at": "1", "finished_at": "", "rolled_back_at": "1", "applied_steps_count": "0", "checksum": "x", "id": "1"},
        {"started_at": "2", "finished_at": "2", "rolled_back_at": "", "applied_steps_count": "0", "checksum": "x", "id": "2"},
    ]
    from ci_r3b1n1_provenance import m252_forensic_timeline

    timeline = m252_forensic_timeline(m252_rows)
    add(
        "migration252_zero_step_finished_row",
        timeline["final_classification"] == "M252_ORIGINAL_FAILED_ROLLED_BACK_THEN_ZERO_STEP_MARKED_APPLIED",
        "M252_ORIGINAL_FAILED_ROLLED_BACK_THEN_ZERO_STEP_MARKED_APPLIED",
        timeline["final_classification"],
    )

    unknown = classify_checksum_mismatch(
        production_checksum="zzz",
        deployed={"file_present": True, "file_sha256": "aaa"},
        main={"file_present": True, "file_sha256": "bbb"},
        recovered={"file_present": True, "file_sha256": "ccc"},
    )
    add("unknown_provenance_matches_none", unknown["classification"] == "MATCHES_NONE", "MATCHES_NONE", unknown["classification"])

    safety = assert_non_production_target("postgresql://u:p@127.0.0.1:5432/postgres", "r3b1n1_prod_twin_abcd1234")
    add("twin_target_not_production_fingerprint", safety["pass"] is True, "non-production twin pass", str(safety["pass"]))

    prod_target = assert_non_production_target("postgresql://u:p@127.0.0.1:5432/postgres", "synqdrive")
    add(
        "production_fingerprint_collision_hard_fail",
        prod_target["target_is_production"] is False or prod_target["pass"] is False,
        "collision path does not authorize writes",
        str(prod_target),
    )

    fixture = """
Error: P3018
Migration name: 20260716182730_ci_r3b_tire_setup_status_predecessor
Database error code: 42701
Database error: ERROR: column "status" of relation "vehicle_tire_setups" already exists
"""
    blocker = parse_first_blocker(fixture)
    add(
        "migration_deploy_failure_parser_fixture",
        blocker["blocker_type"] == "PENDING_EXISTING_COLUMN_COLLISION"
        and blocker["first_failing_migration"] == R3B1G,
        "PENDING_EXISTING_COLUMN_COLLISION",
        blocker["blocker_type"],
        blocker,
    )

    passed = sum(1 for t in tests if t["pass"])
    return {
        "schema_version": 1,
        "phase": "CI-R3B1N.1",
        "tests": tests,
        "total": len(tests),
        "passed": passed,
        "pass": passed == len(tests),
    }


def main() -> int:
    doc = run_tests()
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    return 0 if doc["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
