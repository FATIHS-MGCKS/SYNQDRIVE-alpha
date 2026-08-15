#!/usr/bin/env python3
"""Run all CI-R3B1D.1.2 validation gates including R3B1D.1.1 regression checks."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parent
REPO = TOOLING.parents[3]


def run_step(label: str, cmd: list[str], env: dict | None = None) -> int:
    print(f"\n=== {label} ===")
    proc = subprocess.run(cmd, cwd=REPO, env=env)
    print(f"{label}: exit {proc.returncode}")
    return proc.returncode


def main() -> int:
    py = sys.executable
    env = os.environ.copy()
    if "R3B_PG_PORT" not in env:
        env["R3B_PG_PORT"] = "5433"

    steps: list[tuple[str, list[str]]] = [
        ("R3B1D.1.1 build validation", [py, str(TOOLING / "ci_r3b1d11_build_validation.py")]),
        ("R3B1D.1.1 executable DDL proof", [py, str(TOOLING / "ci_r3b1d11_executable_ddl_proof.py")]),
        ("R3B1D.1.1 golden tests", [py, str(TOOLING / "ci_r3b1d11_golden_tests.py")]),
        ("R3B1D.1.2 build exposure", [py, str(TOOLING / "ci_r3b1d12_build_exposure.py")]),
        ("R3B1D.1.2 build authority reference", [py, str(TOOLING / "ci_r3b1d12_build_authority_reference.py")]),
        ("R3B1D.1.2 PostgreSQL catalog parity", [py, str(TOOLING / "ci_r3b1d12_postgresql_catalog_parity.py")]),
        ("R3B1D.1.2 immutability audit", [py, str(TOOLING / "ci_r3b1d12_immutability_audit.py")]),
        ("R3B1D.1.2 build final summary", [py, str(TOOLING / "ci_r3b1d12_build_final_summary.py")]),
        ("R3B1D.1.2 generate report", [py, str(TOOLING / "ci_r3b1d12_generate_report.py")]),
        ("R3B1D.1.2 report consistency", [py, str(TOOLING / "ci_r3b1d12_report_consistency.py")]),
        ("R3B1D.1.2 report consistency negative test", [py, str(TOOLING / "ci_r3b1d12_report_consistency.py"), "--negative-test"]),
        ("R3B1D.1.2 golden tests", [py, str(TOOLING / "ci_r3b1d12_golden_tests.py")]),
    ]

    failures = []
    for label, cmd in steps:
        use_env = env if "catalog parity" in label.lower() or "executable ddl" in label.lower() else None
        code = run_step(label, cmd, use_env)
        if code != 0:
            failures.append(label)

    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1D.1.2 validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
