#!/usr/bin/env python3
"""Golden tests for CI-R3B1Q.2 source-history remediation and R3B1Q.3 harness readiness."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1o1_sql_classifier import parse_migration_statements
from ci_r3b1n2_constants import sha256_file
from ci_r3b1o4_execution_set import PHYSICAL_TAIL_MIGRATION_NAME, TEMPORARY_TAIL_MIGRATION_NAME, build_execution_set
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract
from ci_r3b1q_tail_identity import (
    EXECUTED_TAIL_SQL_SHA256,
    EXECUTED_TAIL_SQL_EVIDENCE,
    physical_tail_sql_path,
    tail_identity_status,
    temporary_tail_prisma_directory,
)
from ci_r3b1q3_verification_harness import (
    BROKEN_CATALOG_FINGERPRINT_SQL,
    audit_verification_harness_read_only,
    broken_indexrelid_alias_present,
    correct_indexrelid_alias_present,
    fingerprint_regression_status,
)


def _add(tests: list, test_id: str, fn: str, expected: str, ok: bool, actual: str):
    tests.append({"test_id": test_id, "function": fn, "expected": expected, "actual": actual, "pass": ok})


def run_tests() -> dict:
    tests: list[dict] = []
    identity = tail_identity_status()
    physical = physical_tail_sql_path()
    evidence_sha = sha256_file(EXECUTED_TAIL_SQL_EVIDENCE)

    _add(
        tests,
        "physical_tail_directory_exists",
        "physical_tail_sql_path",
        "true",
        physical is not None,
        str(physical is not None),
    )
    _add(
        tests,
        "source_physical_tail_sha_matches_executed",
        "sha256_file",
        EXECUTED_TAIL_SQL_SHA256,
        identity.get("source_physical_tail_sha256") == EXECUTED_TAIL_SQL_SHA256,
        str(identity.get("source_physical_tail_sha256")),
    )
    _add(
        tests,
        "evidence_sql_sha_matches_executed",
        "sha256_file",
        EXECUTED_TAIL_SQL_SHA256,
        evidence_sha == EXECUTED_TAIL_SQL_SHA256,
        evidence_sha,
    )
    _add(
        tests,
        "temporary_tail_prisma_directory_absent",
        "temporary_tail_prisma_directory",
        "false",
        temporary_tail_prisma_directory() is None,
        str(temporary_tail_prisma_directory() is not None),
    )
    _add(
        tests,
        "prisma_discoverable_tail_is_physical",
        "prisma_discoverable_tail_name",
        PHYSICAL_TAIL_MIGRATION_NAME,
        identity["prisma_discoverable_tail_name"] == PHYSICAL_TAIL_MIGRATION_NAME,
        str(identity["prisma_discoverable_tail_name"]),
    )

    if physical:
        _add(
            tests,
            "source_tail_byte_identical_to_evidence",
            "bytes.compare",
            "identical",
            physical.read_bytes() == EXECUTED_TAIL_SQL_EVIDENCE.read_bytes(),
            "identical" if physical.read_bytes() == EXECUTED_TAIL_SQL_EVIDENCE.read_bytes() else "different",
        )

    contract = build_tail_reconciliation_contract()
    _add(tests, "tail_task_count_three", "build_tail_reconciliation_contract", "3", contract["logical_task_count"] == 3, str(contract["logical_task_count"]))
    _add(tests, "tail_unauthorized_tasks_zero", "build_tail_reconciliation_contract", "0", contract["unauthorized_tasks"] == 0, str(contract["unauthorized_tasks"]))

    if physical:
        contract_tasks = build_tail_reconciliation_contract()["logical_task_count"]
        _add(tests, "tail_statement_count_three", "build_tail_reconciliation_contract", "3", contract_tasks == 3, str(contract_tasks))
        joined = physical.read_text()
        drop_cascade = any("DROP" in ln.upper() and " CASCADE" in ln.upper() for ln in joined.splitlines())
        _add(tests, "tail_no_cascade", "migration.sql", "0", not drop_cascade, "present" if drop_cascade else "0")

    es = build_execution_set()
    tail_migs = [m for m in es["migrations"] if m["classification"] == "APPEND_ONLY_TAIL_RECONCILIATION"]
    _add(tests, "execution_set_single_tail_entry", "build_execution_set", "1", len(tail_migs) == 1, str(len(tail_migs)))
    if tail_migs:
        _add(
            tests,
            "execution_set_tail_uses_physical_name",
            "build_execution_set",
            PHYSICAL_TAIL_MIGRATION_NAME,
            tail_migs[0]["migration_name"] == PHYSICAL_TAIL_MIGRATION_NAME,
            tail_migs[0]["migration_name"],
        )
        _add(
            tests,
            "execution_set_logical_tail_not_prisma_pending",
            "build_execution_set",
            "true",
            tail_migs[0].get("prisma_discoverable") is True
            and TEMPORARY_TAIL_MIGRATION_NAME not in {m["migration_name"] for m in es["migrations"]},
            str(tail_migs[0].get("prisma_discoverable")),
        )

    fp = fingerprint_regression_status()
    _add(tests, "BROKEN_I_INDEXRELID_REGRESSION_TEST", "fingerprint_regression_status", "true", fp["BROKEN_I_INDEXRELID_REGRESSION_TEST"], str(fp["BROKEN_I_INDEXRELID_REGRESSION_TEST"]))
    _add(tests, "CORRECT_IX_INDEXRELID_TEST", "fingerprint_regression_status", "true", fp["CORRECT_IX_INDEXRELID_TEST"], str(fp["CORRECT_IX_INDEXRELID_TEST"]))
    _add(
        tests,
        "broken_fixture_contains_alias_defect",
        "broken_indexrelid_alias_present",
        "true",
        broken_indexrelid_alias_present(BROKEN_CATALOG_FINGERPRINT_SQL),
        str(broken_indexrelid_alias_present(BROKEN_CATALOG_FINGERPRINT_SQL)),
    )

    ro = audit_verification_harness_read_only()
    _add(tests, "VERIFICATION_TOOLING_READ_ONLY", "audit_verification_harness_read_only", "true", ro["VERIFICATION_TOOLING_READ_ONLY"], str(ro["VERIFICATION_TOOLING_READ_ONLY"]))

    passed = sum(1 for t in tests if t["pass"])
    failed = [t for t in tests if not t["pass"]]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1Q.2",
        "total": len(tests),
        "passed": passed,
        "failed": len(failed),
        "pass": len(failed) == 0,
        "tests": tests,
        "fingerprint_regression": fp,
        "read_only_audit": ro,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()
    result = run_tests()
    if args.json_out:
        args.json_out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"pass": result["pass"], "passed": result["passed"], "total": result["total"]}, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
