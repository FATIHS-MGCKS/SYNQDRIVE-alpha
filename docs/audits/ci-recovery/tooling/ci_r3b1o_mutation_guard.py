"""Exact instance + database mutation guard for CI-R3B1O."""
from __future__ import annotations

import secrets
from typing import Any

from ci_r3b1n2_instance_identity import MutationGuard, query_instance_identity_dsn
from ci_r3b1n2_twin_ops import parse_local_dsn, psql_exec, twin_dsn


def guard_preflight_with_golden_tests(
    production_identity: dict[str, Any],
    approved_identity: dict[str, Any],
) -> dict[str, Any]:
    guard = MutationGuard(production_identity, approved_identity)
    tests: list[dict[str, Any]] = []

    def add(name: str, ok: bool, expected: str, actual: str) -> None:
        tests.append({"name": name, "pass": ok, "expected": expected, "actual": actual})

    try:
        guard.check_fingerprints(
            production_identity["instance_fingerprint_sha256"],
            approved_identity["database_fingerprint_sha256"],
            operation="synthetic_production_reject",
        )
        add("production_target_rejected", False, "HARD FAIL", "no exception")
    except RuntimeError as exc:
        add("production_target_rejected", "SAFETY_ABORT" in str(exc), "HARD FAIL", str(exc)[:120])

    try:
        guard.check_fingerprints(
            approved_identity["instance_fingerprint_sha256"],
            approved_identity["database_fingerprint_sha256"],
            operation="synthetic_approved_pass",
        )
        add("approved_target_pass", True, "PASS", "PASS")
    except RuntimeError as exc:
        add("approved_target_pass", False, "PASS", str(exc)[:120])

    base_dsn, _ = parse_local_dsn()
    wrong_db = f"r3b1o_guard_wrong_db_{secrets.token_hex(3)}"
    admin_dsn = twin_dsn(base_dsn, "postgres")
    psql_exec(admin_dsn, f'CREATE DATABASE "{wrong_db}";')
    wrong_dsn = twin_dsn(base_dsn, wrong_db)
    wrong_identity = query_instance_identity_dsn(wrong_dsn)
    try:
        guard.check_fingerprints(
            wrong_identity["instance_fingerprint_sha256"],
            wrong_identity["database_fingerprint_sha256"],
            operation="wrong_database_same_instance",
        )
        add("wrong_database_same_instance_rejected", False, "HARD FAIL", "no exception")
    except RuntimeError as exc:
        add(
            "wrong_database_same_instance_rejected",
            "SAFETY_ABORT" in str(exc) and "database" in str(exc).lower(),
            "HARD FAIL",
            str(exc)[:120],
        )
    finally:
        psql_exec(admin_dsn, f'DROP DATABASE IF EXISTS "{wrong_db}";')

    passed = sum(1 for t in tests if t["pass"])
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "exact_instance_required": True,
        "exact_database_required": True,
        "approved_instance_fingerprint": approved_identity["instance_fingerprint_sha256"],
        "approved_database_fingerprint": approved_identity["database_fingerprint_sha256"],
        "production_instance_fingerprint": production_identity["instance_fingerprint_sha256"],
        "production_database_fingerprint": production_identity["database_fingerprint_sha256"],
        "tests": tests,
        "total": len(tests),
        "passed": passed,
        "pass": passed == len(tests),
    }


# Patch MutationGuard to enforce database fingerprint (R3B1N.2 defect fix).
_original_check = MutationGuard.check_fingerprints


def _patched_check_fingerprints(
    self: MutationGuard,
    target_instance_fp: str,
    target_db_fp: str,
    *,
    operation: str,
) -> dict[str, Any]:
    if target_instance_fp == self.production_fp:
        raise RuntimeError(f"SAFETY_ABORT: {operation} target matches production instance fingerprint")
    if target_db_fp == self.production_db_fp:
        raise RuntimeError(f"SAFETY_ABORT: {operation} target matches production database fingerprint")
    if target_instance_fp != self.approved_instance_fp:
        raise RuntimeError(f"SAFETY_ABORT: {operation} target is not the approved twin instance")
    if target_db_fp != self.approved_db_fp:
        raise RuntimeError(f"SAFETY_ABORT: {operation} target is not the approved twin database")
    return {"operation": operation, "pass": True}


MutationGuard.check_fingerprints = _patched_check_fingerprints  # type: ignore[method-assign]
