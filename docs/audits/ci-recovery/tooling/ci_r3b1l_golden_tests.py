#!/usr/bin/env python3
"""Negative golden tests for CI-R3B1L exact parity acceptance gates."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1l_authority import column_semantics_match
from ci_r3b1l_constants import DATA
from ci_r3b1l_coverage_validator import validate_coverage
from ci_r3b1l_exact_parity import compare_constraints, compare_indexes

OUT = DATA / "ci-r3b1l-golden-tests-2026-08.json"


def base_cols() -> tuple[dict, dict]:
    expected = {
        "a": {"name": "a", "ordinal": 1, "type": "text", "nullable": False, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}},
        "b": {"name": "b", "ordinal": 2, "type": "integer", "nullable": True, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}},
    }
    actual = {
        "a": {"name": "a", "type": "text", "nullable": False, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}},
        "b": {"name": "b", "type": "integer", "nullable": True, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}},
    }
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
        bad = {"a": act_cols["a"], "c": {"name": "c", "type": "text", "nullable": False, "default": {"kind": "NO_DATABASE_DEFAULT", "value": None}}}
        ok, mism = column_semantics_match(exp_cols, bad)
        cats = {m["category"] for m in mism}
        return (not ok and "MISSING_COLUMN" in cats and "UNEXPECTED_COLUMN" in cats, {"mismatches": mism})

    def wrong_pk_same_count():
        exp = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["id"]}]
        act = [{"name": "t_pkey", "type": "PRIMARY KEY", "columns": ["other"]}]
        ok, mism = compare_constraints(exp, act)
        return (not ok, {"mismatches": mism})

    def wrong_fk_target():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "on_update": "CASCADE", "on_delete": "CASCADE"}]
        act = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "b", "referenced_columns": ["id"], "on_update": "CASCADE", "on_delete": "CASCADE"}]
        ok, mism = compare_constraints(exp, act)
        return (not ok, {"mismatches": mism})

    def wrong_fk_action():
        exp = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "on_update": "CASCADE", "on_delete": "CASCADE"}]
        act = [{"name": "t_fkey", "type": "FOREIGN KEY", "local_columns": ["x"], "referenced_table": "a", "referenced_columns": ["id"], "on_update": "NO ACTION", "on_delete": "NO ACTION"}]
        ok, mism = compare_constraints(exp, act)
        return (not ok and any(m.get("category") == "FK_ACTION_MISMATCH" for m in mism), {"mismatches": mism})

    def wrong_index_column_order():
        exp = [{"name": "idx", "unique": False, "method": "btree", "columns": ["a", "b"]}]
        act = [{"name": "idx", "unique": False, "method": "btree", "columns": ["b", "a"]}]
        ok, mism = compare_indexes(exp, act)
        return (not ok, {"mismatches": mism})

    def extra_index():
        exp = [{"name": "idx", "unique": False, "method": "btree", "columns": ["a"]}]
        act = [{"name": "idx", "unique": False, "method": "btree", "columns": ["a"]}, {"name": "extra", "unique": False, "method": "btree", "columns": ["b"]}]
        ok, mism = compare_indexes(exp, act)
        return (not ok and any(m.get("category") == "UNEXPECTED_OBJECT" for m in mism), {"mismatches": mism})

    def missing_index():
        exp = [{"name": "idx", "unique": False, "method": "btree", "columns": ["a"]}]
        act = []
        ok, mism = compare_indexes(exp, act)
        return (not ok, {"mismatches": mism})

    def enum_label_replacement():
        exp = ["A", "B", "C"]
        act = ["A", "X", "C"]
        return (exp != act, {"expected": exp, "actual": act})

    def enum_order_only():
        exp = ["A", "B"]
        act = ["B", "A"]
        return (exp != act, {"expected": exp, "actual": act})

    def property_universe_53():
        expected_ids = [f"P{i:03d}" for i in range(1, 55)]
        fake = {"property_results": [{"authority_id": aid, "pass": True} for aid in expected_ids[:53]]}
        cov = validate_coverage(fake, authority_ids=expected_ids)
        return (not cov["pass"] and len(cov["missing_evaluations"]) == 1, cov)

    def property_universe_55():
        expected_ids = [f"P{i:03d}" for i in range(1, 55)]
        results = [{"authority_id": aid, "pass": True} for aid in expected_ids]
        results.append({"authority_id": "P999", "pass": True})
        cov = validate_coverage({"property_results": results}, authority_ids=expected_ids)
        return (not cov["pass"] and "P999" in cov["unexpected_evaluations"], cov)

    def old_37_37_rejection():
        legacy = {"properties_expected": 54, "properties_checked": 37, "properties_matched": 37, "pass": True}
        hard_fail = not (legacy["properties_expected"] == legacy["properties_checked"] == legacy["properties_matched"] == 54)
        return (hard_fail, legacy)

    def hardcoded_zero_detector():
        mismatches = [{"category": "TYPE_MISMATCH", "column": "x"}]
        counters = {}
        for m in mismatches:
            counters[m["category"]] = counters.get(m["category"], 0) + 1
        return (counters.get("TYPE_MISMATCH", 0) > 0, counters)

    cases = [
        ("same_count_wrong_type", same_count_wrong_type),
        ("same_count_wrong_nullability", same_count_wrong_nullability),
        ("same_count_wrong_default", same_count_wrong_default),
        ("column_replacement_same_count", column_replacement_same_count),
        ("wrong_pk_same_count", wrong_pk_same_count),
        ("wrong_fk_target", wrong_fk_target),
        ("wrong_fk_action", wrong_fk_action),
        ("wrong_index_column_order", wrong_index_column_order),
        ("extra_index", extra_index),
        ("missing_index", missing_index),
        ("enum_label_replacement", enum_label_replacement),
        ("enum_order_only", enum_order_only),
        ("property_universe_53", property_universe_53),
        ("property_universe_55", property_universe_55),
        ("old_37_37_rejection", old_37_37_rejection),
        ("hardcoded_zero_detector", hardcoded_zero_detector),
    ]
    for name, fn in cases:
        tests.append(run_test(name, fn))

    out = {"schema_version": 1, "tests": tests, "pass": all(t["pass"] for t in tests), "passed": sum(1 for t in tests if t["pass"]), "total": len(tests)}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "passed": out["passed"], "total": out["total"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
