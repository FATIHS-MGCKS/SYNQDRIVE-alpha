#!/usr/bin/env python3
"""Capture statement-level failure evidence for a failed migration replay."""
from __future__ import annotations

import json
import re
from pathlib import Path

from ci_r3b1j_pg_identifier import split_top_level_statements
from replay_evidence_lib import MIG_ROOT, migration_dirs, migration_ordinal, psql, PgConfig


def parse_sqlstate(text: str) -> str | None:
    m = re.search(r"ERROR:\s+(\d{5}):", text)
    if m:
        return m.group(1)
    if "already exists" in text.lower():
        return "42P07"
    return None


def capture_migration_statement_failure(cfg: PgConfig, db: str, migration_name: str, last_successful: str | None = None) -> dict:
    path = MIG_ROOT / migration_name / "migration.sql"
    sql = path.read_text()
    statements = split_top_level_statements(sql)
    results = []
    first_failure = None
    for idx, stmt in enumerate(statements, start=1):
        proc = psql(cfg, db, stmt + ";")
        entry = {"statement_ordinal": idx, "status": "PASS" if proc.returncode == 0 else "FAIL", "sql": stmt}
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            entry["stderr"] = err
            entry["sqlstate"] = parse_sqlstate(err)
            first_failure = entry
            results.append(entry)
            break
        results.append(entry)
    return {
        "migration": migration_name,
        "migration_ordinal": migration_ordinal(migration_name),
        "statement_count": len(statements),
        "first_failing_statement_ordinal": (first_failure or {}).get("statement_ordinal"),
        "failing_statement_sql": (first_failure or {}).get("sql"),
        "sqlstate": (first_failure or {}).get("sqlstate"),
        "postgresql_error": (first_failure or {}).get("stderr"),
        "prior_statements": results,
        "last_successful_migration": last_successful,
    }


def enrich_replay_failure(cfg: PgConfig, db: str, parsed_failure: dict) -> dict:
    failed = parsed_failure.get("first_failed_migration")
    if not failed:
        return parsed_failure
    enriched = capture_migration_statement_failure(
        cfg,
        db,
        failed,
        parsed_failure.get("last_applied_migration"),
    )
    return {**parsed_failure, "statement_level_failure": enriched}
