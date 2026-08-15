"""Extended owner maps and positive owner resolution for CI-R3B1L.2.1."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from ci_r3b1l1_authority import load_production_catalog
from ci_r3b1l1_constants import BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA, PROPERTY_CATEGORIES
from ci_r3b1l2_constants import R3B1L_CANONICAL_54, SCHEMA_PRISMA
from ci_r3b1l2_r3b_authority import build_authority_manifest as build_r3b1l2_authority_manifest
from ci_r3b1l21_constants import MIG_ROOT, REPO

OwnerResolution = Literal["OWNER_R3B", "OWNER_OUT_OF_SCOPE", "OWNER_UNKNOWN"]

AUTHORITY_MANIFEST = DATA / "ci-r3b1l21-authority-manifest-2026-08.json"

CREATE_TABLE_RE = re.compile(
    r'CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([^"\s(]+)"?',
    re.I,
)
INDEX_CREATE_RE = re.compile(
    r'CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([^"\s]+)"?\s+ON\s+"?([^"\s(]+)"?',
    re.I,
)
CONSTRAINT_UNIQUE_RE = re.compile(
    r'ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(',
    re.I,
)
ALTER_TABLE_RE = re.compile(r'ALTER\s+TABLE\s+"?([^"\s]+)"?', re.I)


def _schema_mapped_tables() -> list[str]:
    text = SCHEMA_PRISMA.read_text()
    return sorted(set(re.findall(r'@@map\("([^"]+)"\)', text)), key=len, reverse=True)


def _schema_unique_constraints() -> dict[str, str]:
    text = SCHEMA_PRISMA.read_text()
    out: dict[str, str] = {}
    for model_block in re.finditer(r"model\s+\w+\s*\{(.*?)\n\}", text, re.S):
        body = model_block.group(1)
        map_m = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_m.group(1) if map_m else None
        if not table:
            continue
        for uniq in re.finditer(r'@@unique\([^)]*name:\s*"([^"]+)"', body):
            out[uniq.group(1)] = table
    return out


def _migration_table_inventory() -> set[str]:
    tables: set[str] = set()
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        text = path.read_text(errors="replace")
        for m in CREATE_TABLE_RE.finditer(text):
            tables.add(m.group(1))
    return tables


def _migration_index_inventory() -> dict[str, str]:
    index_to_table: dict[str, str] = {}
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        text = path.read_text(errors="replace")
        current_table: str | None = None
        for line in text.splitlines():
            alt = ALTER_TABLE_RE.search(line)
            if alt:
                current_table = alt.group(1)
        for m in INDEX_CREATE_RE.finditer(text):
            index_to_table[m.group(1)] = m.group(2)
        for m in CONSTRAINT_UNIQUE_RE.finditer(text):
            if current_table:
                index_to_table[m.group(1)] = current_table
    return index_to_table


def _prefix_table_owner(index_name: str, schema_tables: list[str]) -> str | None:
    for table in schema_tables:
        if index_name == table or index_name.startswith(f"{table}_"):
            return table
    return None


def build_authority_manifest() -> dict[str, Any]:
    base = build_r3b1l2_authority_manifest()
    manifest = {**base, "phase": "CI-R3B1L.2.1"}
    AUTHORITY_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def build_owner_maps(catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    r3b_index_to_table: dict[str, str] = {}
    constraint_to_table: dict[str, str] = {}
    column_to_table: dict[str, str] = {}
    table_columns: dict[str, set[str]] = {t: set() for t in BOOTSTRAP_TABLES}
    enum_labels: dict[str, list[str]] = {}

    for table in BOOTSTRAP_TABLES:
        row = next(x for x in catalog["tables"] if x["name"] == table)
        for col in row.get("columns", []):
            name = col["column_name"]
            column_to_table.setdefault(name, table)
            table_columns[table].add(name)
        for con in row.get("constraints", []):
            constraint_to_table[con["constraint_name"]] = table
        for idx in row.get("indexes", []):
            r3b_index_to_table[idx["index_name"]] = table

    for enum in BOOTSTRAP_ENUMS:
        row = next(x for x in catalog["enums"] if x["name"] == enum)
        enum_labels[enum] = row.get("labels", [])

    migration_index_to_table = _migration_index_inventory()
    migration_tables = _migration_table_inventory()
    schema_tables = _schema_mapped_tables()
    schema_unique_to_table = _schema_unique_constraints()

    catalog_index_to_table = dict(r3b_index_to_table)
    for name, table in migration_index_to_table.items():
        catalog_index_to_table.setdefault(name, table)
    for name, table in schema_unique_to_table.items():
        catalog_index_to_table.setdefault(name, table)

    out_of_scope_index_to_table: dict[str, str] = {}
    all_tables = set(schema_tables)
    for name, table in catalog_index_to_table.items():
        if table not in BOOTSTRAP_TABLES and table in all_tables:
            out_of_scope_index_to_table[name] = table

    property_id_by_identity = {}
    if R3B1L_CANONICAL_54.exists():
        canonical = json.loads(R3B1L_CANONICAL_54.read_text())
        for entry in canonical.get("entries", []):
            property_id_by_identity[entry["property_identity"]] = entry["authority_id"]

    return {
        "tables": set(BOOTSTRAP_TABLES),
        "enums": set(BOOTSTRAP_ENUMS),
        "all_schema_tables": set(schema_tables),
        "column_to_table": column_to_table,
        "table_columns": table_columns,
        "constraint_to_table": constraint_to_table,
        "r3b_index_to_table": r3b_index_to_table,
        "migration_index_to_table": migration_index_to_table,
        "migration_tables": migration_tables,
        "catalog_index_to_table": catalog_index_to_table,
        "out_of_scope_index_to_table": out_of_scope_index_to_table,
        "schema_unique_to_table": schema_unique_to_table,
        "schema_tables_by_prefix": schema_tables,
        "property_id_by_identity": property_id_by_identity,
    }


def resolve_index_owner(index_name: str, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not index_name:
        return "OWNER_UNKNOWN", None, "missing index name"

    table = owners["r3b_index_to_table"].get(index_name)
    if table:
        return "OWNER_R3B", table, "accepted R3B authority index map"

    table = owners["catalog_index_to_table"].get(index_name)
    if table:
        if table in owners["tables"]:
            return "OWNER_R3B", table, "replay catalog index map"
        if table in owners["all_schema_tables"]:
            return "OWNER_OUT_OF_SCOPE", table, "positive catalog/schema table owner outside R3B universe"

    table = owners["migration_index_to_table"].get(index_name)
    if table:
        if table in owners["tables"]:
            return "OWNER_R3B", table, "migration index creator inventory"
        return "OWNER_OUT_OF_SCOPE", table, "migration index creator inventory outside R3B universe"

    table = owners["schema_unique_to_table"].get(index_name)
    if table:
        if table in owners["tables"]:
            return "OWNER_R3B", table, "schema.prisma @@unique constraint owner"
        return "OWNER_OUT_OF_SCOPE", table, "schema.prisma @@unique owner outside R3B universe"

    table = _prefix_table_owner(index_name, owners["schema_tables_by_prefix"])
    if table:
        if table in owners["tables"]:
            return "OWNER_R3B", table, "schema table prefix inference"
        return "OWNER_OUT_OF_SCOPE", table, "schema table prefix inference outside R3B universe"

    return "OWNER_UNKNOWN", None, "no positive owner source"


def resolve_table_owner(table_name: str | None, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not table_name:
        return "OWNER_UNKNOWN", None, "missing table name"
    if table_name in owners["tables"]:
        return "OWNER_R3B", table_name, "explicit R3B authority table"
    if table_name in owners["all_schema_tables"]:
        return "OWNER_OUT_OF_SCOPE", table_name, "positive schema table outside R3B universe"
    if table_name in owners.get("migration_tables", set()):
        return "OWNER_OUT_OF_SCOPE", table_name, "migration table inventory outside R3B universe"
    return "OWNER_UNKNOWN", None, "table not positively identified"


def resolve_enum_owner(enum_name: str | None, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not enum_name:
        return "OWNER_UNKNOWN", None, "missing enum name"
    if enum_name in owners["enums"]:
        return "OWNER_R3B", enum_name, "explicit R3B authority enum"
    return "OWNER_OUT_OF_SCOPE", enum_name, "enum outside R3B authority universe"
