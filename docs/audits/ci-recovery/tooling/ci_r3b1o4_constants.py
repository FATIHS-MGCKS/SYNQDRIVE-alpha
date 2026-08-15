"""Shared constants for CI-R3B1O.4."""
from __future__ import annotations

from pathlib import Path

from ci_r3b1o3_constants import *  # noqa: F403

R3B1O3_BRANCH = "audit/ci-r3b1o3-final-strategy-gate-closure-2026-08"
R3B1O4_BRANCH = "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08"
WORK_R3B1O4 = REPO / "docs/audits/ci-recovery/.work/r3b1o4"  # noqa: F405

FINAL_STRATEGY_DB_PREFIX = "r3b1o4_tail_reconciliation"
CORRECTIVE_STRATEGY_DB_PREFIX = "r3b1o4_corrective_final"
FINAL_CORRECTIVE_STRATEGY_DB_PREFIX = "r3b1o4_final_corrective"

R3B1O4_INPUTS = [
    "backend/prisma/schema.prisma",
    f"backend/prisma/migrations/{M252}/migration.sql",  # noqa: F405
    "20260413225000_ci_r3b_historical_predecessor_slot4/migration.sql",
    "20260620183000_ci_r3b_post_vendor_predecessor_slot11/migration.sql",
    "20260616180000_invoice_finance_workflow/migration.sql",
    "20260620190000_whatsapp_business_platform/migration.sql",
    "ci-r3b1o3-corrective-two-index-provenance-2026-08.json",
    "ci-r3b1o3-corrective-index-timeline-2026-08.json",
    "ci-r3b1o3-corrective-final-diff-provenance-2026-08.json",
    "ci-r3b1o3-corrective-final-acceptance-summary-2026-08.json",
    "ci-r3b1o3-corrective-final-m252-exact-parity-2026-08.json",
    "ci-r3b1o3-corrective-final-r3b-parity-2026-08.json",
]

STALE_INDEXES = [
    "org_invoices_invoice_number_key",
    "whatsapp_conversations_organization_id_contact_phone_key",
]

INVOICE_REPLACEMENT = {
    "kind": "partial_unique_index",
    "name": "org_invoices_organization_id_sequence_year_sequence_number_key",
    "owner_table": "org_invoices",
    "columns": ["organization_id", "sequence_year", "sequence_number"],
    "predicate": 'WHERE "sequence_year" IS NOT NULL AND "sequence_number" IS NOT NULL',
    "superseding_migration": "20260616180000_invoice_finance_workflow",
    "schema_authority": "@@unique([organizationId, sequenceYear, sequenceNumber])",
}

WHATSAPP_REPLACEMENT = {
    "kind": "unique_index",
    "name": "whatsapp_conversations_organization_id_contact_phone_normalized_key",
    "production_truncated_name": "whatsapp_conversations_organization_id_contact_phone_normal_key",
    "owner_table": "whatsapp_conversations",
    "columns": ["organization_id", "contact_phone_normalized"],
    "normalization_column": "contact_phone_normalized",
    "superseding_migration": "20260620190000_whatsapp_business_platform",
    "schema_authority": "@@unique([organizationId, contactPhoneNormalized])",
}

TAIL_TASKS = ["M252", "INVOICE_STALE_INDEX", "WHATSAPP_STALE_INDEX"]


def ensure_r3b1o4_workdir() -> Path:
    WORK_R3B1O4.mkdir(parents=True, exist_ok=True)
    return WORK_R3B1O4
