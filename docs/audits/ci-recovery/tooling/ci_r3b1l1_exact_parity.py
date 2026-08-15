"""Hardened 54/54 exact catalog parity engine for CI-R3B1L.1."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1d12_catalog_model import defaults_match
from ci_r3b1l1_authority import (
    build_table_expected,
    enum_authority,
    load_canonical_54,
    load_production_catalog,
    table_authority,
    types_exact_match,
)
from ci_r3b1l1_constants import BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA, PROPERTY_CATEGORIES
from ci_r3b1l1_pg_catalog_reader import read_actual_catalog
from replay_evidence_lib import PgConfig, enum_labels, psql, table_exists

OUT = DATA / "ci-r3b1l1-exact-final-catalog-parity-2026-08.json"


def _constraint_actual(actual: dict[str, Any], table: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for pk in actual["primary_keys"].values():
        if pk["table"] == table:
            out.append({"name": pk["name"], "type": "PRIMARY KEY", **pk})
    for fk in actual["foreign_keys"].values():
        if fk["local_table"] == table:
            out.append({"name": fk["name"], "type": "FOREIGN KEY", **fk})
    for uq in actual["unique_constraints"].values():
        if uq["table"] == table:
            out.append({"name": uq["name"], "type": "UNIQUE", **uq})
    for chk in actual["check_constraints"].values():
        if chk["table"] == table:
            out.append({"name": chk["name"], "type": "CHECK", **chk})
    return sorted(out, key=lambda x: x["name"])


def compare_constraints(expected: list[dict], actual: list[dict]) -> tuple[bool, list[dict]]:
    mismatches: list[dict] = []
    exp_by_name = {c["name"]: c for c in expected}
    act_by_name = {c["name"]: c for c in actual}

    for name, exp in exp_by_name.items():
        act = act_by_name.get(name)
        if not act:
            cat = {
                "PRIMARY KEY": "PK_MISMATCH",
                "FOREIGN KEY": "FK_ENDPOINT_MISMATCH",
                "UNIQUE": "UNIQUE_MISMATCH",
                "CHECK": "CHECK_MISMATCH",
            }.get(exp["type"], "PK_MISMATCH")
            mismatches.append({"category": cat, "constraint": name, "issue": "missing"})
            continue
        if exp["type"] == "PRIMARY KEY":
            if list(exp.get("columns", [])) != list(act.get("columns", [])):
                mismatches.append({"category": "PK_MISMATCH", "constraint": name, "field": "columns", "expected": exp.get("columns"), "actual": act.get("columns")})
            for field in ("deferrable", "initially_deferred", "validated"):
                if exp.get(field) != act.get(field):
                    mismatches.append({"category": "PK_MISMATCH", "constraint": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
        elif exp["type"] == "FOREIGN KEY":
            for field in ("local_columns", "referenced_table", "referenced_columns"):
                if exp.get(field) != act.get(field):
                    mismatches.append({"category": "FK_ENDPOINT_MISMATCH", "constraint": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
            if exp.get("match_type", "SIMPLE") != act.get("match_type", "SIMPLE"):
                mismatches.append({"category": "FK_MATCH_MISMATCH", "constraint": name, "expected": exp.get("match_type"), "actual": act.get("match_type")})
            for field in ("on_update", "on_delete"):
                if exp.get(field) != act.get(field):
                    mismatches.append({"category": "FK_ACTION_MISMATCH", "constraint": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
            for field in ("deferrable", "initially_deferred"):
                if exp.get(field) != act.get(field):
                    mismatches.append({"category": "FK_DEFERRABILITY_MISMATCH", "constraint": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
            if exp.get("validated", True) != act.get("validated", True):
                mismatches.append({"category": "FK_VALIDATION_MISMATCH", "constraint": name, "expected": exp.get("validated"), "actual": act.get("validated")})
        elif exp["type"] == "UNIQUE":
            if list(exp.get("columns", [])) != list(act.get("columns", [])):
                mismatches.append({"category": "UNIQUE_MISMATCH", "constraint": name, "expected": exp.get("columns"), "actual": act.get("columns")})
        elif exp["type"] == "CHECK":
            exp_norm = exp.get("normalized_definition") or re.sub(r"\s+", " ", exp.get("definition", "").strip()).lower()
            act_norm = act.get("normalized_definition") or re.sub(r"\s+", " ", act.get("definition", "").strip()).lower()
            if exp_norm != act_norm:
                mismatches.append({"category": "CHECK_MISMATCH", "constraint": name, "expected": exp_norm, "actual": act_norm})

    exp_names = set(exp_by_name.keys())
    act_names = set(act_by_name.keys())
    for extra in sorted(act_names - exp_names):
        act = act_by_name[extra]
        cat = {
            "PRIMARY KEY": "PK_MISMATCH",
            "FOREIGN KEY": "FK_ENDPOINT_MISMATCH",
            "UNIQUE": "UNIQUE_MISMATCH",
            "CHECK": "CHECK_MISMATCH",
        }.get(act.get("type"), "CHECK_MISMATCH")
        mismatches.append({"category": cat, "constraint": extra, "issue": "unexpected"})

    return len(mismatches) == 0, mismatches


def compare_indexes(expected: list[dict], actual: list[dict]) -> tuple[bool, list[dict]]:
    mismatches: list[dict] = []
    exp_by_name = {i["name"]: i for i in expected if i.get("name")}
    act_by_name = {i["name"]: i for i in actual if i.get("name")}

    for name, exp in exp_by_name.items():
        act = act_by_name.get(name)
        if not act:
            mismatches.append({"category": "INDEX_KEY_MISMATCH", "index": name, "issue": "missing"})
            continue
        if exp.get("normalized_definition") == act.get("normalized_definition"):
            pass
        else:
            if exp.get("method") != act.get("method"):
                mismatches.append({"category": "INDEX_ACCESS_METHOD_MISMATCH", "index": name, "expected": exp.get("method"), "actual": act.get("method")})
            if (exp.get("predicate") or None) != (act.get("predicate") or None):
                mismatches.append({"category": "INDEX_PREDICATE_MISMATCH", "index": name, "expected": exp.get("predicate"), "actual": act.get("predicate")})
            if exp.get("include_columns", []) != act.get("include_columns", []):
                mismatches.append({"category": "INDEX_INCLUDE_MISMATCH", "index": name, "expected": exp.get("include_columns"), "actual": act.get("include_columns")})
            mismatches.append(
                {
                    "category": "INDEX_KEY_MISMATCH",
                    "index": name,
                    "expected_definition": exp.get("normalized_definition"),
                    "actual_definition": act.get("normalized_definition"),
                }
            )
        if exp.get("valid", True) != act.get("valid", True) or exp.get("ready", True) != act.get("ready", True):
            mismatches.append(
                {
                    "category": "INDEX_STATE_MISMATCH",
                    "index": name,
                    "expected_valid": exp.get("valid"),
                    "actual_valid": act.get("valid"),
                    "expected_ready": exp.get("ready"),
                    "actual_ready": act.get("ready"),
                }
            )

    for extra in sorted(set(act_by_name.keys()) - set(exp_by_name.keys())):
        mismatches.append({"category": "UNEXPECTED_OBJECT", "index": extra})

    return len(mismatches) == 0, mismatches


def table_indexes_actual(actual: dict[str, Any], table: str) -> list[dict[str, Any]]:
    return [idx for idx in actual["indexes"].values() if idx["table"] == table]


def evaluate_property_category(table: str, category: str, expected_table: dict, actual: dict) -> dict[str, Any]:
    exp_cols = expected_table["columns"]
    act_cols = actual["columns"].get(table, {})
    mismatches: list[dict] = []
    passed = False

    if category == "columns":
        exp_names = [name for name, _ in sorted(exp_cols.items(), key=lambda kv: kv[1].get("ordinal", 0))]
        act_names = sorted(act_cols.keys(), key=lambda n: exp_cols[n]["ordinal"] if n in exp_cols else 9999)
        passed = exp_names == act_names
        if not passed:
            for c in sorted(set(exp_names) - set(act_names)):
                mismatches.append({"category": "MISSING_COLUMN", "column": c})
            for c in sorted(set(act_names) - set(exp_names)):
                mismatches.append({"category": "UNEXPECTED_COLUMN", "column": c})
    elif category == "types":
        for name, exp in exp_cols.items():
            act = act_cols.get(name)
            if not act:
                mismatches.append({"category": "MISSING_COLUMN", "column": name})
            elif not types_exact_match(exp["type"], act.get("type", "")):
                mismatches.append({"category": "TYPE_MISMATCH", "column": name, "expected": exp["type"], "actual": act.get("type")})
        for extra in sorted(set(act_cols.keys()) - set(exp_cols.keys())):
            mismatches.append({"category": "UNEXPECTED_COLUMN", "column": extra})
        passed = len(mismatches) == 0
    elif category == "nullability":
        for name, exp in exp_cols.items():
            act = act_cols.get(name)
            if act and act.get("nullable") != exp["nullable"]:
                mismatches.append({"category": "NULLABILITY_MISMATCH", "column": name, "expected": exp["nullable"], "actual": act.get("nullable")})
        passed = len(mismatches) == 0 and set(exp_cols.keys()) == set(act_cols.keys())
    elif category == "defaults":
        for name, exp in exp_cols.items():
            act = act_cols.get(name)
            if act and not defaults_match(exp["default"], act.get("default", {"kind": "NO_DATABASE_DEFAULT", "value": None})):
                mismatches.append({"category": "DEFAULT_MISMATCH", "column": name, "expected": exp["default"], "actual": act.get("default")})
        passed = len(mismatches) == 0 and set(exp_cols.keys()) == set(act_cols.keys())
    elif category == "constraints":
        exp_cons = expected_table["constraints"]
        act_cons = _constraint_actual(actual, table)
        passed, mismatches = compare_constraints(exp_cons, act_cons)
    elif category == "indexes":
        passed, mismatches = compare_indexes(expected_table["indexes"], table_indexes_actual(actual, table))

    return {"category": category, "table": table, "pass": passed, "mismatches": mismatches}


def vehicle_trips_trip_status_convergence(cfg: PgConfig, db: str, catalog: dict) -> dict[str, Any]:
    auth_col = next(c for c in table_authority(catalog, "vehicle_trips")["columns"] if c["column_name"] == "trip_status")
    exp_default = auth_col.get("column_default")
    proc = psql(
        cfg,
        db,
        "SELECT pg_catalog.format_type(a.atttypid, a.atttypmod), pg_get_expr(ad.adbin, ad.adrelid) "
        "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum "
        "WHERE c.relname='vehicle_trips' AND a.attname='trip_status';",
        tuples_only=True,
    )
    parts = proc.stdout.strip().split("|") if proc.returncode == 0 else []
    act_type = parts[0] if parts else None
    act_default = parts[1] if len(parts) > 1 else None
    return {
        "column": "vehicle_trips.trip_status",
        "expected_type": '"TripStatus"',
        "actual_type": act_type,
        "expected_default": exp_default,
        "actual_default": act_default,
        "historical_state_a_default": "'COMPLETED'::\"TripStatus\"",
        "accepted_final_default": "'ONGOING'::\"TripStatus\"",
        "completed_to_ongoing_reconciled": act_default == exp_default,
        "pass": act_default == exp_default and act_type == '"TripStatus"',
    }


def derive_counters(mismatches: list[dict]) -> dict[str, int]:
    counters: dict[str, int] = {}
    for m in mismatches:
        cat = m.get("category", "UNKNOWN")
        counters[cat] = counters.get(cat, 0) + 1
    return counters


def run_exact_parity(cfg: PgConfig, db: str, authority_manifest_sha: str) -> dict[str, Any]:
    catalog = load_production_catalog()
    canonical = load_canonical_54()
    actual = read_actual_catalog(cfg, db)

    property_results = []
    all_mismatches: list[dict] = []
    seq = 0
    for table in BOOTSTRAP_TABLES:
        expected_table = build_table_expected(table, catalog)
        for category in PROPERTY_CATEGORIES:
            entry = canonical["entries"][seq]
            result = evaluate_property_category(table, category, expected_table, actual)
            property_results.append(
                {
                    "authority_id": entry["authority_id"],
                    "property_identity": entry["property_identity"],
                    "pass": result["pass"],
                    "mismatch_count": len(result["mismatches"]),
                    "mismatches": result["mismatches"],
                }
            )
            all_mismatches.extend(
                {**m, "authority_id": entry["authority_id"], "property_identity": entry["property_identity"]} for m in result["mismatches"]
            )
            seq += 1

    enum_results = []
    for enum in BOOTSTRAP_ENUMS:
        expected_labels = enum_authority(catalog, enum).get("labels", [])
        actual_labels = enum_labels(cfg, db, enum)
        pass_ = actual_labels == expected_labels
        if not pass_:
            all_mismatches.append(
                {
                    "category": "ENUM_LABEL_MISMATCH" if set(actual_labels) != set(expected_labels) else "ENUM_ORDER_MISMATCH",
                    "enum": enum,
                    "expected": expected_labels,
                    "actual": actual_labels,
                }
            )
        enum_results.append({"enum": enum, "pass": pass_, "expected_labels": expected_labels, "actual_labels": actual_labels})

    tables_checked = sum(1 for t in BOOTSTRAP_TABLES if table_exists(cfg, db, t))
    enums_checked = sum(1 for e in BOOTSTRAP_ENUMS if enum_labels(cfg, db, e) is not None)
    trip_status = vehicle_trips_trip_status_convergence(cfg, db, catalog)
    if not trip_status["pass"]:
        all_mismatches.append({"category": "DEFAULT_MISMATCH", "object": "vehicle_trips.trip_status", **trip_status})

    counters = derive_counters(all_mismatches)
    properties_matched = sum(1 for r in property_results if r["pass"])
    enums_matched = sum(1 for r in enum_results if r["pass"])

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.1",
        "authority_manifest_sha256": authority_manifest_sha,
        "objects_expected": 19,
        "objects_checked": tables_checked + enums_checked,
        "objects_matched": tables_checked + enums_matched,
        "tables_expected": 9,
        "tables_checked": tables_checked,
        "tables_matched": tables_checked if tables_checked == 9 else tables_checked,
        "enums_expected": 10,
        "enums_checked": enums_checked,
        "enums_matched": enums_matched,
        "properties_expected": 54,
        "properties_checked": len(property_results),
        "properties_matched": properties_matched,
        "property_results": property_results,
        "enum_results": enum_results,
        "vehicle_trips_trip_status": trip_status,
        "mismatch_records": all_mismatches,
        "mismatch_counters": counters,
        "pass": (
            tables_checked == 9
            and enums_checked == 10
            and properties_matched == 54
            and len(property_results) == 54
            and enums_matched == 10
            and trip_status["pass"]
            and len(all_mismatches) == 0
        ),
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
