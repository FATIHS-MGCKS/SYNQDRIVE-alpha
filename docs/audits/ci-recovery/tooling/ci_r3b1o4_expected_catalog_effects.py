"""Object-level expected catalog effects from migration SQL (CI-R3B1O.4 final corrective)."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1l2_prisma_sql_parser import sha256_text
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_constants import STALE_INDEXES
from ci_r3b1o4_execution_set import TAIL_MIGRATION_NAME, build_execution_set

QIDENT = r'"([^"]+)"'
SCHEMA = "public"


def _norm_type(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.strip())


def _extract_create_tables(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in re.finditer(
        rf"CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\((.*?)\)\s*;",
        sql,
        re.I | re.S,
    ):
        table = match.group(1)
        body = match.group(2)
        columns: list[dict[str, Any]] = []
        for col_match in re.finditer(rf'{QIDENT}\s+([^,\n]+?)(?:,|\n|$)', body):
            col_name = col_match.group(1)
            if col_name.upper().startswith("CONSTRAINT"):
                continue
            col_def = col_match.group(2).strip().rstrip(",")
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
    for match in re.finditer(rf'CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\((.*?)\)\s*;', sql, re.I | re.S):
        table = match.group(1)
        body = match.group(2)
        pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY KEY\s*\(([^)]+)\)', body, re.I)
        if pk:
            out.append({"owner_table": table, "name": pk.group(1), "kind": "PRIMARY KEY", "definition": pk.group(0)})
            continue
        inline = re.search(r'PRIMARY KEY\s*\(([^)]+)\)', body, re.I)
        if inline:
            out.append({"owner_table": table, "name": f"{table}_pkey", "kind": "PRIMARY KEY", "definition": inline.group(0)})
    return out


def _extract_add_constraints(sql: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    out.extend(_extract_table_primary_keys(sql))
    for match in re.finditer(
        rf'ALTER TABLE\s+{QIDENT}\s+ADD CONSTRAINT\s+{QIDENT}\s+(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|EXCLUDE)\s*(.*?);',
        sql,
        re.I | re.S,
    ):
        out.append(
            {
                "owner_table": match.group(1),
                "name": match.group(2),
                "kind": match.group(3).upper(),
                "definition": _norm_type(match.group(4)),
            }
        )
    for tmatch in re.finditer(rf'CREATE TABLE(?: IF NOT EXISTS)?\s+{QIDENT}\s*\((.*?)\)\s*;', sql, re.I | re.S):
        table_name = tmatch.group(1)
        for cmatch in re.finditer(
            rf'CONSTRAINT\s+{QIDENT}\s+(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\s*(.*?)(?:,|\n|$)',
            tmatch.group(2),
            re.I | re.S,
        ):
            out.append(
                {
                    "owner_table": table_name,
                    "name": cmatch.group(1),
                    "kind": cmatch.group(2).upper(),
                    "definition": _norm_type(cmatch.group(3)),
                }
            )
    return out


def _effect(
    *,
    migration: str,
    ordinal: int,
    statement_sha256: str,
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
        "effect_id": sha256_text(f"{migration}|{ordinal}|{object_id}|{change_type}|{statement_sha256}"),
        "migration_name": migration,
        "statement_ordinal": ordinal,
        "statement_sha256": statement_sha256,
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


def _effects_from_sql(migration: str, sql: str, *, task: str | None = None) -> list[dict[str, Any]]:
    effects: list[dict[str, Any]] = []
    statement_sha = sha256_text(sql)

    for table_def in _extract_create_tables(sql):
        table = table_def["table"]
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="CREATE_TABLE",
                change_type="ADDED",
                object_type="table",
                name=table,
                after={"columns": sorted(c["name"] for c in table_def["columns"])},
                task=task,
            )
        )
        for col in table_def["columns"]:
            effects.append(
                _effect(
                    migration=migration,
                    ordinal=0,
                    statement_sha256=statement_sha,
                    operation_family="CREATE_TABLE",
                    change_type="ADDED",
                    object_type="column",
                    name=table,
                    subkey=col["name"],
                    owner=table,
                    after=col,
                    task=task,
                )
            )

    for idx in _extract_create_indexes(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="CREATE_INDEX",
                change_type="ADDED",
                object_type="index",
                name=idx["name"],
                owner=idx["owner_table"],
                after=idx,
                task=task,
            )
        )

    for dropped in _extract_drop_indexes(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="DROP_INDEX",
                change_type="REMOVED",
                object_type="index",
                name=dropped,
                before={"name": dropped},
                task=task,
            )
        )

    for enum in _extract_create_enums(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="CREATE_TYPE_ENUM",
                change_type="ADDED",
                object_type="enum",
                name=enum["name"],
                after={"labels": enum["labels"]},
                task=task,
            )
        )
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="CREATE_TYPE_ENUM",
                change_type="ADDED",
                object_type="type",
                name=enum["name"],
                after={"kind": "e", "labels": enum["labels"]},
                task=task,
            )
        )

    for col in _extract_alter_add_columns(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="ALTER_TABLE_ADD_COLUMN",
                change_type="ADDED",
                object_type="column",
                name=col["table"],
                subkey=col["column"],
                owner=col["table"],
                after=col,
                task=task,
            )
        )

    for seq in _extract_create_sequences(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="CREATE_SEQUENCE",
                change_type="ADDED",
                object_type="sequence",
                name=seq,
                after={"name": seq},
                task=task,
            )
        )

    for con in _extract_add_constraints(sql):
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=statement_sha,
                operation_family="ADD_CONSTRAINT",
                change_type="ADDED",
                object_type="constraint",
                name=con["name"],
                owner=con["owner_table"],
                after=con,
                task=task,
            )
        )

    return effects


def _m252_tail_effects(migration: str, sql: str) -> list[dict[str, Any]]:
    authority = build_m252_complete_physical_authority()
    effects = _effects_from_sql(migration, sql, task="M252")
    for dropped in STALE_INDEXES:
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=sha256_text(f"drop-{dropped}"),
                operation_family="DROP_INDEX",
                change_type="REMOVED",
                object_type="index",
                name=dropped,
                before={"name": dropped},
                task="INVOICE_STALE_INDEX" if "invoice" in dropped else "WHATSAPP_STALE_INDEX",
            )
        )
    effects.append(
        _effect(
            migration=migration,
            ordinal=0,
            statement_sha256=sha256_text(M252_TABLE),
            operation_family="M252_FORWARD",
            change_type="ADDED",
            object_type="table",
            name=M252_TABLE,
            after={"authority": "m252_complete_physical_authority"},
            task="M252",
        )
    )
    for col in authority["columns"]:
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=sha256_text(col["name"]),
                operation_family="M252_FORWARD",
                change_type="ADDED",
                object_type="column",
                name=M252_TABLE,
                subkey=col["name"],
                owner=M252_TABLE,
                after=col,
                task="M252",
            )
        )
    for key_name in ["primary_key", "unique_index", "composite_index"]:
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=sha256_text(key_name),
                operation_family="M252_FORWARD",
                change_type="ADDED",
                object_type="index",
                name=authority[key_name]["name"],
                owner=M252_TABLE,
                after=authority[key_name],
                task="M252",
            )
        )
    for fk in authority["foreign_keys"]:
        effects.append(
            _effect(
                migration=migration,
                ordinal=0,
                statement_sha256=sha256_text(fk["name"]),
                operation_family="M252_FORWARD",
                change_type="ADDED",
                object_type="constraint",
                name=fk["name"],
                owner=M252_TABLE,
                after=fk,
                task="M252",
            )
        )
    return effects


def build_expected_catalog_deltas(*, execution_set: dict[str, Any] | None = None) -> dict[str, Any]:
    from ci_r3b1o_constants import MIG_ROOT
    from ci_r3b1o4_tail_contract import build_tail_sql

    execution_set = execution_set or build_execution_set()
    effects: list[dict[str, Any]] = []
    for row in execution_set["migrations"]:
        name = row["migration_name"]
        if name == TAIL_MIGRATION_NAME:
            sql = build_tail_sql()[0]
            effects.extend(_m252_tail_effects(name, sql))
            continue
        sql = (MIG_ROOT / name / "migration.sql").read_text()
        effects.extend(_effects_from_sql(name, sql))

    by_family: dict[str, int] = {}
    for e in effects:
        by_family[e["operation_family"]] = by_family.get(e["operation_family"], 0) + 1

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "executing_migration_count": execution_set["executing_migration_count"],
        "expected_effect_count": len(effects),
        "operation_family_counts": by_family,
        "effects": effects,
        "pass": len(effects) > 0,
    }
