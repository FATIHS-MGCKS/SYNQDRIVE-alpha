"""Final Prisma diff attribution closure for CI-R3B1O.3."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_diff_classifier import (
    classify_statements,
    normalize_sql,
    operation_fingerprint,
    parse_sql_script,
    resolve_owner_fields,
)
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_constants import DATA, STRATEGY_CONTRACT


def _is_strategy_related(sql: str, owner_table: str | None) -> bool:
    if M252_TABLE in sql:
        return True
    for token in STRATEGY_CONTRACT["resolves"]:
        if token in sql:
            return True
    return False


def _expected_strategy_reason(sql: str, owner_table: str | None) -> str | None:
    upper = sql.upper()
    if "CREATE TABLE" in upper and M252_TABLE in sql:
        return "append-only M252 forward migration creates canonical table"
    if M252_TABLE in sql and any(k in upper for k in ("CREATE INDEX", "CREATE UNIQUE INDEX", "ADD CONSTRAINT", "PRIMARY KEY")):
        return "append-only M252 forward migration creates canonical M252 objects"
    if owner_table and owner_table in {"vehicle_trips", "driving_events", "trip_events"}:
        if "SET DATA TYPE" in upper or "ADD COLUMN" in upper:
            return None
        return "R3B bootstrap/deploy migrations align recovered R3B objects"
    if "organization_legal_documents" in sql and "RENAME" in upper:
        return "production legacy index rename converges to schema.prisma explicit map after deploy"
    if "organization_role_assignments" in sql and "RENAME" in upper:
        return "production legacy index rename converges to schema.prisma explicit map after deploy"
    if owner_table and "RENAME" in upper and owner_table not in {M252_TABLE}:
        if any(x in sql for x in ("organization_legal_documents", "organization_role_assignments")):
            return "production legacy index rename converges to schema.prisma explicit map after deploy"
    return None


def classify_operation_attribution(
    op: dict[str, Any],
    *,
    golden_fps: set[str],
    golden_baseline_fps: set[str],
) -> dict[str, Any]:
    fp = operation_fingerprint(op)
    raw = op.get("raw_sql", "")
    owner_table = op.get("owner_table")
    owner_resolution = op.get("owner_resolution", "OWNER_UNKNOWN")

    record = {
        **op,
        "semantic_fingerprint": fp,
        "golden_semantic_match": fp in golden_fps,
        "golden_baseline_match": fp in golden_baseline_fps,
        "r3b_scope": op.get("classification") == "R3B_SCOPE" or owner_resolution == "OWNER_R3B",
        "m252_scope": op.get("classification") == "M252_SCOPE" or owner_resolution == "OWNER_M252" or owner_table == M252_TABLE,
        "strategy_related": _is_strategy_related(raw, owner_table),
    }

    if owner_resolution == "OWNER_UNKNOWN":
        record["classification"] = "UNRESOLVED"
        record["reason"] = op.get("owner_resolution_source", "owner unknown")
        return record

    if op.get("classification") == "UNRESOLVED":
        record["classification"] = "UNRESOLVED"
        record["reason"] = op.get("reason", "unresolved")
        return record

    if record["golden_semantic_match"] or record["golden_baseline_match"]:
        record["classification"] = "PRE_EXISTING_PRODUCTION_DRIFT"
        record["reason"] = "matched golden baseline semantic fingerprint"
        return record

    strategy_reason = _expected_strategy_reason(raw, owner_table)
    if strategy_reason:
        record["classification"] = "EXPECTED_STRATEGY_DELTA"
        record["reason"] = strategy_reason
        return record

    if record["r3b_scope"]:
        record["classification"] = "NEW_STRATEGY_DRIFT" if record["strategy_related"] else "R3B_SCOPE"
        record["reason"] = "R3B-scoped drift without golden match"
        return record

    if record["m252_scope"]:
        record["classification"] = "NEW_STRATEGY_DRIFT"
        record["reason"] = "M252-scoped drift without golden match or strategy contract"
        return record

    if owner_resolution in {"OWNER_OUT_OF_SCOPE", "OWNER_M252"} and owner_table:
        record["classification"] = "OUT_OF_SCOPE_POSITIVELY_PROVEN"
        record["reason"] = f"{op.get('owner_resolution_source')}; owner={owner_table}; proven outside R3B/M252 strategy universe"
        return record

    record["classification"] = "UNATTRIBUTED"
    record["reason"] = "no provenance classification"
    return record


def classify_final_diff(
    final_script: str,
    *,
    golden_twin_script: str,
    golden_baseline_script: str,
    schema_dump=None,
) -> dict[str, Any]:
    owners = build_owner_maps(schema_dump=schema_dump)
    final_base = classify_statements(parse_sql_script(final_script), owners)
    golden_twin_fps = {operation_fingerprint(o) for o in classify_statements(parse_sql_script(golden_twin_script), owners)["operations"]}
    golden_base_fps = {operation_fingerprint(o) for o in classify_statements(parse_sql_script(golden_baseline_script), owners)["operations"]}

    operations = [
        classify_operation_attribution(op, golden_fps=golden_twin_fps, golden_baseline_fps=golden_base_fps)
        for op in final_base["operations"]
    ]

    counts = {}
    for key in [
        "PRE_EXISTING_PRODUCTION_DRIFT",
        "EXPECTED_STRATEGY_DELTA",
        "OUT_OF_SCOPE_POSITIVELY_PROVEN",
        "R3B_SCOPE",
        "M252_SCOPE",
        "NEW_STRATEGY_DRIFT",
        "UNRESOLVED",
        "UNATTRIBUTED",
    ]:
        counts[key] = sum(1 for o in operations if o["classification"] == key)

    owner_unknown = sum(1 for o in operations if o.get("owner_resolution") == "OWNER_UNKNOWN")
    unmatched = [o for o in operations if not o["golden_semantic_match"] and not o["golden_baseline_match"]]

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.3",
        "total_operations": len(operations),
        "owner_unknown": owner_unknown,
        **counts,
        "operations": operations,
        "unmatched_operations": unmatched,
        "pass": owner_unknown == 0
        and counts["UNRESOLVED"] == 0
        and counts["UNATTRIBUTED"] == 0
        and counts["R3B_SCOPE"] == 0
        and counts["M252_SCOPE"] == 0
        and counts["NEW_STRATEGY_DRIFT"] == 0,
    }


def build_unmatched_inventory(classification: dict[str, Any]) -> dict[str, Any]:
    unmatched = [o for o in classification["operations"] if not o.get("golden_semantic_match")]
    out = {"schema_version": 1, "phase": "CI-R3B1O.3", "expected_from_r3b1o2": 2, "actual_count": len(unmatched), "operations": unmatched[:10]}
    (DATA / "ci-r3b1o3-unmatched-final-diff-operations-2026-08.json").write_text(json.dumps(out, indent=2) + "\n")
    return out


def write_attribution_closure(classification: dict[str, Any], prior_o2: dict[str, Any] | None = None) -> dict[str, Any]:
    unmatched_final = [o for o in classification["operations"] if not o.get("golden_semantic_match")]
    prior_two = []
    if prior_o2:
        prior_ops = [o for o in classification["operations"] if o.get("classification") == "OUT_OF_SCOPE_POSITIVELY_PROVEN" and not o.get("golden_semantic_match")]
        prior_two = prior_ops[:2]
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1O.3",
        "prior_r3b1o2_out_of_scope": prior_o2.get("classification", {}).get("final_winning_twin", {}).get("OUT_OF_SCOPE", 2) if prior_o2 else 2,
        "unmatched_count": len(unmatched_final),
        "resolved_operations": [
            {
                "ordinal": o["ordinal"],
                "raw_sql": o["raw_sql"],
                "old_r3b1o2_classification": "OUT_OF_SCOPE",
                "new_classification": o["classification"],
                "owner_table": o.get("owner_table"),
                "owner_resolution_source": o.get("owner_resolution_source"),
                "reason": o.get("reason"),
            }
            for o in unmatched_final
        ],
        "counts": {k: classification[k] for k in classification if k.isupper() or k in {"owner_unknown", "total_operations"}},
        "pass": classification["pass"],
    }
    (DATA / "ci-r3b1o3-final-diff-attribution-closure-2026-08.json").write_text(json.dumps(out, indent=2) + "\n")
    return out
