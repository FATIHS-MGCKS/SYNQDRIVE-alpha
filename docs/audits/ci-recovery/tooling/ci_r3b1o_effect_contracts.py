"""Migration effect-equivalence contracts for CI-R3B1O."""
from __future__ import annotations

import re
from typing import Any, Callable

from ci_r3b1n2_effect_parser import parse_migration_effects
from ci_r3b1o_constants import M252, M252_TABLE, R3B1G, R3B1I


EffectClassification = str


def _normalize_type(fmt: str) -> str:
    return re.sub(r"\s+", " ", fmt.strip().lower())


def verify_add_column(
    *,
    table: str,
    column: str,
    definition: str,
    run_sql: Callable[[str], str],
) -> dict[str, Any]:
    rows = [
        ln.split("|")
        for ln in run_sql(
            f"""
SELECT pg_catalog.format_type(a.atttypid, a.atttypmod),
       CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
       COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname='public' AND c.relname='{table}' AND a.attname='{column}' AND a.attnum > 0 AND NOT a.attisdropped;
"""
        ).splitlines()
        if ln.strip()
    ]
    if not rows:
        return {
            "kind": "add_column",
            "table": table,
            "column": column,
            "present": False,
            "classification": "EFFECT_ABSENT",
        }
    col_type, nullable, default = rows[0]
    expected_not_null = "NOT NULL" in definition.upper()
    actual_not_null = nullable == "NO"
    type_ok = True
    if "jsonb" in definition.lower():
        type_ok = "jsonb" in _normalize_type(col_type)
    elif "TireSetupStatus" in definition:
        type_ok = "tiresetupstatus" in _normalize_type(col_type)
    null_ok = expected_not_null == actual_not_null
    default_ok = True
    if "DEFAULT" in definition.upper():
        default_ok = bool(default.strip())
    equivalent = type_ok and null_ok and default_ok
    return {
        "kind": "add_column",
        "table": table,
        "column": column,
        "present": True,
        "actual_type": col_type,
        "actual_nullable": nullable,
        "actual_default": default,
        "type_ok": type_ok,
        "null_ok": null_ok,
        "default_ok": default_ok,
        "classification": "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" if equivalent else "PARTIAL_EFFECT_PRESENT",
    }


def verify_create_table(table: str, run_sql: Callable[[str], str]) -> dict[str, Any]:
    exists = run_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{table}' AND table_type='BASE TABLE';"
    ).strip()
    return {
        "kind": "create_table",
        "table": table,
        "present": exists == "1",
        "classification": "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" if exists == "1" else "EFFECT_ABSENT",
    }


def verify_create_index(index: str, table: str, run_sql: Callable[[str], str]) -> dict[str, Any]:
    exists = run_sql(
        f"""
SELECT COUNT(*) FROM pg_class ic
JOIN pg_namespace n ON n.oid = ic.relnamespace
WHERE n.nspname='public' AND ic.relkind='i' AND ic.relname='{index}';
"""
    ).strip()
    return {
        "kind": "create_index",
        "index": index,
        "table": table,
        "present": exists == "1",
        "classification": "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" if exists == "1" else "EFFECT_ABSENT",
    }


def verify_add_fk(constraint: str, table: str, run_sql: Callable[[str], str]) -> dict[str, Any]:
    exists = run_sql(
        f"""
SELECT COUNT(*) FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='{table}' AND con.conname='{constraint}';
"""
    ).strip()
    return {
        "kind": "add_foreign_key",
        "constraint": constraint,
        "table": table,
        "present": exists == "1",
        "classification": "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" if exists == "1" else "EFFECT_ABSENT",
    }


def verify_primary_key(table: str, constraint: str, run_sql: Callable[[str], str]) -> dict[str, Any]:
    exists = run_sql(
        f"""
SELECT COUNT(*) FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='{table}' AND con.conname='{constraint}' AND con.contype='p';
"""
    ).strip()
    return {
        "kind": "primary_key",
        "table": table,
        "constraint": constraint,
        "present": exists == "1",
        "classification": "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" if exists == "1" else "EFFECT_ABSENT",
    }


def has_dml(sql: str) -> bool:
    return bool(re.search(r"\b(INSERT|UPDATE|DELETE)\b", sql, re.I))


def build_migration_effect_contract(
    migration: str,
    sql: str,
    *,
    run_sql: Callable[[str], str],
) -> dict[str, Any]:
    contract_id = f"EC_{migration}"
    if has_dml(sql):
        return {
            "contract_id": contract_id,
            "migration": migration,
            "classification": "DATA_DEPENDENT",
            "resolve_as_applied_allowed": False,
            "statements": [],
            "reason": "migration contains DML",
        }

    statements: list[dict[str, Any]] = []
    ordinal = 0

    for m in re.finditer(
        r'ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+"([^"]+)"(?:\s+([^;]+?))?(?:;|$)',
        sql,
        re.I | re.S,
    ):
        ordinal += 1
        eff = verify_add_column(
            table=m.group(1),
            column=m.group(2),
            definition=(m.group(3) or "").strip(),
            run_sql=run_sql,
        )
        eff["ordinal"] = ordinal
        eff["sql"] = m.group(0).strip()
        statements.append(eff)

    for m in re.finditer(r'CREATE TABLE\s+"([^"]+)"\s*\((.*?)\);', sql, re.I | re.S):
        ordinal += 1
        table = m.group(1)
        body = m.group(2)
        table_eff = verify_create_table(table, run_sql)
        table_eff["ordinal"] = ordinal
        table_eff["sql"] = f'CREATE TABLE "{table}" (...);'
        statements.append(table_eff)
        pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY KEY', body, re.I)
        if pk:
            ordinal += 1
            pk_eff = verify_primary_key(table, pk.group(1), run_sql)
            pk_eff["ordinal"] = ordinal
            pk_eff["sql"] = pk.group(0)
            statements.append(pk_eff)

    for m in re.finditer(r'CREATE (UNIQUE )?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"', sql, re.I):
        ordinal += 1
        eff = verify_create_index(m.group(2), m.group(3), run_sql)
        eff["ordinal"] = ordinal
        eff["sql"] = m.group(0)
        statements.append(eff)

    for m in re.finditer(
        r'ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"\s+FOREIGN KEY',
        sql,
        re.I,
    ):
        ordinal += 1
        eff = verify_add_fk(m.group(2), m.group(1), run_sql)
        eff["ordinal"] = ordinal
        eff["sql"] = m.group(0)
        statements.append(eff)

    if not statements:
        return {
            "contract_id": contract_id,
            "migration": migration,
            "classification": "EFFECT_UNKNOWN",
            "resolve_as_applied_allowed": False,
            "statements": [],
        }

    classes = [s["classification"] for s in statements]
    if all(c == "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" for c in classes):
        overall = "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT"
    elif any(c == "PARTIAL_EFFECT_PRESENT" for c in classes) or (
        any(c == "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT" for c in classes)
        and any(c == "EFFECT_ABSENT" for c in classes)
    ):
        overall = "PARTIAL_EFFECT_PRESENT"
    elif any(c == "EFFECT_ABSENT" for c in classes):
        overall = "EFFECT_ABSENT"
    else:
        overall = "EFFECT_UNKNOWN"

    return {
        "contract_id": contract_id,
        "migration": migration,
        "classification": overall,
        "resolve_as_applied_allowed": overall == "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT",
        "statements": statements,
    }


def build_all_effect_contracts(run_sql: Callable[[str], str], migrations_root) -> dict[str, Any]:
    contracts = []
    for migration in [R3B1G, R3B1I, M252]:
        sql = (migrations_root / migration / "migration.sql").read_text()
        contracts.append(build_migration_effect_contract(migration, sql, run_sql=run_sql))

    summary = {
        "total": len(contracts),
        "full_equivalent": sum(1 for c in contracts if c["classification"] == "FULL_EFFECT_ALREADY_PRESENT_EQUIVALENT"),
        "partial": sum(1 for c in contracts if c["classification"] == "PARTIAL_EFFECT_PRESENT"),
        "absent": sum(1 for c in contracts if c["classification"] == "EFFECT_ABSENT"),
        "unknown": sum(1 for c in contracts if c["classification"] in {"EFFECT_UNKNOWN", "DATA_DEPENDENT"}),
        "data_dependent": sum(1 for c in contracts if c["classification"] == "DATA_DEPENDENT"),
    }
    return {"schema_version": 1, "phase": "CI-R3B1O", "summary": summary, "contracts": contracts}


def classify_m252_missing_effect(run_sql: Callable[[str], str]) -> dict[str, Any]:
    table_exists = run_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip()
    present = table_exists == "1"
    return {
        "migration": M252,
        "table": M252_TABLE,
        "ledger_applied_catalog_effect_missing": not present,
        "classification": "M252_LEDGER_APPLIED_CATALOG_EFFECT_MISSING" if not present else "M252_EFFECT_PRESENT",
    }
