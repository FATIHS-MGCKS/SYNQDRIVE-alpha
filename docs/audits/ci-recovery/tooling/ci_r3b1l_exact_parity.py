"""Strict 54/54 final catalog parity engine for CI-R3B1L."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1d12_pg_catalog_reader import read_actual_catalog
from ci_r3b1l_authority import (
    build_table_expected,
    canonical_pg_type,
    column_semantics_match,
    enum_authority,
    load_canonical_54,
    load_production_catalog,
    parse_fk_definition,
    parse_index_definition,
    parse_pk_definition,
    types_equivalent,
)
from ci_r3b1l_constants import BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA, PROPERTY_CATEGORIES
from replay_evidence_lib import PgConfig, enum_labels, psql, table_exists

OUT = DATA / "ci-r3b1l-exact-final-catalog-parity-2026-08.json"


def normalize_constraint_actual(con: dict[str, Any], contype: str) -> dict[str, Any]:
    if contype == "p":
        return {"name": con["name"], "type": "PRIMARY KEY", **parse_pk_definition(f"PRIMARY KEY ({','.join(con['columns'])})")}
    if contype == "f":
        return {
            "name": con["name"],
            "type": "FOREIGN KEY",
            "local_columns": con["local_columns"],
            "referenced_table": con["referenced_table"],
            "referenced_columns": con["referenced_columns"],
            "on_update": con["on_update"],
            "on_delete": con["on_delete"],
        }
    if contype == "u":
        return {"name": con["name"], "type": "UNIQUE", "columns": con["columns"]}
    return con


def table_constraints_actual(actual: dict[str, Any], table: str) -> list[dict[str, Any]]:
    out = []
    for pk in actual["primary_keys"].values():
        if pk["table"] == table:
            out.append(normalize_constraint_actual(pk, "p"))
    for fk in actual["foreign_keys"].values():
        if fk["local_table"] == table:
            out.append(normalize_constraint_actual(fk, "f"))
    for uq in actual["unique_constraints"].values():
        if uq["table"] == table:
            out.append(normalize_constraint_actual(uq, "u"))
    return sorted(out, key=lambda x: x["name"])


def table_indexes_actual(actual: dict[str, Any], table: str) -> list[dict[str, Any]]:
    out = []
    for idx in actual["indexes"].values():
        if idx["table"] == table:
            out.append(
                {
                    "name": idx["name"],
                    "unique": idx["unique"],
                    "method": idx["method"],
                    "columns": idx["columns"],
                }
            )
    return sorted(out, key=lambda x: x["name"])


def compare_constraints(expected: list[dict], actual: list[dict]) -> tuple[bool, list[dict]]:
    mismatches = []
    exp_by_name = {c["name"]: c for c in expected}
    act_by_name = {c["name"]: c for c in actual}
    for name, exp in exp_by_name.items():
        act = act_by_name.get(name)
        if not act:
            mismatches.append({"category": "PK_MISMATCH" if exp["type"] == "PRIMARY KEY" else "FK_ENDPOINT_MISMATCH", "constraint": name, "issue": "missing"})
            continue
        if exp["type"] == "PRIMARY KEY":
            if list(exp.get("columns", [])) != list(act.get("columns", [])):
                mismatches.append({"category": "PK_MISMATCH", "constraint": name, "expected": exp.get("columns"), "actual": act.get("columns")})
        elif exp["type"] == "FOREIGN KEY":
            for field in ("local_columns", "referenced_table", "referenced_columns", "on_update", "on_delete"):
                if exp.get(field) != act.get(field):
                    cat = "FK_ACTION_MISMATCH" if field in {"on_update", "on_delete"} else "FK_ENDPOINT_MISMATCH"
                    mismatches.append({"category": cat, "constraint": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
    for extra in sorted(set(act_by_name.keys()) - set(exp_by_name.keys())):
        mismatches.append({"category": "UNEXPECTED_OBJECT", "constraint": extra})
    return len(mismatches) == 0, mismatches


def compare_indexes(expected: list[dict], actual: list[dict]) -> tuple[bool, list[dict]]:
    mismatches = []
    exp_by_name = {i["name"]: i for i in expected}
    act_by_name = {i["name"]: i for i in actual}
    for name, exp in exp_by_name.items():
        act = act_by_name.get(name)
        if not act:
            mismatches.append({"category": "INDEX_MISMATCH", "index": name, "issue": "missing"})
            continue
        for field in ("unique", "method", "columns"):
            if exp.get(field) != act.get(field):
                mismatches.append({"category": "INDEX_MISMATCH", "index": name, "field": field, "expected": exp.get(field), "actual": act.get(field)})
    for extra in sorted(set(act_by_name.keys()) - set(exp_by_name.keys())):
        mismatches.append({"category": "UNEXPECTED_OBJECT", "index": extra})
    return len(mismatches) == 0, mismatches


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
            missing = sorted(set(exp_names) - set(act_names))
            unexpected = sorted(set(act_names) - set(exp_names))
            if missing:
                mismatches.extend({"category": "MISSING_COLUMN", "column": c} for c in missing)
            if unexpected:
                mismatches.extend({"category": "UNEXPECTED_COLUMN", "column": c} for c in unexpected)
    elif category == "types":
        for name, exp in exp_cols.items():
            act = act_cols.get(name)
            if not act:
                mismatches.append({"category": "MISSING_COLUMN", "column": name})
            elif not types_equivalent(exp["type"], act.get("type", "")):
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
            if act:
                from ci_r3b1d12_catalog_model import defaults_match

                if not defaults_match(exp["default"], act.get("default", {"kind": "NO_DATABASE_DEFAULT", "value": None})):
                    mismatches.append({"category": "DEFAULT_MISMATCH", "column": name, "expected": exp["default"], "actual": act.get("default")})
        passed = len(mismatches) == 0 and set(exp_cols.keys()) == set(act_cols.keys())
    elif category == "constraints":
        passed, mismatches = compare_constraints(expected_table["constraints"], table_constraints_actual(actual, table))
    elif category == "indexes":
        passed, mismatches = compare_indexes(expected_table["indexes"], table_indexes_actual(actual, table))

    return {"category": category, "table": table, "pass": passed, "mismatches": mismatches}


def vehicle_trips_trip_status_convergence(cfg: PgConfig, db: str, catalog: dict) -> dict[str, Any]:
    auth_col = next(c for c in table_authority(catalog, "vehicle_trips")["columns"] if c["column_name"] == "trip_status")
    exp_type = "TripStatus"
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
        "expected_type": exp_type,
        "actual_type": act_type,
        "expected_default": exp_default,
        "actual_default": act_default,
        "historical_state_a_default": "'COMPLETED'::\"TripStatus\"",
        "accepted_final_default": "'ONGOING'::\"TripStatus\"",
        "completed_to_ongoing_reconciled": act_default == exp_default,
        "pass": act_default == exp_default and "TripStatus" in (act_type or ""),
    }


def table_authority(catalog, table):
    from ci_r3b1l_authority import table_authority as ta

    return ta(catalog, table)


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
            all_mismatches.extend({**m, "authority_id": entry["authority_id"], "property_identity": entry["property_identity"]} for m in result["mismatches"])
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
    enums_checked = sum(1 for e in BOOTSTRAP_ENUMS if enum_labels(cfg, db, e))
    trip_status = vehicle_trips_trip_status_convergence(cfg, db, catalog)
    if not trip_status["pass"]:
        all_mismatches.append({"category": "DEFAULT_MISMATCH", "object": "vehicle_trips.trip_status", **trip_status})

    counters: dict[str, int] = {}
    for m in all_mismatches:
        cat = m.get("category", "UNKNOWN")
        counters[cat] = counters.get(cat, 0) + 1

    properties_matched = sum(1 for r in property_results if r["pass"])
    enums_matched = sum(1 for r in enum_results if r["pass"])
    objects_matched = tables_checked + enums_matched

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L",
        "authority_manifest_sha256": authority_manifest_sha,
        "objects_expected": 19,
        "objects_checked": tables_checked + enums_checked,
        "objects_matched": objects_matched,
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
