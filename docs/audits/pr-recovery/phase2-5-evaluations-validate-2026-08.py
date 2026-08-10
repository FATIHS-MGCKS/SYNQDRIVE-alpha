#!/usr/bin/env python3
"""Consistency gates for the Phase 2.5 evaluations recovery package."""

from __future__ import annotations

import csv
import json
import subprocess
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
ADR_OUT = ROOT / "docs/architecture/decisions"


def read_csv(name: str) -> list[dict[str, str]]:
    with (OUT / name).open(newline="") as handle:
        return list(csv.DictReader(handle))


phase2 = json.loads((OUT / "phase2-unique-changesets-2026-08.json").read_text())
final = json.loads((OUT / "phase2-5-evaluations-final-changesets-2026-08.json").read_text())
changesets = final["changesets"]
residual_rows = read_csv("phase2-5-evaluations-residual-attribution-2026-08.csv")
changeset_rows = read_csv("phase2-5-evaluations-final-changesets-2026-08.csv")
package_rows = read_csv("phase2-5-evaluations-integration-packages-2026-08.csv")
ui_rows = read_csv("phase2-5-evaluations-ui-recovery-matrix-2026-08.csv")
current_main = subprocess.check_output(
    ["git", "rev-parse", "origin/main"], cwd=ROOT, text=True
).strip()

assert final["source_state"]["current_main_sha"] == current_main
assert final["source_state"]["phase2_main_sha"] == phase2["summary"]["current_main_sha"]
assert final["summary"]["original_phase2_evaluation_changesets"] == 43
assert len(changesets) == final["summary"]["final_evaluation_changesets_including_main_baselines"] == 44
assert sum(item["already_in_main"] for item in changesets) == 2
assert sum(item["needs_port"] for item in changesets) == 42
assert final["summary"]["remaining_unknown"] == 0
assert final["summary"]["accepted_adrs"] == 10
assert final["summary"]["open_architecture_decisions"] == 0
assert final["summary"]["ready_for_phase3"] is True
assert final["retired_changeset"] == "cs-evaluations-unresolved-residual"
assert all(item["changeset_id"] != final["retired_changeset"] for item in changesets)
assert all(item["confidence"] == "HIGH" for item in changesets)
assert all(item["package_id"] in {f"E{index}" for index in range(1, 9)} for item in changesets)
assert len({item["changeset_id"] for item in changesets}) == len(changesets)
assert len(changeset_rows) == len(changesets)

phase2_eval = [item for item in phase2["changesets"] if item["module"] == "evaluations"]
residual = next(item for item in phase2_eval if item["changeset_id"] == final["retired_changeset"])
residual_commits = set(residual["source_commits"])
residual_prs = set(residual["source_prs"])
assert {row["source_commit"] for row in residual_rows} == residual_commits
assert {int(row["source_pr"]) for row in residual_rows} == residual_prs
assert not any(row["classification"] == "UNKNOWN" for row in residual_rows)
assert not any(row["evaluation_relevant"] == "true" for row in residual_rows)
assert all(row["confidence"] in {"HIGH", "MEDIUM"} for row in residual_rows)
assert not any(row["confidence"] == "LOW" for row in residual_rows)
distinct_dispositions = {
    sha: next(row["classification"] for row in residual_rows if row["source_commit"] == sha)
    for sha in residual_commits
}
assert Counter(distinct_dispositions.values()) == {
    "INHERITED_NO_EVALUATIONS_RELEVANCE": 8,
    "SUPERSEDED": 9,
}
distinct_module_dispositions = {
    sha: next(row["module_disposition"] for row in residual_rows if row["source_commit"] == sha)
    for sha in residual_commits
}
assert Counter(distinct_module_dispositions.values()) == {
    "SUPERSEDED_BY_MAIN": 9,
    "REQUIRED_BUT_NEEDS_PORT": 3,
    "CONFLICTING_NEEDS_DESIGN_REVIEW": 5,
}
assert len({row["patch_id"] for row in residual_rows}) == len(residual_commits)
assert len({row["new_changeset"] for row in residual_rows if row["new_changeset"]}) == 7
assert not any(row["already_in_main"] == "true" for row in residual_rows)
assert not any(row["patch_equivalent"] == "true" for row in residual_rows)

adr_files = sorted(ADR_OUT.glob("ADR-evaluations-*.md"))
assert len(adr_files) == 10
decision_ids = set()
for path in adr_files:
    content = path.read_text()
    assert "- Status: `ACCEPTED`" in content
    assert "## Authority evidence" in content
    assert "## Decision" in content
    assert "## Open questions\n\nNone." in content
    marker = "- Decision ID: `"
    decision_id = content.split(marker, 1)[1].split("`", 1)[0]
    decision_ids.add(decision_id)
assert len(decision_ids) == 10
assert all(
    set(item["architecture_decisions"]) <= decision_ids
    for item in changesets
)

assert len(package_rows) == 8
assert [row["package_id"] for row in package_rows] == [f"E{index}" for index in range(1, 9)]
package_changesets = [
    changeset_id
    for row in package_rows
    for changeset_id in row["changesets"].split(";")
    if changeset_id
]
assert len(package_changesets) == len(set(package_changesets)) == len(changesets)
assert set(package_changesets) == {item["changeset_id"] for item in changesets}
orders = {row["package_id"]: int(row["order"]) for row in package_rows}
edges = []
for row in package_rows:
    for dependency in filter(None, row["dependencies"].split(";")):
        assert dependency in orders
        assert orders[dependency] < orders[row["package_id"]]
        edges.append((dependency, row["package_id"]))
    if row["risk"] in {"HIGH", "CRITICAL"}:
        assert row["required_tests"]
        assert row["rollback_strategy"]
        assert row["required_staging"] == "true"
    if row["database_changes"]:
        assert row["required_migration_dry_run"] == "true"
assert len(edges) == 17
assert next(row for row in package_rows if row["package_id"] == "E7")["feature_flag"] == "EVALUATIONS_PREDICTIVE_MODE=off"
assert next(row for row in package_rows if row["package_id"] == "E8")["required_vps"] == "true"

assert ui_rows
assert all(row["source_pr"] and row["source_commit"] for row in ui_rows)
assert not any(
    row["still_needed"] == "true" and row["file"].lower().endswith((".png", ".jpg", ".webp"))
    for row in ui_rows
)
action_center = next(item for item in changesets if item["capability"] == "Action Center")
assert action_center["integration_method"] == "RECONSTRUCT_MERGE_RESULT"
assert len(action_center["affected_files"]) < 100
assert len(action_center["source_commits"]) == 1
assert len(
    subprocess.check_output(
        ["git", "show", "-s", "--format=%P", action_center["source_commits"][0]],
        cwd=ROOT,
        text=True,
    ).split()
) == 2

runbook = (OUT / "phase2-5-evaluations-phase3-runbook-2026-08.md").read_text()
assert "Every PR targets `main`" in runbook
assert "do not create all package branches in parallel" in runbook
assert "EVALUATIONS_PREDICTIVE_MODE=off|shadow|on" in runbook
assert "Cross-tenant" in runbook or "cross-tenant" in runbook

authority = (OUT / "phase2-5-evaluations-architecture-authority-matrix-2026-08.md").read_text()
assert authority.count("`ACCEPTED`") == 10
assert "Book I–IV files" in authority
assert "No React-local KPI engine" in authority

executive = (OUT / "phase2-5-executive-summary-2026-08.md").read_text()
assert "**READY_FOR_PHASE_3**" in executive
assert "Remaining UNKNOWN: 0" in executive

required_package_columns = {
    "package_id", "package_name", "order", "changesets", "source_prs",
    "source_commits", "frontend_files", "backend_files", "database_changes",
    "worker_changes", "security_sensitive", "privacy_sensitive", "risk",
    "feature_flag", "dependencies", "integration_method", "required_tests",
    "required_migration_dry_run", "required_staging", "required_vps",
    "rollback_strategy", "entry_gate", "exit_gate", "confidence",
}
assert required_package_columns <= set(package_rows[0])

print(json.dumps({
    "current_main": current_main,
    "phase2_evaluation_changesets": len(phase2_eval),
    "final_changesets": len(changesets),
    "residual_commits": len(residual_commits),
    "residual_rows": len(residual_rows),
    "remaining_unknown": 0,
    "accepted_adrs": len(adr_files),
    "packages": len(package_rows),
    "package_edges": len(edges),
    "ui_rows": len(ui_rows),
    "status": "READY_FOR_PHASE_3",
}, sort_keys=True))
