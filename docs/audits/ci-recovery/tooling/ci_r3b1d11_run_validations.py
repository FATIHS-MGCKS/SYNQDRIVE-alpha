#!/usr/bin/env python3
"""Run all CI-R3B1D.1.1 validation gates."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parent


def run(label: str, cmd: list[str]) -> int:
    print(f"\n=== {label} ===")
    proc = subprocess.run(cmd, cwd=TOOLING.parents[3])
    print(f"exit={proc.returncode}")
    return proc.returncode


def main() -> int:
    py = sys.executable
    env = os.environ.copy()
    if "R3B_PG_PORT" not in env:
        env["R3B_PG_PORT"] = "5433"

    steps = [
        ("R3B1D.1 build topology", [py, str(TOOLING / "ci_r3b1d1_build_topology.py")]),
        ("R3B1D.1 golden tests", [py, str(TOOLING / "ci_r3b1d1_golden_tests.py")]),
        ("R3B1D.1.1 build validation", [py, str(TOOLING / "ci_r3b1d11_build_validation.py")]),
        ("R3B1D.1.1 executable DDL proof", [py, str(TOOLING / "ci_r3b1d11_executable_ddl_proof.py")]),
        ("R3B1D.1.1 immutability audit", [py, str(TOOLING / "ci_r3b1d11_immutability_audit.py")]),
        ("R3B1D.1.1 generate report", [py, str(TOOLING / "ci_r3b1d11_generate_report.py")]),
        ("R3B1D.1.1 report consistency", [py, str(TOOLING / "ci_r3b1d11_report_consistency.py")]),
        ("R3B1D.1.1 golden tests", [py, str(TOOLING / "ci_r3b1d11_golden_tests.py")]),
    ]

    failures = []
    for label, cmd in steps:
        code = subprocess.run(cmd, cwd=TOOLING.parents[3], env=env).returncode
        print(f"{label}: exit {code}")
        if code != 0:
            failures.append(label)

    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1D.1.1 validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
