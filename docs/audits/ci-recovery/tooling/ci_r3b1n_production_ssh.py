"""Read-only production probes via SSH (no secrets in output)."""
from __future__ import annotations

import json
import shlex
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1n_constants import PROD_DB, SSH_HOST, SSH_KEY, SSH_USER


def ssh_run(remote_script: str, *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
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
        f"{SSH_USER}@{SSH_HOST}",
        "bash",
        "-s",
    ]
    return subprocess.run(cmd, input=remote_script, capture_output=True, text=True, timeout=timeout)


def ssh_psql_sql(sql: str, *, tuples_only: bool = False, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    flags = "-t -A" if tuples_only else ""
    remote = f"""set -euo pipefail
sudo -u postgres psql -d {PROD_DB} -v ON_ERROR_STOP=1 {flags} <<'SQL'
{sql}
SQL
"""
    return ssh_run(remote, timeout=timeout)


def collect_deployed_revision() -> dict[str, Any]:
    remote = r"""set -euo pipefail
echo '===JSON_START==='
python3 - <<'PY'
import json, subprocess
out={}
out['current_symlink']=subprocess.check_output(['readlink','-f','/opt/synqdrive/current'], text=True).strip()
try:
    out['git_head']=subprocess.check_output(['sudo','git','-C','/opt/synqdrive/current','rev-parse','HEAD'], text=True).strip()
    log=subprocess.check_output(['sudo','git','-C','/opt/synqdrive/current','log','-1','--format=%H|%ci|%s'], text=True).strip().split('|',2)
    out['git_log']={'sha':log[0],'date':log[1],'subject':log[2]}
    out['git_branch']=subprocess.check_output(['sudo','git','-C','/opt/synqdrive/current','rev-parse','--abbrev-ref','HEAD'], text=True).strip()
except Exception as e:
    out['git_error']=str(e)
try:
    pm2=json.loads(subprocess.check_output(['sudo','pm2','jlist'], text=True))
    for x in pm2:
        if x.get('name')=='synqdrive':
            e=x.get('pm2_env',{})
            out['pm2']={'pm_cwd':e.get('pm_cwd'), 'status':e.get('status'), 'pm_exec_path':e.get('pm_exec_path')}
except Exception as e:
    out['pm2_error']=str(e)
try:
    out['health_local']=subprocess.check_output(['curl','-sf','http://127.0.0.1:3001/api/v1/health'], text=True).strip()[:500]
except Exception:
    out['health_local']=None
print(json.dumps(out))
PY
echo '===JSON_END==='"""
    proc = ssh_run(remote)
    text = proc.stdout or proc.stderr
    start = text.find("===JSON_START===")
    end = text.find("===JSON_END===")
    payload = {}
    if start >= 0 and end > start:
        payload = json.loads(text[start + len("===JSON_START===") : end].strip())
    return {"exit_code": proc.returncode, "payload": payload, "stderr": proc.stderr}


def export_prisma_ledger() -> list[dict[str, Any]]:
    proc = ssh_run(
        f"""set -euo pipefail
sudo -u postgres psql -d {PROD_DB} -v ON_ERROR_STOP=1 -At -c "COPY (SELECT id, migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at) TO STDOUT WITH CSV HEADER;"
"""
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
    if not lines:
        return []
    headers = lines[0].split(",")
    rows = []
    for line in lines[1:]:
        parts = line.split(",")
        rows.append(dict(zip(headers, parts)))
    return rows


def collect_db_identity() -> dict[str, Any]:
    sql = """
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1000ms';
SHOW transaction_read_only;
SELECT version();
SELECT current_database();
SELECT pg_is_in_recovery();
SELECT pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT');
ROLLBACK;
"""
    proc = ssh_psql_sql(sql, tuples_only=True)
    lines = [
        ln
        for ln in (proc.stdout or "").splitlines()
        if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}
    ]
    tx_read_only = lines[0] if len(lines) > 0 else None
    pg_version = lines[1][:160] if len(lines) > 1 else None
    current_db = lines[2] if len(lines) > 2 else None
    in_recovery = lines[3] if len(lines) > 3 else None
    return {
        "exit_code": proc.returncode,
        "transaction_read_only": tx_read_only,
        "postgres_version_line": pg_version,
        "current_database_name": current_db,
        "pg_is_in_recovery": in_recovery,
        "pass": proc.returncode == 0 and tx_read_only == "on" and current_db == PROD_DB,
    }


def collect_db_env_fingerprint() -> dict[str, Any]:
    remote = r"""set -euo pipefail
sudo python3 - <<'PY'
import hashlib, json, re
from urllib.parse import urlparse
text=open('/opt/synqdrive/shared/backend.env').read()
m=re.search(r'^DATABASE_URL=(.+)$', text, re.M)
if not m:
    print(json.dumps({'bound': False, 'reason': 'DATABASE_URL missing'})); raise SystemExit(0)
url=m.group(1).strip().strip('"').strip("'")
p=urlparse(url)
print(json.dumps({
  'bound': True,
  'host_fingerprint_sha256': hashlib.sha256((p.hostname or '').encode()).hexdigest(),
  'port': p.port or 5432,
  'database_name_fingerprint_sha256': hashlib.sha256((p.path.lstrip('/') or '').encode()).hexdigest(),
  'database_name_length': len(p.path.lstrip('/') or ''),
  'uses_localhost': (p.hostname or '') in ('127.0.0.1','localhost'),
  'service_env_matches_production_db_name': (p.path.lstrip('/') or '') == 'synqdrive',
}))
PY"""
    proc = ssh_run(remote)
    return json.loads((proc.stdout or "{}").strip() or "{}")
