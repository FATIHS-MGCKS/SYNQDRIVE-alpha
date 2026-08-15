#!/usr/bin/env python3
"""Orchestrate all CI-R3B1E validation gates."""
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
        ("R3B1E exposure normalization", [py, str(TOOLING / "ci_r3b1e_build_exposure.py")], False),
        ("R3B1E preexisting manifest", [py, str(TOOLING / "ci_r3b1e_build_preexisting_manifest.py")], False),
        ("R3B1E implementation authority", [py, str(TOOLING / "ci_r3b1e_build_implementation_authority.py")], False),
        ("R3B1E generate migrations", [py, str(TOOLING / "ci_r3b1e_generate_migrations.py")], False),
        ("R3B1E validate generated", [py, str(TOOLING / "ci_r3b1e_validate_generated.py")], False),
        ("R3B1E replay input manifest", [py, str(TOOLING / "ci_r3b1e_build_replay_input_manifest.py")], False),
        ("R3B1E targeted migration proof", [py, str(TOOLING / "ci_r3b1e_targeted_migration_proof.py")], True),
        ("R3B1E full replay", [py, str(TOOLING / "ci_r3b1e_full_replay_harness.py")], True),
        ("R3B1E migration manifest", [py, str(TOOLING / "ci_r3b1e_build_migration_manifest.py")], False),
        ("R3B1E generate report", [py, str(TOOLING / "ci_r3b1e_generate_report.py")], False),
    ]

    failures = []
    for label, cmd, use_pg in steps:
        code = run(label, cmd, env if use_pg else None)
        if code != 0:
            failures.append(label)
            if label in {"R3B1E validate generated", "R3B1E generate migrations"}:
                break
            if label == "R3B1E full replay":
                break

    if failures:
        print("FAIL:", failures)
        return 1
    print("PASS: all CI-R3B1E validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
