"""Strict semantic catalog delta authority join (CI-R3B1O.4 binding corrective)."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1n2_constants import sha256_text
from ci_r3b1o4_catalog_semantic_compare import semantic_match_delta_to_effect
from ci_r3b1o4_execution_set import build_execution_set, build_statement_lookup
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
    return (effect["change_type"], effect["object_type"], effect["name"], subkey)


def _build_authority_index(expected: dict[str, Any], implicit: dict[str, Any]) -> dict[tuple[str, str, str, str | None], list[dict[str, Any]]]:
    index: dict[tuple[str, str, str, str | None], list[dict[str, Any]]] = {}
    for source, bucket, mode in [(expected, "effects", "EXPLICIT_SQL_EFFECT"), (implicit, "effects", "IMPLICIT_POSTGRES_EFFECT")]:
        for effect in source[bucket]:
            key = _effect_lookup_key(effect)
            entry = {**effect, "authority_match": mode}
            index.setdefault(key, []).append(entry)
    return index


def _statement_bound(effect: dict[str, Any], statement_lookup: dict[tuple[str, int], dict[str, Any]]) -> tuple[bool, str]:
    if effect.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT":
        mig = effect.get("parent_migration")
        ordn = effect.get("parent_statement_ordinal")
        sha = effect.get("parent_statement_sha256")
        if mig is None or ordn is None or sha is None:
            return False, "implicit missing parent statement binding"
        stmt = statement_lookup.get((mig, int(ordn)))
        if not stmt or stmt["statement_sha256"] != sha:
            return False, "implicit parent statement SHA mismatch"
        return True, "implicit parent bound"

    mig = effect.get("migration_name")
    ordn = effect.get("statement_ordinal")
    sha = effect.get("statement_sha256")
    if mig is None or ordn is None or sha is None:
        return False, "missing migration/ordinal/sha"
    stmt = statement_lookup.get((mig, int(ordn)))
    if not stmt:
        return False, "statement ordinal missing from execution set"
    if stmt["statement_sha256"] != sha:
        return False, "statement SHA mismatch"
    return True, "statement bound"


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


def _candidate_rank(candidate: dict[str, Any], mode: str) -> int:
    score = 0
    if candidate.get("authority_match") == "EXPLICIT_SQL_EFFECT":
        score += 100
    if candidate.get("operation_family") == "M252_FORWARD":
        score += 10
    if candidate.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT":
        score += 1
    if mode == "EXACT":
        score += 5
    return score


def authorize_catalog_deltas(
    *,
    raw_deltas: list[dict[str, Any]],
    expected: dict[str, Any] | None = None,
    implicit: dict[str, Any] | None = None,
    execution_set: dict[str, Any] | None = None,
) -> dict[str, Any]:
    execution_set = execution_set or build_execution_set()
    expected = expected or build_expected_catalog_deltas(execution_set=execution_set)
    implicit = implicit or build_implicit_catalog_effects(expected=expected)
    statement_lookup = build_statement_lookup(execution_set)
    authority_index = _build_authority_index(expected, implicit)

    classified: list[dict[str, Any]] = []
    proofs: list[dict[str, Any]] = []
    candidate_inventory: list[dict[str, Any]] = []
    explicit_matches = 0
    implicit_matches = 0
    unauthorized = 0
    unknown = 0
    ambiguous = 0
    unbound = 0
    key_only = 0

    for delta in raw_deltas:
        key = _delta_lookup_key(delta)
        candidates = authority_index.get(key, [])
        bound_candidates: list[dict[str, Any]] = []
        rejected_binding: list[dict[str, Any]] = []
        for candidate in candidates:
            ok, reason = _statement_bound(candidate, statement_lookup)
            if ok:
                bound_candidates.append(candidate)
            else:
                rejected_binding.append({"effect_id": candidate.get("effect_id"), "reason": reason})

        semantic_matches: list[tuple[dict[str, Any], str, str]] = []
        semantic_rejects: list[dict[str, Any]] = []
        for candidate in bound_candidates:
            ok, mode, reason = semantic_match_delta_to_effect(delta, candidate)
            if ok:
                semantic_matches.append((candidate, mode, reason))
            else:
                semantic_rejects.append({"effect_id": candidate.get("effect_id"), "reason": reason})

        resolution = "NO_AUTHORITY"
        chosen: dict[str, Any] | None = None
        match_mode = None
        classification = "UNAUTHORIZED_FINAL_DELTA"

        if not candidates:
            unauthorized += 1
            resolution = "NO_AUTHORITY"
            classification = "UNAUTHORIZED_FINAL_DELTA"
        elif candidates and not bound_candidates and rejected_binding:
            unbound += 1
            resolution = "STATEMENT_UNBOUND"
            classification = "AUTHORITY_STATEMENT_UNBOUND"
        elif len(semantic_matches) == 0:
            unauthorized += 1
            resolution = "NO_SEMANTIC_MATCH"
            classification = "UNAUTHORIZED_FINAL_DELTA"
        elif len(semantic_matches) > 1:
            ranked = sorted(
                ((c, m, r, _candidate_rank(c, m)) for c, m, r in semantic_matches),
                key=lambda item: item[3],
                reverse=True,
            )
            top_score = ranked[0][3]
            top = [item for item in ranked if item[3] == top_score]
            if len(top) == 1:
                chosen, match_mode, _reason, _score = top[0]
                resolution = "AUTHORIZED"
                classification = _classify_from_effect(chosen)
            else:
                ambiguous += 1
                resolution = "AMBIGUOUS"
                classification = "AMBIGUOUS_DELTA_AUTHORITY"
        else:
            chosen, match_mode, _reason = semantic_matches[0]
            resolution = "AUTHORIZED"
            classification = _classify_from_effect(chosen)
            if match_mode == "EXACT" and chosen.get("authority_match") == "EXPLICIT_SQL_EFFECT":
                # Guard against key-only authorization labels.
                ok, _, _ = semantic_match_delta_to_effect(delta, chosen)
                if not ok:
                    key_only += 1

        row = {
            **delta,
            "candidate_count": len(candidates),
            "bound_candidate_count": len(bound_candidates),
            "semantic_match_count": len(semantic_matches),
            "authority_match": chosen.get("authority_match") if chosen else ("NONE" if not candidates else "UNBOUND"),
            "classification": classification,
            "resolution": resolution,
        }

        if chosen:
            stmt_key = (chosen.get("migration_name") or chosen.get("parent_migration"), chosen.get("statement_ordinal") or chosen.get("parent_statement_ordinal"))
            stmt_family = None
            if stmt_key[0] is not None and stmt_key[1] is not None:
                bound_stmt = statement_lookup.get((stmt_key[0], int(stmt_key[1])))
                stmt_family = bound_stmt.get("statement_family") if bound_stmt else chosen.get("statement_family")
            row["authority_migration"] = chosen.get("migration_name") or chosen.get("parent_migration")
            row["authority_statement_ordinal"] = chosen.get("statement_ordinal") or chosen.get("parent_statement_ordinal")
            row["authority_statement_sha256"] = chosen.get("statement_sha256") or chosen.get("parent_statement_sha256")
            row["authority_statement_family"] = stmt_family
            row["match_mode"] = match_mode
            if chosen.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT":
                implicit_matches += 1
            else:
                explicit_matches += 1
            proofs.append(
                {
                    "object_id": delta["object_id"],
                    "change_type": delta["change_type"],
                    "classification": classification,
                    "actual_before": delta.get("before"),
                    "actual_after": delta.get("after"),
                    "expected_before": chosen.get("before_state"),
                    "expected_after": chosen.get("after_state"),
                    "migration": row["authority_migration"],
                    "statement_ordinal": row["authority_statement_ordinal"],
                    "statement_sha256": row["authority_statement_sha256"],
                    "statement_family": stmt_family,
                    "operation_family": chosen.get("operation_family"),
                    "authority_match": chosen.get("authority_match"),
                    "match_mode": match_mode,
                    "semantic_comparator": delta["object_type"],
                    "expected_effect_id": chosen.get("effect_id"),
                }
            )

        candidate_inventory.append(
            {
                "lookup_key": list(key),
                "object_id": delta["object_id"],
                "candidate_count": len(candidates),
                "candidate_migrations": [c.get("migration_name") or c.get("parent_migration") for c in candidates],
                "candidate_statement_ordinals": [c.get("statement_ordinal") or c.get("parent_statement_ordinal") for c in candidates],
                "candidate_statement_shas": [c.get("statement_sha256") or c.get("parent_statement_sha256") for c in candidates],
                "bound_candidate_count": len(bound_candidates),
                "semantic_match_count": len(semantic_matches),
                "semantic_rejects": semantic_rejects,
                "rejected_binding": rejected_binding,
                "final_resolution": resolution,
                "classification": classification,
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
        "AMBIGUOUS_DELTA_AUTHORITY": ambiguous,
        "AMBIGUOUS": ambiguous,
        "AUTHORITY_STATEMENT_UNBOUND": unbound,
        "key_only_authorization": key_only,
        "type_deltas": sum(1 for d in raw_deltas if d["object_type"] == "type"),
    }
    by_class: dict[str, int] = {}
    for row in classified:
        by_class[row["classification"]] = by_class.get(row["classification"], 0) + 1

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-binding-corrective",
        "counts": counts,
        "classification_counts": by_class,
        "deltas": classified,
        "proofs": proofs,
        "candidate_inventory": candidate_inventory,
        "pass": (
            unauthorized == 0
            and unknown == 0
            and ambiguous == 0
            and unbound == 0
            and key_only == 0
            and len(raw_deltas) == len(classified)
        ),
    }


def build_full_catalog_delta_authority(
    *,
    golden_inventory: dict[str, Any],
    final_inventory: dict[str, Any],
    expected: dict[str, Any] | None = None,
    implicit: dict[str, Any] | None = None,
    execution_set: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw = diff_inventories(golden_inventory, final_inventory)
    authorized = authorize_catalog_deltas(
        raw_deltas=raw,
        expected=expected,
        implicit=implicit,
        execution_set=execution_set,
    )
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
        "phase": "CI-R3B1O.4-binding-corrective",
        "counts": {"total": len(raw), **family_counts},
        "deltas": raw,
    }


def classify_delta_for_test(
    delta: dict[str, Any],
    *,
    expected: dict[str, Any],
    implicit: dict[str, Any],
    execution_set: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = authorize_catalog_deltas(raw_deltas=[delta], expected=expected, implicit=implicit, execution_set=execution_set)
    return result["deltas"][0]
