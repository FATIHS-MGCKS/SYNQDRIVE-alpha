"""Terminal acceptance gate for CI-R3B1O.3."""
from __future__ import annotations

from typing import Any


def evaluate_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    required_true = [
        ("baseline_clean", gates.get("baseline_clean")),
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
    ]
    required_zero = [
        ("owner_unknown", gates.get("owner_unknown")),
        ("unresolved", gates.get("unresolved")),
        ("unattributed", gates.get("unattributed")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("golden_failed", gates.get("golden_failed")),
    ]

    failures = []
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
        return {
            "pass": False,
            "final_status": "CI_R3B1O3_TERMINAL_ACCEPTANCE_FAILED",
            "r3b1p_readiness": "NOT_READY",
            "failures": failures,
        }
    return {
        "pass": True,
        "final_status": "CI_R3B1O3_FINAL_STRATEGY_DRIFT_PARITY_GATE_CLOSURE_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }
