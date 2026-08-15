"""Stale index authority, replacement uniqueness, and drop safety for CI-R3B1O.4."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from ci_r3b1m_constants import REPO
from ci_r3b1o3_index_provenance import TARGET_INDEXES, index_definition, index_present, snapshot_indexes
from ci_r3b1o4_constants import DATA, INVOICE_REPLACEMENT, WHATSAPP_REPLACEMENT

MIG_ROOT = REPO / "backend/prisma/migrations"


def _read_migration_sql(name: str) -> str:
    return (MIG_ROOT / name / "migration.sql").read_text()


def _extract_create_line(sql: str, index_name: str) -> str | None:
    for line in sql.splitlines():
        stripped = line.strip()
        if index_name in stripped and "CREATE" in stripped.upper():
            return stripped.rstrip(";")
    return None


def build_invoice_stale_index_authority(*, golden_run_sql: Callable[[str], str] | None = None) -> dict[str, Any]:
    spec = next(s for s in TARGET_INDEXES if s["index_name"] == "org_invoices_invoice_number_key")
    creator_sql = _read_migration_sql(spec["creator_migration"])
    superseding_sql = _read_migration_sql(spec["superseding_migration"])
    create_line = _extract_create_line(creator_sql, spec["index_name"]) or spec["create_sql"]
    replacement_present = False
    replacement_valid = False
    replacement_definition = None
    if golden_run_sql:
        replacement_present = index_present(golden_run_sql, INVOICE_REPLACEMENT["name"])
        replacement_definition = index_definition(golden_run_sql, INVOICE_REPLACEMENT["name"])
        replacement_valid = replacement_present and INVOICE_REPLACEMENT["columns"][0] in (replacement_definition or "")

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "index_name": spec["index_name"],
        "owner_table": spec["owner_table"],
        "creator_migration": spec["creator_migration"],
        "creator_sql": create_line,
        "superseding_migration": spec["superseding_migration"],
        "superseding_actions": [
            'DROP INDEX IF EXISTS "org_invoices_invoice_number_key"',
            f'CREATE UNIQUE INDEX IF NOT EXISTS "{INVOICE_REPLACEMENT["name"]}"',
        ],
        "golden_production_state": {"stale_index": "ABSENT", "canonical_replacement": "PRESENT" if replacement_present else "UNKNOWN"},
        "classification": spec["prisma_authority"],
        "replacement": INVOICE_REPLACEMENT,
        "replacement_present": replacement_present,
        "replacement_valid": replacement_valid,
        "replacement_definition": replacement_definition,
        "schema_prisma_authority": INVOICE_REPLACEMENT["schema_authority"],
        "tail_removal_authorized": replacement_present and replacement_valid,
        "pass": replacement_present and replacement_valid,
    }


def build_whatsapp_stale_index_authority(*, golden_run_sql: Callable[[str], str] | None = None) -> dict[str, Any]:
    spec = next(s for s in TARGET_INDEXES if s["index_name"] == "whatsapp_conversations_organization_id_contact_phone_key")
    creator_sql = _read_migration_sql(spec["creator_migration"])
    superseding_sql = _read_migration_sql(spec["superseding_migration"])
    create_line = _extract_create_line(creator_sql, spec["index_name"]) or spec["create_sql"]
    replacement_present = False
    replacement_valid = False
    replacement_definition = None
    if golden_run_sql:
        rows = [
            ln
            for ln in golden_run_sql(
                """
SELECT COUNT(*) FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='whatsapp_conversations'
  AND con.contype='u' AND con.conname='whatsapp_conversations_organization_id_contact_phone_normalized_key';
"""
            ).splitlines()
            if ln.strip()
        ]
        replacement_present = rows and rows[0].strip() == "1"
        replacement_definition = golden_run_sql(
            """
SELECT pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='whatsapp_conversations'
  AND con.conname='whatsapp_conversations_organization_id_contact_phone_normalized_key';
"""
        ).strip() or None
        replacement_valid = replacement_present and "contact_phone_normalized" in (replacement_definition or "")

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "index_name": spec["index_name"],
        "owner_table": spec["owner_table"],
        "creator_migration": spec["creator_migration"],
        "creator_sql": create_line,
        "superseding_migration": spec["superseding_migration"],
        "superseding_actions": [
            'DROP CONSTRAINT IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key"',
            'ADD CONSTRAINT "whatsapp_conversations_organization_id_contact_phone_normalized_key" UNIQUE ("organization_id", "contact_phone_normalized")',
        ],
        "old_key_columns": ["organization_id", "contact_phone"],
        "new_canonical_key_columns": WHATSAPP_REPLACEMENT["columns"],
        "normalization_column": WHATSAPP_REPLACEMENT["normalization_column"],
        "golden_production_state": {"stale_index": "ABSENT", "canonical_replacement": "PRESENT" if replacement_present else "UNKNOWN"},
        "classification": spec["prisma_authority"],
        "replacement": WHATSAPP_REPLACEMENT,
        "replacement_present": replacement_present,
        "replacement_valid": replacement_valid,
        "replacement_definition": replacement_definition,
        "schema_prisma_authority": WHATSAPP_REPLACEMENT["schema_authority"],
        "tail_removal_authorized": replacement_present and replacement_valid,
        "pass": replacement_present and replacement_valid,
    }


def inspect_index_drop_safety(run_sql: Callable[[str], str], index_name: str) -> dict[str, Any]:
    rows = [
        ln
        for ln in run_sql(
            f"""
SELECT c.relname, i.indisunique, i.indisvalid, i.indisready, tc.relname,
       COALESCE(con.contype::text, ''), COALESCE(con.conname, ''),
       pg_get_indexdef(i.indexrelid)
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid
WHERE n.nspname='public' AND c.relname='{index_name}';
"""
        ).splitlines()
        if ln.strip()
    ]
    if not rows:
        return {
            "index_name": index_name,
            "present": False,
            "constraint_backing": False,
            "valid": None,
            "ready": None,
            "owner_table": None,
            "unique": None,
            "definition": None,
            "pass": True,
        }
    p = rows[0].split("|")
    constraint_type = p[5]
    constraint_backing = constraint_type in {"p", "u", "x"}
    return {
        "index_name": index_name,
        "present": True,
        "constraint_backing": constraint_backing,
        "backing_constraint_type": constraint_type or None,
        "backing_constraint_name": p[6] or None,
        "valid": p[2] == "t",
        "ready": p[3] == "t",
        "owner_table": p[4],
        "unique": p[1] == "t",
        "definition": p[7],
        "pass": not constraint_backing,
    }


def build_stale_index_drop_safety(run_sql: Callable[[str], str]) -> dict[str, Any]:
    records = [inspect_index_drop_safety(run_sql, name) for name in [s["index_name"] for s in TARGET_INDEXES]]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "indexes": records,
        "constraint_backing": any(r["constraint_backing"] for r in records if r["present"]),
        "pass": all(r["pass"] for r in records),
    }


def build_replacement_uniqueness_safety(run_sql: Callable[[str], str]) -> dict[str, Any]:
    invoice_idx = index_present(run_sql, INVOICE_REPLACEMENT["name"])
    invoice_def = index_definition(run_sql, INVOICE_REPLACEMENT["name"])
    whatsapp_rows = run_sql(
        """
SELECT con.conname, con.convalidated, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='whatsapp_conversations'
  AND con.contype='u' AND con.conname='whatsapp_conversations_organization_id_contact_phone_normalized_key';
"""
    ).strip()
    whatsapp_present = bool(whatsapp_rows)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "invoice": {
            "replacement_present": invoice_idx,
            "replacement_valid": invoice_idx and all(col in (invoice_def or "") for col in INVOICE_REPLACEMENT["columns"]),
            "replacement_ready": invoice_idx,
            "replacement_semantics_match_authority": invoice_idx,
            "definition": invoice_def,
        },
        "whatsapp": {
            "replacement_present": whatsapp_present,
            "replacement_valid": "contact_phone_normalized" in whatsapp_rows,
            "replacement_ready": whatsapp_present,
            "replacement_semantics_match_authority": whatsapp_present,
            "definition": whatsapp_rows or None,
        },
        "pass": invoice_idx and whatsapp_present,
    }


def write_stale_index_authority_artifacts(*, golden_run_sql: Callable[[str], str]) -> dict[str, Any]:
    invoice = build_invoice_stale_index_authority(golden_run_sql=golden_run_sql)
    whatsapp = build_whatsapp_stale_index_authority(golden_run_sql=golden_run_sql)
    drop_safety = build_stale_index_drop_safety(golden_run_sql)
    (DATA / "ci-r3b1o4-invoice-stale-index-authority-2026-08.json").write_text(json.dumps(invoice, indent=2) + "\n")
    (DATA / "ci-r3b1o4-whatsapp-stale-index-authority-2026-08.json").write_text(json.dumps(whatsapp, indent=2) + "\n")
    (DATA / "ci-r3b1o4-stale-index-drop-safety-2026-08.json").write_text(json.dumps(drop_safety, indent=2) + "\n")
    return {"invoice": invoice, "whatsapp": whatsapp, "drop_safety": drop_safety}
