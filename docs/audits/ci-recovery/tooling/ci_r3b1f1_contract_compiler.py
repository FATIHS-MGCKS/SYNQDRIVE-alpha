"""Compile exact predecessor column contracts to temporary repair SQL (CI-R3B1F.1)."""
from __future__ import annotations

import hashlib
import re
from typing import Any

from ci_r3b1b_sql_literal_compiler import qident


def _format_type(pg_type: str) -> str:
    typ = pg_type.strip()
    if typ.startswith('"') and typ.endswith('"'):
        return typ
    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", typ):
        return qident(typ)
    return typ


def compile_default_clause(contract: dict[str, Any]) -> str | None:
    semantics = contract.get("default_semantics")
    if semantics in {"NO_DATABASE_DEFAULT", "APPLICATION_OR_PRISMA_GENERATED"}:
        return None
    if semantics == "DATABASE_ENUM_DEFAULT":
        enum_type = contract.get("enum_dependency") or contract.get("postgres_type")
        value = contract.get("default_value")
        if not value or not enum_type:
            raise ValueError("enum default requires default_value and enum_dependency")
        enum_name = enum_type.strip('"')
        return f"'{value}'::{qident(enum_name)}"
    if semantics == "DATABASE_LITERAL_DEFAULT":
        value = contract.get("default_value")
        if value is None:
            raise ValueError("literal default requires default_value")
        pg_type = (contract.get("postgres_type") or "").upper()
        if pg_type == "BOOLEAN":
            return "true" if str(value).lower() in {"true", "t", "1"} else "false"
        if pg_type in {"INTEGER", "BIGINT", "SMALLINT"}:
            return str(int(value))
        if pg_type == "TEXT":
            return f"'{value}'"
        return str(value)
    if semantics == "DATABASE_EXPRESSION_DEFAULT":
        return contract.get("postgres_default") or contract.get("default_expression")
    raise ValueError(f"unsupported default semantics: {semantics}")


def compile_add_column_contract(contract: dict[str, Any]) -> str:
    table = contract["relation"]
    column = contract["column"]
    parts = [
        f"ALTER TABLE {qident(table)}",
        "ADD COLUMN IF NOT EXISTS",
        qident(column),
        _format_type(contract["postgres_type"]),
    ]
    if contract.get("nullable") is False:
        parts.append("NOT NULL")
    default_sql = compile_default_clause(contract)
    if default_sql:
        parts.append(f"DEFAULT {default_sql}")
    return " ".join(parts) + ";"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_compiled_add_column_semantics(sql: str) -> dict[str, Any]:
    m = re.search(
        r'ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+("([^"]+)"|[A-Za-z_][A-Za-z0-9_]*)',
        sql,
        re.I,
    )
    if not m:
        raise ValueError("unable to parse compiled ADD COLUMN SQL")
    enum_m = re.search(r"DEFAULT\s+'([^']+)'::\"([^\"]+)\"", sql, re.I)
    return {
        "relation": m.group(1),
        "column": m.group(2),
        "postgres_type": m.group(4) or m.group(3).strip('"'),
        "nullable": "NOT NULL" not in sql.upper(),
        "default_value": enum_m.group(1) if enum_m else None,
        "enum_dependency": enum_m.group(2) if enum_m else None,
    }


def semantic_equivalence(contract: dict[str, Any], sql: str) -> bool:
    parsed = parse_compiled_add_column_semantics(sql)
    if parsed["relation"] != contract["relation"]:
        return False
    if parsed["column"] != contract["column"]:
        return False
    if normalize_type(parsed["postgres_type"]) != normalize_type(contract["postgres_type"]):
        return False
    if parsed["nullable"] != contract.get("nullable"):
        return False
    if contract.get("default_semantics") == "DATABASE_ENUM_DEFAULT":
        return parsed.get("default_value") == contract.get("default_value")
    return True


def normalize_type(value: str) -> str:
    return value.strip().strip('"')
