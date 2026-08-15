"""Normalized catalog models and semantic comparators for CI-R3B1D.1.2."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from ci_r3b1b_sql_literal_compiler import (
    classify_default_semantics,
    compile_column_default,
    parse_json_semantic_value,
    _strip_sql_string_literal,
)

_BUILTIN_CAST_TYPES = {
    "text",
    "varchar",
    "bpchar",
    "char",
    "character",
    "character varying",
    "int4",
    "int8",
    "integer",
    "bigint",
    "float8",
    "float4",
    "numeric",
    "bool",
    "boolean",
}

PG_DELETE_ACTION = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}
PG_UPDATE_ACTION = dict(PG_DELETE_ACTION)


def normalize_pg_type(data_type: str, udt_name: str, modifiers: str | None = None) -> str:
    dt = (data_type or "").lower()
    udt = udt_name or ""
    if dt == "user-defined" or udt not in {"text", "varchar", "int4", "int8", "bool", "jsonb", "json", "float8", "timestamp"}:
        return udt
    mapping = {
        "character varying": "text",
        "varchar": "text",
        "text": "text",
        "boolean": "boolean",
        "integer": "integer",
        "bigint": "bigint",
        "double precision": "double precision",
        "jsonb": "jsonb",
        "json": "json",
        "timestamp without time zone": "timestamp(3) without time zone",
    }
    base = mapping.get(dt, dt)
    if modifiers and "timestamp" in base:
        return base
    return base


def normalize_contract_type(postgres_type: str) -> str:
    typ = (postgres_type or "").strip()
    if typ.startswith('"') and typ.endswith('"'):
        return typ.strip('"')
    return typ.lower()


def semantic_default_from_contract(col: dict[str, Any]) -> dict[str, Any]:
    sem = classify_default_semantics(col)
    if sem in {"NO_DATABASE_DEFAULT", "APPLICATION_OR_PRISMA_GENERATED"}:
        return {"kind": sem, "value": None}
    pg_type = (col.get("postgres_type") or "").strip()
    if pg_type.startswith('"') and pg_type.endswith('"'):
        raw = col.get("postgres_default") or ""
        m = re.search(r"'([^']*)'::\"", raw)
        return {"kind": "DATABASE_ENUM_DEFAULT", "value": m.group(1) if m else _strip_sql_string_literal(raw) if raw else None}
    if sem == "DATABASE_JSON_DEFAULT":
        return {"kind": sem, "value": parse_json_semantic_value(col)}
    if sem == "DATABASE_ENUM_DEFAULT":
        raw = col.get("postgres_default", "")
        m = re.search(r"'([^']+)'::", raw)
        return {"kind": sem, "value": m.group(1) if m else raw.strip()}
    if sem == "DATABASE_SEQUENCE_DEFAULT":
        raw = col.get("postgres_default", "")
        m = re.search(r"nextval\('([^']+)'", raw)
        return {"kind": sem, "value": m.group(1) if m else raw.strip()}
    if sem == "DATABASE_LITERAL_DEFAULT":
        raw = col.get("postgres_default") or ""
        return {"kind": sem, "value": _strip_sql_string_literal(raw) if raw else raw}
    return {"kind": sem, "value": col.get("postgres_default")}


def semantic_default_from_pg_expr(expr: str | None, pg_type: str) -> dict[str, Any]:
    if not expr:
        return {"kind": "NO_DATABASE_DEFAULT", "value": None}
    text = expr.strip()
    if pg_type == "jsonb" or pg_type == "json":
        m = re.match(r"'(.*)'::jsonb", text, re.S) or re.match(r"'(.*)'::json", text, re.S)
        if m:
            try:
                return {"kind": "DATABASE_JSON_DEFAULT", "value": json.loads(m.group(1))}
            except json.JSONDecodeError:
                pass
    m = re.match(r"'([^']*)'::\"([^\"]+)\"", text)
    if m:
        return {"kind": "DATABASE_ENUM_DEFAULT", "value": m.group(1)}
    m = re.match(r"'([^']*)'::(\w+)", text)
    if m:
        cast_type = m.group(2).lower()
        if cast_type in _BUILTIN_CAST_TYPES:
            return {"kind": "DATABASE_LITERAL_DEFAULT", "value": m.group(1)}
    m = re.match(r"^'([^']*)'$", text)
    if m:
        return {"kind": "DATABASE_LITERAL_DEFAULT", "value": m.group(1)}
    m = re.search(r"nextval\('([^']+)'", text)
    if m:
        return {"kind": "DATABASE_SEQUENCE_DEFAULT", "value": m.group(1).split(".")[-1]}
    if text.lower() in {"true", "false"}:
        return {"kind": "DATABASE_LITERAL_DEFAULT", "value": text.lower()}
    if text.upper() in {"CURRENT_TIMESTAMP", "NOW()"}:
        return {"kind": "DATABASE_EXPRESSION_DEFAULT", "value": "CURRENT_TIMESTAMP"}
    return {"kind": "DATABASE_EXPRESSION_DEFAULT", "value": text}


def _normalize_default_value(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    text = str(val).strip()
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return text


def defaults_match(expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    no_default_kinds = {"NO_DATABASE_DEFAULT", "APPLICATION_OR_PRISMA_GENERATED"}
    if expected["kind"] in no_default_kinds and actual["kind"] in no_default_kinds:
        return True
    if expected["kind"] == "DATABASE_JSON_DEFAULT" and actual["kind"] == "DATABASE_JSON_DEFAULT":
        return expected["value"] == actual["value"]
    if expected["kind"] == "DATABASE_ENUM_DEFAULT" and actual["kind"] == "DATABASE_ENUM_DEFAULT":
        return str(expected["value"]) == str(actual["value"])
    if expected["kind"] == "DATABASE_ENUM_DEFAULT" and actual["kind"] == "DATABASE_LITERAL_DEFAULT":
        return str(expected["value"]) == _strip_sql_string_literal(str(actual.get("value", "")))
    if expected["kind"] == "DATABASE_LITERAL_DEFAULT" and actual["kind"] == "DATABASE_ENUM_DEFAULT":
        return _strip_sql_string_literal(str(expected.get("value", ""))) == str(actual["value"])
    if expected["kind"] == "DATABASE_LITERAL_DEFAULT" and actual["kind"] == "DATABASE_LITERAL_DEFAULT":
        exp = _strip_sql_string_literal(str(expected.get("value", "")))
        act = _strip_sql_string_literal(str(actual.get("value", "")))
        if exp.lower() in {"true", "false"} and act.lower() in {"true", "false"}:
            return exp.lower() == act.lower()
        exp_n = _normalize_default_value(exp)
        act_n = _normalize_default_value(act)
        return exp_n == act_n
    exp_val = _normalize_default_value(_strip_sql_string_literal(str(expected.get("value", ""))) if expected.get("value") is not None else None)
    act_val = _normalize_default_value(_strip_sql_string_literal(str(actual.get("value", ""))) if actual.get("value") is not None else None)
    if exp_val == act_val and exp_val is not None:
        return True
    if expected["kind"] != actual["kind"]:
        return False
    if expected["kind"] in {"DATABASE_ENUM_DEFAULT", "DATABASE_SEQUENCE_DEFAULT", "DATABASE_LITERAL_DEFAULT"}:
        return str(expected["value"]).lower() == str(actual["value"]).lower()
    return expected["value"] == actual["value"]


@dataclass
class Mismatch:
    category: str
    slot: int | None
    object: str
    property: str
    expected: Any
    actual: Any
    match: bool = False
    source_action: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "slot": self.slot,
            "object": self.object,
            "property": self.property,
            "expected": self.expected,
            "actual": self.actual,
            "match": self.match,
            "source_action": self.source_action,
        }


@dataclass
class ExpectedCatalog:
    types: dict[str, dict[str, Any]] = field(default_factory=dict)
    sequences: dict[str, dict[str, Any]] = field(default_factory=dict)
    tables: dict[str, dict[str, Any]] = field(default_factory=dict)
    columns: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    primary_keys: dict[str, dict[str, Any]] = field(default_factory=dict)
    unique_constraints: dict[str, dict[str, Any]] = field(default_factory=dict)
    foreign_keys: dict[str, dict[str, Any]] = field(default_factory=dict)
    indexes: dict[str, dict[str, Any]] = field(default_factory=dict)

    def object_keys_for_slots(self, max_slot: int) -> set[str]:
        keys: set[str] = set()
        for bucket in (self.types, self.sequences, self.tables, self.primary_keys, self.unique_constraints, self.foreign_keys, self.indexes):
            for name, meta in bucket.items():
                if meta.get("slot", 99) <= max_slot:
                    keys.add(f"{meta.get('kind', 'obj')}:{name}")
        for table, cols in self.columns.items():
            tmeta = self.tables.get(table, {})
            if tmeta.get("slot", 99) <= max_slot:
                for col in cols:
                    keys.add(f"column:{table}.{col}")
        return keys
