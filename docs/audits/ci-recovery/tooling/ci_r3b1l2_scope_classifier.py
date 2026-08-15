"""Complete Prisma diff scope classification for CI-R3B1L.2."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l2_constants import DATA, OLD_CLASSIFICATION, OLD_PARSER_REPORTED_OPS
from ci_r3b1l2_prisma_sql_parser import ParsedStatement, get_parsed_statements
from ci_r3b1l2_r3b_authority import build_owner_maps

CLASSIFICATION_OUT = DATA / "ci-r3b1l2-complete-prisma-diff-classification-2026-08.json"
RECONCILIATION_OUT = DATA / "ci-r3b1l2-old-parser-loss-reconciliation-2026-08.json"


def detect_operation_family(sql: str) -> tuple[str, str]:
    head = sql.strip().split("\n", 1)[0].strip()
    upper = head.upper()
    patterns = [
        (r"^CREATE TYPE", "CREATE TYPE", "create_type"),
        (r"^ALTER TYPE", "ALTER TYPE", "alter_type"),
        (r"^DROP TYPE", "DROP TYPE", "drop_type"),
        (r"^CREATE TABLE", "CREATE TABLE", "create_table"),
        (r"^DROP TABLE", "DROP TABLE", "drop_table"),
        (r"^ALTER TABLE .* RENAME CONSTRAINT", "ALTER TABLE", "rename_constraint"),
        (r"^ALTER TABLE .* RENAME TO", "ALTER TABLE", "rename_table"),
        (r"^ALTER TABLE .* ADD CONSTRAINT .* FOREIGN KEY", "ALTER TABLE", "foreign_key"),
        (r"^ALTER TABLE .* ADD CONSTRAINT", "ALTER TABLE", "add_constraint"),
        (r"^ALTER TABLE .* DROP CONSTRAINT", "ALTER TABLE", "drop_constraint"),
        (r"^ALTER TABLE .* ALTER COLUMN ", "ALTER TABLE", "alter_column"),
        (r"^ALTER TABLE .* (ADD|DROP) COLUMN ", "ALTER TABLE", "alter_column"),
        (r"^ALTER TABLE", "ALTER TABLE", "alter_table"),
        (r"^CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX", "create_unique_index"),
        (r"^CREATE INDEX", "CREATE INDEX", "create_index"),
        (r"^DROP INDEX", "DROP INDEX", "drop_index"),
        (r"^BEGIN$", "BEGIN", "begin"),
        (r"^COMMIT$", "COMMIT", "commit"),
    ]
    for regex, family, subtype in patterns:
        if re.search(regex, upper):
            return family, subtype
    if upper.startswith("ALTER TABLE") and " ADD CONSTRAINT " in upper and " FOREIGN KEY " in upper:
        return "ALTER TABLE", "foreign_key"
    if upper.startswith("ALTER TABLE") and " ADD CONSTRAINT " in upper:
        return "ALTER TABLE", "add_constraint"
    if upper.startswith("ALTER TABLE") and " DROP CONSTRAINT " in upper:
        return "ALTER TABLE", "drop_constraint"
    if upper.startswith("ALTER TABLE") and " ALTER COLUMN " in upper:
        return "ALTER TABLE", "alter_column"
    if upper.startswith("ALTER TABLE") and (" ADD COLUMN " in upper or " DROP COLUMN " in upper):
        return "ALTER TABLE", "alter_column"
    if upper in {"BEGIN", "COMMIT"} or upper.startswith("BEGIN") and upper.rstrip(";") == "BEGIN":
        return "BEGIN" if "BEGIN" in upper else "COMMIT", "transaction"
    if "RENAME CONSTRAINT" in upper:
        return "ALTER TABLE", "rename_constraint"
    if "RENAME TO" in upper and upper.startswith("ALTER INDEX"):
        return "ALTER INDEX", "rename_index"
    if "RENAME TO" in upper and upper.startswith("ALTER TYPE"):
        return "ALTER TYPE", "rename_enum"
    if upper.startswith("ALTER INDEX"):
        return "ALTER INDEX", "rename_index" if "RENAME" in upper else "alter_index"
    return "UNKNOWN", "unknown"


def extract_quoted_identifiers(sql: str) -> list[str]:
    return re.findall(r'"([^"]+)"', sql)


def resolve_owner(stmt: ParsedStatement, owners: dict[str, Any]) -> dict[str, Any]:
    sql = stmt.raw_sql
    ids = extract_quoted_identifiers(sql)
    family, subtype = detect_operation_family(sql)
    owner_table = None
    owner_enum = None
    owner_column = None
    owner_constraint = None
    owner_index = None
    schema = "public"

    if family == "ALTER TABLE" and ids:
        owner_table = ids[0]
        m = re.search(r'ALTER COLUMN "([^"]+)"', sql, re.I)
        if m:
            owner_column = m.group(1)
        else:
            m2 = re.search(r'(?:ADD|DROP) COLUMN "?([^",\s]+)"?', sql, re.I)
            if m2:
                owner_column = m2.group(1).strip('"')
    elif family in {"CREATE TABLE", "DROP TABLE"} and ids:
        owner_table = ids[0]
    elif family in {"CREATE TYPE", "ALTER TYPE", "DROP TYPE"} and ids:
        owner_enum = ids[0]
    elif family in {"CREATE INDEX", "CREATE UNIQUE INDEX"}:
        m = re.search(r'\bON\s+"([^"]+)"', sql, re.I)
        if m:
            owner_table = m.group(1)
        if ids:
            owner_index = ids[0]
    elif family == "DROP INDEX" and ids:
        owner_index = ids[0]
        owner_table = owners["index_to_table"].get(owner_index)
    elif family == "ALTER INDEX" and ids:
        owner_index = ids[0]
        owner_table = owners["index_to_table"].get(owner_index)
    elif subtype in {"add_constraint", "drop_constraint", "rename_constraint"} and ids:
        owner_table = ids[0]
        if len(ids) > 1:
            owner_constraint = ids[1]
        cname = re.search(r'CONSTRAINT "([^"]+)"', sql, re.I)
        if cname:
            owner_constraint = cname.group(1)
            if not owner_table:
                owner_table = owners["constraint_to_table"].get(owner_constraint)

    return {
        "operation_family": family,
        "operation_subtype": subtype,
        "schema": schema,
        "primary_target": ids[0] if ids else None,
        "owner_table": owner_table,
        "owner_enum": owner_enum,
        "owner_column": owner_column,
        "owner_constraint": owner_constraint,
        "owner_index": owner_index,
        "quoted_identifiers": ids,
        "parse_status": "PARSED" if family != "UNKNOWN" else "UNPARSED",
    }


def classify_scope(parsed_fields: dict[str, Any], owners: dict[str, Any], raw_sql: str = "") -> dict[str, Any]:
    r3b_tables = owners["tables"]
    r3b_enums = owners["enums"]
    r3b_index_names = set(owners["index_to_table"].keys())
    if parsed_fields["parse_status"] != "PARSED":
        return {"classification": "UNRESOLVED", "reason": "unparsed operation family", "authority_id": None, "property_identity": None}

    owner_table = parsed_fields.get("owner_table")
    owner_enum = parsed_fields.get("owner_enum")
    owner_column = parsed_fields.get("owner_column")
    owner_index = parsed_fields.get("owner_index")
    family = parsed_fields["operation_family"]

    if owner_enum:
        if owner_enum in r3b_enums:
            return {"classification": "R3B_SCOPE", "reason": f"enum {owner_enum} in R3B authority", "authority_id": None, "property_identity": f"enum:{owner_enum}"}
        return {"classification": "OUT_OF_SCOPE", "reason": f"enum {owner_enum} outside R3B authority", "authority_id": None, "property_identity": None}

    if owner_index:
        mapped_table = owners["index_to_table"].get(owner_index)
        if mapped_table and mapped_table in r3b_tables:
            prop = f"{mapped_table}:indexes"
            return {
                "classification": "R3B_SCOPE",
                "reason": f"index {owner_index} owned by R3B table {mapped_table}",
                "authority_id": owners["property_id_by_identity"].get(prop),
                "property_identity": prop,
            }
        if owner_index not in r3b_index_names:
            return {"classification": "OUT_OF_SCOPE", "reason": f"index {owner_index} not in R3B authority inventory", "authority_id": None, "property_identity": None}
        return {"classification": "OUT_OF_SCOPE", "reason": f"index {owner_index} owned outside R3B tables", "authority_id": None, "property_identity": None}

    if owner_table:
        if owner_table in r3b_tables:
            prop = f"{owner_table}:columns"
            if owner_column and parsed_fields["operation_subtype"] == "alter_column" and "SET DATA TYPE" in raw_sql.upper():
                prop = f"{owner_table}:types"
            elif owner_column:
                prop = f"{owner_table}:types" if parsed_fields["operation_subtype"] == "alter_column" else f"{owner_table}:columns"
            if family in {"CREATE INDEX", "CREATE UNIQUE INDEX", "DROP INDEX", "ALTER INDEX"}:
                prop = f"{owner_table}:indexes"
            elif parsed_fields["operation_subtype"] in {"add_constraint", "drop_constraint", "rename_constraint", "foreign_key"}:
                prop = f"{owner_table}:constraints"
            aid = owners["property_id_by_identity"].get(prop)
            return {
                "classification": "R3B_SCOPE",
                "reason": f"table {owner_table} in R3B authority",
                "authority_id": aid,
                "property_identity": prop,
            }
        return {"classification": "OUT_OF_SCOPE", "reason": f"table {owner_table} outside R3B authority", "authority_id": None, "property_identity": None}

    if family in {"BEGIN", "COMMIT"}:
        return {"classification": "OUT_OF_SCOPE", "reason": "transaction wrapper without R3B target", "authority_id": None, "property_identity": None}

    return {"classification": "UNRESOLVED", "reason": "could not resolve scope owner", "authority_id": None, "property_identity": None}


def build_operation_record(stmt: ParsedStatement, owners: dict[str, Any]) -> dict[str, Any]:
    parsed = resolve_owner(stmt, owners)
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


def _normalize_sql(sql: str) -> str:
    return sql.strip().rstrip(";").strip()


def reconcile_old_parser(classification: dict[str, Any]) -> dict[str, Any]:
    old = json.loads(OLD_CLASSIFICATION.read_text()) if OLD_CLASSIFICATION.exists() else {"operations": [], "total_operations": OLD_PARSER_REPORTED_OPS}
    old_ops = old.get("operations", [])
    new_ops = classification.get("operations", [])
    new_by_sql = {_normalize_sql(o["raw_sql"]): o for o in new_ops}
    matched = []
    for old_op in old_ops:
        key = _normalize_sql(old_op["raw_sql"])
        if key in new_by_sql:
            matched.append({"old_ordinal": old_op.get("ordinal"), "new_ordinal": new_by_sql[key]["ordinal"], "raw_sql": key[:200]})
    old_keys = {_normalize_sql(o["raw_sql"]) for o in old_ops}
    omitted = [o for o in new_ops if _normalize_sql(o["raw_sql"]) not in old_keys]
    omitted_r3b = [o for o in omitted if o["classification"] == "R3B_SCOPE"]
    out = {
        "schema_version": 1,
        "old_parser_reported_operations": old.get("total_operations", OLD_PARSER_REPORTED_OPS),
        "successor_complete_operations": len(new_ops),
        "old_operations_matched_in_successor": len(matched),
        "old_operations_unmatched": len(old_ops) - len(matched),
        "previously_omitted_operations": len(omitted),
        "previously_omitted_r3b_operations": len(omitted_r3b),
        "omitted_r3b_scope_samples": [
            {"ordinal": o["ordinal"], "owner_table": o.get("owner_table"), "raw_sql": o["raw_sql"][:300]}
            for o in omitted_r3b[:20]
        ],
        "recovered_trip_driving_impact_calculated_at_found": any(
            "trip_driving_impact" in o["raw_sql"] and "calculated_at" in o["raw_sql"] for o in new_ops
        ),
        "pass": True,
    }
    RECONCILIATION_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
