#!/usr/bin/env python3
"""Automated consistency gates for the August 2026 Phase-2 recovery audit."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
phase1 = json.loads((OUT / "open-pr-inventory-2026-08.json").read_text())
phase2 = json.loads((OUT / "phase2-unique-changesets-2026-08.json").read_text())

phase1_prs = phase1["pull_requests"]
summary = phase2["summary"]
changesets = phase2["changesets"]
verification = phase2["verification_results"]
stack_tips = phase2["stack_tip_results"]
conflicts = phase2["conflicting_pr_results"]
docs = phase2["docs_only_results"]
protected = phase2["protection_lists"]["DO_NOT_CLOSE_PHASE1_PRS"]

assert len(phase1_prs) == 625
assert len({pr["pr_number"] for pr in phase1_prs}) == 625
assert summary["phase1_prs_revalidated"] == 625
assert not summary["changed_heads"] and not summary["changed_bases"]
assert len(verification) == 186
assert summary["safe_to_close_already_in_main"] == 181
assert summary["safe_to_close_patch_equivalent"] == 5
assert summary["phase1_classifications_corrected"] == 0
assert len(stack_tips) == summary["stack_tips_analyzed"] == 93
assert len(conflicts) == summary["standalone_conflicting_analyzed"] == 19
assert len(docs) == summary["docs_only_analyzed"] == 3
assert len(protected) == summary["do_not_close_phase1_prs"] == 439

active_prs = {
    pr["pr_number"]
    for pr in phase1_prs
    if pr["preliminary_classification"] != "ALREADY_IN_MAIN"
}
active_commits = {
    sha
    for pr in phase1_prs
    if pr["pr_number"] in active_prs
    for sha in pr["non_main_commit_shas"]
}
covered_commits = {sha for item in changesets for sha in item["source_commits"]}
covered_prs = {number for item in changesets for number in item["source_prs"]}
assert active_commits == covered_commits
assert active_prs <= covered_prs

for item in changesets:
    assert item["changeset_id"]
    assert item["source_prs"] and item["source_commits"]
    assert item["affected_files"]
    assert item["evidence"] and item["confidence"] in {"HIGH", "MEDIUM", "LOW"}
    assert item["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    if item["risk_level"] in {"HIGH", "CRITICAL"}:
        assert item["required_tests"]
        assert item["required_staging_validation"] == "Required"
        assert item["required_vps_validation"] == "Required after staging"
        assert item["rollback_strategy"]
    if item["security_impact"] == "SENSITIVE":
        assert any("tenant" in test.lower() or "rbac" in test.lower() for test in item["required_tests"])
    if item["tenant_isolation_impact"] == "SENSITIVE":
        assert item["risk_level"] in {"HIGH", "CRITICAL"}
        assert any("tenant" in test.lower() for test in item["required_tests"])
    if item["finance_impact"] == "SENSITIVE":
        assert item["risk_level"] in {"HIGH", "CRITICAL"}
        assert any("money" in test.lower() or "financial" in test.lower() for test in item["required_tests"])
    if item["migration_required"]:
        assert item["data_migration_impact"] == "REQUIRED"

expected_eval = {
    "Metric Registry", "Calculation Versioning", "Timezone / Period Model",
    "Unified KPI Contract", "Money Domain", "Money Migration", "Receivables", "Revenue / Cashflow / Result",
    "Multi-Currency", "Finance Test Suite", "Summary / Detail Separation", "Analytics Summary", "Grouping / Entity References", "Filter Architecture",
    "Tenant Isolation", "Analytics Contracts", "Cost Model", "Utilization",
    "Strength Detection", "Weakness Detection", "Driver / Influence Analysis",
    "Data Quality", "Freshness / Lineage", "Metric State UX", "Data Quality Panel",
    "Information Architecture", "Executive KPI Strip", "Strength / Weakness Cockpit",
    "Risk / Cost / Failure Visuals", "Mobile Readiness", "Accessibility / i18n",
    "Recommendation Domain", "Action Center", "Action Integrations",
    "Impact Measurement", "Predictive Analytics Architecture", "Feature Store",
    "Demand / Revenue / Utilization Forecast", "Maintenance / Failure Forecast",
    "Backtesting / Drift", "Forecast UX", "GDPR", "Roles / Permissions", "Audit Logging",
}
actual_eval = {item["capability"] for item in phase2["evaluations_capabilities"]}
assert actual_eval == expected_eval
status_counts = {}
for item in phase2["evaluations_capabilities"]:
    status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1
assert status_counts == {"EXACTLY_IN_MAIN": 2, "UNIQUE_REQUIRES_RECOVERY": 42}
assert all(len(item["source_prs"]) == len(item["source_commits"]) == 1 for item in phase2["evaluations_capabilities"])

expected_conflicts = {
    19: "SAFE_TO_IGNORE", 22: "PORT_REQUIRED", 23: "SUPERSEDED", 24: "PORT_REQUIRED",
    25: "SUPERSEDED", 31: "DESIGN_REVIEW_REQUIRED", 66: "DESIGN_REVIEW_REQUIRED",
    83: "SUPERSEDED", 84: "SECURITY_REVIEW_REQUIRED", 85: "SUPERSEDED",
    86: "PORT_REQUIRED", 87: "SUPERSEDED", 88: "DESIGN_REVIEW_REQUIRED",
    109: "SUPERSEDED", 118: "DOCS_ONLY", 121: "SUPERSEDED", 173: "SUPERSEDED",
    194: "DOCS_ONLY", 230: "DESIGN_REVIEW_REQUIRED",
}
assert {item["pr_number"]: item["classification"] for item in conflicts} == expected_conflicts
assert {item["pr_number"]: item["classification"] for item in docs} == {
    233: "ALREADY_REPRESENTED", 234: "ALREADY_REPRESENTED", 235: "ARCHIVE_ONLY",
}

wave_commits = [change_id for wave in phase2["waves"] for change_id in wave["changesets"]]
assert len(phase2["waves"]) == 7
assert len(wave_commits) == len(set(wave_commits)) == len(changesets)
assert set(wave_commits) == {item["changeset_id"] for item in changesets}

with (OUT / "phase2-safe-to-close-candidates-2026-08.csv").open(newline="") as handle:
    safe_rows = list(csv.DictReader(handle))
assert len(safe_rows) == summary["safe_to_close_candidates"] == 186
assert all(row["confidence"] == "HIGH" for row in safe_rows)

with (OUT / "phase2-unique-changesets-2026-08.csv").open(newline="") as handle:
    changeset_rows = list(csv.DictReader(handle))
assert len(changeset_rows) == summary["unique_changesets"] == len(changesets)
required_columns = {
    "changeset_id", "module", "capability", "source_prs", "source_commits",
    "affected_files_count", "affected_files", "current_relevance", "classification",
    "dependencies", "risk_level", "migration_required", "security_sensitive",
    "privacy_sensitive", "frontend_change", "backend_change", "worker_change",
    "tenant_sensitive", "finance_sensitive", "infra_change", "conflict_expected", "recommended_integration_method",
    "required_tests", "required_staging_validation", "required_vps_validation",
    "confidence", "evidence",
}
assert required_columns <= set(changeset_rows[0])

print(json.dumps({
    "phase1_prs": len(phase1_prs),
    "verification_candidates": len(verification),
    "stack_tips": len(stack_tips),
    "standalone_conflicts": len(conflicts),
    "docs_only": len(docs),
    "unique_commits_covered": len(covered_commits),
    "changesets": len(changesets),
    "safe_to_close": len(safe_rows),
    "protected_prs": len(protected),
    "evaluation_capabilities": len(actual_eval),
}, sort_keys=True))
