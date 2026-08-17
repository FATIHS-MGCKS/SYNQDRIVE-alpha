#!/usr/bin/env python3
"""Ephemeral production read-only aggregate probe via SSH."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

SSH_KEY = Path.home() / ".ssh/id_ed25519"
SSH_HOST = os.environ.get("CLOUD_AGENT_VPS_HOST", "srv1374778.hstgr.cloud")
SSH_USER = (os.environ.get("CLOUD_AGENT_SSH_USER") or "synqdrive-admin").strip() or "synqdrive-admin"

REMOTE_SCRIPT = r"""set -euo pipefail
sudo python3 - <<'PY'
import json, re, subprocess, os
from urllib.parse import urlparse, parse_qs, unquote
text=open("/opt/synqdrive/shared/backend.env").read()
m=re.search(r"^DATABASE_URL=(.+)$", text, re.M)
if not m:
    print(json.dumps({"ok": False, "reason": "DATABASE_URL missing"})); raise SystemExit(0)
url=m.group(1).strip().strip('"').strip("'")
p=urlparse(url)
env=os.environ.copy()
if p.hostname: env["PGHOST"]=p.hostname
if p.port: env["PGPORT"]=str(p.port)
if p.username: env["PGUSER"]=unquote(p.username)
if p.password: env["PGPASSWORD"]=unquote(p.password)
db=(p.path or "").lstrip("/")
if db: env["PGDATABASE"]=db
sql = '''
SET default_transaction_read_only = on;
BEGIN;
SHOW transaction_read_only;
SELECT 'org_count|' || COUNT(DISTINCT organization_id)::text FROM organizations;
SELECT 'vehicle_count|' || COUNT(*)::text FROM vehicles;
SELECT 'service_case_count|' || COUNT(*)::text FROM service_cases;
SELECT 'earliest_opened|' || COALESCE(MIN(opened_at)::text, '') FROM service_cases;
SELECT 'latest_opened|' || COALESCE(MAX(opened_at)::text, '') FROM service_cases;
COMMIT;
'''
proc=subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], capture_output=True, text=True, env=env)
out={"ok": proc.returncode == 0, "exit": proc.returncode, "metrics": {}, "stderr": proc.stderr[:800]}
for line in (proc.stdout or "").strip().splitlines():
    line=line.strip()
    if line == "on":
        out["transaction_read_only"] = line
    elif "|" in line:
        k,v=line.split("|",1)
        out["metrics"][k]=v
print(json.dumps(out))
PY
"""


def main() -> None:
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=30",
        "-i",
        str(SSH_KEY),
        f"{SSH_USER}@{SSH_HOST}",
        "bash",
        "-s",
    ]
    proc = subprocess.run(cmd, input=REMOTE_SCRIPT, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        print(json.dumps({"ok": False, "ssh_exit": proc.returncode, "stderr": proc.stderr[:1000]}))
        return
    print(proc.stdout.strip())


if __name__ == "__main__":
    main()
