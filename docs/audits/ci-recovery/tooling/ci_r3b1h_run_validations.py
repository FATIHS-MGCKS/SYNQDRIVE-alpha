#!/usr/bin/env python3
"""Run all CI-R3B1H validation gates."""
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
    pre249_db = "synqdrive_r3b1h_pre249"
    proof_db = "synqdrive_r3b1h_proof"
    steps = [
        ("R3B1H golden tests", [py, str(TOOLING / "ci_r3b1h_insert_select_golden_tests.py")]),
        ("R3B1H pre-249 replay", [py, str(TOOLING / "ci_r3b1h_pre249_replay.py"), pre249_db]),
        ("R3B1H catalog snapshot", [py, str(TOOLING / "ci_r3b1h_build_catalog_snapshot.py"), pre249_db]),
        ("R3B1H insert-select matrix 249→HEAD", [py, str(TOOLING / "ci_r3b1h_build_insert_select_matrix.py")]),
        ("R3B1H IAM gap matrix", [py, str(TOOLING / "ci_r3b1h_build_gap_matrix.py")]),
        ("R3B1H contracts/topology", [py, str(TOOLING / "ci_r3b1h_build_contracts.py")]),
        ("R3B1H targeted proof", [py, str(TOOLING / "ci_r3b1h_targeted_proof.py"), pre249_db, proof_db]),
        ("R3B1H coverage validator", [py, str(TOOLING / "ci_r3b1h_coverage_validator.py")]),
        ("R3B1H immutability audit", [py, str(TOOLING / "ci_r3b1h_immutability_audit.py")]),
        ("R3B1H final summary", [py, str(TOOLING / "ci_r3b1h_build_final_summary.py")]),
        ("R3B1H generate report", [py, str(TOOLING / "ci_r3b1h_generate_report.py")]),
        ("R3B1H report consistency", [py, str(TOOLING / "ci_r3b1h_report_consistency.py")]),
    ]
    failures = []
    for label, cmd in steps:
        if run_step(label, cmd) != 0:
            failures.append(label)
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1H validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
