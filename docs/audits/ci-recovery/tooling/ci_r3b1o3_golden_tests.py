#!/usr/bin/env python3
"""Golden tests for CI-R3B1O.3 — M252 exact parity, diff attribution, terminal gates."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l2_prisma_sql_parser import ParsedStatement
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_constants import DATA, M252_CANONICAL
from ci_r3b1o2_diff_classifier import classify_statements, operation_fingerprint, parse_sql_script, resolve_owner_fields
from ci_r3b1o2_r3b_authority import build_owner_maps, resolve_index_owner
from ci_r3b1o3_constants import STRATEGY_CONTRACT
from ci_r3b1o3_diff_attribution import classify_operation_two_axis
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o3_m252_exact_parity import compare_m252_exact, make_canonical_catalog_fixture
from ci_r3b1o3_terminal_gate import evaluate_terminal_acceptance

SCHEMA_DUMP = DATA.parents[1] / ".work/r3b1o/production_schema_only.sql"


def _add(tests: list, test_id: str, fn: str, expected: str, ok: bool, actual: str):
    tests.append(
        {
            "test_id": test_id,
            "function": fn,
            "expected": expected,
            "actual": actual,
            "pass": ok,
        }
    )


def _mutate_fixture(field_path: list[str], value) -> dict:
    fixture = make_canonical_catalog_fixture()
    node = fixture
    for key in field_path[:-1]:
        node = node[key]
    node[field_path[-1]] = value
    return fixture


def run_m252_negative_tests(tests: list) -> None:
    authority = build_m252_complete_physical_authority()
    positive = compare_m252_exact(authority, make_canonical_catalog_fixture())
    _add(tests, "m252_positive_control", "compare_m252_exact", "PASS", positive["pass"], str(positive["pass"]))

    cases = [
        ("m252_wrong_table_name", ["table_exists"], False),
        ("m252_missing_column", ["columns"], [{"ordinal": 1, "name": "id", "format_type": "text", "nullable": False, "default": None, "identity": "", "generated": ""}]),
        ("m252_wrong_column_type", ["columns", 1, "format_type"], "integer"),
        ("m252_wrong_timestamp_precision", ["columns", 4, "format_type"], "timestamp(6) without time zone"),
        ("m252_wrong_nullability", ["columns", 0, "nullable"], True),
        ("m252_wrong_default", ["columns", 4, "default"], "now()"),
        ("m252_wrong_identity", ["columns", 0, "identity"], "a"),
        ("m252_wrong_generated", ["columns", 0, "generated"], "s"),
        ("m252_wrong_pk_name", ["primary_key", "name"], "wrong_pkey"),
        ("m252_wrong_pk_column", ["primary_key", "columns"], ["wrong"]),
        ("m252_wrong_pk_deferrability", ["primary_key", "deferrable"], True),
        ("m252_wrong_unique_name", ["unique_index", "name"], "wrong_unique"),
        ("m252_wrong_unique_column", ["unique_index", "columns"], ["wrong"]),
        ("m252_wrong_unique_method", ["unique_index", "access_method"], "hash"),
        ("m252_wrong_unique_predicate", ["unique_index", "predicate"], "WHERE true"),
        ("m252_wrong_unique_validity", ["unique_index", "valid"], False),
        ("m252_wrong_unique_flag", ["unique_index", "unique"], False),
        ("m252_wrong_composite_index_name", ["composite_index", "name"], "wrong_idx"),
        ("m252_wrong_composite_index_column", ["composite_index", "columns"], ["wrong"]),
        ("m252_wrong_composite_column_order", ["composite_index", "columns"], ["membership_id", "organization_id", "created_at"]),
        ("m252_wrong_composite_method", ["composite_index", "access_method"], "hash"),
        ("m252_wrong_composite_predicate", ["composite_index", "predicate"], "WHERE true"),
        ("m252_wrong_org_fk_name", ["foreign_keys", 0, "name"], "wrong_fk"),
        ("m252_wrong_org_fk_source_column", ["foreign_keys", 0, "source_columns"], ["wrong"]),
        ("m252_wrong_org_fk_target_table", ["foreign_keys", 0, "target_table"], "wrong_table"),
        ("m252_wrong_org_fk_target_column", ["foreign_keys", 0, "target_columns"], ["wrong"]),
        ("m252_wrong_org_fk_match", ["foreign_keys", 0, "match_type"], "f"),
        ("m252_wrong_org_fk_on_update", ["foreign_keys", 0, "on_update"], "r"),
        ("m252_wrong_org_fk_on_delete", ["foreign_keys", 0, "on_delete"], "r"),
        ("m252_wrong_org_fk_deferrability", ["foreign_keys", 0, "deferrable"], True),
        ("m252_wrong_org_fk_validation", ["foreign_keys", 0, "validated"], False),
        ("m252_wrong_membership_fk_name", ["foreign_keys", 1, "name"], "wrong_fk"),
        ("m252_wrong_membership_fk_source_column", ["foreign_keys", 1, "source_columns"], ["wrong"]),
        ("m252_wrong_membership_fk_target_table", ["foreign_keys", 1, "target_table"], "wrong_table"),
        ("m252_wrong_membership_fk_target_column", ["foreign_keys", 1, "target_columns"], ["wrong"]),
        ("m252_wrong_membership_fk_match", ["foreign_keys", 1, "match_type"], "f"),
        ("m252_wrong_membership_fk_on_update", ["foreign_keys", 1, "on_update"], "r"),
        ("m252_wrong_membership_fk_on_delete", ["foreign_keys", 1, "on_delete"], "r"),
        ("m252_wrong_membership_fk_deferrability", ["foreign_keys", 1, "deferrable"], True),
        ("m252_wrong_membership_fk_validation", ["foreign_keys", 1, "validated"], False),
    ]
    for test_id, path, bad_value in cases:
        fixture = make_canonical_catalog_fixture()
        node = fixture
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = bad_value
        if test_id == "m252_missing_column":
            fixture["columns"] = bad_value
        result = compare_m252_exact(authority, fixture)
        _add(tests, test_id, "compare_m252_exact", "FAIL", not result["pass"], str(result["pass"]))

    extra = make_canonical_catalog_fixture()
    extra["unexpected_objects"] = [{"name": "extra_idx", "kind": "index"}]
    extra_fail = compare_m252_exact(authority, extra)
    _add(tests, "m252_unexpected_extra_object", "compare_m252_exact", "FAIL", not extra_fail["pass"], str(extra_fail["pass"]))

    extra_col = make_canonical_catalog_fixture()
    extra_col["columns"] = extra_col["columns"] + [{"ordinal": 99, "name": "extra_col", "format_type": "text", "nullable": True, "default": None, "identity": "", "generated": ""}]
    _add(tests, "m252_unexpected_column", "compare_m252_exact", "FAIL", not compare_m252_exact(authority, extra_col)["pass"], str(compare_m252_exact(authority, extra_col)["pass"]))


def run_diff_classifier_tests(tests: list) -> None:
    owners = build_owner_maps(schema_dump=SCHEMA_DUMP if SCHEMA_DUMP.exists() else None)

    m252_sql = f'ALTER INDEX "{M252_CANONICAL["UNIQUE"]}" RENAME TO "other";'
    stmt = ParsedStatement(1, [], [], m252_sql, [])
    parsed = resolve_owner_fields(stmt, owners)
    _add(tests, "diff_m252_alter_index_scope", "resolve_owner_fields", "OWNER_M252", parsed["owner_resolution"] == "OWNER_M252", parsed["owner_resolution"])

    unknown_sql = 'ALTER INDEX "totally_unknown_idx_xyz" RENAME TO "x";'
    stmt_u = ParsedStatement(2, [], [], unknown_sql, [])
    parsed_u = resolve_owner_fields(stmt_u, owners)
    classified_u = classify_operation_two_axis({**parsed_u, "ordinal": 2, "raw_sql": unknown_sql}, golden_fps=set(), golden_baseline_fps=set())
    _add(tests, "diff_unknown_owner_unresolved", "classify_operation_two_axis", "UNATTRIBUTED", classified_u["classification"] == "UNATTRIBUTED", classified_u["classification"])

    resembles = 'ALTER INDEX "org_role_asgn_drift_recon_apps_fake" RENAME TO "x";'
    stmt_r = ParsedStatement(3, [], [], resembles, [])
    parsed_r = resolve_owner_fields(stmt_r, owners)
    _add(tests, "diff_m252_name_outside_scope_not_m252", "resolve_owner_fields", "not OWNER_M252", parsed_r["owner_resolution"] != "OWNER_M252", parsed_r["owner_resolution"])

    r3b_idx = 'ALTER INDEX "vehicle_trips_start_time_idx" RENAME TO "x";'
    stmt_r3b = ParsedStatement(4, [], [], r3b_idx, [])
    parsed_r3b = resolve_owner_fields(stmt_r3b, owners)
    _add(tests, "diff_r3b_catalog_owner", "resolve_owner_fields", "OWNER_R3B", parsed_r3b["owner_resolution"] == "OWNER_R3B", parsed_r3b["owner_resolution"])

    golden_sql = 'ALTER TABLE "vehicle_trips" ALTER COLUMN "status" SET DATA TYPE TEXT;'
    golden_fp = operation_fingerprint({**resolve_owner_fields(ParsedStatement(5, [], [], golden_sql, []), owners), "raw_sql": golden_sql})
    drift = classify_operation_two_axis(
        {**resolve_owner_fields(ParsedStatement(6, [], [], golden_sql, []), owners), "ordinal": 6, "raw_sql": golden_sql, "classification": "R3B_SCOPE", "owner_resolution": "OWNER_R3B"},
        golden_fps={golden_fp},
        golden_baseline_fps={golden_fp},
    )
    _add(tests, "provenance_pre_existing_golden_match", "classify_operation_two_axis", "PRE_EXISTING_PRODUCTION_DRIFT", drift["classification"] == "PRE_EXISTING_PRODUCTION_DRIFT", drift["classification"])

    strategy_sql = f'CREATE TABLE "{M252_TABLE}" ("id" TEXT NOT NULL);'
    strategy_op = classify_operation_two_axis(
        {**resolve_owner_fields(ParsedStatement(7, [], [], strategy_sql, []), owners), "ordinal": 7, "raw_sql": strategy_sql, "classification": "OUT_OF_SCOPE", "owner_resolution": "OWNER_OUT_OF_SCOPE"},
        golden_fps=set(),
        golden_baseline_fps=set(),
    )
    _add(tests, "provenance_authorized_delta_explicit", "classify_operation_two_axis", "AUTHORIZED_STRATEGY_DELTA", strategy_op["classification"] == "AUTHORIZED_STRATEGY_DELTA", strategy_op["classification"])

    out_scope_drop = 'DROP INDEX "org_invoices_invoice_number_key";'
    out_scope_op = classify_operation_two_axis(
        {**resolve_owner_fields(ParsedStatement(8, [], [], out_scope_drop, []), owners), "ordinal": 8, "raw_sql": out_scope_drop, "classification": "OUT_OF_SCOPE", "owner_resolution": "OWNER_OUT_OF_SCOPE"},
        golden_fps=set(),
        golden_baseline_fps=set(),
    )
    _add(tests, "provenance_out_of_scope_no_golden_new_drift", "classify_operation_two_axis", "NEW_STRATEGY_DRIFT", out_scope_op["classification"] == "NEW_STRATEGY_DRIFT", out_scope_op["classification"])

    drift_op = classify_operation_two_axis(
        {**resolve_owner_fields(ParsedStatement(9, [], [], 'ALTER TABLE "vehicle_trips" ADD COLUMN "x" TEXT;', []), owners), "ordinal": 9, "raw_sql": 'ALTER TABLE "vehicle_trips" ADD COLUMN "x" TEXT;', "classification": "R3B_SCOPE", "owner_resolution": "OWNER_R3B"},
        golden_fps=set(),
        golden_baseline_fps=set(),
    )
    _add(tests, "diff_no_authority_new_strategy_drift", "classify_operation_two_axis", "NEW_STRATEGY_DRIFT", drift_op["classification"] == "NEW_STRATEGY_DRIFT", drift_op["classification"])

    catch_all = classify_operation_two_axis(
        {"ordinal": 10, "raw_sql": "SELECT 1;", "operation_family": "UNKNOWN", "owner_resolution": "OWNER_UNKNOWN", "classification": "UNRESOLVED"},
        golden_fps=set(),
        golden_baseline_fps=set(),
    )
    _add(tests, "provenance_unknown_unattributed", "classify_operation_two_axis", "UNATTRIBUTED", catch_all["classification"] == "UNATTRIBUTED", catch_all["classification"])


def run_terminal_gate_tests(tests: list) -> None:
    perfect = evaluate_terminal_acceptance(
        corrective_worktree_strict_empty=True,
        golden_tests_pass=True,
        golden_test_script_exit_zero=True,
        golden_coverage_complete=True,
        schema_unchanged=True,
        migrations_unchanged=True,
        repository_immutable=True,
        m252_exact_parity_pass=True,
        r3b_parity_pass=True,
        strategy_pass=True,
        second_deploy_pass=True,
        production_unchanged=True,
        attribution_pass=True,
        data_risk_unknown_zero=True,
        unknown_scope=0,
        unattributed=0,
        new_strategy_drift=0,
        r3b_scope=0,
        m252_scope=0,
        golden_failed=0,
    )
    _add(tests, "terminal_all_gates_pass", "evaluate_terminal_acceptance", "PASS", perfect["pass"], perfect["final_status"])

    fail_cases = [
        ("terminal_baseline_not_clean", {"corrective_worktree_strict_empty": False}),
        ("terminal_owner_unknown_fail", {"unknown_scope": 1}),
        ("terminal_unattributed_fail", {"unattributed": 1}),
        ("terminal_new_strategy_drift_fail", {"new_strategy_drift": 1}),
        ("terminal_r3b_scope_fail", {"r3b_scope": 1}),
        ("terminal_m252_scope_fail", {"m252_scope": 1}),
        ("terminal_m252_parity_fail", {"m252_exact_parity_pass": False}),
        ("terminal_golden_test_fail", {"golden_tests_pass": False, "golden_failed": 1}),
        ("terminal_second_deploy_new_row_fail", {"second_deploy_pass": False}),
        ("terminal_catalog_delta_fail", {"second_deploy_pass": False}),
        ("terminal_r3b_parity_fail", {"r3b_parity_pass": False}),
        ("terminal_production_changed_fail", {"production_unchanged": False}),
    ]
    base = dict(
        corrective_worktree_strict_empty=True,
        golden_tests_pass=True,
        golden_test_script_exit_zero=True,
        golden_coverage_complete=True,
        schema_unchanged=True,
        migrations_unchanged=True,
        repository_immutable=True,
        m252_exact_parity_pass=True,
        r3b_parity_pass=True,
        strategy_pass=True,
        second_deploy_pass=True,
        production_unchanged=True,
        attribution_pass=True,
        data_risk_unknown_zero=True,
        unknown_scope=0,
        unattributed=0,
        new_strategy_drift=0,
        r3b_scope=0,
        m252_scope=0,
        golden_failed=0,
    )
    for test_id, override in fail_cases:
        payload = copy.copy(base)
        payload.update(override)
        result = evaluate_terminal_acceptance(**payload)
        _add(tests, test_id, "evaluate_terminal_acceptance", "FAIL", not result["pass"], result["final_status"])


REQUIRED_TEST_IDS = [
    "m252_positive_control",
    "m252_wrong_table_name",
    "m252_missing_column",
    "m252_wrong_column_type",
    "m252_wrong_timestamp_precision",
    "m252_wrong_nullability",
    "m252_wrong_default",
    "m252_wrong_identity",
    "m252_wrong_generated",
    "m252_wrong_pk_name",
    "m252_wrong_pk_column",
    "m252_wrong_pk_deferrability",
    "m252_wrong_unique_name",
    "m252_wrong_unique_column",
    "m252_wrong_unique_method",
    "m252_wrong_unique_predicate",
    "m252_wrong_unique_validity",
    "m252_wrong_unique_flag",
    "m252_wrong_composite_index_name",
    "m252_wrong_composite_index_column",
    "m252_wrong_composite_column_order",
    "m252_wrong_composite_method",
    "m252_wrong_composite_predicate",
    "m252_wrong_org_fk_name",
    "m252_wrong_org_fk_source_column",
    "m252_wrong_org_fk_target_table",
    "m252_wrong_org_fk_target_column",
    "m252_wrong_org_fk_match",
    "m252_wrong_org_fk_on_update",
    "m252_wrong_org_fk_on_delete",
    "m252_wrong_org_fk_deferrability",
    "m252_wrong_org_fk_validation",
    "m252_wrong_membership_fk_name",
    "m252_wrong_membership_fk_source_column",
    "m252_wrong_membership_fk_target_table",
    "m252_wrong_membership_fk_target_column",
    "m252_wrong_membership_fk_match",
    "m252_wrong_membership_fk_on_update",
    "m252_wrong_membership_fk_on_delete",
    "m252_wrong_membership_fk_deferrability",
    "m252_wrong_membership_fk_validation",
    "m252_unexpected_extra_object",
    "m252_unexpected_column",
    "diff_m252_alter_index_scope",
    "diff_unknown_owner_unresolved",
    "diff_m252_name_outside_scope_not_m252",
    "diff_r3b_catalog_owner",
    "provenance_pre_existing_golden_match",
    "provenance_authorized_delta_explicit",
    "provenance_out_of_scope_no_golden_new_drift",
    "diff_no_authority_new_strategy_drift",
    "provenance_unknown_unattributed",
    "terminal_all_gates_pass",
    "terminal_baseline_not_clean",
    "terminal_owner_unknown_fail",
    "terminal_unattributed_fail",
    "terminal_new_strategy_drift_fail",
    "terminal_r3b_scope_fail",
    "terminal_m252_scope_fail",
    "terminal_m252_parity_fail",
    "terminal_golden_test_fail",
    "terminal_second_deploy_new_row_fail",
    "terminal_catalog_delta_fail",
    "terminal_r3b_parity_fail",
    "terminal_production_changed_fail",
]


def run_golden_tests() -> dict:
    tests: list[dict] = []
    run_m252_negative_tests(tests)
    run_diff_classifier_tests(tests)
    run_terminal_gate_tests(tests)

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
    coverage_complete = len(implemented) == len(REQUIRED_TEST_IDS) and all(r["implemented"] for r in coverage_rows)

    results = {
        "schema_version": 1,
        "phase": "CI-R3B1O.3",
        "required": len(REQUIRED_TEST_IDS),
        "implemented": len(implemented),
        "passed": passed,
        "failed": failed,
        "coverage_percent": round(100 * len(implemented) / len(REQUIRED_TEST_IDS), 2),
        "coverage_complete": coverage_complete,
        "strategy_contract_resolves": STRATEGY_CONTRACT["resolves"],
        "tests": tests,
        "pass": failed == 0 and coverage_complete,
    }
    (DATA / "ci-r3b1o3-corrective-golden-tests-2026-08.json").write_text(json.dumps(results, indent=2) + "\n")
    (DATA / "ci-r3b1o3-corrective-golden-coverage-2026-08.json").write_text(
        json.dumps({"schema_version": 1, "phase": "CI-R3B1O.3", "required_count": len(REQUIRED_TEST_IDS), "coverage_rows": coverage_rows, "coverage_complete": coverage_complete}, indent=2) + "\n"
    )
    return results


if __name__ == "__main__":
    raise SystemExit(0 if run_golden_tests()["pass"] else 1)
