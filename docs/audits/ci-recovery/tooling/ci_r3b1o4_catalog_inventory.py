"""Complete physical catalog inventory for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

import json
import re
from typing import Any, Callable

from ci_r3b1n2_constants import sha256_text


def _rows(run_sql: Callable[[str], str], sql: str) -> list[list[str]]:
    return [line.split("|") for line in run_sql(sql).splitlines() if line.strip()]


def read_index_detail(run_sql: Callable[[str], str], schema: str, table: str, index_name: str) -> dict[str, Any] | None:
    rows = _rows(
        run_sql,
        f"""
SELECT ic.relname, tc.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready,
       COALESCE(pg_get_expr(ix.indpred, ix.indrelid), ''),
       pg_get_indexdef(ix.indexrelid, 0, true)
FROM pg_index ix
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
JOIN pg_am am ON am.oid = ic.relam
WHERE n.nspname='{schema}' AND tc.relname='{table}' AND ic.relname='{index_name}';
""",
    )
    if not rows:
        return None
    p = rows[0]
    key_rows = _rows(
        run_sql,
        f"""
SELECT k.ord, CASE WHEN a.attnum IS NULL OR a.attnum = 0 THEN 'include' ELSE 'key' END,
       COALESCE(a.attname, pg_get_indexdef(i.indexrelid, k.ord, true)),
       COALESCE(coll.collname, 'default'), COALESCE(opc.opcname, 'default'),
       CASE WHEN (i.indoption[k.ord - 1] & 1) = 1 THEN 'DESC' ELSE 'ASC' END,
       CASE WHEN (i.indoption[k.ord - 1] & 2) = 2 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
JOIN generate_subscripts(i.indkey, 1) AS k(ord) ON true
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[k.ord]
LEFT JOIN pg_opclass opc ON opc.oid = i.indclass[k.ord - 1]
LEFT JOIN pg_collation coll ON coll.oid = i.indcollation[k.ord - 1]
WHERE n.nspname='{schema}' AND tc.relname='{table}' AND ic.relname='{index_name}'
ORDER BY k.ord;
""",
    )
    keys = []
    includes = []
    for row in key_rows:
        entry = {
            "ordinal": int(row[0]),
            "kind": row[1],
            "name": row[2],
            "collation": row[3],
            "opclass": row[4],
            "sort_direction": row[5],
            "nulls_ordering": row[6],
        }
        if row[1] == "include":
            includes.append(entry)
        else:
            keys.append(entry)
    return {
        "schema": schema,
        "owner_table": p[1],
        "name": p[0],
        "access_method": p[2],
        "unique": p[3] == "t",
        "primary": p[4] == "t",
        "valid": p[5] == "t",
        "ready": p[6] == "t",
        "predicate": p[7] or None,
        "definition": p[8],
        "keys": keys,
        "include_columns": includes,
    }


def build_complete_catalog_inventory(run_sql: Callable[[str], str]) -> dict[str, Any]:
    schemas = [r[0] for r in _rows(run_sql, "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1;")]
    tables: dict[str, dict[str, Any]] = {}
    for table, col, fmt, nullable, default, identity, generated in _rows(
        run_sql,
        """
SELECT c.relname, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
       CASE WHEN a.attnotnull THEN false ELSE true END,
       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), ''),
       COALESCE(a.attidentity, ''), COALESCE(a.attgenerated, '')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname='public' AND c.relkind='r' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;
""",
    ):
        tables.setdefault(table, {"columns": {}})
        tables[table]["columns"][col] = {
            "format_type": fmt,
            "nullable": nullable == "t",
            "default": re.sub(r"\s+", " ", default.strip()) if default else None,
            "identity": identity or None,
            "generated": generated or None,
        }

    enums: dict[str, list[str]] = {}
    for typname, labels in _rows(
        run_sql,
        """
SELECT t.typname, string_agg(e.enumlabel, E'\\x1f' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname='public' AND t.typtype='e'
GROUP BY t.typname ORDER BY t.typname;
""",
    ):
        enums[typname] = labels.split("\x1f") if labels else []

    types = []
    for row in _rows(
        run_sql,
        """
SELECT t.typname, pg_catalog.format_type(t.oid, NULL), t.typtype::text
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname='public' AND t.typtype IN ('e','c','d') ORDER BY t.typname;
""",
    ):
        types.append({"name": row[0], "format_type": row[1], "kind": row[2]})

    constraints = []
    for name, table, kind, definition, deferrable, deferred, validated in _rows(
        run_sql,
        """
SELECT con.conname, rel.relname, con.contype::text, pg_get_constraintdef(con.oid, true),
       con.condeferrable, con.condeferred, con.convalidated
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public'
ORDER BY con.conname;
""",
    ):
        constraints.append(
            {
                "name": name,
                "owner_table": table,
                "type": kind,
                "definition": re.sub(r"\s+", " ", definition.strip()),
                "deferrable": deferrable == "t",
                "initially_deferred": deferred == "t",
                "validated": validated == "t",
            }
        )

    indexes = []
    for idx_name, table in _rows(
        run_sql,
        """
SELECT ic.relname, tc.relname
FROM pg_index ix
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
WHERE n.nspname='public'
ORDER BY ic.relname;
""",
    ):
        detail = read_index_detail(run_sql, "public", table, idx_name)
        if detail:
            indexes.append(detail)

    sequences = []
    for name, table, col, start, minv, maxv, inc in _rows(
        run_sql,
        """
SELECT seq.relname, tbl.relname, att.attname, s.seqstart, s.seqmin, s.seqmax, s.seqincrement
FROM pg_sequence s
JOIN pg_class seq ON seq.oid = s.seqrelid
JOIN pg_namespace n ON n.oid = seq.relnamespace
LEFT JOIN pg_depend d ON d.objid = seq.oid AND d.deptype = 'a'
LEFT JOIN pg_class tbl ON tbl.oid = d.refobjid
LEFT JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = d.refobjsubid
WHERE n.nspname='public' AND seq.relkind='S'
ORDER BY seq.relname;
""",
    ):
        sequences.append({"name": name, "owner_table": table or None, "column": col or None, "start": start, "min": minv, "max": maxv, "increment": inc})

    views = []
    for name, definition in _rows(
        run_sql,
        """
SELECT c.relname, pg_get_viewdef(c.oid, true)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname;
""",
    ):
        views.append({"name": name, "definition": re.sub(r"\s+", " ", definition.strip())})

    inventory = {
        "schemas": schemas,
        "tables": tables,
        "enums": enums,
        "types": types,
        "constraints": {c["name"]: c for c in constraints},
        "indexes": {i["name"]: i for i in indexes},
        "sequences": {s["name"]: s for s in sequences},
        "views": {v["name"]: v for v in views},
    }
    canonical = json.dumps(inventory, sort_keys=True, separators=(",", ":"))
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-corrective",
        "inventory": inventory,
        "object_counts": {
            "schemas": len(schemas),
            "tables": len(tables),
            "enums": len(enums),
            "types": len(types),
            "constraints": len(constraints),
            "indexes": len(indexes),
            "sequences": len(sequences),
            "views": len(views),
        },
        "fingerprint_sha256": sha256_text(canonical),
    }
