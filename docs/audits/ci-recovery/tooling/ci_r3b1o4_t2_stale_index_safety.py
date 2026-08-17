"""Hardened T2 stale-index drop safety for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

from typing import Any, Callable

from ci_r3b1o4_catalog_inventory import read_index_detail
from ci_r3b1o4_constants import STALE_INDEXES
from ci_r3b1o4_stale_index_authority import build_replacement_uniqueness_safety

STALE_CREATOR_SPEC = {
    "org_invoices_invoice_number_key": {
        "owner_table": "org_invoices",
        "creator_migration": "20260413225000_ci_r3b_historical_predecessor_slot4",
        "key_columns": ["invoice_number"],
    },
    "whatsapp_conversations_organization_id_contact_phone_key": {
        "owner_table": "whatsapp_conversations",
        "creator_migration": "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
        "key_columns": ["organization_id", "contact_phone"],
    },
}


def _column_format_type(run_sql: Callable[[str], str], table: str, column: str) -> str:
    rows = [
        ln.strip()
        for ln in run_sql(
            f"""
SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='{table}' AND a.attname='{column}' AND NOT a.attisdropped;
"""
        ).splitlines()
        if ln.strip()
    ]
    return rows[0] if rows else ""


def _opclass_for_format_type(format_type: str) -> str:
    fmt = format_type.lower()
    if "timestamp" in fmt:
        return "timestamp_ops"
    if "json" in fmt:
        return "jsonb_ops"
    if "int" in fmt:
        return "int4_ops"
    if "text" in fmt or "char" in fmt or "uuid" in fmt:
        return "text_ops"
    return "default"


def build_expected_stale_index_shape(run_sql: Callable[[str], str], index_name: str) -> dict[str, Any]:
    spec = STALE_CREATOR_SPEC[index_name]
    keys = []
    for ordinal, column in enumerate(spec["key_columns"], start=1):
        fmt = _column_format_type(run_sql, spec["owner_table"], column)
        keys.append(
            {
                "ordinal": ordinal,
                "kind": "key",
                "name": column,
                "collation": "default",
                "opclass": _opclass_for_format_type(fmt),
                "sort_direction": "ASC",
                "nulls_ordering": "NULLS LAST",
            }
        )
    return {
        "owner_table": spec["owner_table"],
        "creator_migration": spec["creator_migration"],
        "unique": True,
        "primary": False,
        "access_method": "btree",
        "keys": keys,
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    }


# Exported for golden tests.
EXPECTED_STALE = STALE_CREATOR_SPEC


def _constraint_backing(run_sql: Callable[[str], str], index_name: str) -> bool:
    rows = [
        ln
        for ln in run_sql(
            f"""
SELECT COALESCE(con.contype::text, '')
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid
WHERE n.nspname='public' AND c.relname='{index_name}';
"""
        ).splitlines()
        if ln.strip()
    ]
    return bool(rows and rows[0] in {"p", "u", "x"})


def _compare_index(actual: dict[str, Any] | None, expected: dict[str, Any]) -> tuple[bool, list[str]]:
    mismatches: list[str] = []
    if not actual:
        return False, ["missing"]
    for field in ["owner_table", "unique", "primary", "access_method", "predicate", "valid", "ready"]:
        if actual.get(field) != expected.get(field):
            mismatches.append(field)
    if actual.get("keys") != expected.get("keys"):
        mismatches.append("keys")
    if actual.get("include_columns") != expected.get("include_columns"):
        mismatches.append("include_columns")
    return len(mismatches) == 0, mismatches


def evaluate_t2_stale_index_drop_safety(run_sql: Callable[[str], str]) -> dict[str, Any]:
    records = []
    for index_name in STALE_INDEXES:
        expected = build_expected_stale_index_shape(run_sql, index_name)
        actual = read_index_detail(run_sql, "public", expected["owner_table"], index_name)
        exact_ok, mismatches = _compare_index(actual, expected)
        backing = _constraint_backing(run_sql, index_name)
        records.append(
            {
                "index_name": index_name,
                "present": actual is not None,
                "expected": expected,
                "actual": actual,
                "constraint_backing": backing,
                "exact_shape_pass": exact_ok,
                "mismatches": mismatches,
                "pass": actual is not None and exact_ok and not backing,
            }
        )
    replacement = build_replacement_uniqueness_safety(run_sql)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-corrective",
        "indexes": records,
        "replacement_authority": replacement,
        "pass": all(r["pass"] for r in records) and replacement["pass"],
    }
