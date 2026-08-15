"""Strict object-level catalog delta authority join (CI-R3B1O.4 final corrective)."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1n2_constants import sha256_text
from ci_r3b1o4_expected_catalog_effects import build_expected_catalog_deltas
from ci_r3b1o4_implicit_catalog_effects import build_implicit_catalog_effects


def _object_key(section: str, name: str, subkey: str | None = None) -> str:
    return f"{section}:{name}" + (f":{subkey}" if subkey else "")


def flatten_catalog_inventory(inventory: dict[str, Any]) -> dict[str, Any]:
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
    for name, payload in inv.get("types", {}).items():
        flat[_object_key("type", name)] = payload
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
    g = flatten_catalog_inventory(golden)
    f = flatten_catalog_inventory(final)
    deltas: list[dict[str, Any]] = []
    for key in sorted(set(g) | set(f)):
        if key not in g:
            section, name, *rest = key.split(":")
            deltas.append(
                {
                    "change_type": "ADDED",
                    "object_id": key,
                    "object_type": section,
                    "name": name,
                    "subkey": rest[0] if rest else None,
                    "before": None,
                    "after": f[key],
                    "semantic_fingerprint": sha256_text(json.dumps(f[key], sort_keys=True, separators=(",", ":"))),
                }
            )
        elif key not in f:
            section, name, *rest = key.split(":")
            deltas.append(
                {
                    "change_type": "REMOVED",
                    "object_id": key,
                    "object_type": section,
                    "name": name,
                    "subkey": rest[0] if rest else None,
                    "before": g[key],
                    "after": None,
                    "semantic_fingerprint": sha256_text(json.dumps(g[key], sort_keys=True, separators=(",", ":"))),
                }
            )
        elif g[key] != f[key]:
            section, name, *rest = key.split(":")
            deltas.append(
                {
                    "change_type": "CHANGED",
                    "object_id": key,
                    "object_type": section,
                    "name": name,
                    "subkey": rest[0] if rest else None,
                    "before": g[key],
                    "after": f[key],
                    "semantic_fingerprint": sha256_text(json.dumps({"before": g[key], "after": f[key]}, sort_keys=True, separators=(",", ":"))),
                }
            )
    return deltas


def _delta_lookup_key(delta: dict[str, Any]) -> tuple[str, str, str, str | None]:
    return (delta["change_type"], delta["object_type"], delta["name"], delta.get("subkey"))


def _effect_lookup_key(effect: dict[str, Any]) -> tuple[str, str, str, str | None]:
    subkey = effect.get("subkey")
    if effect["object_type"] == "column":
        return (effect["change_type"], effect["object_type"], effect["name"], subkey)
    return (effect["change_type"], effect["object_type"], effect["name"], subkey)


def _build_authority_index(expected: dict[str, Any], implicit: dict[str, Any]) -> dict[tuple[str, str, str, str | None], list[dict[str, Any]]]:
    index: dict[tuple[str, str, str, str | None], list[dict[str, Any]]] = {}
    for source, bucket, mode in [(expected, "effects", "EXPLICIT_SQL_EFFECT"), (implicit, "effects", "IMPLICIT_POSTGRES_EFFECT")]:
        for effect in source[bucket]:
            key = _effect_lookup_key(effect)
            entry = {**effect, "authority_match": mode}
            if key not in index:
                index[key] = [entry]
            else:
                index[key] = [entry]
    return index


def _classify_from_effect(effect: dict[str, Any]) -> str:
    task = effect.get("task")
    op = effect.get("operation_family")
    if task in {"INVOICE_STALE_INDEX", "WHATSAPP_STALE_INDEX"} or (op == "DROP_INDEX" and effect.get("change_type") == "REMOVED"):
        return "AUTHORIZED_STALE_RECOVERY_REMOVAL"
    if task == "M252" or op == "M252_FORWARD":
        return "AUTHORIZED_M252_FORWARD_EFFECT"
    if effect.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT":
        return "AUTHORIZED_IMPLICIT_POSTGRES_EFFECT"
    return "AUTHORIZED_PENDING_MIGRATION_EFFECT"


def authorize_catalog_deltas(
    *,
    raw_deltas: list[dict[str, Any]],
    expected: dict[str, Any] | None = None,
    implicit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    expected = expected or build_expected_catalog_deltas()
    implicit = implicit or build_implicit_catalog_effects(expected=expected)
    authority_index = _build_authority_index(expected, implicit)

    classified: list[dict[str, Any]] = []
    proofs: list[dict[str, Any]] = []
    explicit_matches = 0
    implicit_matches = 0
    unauthorized = 0
    unknown = 0
    ambiguous = 0

    for delta in raw_deltas:
        key = _delta_lookup_key(delta)
        candidates = authority_index.get(key, [])
        row = {**delta}
        if not candidates:
            row["authority_match"] = "NONE"
            row["classification"] = "UNAUTHORIZED_FINAL_DELTA"
            unauthorized += 1
        elif len(candidates) > 1:
            row["authority_match"] = "AMBIGUOUS"
            row["classification"] = "UNKNOWN_DELTA_AUTHORITY"
            row["candidate_count"] = len(candidates)
            unknown += 1
            ambiguous += 1
        else:
            effect = candidates[0]
            row["authority_match"] = effect["authority_match"]
            row["classification"] = _classify_from_effect(effect)
            row["authority_migration"] = effect.get("migration_name") or effect.get("parent_migration")
            row["authority_statement_ordinal"] = effect.get("statement_ordinal") or effect.get("parent_statement_ordinal")
            row["authority_statement_sha256"] = effect.get("statement_sha256")
            row["match_mode"] = "IMPLICIT_DETERMINISTIC" if effect["authority_match"] == "IMPLICIT_POSTGRES_EFFECT" else "EXACT"
            if effect["authority_match"] == "IMPLICIT_POSTGRES_EFFECT":
                implicit_matches += 1
            else:
                explicit_matches += 1
            proofs.append(
                {
                    "object_id": delta["object_id"],
                    "change_type": delta["change_type"],
                    "classification": row["classification"],
                    "migration": row["authority_migration"],
                    "statement_ordinal": row["authority_statement_ordinal"],
                    "statement_sha256": row["authority_statement_sha256"],
                    "match_mode": row["match_mode"],
                    "expected_effect_id": effect.get("effect_id"),
                }
            )
        classified.append(row)

    counts = {
        "added": sum(1 for d in raw_deltas if d["change_type"] == "ADDED"),
        "removed": sum(1 for d in raw_deltas if d["change_type"] == "REMOVED"),
        "changed": sum(1 for d in raw_deltas if d["change_type"] == "CHANGED"),
        "total_raw_deltas": len(raw_deltas),
        "classified_total": len(classified),
        "explicit_authority_matched": explicit_matches,
        "implicit_authority_matched": implicit_matches,
        "UNAUTHORIZED_FINAL_DELTA": unauthorized,
        "UNKNOWN_DELTA_AUTHORITY": unknown,
        "AMBIGUOUS": ambiguous,
        "type_deltas": sum(1 for d in raw_deltas if d["object_type"] == "type"),
    }
    by_class: dict[str, int] = {}
    for row in classified:
        by_class[row["classification"]] = by_class.get(row["classification"], 0) + 1

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "counts": counts,
        "classification_counts": by_class,
        "deltas": classified,
        "proofs": proofs,
        "pass": unauthorized == 0 and unknown == 0 and ambiguous == 0 and len(raw_deltas) == len(classified),
    }


def build_full_catalog_delta_authority(*, golden_inventory: dict[str, Any], final_inventory: dict[str, Any], expected: dict[str, Any] | None = None, implicit: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = diff_inventories(golden_inventory, final_inventory)
    authorized = authorize_catalog_deltas(raw_deltas=raw, expected=expected, implicit=implicit)
    return {
        **authorized,
        "golden_fingerprint": golden_inventory["fingerprint_sha256"],
        "final_fingerprint": final_inventory["fingerprint_sha256"],
        "raw_delta_count": len(raw),
    }


def build_raw_catalog_deltas(*, golden_inventory: dict[str, Any], final_inventory: dict[str, Any]) -> dict[str, Any]:
    raw = diff_inventories(golden_inventory, final_inventory)
    family_counts: dict[str, int] = {}
    for d in raw:
        family_counts[d["object_type"]] = family_counts.get(d["object_type"], 0) + 1
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "counts": {"total": len(raw), **family_counts},
        "deltas": raw,
    }


def classify_delta_for_test(delta: dict[str, Any], *, expected: dict[str, Any], implicit: dict[str, Any]) -> dict[str, Any]:
    result = authorize_catalog_deltas(raw_deltas=[delta], expected=expected, implicit=implicit)
    return result["deltas"][0]
