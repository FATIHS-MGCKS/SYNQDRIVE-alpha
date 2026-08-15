"""Hardened T2 stale-index drop safety for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

from typing import Any, Callable

from ci_r3b1o4_catalog_inventory import read_index_detail
from ci_r3b1o4_constants import INVOICE_REPLACEMENT, STALE_INDEXES
from ci_r3b1o4_stale_index_authority import _whatsapp_replacement_state, build_replacement_uniqueness_safety

EXPECTED_STALE = {
    "org_invoices_invoice_number_key": {
        "owner_table": "org_invoices",
        "unique": True,
        "primary": False,
        "access_method": "btree",
        "keys": [{"ordinal": 1, "kind": "key", "name": "invoice_number", "collation": "default", "opclass": "default", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"}],
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    },
    "whatsapp_conversations_organization_id_contact_phone_key": {
        "owner_table": "whatsapp_conversations",
        "unique": True,
        "primary": False,
        "access_method": "btree",
        "keys": [
            {"ordinal": 1, "kind": "key", "name": "organization_id", "collation": "default", "opclass": "default", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"},
            {"ordinal": 2, "kind": "key", "name": "contact_phone", "collation": "default", "opclass": "text_ops", "sort_direction": "ASC", "nulls_ordering": "NULLS LAST"},
        ],
        "include_columns": [],
        "predicate": None,
        "valid": True,
        "ready": True,
    },
}


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
        expected = EXPECTED_STALE[index_name]
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
