"""Three-way authority decisions for R3B-scope Prisma diff operations."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1l1_authority import load_production_catalog
from ci_r3b1l2_constants import DATA, SCHEMA_PRISMA
from ci_r3b1l2_r3b_authority import authority_column_semantic, replay_column_semantic

DECISIONS_OUT = DATA / "ci-r3b1l2-r3b-scope-drift-authority-2026-08.json"


def normalize_type_label(label: str | None) -> str:
    return (label or "").strip().lower()


def parse_prisma_field(model: str, field: str) -> dict[str, Any]:
    text = SCHEMA_PRISMA.read_text()
    model_m = re.search(rf"model\s+{model}\s*\{{(.*?)\n\}}", text, re.S)
    if not model_m:
        raise KeyError(f"model {model} not found")
    body = model_m.group(1)
    field_m = re.search(rf"^\s*{field}\s+([^\n]+)$", body, re.M)
    if not field_m:
        raise KeyError(f"field {field} not found on {model}")
    line = field_m.group(1).strip()
    type_m = re.match(r"(\w+\??)", line)
    prisma_type = type_m.group(1) if type_m else line.split()[0]
    map_m = re.search(r'@map\("([^"]+)"\)', line)
    db_m = re.search(r"@db\.(\w+(?:\([^)]*\))?)", line)
    default_m = re.search(r"@default\(([^)]+)\)", line)
    return {
        "model": model,
        "field": field,
        "prisma_type": prisma_type,
        "mapped_column": map_m.group(1) if map_m else None,
        "native_type_annotation": db_m.group(0) if db_m else None,
        "native_type": db_m.group(1) if db_m else None,
        "nullable": prisma_type.endswith("?"),
        "default_annotation": default_m.group(1) if default_m else None,
        "raw_line": line.strip(),
    }


def prisma_desired_pg_type(field_meta: dict[str, Any]) -> str:
    native = field_meta.get("native_type")
    if native:
        return native.lower()
    base = field_meta["prisma_type"].rstrip("?")
    if base == "DateTime":
        return "timestamp(3) without time zone"
    if base == "String":
        return "text"
    if base == "Boolean":
        return "boolean"
    if base == "Int":
        return "integer"
    if base == "Float":
        return "double precision"
    return base.lower()


def extract_diff_target_type(raw_sql: str) -> str | None:
    m = re.search(r"SET DATA TYPE\s+([A-Z0-9_(),\s]+?)(?:;|$)", raw_sql, re.I)
    if m:
        return m.group(1).strip().lower()
    m2 = re.search(r"TYPE\s+\"([^\"]+)\"", raw_sql, re.I)
    if m2:
        return f'"{m2.group(1)}"'.lower()
    return None


def decide_operation(op: dict[str, Any], catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    table = op.get("owner_table")
    column = op.get("owner_column")
    accepted = replay = prisma = None
    decision = "AUTHORITY_AMBIGUITY"
    contradiction = False

    if table and column:
        accepted = authority_column_semantic(table, column, catalog)
        replay = replay_column_semantic(table, column)
        if table == "trip_driving_impact" and column == "calculated_at":
            prisma_field = parse_prisma_field("TripDrivingImpact", "calculatedAt")
            prisma = {
                **prisma_field,
                "desired_pg_type": prisma_desired_pg_type(prisma_field),
            }
        diff_target = extract_diff_target_type(op["raw_sql"])
        if diff_target:
            prisma = prisma or {"desired_pg_type": diff_target}

        accepted_type = normalize_type_label(accepted.get("type"))
        replay_type = normalize_type_label(replay.get("type") if replay else None)
        prisma_type = normalize_type_label((prisma or {}).get("desired_pg_type"))

        if accepted_type == replay_type and prisma_type and prisma_type != accepted_type:
            decision = "CURRENT_PRISMA_SCHEMA_DRIFT"
        elif accepted_type == prisma_type and replay_type and replay_type != accepted_type:
            decision = "REPLAY_DB_DRIFT"
            contradiction = True
        elif accepted_type == replay_type == prisma_type:
            decision = "NON_SEMANTIC_DIFFERENCE"
        else:
            decision = "AUTHORITY_AMBIGUITY"
    else:
        decision = "AUTHORITY_AMBIGUITY"

    return {
        "operation_ordinal": op["ordinal"],
        "raw_sql": op["raw_sql"],
        "affected_authority_object": table or op.get("owner_enum"),
        "affected_property_category": op.get("property_identity"),
        "accepted_canonical_authority": accepted,
        "replay_actual": replay,
        "current_prisma_desired_state": prisma,
        "decision": decision,
        "cross_evidence_contradiction": contradiction,
        "evidence_sources": [
            "docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json",
            "docs/audits/ci-recovery/data/ci-r3b1l-canonical-54-property-authority-2026-08.json",
            "backend/prisma/schema.prisma",
            "docs/audits/ci-recovery/data/ci-r3b1l1-prisma-schema-db-diff-2026-08.sql",
        ],
    }


def build_authority_decisions(r3b_operations: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = [decide_operation(op) for op in r3b_operations]
    counts = {
        "CURRENT_PRISMA_SCHEMA_DRIFT": 0,
        "REPLAY_DB_DRIFT": 0,
        "NON_SEMANTIC_DIFFERENCE": 0,
        "AUTHORITY_AMBIGUITY": 0,
        "CROSS_EVIDENCE_CONTRADICTION": 0,
    }
    for d in decisions:
        counts[d["decision"]] = counts.get(d["decision"], 0) + 1
        if d.get("cross_evidence_contradiction"):
            counts["CROSS_EVIDENCE_CONTRADICTION"] += 1

    trip_case = next((d for d in decisions if d.get("affected_authority_object") == "trip_driving_impact" and (d.get("accepted_canonical_authority") or {}).get("column") == "calculated_at"), None)

    out = {
        "schema_version": 1,
        "r3b_scope_operation_count": len(r3b_operations),
        "decisions": decisions,
        "decision_counts": counts,
        "trip_driving_impact_calculated_at": trip_case,
        "pass": counts["AUTHORITY_AMBIGUITY"] == 0 and counts["REPLAY_DB_DRIFT"] == 0 and counts["CROSS_EVIDENCE_CONTRADICTION"] == 0,
    }
    DECISIONS_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
