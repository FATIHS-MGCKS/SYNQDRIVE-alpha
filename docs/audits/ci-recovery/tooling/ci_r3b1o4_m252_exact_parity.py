"""Corrective hardened M252 exact parity with full index metadata (CI-R3B1O.4)."""
from __future__ import annotations

import re
from typing import Any, Callable

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_catalog_inventory import read_index_detail

MATCH_MAP = {"SIMPLE": "s", "FULL": "f", "PARTIAL": "p"}
ACTION_MAP = {"NO ACTION": "a", "RESTRICT": "r", "CASCADE": "c", "SET NULL": "n", "SET DEFAULT": "d"}


def _default_opclass(column_name: str, authority_columns: dict[str, dict[str, Any]]) -> str:
    col = authority_columns.get(column_name, {})
    fmt = str(col.get("format_type") or "").lower()
    if "timestamp" in fmt:
        return "timestamp_ops"
    if "json" in fmt:
        return "jsonb_ops"
    if column_name == "membership_id":
        return "text_ops"
    return "default"


def _default_key(name: str, ordinal: int, authority_columns: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    authority_columns = authority_columns or {}
    return {
        "ordinal": ordinal,
        "kind": "key",
        "name": name,
        "collation": "default",
        "opclass": _default_opclass(name, authority_columns),
        "sort_direction": "ASC",
        "nulls_ordering": "NULLS LAST",
    }


def read_m252_catalog(run_sql: Callable[[str], str]) -> dict[str, Any]:
    table_exists = (
        run_sql(f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';").strip() == "1"
    )
    if not table_exists:
        return {"table_exists": False, "columns": [], "primary_key": None, "unique_index": None, "composite_index": None, "foreign_keys": [], "unexpected_objects": []}

    columns = []
    for line in run_sql(
        f"""
SELECT a.attnum, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
       NOT a.attnotnull, COALESCE(pg_get_expr(ad.adbin, ad.adrelid), ''), a.attidentity, a.attgenerated
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname='public' AND c.relname='{M252_TABLE}' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
"""
    ).splitlines():
        if not line.strip():
            continue
        p = line.split("|")
        columns.append({"ordinal": int(p[0]), "name": p[1], "format_type": p[2], "nullable": p[3] == "t", "default": p[4] or None, "identity": p[5] or "", "generated": p[6] or ""})

    authority = build_m252_complete_physical_authority()
    pk_row = [ln for ln in run_sql(
        f"""
SELECT con.conname,
       array_to_string(array(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord), ','),
       con.condeferrable, con.condeferred, con.convalidated
FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname='public' AND rel.relname='{M252_TABLE}' AND con.contype='p';
"""
    ).splitlines() if ln.strip()]
    pk = None
    if pk_row:
        p = pk_row[0].split("|")
        pk = {"name": p[0], "columns": p[1].split(","), "deferrable": p[2] == "t", "initially_deferred": p[3] == "t", "validated": p[4] == "t"}

    def read_fk(name: str) -> dict[str, Any] | None:
        rows = [ln for ln in run_sql(
            f"""
SELECT con.conname, rel.relname,
       array_to_string(array(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord), ','),
       frel.relname,
       array_to_string(array(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord), ','),
       con.confmatchtype, con.confupdtype, con.confdeltype, con.condeferrable, con.condeferred, con.convalidated
FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_class frel ON frel.oid = con.confrelid
WHERE nsp.nspname='public' AND rel.relname='{M252_TABLE}' AND con.contype='f' AND con.conname='{name}';
"""
        ).splitlines() if ln.strip()]
        if not rows:
            return None
        p = rows[0].split("|")
        return {"name": p[0], "source_table": p[1], "source_columns": p[2].split(","), "target_table": p[3], "target_columns": p[4].split(","), "match_type": p[5], "on_update": p[6], "on_delete": p[7], "deferrable": p[8] == "t", "initially_deferred": p[9] == "t", "validated": p[10] == "t"}

    known = {authority["primary_key"]["name"], authority["unique_index"]["name"], authority["composite_index"]["name"]}
    known.update(fk["name"] for fk in authority["foreign_keys"])
    unexpected = []
    for line in run_sql(
        f"""
SELECT ic.relname, 'index' FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
WHERE n.nspname='public' AND tc.relname='{M252_TABLE}'
UNION ALL
SELECT con.conname, 'constraint' FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='{M252_TABLE}' AND con.contype IN ('f','p','u');
"""
    ).splitlines():
        if line.strip():
            name, kind = line.split("|", 1)
            if name not in known:
                unexpected.append({"name": name, "kind": kind})

    unique_index = read_index_detail(run_sql, "public", M252_TABLE, authority["unique_index"]["name"])
    composite_index = read_index_detail(run_sql, "public", M252_TABLE, authority["composite_index"]["name"])
    return {
        "table_exists": True,
        "columns": columns,
        "primary_key": pk,
        "unique_index": unique_index,
        "composite_index": composite_index,
        "foreign_keys": [fk for fk in (read_fk(f["name"]) for f in authority["foreign_keys"]) if fk],
        "unexpected_objects": unexpected,
    }


def _norm_default(val: str | None) -> str:
    return re.sub(r"\s+", " ", (val or "").strip().lower())


def _norm_type(val: str) -> str:
    out = re.sub(r"\s+", " ", val.strip().lower())
    if out.startswith("timestamp(") and "without time zone" not in out:
        out = f"{out} without time zone"
    return out


def _expected_keys(columns: list[str], authority: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    col_map = {c["name"]: c for c in (authority or {}).get("columns", [])}
    return [_default_key(name, idx + 1, col_map) for idx, name in enumerate(columns)]


def _compare_index(exp: dict[str, Any], act: dict[str, Any] | None, label: str, authority: dict[str, Any] | None = None) -> list[str]:
    mismatches: list[str] = []
    if not act:
        return [f"{label}:missing"]
    for field in ["name", "access_method", "unique", "valid", "ready", "predicate"]:
        if act.get(field) != exp.get(field):
            mismatches.append(f"{label}:{field}")
    expected_keys = _expected_keys(exp["columns"], authority)
    if act.get("keys") != expected_keys:
        mismatches.append(f"{label}:keys")
    if act.get("include_columns") != exp.get("include_columns", []):
        mismatches.append(f"{label}:include_columns")
    for idx, key in enumerate(expected_keys):
        actual_key = (act.get("keys") or [{}])[idx] if idx < len(act.get("keys") or []) else {}
        for sub in ["collation", "opclass", "sort_direction", "nulls_ordering"]:
            if actual_key.get(sub) != key.get(sub):
                mismatches.append(f"{label}:{sub}")
    return mismatches


def compare_m252_exact(authority: dict[str, Any], catalog: dict[str, Any]) -> dict[str, Any]:
    categories = {
        "TABLE": {"pass": catalog.get("table_exists") is True, "mismatches": [] if catalog.get("table_exists") else ["missing"]},
        "COLUMNS": {"pass": True, "mismatches": []},
        "PK": {"pass": True, "mismatches": []},
        "UNIQUE": {"pass": True, "mismatches": []},
        "COMPOSITE_INDEX": {"pass": True, "mismatches": []},
        "ORG_FK": {"pass": True, "mismatches": []},
        "MEMBERSHIP_FK": {"pass": True, "mismatches": []},
        "UNEXPECTED_OBJECTS": {"pass": True, "mismatches": []},
    }
    if not catalog.get("table_exists"):
        return _finalize(categories, catalog)

    exp_by_name = {c["name"]: c for c in authority["columns"]}
    for name, exp in exp_by_name.items():
        act = next((c for c in catalog["columns"] if c["name"] == name), None)
        if not act:
            categories["COLUMNS"]["pass"] = False
            categories["COLUMNS"]["mismatches"].append(f"missing {name}")
            continue
        for label, e_val, a_val in [
            ("type", _norm_type(exp["format_type"]), _norm_type(act["format_type"])),
            ("nullable", exp["nullable"], act["nullable"]),
            ("default", _norm_default(exp.get("default")), _norm_default(act.get("default"))),
            ("identity", str(exp.get("identity") or ""), str(act.get("identity") or "")),
            ("generated", str(exp.get("generated") or ""), str(act.get("generated") or "")),
        ]:
            if e_val != a_val:
                categories["COLUMNS"]["pass"] = False
                categories["COLUMNS"]["mismatches"].append(f"{label} {name}")

    if {c["name"] for c in catalog["columns"]} != set(exp_by_name):
        categories["COLUMNS"]["pass"] = False
        categories["COLUMNS"]["mismatches"].append("unexpected columns")

    pk_exp, pk_act = authority["primary_key"], catalog.get("primary_key")
    if not pk_act or pk_act["name"] != pk_exp["name"] or pk_act["columns"] != pk_exp["columns"]:
        categories["PK"]["pass"] = False
        categories["PK"]["mismatches"].append("pk shape")
    elif any(pk_act.get(k) != pk_exp.get(k) for k in ["deferrable", "initially_deferred", "validated"]):
        categories["PK"]["pass"] = False
        categories["PK"]["mismatches"].append("pk semantics")

    for cat, key in [("UNIQUE", "unique_index"), ("COMPOSITE_INDEX", "composite_index")]:
        mism = _compare_index(authority[key], catalog.get(key), key, authority)
        if mism:
            categories[cat]["pass"] = False
            categories[cat]["mismatches"].extend(mism)

    act_fks = {fk["name"]: fk for fk in catalog.get("foreign_keys", [])}
    for cat, exp in [("ORG_FK", authority["foreign_keys"][0]), ("MEMBERSHIP_FK", authority["foreign_keys"][1])]:
        act = act_fks.get(exp["name"])
        if not act:
            categories[cat]["pass"] = False
            categories[cat]["mismatches"].append("missing")
            continue
        for a, e, label in [
            (act["source_columns"], exp["source_columns"], "source"),
            (act["target_table"], exp["target_table"], "target"),
            (act["target_columns"], exp["target_columns"], "target cols"),
            (act["match_type"], MATCH_MAP[exp["match_type"]], "match"),
            (act["on_update"], ACTION_MAP[exp["on_update"]], "on update"),
            (act["on_delete"], ACTION_MAP[exp["on_delete"]], "on delete"),
            (act["validated"], exp["validated"], "validated"),
            (act.get("deferrable"), exp.get("deferrable"), "deferrable"),
            (act.get("initially_deferred"), exp.get("initially_deferred"), "initially deferred"),
        ]:
            if a != e:
                categories[cat]["pass"] = False
                categories[cat]["mismatches"].append(label)

    if catalog.get("unexpected_objects"):
        categories["UNEXPECTED_OBJECTS"]["pass"] = False
        categories["UNEXPECTED_OBJECTS"]["mismatches"] = [o["name"] for o in catalog["unexpected_objects"]]

    return _finalize(categories, catalog)


def _finalize(categories: dict[str, Any], catalog: dict[str, Any]) -> dict[str, Any]:
    semantic = sum(len(v.get("mismatches", [])) for v in categories.values())
    return {"schema_version": 1, "phase": "CI-R3B1O.4-corrective", "categories": categories, "semantic_mismatch_count": semantic, "pass": semantic == 0, "catalog": catalog}


def run_m252_exact_parity(run_sql: Callable[[str], str], authority: dict[str, Any] | None = None) -> dict[str, Any]:
    authority = authority or build_m252_complete_physical_authority()
    return compare_m252_exact(authority, read_m252_catalog(run_sql))


def make_canonical_catalog_fixture() -> dict[str, Any]:
    authority = build_m252_complete_physical_authority()
    type_map = {"result": "jsonb", "created_at": "timestamp(3) without time zone"}
    pg_type_map = {"TEXT": "text", "JSONB": "jsonb", "TIMESTAMP(3)": "timestamp(3) without time zone"}
    cols = []
    for c in authority["columns"]:
        raw = c["format_type"].upper()
        fmt = type_map.get(c["name"])
        if not fmt:
            for key, val in pg_type_map.items():
                if raw.startswith(key):
                    fmt = val
                    break
        fmt = fmt or c["format_type"].lower()
        cols.append({"ordinal": c["ordinal"], "name": c["name"], "format_type": fmt, "nullable": c["nullable"], "default": c.get("default"), "identity": "", "generated": ""})

    def idx(name: str, columns: list[str], unique: bool) -> dict[str, Any]:
        return {
            "schema": "public",
            "owner_table": M252_TABLE,
            "name": name,
            "access_method": "btree",
            "unique": unique,
            "primary": False,
            "valid": True,
            "ready": True,
            "predicate": None,
            "definition": "",
            "keys": _expected_keys(columns, authority),
            "include_columns": [],
        }

    return {
        "table_exists": True,
        "columns": cols,
        "primary_key": {"name": authority["primary_key"]["name"], "columns": ["id"], "deferrable": False, "initially_deferred": False, "validated": True},
        "unique_index": idx(authority["unique_index"]["name"], authority["unique_index"]["columns"], True),
        "composite_index": idx(authority["composite_index"]["name"], authority["composite_index"]["columns"], False),
        "foreign_keys": [
            {
                "name": fk["name"],
                "source_table": M252_TABLE,
                "source_columns": fk["source_columns"],
                "target_table": fk["target_table"],
                "target_columns": fk["target_columns"],
                "match_type": MATCH_MAP[fk["match_type"]],
                "on_update": ACTION_MAP[fk["on_update"]],
                "on_delete": ACTION_MAP[fk["on_delete"]],
                "deferrable": False,
                "initially_deferred": False,
                "validated": True,
            }
            for fk in authority["foreign_keys"]
        ],
        "unexpected_objects": [],
    }
