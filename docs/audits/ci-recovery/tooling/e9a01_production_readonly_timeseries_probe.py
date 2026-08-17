#!/usr/bin/env python3
"""E9A.1 production read-only time-series probe via SSH (E8B0.1 mechanism)."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

SSH_KEY = Path.home() / ".ssh/id_ed25519"
SSH_HOST = __import__("os").environ.get("CLOUD_AGENT_VPS_HOST", "srv1374778.hstgr.cloud")
SSH_USER = "synqdrive-admin"
REMOTE = Path(__file__).resolve().parent / "e9a01_production_readonly_timeseries_remote.py"


def main() -> None:
    script = REMOTE.read_text(encoding="utf-8")
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=45",
        "-i",
        str(SSH_KEY),
        f"{SSH_USER}@{SSH_HOST}",
        "sudo python3 -",
    ]
    proc = subprocess.run(cmd, input=script, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        print(json.dumps({"ok": False, "productionProbe": {"status": "UNAVAILABLE", "stderr": proc.stderr[:800]}}))
        return
    print(proc.stdout.strip())


if __name__ == "__main__":
    main()
