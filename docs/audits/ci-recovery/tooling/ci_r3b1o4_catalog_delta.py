"""Catalog delta authority classification for CI-R3B1O.4."""
from __future__ import annotations

from typing import Any


def classify_catalog_delta(
    *,
    golden_catalog_fp: str,
    final_catalog_fp: str,
    strategy: dict[str, Any],
) -> dict[str, Any]:
    deltas = []
    timeline = strategy.get("index_timeline", {})
    t0 = timeline.get("T0_golden_baseline", {})
    t3 = timeline.get("T3_after_tail_reconciliation", {})

    for name in ["org_invoices_invoice_number_key", "whatsapp_conversations_organization_id_contact_phone_key"]:
        t0_present = t0.get("stale_indexes", {}).get(name, {}).get("present", False)
        t2_present = timeline.get("T2_after_normal_migrate_deploy", {}).get("stale_indexes", {}).get(name, {}).get("present", False)
        t3_present = t3.get("stale_indexes", {}).get(name, {}).get("present", False)
        if not t0_present and t2_present and not t3_present:
            deltas.append({"object": name, "classification": "STALE_RECOVERY_EFFECT_REMOVED"})
        elif not t0_present and t2_present and t3_present:
            deltas.append({"object": name, "classification": "UNAUTHORIZED_FINAL_DELTA"})

    m252_t0 = not t0.get("m252_table_present", True)
    m252_t3 = t3.get("m252_table_present", False)
    if m252_t0 and m252_t3:
        deltas.append({"object": "organization_role_assignment_drift_reconciliation_applications", "classification": "AUTHORIZED_M252_FORWARD_EFFECT"})

    normal_finished = strategy.get("normal_deploy", {}).get("new_finished", 0)
    if normal_finished:
        deltas.append(
            {
                "object": "pending_migration_chain",
                "classification": "AUTHORIZED_PENDING_MIGRATION_EFFECT",
                "count": normal_finished,
            }
        )

    unauthorized = [d for d in deltas if d["classification"] == "UNAUTHORIZED_FINAL_DELTA"]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "golden_catalog_fingerprint": golden_catalog_fp,
        "final_catalog_fingerprint": final_catalog_fp,
        "catalog_identical_to_golden": golden_catalog_fp == final_catalog_fp,
        "deltas": deltas,
        "UNAUTHORIZED_FINAL_DELTA": len(unauthorized),
        "pass": len(unauthorized) == 0,
    }
