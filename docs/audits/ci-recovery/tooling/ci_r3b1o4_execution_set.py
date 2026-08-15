"""Actual migration execution set for CI-R3B1O.4 final corrective catalog authority."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1l2_prisma_sql_parser import sha256_text
from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1n2_constants import sha256_file
from ci_r3b1o1_sql_classifier import classify_migration_data_risk, parse_migration_statements
from ci_r3b1o_constants import M252, MIG_ROOT, R3B1G, R3B1I, R3B1N_LEDGER, local_migration_inventory
from ci_r3b1o4_tail_contract import build_tail_sql

RESOLVED_NOT_EXECUTED = {R3B1G, R3B1I}
TAIL_MIGRATION_NAME = "TEMPORARY_TAIL_RECONCILIATION_20260815"


def _migration_classification(name: str) -> str:
    if name in RESOLVED_NOT_EXECUTED:
        return "RESOLVED_NOT_EXECUTED"
    if name == TAIL_MIGRATION_NAME:
        return "APPEND_ONLY_TAIL_RECONCILIATION"
    if name == M252:
        return "CANONICAL_M252_FORWARD"
    if "historical_predecessor" in name or "post_vendor_predecessor" in name or "post_replay" in name:
        return "HISTORICAL_RECOVERY"
    return "NORMAL_PENDING"


def build_execution_set(*, applied_migration_names: set[str] | None = None) -> dict[str, Any]:
    _, ledger = load_frozen_ledger(R3B1N_LEDGER)
    inventory = local_migration_inventory()
    if applied_migration_names is None:
        applied_migration_names = {name for name, row in ledger.items() if row.get("finished_at") and not row.get("rolled_back_at")}

    pending = sorted(set(inventory) - applied_migration_names - RESOLVED_NOT_EXECUTED)
    tail_sql, _tail_order = build_tail_sql()

    migrations: list[dict[str, Any]] = []
    for name in pending:
        sql_path = MIG_ROOT / name / "migration.sql"
        sql = sql_path.read_text()
        cls, reason, _ = classify_migration_data_risk(sql)
        statements = parse_migration_statements(sql)
        migrations.append(
            {
                "migration_name": name,
                "migration_checksum_sha256": sha256_file(sql_path),
                "classification": _migration_classification(name),
                "data_risk_classification": cls,
                "data_risk_reason": reason,
                "executes_on_strategy": True,
                "statements": [
                    {
                        "ordinal": s["ordinal"],
                        "statement_type": s["statement_type"],
                        "statement_sha256": sha256_text(s["sql"]),
                        "sql_preview": re.sub(r"\s+", " ", s["sql"].strip())[:240],
                    }
                    for s in statements
                ],
            }
        )

    migrations.append(
        {
            "migration_name": TAIL_MIGRATION_NAME,
            "migration_checksum_sha256": sha256_text(tail_sql),
            "classification": "APPEND_ONLY_TAIL_RECONCILIATION",
            "data_risk_classification": "DDL_SCHEMA_ONLY",
            "data_risk_reason": "three-task append-only tail reconciliation",
            "executes_on_strategy": True,
            "statements": [
                {
                    "ordinal": s["ordinal"],
                    "statement_type": s["statement_type"],
                    "statement_sha256": sha256_text(s["sql"]),
                    "sql_preview": re.sub(r"\s+", " ", s["sql"].strip())[:240],
                }
                for s in parse_migration_statements(tail_sql)
            ],
        }
    )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-final-corrective",
        "resolved_not_executed": sorted(RESOLVED_NOT_EXECUTED),
        "executing_migration_count": len(migrations),
        "migrations": migrations,
        "pass": len(pending) == 21 and len(migrations) == 22,
    }


def build_statement_lookup(execution_set: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    lookup: dict[tuple[str, int], dict[str, Any]] = {}
    for mig in execution_set.get("migrations", []):
        name = mig["migration_name"]
        for stmt in mig.get("statements", []):
            lookup[(name, int(stmt["ordinal"]))] = {
                "migration_name": name,
                "statement_ordinal": int(stmt["ordinal"]),
                "statement_sha256": stmt["statement_sha256"],
                "statement_family": stmt.get("statement_type"),
                "sql_preview": stmt.get("sql_preview"),
            }
    return lookup
