"""Read normalized PostgreSQL catalog state for CI-R3B1D.1.2 parity checks."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1d12_catalog_model import PG_DELETE_ACTION, PG_UPDATE_ACTION, normalize_pg_type, semantic_default_from_pg_expr
from replay_evidence_lib import PgConfig, psql


def t_is_enum(cfg: PgConfig, db: str, typname: str) -> bool:
    proc = psql(
        cfg,
        db,
        f"SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='{typname}' AND t.typtype='e');",
        tuples_only=True,
    )
    return proc.stdout.strip() == "t"


def _rows(cfg: PgConfig, db: str, sql: str) -> list[list[str]]:
    proc = psql(cfg, db, sql, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return [line.split("|") for line in proc.stdout.splitlines() if line.strip()]


def read_actual_catalog(cfg: PgConfig, db: str) -> dict[str, Any]:
    catalog: dict[str, Any] = {
        "types": {},
        "sequences": {},
        "tables": set(),
        "columns": {},
        "primary_keys": {},
        "unique_constraints": {},
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

    for seq in _rows(
        cfg,
        db,
        """
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
        """,
    ):
        catalog["sequences"][seq[0]] = {"name": seq[0]}

    for table, col, typname, fmt_type, nullable, default in _rows(
        cfg,
        db,
        """
        SELECT c.relname, a.attname, t.typname, pg_catalog.format_type(a.atttypid, a.atttypmod),
               CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
               pg_get_expr(ad.adbin, ad.adrelid)
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum
        """,
    ):
        catalog["tables"].add(table)
        catalog["columns"].setdefault(table, {})
        if typname.endswith("[]"):
            ntype = typname
        elif t_is_enum(cfg, db, typname):
            ntype = typname
        else:
            ntype = fmt_type or normalize_pg_type(fmt_type, typname)
        catalog["columns"][table][col] = {
            "name": col,
            "type": ntype,
            "nullable": nullable == "YES",
            "default": semantic_default_from_pg_expr(default, ntype),
        }

    for name, table, cols, contype in _rows(
        cfg,
        db,
        """
        SELECT con.conname, rel.relname,
               string_agg(att.attname, E'\x1f' ORDER BY u.ord),
               con.contype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
        WHERE n.nspname = 'public' AND con.contype IN ('p','u')
        GROUP BY con.conname, rel.relname, con.contype
        """,
    ):
        entry = {"name": name, "table": table, "columns": cols.split("\x1f") if cols else []}
        if contype == "p":
            catalog["primary_keys"][name] = entry
        else:
            catalog["unique_constraints"][name] = entry

    for name, local_table, local_cols, ref_table, ref_cols, deltype, updtype in _rows(
        cfg,
        db,
        """
        SELECT con.conname,
               rel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum),
               frel.relname,
               (SELECT string_agg(att.attname, E'\x1f' ORDER BY u.ord)
                FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum),
               con.confdeltype, con.confupdtype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_class frel ON frel.oid = con.confrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'f'
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
        }

    for idx_name, table, unique, method, cols, valid, ready in _rows(
        cfg,
        db,
        """
        SELECT ic.relname, tc.relname, ix.indisunique, am.amname,
               (SELECT string_agg(a.attname, E'\x1f' ORDER BY k.ord)
                FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
                WHERE k.attnum > 0),
               ix.indisvalid, ix.indisready
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class tc ON tc.oid = ix.indrelid
        JOIN pg_am am ON am.oid = ic.relam
        JOIN pg_namespace n ON n.oid = tc.relnamespace
        WHERE n.nspname = 'public' AND tc.relkind = 'r'
        """,
    ):
        catalog["indexes"][idx_name] = {
            "name": idx_name,
            "table": table,
            "unique": unique == "t",
            "method": method,
            "columns": cols.split("\x1f") if cols else [],
            "valid": valid == "t",
            "ready": ready == "t",
        }

    return catalog
