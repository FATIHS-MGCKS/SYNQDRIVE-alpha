"""Catalog fingerprint builder for production/twin fidelity."""
from __future__ import annotations

import json
import re
import subprocess
from typing import Any, Callable

from ci_r3b1n2_constants import sha256_text


def _rows_from_output(stdout: str) -> list[list[str]]:
    return [line.split("|") for line in stdout.splitlines() if line.strip()]


def build_catalog_fingerprint(run_sql: Callable[[str], str]) -> dict[str, Any]:
    tables: dict[str, dict[str, Any]] = {}
    for table, col, fmt, nullable, default, attidentity, attgenerated in _rows_from_output(
        run_sql(
            """
SELECT c.relname, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
       CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), ''),
       COALESCE(a.attidentity, ''), COALESCE(a.attgenerated, '')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;
"""
        )
    ):
        tables.setdefault(table, {"columns": {}})
        tables[table]["columns"][col] = {
            "type": fmt,
            "nullable": nullable,
            "default": re.sub(r"\s+", " ", default.strip()) if default else None,
            "identity": attidentity or None,
            "generated": attgenerated or None,
        }

    enums: dict[str, list[str]] = {}
    for typname, labels in _rows_from_output(
        run_sql(
            """
SELECT t.typname, string_agg(e.enumlabel, E'\\x1f' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'
GROUP BY t.typname ORDER BY t.typname;
"""
        )
    ):
        enums[typname] = labels.split("\x1f") if labels else []

    constraints = []
    for name, table, kind, defn in _rows_from_output(
        run_sql(
            """
SELECT con.conname, rel.relname, con.contype::text, pg_get_constraintdef(con.oid, true)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
ORDER BY con.conname;
"""
        )
    ):
        constraints.append(
            {
                "name": name,
                "table": table,
                "kind": kind,
                "definition": re.sub(r"\s+", " ", defn.strip()).lower(),
            }
        )

    indexes = []
    for idx_name, table, defn, unique, valid, ready, method in _rows_from_output(
        run_sql(
            """
SELECT ic.relname, tc.relname, pg_get_indexdef(ix.indexrelid, 0, true),
       ix.indisunique, ix.indisvalid, ix.indisready, am.amname
FROM pg_index ix
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_am am ON am.oid = ic.relam
JOIN pg_namespace n ON n.oid = tc.relnamespace
WHERE n.nspname = 'public'
ORDER BY ic.relname;
"""
        )
    ):
        indexes.append(
            {
                "name": idx_name,
                "table": table,
                "definition": re.sub(r"\s+", " ", defn.strip()).lower(),
                "unique": unique == "t",
                "valid": valid == "t",
                "ready": ready == "t",
                "method": method,
            }
        )

    payload = {"tables": tables, "enums": enums, "constraints": constraints, "indexes": indexes}
    return {
        "object_counts": {
            "tables": len(tables),
            "enums": len(enums),
            "constraints": len(constraints),
            "indexes": len(indexes),
        },
        "fingerprint_sha256": sha256_text(json.dumps(payload, sort_keys=True, separators=(",", ":"))),
        "payload": payload,
    }


def compare_catalog_fingerprints(production: dict[str, Any], twin: dict[str, Any]) -> dict[str, Any]:
    mismatches = []
    if production["fingerprint_sha256"] != twin["fingerprint_sha256"]:
        prod_tables = set(production["payload"]["tables"])
        twin_tables = set(twin["payload"]["tables"])
        missing = sorted(prod_tables - twin_tables)
        unexpected = sorted(twin_tables - prod_tables)
        mismatches.append({"kind": "fingerprint_diff", "missing_on_twin": missing[:20], "unexpected_on_twin": unexpected[:20]})
    return {
        "production_fingerprint": production["fingerprint_sha256"],
        "twin_fingerprint": twin["fingerprint_sha256"],
        "pass": production["fingerprint_sha256"] == twin["fingerprint_sha256"],
        "mismatches": mismatches,
    }
