#!/usr/bin/env python3
"""Orchestrate CI-R3B1J authority validation gates."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parent
REPO = TOOLING.parents[3]


def run(label: str, cmd: list[str], env: dict | None = None) -> int:
    print(f"\n=== {label} ===")
    proc = subprocess.run(cmd, cwd=REPO, env=env)
    print(f"{label}: exit {proc.returncode}")
    return proc.returncode


def main() -> int:
    py = sys.executable
    env = os.environ.copy()
    env.setdefault("R3B_PG_PORT", "5433")
    steps = [
        ("R3B1J authority analysis", [py, str(TOOLING / "ci_r3b1j_run_authority.py")], True),
        ("R3B1J golden tests", [py, str(TOOLING / "ci_r3b1j_golden_tests.py")], True),
        ("R3B1J generate report", [py, str(TOOLING / "ci_r3b1j_generate_report.py")], False),
    ]
    failures = []
    for label, cmd, use_pg in steps:
        if run(label, cmd, env if use_pg else None) != 0:
            failures.append(label)
            break
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1J validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
