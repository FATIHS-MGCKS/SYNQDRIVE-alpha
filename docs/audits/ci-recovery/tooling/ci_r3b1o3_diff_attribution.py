"""Two-axis final Prisma diff attribution for CI-R3B1O.3 corrective rerun."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o2_diff_classifier import (
    classify_statements,
    operation_fingerprint,
    parse_sql_script,
)
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_constants import DATA, STRATEGY_CONTRACT

AUTHORIZED_STRATEGY_INDEXES: set[str] = set()


def resolve_scope(op: dict[str, Any]) -> str:
    owner_resolution = op.get("owner_resolution", "OWNER_UNKNOWN")
    owner_table = op.get("owner_table")
    if owner_resolution == "OWNER_UNKNOWN":
        return "UNKNOWN"
    if owner_resolution == "OWNER_R3B" or op.get("classification") == "R3B_SCOPE":
        return "R3B"
    if owner_resolution == "OWNER_M252" or owner_table == M252_TABLE or op.get("classification") == "M252_SCOPE":
        return "M252"
    return "OTHER"


def has_explicit_strategy_authority(op: dict[str, Any]) -> tuple[bool, str | None]:
    raw = op.get("raw_sql", "")
    upper = raw.upper()
    owner_table = op.get("owner_table")
    owner_index = op.get("owner_index")

    if "CREATE TABLE" in upper and M252_TABLE in raw:
        return True, "append-only M252 forward migration creates canonical table"
    if M252_TABLE in raw and any(k in upper for k in ("CREATE INDEX", "CREATE UNIQUE INDEX", "ADD CONSTRAINT", "PRIMARY KEY")):
        return True, "append-only M252 forward migration creates canonical M252 objects"
    for token in STRATEGY_CONTRACT["resolves"]:
        if token in raw:
            return True, f"explicit resolve contract: {token}"
    if owner_index and owner_index in AUTHORIZED_STRATEGY_INDEXES:
        return True, f"explicit authorized index contract: {owner_index}"
    if owner_table and owner_table in {"vehicle_trips", "driving_events", "trip_events"}:
        if "SET DATA TYPE" not in upper and "ADD COLUMN" not in upper and "RENAME" in upper:
            return True, "R3B bootstrap/deploy migrations align recovered R3B objects"
    if owner_table in {"organization_legal_documents", "organization_role_assignments"} and "RENAME" in upper:
        return True, "production legacy index rename converges to schema.prisma explicit map after deploy"
    return False, None


def classify_operation_two_axis(
    op: dict[str, Any],
    *,
    golden_fps: set[str],
    golden_baseline_fps: set[str],
    strategy_introduced_fps: set[str] | None = None,
) -> dict[str, Any]:
    fp = operation_fingerprint(op)
    golden_match = fp in golden_fps or fp in golden_baseline_fps
    scope = resolve_scope(op)
    authorized, auth_reason = has_explicit_strategy_authority(op)

    if scope == "UNKNOWN":
        provenance = "UNKNOWN"
        classification = "UNATTRIBUTED"
        reason = op.get("owner_resolution_source", "owner unknown")
    elif golden_match:
        provenance = "PRE_EXISTING"
        classification = "PRE_EXISTING_PRODUCTION_DRIFT"
        reason = "matched golden baseline semantic fingerprint"
    elif authorized:
        provenance = "AUTHORIZED_STRATEGY"
        classification = "AUTHORIZED_STRATEGY_DELTA"
        reason = auth_reason
    elif not golden_match:
        provenance = "NEW_UNAUTHORIZED"
        classification = "NEW_STRATEGY_DRIFT"
        reason = "operation absent from golden baseline without explicit strategy authority"
    else:
        provenance = "UNKNOWN"
        classification = "UNATTRIBUTED"
        reason = "unable to prove scope/provenance"

    return {
        **op,
        "semantic_fingerprint": fp,
        "golden_semantic_match": fp in golden_fps,
        "golden_baseline_match": fp in golden_baseline_fps,
        "scope": scope,
        "provenance": provenance,
        "classification": classification,
        "reason": reason,
    }


def classify_final_diff(
    final_script: str,
    *,
    golden_twin_script: str,
    golden_baseline_script: str,
    schema_dump=None,
    strategy_introduced_fps: set[str] | None = None,
) -> dict[str, Any]:
    owners = build_owner_maps(schema_dump=schema_dump)
    final_base = classify_statements(parse_sql_script(final_script), owners)
    golden_twin_fps = {operation_fingerprint(o) for o in classify_statements(parse_sql_script(golden_twin_script), owners)["operations"]}
    golden_base_fps = {operation_fingerprint(o) for o in classify_statements(parse_sql_script(golden_baseline_script), owners)["operations"]}

    operations = [
        classify_operation_two_axis(
            op,
            golden_fps=golden_twin_fps,
            golden_baseline_fps=golden_base_fps,
            strategy_introduced_fps=strategy_introduced_fps,
        )
        for op in final_base["operations"]
    ]

    scope_counts = {"R3B": 0, "M252": 0, "OTHER": 0, "UNKNOWN": 0}
    provenance_counts = {"PRE_EXISTING": 0, "AUTHORIZED_STRATEGY": 0, "NEW_UNAUTHORIZED": 0, "UNKNOWN": 0}
    for op in operations:
        scope_counts[op["scope"]] = scope_counts.get(op["scope"], 0) + 1
        provenance_counts[op["provenance"]] = provenance_counts.get(op["provenance"], 0) + 1

    derived = {
        "PRE_EXISTING_PRODUCTION_DRIFT": sum(1 for o in operations if o["classification"] == "PRE_EXISTING_PRODUCTION_DRIFT"),
        "AUTHORIZED_STRATEGY_DELTA": sum(1 for o in operations if o["classification"] == "AUTHORIZED_STRATEGY_DELTA"),
        "NEW_STRATEGY_DRIFT": sum(1 for o in operations if o["classification"] == "NEW_STRATEGY_DRIFT"),
        "UNATTRIBUTED": sum(1 for o in operations if o["classification"] == "UNATTRIBUTED"),
    }

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.3-corrective",
        "total_operations": len(operations),
        "scope_counts": scope_counts,
        "provenance_counts": provenance_counts,
        "R3B_SCOPE": scope_counts["R3B"],
        "M252_SCOPE": scope_counts["M252"],
        "UNKNOWN_SCOPE": scope_counts["UNKNOWN"],
        **derived,
        "operations": operations,
        "pass": (
            scope_counts["UNKNOWN"] == 0
            and derived["UNATTRIBUTED"] == 0
            and derived["NEW_STRATEGY_DRIFT"] == 0
            and scope_counts["R3B"] == 0
            and scope_counts["M252"] == 0
        ),
    }


def write_corrective_attribution(classification: dict[str, Any]) -> None:
    (DATA / "ci-r3b1o3-corrective-final-prisma-diff-attribution-2026-08.json").write_text(json.dumps(classification, indent=2) + "\n")
    unmatched = [o for o in classification["operations"] if not o.get("golden_baseline_match")]
    (DATA / "ci-r3b1o3-corrective-final-diff-provenance-2026-08.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "phase": "CI-R3B1O.3-corrective",
                "unmatched_count": len(unmatched),
                "operations": unmatched,
                "counts": {
                    k: classification[k]
                    for k in classification
                    if k.isupper() or k.endswith("_SCOPE") or k.startswith("scope_") or k.startswith("provenance_")
                },
                "pass": classification["pass"],
            },
            indent=2,
        )
        + "\n"
    )
