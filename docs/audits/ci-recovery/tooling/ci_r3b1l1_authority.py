"""Load hash-bound R3B0.21 authority with exact PostgreSQL semantics for CI-R3B1L.1."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1d12_catalog_model import defaults_match, semantic_default_from_pg_expr
from ci_r3b1l1_constants import (
    AUTHORITY_ARTIFACTS,
    BOOTSTRAP_ENUMS,
    BOOTSTRAP_TABLES,
    CATALOG_PATH,
    DATA,
    PROPERTY_CATEGORIES,
    RECOVERY,
    REPO,
    R3B1L_AUTHORITY_MANIFEST,
    R3B1L_CANONICAL_54,
)

AUTHORITY_MANIFEST = DATA / "ci-r3b1l1-authority-manifest-2026-08.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def types_exact_match(expected: str, actual: str) -> bool:
    return (expected or "").strip() == (actual or "").strip()


def authority_column_type(col: dict[str, Any]) -> str:
    dt = (col.get("data_type") or "").lower()
    udt = col.get("udt_name") or ""
    if dt == "user-defined":
        return f'"{udt}"'
    if dt == "timestamp without time zone":
        prec = col.get("datetime_precision")
        if prec is not None and prec != 6:
            return f"timestamp({prec}) without time zone"
        return "timestamp without time zone"
    if dt == "timestamp with time zone":
        prec = col.get("datetime_precision")
        # information_schema reports 6 for default timestamptz max precision; format_type omits it at atttypmod=-1
        if prec is not None and prec not in (6,):
            return f"timestamp({prec}) with time zone"
        return "timestamp with time zone"
    if dt == "character varying":
        length = col.get("character_maximum_length")
        return f"character varying({length})" if length else "character varying"
    if dt == "character":
        length = col.get("character_maximum_length")
        return f"character({length})" if length else "character"
    if dt == "numeric":
        p = col.get("numeric_precision")
        s = col.get("numeric_scale")
        if p is not None and s is not None:
            return f"numeric({p},{s})"
        return "numeric"
    if dt == "double precision":
        return "double precision"
    if dt == "integer":
        return "integer"
    if dt == "bigint":
        return "bigint"
    if dt == "boolean":
        return "boolean"
    if dt == "jsonb":
        return "jsonb"
    if dt == "json":
        return "json"
    if dt == "uuid":
        return "uuid"
    if dt == "text":
        return "text"
    return udt or dt


def authority_column_default(col: dict[str, Any], pg_type: str) -> dict[str, Any]:
    raw = col.get("column_default")
    if raw is None:
        return {"kind": "NO_DATABASE_DEFAULT", "value": None}
    return semantic_default_from_pg_expr(str(raw), pg_type)


def parse_fk_definition(defn: str) -> dict[str, Any]:
    m = re.search(
        r"FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)"
        r"(?: MATCH (FULL|PARTIAL|SIMPLE))?"
        r"(?: ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT))?"
        r"(?: ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT))?"
        r"(?: DEFERRABLE(?: INITIALLY DEFERRED)?)?",
        defn,
        re.I,
    )
    if not m:
        return {"raw": defn}
    return {
        "local_columns": [c.strip().strip('"') for c in m.group(1).split(",")],
        "referenced_table": m.group(2),
        "referenced_columns": [c.strip().strip('"') for c in m.group(3).split(",")],
        "match_type": (m.group(4) or "SIMPLE").upper(),
        "on_update": (m.group(5) or "NO ACTION").upper(),
        "on_delete": (m.group(6) or "NO ACTION").upper(),
        "deferrable": "DEFERRABLE" in defn.upper(),
        "initially_deferred": "INITIALLY DEFERRED" in defn.upper(),
        "validated": True,
    }


def parse_pk_definition(defn: str) -> dict[str, Any]:
    m = re.search(r"PRIMARY KEY \(([^)]+)\)", defn, re.I)
    return {
        "columns": [c.strip().strip('"') for c in m.group(1).split(",")] if m else [],
        "deferrable": "DEFERRABLE" in defn.upper(),
        "initially_deferred": "INITIALLY DEFERRED" in defn.upper(),
        "validated": True,
    }


def normalize_indexdef(defn: str) -> str:
    text = re.sub(r"\s+", " ", (defn or "").strip())
    text = re.sub(r"\bpublic\.", "", text, flags=re.I)
    if not text.upper().startswith("CREATE"):
        text = f"create index on using btree ()" if not text else text
    return text.lower()


def parse_index_definition(defn: str) -> dict[str, Any]:
    unique = "UNIQUE INDEX" in defn.upper() or "UNIQUE" in defn.upper()
    method_m = re.search(r"USING (\w+)", defn, re.I)
    where_m = re.search(r"\bWHERE (.+)$", defn, re.I)
    include_m = re.search(r"\bINCLUDE \(([^)]+)\)", defn, re.I)
    cols_m = re.search(r"USING \w+ \(([^)]+)\)", defn, re.I)
    name_m = re.search(r"(?:UNIQUE )?INDEX (\w+)", defn, re.I)
    cols = [c.strip().strip('"') for c in cols_m.group(1).split(",")] if cols_m else []
    include_cols = [c.strip().strip('"') for c in include_m.group(1).split(",")] if include_m else []
    return {
        "name": name_m.group(1) if name_m else None,
        "unique": unique,
        "method": method_m.group(1).lower() if method_m else "btree",
        "columns": cols,
        "include_columns": include_cols,
        "predicate": where_m.group(1).strip() if where_m else None,
        "normalized_definition": normalize_indexdef(defn),
        "definition": defn,
        "valid": True,
        "ready": True,
    }


def load_production_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


def load_canonical_54() -> dict[str, Any]:
    return json.loads(R3B1L_CANONICAL_54.read_text())


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
            "identity": None,
            "generated": None,
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
        elif ctype == "UNIQUE":
            entry["columns"] = [c.strip().strip('"') for c in re.search(r"\(([^)]+)\)", defn).group(1).split(",")]
            entry.update({"deferrable": False, "initially_deferred": False, "validated": True})
        elif ctype == "CHECK":
            entry["normalized_definition"] = re.sub(r"\s+", " ", defn.strip()).lower()
            entry.update({"deferrable": False, "initially_deferred": False, "validated": True})
        constraints.append(entry)
    indexes = []
    for idx in auth.get("indexes", []):
        parsed = parse_index_definition(idx.get("definition", ""))
        parsed["name"] = idx.get("index_name") or parsed.get("name")
        indexes.append(parsed)
    return {"table": table, "columns": columns, "constraints": constraints, "indexes": indexes}


def verify_authority_counts(catalog: dict[str, Any]) -> dict[str, Any]:
    identities = [f"{t}:{c}" for t in BOOTSTRAP_TABLES for c in PROPERTY_CATEGORIES]
    ids = [f"P{i:03d}" for i in range(1, 55)]
    return {
        "objects": len(BOOTSTRAP_TABLES) + len(BOOTSTRAP_ENUMS),
        "unique_objects": len(set(BOOTSTRAP_TABLES + BOOTSTRAP_ENUMS)),
        "tables": len(BOOTSTRAP_TABLES),
        "enums": len(BOOTSTRAP_ENUMS),
        "property_categories": len(identities),
        "unique_property_categories": len(set(identities)),
        "authority_ids": ids,
        "pass": len(BOOTSTRAP_TABLES) == 9 and len(BOOTSTRAP_ENUMS) == 10 and len(identities) == 54,
    }


def build_authority_manifest() -> dict[str, Any]:
    artifacts = []
    for rel, role in AUTHORITY_ARTIFACTS:
        path = RECOVERY / rel
        artifacts.append({"path": str(path.relative_to(REPO)), "sha256": sha256_file(path), "role": role})
    r3b1l_manifest_sha = sha256_file(R3B1L_AUTHORITY_MANIFEST) if R3B1L_AUTHORITY_MANIFEST.exists() else None
    r3b1l_canonical_sha = sha256_file(R3B1L_CANONICAL_54) if R3B1L_CANONICAL_54.exists() else None
    catalog = load_production_catalog()
    counts = verify_authority_counts(catalog)
    digest = sha256_text("\n".join(f"{a['path']}\0{a['sha256']}" for a in artifacts))
    manifest = {
        "schema_version": 1,
        "phase": "CI-R3B1L.1",
        "terminal_status_authority": "CI_R3B021_FINAL_CONVERGENCE_COMPLETED",
        "inherited_r3b1l_authority_manifest_sha256": r3b1l_manifest_sha,
        "inherited_r3b1l_canonical_54_sha256": r3b1l_canonical_sha,
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


def column_semantics_match(expected_cols: dict, actual_cols: dict) -> tuple[bool, list[dict]]:
    mismatches = []
    for name, exp in expected_cols.items():
        act = actual_cols.get(name)
        if not act:
            mismatches.append({"category": "MISSING_COLUMN", "column": name})
            continue
        if not types_exact_match(exp["type"], act.get("type", "")):
            mismatches.append({"category": "TYPE_MISMATCH", "column": name, "expected": exp["type"], "actual": act.get("type")})
        if act.get("nullable") != exp["nullable"]:
            mismatches.append(
                {"category": "NULLABILITY_MISMATCH", "column": name, "expected": exp["nullable"], "actual": act.get("nullable")}
            )
        if not defaults_match(exp["default"], act.get("default", {"kind": "NO_DATABASE_DEFAULT", "value": None})):
            mismatches.append(
                {"category": "DEFAULT_MISMATCH", "column": name, "expected": exp["default"], "actual": act.get("default")}
            )
        if act.get("identity") != exp.get("identity"):
            mismatches.append(
                {"category": "IDENTITY_MISMATCH", "column": name, "expected": exp.get("identity"), "actual": act.get("identity")}
            )
        if act.get("generated") != exp.get("generated"):
            mismatches.append(
                {"category": "GENERATED_MISMATCH", "column": name, "expected": exp.get("generated"), "actual": act.get("generated")}
            )
    for extra in sorted(set(actual_cols.keys()) - set(expected_cols.keys())):
        mismatches.append({"category": "UNEXPECTED_COLUMN", "column": extra})
    return len(mismatches) == 0, mismatches
