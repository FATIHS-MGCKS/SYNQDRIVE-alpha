"""Object-level expected catalog effects from migration SQL (CI-R3B1O.4 final corrective)."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1l2_prisma_sql_parser import sha256_text
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o_constants import MIG_ROOT
from ci_r3b1o4_constants import STALE_INDEXES
from ci_r3b1o4_execution_set import TAIL_MIGRATION_NAME, build_execution_set
from ci_r3b1o1_sql_classifier import parse_migration_statements

QIDENT = r'"([^"]+)"'
SCHEMA = "public"


def _norm_type(raw: str) -> str:
    text = re.sub(r"\s+", " ", raw.strip())
    text = re.sub(r"\s+without time zone$", "", text, flags=re.I)
    text = re.sub(r"\s+with time zone$", "", text, flags=re.I)
    return text


def _extract_balanced_body(sql: str, start: int) -> tuple[str, int]:
    depth = 1
    i = start
    while i < len(sql) and depth > 0:
        ch = sql[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        i += 1
    return sql[start : i - 1], i


def _extract_create_tables(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    pattern = re.compile(rf"CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\(", re.I)
    for match in pattern.finditer(sql):
        table = match.group(1)
        body, _end = _extract_balanced_body(sql, match.end())
        columns: list[dict[str, Any]] = []
        for col_match in re.finditer(rf'{QIDENT}\s+([^,\n]+?)(?:,|\n|$)', body):
            col_name = col_match.group(1)
            col_def = col_match.group(2).strip().rstrip(",")
            if col_name.upper().startswith("CONSTRAINT") or col_def.upper().startswith("CONSTRAINT"):
                continue
            if "PRIMARY KEY" in col_def.upper() or col_def.upper().startswith("UNIQUE ") or col_def.upper().startswith("FOREIGN KEY"):
                continue
            nullable = "NOT NULL" not in col_def.upper()
            default_match = re.search(r"DEFAULT\s+(.+)$", col_def, re.I)
            columns.append(
                {
                    "name": col_name,
                    "format_type": _norm_type(re.sub(r"\s+NOT NULL.*$", "", col_def, flags=re.I)),
                    "nullable": nullable,
                    "default": default_match.group(1).strip() if default_match else None,
                }
            )
        out.append({"table": table, "columns": columns})
    return out


def _extract_create_indexes(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in re.finditer(
        rf"CREATE\s+(UNIQUE\s+)?INDEX(?: IF NOT EXISTS)?\s+{QIDENT}\s+ON\s+{QIDENT}\s*(?:USING\s+\w+\s*)?\(([^;)]+)\)",
        sql,
        re.I,
    ):
        unique = bool(match.group(1))
        name = match.group(2)
        table = match.group(3)
        cols_raw = match.group(4)
        cols = [c.strip().strip('"') for c in cols_raw.split(",")]
        predicate = None
        pred = re.search(r"WHERE\s+(.+)$", cols_raw, re.I)
        if pred:
            predicate = _norm_type(pred.group(1))
        out.append({"name": name, "owner_table": table, "unique": unique, "columns": cols, "predicate": predicate})
    return out


def _extract_drop_indexes(sql: str) -> list[str]:
    return [m.group(1) for m in re.finditer(rf'DROP INDEX(?: IF EXISTS)?\s+{QIDENT}', sql, re.I)]


def _extract_create_enums(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in re.finditer(rf'CREATE TYPE\s+{QIDENT}\s+AS ENUM\s*\((.*?)\)', sql, re.I | re.S):
        name = match.group(1)
        labels = [x.strip().strip("'") for x in re.findall(r"'([^']*)'", match.group(2))]
        out.append({"name": name, "labels": labels})
    return out


def _extract_alter_add_columns(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in re.finditer(
        rf'ALTER TABLE\s+{QIDENT}\s+ADD COLUMN(?: IF NOT EXISTS)?\s+{QIDENT}\s+([^;]+);',
        sql,
        re.I,
    ):
        table = match.group(1)
        col = match.group(2)
        col_def = match.group(3).strip()
        out.append(
            {
                "table": table,
                "column": col,
                "format_type": _norm_type(re.sub(r"\s+NOT NULL.*$", "", col_def, flags=re.I)),
                "nullable": "NOT NULL" not in col_def.upper(),
                "default": (re.search(r"DEFAULT\s+(.+)$", col_def, re.I) or [None])[0],
            }
        )
    return out


def _extract_create_sequences(sql: str) -> list[str]:
    return [m.group(1) for m in re.finditer(rf'CREATE SEQUENCE(?: IF NOT EXISTS)?\s+{QIDENT}', sql, re.I)]


def _extract_table_primary_keys(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    pattern = re.compile(rf"CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\(", re.I)
    for match in pattern.finditer(sql):
        table = match.group(1)
        body, _end = _extract_balanced_body(sql, match.end())
        pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY KEY\s*\(([^)]+)\)', body, re.I)
        if pk:
            out.append({"owner_table": table, "name": pk.group(1), "kind": "PRIMARY KEY", "definition": pk.group(0)})
            continue
        inline = re.search(r"PRIMARY KEY\s*\(([^)]+)\)", body, re.I)
        if inline:
            out.append({"owner_table": table, "name": f"{table}_pkey", "kind": "PRIMARY KEY", "definition": inline.group(0)})
    return out


def _extract_add_constraints(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in _extract_table_primary_keys(sql):
        key = (row["owner_table"], row["name"])
        if key not in seen:
            seen.add(key)
            out.append(row)
    for match in re.finditer(
        rf'ALTER TABLE\s+{QIDENT}\s+ADD CONSTRAINT\s+{QIDENT}\s+(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|EXCLUDE)\s*(.*?)(?:;|$)',
        sql,
        re.I | re.S,
    ):
        key = (match.group(1), match.group(2))
        if key in seen:
            continue
        out.append(
            {
                "owner_table": match.group(1),
                "name": match.group(2),
                "kind": match.group(3).upper(),
                "definition": _norm_type(match.group(4)),
            }
        )
        seen.add(key)
    create_pattern = re.compile(rf"CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\(", re.I)
    for tmatch in create_pattern.finditer(sql):
        table_name = tmatch.group(1)
        body, _end = _extract_balanced_body(sql, tmatch.end())
        for cmatch in re.finditer(
            rf'CONSTRAINT\s+{QIDENT}\s+(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\s*(.*?)(?:,|\n|$)',
            body,
            re.I | re.S,
        ):
            key = (table_name, cmatch.group(1))
            if key in seen:
                continue
            out.append(
                {
                    "owner_table": table_name,
                    "name": cmatch.group(1),
                    "kind": cmatch.group(2).upper(),
                    "definition": _norm_type(cmatch.group(3)),
                }
            )
            seen.add(key)
    return out


def _effect(
    *,
    migration: str,
    ordinal: int,
    statement_sha256: str,
    statement_family: str,
    effect_ordinal: int,
    operation_family: str,
    change_type: str,
    object_type: str,
    name: str,
    owner: str | None = None,
    subkey: str | None = None,
    after: dict[str, Any] | None = None,
    before: dict[str, Any] | None = None,
    task: str | None = None,
) -> dict[str, Any]:
    object_id = f"{object_type}:{name}" + (f":{subkey}" if subkey else "")
    return {
        "effect_id": sha256_text(f"{migration}|{ordinal}|{effect_ordinal}|{object_id}|{change_type}|{statement_sha256}"),
        "migration_name": migration,
        "statement_ordinal": ordinal,
        "statement_sha256": statement_sha256,
        "statement_family": statement_family,
        "effect_ordinal": effect_ordinal,
        "operation_family": operation_family,
        "change_type": change_type,
        "object_type": object_type,
        "schema": SCHEMA,
        "name": name,
        "subkey": subkey,
        "owner": owner,
        "object_id": object_id,
        "before_state": before,
        "after_state": after,
        "task": task,
    }


def _effects_from_sql(
    *,
    migration: str,
    statement_ordinal: int,
    statement_sha256: str,
    statement_family: str,
    sql: str,
    task: str | None = None,
) -> list[dict[str, Any]]:
    effects: list[dict[str, Any]] = []
    effect_ordinal = 0

    def add(**kwargs: Any) -> None:
        nonlocal effect_ordinal
        effect_ordinal += 1
        effects.append(
            _effect(
                migration=migration,
                ordinal=statement_ordinal,
                statement_sha256=statement_sha256,
                statement_family=statement_family,
                effect_ordinal=effect_ordinal,
                task=task,
                **kwargs,
            )
        )

    for table_def in _extract_create_tables(sql):
        table = table_def["table"]
        add(
            operation_family="CREATE_TABLE",
            change_type="ADDED",
            object_type="table",
            name=table,
            after={"columns": sorted(c["name"] for c in table_def["columns"])},
        )
        for col in table_def["columns"]:
            add(
                operation_family="CREATE_TABLE",
                change_type="ADDED",
                object_type="column",
                name=table,
                subkey=col["name"],
                owner=table,
                after=col,
            )

    for idx in _extract_create_indexes(sql):
        add(
            operation_family="CREATE_INDEX",
            change_type="ADDED",
            object_type="index",
            name=idx["name"],
            owner=idx["owner_table"],
            after=idx,
        )

    for dropped in _extract_drop_indexes(sql):
        add(
            operation_family="DROP_INDEX",
            change_type="REMOVED",
            object_type="index",
            name=dropped,
            before={"name": dropped},
        )

    for enum in _extract_create_enums(sql):
        add(
            operation_family="CREATE_TYPE_ENUM",
            change_type="ADDED",
            object_type="enum",
            name=enum["name"],
            after={"labels": enum["labels"]},
        )
        add(
            operation_family="CREATE_TYPE_ENUM",
            change_type="ADDED",
            object_type="type",
            name=enum["name"],
            after={"kind": "e", "labels": enum["labels"]},
        )

    for col in _extract_alter_add_columns(sql):
        add(
            operation_family="ALTER_TABLE_ADD_COLUMN",
            change_type="ADDED",
            object_type="column",
            name=col["table"],
            subkey=col["column"],
            owner=col["table"],
            after=col,
        )

    for seq in _extract_create_sequences(sql):
        add(
            operation_family="CREATE_SEQUENCE",
            change_type="ADDED",
            object_type="sequence",
            name=seq,
            after={"name": seq},
        )

    for con in _extract_add_constraints(sql):
        add(
            operation_family="ADD_CONSTRAINT",
            change_type="ADDED",
            object_type="constraint",
            name=con["name"],
            owner=con["owner_table"],
            after=con,
        )

    return effects


def _m252_tail_effects(
    migration: str,
    *,
    statements: list[dict[str, Any]],
    parsed_by_ordinal: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    authority = build_m252_complete_physical_authority()
    effects: list[dict[str, Any]] = []
    m252_stmt: dict[str, Any] | None = None

    for stmt in statements:
        ordinal = int(stmt["ordinal"])
        sha = stmt["statement_sha256"]
        family = stmt.get("statement_type", "UNKNOWN")
        sql = parsed_by_ordinal[ordinal]["sql"]
        if family == "DROP INDEX":
            for dropped in _extract_drop_indexes(sql):
                task = "INVOICE_STALE_INDEX" if "invoice" in dropped else "WHATSAPP_STALE_INDEX"
                effects.extend(
                    _effects_from_sql(
                        migration=migration,
                        statement_ordinal=ordinal,
                        statement_sha256=sha,
                        statement_family=family,
                        sql=sql,
                        task=task,
                    )
                )
        elif M252_TABLE in sql or "CREATE TABLE" in sql.upper():
            m252_stmt = stmt
            effects.extend(
                _effects_from_sql(
                    migration=migration,
                    statement_ordinal=ordinal,
                    statement_sha256=sha,
                    statement_family=family,
                    sql=sql,
                    task="M252",
                )
            )

    if not m252_stmt:
        raise RuntimeError("M252 tail statement not found in execution set")

    ordinal = int(m252_stmt["ordinal"])
    sha = m252_stmt["statement_sha256"]
    family = m252_stmt.get("statement_type", "CREATE TABLE")
    effect_ordinal = max((e.get("effect_ordinal", 0) for e in effects if e.get("statement_ordinal") == ordinal), default=0)

    def add_m252(**kwargs: Any) -> None:
        nonlocal effect_ordinal
        effect_ordinal += 1
        effects.append(
            _effect(
                migration=migration,
                ordinal=ordinal,
                statement_sha256=sha,
                statement_family=family,
                effect_ordinal=effect_ordinal,
                task="M252",
                **kwargs,
            )
        )

    add_m252(
        operation_family="M252_FORWARD",
        change_type="ADDED",
        object_type="table",
        name=M252_TABLE,
        after={"authority": "m252_complete_physical_authority"},
    )
    for col in authority["columns"]:
        add_m252(
            operation_family="M252_FORWARD",
            change_type="ADDED",
            object_type="column",
            name=M252_TABLE,
            subkey=col["name"],
            owner=M252_TABLE,
            after=col,
        )
    for key_name in ["primary_key", "unique_index", "composite_index"]:
        add_m252(
            operation_family="M252_FORWARD",
            change_type="ADDED",
            object_type="index",
            name=authority[key_name]["name"],
            owner=M252_TABLE,
            after=authority[key_name],
        )
    for fk in authority["foreign_keys"]:
        add_m252(
            operation_family="M252_FORWARD",
            change_type="ADDED",
            object_type="constraint",
            name=fk["name"],
            owner=M252_TABLE,
            after=fk,
        )
    return effects


def _migration_sql_by_statement(migration_name: str, execution_set: dict[str, Any]) -> dict[int, dict[str, Any]]:
    if migration_name == TAIL_MIGRATION_NAME:
        from ci_r3b1o4_tail_contract import build_tail_sql

        sql = build_tail_sql()[0]
    else:
        sql = (MIG_ROOT / migration_name / "migration.sql").read_text()
    parsed = parse_migration_statements(sql)
    by_ordinal = {int(s["ordinal"]): s for s in parsed}
    for mig in execution_set["migrations"]:
        if mig["migration_name"] != migration_name:
            continue
        for stmt in mig["statements"]:
            ordinal = int(stmt["ordinal"])
            if stmt["statement_sha256"] != sha256_text(by_ordinal[ordinal]["sql"]):
                raise RuntimeError(f"statement SHA mismatch for {migration_name} ordinal {ordinal}")
    return by_ordinal


def build_expected_catalog_deltas(*, execution_set: dict[str, Any] | None = None) -> dict[str, Any]:
    execution_set = execution_set or build_execution_set()
    effects: list[dict[str, Any]] = []
    for row in execution_set["migrations"]:
        name = row["migration_name"]
        parsed_by_ordinal = _migration_sql_by_statement(name, execution_set)
        if name == TAIL_MIGRATION_NAME:
            effects.extend(_m252_tail_effects(name, statements=row["statements"], parsed_by_ordinal=parsed_by_ordinal))
            continue
        for stmt in row["statements"]:
            ordinal = int(stmt["ordinal"])
            parsed = parsed_by_ordinal[ordinal]
            effects.extend(
                _effects_from_sql(
                    migration=name,
                    statement_ordinal=ordinal,
                    statement_sha256=stmt["statement_sha256"],
                    statement_family=stmt.get("statement_type", "UNKNOWN"),
                    sql=parsed["sql"],
                )
            )

    null_ordinals = [e for e in effects if e.get("statement_ordinal") is None]
    sha_mismatches = []
    for mig in execution_set["migrations"]:
        mig_name = mig["migration_name"]
        stmt_map = {int(s["ordinal"]): s["statement_sha256"] for s in mig["statements"]}
        for effect in effects:
            if effect.get("migration_name") != mig_name:
                continue
            if effect.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT":
                continue
            ordn = effect.get("statement_ordinal")
            if ordn is not None and stmt_map.get(int(ordn)) != effect.get("statement_sha256"):
                sha_mismatches.append(effect.get("effect_id"))

    by_family: dict[str, int] = {}
    for e in effects:
        by_family[e["operation_family"]] = by_family.get(e["operation_family"], 0) + 1

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-binding-corrective",
        "executing_migration_count": execution_set["executing_migration_count"],
        "expected_effect_count": len(effects),
        "operation_family_counts": by_family,
        "effects": effects,
        "statement_ordinal_null_count": len(null_ordinals),
        "statement_sha_mismatch_count": len(sha_mismatches),
        "pass": len(effects) > 0 and len(null_ordinals) == 0 and len(sha_mismatches) == 0,
    }
