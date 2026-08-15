"""Strengthened semantic parity comparator for CI-R3B1K."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1j1_semantic_authority import build_migration252_semantic_authority
from ci_r3b1j1_semantic_parity import compare_semantic_parity, extract_full_catalog_state
from ci_r3b1k_constants import APPROVED_RENAMES, MIGRATION_252_PATH, TABLE_252


def expected_type_from_sql(sql_type: str) -> str:
    t = sql_type.strip().upper()
    if t == "TEXT":
        return "text"
    if t == "JSONB":
        return "jsonb"
    if t.startswith("TIMESTAMP("):
        prec = re.search(r"TIMESTAMP\((\d+)\)", t)
        if prec:
            return f"timestamp({prec.group(1)}) without time zone"
        return "timestamp without time zone"
    return t.lower()


def strict_compare_types(expected_sql_type: str, actual_pg_type: str) -> bool:
    exp = expected_type_from_sql(expected_sql_type)
    act = actual_pg_type.strip().lower()
    return exp == act


def strict_semantic_parity(cfg, db: str, psql_fn, original_sql: str | None = None) -> dict[str, Any]:
    original_sql = original_sql or MIGRATION_252_PATH.read_text()
    expected = build_migration252_semantic_authority(original_sql)
    actual = extract_full_catalog_state(cfg, db, psql_fn, TABLE_252)
    base = compare_semantic_parity(expected, actual, APPROVED_RENAMES)

    extra: list[dict] = []
    exp_table = expected["tables"][0]
    act_cols = {c["name"]: c for c in actual["columns"]}
    for col in exp_table["columns"]:
        act = act_cols.get(col["name"])
        if not act:
            continue
        if not strict_compare_types(col["postgres_type"], act["pg_type"]):
            extra.append(
                {
                    "category": "COLUMN_TYPE",
                    "column": col["name"],
                    "expected_format_type": expected_type_from_sql(col["postgres_type"]),
                    "actual_format_type": act["pg_type"],
                }
            )

    check_proc = psql_fn(
        cfg,
        db,
        f"SELECT COUNT(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid "
        f"JOIN pg_namespace n ON n.oid=rel.relnamespace "
        f"WHERE n.nspname='public' AND rel.relname='{TABLE_252}' AND con.contype='c';",
        tuples_only=True,
    )
    check_count = int((check_proc.stdout or "0").strip() or 0)
    if check_count != 0:
        extra.append({"category": "CHECK_DEFINITION", "unexpected_check_constraints": check_count})

    truncated_collision = "organization_role_assignment_drift_reconciliation_applications_"
    rel_proc = psql_fn(
        cfg,
        db,
        f"SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        f"WHERE n.nspname='public' AND c.relname='{truncated_collision}';",
        tuples_only=True,
    )
    if (rel_proc.stdout or "").strip():
        extra.append({"category": "UNEXPECTED_OBJECT", "object": truncated_collision})

    mismatches = [m for m in base["mismatches"] if m["category"] != "COLUMN_TYPE"] + extra
    for m in list(mismatches):
        if m["category"] == "COLUMN_TYPE":
            mismatches.remove(m)

    return {
        **base,
        "strict_mode": True,
        "mismatches": mismatches,
        "mismatch_count": len(mismatches),
        "mismatch_categories": sorted({m["category"] for m in mismatches}),
        "unexpected_object_count": len([m for m in mismatches if m["category"] == "UNEXPECTED_OBJECT"]),
        "missing_object_count": len([m for m in mismatches if m["category"] == "MISSING_OBJECT"]),
        "pass": len(mismatches) == 0,
        "checks": {
            "column_types_exact": len(extra) == 0 or all(e["category"] != "COLUMN_TYPE" for e in extra),
            "check_constraints_none": check_count == 0,
            "no_truncated_collision_names": truncated_collision not in (rel_proc.stdout or ""),
        },
    }
