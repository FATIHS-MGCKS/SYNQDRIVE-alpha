"""R3B1M scope classification with positive index ownership only."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l2_prisma_sql_parser import ParsedStatement, get_parsed_statements, parse_frozen_diff, split_comment_and_sql_blocks, split_sql_statements, tokenize_sql
from ci_r3b1l2_scope_classifier import detect_operation_family, extract_quoted_identifiers
from ci_r3b1m_constants import DATA, FROZEN_DIFF_SQL
from ci_r3b1m_r3b_authority import build_owner_maps, resolve_enum_owner, resolve_index_owner, resolve_table_owner

PREFLIGHT_OUT = DATA / "ci-r3b1m-preflight-prisma-diff-classification-2026-08.json"


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
    diagnostic_hint = None

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
        owner_resolution, owner_table, owner_resolution_source, diagnostic_hint = resolve_index_owner(owner_index, owners)
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
        "diagnostic_hint": diagnostic_hint,
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
    r3b = [o for o in operations if o["classification"] == "R3B_SCOPE"]
    out_scope = [o for o in operations if o["classification"] == "OUT_OF_SCOPE"]
    unresolved = [o for o in operations if o["classification"] == "UNRESOLVED"]
    owner_unknown = [o for o in operations if o.get("owner_resolution") == "OWNER_UNKNOWN"]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "prefix_inference_acceptance": False,
        "total_operations": len(operations),
        "R3B_SCOPE_DIFF_COUNT": len(r3b),
        "OUT_OF_SCOPE_DIFF_COUNT": len(out_scope),
        "UNRESOLVED_DIFF_COUNT": len(unresolved),
        "OWNER_UNKNOWN_COUNT": len(owner_unknown),
        "operations": operations,
        "r3b_scope_operations": r3b,
        "pass": len(unresolved) == 0 and len(owner_unknown) == 0,
    }


def classify_frozen_preflight() -> dict[str, Any]:
    statements = get_parsed_statements()
    out = classify_statements(statements)
    PREFLIGHT_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
