"""Hardened Prisma diff classifier for CI-R3B1O.2 with absolute UNRESOLVED=0 requirement."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l2_prisma_sql_parser import ParsedStatement, split_comment_and_sql_blocks, split_sql_statements, tokenize_sql
from ci_r3b1l2_scope_classifier import detect_operation_family, extract_quoted_identifiers
from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_constants import DATA
from ci_r3b1o2_r3b_authority import (
    build_owner_maps,
    resolve_constraint_owner,
    resolve_enum_owner,
    resolve_index_owner,
    resolve_table_owner,
)


def parse_sql_script(script: str) -> list[ParsedStatement]:
    blocks = split_comment_and_sql_blocks(script if script.endswith("\n") else script + "\n")
    statements: list[ParsedStatement] = []
    ordinal = 0
    for comment_lines, comment_tags, sql_text in blocks:
        if not sql_text:
            continue
        for stmt in split_sql_statements(sql_text):
            ordinal += 1
            statements.append(
                ParsedStatement(
                    ordinal=ordinal,
                    comment_tags=comment_tags.copy(),
                    leading_comment_lines=comment_lines.copy(),
                    raw_sql=stmt,
                    sql_tokens=tokenize_sql(stmt),
                )
            )
    return statements


def normalize_sql(sql: str) -> str:
    return " ".join(sql.lower().split())


def operation_fingerprint(op: dict[str, Any]) -> str:
    parts = [
        op.get("operation_family", ""),
        op.get("operation_subtype", ""),
        op.get("owner_table") or "",
        op.get("owner_index") or "",
        op.get("owner_constraint") or "",
        op.get("owner_enum") or "",
        normalize_sql(op.get("raw_sql", "")),
    ]
    return "|".join(parts)


def resolve_owner_fields(stmt: ParsedStatement, owners: dict[str, Any]) -> dict[str, Any]:
    sql = stmt.raw_sql
    ids = extract_quoted_identifiers(sql)
    family, subtype = detect_operation_family(sql)
    owner_table = None
    owner_enum = None
    owner_column = None
    owner_constraint = None
    owner_index = None
    owner_resolution = "OWNER_UNKNOWN"
    owner_resolution_source = "unresolved"

    if family == "ALTER TABLE" and ids:
        owner_table = ids[0]
        owner_resolution, _, owner_resolution_source = resolve_table_owner(owner_table, owners)
        m = re.search(r'ALTER COLUMN "([^"]+)"', sql, re.I)
        if m:
            owner_column = m.group(1)
        if subtype in {"add_constraint", "drop_constraint", "rename_constraint", "foreign_key"}:
            cname = re.search(r'CONSTRAINT "([^"]+)"', sql, re.I)
            if cname:
                owner_constraint = cname.group(1)
                cres, ctable, csrc = resolve_constraint_owner(owner_constraint, owners)
                if cres != "OWNER_UNKNOWN":
                    owner_resolution, owner_table, owner_resolution_source = cres, ctable, csrc
    elif family in {"CREATE TABLE", "DROP TABLE"} and ids:
        owner_table = ids[0]
        owner_resolution, _, owner_resolution_source = resolve_table_owner(owner_table, owners)
    elif family in {"CREATE TYPE", "ALTER TYPE", "DROP TYPE"} and ids:
        owner_enum = ids[0]
        owner_resolution, _, owner_resolution_source = resolve_enum_owner(owner_enum, owners)
    elif family in {"CREATE INDEX", "CREATE UNIQUE INDEX"}:
        m = re.search(r'\bON\s+"([^"]+)"', sql, re.I)
        if m:
            owner_table = m.group(1)
            owner_resolution, _, owner_resolution_source = resolve_table_owner(owner_table, owners)
        if ids:
            owner_index = ids[0]
    elif family in {"DROP INDEX", "ALTER INDEX"} and ids:
        owner_index = ids[0]
        owner_resolution, owner_table, owner_resolution_source = resolve_index_owner(owner_index, owners)
    elif family in {"BEGIN", "COMMIT"}:
        owner_resolution = "OWNER_OUT_OF_SCOPE"
        owner_resolution_source = "transaction wrapper"

    return {
        "operation_family": family,
        "operation_subtype": subtype,
        "primary_target": ids[0] if ids else None,
        "owner_table": owner_table,
        "owner_enum": owner_enum,
        "owner_column": owner_column,
        "owner_constraint": owner_constraint,
        "owner_index": owner_index,
        "owner_resolution": owner_resolution,
        "owner_resolution_source": owner_resolution_source,
        "quoted_identifiers": ids,
        "parse_status": "PARSED" if family != "UNKNOWN" else "UNPARSED",
    }


def classify_scope(parsed: dict[str, Any], owners: dict[str, Any], raw_sql: str = "") -> dict[str, Any]:
    if parsed["parse_status"] != "PARSED":
        return {"classification": "UNRESOLVED", "reason": "unparsed operation family", "authority_id": None, "property_identity": None}

    resolution = parsed.get("owner_resolution", "OWNER_UNKNOWN")
    if resolution == "OWNER_UNKNOWN":
        return {
            "classification": "UNRESOLVED",
            "reason": parsed.get("owner_resolution_source", "owner could not be positively resolved"),
            "authority_id": None,
            "property_identity": None,
        }

    owner_table = parsed.get("owner_table")
    owner_enum = parsed.get("owner_enum")
    owner_column = parsed.get("owner_column")
    family = parsed["operation_family"]
    subtype = parsed["operation_subtype"]

    if resolution == "OWNER_M252" or owner_table == M252_TABLE:
        return {
            "classification": "M252_SCOPE",
            "reason": parsed.get("owner_resolution_source"),
            "authority_id": None,
            "property_identity": f"{M252_TABLE}:physical",
        }

    if owner_enum and resolution == "OWNER_R3B":
        return {"classification": "R3B_SCOPE", "reason": parsed.get("owner_resolution_source"), "authority_id": None, "property_identity": f"enum:{owner_enum}"}
    if owner_enum and resolution == "OWNER_OUT_OF_SCOPE":
        return {"classification": "OUT_OF_SCOPE", "reason": parsed.get("owner_resolution_source"), "authority_id": None, "property_identity": None}

    if owner_table and resolution == "OWNER_R3B":
        prop = f"{owner_table}:columns"
        if owner_column and subtype == "alter_column" and "SET DATA TYPE" in raw_sql.upper():
            prop = f"{owner_table}:types"
        elif owner_column:
            prop = f"{owner_table}:types" if subtype == "alter_column" else f"{owner_table}:columns"
        if family in {"CREATE INDEX", "CREATE UNIQUE INDEX", "DROP INDEX", "ALTER INDEX"}:
            prop = f"{owner_table}:indexes"
        elif subtype in {"add_constraint", "drop_constraint", "rename_constraint", "foreign_key"}:
            prop = f"{owner_table}:constraints"
        return {
            "classification": "R3B_SCOPE",
            "reason": parsed.get("owner_resolution_source"),
            "authority_id": owners["property_id_by_identity"].get(prop),
            "property_identity": prop,
        }

    if owner_table and resolution == "OWNER_OUT_OF_SCOPE":
        return {"classification": "OUT_OF_SCOPE", "reason": parsed.get("owner_resolution_source"), "authority_id": None, "property_identity": None}

    if family in {"BEGIN", "COMMIT"}:
        return {"classification": "OUT_OF_SCOPE", "reason": "transaction wrapper", "authority_id": None, "property_identity": None}

    return {"classification": "UNRESOLVED", "reason": "scope unresolved after owner resolution", "authority_id": None, "property_identity": None}


def build_operation_record(stmt: ParsedStatement, owners: dict[str, Any]) -> dict[str, Any]:
    parsed = resolve_owner_fields(stmt, owners)
    scope = classify_scope(parsed, owners, stmt.raw_sql)
    return {"ordinal": stmt.ordinal, "raw_sql": stmt.raw_sql, **parsed, **scope}


def classify_statements(statements: list[ParsedStatement], owners: dict[str, Any] | None = None) -> dict[str, Any]:
    owners = owners or build_owner_maps()
    operations = [build_operation_record(stmt, owners) for stmt in statements]
    counts = {
        "R3B_SCOPE": sum(1 for o in operations if o["classification"] == "R3B_SCOPE"),
        "M252_SCOPE": sum(1 for o in operations if o["classification"] == "M252_SCOPE"),
        "OUT_OF_SCOPE": sum(1 for o in operations if o["classification"] == "OUT_OF_SCOPE"),
        "UNRESOLVED": sum(1 for o in operations if o["classification"] == "UNRESOLVED"),
    }
    owner_unknown = sum(1 for o in operations if o.get("owner_resolution") == "OWNER_UNKNOWN")
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.2",
        "prefix_inference_acceptance": False,
        "total_operations": len(operations),
        **counts,
        "OWNER_UNKNOWN": owner_unknown,
        "operations": operations,
        "pass": counts["UNRESOLVED"] == 0 and owner_unknown == 0,
    }


def classify_with_baselines(
    script: str,
    *,
    label: str,
    golden_script: str | None = None,
    owners: dict[str, Any] | None = None,
) -> dict[str, Any]:
    owners = owners or build_owner_maps()
    statements = parse_sql_script(script) if script.strip() else []
    base = classify_statements(statements, owners)
    golden_fps: set[str] = set()
    if golden_script:
        golden_ops = classify_statements(parse_sql_script(golden_script), owners)["operations"]
        golden_fps = {operation_fingerprint(o) for o in golden_ops}

    pre_existing = 0
    new_strategy = 0
    for op in base["operations"]:
        fp = operation_fingerprint(op)
        if golden_fps and fp in golden_fps:
            if op["classification"] in {"OUT_OF_SCOPE", "M252_SCOPE"}:
                op["classification"] = "PRE_EXISTING_PRODUCTION_DRIFT"
                op["reason"] = f"matched golden baseline operation ({label})"
            pre_existing += 1
        elif op["classification"] == "R3B_SCOPE":
            new_strategy += 1
            op["classification"] = "NEW_STRATEGY_DRIFT"

    counts = {
        "R3B_SCOPE": sum(1 for o in base["operations"] if o["classification"] == "R3B_SCOPE"),
        "M252_SCOPE": sum(1 for o in base["operations"] if o["classification"] == "M252_SCOPE"),
        "PRE_EXISTING_PRODUCTION_DRIFT": sum(1 for o in base["operations"] if o["classification"] == "PRE_EXISTING_PRODUCTION_DRIFT"),
        "OUT_OF_SCOPE": sum(1 for o in base["operations"] if o["classification"] == "OUT_OF_SCOPE"),
        "NEW_STRATEGY_DRIFT": sum(1 for o in base["operations"] if o["classification"] == "NEW_STRATEGY_DRIFT"),
        "UNRESOLVED": sum(1 for o in base["operations"] if o["classification"] == "UNRESOLVED"),
    }
    return {
        **base,
        "label": label,
        **counts,
        "pass": counts["UNRESOLVED"] == 0 and counts["R3B_SCOPE"] == 0 and counts["M252_SCOPE"] == 0 and counts["NEW_STRATEGY_DRIFT"] == 0,
    }


def classify_frozen_r3b1o1_diff(*, schema_dump=None, out_path=None) -> dict[str, Any]:
    from ci_r3b1o2_constants import R3B1O1_FROZEN_DIFF_SQL, FROZEN_DIFF_SQL

    script = R3B1O1_FROZEN_DIFF_SQL.read_text()
    golden = FROZEN_DIFF_SQL.read_text() if FROZEN_DIFF_SQL.exists() else None
    owners = build_owner_maps(schema_dump=schema_dump)
    result = classify_with_baselines(script, label="r3b1o1_frozen_final_twin", golden_script=golden, owners=owners)
    path = out_path or DATA / "ci-r3b1o2-diff-classifier-closure-2026-08.json"
    path.write_text(json.dumps(result, indent=2) + "\n")
    return result
