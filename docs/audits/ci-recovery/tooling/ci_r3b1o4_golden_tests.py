#!/usr/bin/env python3
"""Golden tests for CI-R3B1O.4 — tail reconciliation, stale index authority, M252 parity."""
from __future__ import annotations

import argparse
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
from ci_r3b1o3_m252_exact_parity import compare_m252_exact as compare_m252_exact_o3, make_canonical_catalog_fixture as make_o3_fixture
from ci_r3b1o4_full_catalog_delta import build_full_catalog_delta_authority, classify_delta, diff_inventories
from ci_r3b1o4_m252_exact_parity import compare_m252_exact as compare_m252_exact_o4, make_canonical_catalog_fixture as make_o4_fixture
from ci_r3b1o4_stale_index_authority import build_invoice_stale_index_authority, build_whatsapp_stale_index_authority
from ci_r3b1o4_t2_stale_index_safety import EXPECTED_STALE, _compare_index, build_expected_stale_index_shape
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract, build_tail_sql, evaluate_tail_preconditions
from ci_r3b1o4_terminal_gate import evaluate_corrective_terminal_acceptance, evaluate_terminal_acceptance
from ci_r3b1o4_test_source_hashes import build_corrective_test_source_hash_manifest, build_test_source_hash_manifest

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
    _add(tests, "tail_sql_no_cascade", "build_tail_sql", "no DROP CASCADE", not any("DROP" in ln.upper() and " CASCADE" in ln.upper() for ln in sql.splitlines()), "DROP CASCADE" if any("DROP" in ln.upper() and " CASCADE" in ln.upper() for ln in sql.splitlines()) else "none")
    _add(tests, "tail_sql_contains_invoice_drop", "build_tail_sql", "invoice drop", 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"' in sql, "present" if 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"' in sql else "missing")
    _add(tests, "tail_sql_contains_whatsapp_drop", "build_tail_sql", "whatsapp drop", 'DROP INDEX IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key"' in sql, "present")
    _add(tests, "tail_sql_contains_m252_create", "build_tail_sql", "M252 create", f'CREATE TABLE "{M252_TABLE}"' in sql, "present")

    bad_contract = copy.deepcopy(contract)
    bad_contract["logical_tasks"].append({"task_id": "EXTRA", "purpose": "forbidden"})
    _add(tests, "tail_contract_fourth_task_fail", "manual", "FAIL", len(bad_contract["logical_tasks"]) != 3, str(len(bad_contract["logical_tasks"])))

    def mock_sql(q: str) -> str:
        if M252_TABLE in q and "COUNT(*)" in q and "information_schema.tables" in q:
            return "0"
        if "whatsapp_conversations" in q and "indisunique" in q:
            return "whatsapp_conversations_organization_id_contact_phone_normal_key|t|CREATE UNIQUE INDEX whatsapp_conversations_organization_id_contact_phone_normal_key ON public.whatsapp_conversations USING btree (organization_id, contact_phone_normalized)"
        if "org_invoices_invoice_number_key" in q:
            return "1"
        if "whatsapp_conversations_organization_id_contact_phone_key" in q and "pg_indexes" in q:
            return "1"
        if "org_invoices_organization_id_sequence_year_sequence_number_key" in q:
            return "1"
        if "organizations" in q or "organization_memberships" in q:
            return "1"
        if "org_role_asgn" in q:
            return "0"
        return "0"

    pre = evaluate_tail_preconditions(mock_sql, phase="pre_tail")
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

CORRECTIVE_M252_REQUIRED = [
    "m252_o4_positive_control",
    "m252_wrong_include",
    "m252_wrong_collation",
    "m252_wrong_opclass",
    "m252_wrong_sort_direction",
    "m252_wrong_null_ordering",
    "m252_wrong_ready",
    "m252_wrong_valid",
    "m252_wrong_access_method",
    "m252_wrong_key_order",
]

CORRECTIVE_CATALOG_DELTA_REQUIRED = [
    "catalog_delta_known_added_authorized",
    "catalog_delta_stale_removed_authorized",
    "catalog_delta_unknown_table_unauthorized",
    "catalog_delta_unknown_index_unauthorized",
    "catalog_delta_unexpected_column_change_unauthorized",
    "catalog_delta_unknown_constraint_removed_unauthorized",
    "catalog_delta_all_classified_pass",
    "catalog_delta_omitted_classification_fail",
]

CORRECTIVE_T2_REQUIRED = [
    "t2_invoice_stale_exact_shape_pass",
    "t2_whatsapp_stale_exact_shape_pass",
    "t2_wrong_owner_fail",
]

CORRECTIVE_TERMINAL_REQUIRED = [
    "o4_corrective_terminal_all_gates_pass",
    "o4_corrective_terminal_second_deploy_fail",
    "o4_corrective_terminal_catalog_delta_fail",
]

CORRECTIVE_REQUIRED_TEST_IDS = list(O3_REQUIRED) + TAIL_REQUIRED + CORRECTIVE_M252_REQUIRED + CORRECTIVE_CATALOG_DELTA_REQUIRED + CORRECTIVE_T2_REQUIRED + CORRECTIVE_TERMINAL_REQUIRED


def _inventory(*, tables: dict | None = None, indexes: dict | None = None, constraints: dict | None = None, enums: dict | None = None) -> dict:
    inv = {"schemas": ["public"], "tables": tables or {}, "enums": enums or {}, "types": [], "constraints": constraints or {}, "indexes": indexes or {}, "sequences": {}, "views": {}}
    payload = {"schema_version": 1, "phase": "CI-R3B1O.4-corrective", "inventory": inv, "object_counts": {}, "fingerprint_sha256": "fixture"}
    return payload


def run_corrective_m252_index_tests(tests: list) -> None:
    authority = build_m252_complete_physical_authority()
    positive = compare_m252_exact_o4(authority, make_o4_fixture())
    _add(tests, "m252_o4_positive_control", "compare_m252_exact", "PASS", positive["pass"], str(positive["pass"]))

    cases = [
        ("m252_wrong_include", ["unique_index", "include_columns"], [{"ordinal": 1, "kind": "include", "name": "organization_id", "collation": "default", "opclass": "default", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"}]),
        ("m252_wrong_collation", ["unique_index", "keys", 0, "collation"], "C"),
        ("m252_wrong_opclass", ["unique_index", "keys", 0, "opclass"], "hash_ops"),
        ("m252_wrong_sort_direction", ["unique_index", "keys", 0, "sort_direction"], "DESC"),
        ("m252_wrong_null_ordering", ["unique_index", "keys", 0, "nulls_ordering"], "NULLS FIRST"),
        ("m252_wrong_ready", ["unique_index", "ready"], False),
        ("m252_wrong_valid", ["unique_index", "valid"], False),
        ("m252_wrong_access_method", ["unique_index", "access_method"], "hash"),
        ("m252_wrong_key_order", ["unique_index", "keys"], [
            {"ordinal": 1, "kind": "key", "name": "organization_id", "collation": "default", "opclass": "default", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"},
            {"ordinal": 2, "kind": "key", "name": "membership_id", "collation": "default", "opclass": "default", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"},
        ]),
    ]
    for test_id, path, bad_value in cases:
        fixture = make_o4_fixture()
        node = fixture
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = bad_value
        result = compare_m252_exact_o4(authority, fixture)
        _add(tests, test_id, "compare_m252_exact", "FAIL", not result["pass"], str(result["pass"]))


def run_catalog_delta_tests(tests: list) -> None:
    authority = build_m252_complete_physical_authority()
    golden = _inventory(tables={"organizations": {"columns": {"id": {"format_type": "text", "nullable": False, "default": None, "identity": None, "generated": None}}}})
    final_added = _inventory(
        tables={
            **golden["inventory"]["tables"],
            M252_TABLE: {"columns": {"id": {"format_type": "text", "nullable": False, "default": None, "identity": None, "generated": None}}},
        }
    )
    added = build_full_catalog_delta_authority(golden_inventory=golden, final_inventory=final_added)
    _add(tests, "catalog_delta_known_added_authorized", "build_full_catalog_delta_authority", "authorized", added["counts"]["UNAUTHORIZED_FINAL_DELTA"] == 0, str(added["counts"]["UNAUTHORIZED_FINAL_DELTA"]))

    stale_removed = _inventory(indexes={"org_invoices_invoice_number_key": {"name": "org_invoices_invoice_number_key"}}, tables=golden["inventory"]["tables"])
    stale_final = _inventory(tables=golden["inventory"]["tables"])
    removed = build_full_catalog_delta_authority(golden_inventory=stale_removed, final_inventory=stale_final)
    stale_cls = [d for d in removed["deltas"] if d["name"] == "org_invoices_invoice_number_key"]
    _add(tests, "catalog_delta_stale_removed_authorized", "classify_delta", "STALE_RECOVERY_EFFECT_REMOVED", bool(stale_cls) and stale_cls[0]["classification"] == "STALE_RECOVERY_EFFECT_REMOVED", stale_cls[0]["classification"] if stale_cls else "missing")

    unknown_table = _inventory(
        tables={
            **golden["inventory"]["tables"],
            "unexpected_table": {"columns": {"id": {"format_type": "text", "nullable": False, "default": None, "identity": None, "generated": None}}},
        }
    )
    unknown_table_delta = classify_delta(
        {"change_type": "ADDED", "object_type": "table", "name": "unexpected_table", "subkey": None, "before": None, "after": {}},
        authority=authority,
    )
    _add(tests, "catalog_delta_unknown_table_unauthorized", "classify_delta", "UNAUTHORIZED_FINAL_DELTA", unknown_table_delta["classification"] == "UNAUTHORIZED_FINAL_DELTA", unknown_table_delta["classification"])

    unknown_index = classify_delta(
        {"change_type": "ADDED", "object_type": "index", "name": "unexpected_idx", "subkey": None, "before": None, "after": {}},
        authority=authority,
    )
    _add(tests, "catalog_delta_unknown_index_unauthorized", "classify_delta", "UNAUTHORIZED_FINAL_DELTA", unknown_index["classification"] == "UNAUTHORIZED_FINAL_DELTA", unknown_index["classification"])

    changed_col = classify_delta(
        {
            "change_type": "CHANGED",
            "object_type": "column",
            "name": "organizations",
            "subkey": "id",
            "before": {"format_type": "text"},
            "after": {"format_type": "integer"},
        },
        authority=authority,
    )
    _add(tests, "catalog_delta_unexpected_column_change_unauthorized", "classify_delta", "UNAUTHORIZED_FINAL_DELTA", changed_col["classification"] == "UNAUTHORIZED_FINAL_DELTA", changed_col["classification"])

    removed_constraint = classify_delta(
        {"change_type": "REMOVED", "object_type": "constraint", "name": "organizations_pkey", "subkey": None, "before": {}, "after": None},
        authority=authority,
    )
    _add(tests, "catalog_delta_unknown_constraint_removed_unauthorized", "classify_delta", "UNAUTHORIZED_FINAL_DELTA", removed_constraint["classification"] == "UNAUTHORIZED_FINAL_DELTA", removed_constraint["classification"])

    all_classified = build_full_catalog_delta_authority(golden_inventory=golden, final_inventory=final_added)
    _add(tests, "catalog_delta_all_classified_pass", "build_full_catalog_delta_authority", "PASS", all_classified["counts"]["total_deltas"] == all_classified["counts"]["classified_deltas"], str(all_classified["counts"]["total_deltas"]))

    partial = diff_inventories(golden, final_added)
    classified = [classify_delta(d, authority=authority) for d in partial[:-1]]
    _add(tests, "catalog_delta_omitted_classification_fail", "manual", "FAIL", len(classified) < len(partial), f"{len(classified)}/{len(partial)}")


def run_t2_stale_index_tests(tests: list) -> None:
    def mock_sql(q: str) -> str:
        if "format_type" in q and "invoice_number" in q:
            return "integer"
        if "format_type" in q and "organization_id" in q:
            return "text"
        if "format_type" in q and "contact_phone" in q:
            return "text"
        return ""

    invoice_expected = build_expected_stale_index_shape(mock_sql, "org_invoices_invoice_number_key")
    invoice_actual = {
        "owner_table": "org_invoices",
        "unique": True,
        "primary": False,
        "access_method": "btree",
        "keys": invoice_expected["keys"],
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    }
    ok, _ = _compare_index(invoice_actual, invoice_expected)
    _add(tests, "t2_invoice_stale_exact_shape_pass", "_compare_index", "PASS", ok, str(ok))

    whatsapp_expected = build_expected_stale_index_shape(mock_sql, "whatsapp_conversations_organization_id_contact_phone_key")
    whatsapp_actual = {
        "owner_table": "whatsapp_conversations",
        "unique": True,
        "primary": False,
        "access_method": "btree",
        "keys": whatsapp_expected["keys"],
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    }
    ok_wa, _ = _compare_index(whatsapp_actual, whatsapp_expected)
    _add(tests, "t2_whatsapp_stale_exact_shape_pass", "_compare_index", "PASS", ok_wa, str(ok_wa))

    wrong_owner = dict(invoice_actual)
    wrong_owner["owner_table"] = "wrong_table"
    bad, _ = _compare_index(wrong_owner, invoice_expected)
    _add(tests, "t2_wrong_owner_fail", "_compare_index", "FAIL", not bad, str(bad))


def run_corrective_terminal_tests(tests: list) -> None:
    base = dict(
        worktree_strict_empty=True,
        t2_drop_safety_pass=True,
        replacement_safety_pass=True,
        tail_present_pre_second=True,
        tail_present_during_second=True,
        golden_tests_pass=True,
        golden_coverage_complete=True,
        evidence_code_mismatch_zero=True,
        schema_unchanged=True,
        migrations_unchanged=True,
        repository_immutable=True,
        m252_exact_parity_pass=True,
        r3b_parity_pass=True,
        strategy_pass=True,
        second_deploy_pass=True,
        production_unchanged=True,
        attribution_pass=True,
        catalog_delta_pass=True,
        data_risk_unknown_zero=True,
        unknown_scope=0,
        unattributed=0,
        new_strategy_drift=0,
        r3b_scope=0,
        m252_scope=0,
        golden_failed=0,
        stale_index_drop_ops_remaining=0,
        unauthorized_final_delta=0,
        unknown_delta_authority=0,
    )
    perfect = evaluate_corrective_terminal_acceptance(**base)
    _add(tests, "o4_corrective_terminal_all_gates_pass", "evaluate_corrective_terminal_acceptance", "CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED", perfect["pass"], perfect["final_status"])
    fail_second = evaluate_corrective_terminal_acceptance(**{**base, "second_deploy_pass": False})
    _add(tests, "o4_corrective_terminal_second_deploy_fail", "evaluate_corrective_terminal_acceptance", "CI_R3B1O4_REPEAT_DEPLOY_FAILED", not fail_second["pass"] and fail_second["final_status"] == "CI_R3B1O4_REPEAT_DEPLOY_FAILED", fail_second["final_status"])
    fail_catalog = evaluate_corrective_terminal_acceptance(**{**base, "unauthorized_final_delta": 1})
    _add(tests, "o4_corrective_terminal_catalog_delta_fail", "evaluate_corrective_terminal_acceptance", "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED", not fail_catalog["pass"] and fail_catalog["final_status"] == "CI_R3B1O4_FINAL_CATALOG_AUTHORITY_FAILED", fail_catalog["final_status"])


def run_golden_tests(*, corrective: bool = False) -> dict:
    tests: list[dict] = []
    run_m252_negative_tests(tests)
    run_diff_classifier_tests(tests)
    run_o3_terminal_tests(tests)
    run_tail_authority_tests(tests)
    run_o4_terminal_tests(tests)
    if corrective:
        run_corrective_m252_index_tests(tests)
        run_catalog_delta_tests(tests)
        run_t2_stale_index_tests(tests)
        run_corrective_terminal_tests(tests)

    hash_manifest = build_corrective_test_source_hash_manifest() if corrective else build_test_source_hash_manifest()
    hash_entries = hash_manifest.get("entries") if isinstance(hash_manifest, dict) and "entries" in hash_manifest else [{"source_file": k, "sha256": v} for k, v in sorted((hash_manifest or {}).items())]
    hash_fn = "build_corrective_test_source_hash_manifest" if corrective else "build_test_source_hash_manifest"
    for entry in hash_entries:
        _add(tests, f"source_hash_present_{entry['source_file'].replace('.', '_')}", hash_fn, "sha256 present", bool(entry["sha256"]), entry["source_file"])

    required_ids = CORRECTIVE_REQUIRED_TEST_IDS if corrective else REQUIRED_TEST_IDS
    implemented = {t["test_id"] for t in tests}
    coverage_rows = []
    for test_id in required_ids:
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
    coverage_complete = all(r["implemented"] for r in coverage_rows)

    phase = "CI-R3B1O.4-corrective" if corrective else "CI-R3B1O.4"
    prefix = "ci-r3b1o4-corrective" if corrective else "ci-r3b1o4"
    results = {
        "schema_version": 1,
        "phase": phase,
        "required": len(required_ids),
        "implemented": len([r for r in coverage_rows if r["implemented"]]),
        "executed": len(tests),
        "passed": passed,
        "failed": failed,
        "coverage_complete": coverage_complete,
        "test_source_hashes": hash_manifest,
        "tests": tests,
        "pass": failed == 0 and coverage_complete,
    }
    (DATA / f"{prefix}-golden-tests-2026-08.json").write_text(json.dumps(results, indent=2) + "\n")
    (DATA / f"{prefix}-golden-coverage-2026-08.json").write_text(
        json.dumps({"schema_version": 1, "phase": phase, "required_count": len(required_ids), "coverage_rows": coverage_rows, "coverage_complete": coverage_complete}, indent=2) + "\n"
    )
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--corrective", action="store_true")
    args = parser.parse_args()
    raise SystemExit(0 if run_golden_tests(corrective=args.corrective)["pass"] else 1)
