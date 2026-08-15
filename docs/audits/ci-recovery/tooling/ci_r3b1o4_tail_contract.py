"""Tail reconciliation contract, SQL builder, and precondition engine for CI-R3B1O.4."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from ci_r3b1o1_constants import M252_TABLE
from ci_r3b1o3_index_provenance import index_present
from ci_r3b1o_constants import M252, MIG_ROOT
from ci_r3b1o4_constants import DATA, STALE_INDEXES, TAIL_TASKS

M252_SQL = (MIG_ROOT / M252 / "migration.sql").read_text()


def build_tail_sql() -> tuple[str, list[str]]:
    drops = [
        'DROP INDEX IF EXISTS "org_invoices_invoice_number_key";',
        'DROP INDEX IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key";',
    ]
    order_reason = (
        "Stale standalone indexes are removed first because they are obsolete recovery artifacts "
        "not required by schema.prisma and not backing active constraints. M252 DDL follows because "
        "parent organizations/organization_memberships already exist after normal deploy."
    )
    sql_parts = [
        "-- CI-R3B1O.4 temporary append-only tail reconciliation (three authorized tasks only)",
        "-- Order: invoice stale index drop, WhatsApp stale index drop, canonical M252 forward reconciliation",
        f"-- {order_reason}",
        "",
        *drops,
        "",
        M252_SQL.strip(),
        "",
    ]
    return "\n".join(sql_parts), ["INVOICE_STALE_INDEX", "WHATSAPP_STALE_INDEX", "M252"]


def build_tail_reconciliation_contract() -> dict[str, Any]:
    sql, execution_order = build_tail_sql()
    tasks = [
        {
            "task_id": "M252",
            "purpose": "Bring absent historical M252 catalog effect to canonical corrected physical authority",
            "source_migration": M252,
            "target_table": M252_TABLE,
        },
        {
            "task_id": "INVOICE_STALE_INDEX",
            "purpose": "Remove obsolete stale recovery index org_invoices_invoice_number_key",
            "sql": 'DROP INDEX IF EXISTS "org_invoices_invoice_number_key";',
        },
        {
            "task_id": "WHATSAPP_STALE_INDEX",
            "purpose": "Remove obsolete stale recovery index whatsapp_conversations_organization_id_contact_phone_key",
            "sql": 'DROP INDEX IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key";',
        },
    ]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "logical_tasks": tasks,
        "logical_task_count": len(tasks),
        "authorized_tasks": TAIL_TASKS,
        "execution_order": execution_order,
        "execution_order_rationale": "Stale index drops precede M252 CREATE because no statement depends on M252 objects and stale indexes are not constraint-backed.",
        "unauthorized_tasks": 0,
        "uses_cascade": False,
        "pass": len(tasks) == 3,
    }


def evaluate_tail_preconditions(run_sql: Callable[[str], str], *, phase: str = "pre_tail") -> dict[str, Any]:
    m252_table_absent = run_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip() == "0"
    authority = {
        "org_role_asgn_drift_recon_apps_pkey": "org_role_asgn_drift_recon_apps_pkey",
        "org_role_asgn_drift_recon_apps_idem_key": "org_role_asgn_drift_recon_apps_idem_key",
        "org_role_asgn_drift_recon_apps_org_mbr_created_idx": "org_role_asgn_drift_recon_apps_org_mbr_created_idx",
        "org_role_asgn_drift_recon_apps_org_id_fkey": "org_role_asgn_drift_recon_apps_org_id_fkey",
        "org_role_asgn_drift_recon_apps_mbr_id_fkey": "org_role_asgn_drift_recon_apps_mbr_id_fkey",
    }
    m252_objects_absent = all(
        run_sql(
            f"""
SELECT COUNT(*) FROM (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='{name}'
  UNION ALL
  SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace
  WHERE n.nspname='public' AND con.conname='{name}'
) s;
"""
        ).strip()
        == "0"
        for name in authority
    )
    parents_present = all(
        run_sql(
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{table}';"
        ).strip()
        == "1"
        for table in ["organizations", "organization_memberships"]
    )
    stale = {name: index_present(run_sql, name) for name in STALE_INDEXES}
    invoice_replacement = index_present(run_sql, "org_invoices_organization_id_sequence_year_sequence_number_key")
    whatsapp_replacement = (
        run_sql(
            """
SELECT COUNT(*) FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public' AND rel.relname='whatsapp_conversations'
  AND con.contype='u' AND con.conname='whatsapp_conversations_organization_id_contact_phone_normalized_key';
"""
        ).strip()
        == "1"
    )

    if phase == "pre_tail":
        expected = {
            "m252_table_absent": True,
            "m252_objects_absent": True,
            "parents_present": True,
            "invoice_stale_present": True,
            "whatsapp_stale_present": True,
            "invoice_replacement_present": True,
            "whatsapp_replacement_present": True,
        }
        actual = {
            "m252_table_absent": m252_table_absent,
            "m252_objects_absent": m252_objects_absent,
            "parents_present": parents_present,
            "invoice_stale_present": stale[STALE_INDEXES[0]],
            "whatsapp_stale_present": stale[STALE_INDEXES[1]],
            "invoice_replacement_present": invoice_replacement,
            "whatsapp_replacement_present": whatsapp_replacement,
        }
    else:
        expected = {
            "invoice_stale_absent": True,
            "whatsapp_stale_absent": True,
            "m252_table_present": True,
            "invoice_replacement_present": True,
            "whatsapp_replacement_present": True,
        }
        actual = {
            "invoice_stale_absent": not stale[STALE_INDEXES[0]],
            "whatsapp_stale_absent": not stale[STALE_INDEXES[1]],
            "m252_table_present": not m252_table_absent,
            "invoice_replacement_present": invoice_replacement,
            "whatsapp_replacement_present": whatsapp_replacement,
        }

    checks = {k: actual[k] == v for k, v in expected.items()}
    return {
        "schema_version": 1,
        "phase": phase,
        "expected": expected,
        "actual": actual,
        "checks": checks,
        "stale_indexes": stale,
        "pass": all(checks.values()),
    }


def build_tail_data_risk() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4",
        "tasks": {
            "INVOICE_STALE_INDEX": {"classification": "DDL_SCHEMA_ONLY", "dml": {"insert": 0, "update": 0, "delete": 0}},
            "WHATSAPP_STALE_INDEX": {"classification": "DDL_SCHEMA_ONLY", "dml": {"insert": 0, "update": 0, "delete": 0}},
            "M252": {
                "classification": "DDL_SCHEMA_ONLY",
                "dml": {"insert": 0, "update": 0, "delete": 0},
                "note": "Empty new table; FK DDL uses ON DELETE CASCADE but no row deletes",
            },
        },
        "totals": {"insert": 0, "update": 0, "delete": 0},
        "UNKNOWN_DATA_DEPENDENCY": 0,
        "pass": True,
    }


def write_tail_contract_artifacts() -> dict[str, Any]:
    contract = build_tail_reconciliation_contract()
    sql, _ = build_tail_sql()
    data_risk = build_tail_data_risk()
    (DATA / "ci-r3b1o4-tail-reconciliation-contract-2026-08.json").write_text(json.dumps(contract, indent=2) + "\n")
    (DATA / "ci-r3b1o4-temporary-tail-migration-contract-2026-08.sql").write_text(sql + "\n")
    (DATA / "ci-r3b1o4-tail-data-risk-2026-08.json").write_text(json.dumps(data_risk, indent=2) + "\n")
    return {"contract": contract, "sql": sql, "data_risk": data_risk}


def build_temp_tail_migration_dir() -> tuple[Path, dict[str, Any]]:
    ts = time.strftime("%Y%m%d%H%M%S")
    name = f"{ts}_ci_r3b_production_history_tail_reconciliation"
    sql, order = build_tail_sql()
    import tempfile

    tmp_root = Path(tempfile.mkdtemp(prefix="r3b1o4_tail_"))
    mig_dir = tmp_root / "backend" / "prisma" / "migrations" / name
    mig_dir.mkdir(parents=True)
    (mig_dir / "migration.sql").write_text(sql)
    return tmp_root, {"temporary_migration_name": name, "execution_order": order, "tracked_repository": False, "sql_sha256_source": "ci-r3b1o4-temporary-tail-migration-contract-2026-08.sql"}
