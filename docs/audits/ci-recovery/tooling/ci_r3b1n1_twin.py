"""Disposable production twin lifecycle for CI-R3B1N.1."""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from ci_r3b1n1_constants import BACKEND, REPO, ensure_workdir
from ci_r3b1n1_production_access import local_db_fingerprint, production_db_fingerprint


def parse_local_dsn() -> tuple[str, str, str]:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is required for disposable twin")
    p = urlparse(dsn)
    user = p.username or "postgres"
    host = p.hostname or "127.0.0.1"
    port = str(p.port or 5432)
    return dsn, user, host, port


def twin_dsn(base_dsn: str, db_name: str) -> str:
    p = urlparse(base_dsn)
    return urlunparse(p._replace(path=f"/{db_name}"))


def psql_exec(dsn: str, sql: str, *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = dsn
    return subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=capture, text=True, env=env)


def assert_non_production_target(base_dsn: str, twin_name: str) -> dict[str, Any]:
    prod_fp = production_db_fingerprint()
    twin_fp = local_db_fingerprint(twin_name, twin_dsn(base_dsn, twin_name))
    prod_host = prod_fp.get("host_fingerprint_sha256")
    twin_host = twin_fp.get("host_fingerprint_sha256")
    prod_db = prod_fp.get("production_db_name_fingerprint_sha256")
    twin_db = twin_fp.get("database_name_fingerprint_sha256")
    same_host = prod_host == twin_host
    same_db = prod_db == twin_db
    return {
        "target_is_twin": not (same_host and same_db),
        "target_is_production": same_host and same_db,
        "production_connection_used_for_writes": False,
        "pass": not (same_host and same_db),
        "twin_database_name": twin_name,
        "twin_fingerprint": twin_fp,
        "production_fingerprint": {
            "host_fingerprint_sha256": prod_host,
            "database_name_fingerprint_sha256": prod_db,
        },
    }


def create_twin_database(base_dsn: str) -> tuple[str, str]:
    twin_name = f"r3b1n1_prod_twin_{secrets.token_hex(4)}"
    admin = urlparse(base_dsn)
    admin_dsn = urlunparse(admin._replace(path="/postgres"))
    psql_exec(admin_dsn, f'CREATE DATABASE "{twin_name}";')
    return twin_name, twin_dsn(base_dsn, twin_name)


def restore_schema(dsn: str, schema_dump: Path) -> None:
    proc = subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-f", str(schema_dump)], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)


def clear_prisma_ledger(dsn: str) -> None:
    psql_exec(dsn, 'TRUNCATE TABLE "_prisma_migrations";')


def insert_ledger_rows(dsn: str, rows: list[dict[str, Any]], *, null_logs: bool = True) -> None:
    for row in rows:
        cols = ["id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"]
        values = []
        for col in cols:
            val = row.get(col, "")
            if col == "logs" and null_logs:
                val = None
            if val in ("", None):
                values.append("NULL")
            else:
                esc = str(val).replace("'", "''")
                values.append(f"'{esc}'")
        sql = f'INSERT INTO "_prisma_migrations" ({", ".join(cols)}) VALUES ({", ".join(values)});'
        psql_exec(dsn, sql)


def export_twin_ledger(dsn: str) -> list[dict[str, Any]]:
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


def ledger_fingerprint(rows: list[dict[str, Any]]) -> str:
    from ci_r3b1n1_constants import sha256_text

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


def count_business_rows(dsn: str) -> dict[str, Any]:
    tables = ["bookings", "vehicles", "organizations", "organization_memberships", "vehicle_trips"]
    counts = {}
    for table in tables:
        proc = psql_exec(
            dsn,
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{table}';",
        )
        exists = (proc.stdout or "").strip().endswith("1")
        if exists:
            cproc = psql_exec(dsn, f'SELECT COUNT(*) FROM "{table}";')
            m = re.search(r"(\d+)", cproc.stdout or "")
            counts[table] = int(m.group(1)) if m else None
        else:
            counts[table] = None
    total = sum(v for v in counts.values() if isinstance(v, int))
    return {"table_counts": counts, "total_business_rows_sampled": total, "pass": total == 0}


def run_prisma_command(cmd: list[str], dsn: str, *, cwd: Path = BACKEND) -> dict[str, Any]:
    env = os.environ.copy()
    env["DATABASE_URL"] = dsn
    start = time.time()
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=env)
    return {
        "command": " ".join(cmd),
        "exit_code": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "duration_ms": int((time.time() - start) * 1000),
    }


def parse_first_blocker(output: str) -> dict[str, Any]:
    text = output or ""
    migration = None
    m = re.search(r"Migration name:\s*(\S+)", text)
    if m:
        migration = m.group(1)
    m = re.search(r"(P\d{4})", text)
    prisma_code = m.group(1) if m else None
    sqlstate = None
    m = re.search(r"SQLSTATE\[(\w+)\]", text)
    if m:
        sqlstate = m.group(1)
    m = re.search(r"ERROR:\s*(.+)", text)
    pg_error = m.group(1).strip() if m else None
    blocker = "OTHER"
    low = text.lower()
    if "already exists" in low and "column" in low:
        blocker = "PENDING_EXISTING_COLUMN_COLLISION"
    elif "already exists" in low and "relation" in low:
        blocker = "PENDING_EXISTING_TABLE_COLLISION"
    elif "already exists" in low and "index" in low:
        blocker = "PENDING_EXISTING_INDEX_COLLISION"
    elif "already exists" in low and "constraint" in low:
        blocker = "PENDING_EXISTING_CONSTRAINT_COLLISION"
    elif "checksum" in low or "modified after it was applied" in low:
        blocker = "APPLIED_CHECKSUM_HISTORY_DIVERGENCE"
    return {
        "first_failing_migration": migration,
        "prisma_error_code": prisma_code,
        "sqlstate": sqlstate,
        "postgres_error": pg_error,
        "blocker_type": blocker,
    }


def schema_object_count(dsn: str) -> int:
    proc = psql_exec(
        dsn,
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';",
    )
    m = re.search(r"(\d+)", proc.stdout or "")
    return int(m.group(1)) if m else 0
