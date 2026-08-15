"""Canonical actionable-gap derivation from INSERT-SELECT dependency matrix (CI-R3B1H.1.1)."""
from __future__ import annotations

from typing import Any


def derive_unique_actionable_gaps(
    records: list[dict[str, Any]],
    table_creators: set[str],
    boundary_by_gap: dict[tuple[str, str], dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Return unique actionable gaps from MISSING_HISTORY / ORDERING_DEFECT only."""
    boundary_by_gap = boundary_by_gap or {}
    by_key: dict[tuple[str, str, str], dict[str, Any]] = {}

    for record in records:
        if record.get("classification") not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if record.get("required_object_type") != "column":
            continue

        relation = record.get("resolved_relation") or record.get("required_relation") or record.get("required_object")
        prop = record.get("required_property") or ""
        if not relation or relation not in table_creators:
            continue
        if prop == relation:
            continue

        boundary = boundary_by_gap.get((relation, prop), {})
        repair_boundary = boundary.get("after_migration") or "UNRESOLVED_BOUNDARY"
        key = (relation, prop, repair_boundary)

        prev = by_key.get(key)
        if prev is None:
            by_key[key] = {
                "relation": relation,
                "property": prop,
                "classification": record["classification"],
                "first_consumer_migration": record["migration"],
                "first_consumer_order": record.get("migration_order"),
                "first_consumer_statement": record.get("statement_order"),
                "repair_boundary_after": boundary.get("after_migration"),
                "repair_boundary_before": boundary.get("before_migration"),
                "all_consumers": [record["migration"]],
                "blocking_record_ids": [record.get("id")],
            }
        else:
            prev["all_consumers"].append(record["migration"])
            prev["blocking_record_ids"].append(record.get("id"))

    return sorted(by_key.values(), key=lambda item: item.get("first_consumer_order") or 9999)
