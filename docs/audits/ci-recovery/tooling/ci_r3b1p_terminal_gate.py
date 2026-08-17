"""Terminal GO/NO-GO gate for CI-R3B1P controlled production reconciliation preflight."""
from __future__ import annotations

from typing import Any


def evaluate_r3b1p_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    matrix: dict[str, str] = gates.get("go_no_go_matrix") or {}
    failures: list[str] = []

    required_go = [
        "PR_UNMERGED",
        "SOURCE_IMMUTABLE",
        "PRODUCTION_TARGET_CONFIRMED",
        "PRODUCTION_IMMUTABLE",
        "R3B_AUTHORITY_PARITY",
        "M252_PARITY",
        "GOLDEN_TESTS",
        "FULL_DIFF_CLASSIFICATION",
        "R3B_SCOPE_ZERO",
        "M252_SCOPE_ZERO",
        "UNKNOWN_SCOPE_ZERO",
        "NEW_STRATEGY_DRIFT_ZERO",
        "UNATTRIBUTED_ZERO",
        "UNAUTHORIZED_ZERO",
        "AMBIGUOUS_ZERO",
        "STATEMENT_UNBOUND_ZERO",
        "KEY_ONLY_AUTHORIZATION_ZERO",
        "STATEMENT_SHA_MATCH",
        "EVIDENCE_CODE_MATCH",
        "R3B1G_RESOLVE_UNAMBIGUOUS",
        "R3B1I_RESOLVE_UNAMBIGUOUS",
        "PENDING_MIGRATION_SET_FROZEN",
        "TAIL_SHA_FROZEN",
        "STALE_INDEX_IDENTITIES_CONFIRMED",
        "FAILURE_SEMANTICS_DOCUMENTED",
        "OPERATOR_TARGET_GUARD_DEFINED",
        "BACKUP_REQUIREMENT_DEFINED",
        "EXECUTION_RUNBOOK_COMPLETE",
    ]

    for key in required_go:
        val = matrix.get(key)
        if val is None:
            failures.append(f"missing:{key}")
        elif val not in {"GO", "N/A"}:
            failures.append(f"{key}={val}")

    if gates.get("production_mutation_count", 0) != 0:
        failures.append(f"production_mutation_count={gates.get('production_mutation_count')}")
    if gates.get("golden_tests_failed", 0) != 0:
        failures.append(f"golden_tests_failed={gates.get('golden_tests_failed')}")
    if gates.get("golden_tests_skipped", 0) != 0:
        failures.append(f"golden_tests_skipped={gates.get('golden_tests_skipped')}")

    if failures:
        return {
            "pass": False,
            "final_status": "CI_R3B1P_CONTROLLED_PRODUCTION_RECONCILIATION_PREFLIGHT_BLOCKED",
            "r3b1q_readiness": "R3B1Q_NOT_READY",
            "failures": failures,
            "go_no_go_matrix": matrix,
        }

    return {
        "pass": True,
        "final_status": "CI_R3B1P_CONTROLLED_PRODUCTION_RECONCILIATION_PREFLIGHT_COMPLETED",
        "r3b1q_readiness": "R3B1Q_READY_SEPARATELY_AUTHORIZED_PRODUCTION_EXECUTION",
        "failures": [],
        "go_no_go_matrix": matrix,
    }
