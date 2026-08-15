"""Extended positive owner resolution for CI-R3B1O.2 with M252 and golden production tables."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from ci_r3b1l1_constants import BOOTSTRAP_TABLES
from ci_r3b1l2_constants import SCHEMA_PRISMA
from ci_r3b1l21_r3b_authority import (
    CREATE_TABLE_RE,
    INDEX_CREATE_RE,
    build_owner_maps as build_l21_owner_maps,
    resolve_enum_owner,
    resolve_table_owner as resolve_l21_table_owner,
)
from ci_r3b1m_index_owner_inventory import build_index_owner_inventory
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_constants import M252_CANONICAL, MIG_ROOT, REPO  # noqa: F401

OwnerResolution = Literal["OWNER_R3B", "OWNER_M252", "OWNER_OUT_OF_SCOPE", "OWNER_UNKNOWN"]


def _parse_schema_field_unique_maps() -> dict[str, str]:
    text = SCHEMA_PRISMA.read_text()
    out: dict[str, str] = {}
    for model_block in re.finditer(r"model\s+\w+\s*\{(.*?)\n\}", text, re.S):
        body = model_block.group(1)
        map_m = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_m.group(1) if map_m else None
        if not table:
            continue
        for uniq in re.finditer(r'@unique\(map:\s*"([^"]+)"\)', body):
            out[uniq.group(1)] = table
        for uniq in re.finditer(r'@@unique\([^)]*map:\s*"([^"]+)"', body):
            out[uniq.group(1)] = table
    return out


def _parse_schema_index_maps() -> dict[str, str]:
    text = SCHEMA_PRISMA.read_text()
    out: dict[str, str] = {}
    for model_block in re.finditer(r"model\s+\w+\s*\{(.*?)\n\}", text, re.S):
        body = model_block.group(1)
        map_m = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_m.group(1) if map_m else None
        if not table:
            continue
        for idx in re.finditer(r'@@index\([^)]*map:\s*"([^"]+)"', body):
            out[idx.group(1)] = table
    return out


def _parse_schema_pk_maps() -> dict[str, str]:
    text = SCHEMA_PRISMA.read_text()
    out: dict[str, str] = {}
    for model_block in re.finditer(r"model\s+\w+\s*\{(.*?)\n\}", text, re.S):
        body = model_block.group(1)
        map_m = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_m.group(1) if map_m else None
        if not table:
            continue
        pk = re.search(r'@id\(map:\s*"([^"]+)"\)', body)
        if pk:
            out[pk.group(1)] = table
    return out


INDEX_CREATE_UNQUOTED_RE = re.compile(
    r"CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?\"?([^\"\s]+)\"?\s+ON\s+(?:public\.)?\"?([^\"\s(]+)\"?",
    re.I,
)


def _parse_golden_production_index_owners(schema_dump: Path | None = None) -> dict[str, str]:
    candidates = []
    if schema_dump and schema_dump.exists():
        candidates.append(schema_dump.read_text(errors="replace"))
    for path in [
        REPO / "docs/audits/ci-recovery/.work/r3b1o/production_schema_only.sql",
        REPO / "docs/audits/ci-recovery/.work/r3b1o2/production_schema_only.sql",
    ]:
        if path.exists():
            candidates.append(path.read_text(errors="replace"))
    out: dict[str, str] = {}
    for text in candidates:
        for m in INDEX_CREATE_RE.finditer(text):
            out[m.group(1)] = m.group(2)
        for m in INDEX_CREATE_UNQUOTED_RE.finditer(text):
            out[m.group(1)] = m.group(2)
    return out


def _parse_golden_production_tables(schema_dump: Path | None = None) -> set[str]:
    candidates = []
    if schema_dump and schema_dump.exists():
        candidates.append(schema_dump.read_text(errors="replace"))
    for path in [
        REPO / "docs/audits/ci-recovery/.work/r3b1o/production_schema_only.sql",
        REPO / "docs/audits/ci-recovery/.work/r3b1o2/production_schema_only.sql",
    ]:
        if path.exists():
            candidates.append(path.read_text(errors="replace"))
    tables: set[str] = set()
    unquoted = re.compile(
        r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?\"?([^\"\s(]+)\"?",
        re.I,
    )
    for text in candidates:
        for m in CREATE_TABLE_RE.finditer(text):
            tables.add(m.group(1))
        for m in unquoted.finditer(text):
            name = m.group(1)
            if name != "public":
                tables.add(name)
    return tables


def _m252_index_to_table() -> dict[str, str]:
    table = M252_TABLE
    return {
        M252_CANONICAL["UNIQUE"]: table,
        M252_CANONICAL["INDEX"]: table,
        M252_CANONICAL["PK"]: table,
        M252_CANONICAL["ORG_FK"]: table,
        M252_CANONICAL["MEMBERSHIP_FK"]: table,
    }


def build_owner_maps(*, schema_dump: Path | None = None) -> dict[str, Any]:
    owners = build_l21_owner_maps()
    golden_tables = _parse_golden_production_tables(schema_dump)
    golden_index_owners = _parse_golden_production_index_owners(schema_dump)
    m252_maps = _m252_index_to_table()
    field_unique = _parse_schema_field_unique_maps()
    index_maps = _parse_schema_index_maps()
    pk_maps = _parse_schema_pk_maps()

    catalog_index = dict(owners["catalog_index_to_table"])
    migration_index = dict(owners["migration_index_to_table"])
    for name, table in {**m252_maps, **field_unique, **index_maps, **pk_maps}.items():
        catalog_index.setdefault(name, table)
        migration_index.setdefault(name, table)

    return {
        **owners,
        "m252_table": M252_TABLE,
        "m252_index_to_table": m252_maps,
        "golden_production_tables": golden_tables,
        "golden_production_index_to_table": golden_index_owners,
        "schema_field_unique_to_table": field_unique,
        "schema_index_map_to_table": index_maps,
        "schema_pk_map_to_table": pk_maps,
        "catalog_index_to_table": catalog_index,
        "migration_index_to_table": migration_index,
        "index_inventory": build_index_owner_inventory(),
    }


def resolve_table_owner(table_name: str | None, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not table_name:
        return "OWNER_UNKNOWN", None, "missing table name"
    if table_name == owners.get("m252_table"):
        return "OWNER_M252", table_name, "canonical M252 authority table"
    if table_name in owners["tables"]:
        return "OWNER_R3B", table_name, "explicit R3B authority table"
    if table_name in owners.get("all_schema_tables", set()):
        return "OWNER_OUT_OF_SCOPE", table_name, "positive schema table outside R3B universe"
    if table_name in owners.get("migration_tables", set()):
        return "OWNER_OUT_OF_SCOPE", table_name, "migration table inventory outside R3B universe"
    if table_name in owners.get("golden_production_tables", set()):
        return "OWNER_OUT_OF_SCOPE", table_name, "golden production schema dump table outside current schema.prisma"
    return "OWNER_UNKNOWN", None, "table not positively identified"


def resolve_index_owner(index_name: str, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not index_name:
        return "OWNER_UNKNOWN", None, "missing index name"

    m252 = owners.get("m252_index_to_table", {})
    if index_name in m252:
        return "OWNER_M252", m252[index_name], "M252 canonical physical authority index/constraint map"

    for source, label in [
        (owners.get("golden_production_index_to_table", {}), "golden production schema dump index map"),
        (owners.get("schema_field_unique_to_table", {}), "schema.prisma @unique(map:)"),
        (owners.get("schema_index_map_to_table", {}), "schema.prisma @@index(map:)"),
        (owners.get("schema_pk_map_to_table", {}), "schema.prisma @id(map:)"),
        (owners.get("r3b_index_to_table", {}), "accepted R3B authority index map"),
        (owners.get("catalog_index_to_table", {}), "positive catalog/schema index map"),
        (owners.get("migration_index_to_table", {}), "migration index creator inventory"),
        (owners.get("schema_unique_to_table", {}), "schema.prisma @@unique constraint owner"),
    ]:
        table = source.get(index_name)
        if not table:
            continue
        if table == owners.get("m252_table"):
            return "OWNER_M252", table, label
        if table in owners["tables"]:
            return "OWNER_R3B", table, label
        return "OWNER_OUT_OF_SCOPE", table, f"{label} outside R3B universe"

    inv = owners.get("index_inventory", {})
    from ci_r3b1m_index_owner_inventory import resolve_index_from_inventory

    resolution, table, proof, _ = resolve_index_from_inventory(index_name, inv)
    if resolution == "OWNER_R3B" and table:
        return "OWNER_R3B", table, proof or "index inventory"
    if resolution == "OWNER_OUT_OF_SCOPE" and table:
        if table == owners.get("m252_table"):
            return "OWNER_M252", table, proof or "index inventory M252 owner"
        return "OWNER_OUT_OF_SCOPE", table, proof or "index inventory"

    return "OWNER_UNKNOWN", None, "no positive owner source"


def resolve_constraint_owner(constraint_name: str | None, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not constraint_name:
        return "OWNER_UNKNOWN", None, "missing constraint name"
    m252 = owners.get("m252_index_to_table", {})
    if constraint_name in m252:
        return "OWNER_M252", m252[constraint_name], "M252 canonical FK/PK constraint map"
    table = owners.get("constraint_to_table", {}).get(constraint_name)
    if table:
        if table in owners["tables"]:
            return "OWNER_R3B", table, "R3B catalog constraint map"
        if table == owners.get("m252_table"):
            return "OWNER_M252", table, "M252 catalog constraint map"
        return "OWNER_OUT_OF_SCOPE", table, "catalog constraint outside R3B universe"
    return "OWNER_UNKNOWN", None, "constraint not positively identified"
