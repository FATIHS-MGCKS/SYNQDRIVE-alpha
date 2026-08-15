"""Terminal acceptance gate for CI-R3B1O.3 corrective rerun."""
from __future__ import annotations

from typing import Any


def evaluate_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    failures = []

    if gates.get("corrective_worktree_strict_empty") is not True:
        failures.append("corrective_worktree_strict_empty")

    required_true = [
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("golden_test_script_exit_zero", gates.get("golden_test_script_exit_zero")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
        ("repository_immutable", gates.get("repository_immutable")),
    ]
    required_zero = [
        ("unknown_scope", gates.get("unknown_scope")),
        ("unattributed", gates.get("unattributed")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("golden_failed", gates.get("golden_failed")),
    ]

    for name, val in required_true:
        if val is None:
            failures.append(f"missing:{name}")
        elif not val:
            failures.append(name)
    for name, val in required_zero:
        if val is None:
            failures.append(f"missing:{name}")
        elif val != 0:
            failures.append(f"{name}={val}")

    if failures:
        status = "CI_R3B1O3_TERMINAL_ACCEPTANCE_FAILED"
        if gates.get("new_strategy_drift", 0) > 0 or gates.get("attribution_pass") is False:
            status = "CI_R3B1O3_FINAL_DRIFT_ATTRIBUTION_FAILED"
        elif gates.get("corrective_worktree_strict_empty") is not True:
            status = "CI_R3B1O3_BASELINE_NOT_CLEAN"
        elif gates.get("m252_exact_parity_pass") is False:
            status = "CI_R3B1O3_M252_EXACT_PARITY_GATE_FAILED"
        elif gates.get("golden_tests_pass") is False or gates.get("golden_failed", 0) > 0:
            status = "CI_R3B1O3_GOLDEN_GATE_FAILED"
        elif gates.get("strategy_pass") is False:
            status = "CI_R3B1O3_FINAL_STRATEGY_REPLAY_FAILED"
        elif gates.get("second_deploy_pass") is False:
            status = "CI_R3B1O3_REPEAT_DEPLOY_FAILED"
        return {
            "pass": False,
            "final_status": status,
            "r3b1p_readiness": "NOT_READY",
            "failures": failures,
        }
    return {
        "pass": True,
        "final_status": "CI_R3B1O3_FINAL_STRATEGY_ACCEPTANCE_CLOSURE_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }
