"""SQL-context-aware migration statement classifier for CI-R3B1O.1."""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from ci_r3b1l2_prisma_sql_parser import split_comment_and_sql_blocks, split_sql_statements, tokenize_sql


class StatementType(str, Enum):
    CREATE_TABLE = "CREATE TABLE"
    ALTER_TABLE = "ALTER TABLE"
    CREATE_INDEX = "CREATE INDEX"
    CREATE_UNIQUE_INDEX = "CREATE UNIQUE INDEX"
    DROP_INDEX = "DROP INDEX"
    CREATE_TYPE = "CREATE TYPE"
    ALTER_TYPE = "ALTER TYPE"
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    DO = "DO"
    CREATE_FUNCTION = "CREATE FUNCTION"
    CREATE_TRIGGER = "CREATE TRIGGER"
    CREATE_SEQUENCE = "CREATE SEQUENCE"
    ALTER_SEQUENCE = "ALTER SEQUENCE"
    OTHER_DDL = "OTHER_DDL"
    UNKNOWN = "UNKNOWN"


DML_TYPES = {StatementType.INSERT, StatementType.UPDATE, StatementType.DELETE}


def _strip_leading_comments(sql: str) -> str:
    lines = sql.splitlines()
    out = []
    for line in lines:
        if line.strip().startswith("--"):
            continue
        out.append(line)
    return "\n".join(out).strip()


def classify_statement(sql: str) -> StatementType:
    body = _strip_leading_comments(sql).strip()
    if not body:
        return StatementType.UNKNOWN
    upper = body.upper()

    if upper.startswith("WITH"):
        if re.search(r"\bINSERT\s+INTO\b", body, re.I):
            return StatementType.INSERT
        if re.search(r"\bUPDATE\s+", body, re.I):
            return StatementType.UPDATE
        if re.search(r"\bDELETE\s+FROM\b", body, re.I):
            return StatementType.DELETE
        return StatementType.UNKNOWN

    if re.match(r"INSERT\s+INTO\b", body, re.I):
        return StatementType.INSERT
    if re.match(r"UPDATE\s+", body, re.I):
        return StatementType.UPDATE
    if re.match(r"DELETE\s+FROM\b", body, re.I):
        return StatementType.DELETE

    if upper.startswith("CREATE TABLE"):
        return StatementType.CREATE_TABLE
    if upper.startswith("ALTER TABLE"):
        return StatementType.ALTER_TABLE
    if upper.startswith("CREATE UNIQUE INDEX"):
        return StatementType.CREATE_UNIQUE_INDEX
    if upper.startswith("CREATE INDEX"):
        return StatementType.CREATE_INDEX
    if upper.startswith("DROP INDEX"):
        return StatementType.DROP_INDEX
    if upper.startswith("CREATE TYPE"):
        return StatementType.CREATE_TYPE
    if upper.startswith("ALTER TYPE"):
        return StatementType.ALTER_TYPE
    if upper.startswith("DO "):
        return StatementType.DO
    if upper.startswith("CREATE OR REPLACE FUNCTION") or upper.startswith("CREATE FUNCTION"):
        return StatementType.CREATE_FUNCTION
    if upper.startswith("CREATE TRIGGER"):
        return StatementType.CREATE_TRIGGER
    if upper.startswith("CREATE SEQUENCE"):
        return StatementType.CREATE_SEQUENCE
    if upper.startswith("ALTER SEQUENCE"):
        return StatementType.ALTER_SEQUENCE
    if re.match(r"^(CREATE|ALTER|DROP)\b", body, re.I):
        return StatementType.OTHER_DDL
    return StatementType.UNKNOWN


def parse_migration_statements(sql: str) -> list[dict[str, Any]]:
    blocks = split_comment_and_sql_blocks(sql if sql.endswith("\n") else sql + "\n")
    statements: list[dict[str, Any]] = []
    ordinal = 0
    for _comments, _tags, sql_text in blocks:
        if not sql_text:
            continue
        for stmt in split_sql_statements(sql_text):
            ordinal += 1
            stype = classify_statement(stmt)
            statements.append(
                {
                    "ordinal": ordinal,
                    "statement_type": stype.value,
                    "is_dml": stype in DML_TYPES,
                    "sql": stmt.strip(),
                    "tokens": tokenize_sql(stmt)[:12],
                }
            )
    return statements


def migration_has_dml(sql: str) -> bool:
    return any(s["is_dml"] for s in parse_migration_statements(sql))


def _classify_do_block(sql: str) -> str:
    if re.search(r"\bINSERT\s+INTO\b", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"\bDELETE\s+FROM\b", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"\bUPDATE\s+(?!CASCADE)", sql, re.I) and re.search(r"\bUPDATE\s+[\"\w]", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"\b(CREATE TYPE|CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TYPE|ALTER TABLE)\b", sql, re.I):
        return "DDL_SCHEMA_ONLY"
    return "UNKNOWN_DATA_DEPENDENCY"


def classify_migration_data_risk(sql: str) -> tuple[str, str, list[dict[str, Any]]]:
    statements = parse_migration_statements(sql)
    if not statements:
        return "DDL_SCHEMA_ONLY", "empty or comment-only migration", statements
    risk_levels: list[str] = []
    for stmt in statements:
        stype = StatementType(stmt["statement_type"])
        if stype in DML_TYPES:
            risk_levels.append("DATA_DEPENDENT_HIGH")
        elif stype == StatementType.DO:
            risk_levels.append(_classify_do_block(stmt["sql"]))
        elif stype == StatementType.CREATE_FUNCTION or stype == StatementType.CREATE_TRIGGER:
            risk_levels.append("UNKNOWN_DATA_DEPENDENCY")
        elif stype == StatementType.ALTER_TABLE and re.search(r"SET NOT NULL", stmt["sql"], re.I) and "DEFAULT" not in stmt["sql"].upper():
            risk_levels.append("DATA_DEPENDENT_HIGH")
        elif stype == StatementType.ALTER_TABLE and re.search(r"USING\s+", stmt["sql"], re.I):
            risk_levels.append("DATA_DEPENDENT_HIGH")
        elif stype == StatementType.CREATE_UNIQUE_INDEX:
            risk_levels.append("DATA_DEPENDENT_LOW")
        elif stype == StatementType.ALTER_TABLE and "FOREIGN KEY" in stmt["sql"].upper():
            risk_levels.append("DATA_DEPENDENT_LOW")
        elif stype in {
            StatementType.CREATE_TABLE,
            StatementType.ALTER_TABLE,
            StatementType.CREATE_INDEX,
            StatementType.CREATE_UNIQUE_INDEX,
            StatementType.DROP_INDEX,
            StatementType.CREATE_TYPE,
            StatementType.ALTER_TYPE,
            StatementType.OTHER_DDL,
            StatementType.CREATE_SEQUENCE,
            StatementType.ALTER_SEQUENCE,
        }:
            risk_levels.append("DDL_SCHEMA_ONLY")
        else:
            risk_levels.append("UNKNOWN_DATA_DEPENDENCY")

    if "DATA_DEPENDENT_HIGH" in risk_levels:
        return "DATA_DEPENDENT_HIGH", "contains row-mutating or unsafe DDL", statements
    if "UNKNOWN_DATA_DEPENDENCY" in risk_levels:
        return "UNKNOWN_DATA_DEPENDENCY", "unsupported statement semantics remain", statements
    if "DATA_DEPENDENT_LOW" in risk_levels:
        return "DATA_DEPENDENT_LOW", "validated constraint/index DDL", statements
    return "DDL_SCHEMA_ONLY", "schema-only DDL without DML", statements
