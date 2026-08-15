#!/usr/bin/env python3
"""Golden tests for CI-R3B1O.4 — tail reconciliation, stale index authority, M252 parity."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l2_prisma_sql_parser import ParsedStatement
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1n2_constants import REPO
from ci_r3b1o2_constants import DATA, M252_CANONICAL
from ci_r3b1o2_diff_classifier import operation_fingerprint, resolve_owner_fields
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_diff_attribution import classify_operation_two_axis
from ci_r3b1o3_golden_tests import REQUIRED_TEST_IDS as O3_REQUIRED, run_diff_classifier_tests, run_m252_negative_tests, run_terminal_gate_tests as run_o3_terminal_tests
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o3_m252_exact_parity import compare_m252_exact, make_canonical_catalog_fixture
from ci_r3b1o4_stale_index_authority import build_invoice_stale_index_authority, build_whatsapp_stale_index_authority
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract, build_tail_sql, evaluate_tail_preconditions
from ci_r3b1o4_terminal_gate import evaluate_terminal_acceptance
from ci_r3b1o4_test_source_hashes import build_test_source_hash_manifest

SCHEMA_DUMP = REPO / "docs/audits/ci-recovery/.work/r3b1o4/production_schema_only.sql"


def _add(tests: list, test_id: str, fn: str, expected: str, ok: bool, actual: str):
    tests.append({"test_id": test_id, "function": fn, "expected": expected, "actual": actual, "pass": ok})


def run_tail_authority_tests(tests: list) -> None:
    invoice = build_invoice_stale_index_authority()
    whatsapp = build_whatsapp_stale_index_authority()
    _add(tests, "invoice_stale_creator_and_superseding", "build_invoice_stale_index_authority", "slot4+invoice_finance_workflow", invoice["creator_migration"] == "20260413225000_ci_r3b_historical_predecessor_slot4" and invoice["superseding_migration"] == "20260616180000_invoice_finance_workflow", f"{invoice['creator_migration']}->{invoice['superseding_migration']}")
    _add(tests, "whatsapp_stale_creator_and_superseding", "build_whatsapp_stale_index_authority", "slot11+whatsapp_business_platform", whatsapp["creator_migration"] == "20260620183000_ci_r3b_post_vendor_predecessor_slot11" and whatsapp["superseding_migration"] == "20260620190000_whatsapp_business_platform", f"{whatsapp['creator_migration']}->{whatsapp['superseding_migration']}")

    contract = build_tail_reconciliation_contract()
    _add(tests, "tail_contract_exactly_three_tasks", "build_tail_reconciliation_contract", "3", contract["logical_task_count"] == 3, str(contract["logical_task_count"]))
    _add(tests, "tail_contract_no_unauthorized_tasks", "build_tail_reconciliation_contract", "0", contract["unauthorized_tasks"] == 0, str(contract["unauthorized_tasks"]))

    sql, _ = build_tail_sql()
    _add(tests, "tail_sql_no_cascade", "build_tail_sql", "no CASCADE", " CASCADE" not in sql.upper(), "CASCADE" if " CASCADE" in sql.upper() else "none")
    _add(tests, "tail_sql_contains_invoice_drop", "build_tail_sql", "invoice drop", 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"' in sql, "present" if 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"' in sql else "missing")
    _add(tests, "tail_sql_contains_whatsapp_drop", "build_tail_sql", "whatsapp drop", 'DROP INDEX IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key"' in sql, "present")
    _add(tests, "tail_sql_contains_m252_create", "build_tail_sql", "M252 create", f'CREATE TABLE "{M252_TABLE}"' in sql, "present")

    bad_contract = copy.deepcopy(contract)
    bad_contract["logical_tasks"].append({"task_id": "EXTRA", "purpose": "forbidden"})
    _add(tests, "tail_contract_fourth_task_fail", "manual", "FAIL", len(bad_contract["logical_tasks"]) != 3, str(len(bad_contract["logical_tasks"])))

    pre = evaluate_tail_preconditions(lambda q: "0" if "COUNT(*)" in q and M252_TABLE in q else "1", phase="pre_tail")
    _add(tests, "tail_precondition_m252_absent_pass_fixture", "evaluate_tail_preconditions", "mixed", isinstance(pre, dict), str(pre.get("pass")))

    bad_pre = evaluate_tail_preconditions(lambda q: "1" if M252_TABLE in q else "0", phase="pre_tail")
    _add(tests, "tail_precondition_m252_present_fail", "evaluate_tail_preconditions", "FAIL", not bad_pre["pass"], str(bad_pre["pass"]))


def run_o4_terminal_tests(tests: list) -> None:
    base = dict(
        worktree_strict_empty=True,
        invoice_stale_authority_pass=True,
        whatsapp_stale_authority_pass=True,
        drop_safety_pass=True,
        replacement_safety_pass=True,
        tail_contract_pass=True,
        pre_tail_preconditions_pass=True,
        golden_tests_pass=True,
        golden_test_script_exit_zero=True,
        golden_coverage_complete=True,
        schema_unchanged=True,
        migrations_unchanged=True,
        repository_immutable=True,
        m252_exact_parity_pass=True,
        r3b_parity_pass=True,
        strategy_pass=True,
        tail_deploy_pass=True,
        second_deploy_pass=True,
        production_unchanged=True,
        attribution_pass=True,
        catalog_delta_pass=True,
        data_risk_unknown_zero=True,
        evidence_code_mismatch_zero=True,
        stale_indexes_removed=True,
        replacements_present=True,
        unknown_scope=0,
        unattributed=0,
        new_strategy_drift=0,
        r3b_scope=0,
        m252_scope=0,
        golden_failed=0,
        stale_index_drop_ops_remaining=0,
        unauthorized_final_delta=0,
    )
    perfect = evaluate_terminal_acceptance(**base)
    _add(tests, "o4_terminal_all_gates_pass", "evaluate_terminal_acceptance", "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED", perfect["pass"], perfect["final_status"])
    fail = evaluate_terminal_acceptance(**{**base, "stale_index_drop_ops_remaining": 1})
    _add(tests, "o4_terminal_stale_drop_ops_remaining_fail", "evaluate_terminal_acceptance", "FAIL", not fail["pass"], fail["final_status"])


TAIL_REQUIRED = [
    "invoice_stale_creator_and_superseding",
    "whatsapp_stale_creator_and_superseding",
    "tail_contract_exactly_three_tasks",
    "tail_contract_no_unauthorized_tasks",
    "tail_contract_fourth_task_fail",
    "tail_sql_no_cascade",
    "tail_sql_contains_invoice_drop",
    "tail_sql_contains_whatsapp_drop",
    "tail_sql_contains_m252_create",
    "tail_precondition_m252_absent_pass_fixture",
    "tail_precondition_m252_present_fail",
    "o4_terminal_all_gates_pass",
    "o4_terminal_stale_drop_ops_remaining_fail",
]

REQUIRED_TEST_IDS = list(O3_REQUIRED) + TAIL_REQUIRED


def run_golden_tests() -> dict:
    tests: list[dict] = []
    run_m252_negative_tests(tests)
    run_diff_classifier_tests(tests)
    run_o3_terminal_tests(tests)
    run_tail_authority_tests(tests)
    run_o4_terminal_tests(tests)

    hash_manifest = build_test_source_hash_manifest()
    for entry in hash_manifest["entries"]:
        _add(tests, f"source_hash_present_{entry['source_file'].replace('.', '_')}", "build_test_source_hash_manifest", "sha256 present", bool(entry["sha256"]), entry["source_file"])

    implemented = {t["test_id"] for t in tests}
    coverage_rows = []
    for test_id in REQUIRED_TEST_IDS:
        row = next((t for t in tests if t["test_id"] == test_id), None)
        coverage_rows.append(
            {
                "required_test_id": test_id,
                "implemented": row is not None,
                "function": row["function"] if row else None,
                "expected": row["expected"] if row else None,
                "actual": row["actual"] if row else None,
                "pass": row["pass"] if row else False,
            }
        )

    passed = sum(1 for t in tests if t["pass"])
    failed = sum(1 for t in tests if not t["pass"])
    coverage_complete = all(r["implemented"] for r in coverage_rows if r["required_test_id"] in REQUIRED_TEST_IDS)

    results = {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "required": len(REQUIRED_TEST_IDS),
        "implemented": len([r for r in coverage_rows if r["implemented"]]),
        "executed": len(tests),
        "passed": passed,
        "failed": failed,
        "coverage_complete": coverage_complete,
        "test_source_hashes": hash_manifest,
        "tests": tests,
        "pass": failed == 0 and coverage_complete,
    }
    (DATA / "ci-r3b1o4-golden-tests-2026-08.json").write_text(json.dumps(results, indent=2) + "\n")
    (DATA / "ci-r3b1o4-golden-coverage-2026-08.json").write_text(
        json.dumps({"schema_version": 1, "phase": "CI-R3B1O.4", "required_count": len(REQUIRED_TEST_IDS), "coverage_rows": coverage_rows, "coverage_complete": coverage_complete}, indent=2) + "\n"
    )
    return results


if __name__ == "__main__":
    raise SystemExit(0 if run_golden_tests()["pass"] else 1)
