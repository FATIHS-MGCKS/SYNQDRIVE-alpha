"""PostgreSQL instance identity and mutation safety guard."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from typing import Any
from urllib.parse import urlparse, urlunparse

from ci_r3b1n1_production_access import ssh_psql_sql
from ci_r3b1n2_constants import sha256_text


def _local_psql(dsn: str, sql: str) -> str:
    proc = subprocess.run(
        ["psql", dsn, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return proc.stdout.strip()


def query_instance_identity_dsn(dsn: str) -> dict[str, Any]:
    version = _local_psql(dsn, "SELECT version();")
    system_id = _local_psql(dsn, "SELECT system_identifier FROM pg_control_system();")
    addr_port = _local_psql(dsn, "SELECT COALESCE(inet_server_addr()::text,''), inet_server_port();")
    db = _local_psql(dsn, "SELECT current_database();")
    parts = addr_port.split("|")
    return {
        "postgresql_version_line": version[:160],
        "system_identifier": system_id,
        "inet_server_addr": parts[0] if parts else "",
        "inet_server_port": parts[1] if len(parts) > 1 else "",
        "current_database": db,
        "instance_fingerprint_sha256": sha256_text("|".join([system_id, parts[0] if parts else "", parts[1] if len(parts) > 1 else ""])),
        "database_fingerprint_sha256": sha256_text(db),
    }


def query_production_instance_identity() -> dict[str, Any]:
    sql = """
BEGIN TRANSACTION READ ONLY;
SELECT version();
SELECT system_identifier FROM pg_control_system();
SELECT COALESCE(inet_server_addr()::text,''), inet_server_port();
SELECT current_database();
ROLLBACK;
"""
    proc = ssh_psql_sql(sql, tuples_only=True)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    addr, port = ("", "")
    if len(lines) >= 3:
        parts = lines[2].split("|")
        addr = parts[0] if parts else ""
        port = parts[1] if len(parts) > 1 else ""
    system_id = lines[1] if len(lines) > 1 else ""
    db = lines[3] if len(lines) > 3 else "synqdrive"
    return {
        "alias": "PROD_DB_A",
        "service_alias": "PROD_VPS_A",
        "postgresql_version_line": lines[0][:160] if lines else None,
        "system_identifier": system_id,
        "inet_server_addr": addr,
        "inet_server_port": port,
        "current_database": db,
        "instance_fingerprint_sha256": sha256_text("|".join([system_id, addr, port])),
        "database_fingerprint_sha256": sha256_text(db),
    }


def prove_isolation(production: dict[str, Any], twin: dict[str, Any]) -> dict[str, Any]:
    same_instance = production["instance_fingerprint_sha256"] == twin["instance_fingerprint_sha256"]
    same_database = production["database_fingerprint_sha256"] == twin["database_fingerprint_sha256"]
    return {
        "production": production,
        "twin": twin,
        "same_physical_instance": same_instance,
        "same_database_name": same_database,
        "isolation_pass": not same_instance and not same_database,
    }


class MutationGuard:
    def __init__(self, production_identity: dict[str, Any], approved_twin_identity: dict[str, Any]):
        self.production_fp = production_identity["instance_fingerprint_sha256"]
        self.production_db_fp = production_identity["database_fingerprint_sha256"]
        self.approved_instance_fp = approved_twin_identity["instance_fingerprint_sha256"]
        self.approved_db_fp = approved_twin_identity["database_fingerprint_sha256"]

    def check_fingerprints(self, target_instance_fp: str, target_db_fp: str, *, operation: str) -> dict[str, Any]:
        if target_instance_fp == self.production_fp:
            raise RuntimeError(f"SAFETY_ABORT: {operation} target matches production instance fingerprint")
        if target_db_fp == self.production_db_fp:
            raise RuntimeError(f"SAFETY_ABORT: {operation} target matches production database fingerprint")
        if target_instance_fp != self.approved_instance_fp:
            raise RuntimeError(f"SAFETY_ABORT: {operation} target is not the approved twin instance")
        return {"operation": operation, "pass": True}

    def verify_target(self, dsn: str, *, operation: str) -> dict[str, Any]:
        target = query_instance_identity_dsn(dsn)
        return self.check_fingerprints(
            target["instance_fingerprint_sha256"],
            target["database_fingerprint_sha256"],
            operation=operation,
        )
