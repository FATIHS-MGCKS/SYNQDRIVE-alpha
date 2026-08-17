"""Isolated twin operations and deploy parsing for CI-R3B1N.2."""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

from ci_r3b1n2_constants import BACKEND, sha256_text
from ci_r3b1n2_instance_identity import MutationGuard, query_instance_identity_dsn


def _psql_safe_dsn(dsn: str) -> str:
    """Strip Prisma-only URI query params (e.g. schema=) that libpq rejects."""
    parsed = urlparse(dsn)
    return urlunparse(parsed._replace(query="", fragment=""))


def parse_local_dsn() -> tuple[str, str]:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL required")
    clean = _psql_safe_dsn(dsn)
    parsed = urlparse(clean)
    return clean, urlunparse(parsed._replace(path="/postgres"))


def twin_dsn(base_dsn: str, db_name: str) -> str:
    return urlunparse(urlparse(_psql_safe_dsn(base_dsn))._replace(path=f"/{db_name}"))


def psql_exec(dsn: str, sql: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)


def create_isolated_twin(base_dsn: str, guard: MutationGuard) -> tuple[str, str]:
    twin_name = f"r3b1n2_isolated_twin_{secrets.token_hex(4)}"
    admin_dsn = urlunparse(urlparse(base_dsn)._replace(path="/postgres"))
    psql_exec(admin_dsn, f'CREATE DATABASE "{twin_name}";')
    dsn = twin_dsn(base_dsn, twin_name)
    guard.verify_target(dsn, operation="create_twin")
    return twin_name, dsn


def restore_schema(guard: MutationGuard, dsn: str, dump_path: Path) -> None:
    guard.verify_target(dsn, operation="restore_schema")
    proc = subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-f", str(dump_path)], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


def insert_ledger_rows(guard: MutationGuard, dsn: str, rows: list[dict[str, Any]]) -> None:
    guard.verify_target(dsn, operation="insert_ledger")
    for row in rows:
        cols = ["id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"]
        values = []
        for col in cols:
            val = row.get(col, "")
            if col == "logs":
                val = None
            if val in ("", None):
                values.append("NULL")
            else:
                values.append("'" + str(val).replace("'", "''") + "'")
        psql_exec(dsn, f'INSERT INTO "_prisma_migrations" ({", ".join(cols)}) VALUES ({", ".join(values)});')


def export_ledger(dsn: str) -> list[dict[str, Any]]:
    proc = subprocess.run(
        [
            "psql",
            dsn,
            "-At",
            "-c",
            'COPY (SELECT id, migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at) TO STDOUT WITH CSV HEADER;',
        ],
        capture_output=True,
        text=True,
    )
    lines = [ln for ln in (proc.stdout or "").strip().splitlines() if ln.strip()]
    headers = lines[0].split(",")
    return [dict(zip(headers, line.split(","))) for line in lines[1:]]


def ledger_canonical_fingerprint(rows: list[dict[str, Any]]) -> str:
    parts = []
    for row in rows:
        parts.append(
            "|".join(
                [
                    row.get("migration_name", ""),
                    row.get("checksum", ""),
                    row.get("started_at", ""),
                    row.get("finished_at", ""),
                    row.get("rolled_back_at", ""),
                    row.get("applied_steps_count", ""),
                ]
            )
        )
    return sha256_text("\n".join(sorted(parts)))


def business_row_counts(dsn: str, tables: tuple[str, ...]) -> dict[str, Any]:
    results = {}
    for table in tables:
        exists_proc = subprocess.run(
            ["psql", dsn, "-At", "-c", f"SELECT to_regclass('public.{table}') IS NOT NULL;"],
            capture_output=True,
            text=True,
        )
        exists = (exists_proc.stdout or "").strip() == "t"
        if not exists:
            results[table] = {"exists": False, "row_count": None}
            continue
        count_proc = subprocess.run(
            ["psql", dsn, "-At", "-c", f'SELECT COUNT(*)::bigint FROM "{table}";'],
            capture_output=True,
            text=True,
        )
        if count_proc.returncode != 0:
            results[table] = {"exists": True, "row_count": None}
            continue
        results[table] = {"exists": True, "row_count": int((count_proc.stdout or "0").strip())}
    nulls = sum(1 for v in results.values() if v["exists"] and v["row_count"] is None)
    total = sum(v["row_count"] for v in results.values() if isinstance(v.get("row_count"), int))
    return {"tables": results, "null_measurements": nulls, "total_rows": total, "pass": nulls == 0 and total == 0}


def run_prisma(cmd: list[str], guard: MutationGuard, dsn: str) -> dict[str, Any]:
    guard.verify_target(dsn, operation=" ".join(cmd))
    env = os.environ.copy()
    env["DATABASE_URL"] = dsn
    start = time.time()
    proc = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True, env=env)
    return {
        "exit_code": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "duration_ms": int((time.time() - start) * 1000),
    }


def parse_deploy_errors(text: str) -> dict[str, Any]:
    prisma = None
    m = re.search(r"\b(P\d{4})\b", text)
    if m:
        prisma = m.group(1)
    db_code = None
    m = re.search(r"Database error code:\s*(\d+)", text)
    if m:
        db_code = m.group(1)
    m = re.search(r"SQLSTATE\[(\w+)\]", text)
    sqlstate = m.group(1) if m else None
    m = re.search(r"SqlState\((E\d+)\)", text)
    if m:
        sqlstate = m.group(1)
    migration = None
    m = re.search(r"Migration name:\s*(\S+)", text)
    if m:
        migration = m.group(1)
    msg = None
    m = re.search(r"Database error:\s*\nERROR:\s*(.+)", text)
    if m:
        msg = m.group(1).strip()
    blocker = "OTHER"
    low = text.lower()
    if "column" in low and "already exists" in low:
        blocker = "PENDING_EXISTING_COLUMN_COLLISION"
    return {
        "first_failing_migration": migration,
        "prisma_error_code": prisma,
        "database_error_code": db_code,
        "sqlstate": sqlstate,
        "database_error_message": msg,
        "blocker_type": blocker,
    }


def classify_ledger_delta(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> dict[str, Any]:
    before_ids = {r["id"] for r in before}
    new_rows = [r for r in after if r["id"] not in before_ids]
    classified = []
    for row in new_rows:
        if row.get("finished_at") and not row.get("rolled_back_at"):
            state = "NEW_FINISHED"
        elif row.get("rolled_back_at") and not row.get("finished_at"):
            state = "NEW_ROLLED_BACK"
        elif not row.get("finished_at") and not row.get("rolled_back_at"):
            state = "NEW_FAILED"
        else:
            state = "NEW_OTHER"
        classified.append({"migration_name": row.get("migration_name"), "state": state, "id": row.get("id")})
    return {
        "new_rows": classified,
        "new_finished": sum(1 for r in classified if r["state"] == "NEW_FINISHED"),
        "new_failed": sum(1 for r in classified if r["state"] == "NEW_FAILED"),
        "new_rolled_back": sum(1 for r in classified if r["state"] == "NEW_ROLLED_BACK"),
    }
