"""Terminal acceptance gate for CI-R3B1O.4."""
from __future__ import annotations

from typing import Any


def evaluate_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    failures = []

    if gates.get("worktree_strict_empty") is not True:
        failures.append("worktree_strict_empty")
    if gates.get("invoice_stale_authority_pass") is not True:
        failures.append("invoice_stale_authority_pass")
    if gates.get("whatsapp_stale_authority_pass") is not True:
        failures.append("whatsapp_stale_authority_pass")
    if gates.get("drop_safety_pass") is not True:
        failures.append("drop_safety_pass")
    if gates.get("replacement_safety_pass") is not True:
        failures.append("replacement_safety_pass")
    if gates.get("tail_contract_pass") is not True:
        failures.append("tail_contract_pass")
    if gates.get("pre_tail_preconditions_pass") is not True:
        failures.append("pre_tail_preconditions_pass")

    required_true = [
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("golden_test_script_exit_zero", gates.get("golden_test_script_exit_zero")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("repository_immutable", gates.get("repository_immutable")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("tail_deploy_pass", gates.get("tail_deploy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("catalog_delta_pass", gates.get("catalog_delta_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
        ("evidence_code_mismatch_zero", gates.get("evidence_code_mismatch_zero")),
        ("stale_indexes_removed", gates.get("stale_indexes_removed")),
        ("replacements_present", gates.get("replacements_present")),
    ]
    required_zero = [
        ("unknown_scope", gates.get("unknown_scope")),
        ("unattributed", gates.get("unattributed")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("golden_failed", gates.get("golden_failed")),
        ("stale_index_drop_ops_remaining", gates.get("stale_index_drop_ops_remaining")),
        ("unauthorized_final_delta", gates.get("unauthorized_final_delta")),
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
        status = "CI_R3B1O4_TERMINAL_ACCEPTANCE_FAILED"
        if gates.get("invoice_stale_authority_pass") is False or gates.get("whatsapp_stale_authority_pass") is False:
            status = "CI_R3B1O4_STALE_INDEX_AUTHORITY_FAILED"
        elif gates.get("pre_tail_preconditions_pass") is False:
            status = "CI_R3B1O4_TAIL_PRECONDITION_FAILED"
        elif gates.get("tail_deploy_pass") is False:
            status = "CI_R3B1O4_TAIL_RECONCILIATION_FAILED"
        elif gates.get("m252_exact_parity_pass") is False:
            status = "CI_R3B1O4_M252_EXACT_PARITY_FAILED"
        elif gates.get("new_strategy_drift", 0) > 0 or gates.get("attribution_pass") is False:
            status = "CI_R3B1O4_FINAL_STRATEGY_DRIFT_FAILED"
        elif gates.get("golden_tests_pass") is False or gates.get("evidence_code_mismatch_zero") is False:
            status = "CI_R3B1O4_ACCEPTANCE_EVIDENCE_FAILED"
        elif gates.get("production_unchanged") is False:
            status = "CI_R3B1O4_PRODUCTION_SAFETY_VIOLATION"
        elif gates.get("worktree_strict_empty") is not True:
            status = "CI_R3B1O4_BASELINE_NOT_CLEAN"
        return {
            "pass": False,
            "final_status": status,
            "r3b1p_readiness": "NOT_READY",
            "failures": failures,
        }
    return {
        "pass": True,
        "final_status": "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }


def evaluate_corrective_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    failures = []
    if gates.get("worktree_strict_empty") is not True:
        failures.append("worktree_strict_empty")
    if gates.get("t2_drop_safety_pass") is not True:
        failures.append("t2_drop_safety_pass")
    if gates.get("replacement_safety_pass") is not True:
        failures.append("replacement_safety_pass")
    if gates.get("tail_present_pre_second") is not True:
        failures.append("tail_present_pre_second")
    if gates.get("tail_present_during_second") is not True:
        failures.append("tail_present_during_second")

    required_true = [
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("evidence_code_mismatch_zero", gates.get("evidence_code_mismatch_zero")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("repository_immutable", gates.get("repository_immutable")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("catalog_delta_pass", gates.get("catalog_delta_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
    ]
    required_zero = [
        ("unknown_scope", gates.get("unknown_scope")),
        ("unattributed", gates.get("unattributed")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("golden_failed", gates.get("golden_failed")),
        ("stale_index_drop_ops_remaining", gates.get("stale_index_drop_ops_remaining")),
        ("unauthorized_final_delta", gates.get("unauthorized_final_delta")),
        ("unknown_delta_authority", gates.get("unknown_delta_authority")),
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
        status = "CI_R3B1O4_TERMINAL_ACCEPTANCE_FAILED"
        if gates.get("second_deploy_pass") is False or gates.get("tail_present_pre_second") is False:
            status = "CI_R3B1O4_REPEAT_DEPLOY_FAILED"
        elif gates.get("catalog_delta_pass") is False or gates.get("unauthorized_final_delta", 0) > 0:
            status = "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED"
        elif gates.get("t2_drop_safety_pass") is False:
            status = "CI_R3B1O4_STALE_INDEX_AUTHORITY_FAILED"
        elif gates.get("m252_exact_parity_pass") is False:
            status = "CI_R3B1O4_M252_EXACT_PARITY_FAILED"
        elif gates.get("new_strategy_drift", 0) > 0:
            status = "CI_R3B1O4_FINAL_STRATEGY_DRIFT_FAILED"
        elif gates.get("evidence_code_mismatch_zero") is False:
            status = "CI_R3B1O4_ACCEPTANCE_EVIDENCE_FAILED"
        elif gates.get("production_unchanged") is False:
            status = "CI_R3B1O4_PRODUCTION_SAFETY_VIOLATION"
        elif gates.get("worktree_strict_empty") is not True:
            status = "CI_R3B1O4_CORRECTIVE_BASELINE_NOT_CLEAN"
        return {"pass": False, "final_status": status, "r3b1p_readiness": "NOT_READY", "failures": failures}
    return {
        "pass": True,
        "final_status": "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }


def evaluate_final_corrective_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    failures = []
    if gates.get("worktree_strict_empty") is not True:
        failures.append("worktree_strict_empty")
    if gates.get("t2_drop_safety_pass") is not True:
        failures.append("t2_drop_safety_pass")
    if gates.get("replacement_safety_pass") is not True:
        failures.append("replacement_safety_pass")
    if gates.get("tail_present_pre_second") is not True:
        failures.append("tail_present_pre_second")
    if gates.get("tail_present_during_second") is not True:
        failures.append("tail_present_during_second")

    required_true = [
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("evidence_code_mismatch_zero", gates.get("evidence_code_mismatch_zero")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("repository_immutable", gates.get("repository_immutable")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("catalog_delta_pass", gates.get("catalog_delta_pass")),
        ("catalog_engine_crossvalidation_pass", gates.get("catalog_engine_crossvalidation_pass")),
        ("execution_set_pass", gates.get("execution_set_pass")),
        ("expected_catalog_pass", gates.get("expected_catalog_pass")),
        ("implicit_catalog_pass", gates.get("implicit_catalog_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
    ]
    required_zero = [
        ("unknown_scope", gates.get("unknown_scope")),
        ("unattributed", gates.get("unattributed")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("golden_failed", gates.get("golden_failed")),
        ("stale_index_drop_ops_remaining", gates.get("stale_index_drop_ops_remaining")),
        ("unauthorized_final_delta", gates.get("unauthorized_final_delta")),
        ("unknown_delta_authority", gates.get("unknown_delta_authority")),
        ("ambiguous", gates.get("ambiguous")),
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
        status = "CI_R3B1O4_TERMINAL_ACCEPTANCE_FAILED"
        if gates.get("catalog_engine_crossvalidation_pass") is False:
            status = "CI_R3B1O4_CATALOG_ENGINE_CROSSVALIDATION_FAILED"
        elif gates.get("second_deploy_pass") is False or gates.get("tail_present_pre_second") is False:
            status = "CI_R3B1O4_REPEAT_DEPLOY_FAILED"
        elif gates.get("catalog_delta_pass") is False or gates.get("unauthorized_final_delta", 0) > 0 or gates.get("ambiguous", 0) > 0:
            status = "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED"
        elif gates.get("t2_drop_safety_pass") is False:
            status = "CI_R3B1O4_STALE_INDEX_AUTHORITY_FAILED"
        elif gates.get("m252_exact_parity_pass") is False:
            status = "CI_R3B1O4_M252_EXACT_PARITY_FAILED"
        elif gates.get("new_strategy_drift", 0) > 0:
            status = "CI_R3B1O4_FINAL_STRATEGY_DRIFT_FAILED"
        elif gates.get("evidence_code_mismatch_zero") is False:
            status = "CI_R3B1O4_ACCEPTANCE_EVIDENCE_FAILED"
        elif gates.get("production_unchanged") is False:
            status = "CI_R3B1O4_PRODUCTION_SAFETY_VIOLATION"
        elif gates.get("worktree_strict_empty") is not True:
            status = "CI_R3B1O4_FINAL_CORRECTIVE_BASELINE_NOT_CLEAN"
        return {"pass": False, "final_status": status, "r3b1p_readiness": "NOT_READY", "failures": failures}
    return {
        "pass": True,
        "final_status": "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }


def evaluate_binding_corrective_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    failures = []
    if gates.get("worktree_strict_empty") is not True:
        failures.append("worktree_strict_empty")
    if gates.get("t2_drop_safety_pass") is not True:
        failures.append("t2_drop_safety_pass")
    if gates.get("replacement_safety_pass") is not True:
        failures.append("replacement_safety_pass")
    if gates.get("tail_present_pre_second") is not True:
        failures.append("tail_present_pre_second")
    if gates.get("tail_present_during_second") is not True:
        failures.append("tail_present_during_second")

    required_true = [
        ("golden_tests_pass", gates.get("golden_tests_pass")),
        ("golden_coverage_complete", gates.get("golden_coverage_complete")),
        ("evidence_code_mismatch_zero", gates.get("evidence_code_mismatch_zero")),
        ("schema_unchanged", gates.get("schema_unchanged")),
        ("migrations_unchanged", gates.get("migrations_unchanged")),
        ("repository_immutable", gates.get("repository_immutable")),
        ("m252_exact_parity_pass", gates.get("m252_exact_parity_pass")),
        ("r3b_parity_pass", gates.get("r3b_parity_pass")),
        ("strategy_pass", gates.get("strategy_pass")),
        ("second_deploy_pass", gates.get("second_deploy_pass")),
        ("production_unchanged", gates.get("production_unchanged")),
        ("attribution_pass", gates.get("attribution_pass")),
        ("catalog_delta_pass", gates.get("catalog_delta_pass")),
        ("catalog_engine_crossvalidation_pass", gates.get("catalog_engine_crossvalidation_pass")),
        ("statement_crossvalidation_pass", gates.get("statement_crossvalidation_pass")),
        ("execution_set_pass", gates.get("execution_set_pass")),
        ("expected_catalog_pass", gates.get("expected_catalog_pass")),
        ("implicit_catalog_pass", gates.get("implicit_catalog_pass")),
        ("data_risk_unknown_zero", gates.get("data_risk_unknown_zero")),
    ]
    required_zero = [
        ("unknown_scope", gates.get("unknown_scope")),
        ("unattributed", gates.get("unattributed")),
        ("new_strategy_drift", gates.get("new_strategy_drift")),
        ("r3b_scope", gates.get("r3b_scope")),
        ("m252_scope", gates.get("m252_scope")),
        ("golden_failed", gates.get("golden_failed")),
        ("stale_index_drop_ops_remaining", gates.get("stale_index_drop_ops_remaining")),
        ("unauthorized_final_delta", gates.get("unauthorized_final_delta")),
        ("unknown_delta_authority", gates.get("unknown_delta_authority")),
        ("ambiguous", gates.get("ambiguous")),
        ("authority_statement_unbound", gates.get("authority_statement_unbound")),
        ("key_only_authorization", gates.get("key_only_authorization")),
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
        status = "CI_R3B1O4_TERMINAL_ACCEPTANCE_FAILED"
        if gates.get("statement_crossvalidation_pass") is False or gates.get("authority_statement_unbound", 0) > 0:
            status = "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED"
        elif gates.get("catalog_engine_crossvalidation_pass") is False:
            status = "CI_R3B1O4_CATALOG_ENGINE_CROSSVALIDATION_FAILED"
        elif gates.get("second_deploy_pass") is False or gates.get("tail_present_pre_second") is False:
            status = "CI_R3B1O4_REPEAT_DEPLOY_FAILED"
        elif (
            gates.get("catalog_delta_pass") is False
            or gates.get("unauthorized_final_delta", 0) > 0
            or gates.get("ambiguous", 0) > 0
            or gates.get("key_only_authorization", 0) > 0
        ):
            status = "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED"
        elif gates.get("t2_drop_safety_pass") is False:
            status = "CI_R3B1O4_STALE_INDEX_AUTHORITY_FAILED"
        elif gates.get("m252_exact_parity_pass") is False:
            status = "CI_R3B1O4_M252_EXACT_PARITY_FAILED"
        elif gates.get("new_strategy_drift", 0) > 0:
            status = "CI_R3B1O4_FINAL_STRATEGY_DRIFT_FAILED"
        elif gates.get("golden_tests_pass") is False or gates.get("evidence_code_mismatch_zero") is False:
            status = "CI_R3B1O4_ACCEPTANCE_EVIDENCE_FAILED"
        elif gates.get("production_unchanged") is False:
            status = "CI_R3B1O4_PRODUCTION_SAFETY_VIOLATION"
        elif gates.get("worktree_strict_empty") is not True:
            status = "CI_R3B1O4_CORRECTIVE_BASELINE_NOT_CLEAN"
        return {"pass": False, "final_status": status, "r3b1p_readiness": "NOT_READY", "failures": failures}
    return {
        "pass": True,
        "final_status": "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED",
        "r3b1p_readiness": "R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN",
        "failures": [],
    }


def evaluate_ambiguity_corrective_terminal_acceptance(**gates: Any) -> dict[str, Any]:
    result = evaluate_binding_corrective_terminal_acceptance(**gates)
    if not result.get("pass"):
        return result
    extra_failures: list[str] = []
    if gates.get("no_ranking_proof_pass") is False:
        extra_failures.append("no_ranking_proof_pass")
    synth = gates.get("synthetic_m252_creator_count")
    if synth not in (None, 0):
        extra_failures.append(f"synthetic_m252_creator_count={synth}")
    if extra_failures:
        return {
            "pass": False,
            "final_status": "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED",
            "r3b1p_readiness": "NOT_READY",
            "failures": (result.get("failures") or []) + extra_failures,
        }
    return result
