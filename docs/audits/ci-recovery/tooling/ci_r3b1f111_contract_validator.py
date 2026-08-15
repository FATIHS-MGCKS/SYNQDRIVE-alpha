"""Strict PostgreSQL column contract validation (CI-R3B1F.1)."""
from __future__ import annotations

import re
from typing import Any

FORBIDDEN_TYPE_FRAGMENTS = {
    "",
    "null",
    "is not null",
    "not null",
    "default",
    "primary key",
    "add column",
    "foreign key",
    "unique",
    "check",
    "constraint",
}

BUILTIN_TYPES = {
    "text",
    "uuid",
    "boolean",
    "integer",
    "bigint",
    "smallint",
    "double precision",
    "numeric",
    "json",
    "jsonb",
    "bytea",
    "real",
    "date",
    "time",
    "timestamp",
    "timestamptz",
    "timestamp with time zone",
    "timestamp without time zone",
    "timestamp(3)",
    "timestamp(3) without time zone",
    "timestamp(3) with time zone",
}

DEFAULT_SEMANTICS = {
    "NO_DATABASE_DEFAULT",
    "APPLICATION_OR_PRISMA_GENERATED",
    "DATABASE_LITERAL_DEFAULT",
    "DATABASE_EXPRESSION_DEFAULT",
    "DATABASE_JSON_DEFAULT",
    "DATABASE_ENUM_DEFAULT",
    "DATABASE_SEQUENCE_DEFAULT",
    "IDENTITY_OR_SEQUENCE_GENERATED",
}


def normalize_type_name(value: str) -> str:
    return value.strip().strip('"').lower()


def is_valid_postgres_type(type_name: str, known_enums: set[str] | None = None) -> bool:
    if not type_name or not str(type_name).strip():
        return False
    lower = normalize_type_name(str(type_name))
    if lower in FORBIDDEN_TYPE_FRAGMENTS:
        return False
    if lower in BUILTIN_TYPES:
        return True
    if re.match(r"^(numeric|varchar|character varying|char)\(", lower):
        return True
    if re.match(r"^timestamp(\(\d+\))?( with| without)? time zone$", lower):
        return True
    if known_enums and (type_name.strip('"') in known_enums or lower in {e.lower() for e in known_enums}):
        return True
    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", type_name.strip('"')):
        return True
    return False


def validate_column_contract(contract: dict[str, Any], known_enums: set[str] | None = None) -> list[str]:
    errors: list[str] = []
    required_fields = [
        "relation",
        "column",
        "postgres_type",
        "nullable",
        "default_semantics",
        "first_consumer_migration",
        "repair_boundary",
        "provenance",
    ]
    for field in required_fields:
        if field not in contract or contract[field] is None:
            errors.append(f"missing_field:{field}")

    pg_type = contract.get("postgres_type")
    if pg_type is None:
        errors.append("missing_type")
    elif not is_valid_postgres_type(str(pg_type), known_enums):
        errors.append(f"invalid_type:{pg_type}")

    nullable = contract.get("nullable")
    if nullable not in {True, False}:
        errors.append("invalid_nullability")

    semantics = contract.get("default_semantics")
    if semantics not in DEFAULT_SEMANTICS:
        errors.append(f"invalid_default_semantics:{semantics}")

    if semantics == "DATABASE_ENUM_DEFAULT" and not contract.get("default_value"):
        errors.append("missing_enum_default_value")

    boundary = contract.get("repair_boundary") or {}
    if not boundary.get("after_migration") or not boundary.get("before_migration"):
        errors.append("missing_repair_boundary")

    provenance = contract.get("provenance") or {}
    if not provenance.get("sources"):
        errors.append("missing_provenance")

    enum_dep = contract.get("enum_dependency")
    if enum_dep and known_enums is not None and enum_dep not in known_enums:
        errors.append(f"missing_enum_dependency:{enum_dep}")

    return errors
