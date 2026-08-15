"""Load and hash-bind R3B0.21 final authority; build canonical 54-property set."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1d12_catalog_model import defaults_match, semantic_default_from_pg_expr
from ci_r3b1l_constants import (
    AUTHORITY_ARTIFACTS,
    BOOTSTRAP_ENUMS,
    BOOTSTRAP_TABLES,
    CATALOG_PATH,
    CONTRACT_PATH,
    DATA,
    LEDGER_PATH,
    PROPERTY_CATEGORIES,
    RECOVERY,
    REPO,
)

CANONICAL_54 = DATA / "ci-r3b1l-canonical-54-property-authority-2026-08.json"
AUTHORITY_MANIFEST = DATA / "ci-r3b1l-final-authority-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


PG_TYPE_CANONICAL = {
    "int4": "integer",
    "int8": "bigint",
    "bool": "boolean",
    "float8": "double precision",
    "float4": "real",
    "varchar": "text",
    "bpchar": "text",
    "character varying": "text",
}


def canonical_pg_type(type_name: str) -> str:
    low = (type_name or "").strip().lower()
    return PG_TYPE_CANONICAL.get(low, type_name)


def normalize_timestamp_type(type_name: str) -> str:
    t = (type_name or "").lower()
    t = re.sub(r"timestamp\(\d+\)", "timestamp", t)
    return t.replace("timestamptz", "timestamp with time zone")


def types_equivalent(expected: str, actual: str) -> bool:
    if canonical_pg_type(expected) == canonical_pg_type(actual):
        return True
    return normalize_timestamp_type(expected) == normalize_timestamp_type(actual)


def authority_column_type(col: dict[str, Any]) -> str:
    dt = (col.get("data_type") or "").lower()
    udt = col.get("udt_name") or ""
    if dt == "user-defined":
        return udt
    if dt == "timestamp without time zone":
        prec = col.get("datetime_precision")
        return f"timestamp({prec}) without time zone" if prec is not None else "timestamp without time zone"
    if dt == "timestamp with time zone":
        prec = col.get("datetime_precision")
        return f"timestamp({prec}) with time zone" if prec is not None else "timestamp with time zone"
    if dt == "double precision":
        return "double precision"
    if dt == "character varying":
        return "text"
    return canonical_pg_type(udt or dt)


def authority_column_default(col: dict[str, Any], pg_type: str) -> dict[str, Any]:
    raw = col.get("column_default")
    if raw is None:
        return {"kind": "NO_DATABASE_DEFAULT", "value": None}
    return semantic_default_from_pg_expr(str(raw), pg_type)


def parse_fk_definition(defn: str) -> dict[str, Any]:
    m = re.search(
        r"FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)"
        r"(?: ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT))?"
        r"(?: ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT))?",
        defn,
        re.I,
    )
    if not m:
        return {"raw": defn}
    return {
        "local_columns": [c.strip() for c in m.group(1).split(",")],
        "referenced_table": m.group(2),
        "referenced_columns": [c.strip() for c in m.group(3).split(",")],
        "on_update": (m.group(4) or "NO ACTION").upper(),
        "on_delete": (m.group(5) or "NO ACTION").upper(),
    }


def parse_pk_definition(defn: str) -> dict[str, Any]:
    m = re.search(r"PRIMARY KEY \(([^)]+)\)", defn, re.I)
    return {"columns": [c.strip() for c in m.group(1).split(",")]} if m else {"raw": defn}


def parse_index_definition(defn: str) -> dict[str, Any]:
    unique = "UNIQUE INDEX" in defn.upper()
    m = re.search(r"USING (\w+) \(([^)]+)\)", defn, re.I)
    cols = [c.strip().strip('"') for c in m.group(2).split(",")] if m else []
    name_m = re.search(r"INDEX (\w+)", defn, re.I)
    return {
        "name": name_m.group(1) if name_m else None,
        "unique": unique,
        "method": m.group(1).lower() if m else "btree",
        "columns": cols,
    }


def load_production_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


def table_authority(catalog: dict[str, Any], table: str) -> dict[str, Any]:
    for row in catalog.get("tables", []):
        if row.get("name") == table:
            return row
    raise KeyError(f"missing authority table {table}")


def enum_authority(catalog: dict[str, Any], enum: str) -> dict[str, Any]:
    for row in catalog.get("enums", []):
        if row.get("name") == enum:
            return row
    raise KeyError(f"missing authority enum {enum}")


def build_table_expected(table: str, catalog: dict[str, Any]) -> dict[str, Any]:
    auth = table_authority(catalog, table)
    columns: dict[str, dict[str, Any]] = {}
    for col in auth.get("columns", []):
        name = col["column_name"]
        pg_type = authority_column_type(col)
        columns[name] = {
            "name": name,
            "ordinal": col.get("ordinal_position"),
            "type": pg_type,
            "nullable": col.get("is_nullable", True),
            "default": authority_column_default(col, pg_type),
        }
    constraints = []
    for con in auth.get("constraints", []):
        ctype = con.get("constraint_type", "")
        defn = con.get("definition", "")
        entry = {"name": con.get("constraint_name"), "type": ctype, "definition": defn}
        if ctype == "PRIMARY KEY":
            entry.update(parse_pk_definition(defn))
        elif ctype == "FOREIGN KEY":
            entry.update(parse_fk_definition(defn))
        constraints.append(entry)
    indexes = []
    for idx in auth.get("indexes", []):
        parsed = parse_index_definition(idx.get("definition", ""))
        parsed["name"] = idx.get("index_name") or parsed.get("name")
        parsed["definition"] = idx.get("definition")
        indexes.append(parsed)
    return {"table": table, "columns": columns, "constraints": constraints, "indexes": indexes}


def build_canonical_54_entries(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    catalog_sha = sha256_file(CATALOG_PATH)
    entries: list[dict[str, Any]] = []
    seq = 1
    for table in BOOTSTRAP_TABLES:
        expected = build_table_expected(table, catalog)
        for category in PROPERTY_CATEGORIES:
            authority_id = f"P{seq:03d}"
            entries.append(
                {
                    "authority_id": authority_id,
                    "object_type": "table",
                    "schema": "public",
                    "relation": table,
                    "property_class": category,
                    "property_identity": f"{table}:{category}",
                    "expected_semantic_value": {
                        "category": category,
                        "table": table,
                        "column_count": len(expected["columns"]),
                        "constraint_count": len(expected["constraints"]),
                        "index_count": len(expected["indexes"]),
                    },
                    "authority_source": str(CATALOG_PATH.relative_to(REPO)),
                    "authority_source_sha256": catalog_sha,
                }
            )
            seq += 1
    return entries


def verify_authority_counts(catalog: dict[str, Any]) -> dict[str, Any]:
    entries = build_canonical_54_entries(catalog)
    ids = [e["authority_id"] for e in entries]
    identities = [e["property_identity"] for e in entries]
    return {
        "objects": len(BOOTSTRAP_TABLES) + len(BOOTSTRAP_ENUMS),
        "unique_objects": len(set(BOOTSTRAP_TABLES + BOOTSTRAP_ENUMS)),
        "tables": len(BOOTSTRAP_TABLES),
        "enums": len(BOOTSTRAP_ENUMS),
        "property_categories": len(entries),
        "unique_property_categories": len(set(identities)),
        "duplicate_property_categories": len(identities) - len(set(identities)),
        "authority_ids": ids,
        "pass": (
            len(BOOTSTRAP_TABLES) == 9
            and len(BOOTSTRAP_ENUMS) == 10
            and len(entries) == 54
            and len(set(identities)) == 54
            and len(set(ids)) == 54
        ),
    }


def build_authority_manifest() -> dict[str, Any]:
    artifacts = []
    for rel, role in AUTHORITY_ARTIFACTS:
        path = RECOVERY / rel if rel.endswith(".md") else RECOVERY / rel if (RECOVERY / rel).exists() else REPO / rel
        if not path.exists():
            path = RECOVERY / rel
        artifacts.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path), "role": role})
    catalog = load_production_catalog()
    counts = verify_authority_counts(catalog)
    digest = sha256_text("\n".join(f"{a['path']}\0{a['sha256']}" for a in artifacts))
    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1L",
        "terminal_status_authority": "CI_R3B021_FINAL_CONVERGENCE_COMPLETED",
        "AUTHORITY_MANIFEST_SHA256": digest,
        "authority_artifacts": artifacts,
        "authority_object_count": counts["objects"],
        "authority_unique_object_count": counts["unique_objects"],
        "authority_table_count": counts["tables"],
        "authority_enum_count": counts["enums"],
        "authority_property_category_count": counts["property_categories"],
        "authority_unique_property_category_count": counts["unique_property_categories"],
        "counts_verified": counts["pass"],
    }
    AUTHORITY_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def write_canonical_54() -> dict[str, Any]:
    catalog = load_production_catalog()
    entries = build_canonical_54_entries(catalog)
    table_expected = {t: build_table_expected(t, catalog) for t in BOOTSTRAP_TABLES}
    enum_expected = {e: enum_authority(catalog, e) for e in BOOTSTRAP_ENUMS}
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L",
        "authority_manifest_sha256": json.loads(AUTHORITY_MANIFEST.read_text())["AUTHORITY_MANIFEST_SHA256"]
        if AUTHORITY_MANIFEST.exists()
        else None,
        "property_category_count": len(entries),
        "entries": entries,
        "table_semantic_authority": table_expected,
        "enum_semantic_authority": {k: {"labels": v.get("labels", [])} for k, v in enum_expected.items()},
    }
    CANONICAL_54.write_text(json.dumps(out, indent=2) + "\n")
    return out


def load_canonical_54() -> dict[str, Any]:
    return json.loads(CANONICAL_54.read_text())


def column_semantics_match(expected_cols: dict, actual_cols: dict) -> tuple[bool, list[dict]]:
    mismatches = []
    for name, exp in expected_cols.items():
        act = actual_cols.get(name)
        if not act:
            mismatches.append({"category": "MISSING_COLUMN", "column": name})
            continue
        if act.get("type") != exp["type"]:
            mismatches.append({"category": "TYPE_MISMATCH", "column": name, "expected": exp["type"], "actual": act.get("type")})
        if act.get("nullable") != exp["nullable"]:
            mismatches.append(
                {"category": "NULLABILITY_MISMATCH", "column": name, "expected": exp["nullable"], "actual": act.get("nullable")}
            )
        if not defaults_match(exp["default"], act.get("default", {"kind": "NO_DATABASE_DEFAULT", "value": None})):
            mismatches.append(
                {"category": "DEFAULT_MISMATCH", "column": name, "expected": exp["default"], "actual": act.get("default")}
            )
    for extra in sorted(set(actual_cols.keys()) - set(expected_cols.keys())):
        mismatches.append({"category": "UNEXPECTED_COLUMN", "column": extra})
    return len(mismatches) == 0, mismatches
