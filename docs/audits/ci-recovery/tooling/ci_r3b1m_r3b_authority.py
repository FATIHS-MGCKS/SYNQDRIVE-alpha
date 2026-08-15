"""R3B1M positive owner resolution without prefix inference acceptance."""
from __future__ import annotations

import json
import re
from typing import Any, Literal

from ci_r3b1l1_authority import load_production_catalog
from ci_r3b1l1_constants import BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA
from ci_r3b1l2_constants import R3B1L_CANONICAL_54, SCHEMA_PRISMA
from ci_r3b1l2_r3b_authority import build_authority_manifest as build_base_authority_manifest
from ci_r3b1m_constants import MIG_ROOT, REPO, SCHEMA_PRISMA, pg_trunc_identifier
from ci_r3b1m_index_owner_inventory import (
    CREATE_TABLE_RE,
    build_index_owner_inventory,
    prefix_diagnostic_hint,
    resolve_index_from_inventory,
)

OwnerResolution = Literal["OWNER_R3B", "OWNER_OUT_OF_SCOPE", "OWNER_UNKNOWN"]
AUTHORITY_MANIFEST = DATA / "ci-r3b1m-implementation-authority-manifest-2026-08.json"
_index_inventory: dict[str, Any] | None = None

def _schema_mapped_tables() -> set[str]:
    text = SCHEMA_PRISMA.read_text()
    return set(re.findall(r'@@map\("([^"]+)"\)', text))


def _migration_table_inventory() -> set[str]:
    tables: set[str] = set()
    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        for m in CREATE_TABLE_RE.finditer(path.read_text(errors="replace")):
            tables.add(m.group(1))
    return tables


def get_index_inventory() -> dict[str, Any]:
    global _index_inventory
    if _index_inventory is None:
        _index_inventory = build_index_owner_inventory()
    return _index_inventory


def build_implementation_authority_manifest(authorized_inputs: dict[str, Any]) -> dict[str, Any]:
    base = build_base_authority_manifest()
    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "prefix_inference_acceptance": False,
        "authority_artifacts": authorized_inputs.get("entries", []),
        "frozen_diff_sha256": authorized_inputs.get("frozen_diff_sha256"),
        "authority_object_count": base.get("authority_object_count", 19),
        "authority_table_count": 9,
        "authority_enum_count": 10,
        "authority_property_category_count": 54,
        "currently_authorized_drift_records": authorized_inputs.get("authorized_drift_records", []),
    }
    AUTHORITY_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def build_owner_maps(catalog: dict | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    inventory = get_index_inventory()
    r3b_index_to_table: dict[str, str] = {}
    constraint_to_table: dict[str, str] = {}
    table_columns: dict[str, set[str]] = {t: set() for t in BOOTSTRAP_TABLES}

    for table in BOOTSTRAP_TABLES:
        row = next(x for x in catalog["tables"] if x["name"] == table)
        for col in row.get("columns", []):
            table_columns[table].add(col["column_name"])
        for con in row.get("constraints", []):
            constraint_to_table[con["constraint_name"]] = table
        for idx in row.get("indexes", []):
            r3b_index_to_table[idx["index_name"]] = table

    schema_tables = _schema_mapped_tables()
    migration_tables = _migration_table_inventory()
    property_id_by_identity = {}
    if R3B1L_CANONICAL_54.exists():
        canonical = json.loads(R3B1L_CANONICAL_54.read_text())
        for entry in canonical.get("entries", []):
            property_id_by_identity[entry["property_identity"]] = entry["authority_id"]

    return {
        "tables": set(BOOTSTRAP_TABLES),
        "enums": set(BOOTSTRAP_ENUMS),
        "all_schema_tables": schema_tables,
        "table_columns": table_columns,
        "constraint_to_table": constraint_to_table,
        "r3b_index_to_table": r3b_index_to_table,
        "index_inventory": inventory,
        "migration_tables": migration_tables,
        "property_id_by_identity": property_id_by_identity,
        "schema_tables_by_prefix": sorted(schema_tables, key=len, reverse=True),
    }


def resolve_index_owner(index_name: str, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str, str | None]:
    resolution, table, proof, _ = resolve_index_from_inventory(index_name, owners["index_inventory"])
    hint = prefix_diagnostic_hint(index_name, owners.get("schema_tables_by_prefix", []))
    if resolution == "OWNER_R3B":
        return "OWNER_R3B", table, proof or "index inventory", hint
    if resolution == "OWNER_OUT_OF_SCOPE":
        return "OWNER_OUT_OF_SCOPE", table, proof or "index inventory", hint
    return "OWNER_UNKNOWN", None, "no positive owner source", hint


def resolve_table_owner(table_name: str | None, owners: dict[str, Any]) -> tuple[OwnerResolution, str | None, str]:
    if not table_name:
        return "OWNER_UNKNOWN", None, "missing table name"
    if table_name in owners["tables"]:
        return "OWNER_R3B", table_name, "explicit R3B authority table"
    if table_name in owners.get("all_schema_tables", set()):
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
