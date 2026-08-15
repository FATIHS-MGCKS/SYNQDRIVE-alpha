"""Typed SQL literal and column-default compiler for CI-recovery DDL (R3B1B/R3B1D.1.1/R3B1E)."""
from __future__ import annotations

import json
import re
from typing import Any

DEFAULT_SEMANTICS = {
    "NO_DATABASE_DEFAULT",
    "APPLICATION_OR_PRISMA_GENERATED",
    "DATABASE_LITERAL_DEFAULT",
    "DATABASE_EXPRESSION_DEFAULT",
    "DATABASE_JSON_DEFAULT",
    "DATABASE_ENUM_DEFAULT",
    "DATABASE_SEQUENCE_DEFAULT",
    "IDENTITY_OR_SEQUENCE_GENERATED",
    "DATABASE_DEFAULT",  # legacy authority label — resolved to typed semantics
}


class DefaultCompileError(ValueError):
    pass


def qident(name: str) -> str:
    return f'"{name}"'


def classify_default_semantics(col: dict[str, Any]) -> str:
    explicit = col.get("default_semantics")
    if explicit == "IDENTITY_OR_SEQUENCE_GENERATED":
        return "DATABASE_SEQUENCE_DEFAULT"
    if explicit == "APPLICATION_OR_PRISMA_GENERATED":
        return "APPLICATION_OR_PRISMA_GENERATED"

    pg_default = col.get("postgres_default")
    prisma_default = col.get("prisma_default")
    pg_type = (col.get("postgres_type") or "").upper()
    prisma_type = col.get("prisma_type") or ""

    if not pg_default and not prisma_default:
        return "NO_DATABASE_DEFAULT"

    if prisma_type == "Json" or pg_type in {"JSONB", "JSON"}:
        return "DATABASE_JSON_DEFAULT"

    if explicit == "DATABASE_DEFAULT" or explicit in DEFAULT_SEMANTICS:
        if pg_default and re.search(r"::\s*\"[^\"]+\"", pg_default):
            return "DATABASE_ENUM_DEFAULT"
        if pg_default and (
            "nextval(" in pg_default
            or pg_default.strip().upper().startswith("CURRENT_")
            or "gen_random_uuid" in pg_default.lower()
        ):
            return "DATABASE_EXPRESSION_DEFAULT"
        if pg_type in {"TEXT", "BOOLEAN", "INTEGER", "DOUBLE PRECISION", "TIMESTAMP(3) WITHOUT TIME ZONE"}:
            return "DATABASE_LITERAL_DEFAULT"
        if pg_default:
            return "DATABASE_EXPRESSION_DEFAULT"

    if prisma_default and not pg_default:
        return "APPLICATION_OR_PRISMA_GENERATED"

    return "NO_DATABASE_DEFAULT"


def sql_quote_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _strip_sql_string_literal(raw: str) -> str:
    text = raw.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        inner = text[1:-1]
        if text[0] == "'":
            inner = inner.replace("''", "'")
        return inner
    return text


def _unescape_json_source(raw: str) -> str:
    text = _strip_sql_string_literal(raw)
    if "\\\"" in text or "\\'" in text:
        try:
            return bytes(text, "utf-8").decode("unicode_escape")
        except UnicodeDecodeError:
            pass
    return text.replace('\\"', '"').replace("\\'", "'")


def parse_json_semantic_value(col: dict[str, Any]) -> Any:
    prisma_default = col.get("prisma_default")
    if prisma_default is not None:
        try:
            parsed = json.loads(prisma_default)
            if isinstance(parsed, str):
                return json.loads(parsed)
            return parsed
        except json.JSONDecodeError:
            pass

    pg_default = col.get("postgres_default")
    if not pg_default:
        raise DefaultCompileError(f"JSON default missing for column {col.get('column')}")

    candidates = [
        _unescape_json_source(pg_default),
        _strip_sql_string_literal(pg_default),
        pg_default.strip(),
    ]
    last_error: Exception | None = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
    raise DefaultCompileError(
        f"invalid JSON authority for column {col.get('column')}: {pg_default!r} ({last_error})"
    )


def compile_json_default(col: dict[str, Any]) -> str:
    value = parse_json_semantic_value(col)
    json_text = json.dumps(value, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    pg_type = (col.get("postgres_type") or "JSONB").upper()
    cast = "::jsonb" if "JSONB" in pg_type else "::json"
    return f"{sql_quote_string(json_text)}{cast}"


def compile_literal_default(col: dict[str, Any]) -> str:
    pg_default = col.get("postgres_default")
    if pg_default is None:
        raise DefaultCompileError(f"missing postgres_default for column {col.get('column')}")
    pg_type = (col.get("postgres_type") or "").upper()

    if pg_type == "BOOLEAN":
        text = _strip_sql_string_literal(pg_default).lower()
        if text in {"true", "t", "1"}:
            return "true"
        if text in {"false", "f", "0"}:
            return "false"
        raise DefaultCompileError(f"invalid boolean default {pg_default!r}")

    if pg_type == "INTEGER":
        return str(int(_strip_sql_string_literal(pg_default)))

    if pg_type == "DOUBLE PRECISION":
        return str(float(_strip_sql_string_literal(pg_default)))

    if pg_type == "TEXT":
        return sql_quote_string(_strip_sql_string_literal(pg_default))

    if "TIMESTAMP" in pg_type:
        if pg_default.strip().upper() in {"CURRENT_TIMESTAMP", "NOW()"}:
            return pg_default.strip()
        return pg_default.strip()

    return pg_default.strip()


def compile_column_default(col: dict[str, Any]) -> str | None:
    semantics = classify_default_semantics(col)
    if semantics in {"NO_DATABASE_DEFAULT", "APPLICATION_OR_PRISMA_GENERATED"}:
        return None
    if semantics == "DATABASE_JSON_DEFAULT":
        return compile_json_default(col)
    if semantics == "DATABASE_ENUM_DEFAULT":
        return col.get("postgres_default", "").strip()
    if semantics == "DATABASE_SEQUENCE_DEFAULT":
        return col.get("postgres_default", "").strip()
    if semantics == "DATABASE_EXPRESSION_DEFAULT":
        return col.get("postgres_default", "").strip()
    if semantics == "DATABASE_LITERAL_DEFAULT":
        return compile_literal_default(col)
    raise DefaultCompileError(f"unsupported default semantics {semantics} for column {col.get('column')}")


def column_sql(col: dict[str, Any]) -> str:
    typ = col["postgres_type"]
    if (
        not typ.startswith('"')
        and typ
        not in {"TEXT", "JSONB", "JSON", "BOOLEAN", "INTEGER", "DOUBLE PRECISION"}
        and "TIMESTAMP" not in typ
    ):
        typ = qident(typ.strip('"'))
    parts = [qident(col["column"]), typ]
    if not col.get("nullable", True):
        parts.append("NOT NULL")
    default_sql = compile_column_default(col)
    if default_sql is not None:
        parts.append(f"DEFAULT {default_sql}")
    return " ".join(parts)
