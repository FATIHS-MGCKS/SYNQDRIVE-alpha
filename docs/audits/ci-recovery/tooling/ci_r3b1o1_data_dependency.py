"""Corrected production data-dependency risk matrix for CI-R3B1O.1."""
from __future__ import annotations

from typing import Any

from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1o_constants import M252, MIG_ROOT, R3B1G, R3B1I, R3B1N_LEDGER, local_migration_inventory
from ci_r3b1o1_sql_classifier import classify_migration_data_risk, migration_has_dml, parse_migration_statements


RESOLVED_BY_STRATEGY = {R3B1G, R3B1I}


def build_corrected_data_dependency_risk(*, include_forward_m252: bool = True) -> dict[str, Any]:
    _, ledger_best = load_frozen_ledger(R3B1N_LEDGER)
    recovered_inventory = local_migration_inventory()
    applied = {name for name, row in ledger_best.items() if row.get("finished_at") and not row.get("rolled_back_at")}
    pending = sorted(set(recovered_inventory) - applied - RESOLVED_BY_STRATEGY)
    entries = []
    counts = {
        "DDL_SCHEMA_ONLY": 0,
        "DATA_DEPENDENT_LOW": 0,
        "DATA_DEPENDENT_HIGH": 0,
        "UNKNOWN_DATA_DEPENDENCY": 0,
    }
    for name in pending:
        sql = (MIG_ROOT / name / "migration.sql").read_text()
        cls, reason, statements = classify_migration_data_risk(sql)
        counts[cls] = counts.get(cls, 0) + 1
        entries.append(
            {
                "migration": name,
                "classification": cls,
                "reason": reason,
                "statements": statements,
                "dml_statement_count": sum(1 for s in statements if s["is_dml"]),
                "required_production_read_only_preflight": cls
                in {"DATA_DEPENDENT_HIGH", "DATA_DEPENDENT_LOW", "UNKNOWN_DATA_DEPENDENCY"},
            }
        )
    m252_sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    if include_forward_m252:
        cls, reason, statements = classify_migration_data_risk(m252_sql)
        counts[cls] = counts.get(cls, 0) + 1
        entries.append(
            {
                "migration": "FORWARD_M252_APPEND_ONLY",
                "classification": cls,
                "reason": reason,
                "statements": statements,
                "dml_statement_count": sum(1 for s in statements if s["is_dml"]),
                "required_production_read_only_preflight": False,
            }
        )
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "parser": "SQL_CONTEXT_AWARE",
        "resolved_by_strategy": sorted(RESOLVED_BY_STRATEGY),
        "executing_migration_count": len(entries),
        "counts": counts,
        "migrations": entries,
        "m252_has_dml": migration_has_dml(m252_sql),
        "pass": counts["UNKNOWN_DATA_DEPENDENCY"] == 0 and not migration_has_dml(m252_sql),
    }
