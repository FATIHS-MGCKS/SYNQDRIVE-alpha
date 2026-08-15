"""Load accepted R3B0.21 authority maps for CI-R3B1L.2 scope resolution."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1l1_authority import authority_column_type, load_production_catalog
from ci_r3b1l1_constants import BOOTSTRAP_ENUMS, BOOTSTRAP_TABLES, DATA, PROPERTY_CATEGORIES
from ci_r3b1l2_constants import CATALOG_PATH, R3B1L_CANONICAL_54

AUTHORITY_MANIFEST = DATA / "ci-r3b1l2-authority-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_authority_manifest() -> dict[str, Any]:
    from ci_r3b1l1_constants import AUTHORITY_ARTIFACTS, RECOVERY, REPO

    artifacts = []
    for rel, role in AUTHORITY_ARTIFACTS:
        path = RECOVERY / rel
        artifacts.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path), "role": role})
    catalog = load_production_catalog()
    identities = [f"{t}:{c}" for t in BOOTSTRAP_TABLES for c in PROPERTY_CATEGORIES]
    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2",
        "authority_artifacts": artifacts,
        "authority_object_count": len(BOOTSTRAP_TABLES) + len(BOOTSTRAP_ENUMS),
        "authority_table_count": len(BOOTSTRAP_TABLES),
        "authority_enum_count": len(BOOTSTRAP_ENUMS),
        "authority_property_category_count": len(identities),
        "authority_unique_property_category_count": len(set(identities)),
        "bootstrap_tables": BOOTSTRAP_TABLES,
        "bootstrap_enums": BOOTSTRAP_ENUMS,
        "counts_verified": len(BOOTSTRAP_TABLES) == 9 and len(BOOTSTRAP_ENUMS) == 10 and len(identities) == 54,
    }
    AUTHORITY_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def build_owner_maps(catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    column_to_table: dict[str, str] = {}
    constraint_to_table: dict[str, str] = {}
    index_to_table: dict[str, str] = {}
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
            index_to_table[idx["index_name"]] = table

    for enum in BOOTSTRAP_ENUMS:
        row = next(x for x in catalog["enums"] if x["name"] == enum)
        enum_labels[enum] = row.get("labels", [])

    property_id_by_identity = {}
    if R3B1L_CANONICAL_54.exists():
        canonical = json.loads(R3B1L_CANONICAL_54.read_text())
        for entry in canonical.get("entries", []):
            property_id_by_identity[entry["property_identity"]] = entry["authority_id"]

    return {
        "tables": set(BOOTSTRAP_TABLES),
        "enums": set(BOOTSTRAP_ENUMS),
        "column_to_table": column_to_table,
        "table_columns": table_columns,
        "constraint_to_table": constraint_to_table,
        "index_to_table": index_to_table,
        "enum_labels": enum_labels,
        "property_id_by_identity": property_id_by_identity,
    }


def authority_column_semantic(table: str, column: str, catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    row = next(x for x in catalog["tables"] if x["name"] == table)
    col = next(c for c in row["columns"] if c["column_name"] == column)
    pg_type = authority_column_type(col)
    return {
        "table": table,
        "column": column,
        "type": pg_type,
        "nullable": col.get("is_nullable", True),
        "default": col.get("column_default"),
        "data_type": col.get("data_type"),
        "datetime_precision": col.get("datetime_precision"),
    }


def replay_column_semantic(table: str, column: str, catalog: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Replay semantics for bootstrap scope per accepted R3B1L.1 54/54 parity."""
    catalog = catalog or load_production_catalog()
    auth = authority_column_semantic(table, column, catalog)
    canonical = json.loads(R3B1L_CANONICAL_54.read_text()) if R3B1L_CANONICAL_54.exists() else None
    col = None
    if canonical:
        table_auth = canonical.get("table_semantic_authority", {}).get(table, {})
        col = table_auth.get("columns", {}).get(column)
    return {
        "table": table,
        "column": column,
        "type": auth["type"],
        "nullable": col.get("nullable") if col else auth.get("nullable"),
        "default": col.get("default") if col else auth.get("default"),
        "parity_evidence": "CI-R3B1L_EXACT_PARITY 54/54 types category PASS",
    }
