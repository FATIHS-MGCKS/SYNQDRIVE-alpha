"""Hardened PostgreSQL catalog reader for CI-R3B1L.1 exact parity."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1d12_catalog_model import PG_DELETE_ACTION, PG_UPDATE_ACTION, semantic_default_from_pg_expr
from ci_r3b1l1_constants import BOOTSTRAP_TABLES, PG_MATCH_TYPE
from replay_evidence_lib import PgConfig, psql


def _rows(cfg: PgConfig, db: str, sql: str) -> list[list[str]]:
    proc = psql(cfg, db, sql, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return [line.split("|") for line in proc.stdout.splitlines() if line.strip()]


def _t_is_enum(cfg: PgConfig, db: str, typname: str) -> bool:
    proc = psql(
        cfg,
        db,
        f"SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace "
        f"WHERE n.nspname='public' AND t.typname='{typname}' AND t.typtype='e');",
        tuples_only=True,
    )
    return proc.stdout.strip() == "t"


def normalize_indexdef(defn: str) -> str:
    text = re.sub(r"\s+", " ", (defn or "").strip())
    text = re.sub(r"\bpublic\.", "", text, flags=re.I)
    return text.lower()


def read_actual_catalog(cfg: PgConfig, db: str, scope_tables: list[str] | None = None) -> dict[str, Any]:
    tables = scope_tables or BOOTSTRAP_TABLES
    table_filter = ",".join(f"'{t}'" for t in tables)

    catalog: dict[str, Any] = {
        "types": {},
        "tables": set(),
        "columns": {},
        "primary_keys": {},
        "unique_constraints": {},
        "check_constraints": {},
        "foreign_keys": {},
        "indexes": {},
    }

    for typname, labels in _rows(
        cfg,
        db,
        """
        SELECT t.typname, string_agg(e.enumlabel, E'\x1f' ORDER BY e.enumsortorder)
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        GROUP BY t.typname
        """,
    ):
        catalog["types"][typname] = {"name": typname, "labels": labels.split("\x1f") if labels else []}

    for table, col, typname, fmt_type, nullable, default, attidentity, attgenerated in _rows(
        cfg,
        db,
        f"""
        SELECT c.relname, a.attname, t.typname, pg_catalog.format_type(a.atttypid, a.atttypmod),
               CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
               pg_get_expr(ad.adbin, ad.adrelid),
               COALESCE(a.attidentity, ''), COALESCE(a.attgenerated, '')
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          AND c.relname IN ({table_filter})
        ORDER BY c.relname, a.attnum
        """,
    ):
        catalog["tables"].add(table)
        catalog["columns"].setdefault(table, {})
        if typname.endswith("[]"):
            ntype = fmt_type or typname
        elif _t_is_enum(cfg, db, typname):
            ntype = fmt_type or f'"{typname}"'
        else:
            ntype = fmt_type or typname
        catalog["columns"][table][col] = {
            "name": col,
            "type": ntype,
            "nullable": nullable == "YES",
            "default": semantic_default_from_pg_expr(default, ntype),
            "identity": attidentity or None,
            "generated": attgenerated or None,
        }

    for name, table, cols, deferrable, deferred, validated, defn in _rows(
        cfg,
        db,
        f"""
        SELECT con.conname, rel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum),
               con.condeferrable, con.condeferred, con.convalidated,
               pg_get_constraintdef(con.oid, true)
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'p' AND rel.relname IN ({table_filter})
        """,
    ):
        catalog["primary_keys"][name] = {
            "name": name,
            "table": table,
            "columns": cols.split("\x1f") if cols else [],
            "deferrable": deferrable == "t",
            "initially_deferred": deferred == "t",
            "validated": validated == "t",
            "definition": defn,
        }

    for name, table, cols, deferrable, deferred, validated, defn in _rows(
        cfg,
        db,
        f"""
        SELECT con.conname, rel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum),
               con.condeferrable, con.condeferred, con.convalidated,
               pg_get_constraintdef(con.oid, true)
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'u' AND rel.relname IN ({table_filter})
        """,
    ):
        catalog["unique_constraints"][name] = {
            "name": name,
            "table": table,
            "columns": cols.split("\x1f") if cols else [],
            "deferrable": deferrable == "t",
            "initially_deferred": deferred == "t",
            "validated": validated == "t",
            "definition": defn,
        }

    for name, table, defn, deferrable, deferred, validated in _rows(
        cfg,
        db,
        f"""
        SELECT con.conname, rel.relname, pg_get_constraintdef(con.oid, true),
               con.condeferrable, con.condeferred, con.convalidated
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'c' AND rel.relname IN ({table_filter})
        """,
    ):
        catalog["check_constraints"][name] = {
            "name": name,
            "table": table,
            "definition": defn,
            "normalized_definition": re.sub(r"\s+", " ", defn.strip()).lower(),
            "deferrable": deferrable == "t",
            "initially_deferred": deferred == "t",
            "validated": validated == "t",
        }

    for (
        name,
        local_table,
        local_cols,
        ref_table,
        ref_cols,
        deltype,
        updtype,
        matchtype,
        deferrable,
        deferred,
        validated,
        defn,
    ) in _rows(
        cfg,
        db,
        f"""
        SELECT con.conname,
               rel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum),
               frel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum),
               con.confdeltype, con.confupdtype, con.confmatchtype,
               con.condeferrable, con.condeferred, con.convalidated,
               pg_get_constraintdef(con.oid, true)
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_class frel ON frel.oid = con.confrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'f' AND rel.relname IN ({table_filter})
        """,
    ):
        catalog["foreign_keys"][name] = {
            "name": name,
            "local_table": local_table,
            "local_columns": local_cols.split("\x1f") if local_cols else [],
            "referenced_table": ref_table,
            "referenced_columns": ref_cols.split("\x1f") if ref_cols else [],
            "on_delete": PG_DELETE_ACTION.get(deltype, deltype),
            "on_update": PG_UPDATE_ACTION.get(updtype, updtype),
            "match_type": PG_MATCH_TYPE.get(matchtype, matchtype),
            "deferrable": deferrable == "t",
            "initially_deferred": deferred == "t",
            "validated": validated == "t",
            "definition": defn,
        }

    for idx_name, table, defn, unique, primary, valid, ready, method in _rows(
        cfg,
        db,
        f"""
        SELECT ic.relname, tc.relname, pg_get_indexdef(ix.indexrelid, 0, true),
               ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class tc ON tc.oid = ix.indrelid
        JOIN pg_am am ON am.oid = ic.relam
        JOIN pg_namespace n ON n.oid = tc.relnamespace
        WHERE n.nspname = 'public' AND tc.relkind = 'r' AND tc.relname IN ({table_filter})
        """,
    ):
        catalog["indexes"][idx_name] = {
            "name": idx_name,
            "table": table,
            "unique": unique == "t",
            "primary": primary == "t",
            "valid": valid == "t",
            "ready": ready == "t",
            "method": method,
            "definition": defn,
            "normalized_definition": normalize_indexdef(defn),
        }

    return catalog
