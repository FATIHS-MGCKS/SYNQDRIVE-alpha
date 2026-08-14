"""Historical Prisma schema → physical PostgreSQL DDL authority helpers."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

SCALAR_TYPES = {
    "String",
    "Int",
    "BigInt",
    "Boolean",
    "Float",
    "Decimal",
    "DateTime",
    "Json",
    "Bytes",
}


def parse_balanced_paren(text: str, open_idx: int) -> tuple[str, int]:
    depth = 0
    i = open_idx
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[open_idx + 1 : i], i
        i += 1
    raise ValueError("unbalanced parentheses")


def parse_default(expr: str, prisma_type: str = "String") -> dict[str, Any]:
    m = re.search(r"@default\(", expr)
    if not m:
        if "@updatedAt" in expr:
            return {
                "prisma_default": None,
                "postgres_default": None,
                "default_semantics": "NO_DATABASE_DEFAULT",
                "generation": None,
            }
        return {
            "prisma_default": None,
            "postgres_default": None,
            "default_semantics": "NO_DATABASE_DEFAULT",
            "generation": None,
        }
    inner, _ = parse_balanced_paren(expr, m.end() - 1)
    inner = inner.strip()
    generation: dict[str, Any] | None = None

    if inner in {"now()", "CURRENT_TIMESTAMP"}:
        return {
            "prisma_default": inner,
            "postgres_default": "CURRENT_TIMESTAMP",
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    if inner == "uuid()":
        return {
            "prisma_default": inner,
            "postgres_default": None,
            "default_semantics": "APPLICATION_OR_PRISMA_GENERATED",
            "generation": {"mechanism": "prisma_client_uuid_v4"},
        }
    if inner == "cuid()":
        return {
            "prisma_default": inner,
            "postgres_default": None,
            "default_semantics": "APPLICATION_OR_PRISMA_GENERATED",
            "generation": {"mechanism": "prisma_client_cuid"},
        }
    if inner == "autoincrement()":
        return {
            "prisma_default": inner,
            "postgres_default": None,
            "default_semantics": "IDENTITY_OR_SEQUENCE_GENERATED",
            "generation": {
                "mechanism": "postgresql_serial_sequence",
                "sequence_naming": "table_column_seq",
            },
        }
    if inner in {"true", "false"}:
        return {
            "prisma_default": inner,
            "postgres_default": inner.upper(),
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    if re.fullmatch(r"-?\d+", inner):
        return {
            "prisma_default": inner,
            "postgres_default": inner,
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    if re.fullmatch(r"-?\d+\.\d+", inner):
        return {
            "prisma_default": inner,
            "postgres_default": inner,
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    if inner.startswith('"') or inner.startswith("'"):
        lit = inner.strip('"').strip("'")
        return {
            "prisma_default": inner,
            "postgres_default": f"'{lit}'",
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    if re.fullmatch(r"[A-Z_][A-Z0-9_]*", inner):
        return {
            "prisma_default": inner,
            "postgres_default": f"'{inner}'::\"{prisma_type}\"",
            "default_semantics": "DATABASE_DEFAULT",
            "generation": None,
        }
    return {
        "prisma_default": inner,
        "postgres_default": None,
        "default_semantics": "UNKNOWN",
        "generation": None,
    }


def prisma_scalar_to_postgres(prisma_type: str, attrs: str) -> str:
    db_m = re.search(r'@db\.(\w+)(?:\(([^)]*)\))?', attrs)
    if db_m:
        native = db_m.group(1).lower()
        args = db_m.group(2) or ""
        if native == "uuid":
            return "UUID"
        if native == "text":
            return "TEXT"
        if native == "decimal":
            return f"DECIMAL({args})" if args else "DECIMAL(65,30)"
        if native == "timestamptz":
            return "TIMESTAMPTZ(3)"
        if native in {"json", "jsonb"}:
            return "JSONB"
    mapping = {
        "String": "TEXT",
        "Int": "INTEGER",
        "BigInt": "BIGINT",
        "Boolean": "BOOLEAN",
        "Float": "DOUBLE PRECISION",
        "Decimal": "DECIMAL(65,30)",
        "DateTime": "TIMESTAMP(3) WITHOUT TIME ZONE",
        "Json": "JSONB",
        "Bytes": "BYTEA",
    }
    if prisma_type in mapping:
        return mapping[prisma_type]
    return f'"{prisma_type}"'


@dataclass
class ParsedSchema:
    models: dict[str, dict[str, Any]] = field(default_factory=dict)
    enums: dict[str, list[str]] = field(default_factory=dict)
    model_names: set[str] = field(default_factory=set)


def parse_schema(schema: str) -> ParsedSchema:
    out = ParsedSchema()
    for em in re.finditer(r"enum\s+(\w+)\s*\{(.*?)\}", schema, re.S):
        labels = [
            ln.strip()
            for ln in em.group(2).splitlines()
            if ln.strip() and not ln.strip().startswith("//")
        ]
        out.enums[em.group(1)] = labels
    for mm in re.finditer(r"model\s+(\w+)\s*\{(.*?)\n\}", schema, re.S):
        out.model_names.add(mm.group(1))
        out.models[mm.group(1)] = {"body": mm.group(2)}
    return out


def _field_prisma_name(line: str) -> str:
    return line.strip().split()[0]


def _field_type_token(line: str) -> str:
    parts = line.strip().split()
    return parts[1].rstrip("?") if len(parts) > 1 else ""


def is_navigation_field(line: str, parsed: ParsedSchema) -> bool:
    token = _field_type_token(line)
    if token.endswith("[]"):
        return True
    if token in parsed.model_names:
        return True
    if "@relation(" in line and token not in SCALAR_TYPES and token not in parsed.enums:
        return True
    return False


def resolve_prisma_field_column(body: str, prisma_field: str) -> str:
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("//") or line.startswith("@@"):
            continue
        if line.split()[0] != prisma_field:
            continue
        map_m = re.search(r'@map\("([^"]+)"\)', line)
        if map_m:
            return map_m.group(1)
        return re.sub(r"(?<!^)(?=[A-Z])", "_", prisma_field).lower()
    return prisma_field


def extract_model_contract(schema: str, model_name: str) -> dict[str, Any]:
    parsed = parse_schema(schema)
    body = parsed.models[model_name]["body"]
    table_m = re.search(r'@@map\("([^"]+)"\)', body)
    table = table_m.group(1) if table_m else re.sub(r"(?<!^)(?=[A-Z])", "_", model_name).lower()

    field_lines: list[str] = []
    block_lines = body.splitlines()
    i = 0
    while i < len(block_lines):
        raw = block_lines[i].strip()
        if raw and not raw.startswith("//") and not raw.startswith("@@") and re.match(r"\w+\s+\S+", raw):
            combined = raw
            open_parens = combined.count("(") - combined.count(")")
            while open_parens > 0 and i + 1 < len(block_lines):
                i += 1
                nxt = block_lines[i].strip()
                if nxt.startswith("//"):
                    continue
                combined += " " + nxt
                open_parens = combined.count("(") - combined.count(")")
            field_lines.append(combined)
        i += 1

    columns: list[dict[str, Any]] = []
    foreign_keys: list[dict[str, Any]] = []
    unique_constraints: list[dict[str, Any]] = []
    indexes: list[dict[str, Any]] = []
    pk_cols: list[str] = []

    scalar_fields: dict[str, dict[str, Any]] = {}
    navigation_lines: list[str] = []

    for combined in field_lines:
        if is_navigation_field(combined, parsed):
            navigation_lines.append(combined)
            continue

        prisma_field = _field_prisma_name(combined)
        type_token = _field_type_token(combined)
        if type_token not in SCALAR_TYPES and type_token not in parsed.enums:
            continue
        map_m = re.search(r'@map\("([^"]+)"\)', combined)
        column = map_m.group(1) if map_m else re.sub(r"(?<!^)(?=[A-Z])", "_", prisma_field).lower()
        nullable = "?" in combined.split("//")[0].split()[1] if len(combined.split()) > 1 else False
        default_info = parse_default(combined, type_token)
        pg_type = prisma_scalar_to_postgres(type_token, combined)
        col = {
            "prisma_field": prisma_field,
            "column": column,
            "prisma_type": type_token,
            "postgres_type": pg_type,
            "nullable": nullable,
            **default_info,
            "generation": None,
            "evidence": [f"schema:{model_name}.{prisma_field}"],
        }
        columns.append(col)
        scalar_fields[prisma_field] = col
        if "@id" in combined:
            pk_cols.append(column)
        if "@unique" in combined and "@id" not in combined:
            unique_constraints.append(
                {
                    "name": f"{table}_{column}_key",
                    "columns": [column],
                    "evidence": [f"schema:{model_name}.{prisma_field}@unique"],
                }
            )

    for combined in navigation_lines:
        rel_m = re.search(r"@relation\((.*)\)", combined, re.S)
        if not rel_m or "fields:" not in rel_m.group(1):
            continue
        fields_m = re.search(r"fields:\s*\[([^\]]+)\]", rel_m.group(1))
        refs_m = re.search(r"references:\s*\[([^\]]+)\]", rel_m.group(1))
        on_del_m = re.search(r"onDelete:\s*(\w+)", rel_m.group(1))
        on_upd_m = re.search(r"onUpdate:\s*(\w+)", rel_m.group(1))
        if not fields_m or not refs_m:
            continue
        local_prisma = fields_m.group(1).strip()
        ref_prisma = refs_m.group(1).strip()
        local = scalar_fields.get(local_prisma)
        if not local:
            continue
        ref_model = _field_type_token(combined)
        ref_body = parsed.models.get(ref_model, {}).get("body", "")
        ref_table_m = re.search(r'@@map\("([^"]+)"\)', ref_body)
        ref_table = (
            ref_table_m.group(1)
            if ref_table_m
            else re.sub(r"(?<!^)(?=[A-Z])", "_", ref_model).lower()
        )
        ref_col = resolve_prisma_field_column(ref_body, ref_prisma)
        on_delete = (on_del_m.group(1) if on_del_m else "Restrict").upper()
        on_delete = on_delete.replace("SETNULL", "SET NULL")
        on_update = (on_upd_m.group(1) if on_upd_m else "Cascade").upper()
        on_update = on_update.replace("NOACTION", "NO ACTION")
        foreign_keys.append(
            {
                "local_columns": [local["column"]],
                "referenced_schema": "public",
                "referenced_relation": ref_table,
                "referenced_columns": [ref_col],
                "on_delete": on_delete,
                "on_update": on_update,
                "constraint_name": None,
                "required_before_first_consumer": True,
                "evidence": [f"schema:{model_name}.{local_prisma}->@{ref_model}"],
            }
        )

    for raw in body.splitlines():
        line = raw.strip()
        if line.startswith("@@id"):
            m = re.search(r"@@id\(\[([^\]]+)\]", line)
            if m:
                pk_cols = []
                for pf in [x.strip() for x in m.group(1).split(",")]:
                    if pf in scalar_fields:
                        pk_cols.append(scalar_fields[pf]["column"])
        if line.startswith("@@unique"):
            m = re.search(r"@@unique\(\[([^\]]+)\]", line)
            if m:
                cols = []
                for pf in [x.strip() for x in m.group(1).split(",")]:
                    if pf in scalar_fields:
                        cols.append(scalar_fields[pf]["column"])
                if cols:
                    unique_constraints.append(
                        {
                            "name": f"{table}_{'_'.join(cols)}_key",
                            "columns": cols,
                            "evidence": [f"schema:{model_name}:@@unique"],
                        }
                    )
        if line.startswith("@@index"):
            m = re.search(r"@@index\(\[([^\]]+)\]", line)
            if m:
                cols = []
                for pf in [x.strip() for x in m.group(1).split(",")]:
                    if pf in scalar_fields:
                        cols.append(scalar_fields[pf]["column"])
                if cols:
                    indexes.append(
                        {
                            "columns": cols,
                            "evidence": [f"schema:{model_name}:@@index"],
                        }
                    )

    enum_deps_map: dict[str, dict[str, Any]] = {}
    for col in columns:
        if col["prisma_type"] in parsed.enums:
            enum_deps_map[col["prisma_type"]] = {
                "schema": "public",
                "name": col["prisma_type"],
                "labels": parsed.enums[col["prisma_type"]],
                "order_material": True,
                "evidence": [f"schema:enum {col['prisma_type']}"],
            }
    enum_deps = list(enum_deps_map.values())

    return {
        "table": table,
        "columns": columns,
        "primary_key": {
            "name": f"{table}_pkey",
            "columns": pk_cols,
            "evidence": [f"schema:{model_name}:@id"],
        },
        "foreign_keys": foreign_keys,
        "unique_constraints": unique_constraints,
        "required_preexisting_indexes": indexes,
        "enum_dependencies": enum_deps,
    }
