#!/usr/bin/env python3
"""Run all CI-R3B1H.1 validation gates."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parent
REPO = TOOLING.parents[3]


def run_step(label: str, cmd: list[str], optional: bool = False) -> int:
    print(f"\n=== {label} ===")
    proc = subprocess.run(cmd, cwd=REPO)
    print(f"{label}: exit {proc.returncode}")
    if proc.returncode != 0 and optional:
        return 0
    return proc.returncode


def main() -> int:
    py = sys.executable
    pre249_db = "synqdrive_r3b1h1_pre249"
    proof_db = "synqdrive_r3b1h1_proof"
    steps = [
        ("R3B1H.1 alias fixtures", [py, str(TOOLING / "ci_r3b1h1_capture_alias_fixtures.py")]),
        ("R3B1H.1 golden tests", [py, str(TOOLING / "ci_r3b1h1_insert_select_golden_tests.py")]),
        ("R3B1H.1 insert-select matrix", [py, str(TOOLING / "ci_r3b1h1_build_insert_select_matrix.py")]),
        ("R3B1H.1 reconciliation", [py, str(TOOLING / "ci_r3b1h1_build_reconciliation.py")]),
        ("R3B1H.1 generic contracts", [py, str(TOOLING / "ci_r3b1h1_build_contracts.py")]),
        ("R3B1H.1 pre-249 replay", [py, str(TOOLING / "ci_r3b1h1_pre249_replay.py"), pre249_db]),
        ("R3B1H.1 targeted proof", [py, str(TOOLING / "ci_r3b1h1_targeted_proof.py"), pre249_db, proof_db]),
        ("R3B1H.1 actionable gap coverage", [py, str(TOOLING / "ci_r3b1h1_actionable_gap_coverage.py")]),
        ("R3B1H.1 lineage coverage", [py, str(TOOLING / "ci_r3b1h1_lineage_coverage_validator.py")]),
        ("R3B1H.1 coverage validator", [py, str(TOOLING / "ci_r3b1h1_coverage_validator.py")]),
        ("R3B1H.1 immutability audit", [py, str(TOOLING / "ci_r3b1h1_immutability_audit.py")]),
        ("R3B1H.1 final summary", [py, str(TOOLING / "ci_r3b1h1_build_final_summary.py")]),
        ("R3B1H.1 generate report", [py, str(TOOLING / "ci_r3b1h1_generate_report.py")]),
        ("R3B1H.1 report consistency", [py, str(TOOLING / "ci_r3b1h1_report_consistency.py")]),
    ]
    failures = []
    for label, cmd in steps:
        optional = "pre-249 replay" in label or "targeted proof" in label
        if run_step(label, cmd, optional=optional) != 0:
            failures.append(label)
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1H.1 validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
