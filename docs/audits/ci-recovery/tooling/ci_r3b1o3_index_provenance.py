"""Index provenance tracing for CI-R3B1O.3 corrective rerun."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any, Callable

from ci_r3b1m_constants import REPO, SCHEMA_PRISMA

TARGET_INDEXES = [
    {
        "index_name": "org_invoices_invoice_number_key",
        "owner_table": "org_invoices",
        "creator_migration": "20260413225000_ci_r3b_historical_predecessor_slot4",
        "superseding_migration": "20260616180000_invoice_finance_workflow",
        "create_sql": 'CREATE UNIQUE INDEX IF NOT EXISTS "org_invoices_invoice_number_key" ON "org_invoices"("invoice_number")',
        "drop_sql": 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"',
        "prisma_authority": "MIGRATION_HISTORY_CREATED_STALE_INDEX",
        "prisma_reason": "schema.prisma uses @@unique([organizationId, sequenceYear, sequenceNumber]); global invoice_number unique removed by invoice_finance_workflow",
    },
    {
        "index_name": "whatsapp_conversations_organization_id_contact_phone_key",
        "owner_table": "whatsapp_conversations",
        "creator_migration": "20260620183000_ci_r3b_post_vendor_predecessor_slot11",
        "superseding_migration": "20260620190000_whatsapp_business_platform",
        "create_sql": 'CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversations_organization_id_contact_phone_key" ON "whatsapp_conversations"("organization_id", "contact_phone")',
        "drop_sql": 'DROP CONSTRAINT IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key"',
        "prisma_authority": "MIGRATION_HISTORY_CREATED_STALE_INDEX",
        "prisma_reason": "schema.prisma uses @@unique([organizationId, contactPhoneNormalized]); contact_phone unique superseded by whatsapp_business_platform",
    },
]


def _git_first_commit(pattern: str) -> str | None:
    proc = subprocess.run(
        ["git", "log", "-S", pattern, "--format=%H", "-1", "--", "backend/prisma/migrations", "backend/prisma/schema.prisma"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip() or None


def index_present(run_sql: Callable[[str], str], index_name: str) -> bool:
    return (
        run_sql(
            f"SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='{index_name}';"
        ).strip()
        == "1"
    )


def index_definition(run_sql: Callable[[str], str], index_name: str) -> str | None:
    rows = [
        ln
        for ln in run_sql(
            f"""
SELECT pg_get_indexdef(i.indexrelid)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_index i ON i.indexrelid = c.oid
WHERE n.nspname='public' AND c.relname='{index_name}';
"""
        ).splitlines()
        if ln.strip()
    ]
    return rows[0] if rows else None


def snapshot_indexes(run_sql: Callable[[str], str], names: list[str]) -> dict[str, Any]:
    out = {}
    for name in names:
        out[name] = {
            "present": index_present(run_sql, name),
            "definition": index_definition(run_sql, name) if index_present(run_sql, name) else None,
        }
    return out


def build_index_repository_trace() -> dict[str, Any]:
    records = []
    for spec in TARGET_INDEXES:
        records.append(
            {
                **spec,
                "creator_commit": _git_first_commit(spec["index_name"]),
                "repository_authority": "none",
                "authorized_in_schema_prisma": False,
                "positive_authority_sources": [],
            }
        )
    return {"schema_version": 1, "phase": "CI-R3B1O.3-corrective", "indexes": records}


def build_two_index_provenance(
    *,
    golden_run_sql: Callable[[str], str],
    final_run_sql: Callable[[str], str],
    timeline: dict[str, Any],
    attribution_ops: list[dict[str, Any]],
) -> dict[str, Any]:
    names = [s["index_name"] for s in TARGET_INDEXES]
    golden = snapshot_indexes(golden_run_sql, names)
    final = snapshot_indexes(final_run_sql, names)
    op_by_index = {}
    for op in attribution_ops:
        sql = op.get("raw_sql", "")
        for name in names:
            if name in sql:
                op_by_index[name] = op

    records = []
    for spec in TARGET_INDEXES:
        name = spec["index_name"]
        op = op_by_index.get(name, {})
        introduced_step = None
        prev_present = timeline.get("T0_golden_baseline", {}).get(name, {}).get("present", False)
        for step in ["T1_after_resolves_before_deploy", "T2_after_normal_migrate_deploy", "T3_after_m252_forward"]:
            present = timeline.get(step, {}).get(name, {}).get("present", False)
            if present and not prev_present:
                introduced_step = step
                break
            prev_present = present or prev_present
        golden_present = golden[name]["present"]
        final_present = final[name]["present"]
        presence_class = "PRESENT_BEFORE_STRATEGY" if golden_present else "INTRODUCED_BY_STRATEGY" if final_present else "ABSENT"
        if golden_present and final_present:
            presence_class = "PRESENT_BEFORE_STRATEGY"
        elif not golden_present and final_present:
            presence_class = "INTRODUCED_BY_STRATEGY"

        positive_authority = False
        authority_decision = spec["prisma_authority"]
        if positive_authority:
            provenance = "AUTHORIZED_STRATEGY"
            final_classification = "AUTHORIZED_STRATEGY_DELTA"
        elif presence_class == "INTRODUCED_BY_STRATEGY" or (final_present and not golden_present):
            provenance = "NEW_UNAUTHORIZED"
            final_classification = "NEW_STRATEGY_DRIFT"
        elif op.get("golden_baseline_match") or op.get("golden_semantic_match"):
            provenance = "PRE_EXISTING"
            final_classification = "PRE_EXISTING_PRODUCTION_DRIFT"
        else:
            provenance = "NEW_UNAUTHORIZED" if final_present else "UNKNOWN"
            final_classification = "NEW_STRATEGY_DRIFT" if final_present else "UNATTRIBUTED"

        records.append(
            {
                "index_name": name,
                "owner_table": spec["owner_table"],
                "golden_present": golden_present,
                "final_present": final_present,
                "presence_classification": presence_class,
                "introduced_at_strategy_step": introduced_step,
                "creator_migration": spec["creator_migration"],
                "creator_commit": _git_first_commit(name),
                "superseding_migration": spec["superseding_migration"],
                "executed_during_strategy": presence_class == "INTRODUCED_BY_STRATEGY",
                "exact_ddl": {
                    "create": spec["create_sql"],
                    "superseding_drop": spec["drop_sql"],
                    "golden_definition": golden[name]["definition"],
                    "final_definition": final[name]["definition"],
                },
                "prisma_desired_action": f'DROP INDEX "{name}"' if final_present else None,
                "prisma_authority_classification": authority_decision,
                "prisma_authority_reason": spec["prisma_reason"],
                "authority_sources": [
                    f"migration:{spec['creator_migration']}",
                    f"superseded_by:{spec['superseding_migration']}",
                    "schema.prisma: no matching @@unique",
                ],
                "positive_repository_authority": positive_authority,
                "scope": "OTHER",
                "provenance": provenance,
                "final_classification": final_classification,
                "attribution_operation": {
                    "ordinal": op.get("ordinal"),
                    "scope": op.get("scope"),
                    "provenance": op.get("provenance"),
                    "classification": op.get("classification"),
                    "reason": op.get("reason"),
                },
            }
        )
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.3-corrective",
        "indexes": records,
        "pass": all(r["final_classification"] != "NEW_STRATEGY_DRIFT" for r in records),
    }
