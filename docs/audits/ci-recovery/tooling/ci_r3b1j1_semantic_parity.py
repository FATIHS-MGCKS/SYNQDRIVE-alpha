"""Strict catalog semantic parity comparator for CI-R3B1J.1."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1j1_constants import TABLE_252, load_canonical_renames


def _approved_name(historical: str, renames: dict[str, str]) -> str:
    return renames.get(historical, historical)


def extract_full_catalog_state(cfg, db: str, psql_fn, table: str) -> dict[str, Any]:
    cols_proc = psql_fn(
        cfg,
        db,
        f"""
SELECT a.attname,
       format_type(a.atttypid, a.atttypmod) AS pg_type,
       NOT a.attnotnull AS nullable,
       pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname = '{table}' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
""",
        tuples_only=True,
    )
    columns = []
    for line in (cols_proc.stdout or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != 4:
            continue
        columns.append(
            {
                "name": parts[0],
                "pg_type": parts[1],
                "nullable": parts[2] == "t",
                "default": parts[3] if parts[3] else None,
            }
        )

    pk_proc = psql_fn(
        cfg,
        db,
        f"""
SELECT con.conname, array_agg(a.attname ORDER BY u.ord) AS cols
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum
WHERE n.nspname='public' AND rel.relname='{table}' AND con.contype='p'
GROUP BY con.conname;
""",
        tuples_only=True,
    )
    pks = []
    for line in (pk_proc.stdout or "").splitlines():
        if not line.strip():
            continue
        name, cols = line.split("|", 1)
        pks.append({"name": name, "columns": cols.strip("{}").split(",") if cols else []})

    idx_proc = psql_fn(
        cfg,
        db,
        f"""
SELECT ci.relname, ix.indisunique, ix.indisprimary,
       pg_get_indexdef(ci.oid) AS indexdef
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class ci ON ci.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public' AND t.relname='{table}';
""",
        tuples_only=True,
    )
    indexes = []
    for line in (idx_proc.stdout or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 3)
        if len(parts) != 4:
            continue
        indexes.append(
            {
                "name": parts[0],
                "unique": parts[1] == "t",
                "primary": parts[2] == "t",
                "indexdef": parts[3],
            }
        )

    fk_proc = psql_fn(
        cfg,
        db,
        f"""
SELECT con.conname,
       array_agg(sa.attname ORDER BY su.ord) AS src_cols,
       rt.relname AS tgt_table,
       array_agg(ta.attname ORDER BY tu.ord) AS tgt_cols,
       con.confupdtype, con.confdeltype
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace n ON n.oid = src.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS su(attnum, ord) ON true
JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = su.attnum
JOIN pg_class rt ON rt.oid = con.confrelid
JOIN unnest(con.confkey) WITH ORDINALITY AS tu(attnum, ord) ON tu.ord = su.ord
JOIN pg_attribute ta ON ta.attrelid = con.confrelid AND ta.attnum = tu.attnum
WHERE n.nspname='public' AND src.relname='{table}' AND con.contype='f'
GROUP BY con.conname, rt.relname, con.confupdtype, con.confdeltype;
""",
        tuples_only=True,
    )
    fks = []
    action_map = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}
    for line in (fk_proc.stdout or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != 6:
            continue
        fks.append(
            {
                "name": parts[0],
                "source_columns": parts[1].strip("{}").split(","),
                "target_table": parts[2],
                "target_columns": parts[3].strip("{}").split(","),
                "on_update": action_map.get(parts[4], parts[4]),
                "on_delete": action_map.get(parts[5], parts[5]),
            }
        )

    return {"table": table, "columns": columns, "primary_keys": pks, "indexes": indexes, "foreign_keys": fks}


def _normalize_default(expr: str | None) -> str | None:
    if expr is None:
        return None
    e = expr.strip()
    e = re.sub(r"::[\w\s\"]+", "", e)
    e = e.replace("now()", "CURRENT_TIMESTAMP").replace("timezone('utc'::text, now())", "CURRENT_TIMESTAMP")
    return e.upper()


def _normalize_type(expected: str, actual: str) -> bool:
    exp = expected.upper().replace("TIMESTAMP(3)", "TIMESTAMP WITHOUT TIME ZONE").replace("TEXT", "TEXT")
    act = actual.upper()
    if "TIMESTAMP" in exp and "TIMESTAMP" in act:
        return True
    if exp.startswith("JSONB") and act == "JSONB":
        return True
    if exp == "TEXT" and act == "TEXT":
        return True
    return exp == act


def _index_columns_from_def(indexdef: str) -> list[str]:
    m = re.search(r"\(([^)]+)\)", indexdef)
    if not m:
        return []
    return [c.strip().strip('"') for c in m.group(1).split(",")]


def compare_semantic_parity(expected: dict, actual: dict, renames: dict[str, str] | None = None) -> dict[str, Any]:
    renames = renames or load_canonical_renames()
    mismatches: list[dict] = []
    approved_diffs: list[dict] = []

    exp_table = expected["tables"][0]
    act_cols = {c["name"]: c for c in actual["columns"]}
    for col in exp_table["columns"]:
        act = act_cols.get(col["name"])
        if not act:
            mismatches.append({"category": "MISSING_OBJECT", "object": f"column:{col['name']}"})
            continue
        if not _normalize_type(col["postgres_type"], act["pg_type"]):
            mismatches.append({"category": "COLUMN_TYPE", "column": col["name"], "expected": col["postgres_type"], "actual": act["pg_type"]})
        if col["nullable"] != act["nullable"]:
            mismatches.append({"category": "COLUMN_NULLABILITY", "column": col["name"], "expected": col["nullable"], "actual": act["nullable"]})
        exp_def = _normalize_default(col.get("default"))
        act_def = _normalize_default(act.get("default"))
        if exp_def != act_def:
            if col.get("default") and "CURRENT_TIMESTAMP" in col["default"].upper() and act_def == "CURRENT_TIMESTAMP":
                pass
            elif col.get("default") is None and act_def is None:
                pass
            else:
                mismatches.append({"category": "COLUMN_DEFAULT", "column": col["name"], "expected": col.get("default"), "actual": act.get("default")})

    exp_pk = expected["primary_keys"][0]
    act_pk = actual["primary_keys"][0] if actual["primary_keys"] else None
    if not act_pk:
        mismatches.append({"category": "MISSING_OBJECT", "object": "primary_key"})
    else:
        if exp_pk["columns"] != act_pk["columns"]:
            mismatches.append({"category": "PK_COLUMNS", "expected": exp_pk["columns"], "actual": act_pk["columns"]})
        approved = _approved_name(exp_pk["historical_name"], renames)
        if act_pk["name"] != approved:
            mismatches.append({"category": "OTHER", "object": "pk_name", "expected": approved, "actual": act_pk["name"]})
        elif act_pk["name"] != exp_pk["historical_name"]:
            approved_diffs.append({"object_id": exp_pk["object_id"], "historical": exp_pk["historical_name"], "actual": act_pk["name"]})

    exp_uniques = expected["unique_indexes"]
    act_unique_idxs = [i for i in actual["indexes"] if i["unique"] and not i["primary"]]
    if len(exp_uniques) != len(act_unique_idxs):
        mismatches.append({"category": "MISSING_OBJECT" if len(act_unique_idxs) < len(exp_uniques) else "UNEXPECTED_OBJECT", "object": "unique_indexes", "expected_count": len(exp_uniques), "actual_count": len(act_unique_idxs)})
    else:
        for exp in exp_uniques:
            match = None
            for act in act_unique_idxs:
                if _index_columns_from_def(act["indexdef"]) == exp["columns"]:
                    match = act
                    break
            if not match:
                mismatches.append({"category": "UNIQUE_DEFINITION", "expected_columns": exp["columns"]})
            else:
                approved = _approved_name(exp["historical_name"], renames)
                if match["name"] != approved:
                    mismatches.append({"category": "UNIQUE_DEFINITION", "expected_name": approved, "actual_name": match["name"]})
                elif match["name"] != exp["historical_name"]:
                    approved_diffs.append({"object_id": exp["object_id"], "historical": exp["historical_name"], "actual": match["name"]})

    exp_indexes = expected["indexes"]
    act_plain = [i for i in actual["indexes"] if not i["unique"]]
    if len(exp_indexes) != len(act_plain):
        mismatches.append({"category": "INDEX_DEFINITION", "expected_count": len(exp_indexes), "actual_count": len(act_plain)})
    else:
        for exp in exp_indexes:
            match = None
            for act in act_plain:
                if _index_columns_from_def(act["indexdef"]) == exp["columns"]:
                    match = act
                    break
            if not match:
                mismatches.append({"category": "INDEX_DEFINITION", "expected_columns": exp["columns"]})
            else:
                approved = _approved_name(exp["historical_name"], renames)
                if match["name"] != approved:
                    mismatches.append({"category": "INDEX_DEFINITION", "expected_name": approved, "actual_name": match["name"]})
                elif match["name"] != exp["historical_name"]:
                    approved_diffs.append({"object_id": exp["object_id"], "historical": exp["historical_name"], "actual": match["name"]})

    exp_fks = expected["foreign_keys"]
    if len(exp_fks) != len(actual["foreign_keys"]):
        mismatches.append({"category": "FK_ENDPOINTS", "expected_count": len(exp_fks), "actual_count": len(actual["foreign_keys"])})
    else:
        for exp in exp_fks:
            match = None
            for act in actual["foreign_keys"]:
                if (
                    act["source_columns"] == exp["source_columns"]
                    and act["target_table"] == exp["target_table"]
                    and act["target_columns"] == exp["target_columns"]
                ):
                    match = act
                    break
            if not match:
                mismatches.append({"category": "FK_ENDPOINTS", "expected": exp["source_columns"], "target": exp["target_table"]})
            else:
                if match["on_delete"] != exp["on_delete"]:
                    mismatches.append({"category": "FK_ACTIONS", "field": "on_delete", "expected": exp["on_delete"], "actual": match["on_delete"]})
                if match["on_update"] != exp["on_update"]:
                    mismatches.append({"category": "FK_ACTIONS", "field": "on_update", "expected": exp["on_update"], "actual": match["on_update"]})
                approved = _approved_name(exp["historical_name"], renames)
                if match["name"] != approved:
                    mismatches.append({"category": "FK_ENDPOINTS", "expected_name": approved, "actual_name": match["name"]})
                elif match["name"] != exp["historical_name"]:
                    approved_diffs.append({"object_id": exp["object_id"], "historical": exp["historical_name"], "actual": match["name"]})

    unexpected = [c for c in actual["columns"] if c["name"] not in {x["name"] for x in exp_table["columns"]}]
    for c in unexpected:
        mismatches.append({"category": "UNEXPECTED_OBJECT", "object": f"column:{c['name']}"})

    return {
        "expected_object_count": len(exp_table["columns"]) + len(expected["primary_keys"]) + len(exp_uniques) + len(exp_indexes) + len(exp_fks),
        "mismatch_count": len(mismatches),
        "mismatch_categories": sorted({m["category"] for m in mismatches}),
        "mismatches": mismatches,
        "approved_identifier_only_differences": approved_diffs,
        "unexpected_object_count": len([m for m in mismatches if m["category"] == "UNEXPECTED_OBJECT"]),
        "missing_object_count": len([m for m in mismatches if m["category"] == "MISSING_OBJECT"]),
        "pass": len(mismatches) == 0,
    }
