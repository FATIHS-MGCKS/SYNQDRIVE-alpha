#!/usr/bin/env python3
"""Catalog inspection helpers for CI-R3B1J identifier collision authority."""
from __future__ import annotations

import json
from typing import Any


def query_catalog_objects(cfg, db: str, psql_fn, name_pattern: str | None = None) -> dict[str, Any]:
    rel_sql = """
SELECT c.oid, c.relname, c.relkind, n.nspname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
"""
    if name_pattern:
        rel_sql += f" AND c.relname LIKE '{name_pattern}'"
    rel_sql += " ORDER BY c.relname;"
    rel_proc = psql_fn(cfg, db, rel_sql, tuples_only=True)

    con_sql = """
SELECT c.oid, c.conname, c.contype, t.relname AS table_name
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
"""
    if name_pattern:
        con_sql += f" AND c.conname LIKE '{name_pattern}'"
    con_sql += " ORDER BY c.conname;"
    con_proc = psql_fn(cfg, db, con_sql, tuples_only=True)

    idx_sql = """
SELECT ci.relname AS index_name, t.relname AS table_name, ix.indisunique, ix.indisprimary
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class ci ON ci.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
"""
    if name_pattern:
        idx_sql += f" AND ci.relname LIKE '{name_pattern}'"
    idx_sql += " ORDER BY ci.relname;"
    idx_proc = psql_fn(cfg, db, idx_sql, tuples_only=True)

    def parse_rows(proc, fields):
        rows = []
        for line in (proc.stdout or "").splitlines():
            if not line.strip():
                continue
            parts = line.split("|")
            if len(parts) != len(fields):
                continue
            rows.append(dict(zip(fields, parts)))
        return rows

    return {
        "relations": parse_rows(rel_proc, ["oid", "relname", "relkind", "schema"]),
        "constraints": parse_rows(con_proc, ["oid", "conname", "contype", "table_name"]),
        "indexes": parse_rows(idx_proc, ["index_name", "table_name", "indisunique", "indisprimary"]),
    }


def find_existing_collision_object(cfg, db: str, psql_fn, normalized_name: str) -> dict[str, Any]:
    catalog = query_catalog_objects(cfg, db, psql_fn, normalized_name.replace("_", r"\_") + "%")
    exact = [r for r in catalog["relations"] if r["relname"] == normalized_name]
    constraints = [c for c in catalog["constraints"] if c["conname"] == normalized_name]
    indexes = [i for i in catalog["indexes"] if i["index_name"].endswith(normalized_name)]
    return {
        "normalized_identifier": normalized_name,
        "exact_relations": exact,
        "exact_constraints": constraints,
        "matching_indexes": indexes,
    }


def capture_table_semantics(cfg, db: str, psql_fn, table: str) -> dict[str, Any]:
    cols_proc = psql_fn(
        cfg,
        db,
        "SELECT column_name, data_type, udt_name, is_nullable, column_default "
        f"FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}' "
        "ORDER BY ordinal_position;",
        tuples_only=True,
    )
    columns = []
    for line in (cols_proc.stdout or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != 5:
            continue
        columns.append(
            {
                "column_name": parts[0],
                "data_type": parts[1],
                "udt_name": parts[2],
                "is_nullable": parts[3],
                "column_default": parts[4] if parts[4] else None,
            }
        )
    catalog = query_catalog_objects(cfg, db, psql_fn)
    constraints = [c for c in catalog["constraints"] if c["table_name"] == table]
    indexes = [i for i in catalog["indexes"] if i["table_name"] == table]
    return {"table": table, "columns": columns, "constraints": constraints, "indexes": indexes}
