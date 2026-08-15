"""M252 canonical physical authority and catalog parity for CI-R3B1O.1."""
from __future__ import annotations

import json
import re
from typing import Any, Callable

from ci_r3b1o1_constants import M252, M252_AUTHORITY_MANIFEST, M252_TABLE, MIG_ROOT


def load_approved_identifier_mappings() -> dict[str, str]:
    doc = json.loads(M252_AUTHORITY_MANIFEST.read_text())
    return doc["approved_mappings"]


def build_m252_physical_authority() -> dict[str, Any]:
    sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    approved = load_approved_identifier_mappings()
    columns = []
    create_match = re.search(
        rf'CREATE TABLE "{re.escape(M252_TABLE)}"\s*\((.*?)\);',
        sql,
        re.I | re.S,
    )
    body = create_match.group(1) if create_match else ""
    for m in re.finditer(r'"([^"]+)"\s+([^,\n]+(?:\([^)]*\))?[^,\n]*)', body):
        col = m.group(1)
        if col.endswith("_pkey") or "CONSTRAINT" in col.upper():
            continue
        definition = m.group(2).strip().rstrip(",")
        nullable = "NOT NULL" not in definition.upper()
        default = None
        dm = re.search(r"DEFAULT\s+(.+)$", definition, re.I)
        if dm:
            default = dm.group(1).strip()
        columns.append(
            {
                "name": col,
                "definition": definition,
                "nullable": nullable,
                "default": default,
            }
        )
    pk = approved["organization_role_assignment_drift_reconciliation_applications_pkey"]
    unique = approved["organization_role_assignment_drift_reconciliation_applications_idempotency_key_key"]
    index = approved[
        "organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx"
    ]
    fk_org = approved["organization_role_assignment_drift_reconciliation_applications_organization_id_fkey"]
    fk_mem = approved["organization_role_assignment_drift_reconciliation_applications_membership_id_fkey"]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "source_migration": M252,
        "table": M252_TABLE,
        "approved_identifier_mappings": approved,
        "columns": columns,
        "primary_key": {"name": pk, "columns": ["id"]},
        "unique_constraints": [{"name": unique, "columns": ["idempotency_key"], "unique_index": True}],
        "indexes": [
            {
                "name": index,
                "columns": ["organization_id", "membership_id", "created_at"],
                "unique": False,
            }
        ],
        "foreign_keys": [
            {
                "name": fk_org,
                "columns": ["organization_id"],
                "referenced_table": "organizations",
                "referenced_columns": ["id"],
                "on_update": "CASCADE",
                "on_delete": "CASCADE",
            },
            {
                "name": fk_mem,
                "columns": ["membership_id"],
                "referenced_table": "organization_memberships",
                "referenced_columns": ["id"],
                "on_update": "CASCADE",
                "on_delete": "CASCADE",
            },
        ],
    }


def _catalog_m252_snapshot(run_sql: Callable[[str], str]) -> dict[str, Any]:
    cols = {}
    for line in run_sql(
        f"""
SELECT a.attname,
       pg_catalog.format_type(a.atttypid, a.atttypmod),
       CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '')
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
        parts = line.split("|")
        if len(parts) >= 4:
            cols[parts[0]] = {
                "type": parts[1],
                "nullable": parts[2],
                "default": parts[3] or None,
            }
    constraints = []
    for line in run_sql(
        f"""
SELECT con.conname, con.contype::text, pg_get_constraintdef(con.oid, true)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='{M252_TABLE}'
ORDER BY con.conname;
"""
    ).splitlines():
        if not line.strip():
            continue
        name, kind, defn = line.split("|", 2)
        constraints.append({"name": name, "kind": kind, "definition": defn.lower()})
    indexes = []
    for line in run_sql(
        f"""
SELECT ic.relname, pg_get_indexdef(ix.indexrelid, 0, true), ix.indisunique
FROM pg_index ix
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
WHERE n.nspname='public' AND tc.relname='{M252_TABLE}'
ORDER BY ic.relname;
"""
    ).splitlines():
        if not line.strip():
            continue
        name, defn, unique = line.split("|", 2)
        indexes.append({"name": name, "definition": defn.lower(), "unique": unique == "t"})
    table_exists = run_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip()
    return {
        "table_exists": table_exists == "1",
        "columns": cols,
        "constraints": constraints,
        "indexes": indexes,
    }


def compare_m252_exact_parity(authority: dict[str, Any], run_sql: Callable[[str], str]) -> dict[str, Any]:
    actual = _catalog_m252_snapshot(run_sql)
    mismatches: list[dict[str, Any]] = []
    if not actual["table_exists"]:
        mismatches.append({"kind": "table", "issue": "missing"})
        return {"pass": False, "mismatches": mismatches, "actual": actual}

    expected_cols = {c["name"]: c for c in authority["columns"]}
    for name, exp in expected_cols.items():
        act = actual["columns"].get(name)
        if not act:
            mismatches.append({"kind": "column", "name": name, "issue": "missing"})
            continue
        if "jsonb" in exp["definition"].lower() and "jsonb" not in act["type"].lower():
            mismatches.append({"kind": "column_type", "name": name, "expected": exp["definition"], "actual": act["type"]})
        if ("NOT NULL" in exp["definition"].upper()) != (act["nullable"] == "NO"):
            mismatches.append({"kind": "column_nullability", "name": name, "expected_not_null": "NOT NULL" in exp["definition"].upper(), "actual": act["nullable"]})

    pk_name = authority["primary_key"]["name"]
    if not any(c["name"] == pk_name and c["kind"] == "p" for c in actual["constraints"]):
        mismatches.append({"kind": "primary_key", "expected": pk_name, "issue": "missing_or_wrong_name"})

    uq_name = authority["unique_constraints"][0]["name"]
    if not any(i["name"] == uq_name for i in actual["indexes"]):
        mismatches.append({"kind": "unique_index", "expected": uq_name, "issue": "missing_or_wrong_name"})

    idx_name = authority["indexes"][0]["name"]
    if not any(i["name"] == idx_name for i in actual["indexes"]):
        mismatches.append({"kind": "nonunique_index", "expected": idx_name, "issue": "missing_or_wrong_name"})

    for fk in authority["foreign_keys"]:
        con = next((c for c in actual["constraints"] if c["name"] == fk["name"]), None)
        if not con:
            mismatches.append({"kind": "foreign_key", "expected": fk["name"], "issue": "missing"})
            continue
        if fk["referenced_table"] not in con["definition"]:
            mismatches.append({"kind": "foreign_key_target", "name": fk["name"], "definition": con["definition"]})
        if "on delete cascade" not in con["definition"]:
            mismatches.append({"kind": "foreign_key_action", "name": fk["name"], "field": "on_delete"})
        if "on update cascade" not in con["definition"]:
            mismatches.append({"kind": "foreign_key_action", "name": fk["name"], "field": "on_update"})

    expected_names = {authority["primary_key"]["name"], uq_name, idx_name}
    expected_names.update(fk["name"] for fk in authority["foreign_keys"])
    unexpected = [
        obj
        for obj in actual["indexes"] + [{"name": c["name"]} for c in actual["constraints"]]
        if obj["name"] not in expected_names and not obj["name"].endswith("_pkey")
    ]
    if unexpected:
        mismatches.append({"kind": "unexpected_objects", "objects": [o["name"] for o in unexpected[:10]]})

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "pass": len(mismatches) == 0,
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
        "actual": actual,
    }
