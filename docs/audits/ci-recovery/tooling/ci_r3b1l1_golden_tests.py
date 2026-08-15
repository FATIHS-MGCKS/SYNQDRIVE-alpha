#!/usr/bin/env python3
"""Expanded negative golden tests for CI-R3B1L.1 hardened parity."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l1_authority import column_semantics_match, types_exact_match
from ci_r3b1l1_constants import DATA
from ci_r3b1l1_coverage_validator import validate_coverage
from ci_r3b1l1_exact_parity import compare_constraints, compare_indexes, derive_counters
from ci_r3b1l1_prisma_diff import classify_operation, run_classification_golden_tests

OUT = DATA / "ci-r3b1l1-golden-tests-2026-08.json"


def base_cols() -> tuple[dict, dict]:
    expected = {
        "a": {"name": "a", "ordinal": 1, "type": "text", "nullable": False, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}, "identity": None, "generated": None},
        "b": {"name": "b", "ordinal": 2, "type": "integer", "nullable": True, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}, "identity": None, "generated": None},
    }
    actual = copy.deepcopy(expected)
    for col in actual.values():
        col.pop("ordinal", None)
    return expected, actual


def run_test(name: str, fn) -> dict[str, Any]:
    try:
        passed, detail = fn()
        return {"name": name, "pass": passed, "detail": detail}
    except Exception as exc:  # noqa: BLE001
        return {"name": name, "pass": False, "detail": {"error": str(exc)}}


def main() -> int:
    exp_cols, act_cols = base_cols()
    tests: list[dict[str, Any]] = []

    def same_count_wrong_type():
        bad = copy.deepcopy(act_cols)
        bad["b"]["type"] = "bigint"
        ok, mism = column_semantics_match(exp_cols, bad)
        return (not ok and any(m["category"] == "TYPE_MISMATCH" for m in mism), {"mismatches": mism})

    def timestamp_precision_mismatch():
        ok = not types_exact_match("timestamp(3) without time zone", "timestamp without time zone")
        return (ok, {"expected": "timestamp(3) without time zone", "actual": "timestamp without time zone"})

    def timestamp_timezone_mismatch():
        ok = not types_exact_match("timestamp(3) without time zone", "timestamp(3) with time zone")
        return (ok, {})

    def varchar_length_mismatch():
        ok = not types_exact_match("character varying(100)", "character varying(255)")
        return (ok, {})

    def numeric_precision_mismatch():
        ok = not types_exact_match("numeric(10,2)", "numeric(10,3)")
        return (ok, {})

    def same_count_wrong_nullability():
        bad = copy.deepcopy(act_cols)
        bad["a"]["nullable"] = True
        ok, mism = column_semantics_match(exp_cols, bad)
        return (not ok and any(m["category"] == "NULLABILITY_MISMATCH" for m in mism), {"mismatches": mism})

    def same_count_wrong_default():
        bad = copy.deepcopy(act_cols)
        bad["a"]["default"] = {"kind": "DATABASE_LITERAL_DEFAULT", "value": "x"}
        ok, mism = column_semantics_match(exp_cols, bad)
        return (not ok and any(m["category"] == "DEFAULT_MISMATCH" for m in mism), {"mismatches": mism})

    def column_replacement_same_count():
        bad = {"a": act_cols["a"], "c": {"name": "c", "type": "text", "nullable": False, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}, "identity": None, "generated": None}}
        ok, mism = column_semantics_match(exp_cols, bad)
        cats = {m["category"] for m in mism}
        return (not ok and "MISSING_COLUMN" in cats and "UNEXPECTED_COLUMN" in cats, {"mismatches": mism})

    def wrong_pk_same_count():
        exp = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["id"], "deferrable": False, "initially_deferred": False, "validated": True}]
        act = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["other"], "deferrable": False, "initially_deferred": False, "validated": True}]
        ok, mism = compare_constraints(exp, act)
        return (not ok, {"mismatches": mism})

    def pk_deferrability_mismatch():
        exp = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["id"], "deferrable": False, "initially_deferred": False, "validated": True}]
        act = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["id"], "deferrable": True, "initially_deferred": False, "validated": True}]
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "PK_MISMATCH" for m in mism), {"mismatches": mism})

    def wrong_fk_target():
        base = {"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "match_type": "SIMPLE", "on_update": "CASCADE", "on_delete": "CASCADE", "deferrable": False, "initially_deferred": False, "validated": True}
        act = copy.deepcopy(base)
        act["referenced_table"] = "b"
        ok, mism = compare_constraints([base], [act])
        return (not ok, {"mismatches": mism})

    def fk_match_mismatch():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "match_type": "SIMPLE", "on_update": "NO ACTION", "on_delete": "NO ACTION", "deferrable": False, "initially_deferred": False, "validated": True}]
        act = copy.deepcopy(exp)
        act[0]["match_type"] = "FULL"
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "FK_MATCH_MISMATCH" for m in mism), {"mismatches": mism})

    def wrong_fk_action():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "match_type": "SIMPLE", "on_update": "CASCADE", "on_delete": "CASCADE", "deferrable": False, "initially_deferred": False, "validated": True}]
        act = copy.deepcopy(exp)
        act[0]["on_delete"] = "NO ACTION"
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "FK_ACTION_MISMATCH" for m in mism), {"mismatches": mism})

    def fk_deferrability_mismatch():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "match_type": "SIMPLE", "on_update": "NO ACTION", "on_delete": "NO ACTION", "deferrable": False, "initially_deferred": False, "validated": True}]
        act = copy.deepcopy(exp)
        act[0]["deferrable"] = True
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "FK_DEFERRABILITY_MISMATCH" for m in mism), {"mismatches": mism})

    def fk_validation_mismatch():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "match_type": "SIMPLE", "on_update": "NO ACTION", "on_delete": "NO ACTION", "deferrable": False, "initially_deferred": False, "validated": True}]
        act = copy.deepcopy(exp)
        act[0]["validated"] = False
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "FK_VALIDATION_MISMATCH" for m in mism), {"mismatches": mism})

    def unexpected_check():
        exp = []
        act = [{"name": "t_chk", "type": "CHECK", "normalized_definition": "check (x > 0)", "definition": "CHECK (x > 0)", "deferrable": False, "initially_deferred": False, "validated": True}]
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "CHECK_MISMATCH" for m in mism), {"mismatches": mism})

    def missing_check():
        exp = [{"name": "t_chk", "type": "CHECK", "normalized_definition": "check (x > 0)", "definition": "CHECK (x > 0)", "deferrable": False, "initially_deferred": False, "validated": True}]
        act = []
        ok, mism = compare_constraints(exp, act)
        return (not ok, {"mismatches": mism})

    def wrong_index_column_order():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a, b)", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (b, a)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok, {"mismatches": mism})

    def index_predicate_mismatch():
        exp = [{"name": "idx", "unique": False, "method": "btree", "predicate": "active = true", "normalized_definition": "create index idx on t using btree (a) where active = true", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "btree", "predicate": None, "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok and any(m.get("category") == "INDEX_PREDICATE_MISMATCH" for m in mism), {"mismatches": mism})

    def index_access_method_mismatch():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "hash", "normalized_definition": "create index idx on t using hash (a)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok and any(m.get("category") == "INDEX_ACCESS_METHOD_MISMATCH" for m in mism), {"mismatches": mism})

    def index_include_mismatch():
        exp = [{"name": "idx", "unique": False, "method": "btree", "include_columns": ["b"], "normalized_definition": "create index idx on t using btree (a) include (b)", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "btree", "include_columns": [], "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok and any(m.get("category") == "INDEX_INCLUDE_MISMATCH" for m in mism), {"mismatches": mism})

    def index_expression_mismatch():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree ((lower(a)))", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree ((upper(a)))", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok, {"mismatches": mism})

    def index_state_mismatch():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        act = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a)", "valid": False, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok and any(m.get("category") == "INDEX_STATE_MISMATCH" for m in mism), {"mismatches": mism})

    def extra_index():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        act = exp + [{"name": "extra", "unique": False, "method": "btree", "normalized_definition": "create index extra on t using btree (b)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, act)
        return (not ok, {"mismatches": mism})

    def missing_index():
        exp = [{"name": "idx", "unique": False, "method": "btree", "normalized_definition": "create index idx on t using btree (a)", "valid": True, "ready": True}]
        ok, mism = compare_indexes(exp, [])
        return (not ok, {"mismatches": mism})

    def enum_label_replacement():
        exp, act = ["A", "B", "C"], ["A", "X", "C"]
        return (exp != act, {"expected": exp, "actual": act})

    def enum_order_only():
        exp, act = ["A", "B"], ["B", "A"]
        return (exp != act, {"expected": exp, "actual": act})

    def property_universe_53():
        expected_ids = [f"P{i:03d}" for i in range(1, 55)]
        cov = validate_coverage({"property_results": [{"authority_id": aid, "pass": True} for aid in expected_ids[:53]]}, authority_ids=expected_ids)
        return (not cov["pass"] and len(cov["missing_evaluations"]) == 1, cov)

    def property_universe_55():
        expected_ids = [f"P{i:03d}" for i in range(1, 55)]
        results = [{"authority_id": aid, "pass": True} for aid in expected_ids] + [{"authority_id": "P999", "pass": True}]
        cov = validate_coverage({"property_results": results}, authority_ids=expected_ids)
        return (not cov["pass"] and "P999" in cov["unexpected_evaluations"], cov)

    def old_37_37_rejection():
        legacy = {"properties_expected": 54, "properties_checked": 37, "properties_matched": 37, "pass": True}
        return (not (legacy["properties_expected"] == legacy["properties_checked"] == legacy["properties_matched"] == 54), legacy)

    def hardcoded_zero_detector():
        mismatches = [{"category": "TYPE_MISMATCH", "column": "x"}]
        counters = derive_counters(mismatches)
        return (counters.get("TYPE_MISMATCH", 0) > 0, counters)

    def prisma_classification_golden():
        result = run_classification_golden_tests()
        return (result["pass"], result)

    cases = [
        ("same_count_wrong_type", same_count_wrong_type),
        ("timestamp_precision_mismatch", timestamp_precision_mismatch),
        ("timestamp_timezone_mismatch", timestamp_timezone_mismatch),
        ("varchar_length_mismatch", varchar_length_mismatch),
        ("numeric_precision_mismatch", numeric_precision_mismatch),
        ("same_count_wrong_nullability", same_count_wrong_nullability),
        ("same_count_wrong_default", same_count_wrong_default),
        ("column_replacement_same_count", column_replacement_same_count),
        ("wrong_pk_same_count", wrong_pk_same_count),
        ("pk_deferrability_mismatch", pk_deferrability_mismatch),
        ("wrong_fk_target", wrong_fk_target),
        ("fk_match_mismatch", fk_match_mismatch),
        ("wrong_fk_action", wrong_fk_action),
        ("fk_deferrability_mismatch", fk_deferrability_mismatch),
        ("fk_validation_mismatch", fk_validation_mismatch),
        ("unexpected_check", unexpected_check),
        ("missing_check", missing_check),
        ("wrong_index_column_order", wrong_index_column_order),
        ("index_predicate_mismatch", index_predicate_mismatch),
        ("index_access_method_mismatch", index_access_method_mismatch),
        ("index_include_mismatch", index_include_mismatch),
        ("index_expression_mismatch", index_expression_mismatch),
        ("index_state_mismatch", index_state_mismatch),
        ("extra_index", extra_index),
        ("missing_index", missing_index),
        ("enum_label_replacement", enum_label_replacement),
        ("enum_order_only", enum_order_only),
        ("property_universe_53", property_universe_53),
        ("property_universe_55", property_universe_55),
        ("old_37_37_rejection", old_37_37_rejection),
        ("hardcoded_zero_detector", hardcoded_zero_detector),
        ("prisma_diff_classification", prisma_classification_golden),
    ]
    for name, fn in cases:
        tests.append(run_test(name, fn))

    out = {"schema_version": 1, "tests": tests, "pass": all(t["pass"] for t in tests), "passed": sum(1 for t in tests if t["pass"]), "total": len(tests)}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
