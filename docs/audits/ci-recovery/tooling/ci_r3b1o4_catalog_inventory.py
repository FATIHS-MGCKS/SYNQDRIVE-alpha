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
SELECT s.idx + 1 AS ordinal,
       'key' AS kind,
       COALESCE(a.attname, pg_get_indexdef(i.indexrelid, s.idx + 1, true)) AS colname,
       COALESCE(coll.collname, 'default') AS collation,
       COALESCE(opc.opcname, 'default') AS opclass,
       CASE WHEN (i.indoption[s.idx] & 1) = 1 THEN 'DESC' ELSE 'ASC' END AS sort_direction,
       CASE WHEN (i.indoption[s.idx] & 2) = 2 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END AS nulls_ordering
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
JOIN generate_series(0, GREATEST(i.indnkeyatts - 1, 0)) AS s(idx) ON true
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[s.idx]
LEFT JOIN pg_opclass opc ON opc.oid = i.indclass[s.idx]
LEFT JOIN pg_collation coll ON coll.oid = i.indcollation[s.idx]
WHERE n.nspname='{schema}' AND tc.relname='{table}' AND ic.relname='{index_name}'
ORDER BY s.idx;
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
    include_rows = _rows(
        run_sql,
        f"""
SELECT s.idx + 1 + i.indnkeyatts AS ordinal,
       'include' AS kind,
       COALESCE(a.attname, pg_get_indexdef(i.indexrelid, s.idx + 1 + i.indnkeyatts, true)) AS colname,
       COALESCE(coll.collname, 'default') AS collation,
       COALESCE(opc.opcname, 'default') AS opclass,
       'ASC' AS sort_direction,
       'NULLS LAST' AS nulls_ordering
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
JOIN generate_series(0, GREATEST(i.indnatts - i.indnkeyatts - 1, 0)) AS s(idx) ON i.indnatts > i.indnkeyatts
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[i.indnkeyatts + s.idx]
LEFT JOIN pg_opclass opc ON opc.oid = i.indclass[i.indnkeyatts + s.idx]
LEFT JOIN pg_collation coll ON coll.oid = i.indcollation[i.indnkeyatts + s.idx]
WHERE n.nspname='{schema}' AND tc.relname='{table}' AND ic.relname='{index_name}'
ORDER BY s.idx;
""",
    )
    for row in include_rows:
        includes.append(
            {
                "ordinal": int(row[0]),
                "kind": row[1],
                "name": row[2],
                "collation": row[3],
                "opclass": row[4],
                "sort_direction": row[5],
                "nulls_ordering": row[6],
            }
        )
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

    types: dict[str, dict[str, Any]] = {}
    for name, fmt, kind, related_table, element_type, category in _rows(
        run_sql,
        """
SELECT t.typname,
       pg_catalog.format_type(t.oid, NULL),
       t.typtype::text,
       COALESCE(rel.relname, ''),
       COALESCE(elem.typname, ''),
       t.typcategory::text
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_class rel ON rel.oid = t.typrelid
LEFT JOIN pg_type elem ON elem.oid = t.typelem
WHERE n.nspname='public'
  AND t.typisdefined
  AND t.typtype IN ('b','c','d','e','p','r','m')
ORDER BY t.typname;
""",
    ):
        types[name] = {
            "name": name,
            "format_type": fmt,
            "kind": kind,
            "category": category,
            "related_table": related_table or None,
            "element_type": element_type or None,
        }

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
