#!/usr/bin/env python3
"""Run all CI-R3B1H.1.1 validation gates."""
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
    pre249_db = "synqdrive_r3b1h111_pre249"
    proof_db = "synqdrive_r3b1h111_proof"
    steps = [
        ("cache discipline", [py, str(TOOLING / "ci_r3b1h111_cache_discipline.py")]),
        ("matrix 249→HEAD", [py, str(TOOLING / "ci_r3b1h111_build_insert_select_matrix.py")]),
        ("migration249 reconciliation", [py, str(TOOLING / "ci_r3b1h111_migration249_reconciliation.py")]),
        ("generic contracts", [py, str(TOOLING / "ci_r3b1h111_build_contracts.py")]),
        ("lineage coverage", [py, str(TOOLING / "ci_r3b1h111_lineage_coverage.py")]),
        ("completion gate tests", [py, str(TOOLING / "ci_r3b1h111_completion_gate_tests.py")]),
        ("golden tests", [py, str(TOOLING / "ci_r3b1h111_golden_tests.py")]),
        ("pre-249 replay", [py, str(TOOLING / "ci_r3b1h111_pre249_replay.py"), pre249_db]),
        ("targeted proof", [py, str(TOOLING / "ci_r3b1h111_targeted_proof.py"), pre249_db, proof_db]),
        ("actionable gap coverage", [py, str(TOOLING / "ci_r3b1h111_actionable_gap_coverage.py")]),
        ("immutability audit", [py, str(TOOLING / "ci_r3b1h111_immutability_audit.py")]),
        ("final summary", [py, str(TOOLING / "ci_r3b1h111_build_final_summary.py")]),
        ("generate report", [py, str(TOOLING / "ci_r3b1h111_generate_report.py")]),
        ("report consistency", [py, str(TOOLING / "ci_r3b1h111_report_consistency.py")]),
        ("cache discipline post-test", [py, str(TOOLING / "ci_r3b1h111_cache_discipline.py")]),
    ]
    failures = []
    for label, cmd in steps:
        if run_step(label, cmd) != 0:
            failures.append(label)
    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1H.1.1 validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
