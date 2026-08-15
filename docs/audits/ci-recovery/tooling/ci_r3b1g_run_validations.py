#!/usr/bin/env python3
"""Orchestrate all CI-R3B1G validation gates."""
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
        ("R3B1G evidence normalization", [py, str(TOOLING / "ci_r3b1g_build_evidence_normalization.py")], False),
        ("R3B1G preexisting manifest", [py, str(TOOLING / "ci_r3b1g_build_preexisting_manifest.py")], False),
        ("R3B1G implementation authority", [py, str(TOOLING / "ci_r3b1g_build_implementation_authority.py")], False),
        ("R3B1G generated SQL equivalence", [py, str(TOOLING / "ci_r3b1g_build_generated_sql_equivalence.py")], False),
        ("R3B1G migration order proof", [py, str(TOOLING / "ci_r3b1g_build_migration_order_proof.py")], False),
        ("R3B1G replay input manifest", [py, str(TOOLING / "ci_r3b1g_build_replay_input_manifest.py")], False),
        ("R3B1G targeted tire repair proof", [py, str(TOOLING / "ci_r3b1g_targeted_tire_repair_proof.py")], True),
        ("R3B1G full replay", [py, str(TOOLING / "ci_r3b1g_full_replay_harness.py")], True),
        ("R3B1G tire repair migration manifest", [py, str(TOOLING / "ci_r3b1g_build_tire_repair_migration_manifest.py")], False),
        ("R3B1G immutability audit", [py, str(TOOLING / "ci_r3b1g_immutability_audit.py")], False),
        ("R3B1G generate report", [py, str(TOOLING / "ci_r3b1g_generate_report.py")], False),
    ]

    failures = []
    for label, cmd, use_pg in steps:
        code = run(label, cmd, env if use_pg else None)
        if code != 0:
            failures.append(label)
            if label == "R3B1G targeted tire repair proof":
                break
            if label == "R3B1G full replay":
                break

    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1G validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
