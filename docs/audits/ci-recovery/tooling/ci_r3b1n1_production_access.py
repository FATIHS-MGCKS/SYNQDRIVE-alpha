"""Sanitized read-only production access for CI-R3B1N.1."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from ci_r3b1n1_constants import PROD_DB_A, PROD_VPS_A, sha256_text

SSH_KEY = Path.home() / ".ssh/id_ed25519"


def _ssh_host() -> str:
    return os.environ.get("CLOUD_AGENT_VPS_HOST", "srv1374778.hstgr.cloud")


def _ssh_user() -> str:
    user = (os.environ.get("CLOUD_AGENT_SSH_USER") or "").strip()
    if not user or user == "root":
        return "synqdrive-admin"
    return user


def ssh_run(remote_script: str, *, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    cmd = [
        "ssh",
        "-p",
        "22",
        "-i",
        str(SSH_KEY),
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=20",
        f"{_ssh_user()}@{_ssh_host()}",
        "bash",
        "-s",
    ]
    return subprocess.run(cmd, input=remote_script, capture_output=True, text=True, timeout=timeout)


def sanitize_log_text(text: str) -> str:
    out = text or ""
    out = re.sub(r"postgres(?:ql)?://[^\s\"']+", "[REDACTED_DSN]", out, flags=re.I)
    out = re.sub(r"(?i)(password|token|secret|api_key)\s*[:=]\s*\S+", r"\1=[REDACTED]", out)
    out = re.sub(r"srv1374778\.hstgr\.cloud", "[PROD_HOST]", out)
    out = re.sub(r"synqdrive-admin", "[PROD_SSH_USER]", out)
    return out


def production_db_fingerprint() -> dict[str, Any]:
    remote = r"""set -euo pipefail
sudo python3 - <<'PY'
import hashlib, json, re
from urllib.parse import urlparse
text=open('/opt/synqdrive/shared/backend.env').read()
m=re.search(r'^DATABASE_URL=(.+)$', text, re.M)
if not m:
    print(json.dumps({'bound': False})); raise SystemExit(0)
url=m.group(1).strip().strip('"').strip("'")
p=urlparse(url)
print(json.dumps({
  'production_db_name_fingerprint_sha256': hashlib.sha256((p.path.lstrip('/') or '').encode()).hexdigest(),
  'host_fingerprint_sha256': hashlib.sha256((p.hostname or '').encode()).hexdigest(),
  'port': p.port or 5432,
  'database_name_length': len(p.path.lstrip('/') or ''),
}))
PY"""
    proc = ssh_run(remote)
    payload = json.loads((proc.stdout or "{}").strip() or "{}")
    payload["production_service"] = PROD_VPS_A
    payload["production_database_alias"] = PROD_DB_A
    return payload


def export_schema_only_dump(dest: Path) -> dict[str, Any]:
    remote = r"""set -euo pipefail
sudo -u postgres pg_dump -d synqdrive --schema-only --no-owner --no-privileges
"""
    proc = ssh_run(remote, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    dump = proc.stdout or ""
    dump = dump.replace("srv1374778.hstgr.cloud", "[PROD_HOST]")
    dump = dump.replace("\\connect synqdrive", "\\connect [PROD_DB]")
    dest.write_text(dump)
    return {
        "path": str(dest.relative_to(dest.parents[4])),
        "sha256": hashlib.sha256(dump.encode()).hexdigest(),
        "bytes": len(dump.encode()),
        "data_rows_included": 0,
    }


def export_prisma_ledger(include_logs: bool = False) -> list[dict[str, Any]]:
    cols = "id, migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count"
    if include_logs:
        cols += ", logs"
    proc = ssh_run(
        f"""set -euo pipefail
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 -At -c "COPY (SELECT {cols} FROM _prisma_migrations ORDER BY started_at) TO STDOUT WITH CSV HEADER;"
"""
    )
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
    if not lines:
        return []
    headers = lines[0].split(",")
    rows = []
    for line in lines[1:]:
        parts = line.split(",")
        row = dict(zip(headers, parts))
        if "logs" in row and row["logs"]:
            row["logs"] = sanitize_log_text(row["logs"])[:2000]
        rows.append(row)
    return rows


def ledger_summary_fingerprint(rows: list[dict[str, Any]]) -> str:
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


def ssh_psql_sql(sql: str, *, tuples_only: bool = True) -> subprocess.CompletedProcess[str]:
    flags = "-t -A" if tuples_only else ""
    remote = f"""set -euo pipefail
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 {flags} <<'SQL'
{sql}
SQL
"""
    return ssh_run(remote)


def catalog_column_exists(table: str, column: str) -> dict[str, Any]:
    sql = f"""
BEGIN TRANSACTION READ ONLY;
SELECT column_name, udt_name, is_nullable, COALESCE(column_default, '')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='{table}' AND column_name='{column}';
ROLLBACK;
"""
    proc = ssh_psql_sql(sql)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    if not lines:
        return {"exists": False}
    parts = lines[0].split("|")
    if len(parts) >= 3:
        return {"exists": True, "type": parts[1], "nullable": parts[2], "default": parts[3] if len(parts) > 3 else None}
    return {"exists": False}


def table_exists(table: str) -> bool:
    sql = f"""
BEGIN TRANSACTION READ ONLY;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='{table}'
);
ROLLBACK;
"""
    proc = ssh_psql_sql(sql)
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return bool(lines and lines[0] == "t")


def local_db_fingerprint(db_name: str, dsn: str) -> dict[str, str]:
    p = urlparse(dsn)
    return {
        "database_name_fingerprint_sha256": hashlib.sha256(db_name.encode()).hexdigest(),
        "host_fingerprint_sha256": hashlib.sha256((p.hostname or "").encode()).hexdigest(),
    }
