"""Production data-dependency risk classification for pending migrations."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1o_constants import MIG_ROOT, R3B1N_LEDGER


def classify_sql_dependency(sql: str) -> str:
    if re.search(r"\b(INSERT|UPDATE|DELETE)\b", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"SET NOT NULL", sql, re.I) and re.search(r"ALTER TABLE", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"USING\s+", sql, re.I) and re.search(r"ALTER COLUMN", sql, re.I):
        return "DATA_DEPENDENT_HIGH"
    if re.search(r"ADD CONSTRAINT.*FOREIGN KEY", sql, re.I):
        return "DATA_DEPENDENT_LOW"
    if re.search(r"CREATE UNIQUE INDEX", sql, re.I):
        return "DATA_DEPENDENT_LOW"
    if re.search(r"DO \$\$|\bEXECUTE\b", sql, re.I):
        return "UNKNOWN_DATA_DEPENDENCY"
    if re.search(r"\b(CREATE|ALTER|DROP)\b", sql, re.I):
        return "DDL_SCHEMA_ONLY"
    return "UNKNOWN_DATA_DEPENDENCY"


def build_data_dependency_risk(*, recovered_inventory: dict[str, str]) -> dict[str, Any]:
    _, ledger_best = load_frozen_ledger(R3B1N_LEDGER)
    applied = {name for name, row in ledger_best.items() if row.get("finished_at") and not row.get("rolled_back_at")}
    pending = sorted(set(recovered_inventory) - applied)
    entries = []
    counts = {
        "DDL_SCHEMA_ONLY": 0,
        "DATA_DEPENDENT_LOW": 0,
        "DATA_DEPENDENT_HIGH": 0,
        "UNKNOWN_DATA_DEPENDENCY": 0,
    }
    for name in pending:
        sql = (MIG_ROOT / name / "migration.sql").read_text()
        cls = classify_sql_dependency(sql)
        counts[cls] = counts.get(cls, 0) + 1
        entries.append({"migration": name, "classification": cls})
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "pending_migration_count": len(entries),
        "counts": counts,
        "migrations": entries,
        "schema_only_twin_limitation": True,
        "production_preflight_required_for_high_or_unknown": counts["DATA_DEPENDENT_HIGH"] + counts["UNKNOWN_DATA_DEPENDENCY"] > 0,
    }
