#!/usr/bin/env python3
import os, subprocess, sys
from pathlib import Path
TOOLING = Path(__file__).resolve().parent
REPO = TOOLING.parents[3]
py = sys.executable
env = os.environ.copy(); env.setdefault("R3B_PG_PORT", "5433")
for label, script in [
    ("closure", "ci_r3b1j1_run_closure.py"),
    ("golden", "ci_r3b1j1_golden_tests.py"),
    ("report", "ci_r3b1j1_generate_report.py"),
]:
    print(f"=== {label} ===")
    code = subprocess.run([py, str(TOOLING / script)], cwd=REPO, env=env).returncode
    if code != 0:
        raise SystemExit(code)
print("PASS")
