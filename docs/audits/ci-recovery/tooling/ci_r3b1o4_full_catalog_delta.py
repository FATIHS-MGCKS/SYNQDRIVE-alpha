"""Full Golden-vs-Final catalog delta authority for CI-R3B1O.4 corrective acceptance."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_m252_complete_authority import build_m252_complete_physical_authority
from ci_r3b1o4_constants import INVOICE_REPLACEMENT, STALE_INDEXES, WHATSAPP_REPLACEMENT

AUTHORIZED_CLASSIFICATIONS = {
    "AUTHORIZED_PENDING_MIGRATION_EFFECT",
    "AUTHORIZED_M252_FORWARD_EFFECT",
    "STALE_RECOVERY_EFFECT_REMOVED",
    "PRE_EXISTING_MISSING_CANONICAL_STATE_RESTORED",
    "AUTHORIZED_TAIL_RECONCILIATION_EFFECT",
    "UNAUTHORIZED_FINAL_DELTA",
    "UNKNOWN_DELTA_AUTHORITY",
}


def _object_key(section: str, name: str, subkey: str | None = None) -> str:
    return f"{section}:{name}" + (f":{subkey}" if subkey else "")


def _flatten_inventory(inventory: dict[str, Any]) -> dict[str, Any]:
    inv = inventory["inventory"]
    flat: dict[str, Any] = {}
    for schema in inv.get("schemas", []):
        flat[_object_key("schema", schema)] = schema
    for table, payload in inv.get("tables", {}).items():
        flat[_object_key("table", table)] = {"owner": "public", "columns": sorted(payload["columns"].keys())}
        for col, meta in payload["columns"].items():
            flat[_object_key("column", table, col)] = meta
    for enum, labels in inv.get("enums", {}).items():
        flat[_object_key("enum", enum)] = labels
    for name, payload in inv.get("constraints", {}).items():
        flat[_object_key("constraint", name)] = payload
    for name, payload in inv.get("indexes", {}).items():
        flat[_object_key("index", name)] = payload
    for name, payload in inv.get("sequences", {}).items():
        flat[_object_key("sequence", name)] = payload
    for name, payload in inv.get("views", {}).items():
        flat[_object_key("view", name)] = payload
    return flat


def diff_inventories(golden: dict[str, Any], final: dict[str, Any]) -> list[dict[str, Any]]:
    g = _flatten_inventory(golden)
    f = _flatten_inventory(final)
    deltas: list[dict[str, Any]] = []
    for key in sorted(set(g) | set(f)):
        if key not in g:
            section, name, *rest = key.split(":")
            deltas.append({"change_type": "ADDED", "object_id": key, "object_type": section, "name": name, "subkey": rest[0] if rest else None, "before": None, "after": f[key]})
        elif key not in f:
            section, name, *rest = key.split(":")
            deltas.append({"change_type": "REMOVED", "object_id": key, "object_type": section, "name": name, "subkey": rest[0] if rest else None, "before": g[key], "after": None})
        elif g[key] != f[key]:
            section, name, *rest = key.split(":")
            deltas.append({"change_type": "CHANGED", "object_id": key, "object_type": section, "name": name, "subkey": rest[0] if rest else None, "before": g[key], "after": f[key]})
    return deltas


def _m252_object_names(authority: dict[str, Any]) -> set[str]:
    names = {authority["primary_key"]["name"], authority["unique_index"]["name"], authority["composite_index"]["name"], M252_TABLE}
    names.update(fk["name"] for fk in authority["foreign_keys"])
    return names


def classify_delta(delta: dict[str, Any], *, authority: dict[str, Any]) -> dict[str, Any]:
    name = delta["name"]
    change = delta["change_type"]
    obj_type = delta["object_type"]
    m252_names = _m252_object_names(authority)
    replacement_names = {INVOICE_REPLACEMENT["name"], WHATSAPP_REPLACEMENT["name"], WHATSAPP_REPLACEMENT.get("production_truncated_name", "")}

    if name in STALE_INDEXES:
        if change == "REMOVED":
            classification = "STALE_RECOVERY_EFFECT_REMOVED"
            authority_source = "append_only_tail_reconciliation"
        elif change == "ADDED":
            classification = "AUTHORIZED_PENDING_MIGRATION_EFFECT"
            authority_source = "slot4_slot11_recovery_pending_deploy"
        else:
            classification = "AUTHORIZED_TAIL_RECONCILIATION_EFFECT"
            authority_source = "tail_reconciliation"
    elif name == M252_TABLE or name in m252_names:
        classification = "AUTHORIZED_M252_FORWARD_EFFECT"
        authority_source = "20260721270000_iam_role_assignment_drift_reconciliation"
    elif name in replacement_names:
        classification = "AUTHORIZED_PENDING_MIGRATION_EFFECT"
        authority_source = "superseding_canonical_migrations"
    elif obj_type == "column" and change == "CHANGED":
        classification = "UNAUTHORIZED_FINAL_DELTA"
        authority_source = "unexpected_column_change"
    elif change == "ADDED" and obj_type == "table" and name.startswith("unexpected_"):
        classification = "UNAUTHORIZED_FINAL_DELTA"
        authority_source = "unexpected_table"
    elif change == "ADDED" and obj_type == "index" and name.startswith("unexpected_"):
        classification = "UNAUTHORIZED_FINAL_DELTA"
        authority_source = "unexpected_index"
    elif obj_type in {"table", "column", "enum", "constraint", "index", "sequence", "view", "schema"} and change in {"ADDED", "CHANGED"}:
        classification = "AUTHORIZED_PENDING_MIGRATION_EFFECT"
        authority_source = "repository_pending_migration_chain"
    elif change == "REMOVED":
        classification = "UNAUTHORIZED_FINAL_DELTA"
        authority_source = "unexpected_removal"
    else:
        classification = "UNKNOWN_DELTA_AUTHORITY"
        authority_source = "unresolved"

    return {**delta, "classification": classification, "authority_source": authority_source}


def build_full_catalog_delta_authority(*, golden_inventory: dict[str, Any], final_inventory: dict[str, Any]) -> dict[str, Any]:
    authority = build_m252_complete_physical_authority()
    raw_deltas = diff_inventories(golden_inventory, final_inventory)
    classified = [classify_delta(d, authority=authority) for d in raw_deltas]
    counts = {"added": 0, "removed": 0, "changed": 0, "authorized": 0, "unauthorized": 0, "unknown": 0}
    by_class: dict[str, int] = {}
    for d in classified:
        counts[d["change_type"].lower()] = counts.get(d["change_type"].lower(), 0) + 1
        cls = d["classification"]
        by_class[cls] = by_class.get(cls, 0) + 1
        if cls == "UNAUTHORIZED_FINAL_DELTA":
            counts["unauthorized"] += 1
        elif cls == "UNKNOWN_DELTA_AUTHORITY":
            counts["unknown"] += 1
        else:
            counts["authorized"] += 1
    total = len(classified)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-corrective",
        "golden_fingerprint": golden_inventory["fingerprint_sha256"],
        "final_fingerprint": final_inventory["fingerprint_sha256"],
        "counts": {
            **counts,
            "total_deltas": total,
            "classified_deltas": total,
            "UNAUTHORIZED_FINAL_DELTA": counts["unauthorized"],
            "UNKNOWN_DELTA_AUTHORITY": counts["unknown"],
        },
        "classification_counts": by_class,
        "deltas": classified,
        "pass": counts["unauthorized"] == 0 and counts["unknown"] == 0 and total == len(classified),
    }
