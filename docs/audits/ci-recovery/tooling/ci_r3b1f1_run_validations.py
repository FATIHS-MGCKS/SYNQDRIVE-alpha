#!/usr/bin/env python3
"""Run all CI-R3B1F.1 validation gates."""
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
    db = "synqdrive_r3b1f1_pre157"
    steps = [
        ("R3B1F.1 creator regression", [py, str(TOOLING / "ci_r3b1f1_creator_regression.py")]),
        ("R3B1F.1 contract validator tests", [py, str(TOOLING / "ci_r3b1f1_contract_validator_tests.py")]),
        ("R3B1F.1 expression matrix", [py, str(TOOLING / "ci_r3b1f1_build_expression_matrix.py")]),
        ("R3B1F.1 defect reclassification", [py, str(TOOLING / "ci_r3b1f1_build_defect_reclassification.py")]),
        ("R3B1F.1 pre-157 replay", [py, str(TOOLING / "ci_r3b1f1_pre157_replay.py"), db]),
        ("R3B1F.1 catalog snapshot", [py, str(TOOLING / "ci_r3b1f1_build_catalog_snapshot.py"), db]),
        ("R3B1F.1 contracts/topology", [py, str(TOOLING / "ci_r3b1f1_build_contracts.py")]),
        ("R3B1F.1 targeted proof", [py, str(TOOLING / "ci_r3b1f1_targeted_proof.py"), db]),
        ("R3B1F.1 coverage validator", [py, str(TOOLING / "ci_r3b1f1_coverage_validator.py")]),
        ("R3B1F.1 immutability audit", [py, str(TOOLING / "ci_r3b1f1_immutability_audit.py")]),
        ("R3B1F.1 final summary", [py, str(TOOLING / "ci_r3b1f1_build_final_summary.py")]),
        ("R3B1F.1 generate report", [py, str(TOOLING / "ci_r3b1f1_generate_report.py")]),
        ("R3B1F.1 report consistency", [py, str(TOOLING / "ci_r3b1f1_report_consistency.py")]),
    ]
    failures = []
    for label, cmd in steps:
        if run_step(label, cmd) != 0:
            failures.append(label)
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1F.1 validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
