#!/usr/bin/env python3
"""Run all CI-R3B1F validation gates."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parent
REPO = TOOLING.parents[3]


def run_step(label: str, cmd: list[str]) -> int:
    print(f"\n=== {label} ===")
    proc = subprocess.run(cmd, cwd=REPO)
    print(f"{label}: exit {proc.returncode}")
    return proc.returncode


def main() -> int:
    py = sys.executable
    steps = [
        ("R3B1F runtime semantics correction", [py, str(TOOLING / "ci_r3b1f_build_runtime_semantics_correction.py")]),
        ("R3B1F pre-157 replay", [py, str(TOOLING / "ci_r3b1f_pre157_replay.py")]),
        ("R3B1F catalog snapshot", [py, str(TOOLING / "ci_r3b1f_build_catalog_snapshot.py")]),
        ("R3B1F gap matrix", [py, str(TOOLING / "ci_r3b1f_build_gap_matrix.py")]),
        ("R3B1F expression matrix", [py, str(TOOLING / "ci_r3b1f_build_expression_matrix.py")]),
        ("R3B1F contracts/topology", [py, str(TOOLING / "ci_r3b1f_build_contracts_topology.py")]),
        ("R3B1F targeted simulation", [py, str(TOOLING / "ci_r3b1f_targeted_simulation.py")]),
        ("R3B1F golden tests", [py, str(TOOLING / "ci_r3b1f_golden_tests.py")]),
        ("R3B1F coverage validator", [py, str(TOOLING / "ci_r3b1f_coverage_validator.py")]),
        ("R3B1F immutability audit", [py, str(TOOLING / "ci_r3b1f_immutability_audit.py")]),
        ("R3B1F validation summary", [py, str(TOOLING / "ci_r3b1f_build_validation_summary.py")]),
        ("R3B1F generate report", [py, str(TOOLING / "ci_r3b1f_generate_report.py")]),
    ]
    failures = []
    for label, cmd in steps:
        if run_step(label, cmd) != 0:
            failures.append(label)
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1F validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
