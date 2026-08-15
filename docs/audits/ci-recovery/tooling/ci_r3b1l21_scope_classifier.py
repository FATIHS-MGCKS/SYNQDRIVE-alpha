"""Corrected scope classification with positive owner resolution for CI-R3B1L.2.1."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l2_constants import OLD_CLASSIFICATION, OLD_PARSER_REPORTED_OPS
from ci_r3b1l2_prisma_sql_parser import ParsedStatement, get_parsed_statements
from ci_r3b1l2_scope_classifier import detect_operation_family, extract_quoted_identifiers
from ci_r3b1l21_constants import DATA
from ci_r3b1l21_r3b_authority import build_owner_maps, resolve_enum_owner, resolve_index_owner, resolve_table_owner

CLASSIFICATION_OUT = DATA / "ci-r3b1l21-complete-prisma-diff-classification-2026-08.json"


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
        res, table, source = resolve_table_owner(owner_table, owners)
        owner_resolution, owner_resolution_source = res, source
        m = re.search(r'ALTER COLUMN "([^"]+)"', sql, re.I)
        if m:
            owner_column = m.group(1)
        else:
            m2 = re.search(r'(?:ADD|DROP) COLUMN "?([^",\s]+)"?', sql, re.I)
            if m2:
                owner_column = m2.group(1).strip('"')
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
        else:
            owner_resolution = "OWNER_UNKNOWN"
            owner_resolution_source = "CREATE INDEX missing ON relation"
        if ids:
            owner_index = ids[0]
    elif family in {"DROP INDEX", "ALTER INDEX"} and ids:
        owner_index = ids[0]
        owner_resolution, owner_table, owner_resolution_source = resolve_index_owner(owner_index, owners)
    elif subtype in {"add_constraint", "drop_constraint", "rename_constraint"} and ids:
        owner_table = ids[0]
        owner_resolution, _, owner_resolution_source = resolve_table_owner(owner_table, owners)
    elif family in {"BEGIN", "COMMIT"}:
        owner_resolution = "OWNER_OUT_OF_SCOPE"
        owner_resolution_source = "transaction wrapper"

    return {
        "operation_family": family,
        "operation_subtype": subtype,
        "schema": "public",
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
        return {
            "classification": "UNRESOLVED",
            "reason": "unparsed operation family",
            "authority_id": None,
            "property_identity": None,
        }

    resolution = parsed.get("owner_resolution", "OWNER_UNKNOWN")
    owner_table = parsed.get("owner_table")
    owner_enum = parsed.get("owner_enum")
    owner_column = parsed.get("owner_column")
    family = parsed["operation_family"]
    subtype = parsed["operation_subtype"]

    if resolution == "OWNER_UNKNOWN":
        return {
            "classification": "UNRESOLVED",
            "reason": parsed.get("owner_resolution_source", "owner could not be positively resolved"),
            "authority_id": None,
            "property_identity": None,
        }

    if owner_enum and resolution == "OWNER_R3B":
        return {
            "classification": "R3B_SCOPE",
            "reason": f"enum {owner_enum} in R3B authority",
            "authority_id": None,
            "property_identity": f"enum:{owner_enum}",
        }
    if owner_enum and resolution == "OWNER_OUT_OF_SCOPE":
        return {
            "classification": "OUT_OF_SCOPE",
            "reason": parsed.get("owner_resolution_source"),
            "authority_id": None,
            "property_identity": None,
        }

    # Owner table precedence over index-name inventory membership.
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
        return {
            "classification": "OUT_OF_SCOPE",
            "reason": parsed.get("owner_resolution_source"),
            "authority_id": None,
            "property_identity": None,
        }

    if family in {"BEGIN", "COMMIT"}:
        return {
            "classification": "OUT_OF_SCOPE",
            "reason": "transaction wrapper without R3B target",
            "authority_id": None,
            "property_identity": None,
        }

    return {
        "classification": "UNRESOLVED",
        "reason": "scope could not be classified after owner resolution",
        "authority_id": None,
        "property_identity": None,
    }


def build_operation_record(stmt: ParsedStatement, owners: dict[str, Any]) -> dict[str, Any]:
    parsed = resolve_owner_fields(stmt, owners)
    scope = classify_scope(parsed, owners, stmt.raw_sql)
    return {
        "ordinal": stmt.ordinal,
        "comment_tags": stmt.comment_tags,
        "leading_comment_lines": stmt.leading_comment_lines,
        "operation_family": parsed["operation_family"],
        "operation_subtype": parsed["operation_subtype"],
        "raw_sql": stmt.raw_sql,
        "schema": parsed["schema"],
        "primary_target_identifier": parsed["primary_target"],
        "owner_table": parsed["owner_table"],
        "owner_column": parsed["owner_column"],
        "owner_constraint": parsed["owner_constraint"],
        "owner_index": parsed["owner_index"],
        "owner_enum": parsed["owner_enum"],
        "owner_resolution": parsed["owner_resolution"],
        "owner_resolution_source": parsed["owner_resolution_source"],
        "quoted_identifiers": parsed["quoted_identifiers"],
        "parse_status": parsed["parse_status"],
        **scope,
    }


def classify_complete_diff() -> dict[str, Any]:
    owners = build_owner_maps()
    statements = get_parsed_statements()
    operations = [build_operation_record(stmt, owners) for stmt in statements]
    r3b = [o for o in operations if o["classification"] == "R3B_SCOPE"]
    out_scope = [o for o in operations if o["classification"] == "OUT_OF_SCOPE"]
    unresolved = [o for o in operations if o["classification"] == "UNRESOLVED"]
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2.1",
        "total_operations": len(operations),
        "R3B_SCOPE_DIFF_COUNT": len(r3b),
        "OUT_OF_SCOPE_DIFF_COUNT": len(out_scope),
        "UNRESOLVED_DIFF_COUNT": len(unresolved),
        "operations": operations,
        "r3b_scope_operations": r3b,
        "pass": len(unresolved) == 0,
    }
    CLASSIFICATION_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def summarize_out_of_scope_families(classification: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for op in classification.get("operations", []):
        if op.get("classification") != "OUT_OF_SCOPE":
            continue
        fam = op.get("operation_family", "OTHER")
        counts[fam] = counts.get(fam, 0) + 1
    return counts
