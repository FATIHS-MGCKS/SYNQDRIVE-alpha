#!/usr/bin/env python3
"""Orchestrate CI-R3B1I validation gates."""
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
    if "R3B_PG_PORT" not in env:
        env["R3B_PG_PORT"] = "5433"

    steps: list[tuple[str, list[str], bool]] = [
        ("R3B1I input provenance", [py, str(TOOLING / "ci_r3b1i_input_provenance.py")], False),
        ("R3B1I preexisting manifest", [py, str(TOOLING / "ci_r3b1i_preexisting_manifest.py")], False),
        ("R3B1I preflight actionable tests", [py, str(TOOLING / "ci_r3b1i_preflight_actionable_tests.py")], False),
        ("R3B1I lineage coverage", [py, str(TOOLING / "ci_r3b1i_lineage_coverage.py")], False),
        ("R3B1I preflight matrix", [py, str(TOOLING / "ci_r3b1i_build_preflight_matrix.py")], False),
        ("R3B1I preflight summary", [py, str(TOOLING / "ci_r3b1i_preflight_summary.py")], False),
        ("R3B1I SQL equivalence", [py, str(TOOLING / "ci_r3b1i_sql_equivalence.py")], False),
        ("R3B1I migration order proof", [py, str(TOOLING / "ci_r3b1i_migration_order_proof.py")], False),
        ("R3B1I replay input manifest", [py, str(TOOLING / "ci_r3b1i_replay_input_manifest.py")], False),
        ("R3B1I targeted IAM repair proof", [py, str(TOOLING / "ci_r3b1i_targeted_iam_repair_proof.py")], True),
        ("R3B1I full replay", [py, str(TOOLING / "ci_r3b1i_full_replay_harness.py")], True),
        ("R3B1I immutability audit", [py, str(TOOLING / "ci_r3b1i_immutability_audit.py")], False),
        ("R3B1I generate report", [py, str(TOOLING / "ci_r3b1i_generate_report.py")], False),
    ]

    failures = []
    for label, cmd, use_pg in steps:
        code = run(label, cmd, env if use_pg else None)
        if code != 0:
            failures.append(label)
            if label in {"R3B1I targeted IAM repair proof", "R3B1I full replay"}:
                break

    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1I validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
