#!/usr/bin/env python3
"""Standalone, non-circular validator for the Phase 2.6 recovery model."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
ADR_OUT = ROOT / "docs/architecture/decisions"
sys.path.insert(0, str(OUT))

from phase2_6_evaluations_validation import active_edges, validate_model  # noqa: E402
from phase2_6_evaluations_validator_tests import run_negative_tests  # noqa: E402


model = json.loads(
    (OUT / "phase2-6-evaluations-normalized-model-2026-08.json").read_text()
)
current_main = subprocess.check_output(
    ["git", "rev-parse", "origin/main"], cwd=ROOT, text=True
).strip()
assert model["source_state"]["current_main_sha"] == current_main
assert len(model["changesets"]) == 44
assert len(model["packages"]) == 9
assert not model["platform_prerequisites"]

errors = validate_model(model)
negative = run_negative_tests(model)
assert not errors, errors
assert negative["failed"] == 0, negative

with (
    OUT / "phase2-6-evaluations-final-dependency-matrix-2026-08.csv"
).open(newline="") as handle:
    dependency_rows = list(csv.DictReader(handle))
with (
    OUT / "phase2-6-evaluations-final-package-matrix-2026-08.csv"
).open(newline="") as handle:
    package_rows = list(csv.DictReader(handle))
with (
    OUT / "phase2-6-evaluations-dependency-violations-2026-08.csv"
).open(newline="") as handle:
    violation_rows = list(csv.DictReader(handle))

assert len(package_rows) == len(model["packages"])
assert len(dependency_rows) == len(model["dependency_edges"])
assert all(row["status"] == "REPAIRED" for row in violation_rows)
assert all(
    row["valid_order"] in {"true", "REMOVED_NOT_APPLICABLE"}
    for row in dependency_rows
)
assert all(
    package["entry_gate"] and package["exit_gate"]
    for package in model["packages"]
)
assert all(
    package["required_tests"] and package["rollback_strategy"]
    for package in model["packages"]
    if package["risk"] in {"HIGH", "CRITICAL"}
)

adr_files = sorted(ADR_OUT.glob("ADR-evaluations-*.md"))
assert len(adr_files) == 10
for path in adr_files:
    content = path.read_text()
    assert "- Status: `ACCEPTED`" in content
    assert "## Decision" in content
    assert "## Open questions\n\nNone." in content

result = {
    "current_main": current_main,
    "changesets": len(model["changesets"]),
    "packages": len(model["packages"]),
    "active_edges": len(active_edges(model)),
    "changeset_cycles": len(model["changeset_graph"]["cycles"]),
    "package_cycles": len(model["package_graph"]["cycles"]),
    "platform_prerequisites": len(model["platform_prerequisites"]),
    "violations": len(violation_rows),
    "validator_errors": len(errors),
    "negative_tests_passed": negative["passed"],
    "negative_tests_total": negative["total"],
    "status": "READY_FOR_PHASE_3",
}
print(json.dumps(result, sort_keys=True))
