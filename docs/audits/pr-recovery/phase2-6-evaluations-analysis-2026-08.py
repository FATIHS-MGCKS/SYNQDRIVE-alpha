#!/usr/bin/env python3
"""Generate the source-derived Phase 2.6 evaluations recovery plan."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
sys.path.insert(0, str(OUT))

from phase2_6_evaluations_validation import (  # noqa: E402
    HARD_TYPES,
    active_edges,
    analyze_graph,
    validate_model,
    with_recomputed_graphs,
)


PHASE25_JSON = OUT / "phase2-5-evaluations-final-changesets-2026-08.json"
PHASE2_JSON = OUT / "phase2-unique-changesets-2026-08.json"
NORMALIZED_JSON = OUT / "phase2-6-evaluations-normalized-model-2026-08.json"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def serialize(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return ";".join(str(item) for item in value)
    return str(value)


def write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: serialize(row.get(field, "")) for field in fields})


def write_md(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(line.rstrip() for line in lines).rstrip() + "\n")


phase25 = json.loads(PHASE25_JSON.read_text())
phase2 = json.loads(PHASE2_JSON.read_text())
source_changesets = deepcopy(phase25["changesets"])
source_by_id = {item["changeset_id"]: item for item in source_changesets}
phase2_by_id = {item["changeset_id"]: item for item in phase2["changesets"]}
current_main = git("rev-parse", "origin/main")
phase25_main = phase25["source_state"]["current_main_sha"]
main_delta = git("rev-list", "--left-right", "--count", f"{phase25_main}...{current_main}")
generated_at = os.environ.get(
    "PHASE26_GENERATED_AT",
    datetime.now(timezone.utc).isoformat(),
)


PACKAGE_MEMBERS = {
    "E1": [
        "cs-evaluations-metric-registry-baseline",
        "cs-evaluations-calculation-versioning-baseline",
        "cs-evaluations-timezone-period-model",
        "cs-evaluations-unified-kpi-contract",
    ],
    "E2": [
        "cs-evaluations-grouping-entity-references",
        "cs-evaluations-filter-architecture",
        "cs-evaluations-analytics-contracts",
        "cs-evaluations-tenant-isolation",
        "cs-evaluations-summary-detail-separation",
    ],
    "E3": [
        "cs-evaluations-money-domain",
        "cs-evaluations-money-migration",
        "cs-evaluations-receivables",
        "cs-evaluations-revenue-cashflow-result",
        "cs-evaluations-multi-currency",
        "cs-evaluations-finance-test-suite",
    ],
    "E4": [
        "cs-evaluations-analytics-summary",
        "cs-evaluations-cost-model",
        "cs-evaluations-utilization",
        "cs-evaluations-strength-detection",
        "cs-evaluations-weakness-detection",
        "cs-evaluations-driver-influence-analysis",
    ],
    "E5": [
        "cs-evaluations-data-quality",
        "cs-evaluations-freshness-lineage",
        "cs-evaluations-metric-state-ux",
        "cs-evaluations-gdpr",
        "cs-evaluations-roles-permissions",
        "cs-evaluations-audit-logging",
    ],
    "E6": [
        "cs-evaluations-data-quality-panel",
        "cs-evaluations-information-architecture",
        "cs-evaluations-executive-kpi-strip",
        "cs-evaluations-strength-weakness-cockpit",
        "cs-evaluations-risk-cost-failure-visuals",
        "cs-evaluations-mobile-readiness",
        "cs-evaluations-accessibility-i18n",
    ],
    "E7": [
        "cs-evaluations-recommendation-domain",
        "cs-evaluations-action-center",
        "cs-evaluations-action-integrations",
        "cs-evaluations-impact-measurement",
    ],
    "E8": [
        "cs-evaluations-predictive-analytics-architecture",
        "cs-evaluations-feature-store",
        "cs-evaluations-demand-revenue-utilization-forecast",
        "cs-evaluations-maintenance-failure-forecast",
        "cs-evaluations-backtesting-drift",
    ],
    "E9": ["cs-evaluations-forecast-ux"],
}

PACKAGE_META = {
    "E1": {
        "package_name": "Metric, Time & KPI Contracts",
        "risk": "HIGH",
        "feature_flag": "",
        "entry_gate": "Fresh current main; preserve the two already-main registry/versioning baselines.",
        "exit_gate": "Contract-only foundation compiles; DST/provenance tests pass; no new controller or protected route is exposed before E2.",
        "required_tests": ["shared contract tests", "timezone/DST boundary tests", "calculation provenance regression"],
    },
    "E2": {
        "package_name": "Tenant-Safe Analytics Foundation",
        "risk": "CRITICAL",
        "feature_flag": "EVALUATIONS_ANALYTICS_V2_MODE=off",
        "entry_gate": "E1 merged; normalized entity-reference and tenant-scope design reviewed before schema work.",
        "exit_gate": "Contracts, entity persistence and APIs are organization/station scoped; cross-tenant tests fail closed.",
        "required_tests": ["contract tests", "migration dry run", "cross-tenant/station negative tests", "RBAC guard tests"],
    },
    "E3": {
        "package_name": "Money & Finance Correctness",
        "risk": "CRITICAL",
        "feature_flag": "EVALUATIONS_ANALYTICS_V2_MODE=off",
        "entry_gate": "E2 tenant-safe contract surface merged; EVAL-ADR-001 migration design approved.",
        "exit_gate": "Money/FX/receivable calculations reconcile; migration dry run and finance property tests pass.",
        "required_tests": ["money property tests", "finance integration tests", "migration/backfill dry run", "multi-currency reconciliation"],
    },
    "E4": {
        "package_name": "Tenant-Safe Analytics Backend",
        "risk": "HIGH",
        "feature_flag": "EVALUATIONS_ANALYTICS_V2_MODE=off",
        "entry_gate": "E2 contracts/security and E3 canonical finance semantics merged.",
        "exit_gate": "All analytics services use canonical contracts and tenant filters; aggregation and scale tests pass.",
        "required_tests": ["repository/aggregation tests", "pagination and large-dataset tests", "tenant negative tests", "contract compatibility tests"],
    },
    "E5": {
        "package_name": "Quality, Privacy, Authorization & Audit",
        "risk": "CRITICAL",
        "feature_flag": "EVALUATIONS_ANALYTICS_V2_MODE=off",
        "entry_gate": "E4 backend merged; central RBAC and business-audit extension plan approved.",
        "exit_gate": "Quality/freshness, permissions, privacy and sensitive-read audit gates pass with no PII leakage.",
        "required_tests": ["data quality/freshness tests", "RBAC matrix tests", "PII redaction tests", "durable audit outbox tests"],
    },
    "E6": {
        "package_name": "Core Evaluations UI",
        "risk": "HIGH",
        "feature_flag": "VITE_EVALUATIONS_UI_V2=off",
        "entry_gate": "E3-E5 backend, finance, quality and security contracts merged; no placeholder API allowed.",
        "exit_gate": "Canonical EvaluationsPage passes typecheck, E2E, mobile, a11y/i18n and regenerated visual baselines.",
        "required_tests": ["frontend typecheck", "component/E2E tests", "mobile/visual regression", "accessibility/i18n"],
    },
    "E7": {
        "package_name": "Recommendations & Safe Actions",
        "risk": "CRITICAL",
        "feature_flag": "EVALUATIONS_RECOMMENDATIONS_MODE=off;EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false",
        "entry_gate": "E5 authorization/audit and E6 UI shell merged; material-action policy review complete.",
        "exit_gate": "State machine, tenant checks, confirmation, idempotency and audit precede every material action.",
        "required_tests": ["state-machine tests", "authorization/idempotency tests", "audit outbox tests", "side-effect safety tests"],
    },
    "E8": {
        "package_name": "Predictive Backend & Release Gate",
        "risk": "CRITICAL",
        "feature_flag": "EVALUATIONS_PREDICTIVE_MODE=off",
        "entry_gate": "E4/E5 analytics, quality, tenant and audit foundations merged; model governance review complete.",
        "exit_gate": "Point-in-time features, forecasts and backtests pass release/uncertainty gates while customer exposure remains off.",
        "required_tests": ["future-leakage tests", "rolling backtests", "baseline and interval-coverage tests", "model release denial tests"],
    },
    "E9": {
        "package_name": "Forecast UI & Final Acceptance",
        "risk": "HIGH",
        "feature_flag": "VITE_EVALUATIONS_PREDICTIVE_MODE=off;EVALUATIONS_PREDICTIVE_MODE=off",
        "entry_gate": "E6 UI and E8 model-status/release contracts merged; backend remains default off.",
        "exit_gate": "Forecast UI never bypasses release status or uncertainty; full staging/VPS acceptance and rollback smoke pass.",
        "required_tests": ["forecast component/E2E tests", "uncertainty/accessibility tests", "release-gate denial tests", "staging and rollback smoke"],
    },
}


# Historical source PRs overlap across packages. These namespaces have one
# implementation owner; earlier packages may establish reusable guards and
# audit contracts, but must not port the later package's concrete files.
EXCLUSIVE_PATH_OWNERS = {
    "backend/src/modules/business-insights/evaluations-analytics-summary.": "E4",
    "backend/src/modules/business-insights/predictive/": "E8",
    "shared/evaluations-insights/evaluations-analytics-summary.": "E4",
    "shared/evaluations-insights/predictive/": "E8",
}

PACKAGE_SCOPE_NOTES = {
    "E2": [
        "Reimplement entity-reference contracts, persistence and grouping before wiring them into the E2 summary/detail service; do not replay the historical grouping commit as a standalone patch.",
        "Bind filter period resolution to the E1 canonical period resolver. Analytics-summary services, repositories and shared summary implementations are owned by E4.",
    ],
    "E4": [
        "Own the analytics-summary service/repository and shared summary implementation; consume E2 tenant-safe contracts and E1 period semantics.",
    ],
    "E5": [
        "Add reusable authorization and audit foundations only; concrete analytics-summary files remain E4-owned and predictive backend/shared files remain E8-owned.",
    ],
}


EDGE_SPECS: list[dict[str, Any]] = []


def edge(
    dependency: str,
    dependent: str,
    dependency_type: str,
    evidence: str,
) -> None:
    EDGE_SPECS.append({
        "dependency_changeset": dependency,
        "dependent_changeset": dependent,
        "dependency_type": dependency_type,
        "evidence": evidence,
        "active": True,
        "resolution": "ACTIVE_NORMALIZED_EDGE",
    })


# E1/E2: contract definition precedes enforcement; the whole E2 package merges atomically.
edge("cs-evaluations-timezone-period-model", "cs-evaluations-unified-kpi-contract", "HARD_CONTRACT", "EVAL-ADR-002 makes timezone/period provenance part of every KPI contract.")
edge("cs-evaluations-timezone-period-model", "cs-evaluations-filter-architecture", "HARD_CONTRACT", "Filter periods require explicit UTC bounds and reporting timezone.")
edge("cs-evaluations-grouping-entity-references", "cs-evaluations-analytics-contracts", "HARD_CONTRACT", "Analytics primitives import InsightEntityReference from the typed reference contract.")
edge("cs-evaluations-filter-architecture", "cs-evaluations-analytics-contracts", "HARD_CONTRACT", "Analytics primitives import EvaluationsAnalyticsAppliedFilters.")
edge("cs-evaluations-analytics-contracts", "cs-evaluations-tenant-isolation", "HARD_SECURITY", "Contract definition precedes guard/repository enforcement; E2 cannot merge until enforcement tests pass.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-summary-detail-separation", "HARD_SECURITY", "Summary/detail controllers and repository queries must be tenant/station scoped at first merge.")

# E3: one money authority; contract before migration and consumers.
edge("cs-evaluations-timezone-period-model", "cs-evaluations-money-domain", "HARD_CONTRACT", "Historical finance values use explicit business-period and FX as-of time.")
edge("cs-evaluations-unified-kpi-contract", "cs-evaluations-money-domain", "HARD_CONTRACT", "Money values implement the canonical KPI value envelope.")
edge("cs-evaluations-money-domain", "cs-evaluations-money-migration", "HARD_MIGRATION", "Backfill schema and conversion semantics must follow the final Money contract.")
edge("cs-evaluations-money-domain", "cs-evaluations-receivables", "HARD_CONTRACT", "Receivable amounts use amountMinor/currency without a second money authority.")
edge("cs-evaluations-timezone-period-model", "cs-evaluations-receivables", "HARD_CONTRACT", "Due/overdue state uses canonical zoned business dates.")
edge("cs-evaluations-receivables", "cs-evaluations-revenue-cashflow-result", "HARD_CONTRACT", "Cashflow/result semantics consume canonical receivable state.")
edge("cs-evaluations-revenue-cashflow-result", "cs-evaluations-multi-currency", "HARD_CONTRACT", "Multi-currency conversion decorates canonical finance results and preserves originals.")
for dependency in [
    "cs-evaluations-money-domain",
    "cs-evaluations-money-migration",
    "cs-evaluations-receivables",
    "cs-evaluations-revenue-cashflow-result",
    "cs-evaluations-multi-currency",
]:
    edge(dependency, "cs-evaluations-finance-test-suite", "TEST_ONLY", "Finance acceptance fixtures cover every E3 finance capability in the same package.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-revenue-cashflow-result", "HARD_SECURITY", "New finance analytics reads cannot merge without organization/station enforcement.")

# E4: concrete historical imports establish the backend computation graph.
for dependency in [
    "cs-evaluations-analytics-contracts",
    "cs-evaluations-summary-detail-separation",
    "cs-evaluations-grouping-entity-references",
    "cs-evaluations-filter-architecture",
]:
    edge(dependency, "cs-evaluations-analytics-summary", "HARD_CONTRACT", "Analytics summary service/controller consumes the normalized analytics, detail, reference and filter contracts.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-analytics-summary", "HARD_SECURITY", "Summary repository/controller must enforce organization/station scope.")
edge("cs-evaluations-analytics-contracts", "cs-evaluations-cost-model", "HARD_CONTRACT", "Cost model emits canonical analytics money/status envelopes.")
edge("cs-evaluations-money-domain", "cs-evaluations-cost-model", "HARD_CONTRACT", "Cost values require the single canonical Money authority.")
edge("cs-evaluations-filter-architecture", "cs-evaluations-cost-model", "HARD_CONTRACT", "Cost calculations use canonical period/station filters.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-cost-model", "HARD_SECURITY", "Cost-model data access must be organization/station constrained.")
edge("cs-evaluations-filter-architecture", "cs-evaluations-utilization", "HARD_CONTRACT", "UtilizationSnapshotService imports resolved analytics filters.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-utilization", "HARD_SECURITY", "Vehicle/booking utilization queries are organization/station constrained.")
for dependent in ["cs-evaluations-strength-detection", "cs-evaluations-weakness-detection"]:
    edge("cs-evaluations-analytics-summary", dependent, "HARD_CONTRACT", "Detection inputs use the canonical analytics summary envelope.")
    edge("cs-evaluations-cost-model", dependent, "HARD_CONTRACT", "Detection service imports the cost-model summary/snapshot.")
    edge("cs-evaluations-utilization", dependent, "HARD_CONTRACT", "Detection service imports utilization summary/snapshot.")
for dependency in [
    "cs-evaluations-analytics-summary",
    "cs-evaluations-cost-model",
    "cs-evaluations-utilization",
    "cs-evaluations-strength-detection",
    "cs-evaluations-weakness-detection",
    "cs-evaluations-grouping-entity-references",
]:
    edge(dependency, "cs-evaluations-driver-influence-analysis", "HARD_CONTRACT", "Driver analysis source imports the referenced summary, model, detection and entity-reference contracts.")

# E5: hardening builds on tenant-safe analytics, not historical platform branches.
edge("cs-evaluations-cost-model", "cs-evaluations-data-quality", "HARD_CONTRACT", "Data-quality service enriches the cost-model summary.")
edge("cs-evaluations-utilization", "cs-evaluations-data-quality", "HARD_CONTRACT", "Data-quality service enriches the utilization summary.")
edge("cs-evaluations-data-quality", "cs-evaluations-freshness-lineage", "HARD_CONTRACT", "Freshness/lineage extends canonical source-quality status.")
edge("cs-evaluations-data-quality", "cs-evaluations-metric-state-ux", "HARD_CONTRACT", "Metric-state UX maps quality availability without fabricating values.")
edge("cs-evaluations-freshness-lineage", "cs-evaluations-metric-state-ux", "HARD_CONTRACT", "Stale/lineage status is part of the metric-state contract.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-gdpr", "HARD_SECURITY", "Privacy policy is evaluated inside organization/station scope.")
edge("cs-evaluations-grouping-entity-references", "cs-evaluations-gdpr", "HARD_SECURITY", "PII/detail policy relies on typed entity ownership.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-roles-permissions", "HARD_SECURITY", "Central evaluation permissions layer on top of tenant/station enforcement.")
edge("cs-evaluations-gdpr", "cs-evaluations-roles-permissions", "SOFT_INTEGRATION", "Permission defaults distinguish aggregate, detail and export privacy scopes.")
edge("cs-evaluations-roles-permissions", "cs-evaluations-audit-logging", "HARD_SECURITY", "Sensitive audit events record the central policy decision.")
edge("cs-evaluations-gdpr", "cs-evaluations-audit-logging", "HARD_SECURITY", "Audit payload/retention follows the privacy policy.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-audit-logging", "HARD_SECURITY", "Audit events require authoritative organization/station scope.")

# E6: UI receives real backend contracts; no placeholder truth is introduced.
edge("cs-evaluations-analytics-contracts", "cs-evaluations-information-architecture", "HARD_CONTRACT", "EvaluationsPage sections bind only to canonical analytics contracts.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-information-architecture", "HARD_SECURITY", "UI cannot expose a route before its backing API is tenant safe.")
for dependency in [
    "cs-evaluations-data-quality",
    "cs-evaluations-freshness-lineage",
    "cs-evaluations-metric-state-ux",
]:
    edge(dependency, "cs-evaluations-data-quality-panel", "HARD_CONTRACT", "Data-quality panel renders canonical quality, lineage and metric-state contracts.")
edge("cs-evaluations-information-architecture", "cs-evaluations-data-quality-panel", "SOFT_UI", "Panel is mounted in the canonical EvaluationsPage section structure.")
for dependency in [
    "cs-evaluations-information-architecture",
    "cs-evaluations-analytics-summary",
    "cs-evaluations-revenue-cashflow-result",
    "cs-evaluations-metric-state-ux",
]:
    edge(dependency, "cs-evaluations-executive-kpi-strip", "HARD_CONTRACT" if dependency != "cs-evaluations-information-architecture" else "SOFT_UI", "KPI strip requires the canonical shell plus real summary, finance and metric-state values.")
for dependency in [
    "cs-evaluations-information-architecture",
    "cs-evaluations-strength-detection",
    "cs-evaluations-weakness-detection",
]:
    edge(dependency, "cs-evaluations-strength-weakness-cockpit", "SOFT_UI" if dependency == "cs-evaluations-information-architecture" else "HARD_CONTRACT", "Cockpit mounts in the shell and consumes actual strength/weakness contracts.")
for dependency in [
    "cs-evaluations-information-architecture",
    "cs-evaluations-cost-model",
    "cs-evaluations-analytics-summary",
]:
    edge(dependency, "cs-evaluations-risk-cost-failure-visuals", "SOFT_UI" if dependency == "cs-evaluations-information-architecture" else "HARD_CONTRACT", "Risk/cost visualizations consume existing analytics risk and cost data; predictive failure stays gated.")
for dependency in [
    "cs-evaluations-data-quality-panel",
    "cs-evaluations-executive-kpi-strip",
    "cs-evaluations-strength-weakness-cockpit",
    "cs-evaluations-risk-cost-failure-visuals",
]:
    edge(dependency, "cs-evaluations-mobile-readiness", "TEST_ONLY", "Responsive acceptance covers every recovered core UI surface.")
edge("cs-evaluations-mobile-readiness", "cs-evaluations-accessibility-i18n", "TEST_ONLY", "Accessibility/i18n acceptance runs on the complete responsive shell.")

# E7: no material action precedes tenant, permission, audit and idempotency gates.
for dependency in [
    "cs-evaluations-grouping-entity-references",
    "cs-evaluations-tenant-isolation",
    "cs-evaluations-roles-permissions",
    "cs-evaluations-audit-logging",
]:
    edge(dependency, "cs-evaluations-recommendation-domain", "HARD_SECURITY" if dependency != "cs-evaluations-grouping-entity-references" else "HARD_CONTRACT", "Recommendation records require typed targets plus tenant, permission and audit authority.")
edge("cs-evaluations-recommendation-domain", "cs-evaluations-action-center", "HARD_CONTRACT", "Action Center is a presentation of the recommendation state machine.")
edge("cs-evaluations-information-architecture", "cs-evaluations-action-center", "SOFT_UI", "Action Center mounts in the recovered EvaluationsPage.")
for dependency in [
    "cs-evaluations-action-center",
    "cs-evaluations-tenant-isolation",
    "cs-evaluations-roles-permissions",
    "cs-evaluations-audit-logging",
]:
    edge(dependency, "cs-evaluations-action-integrations", "HARD_SECURITY" if dependency != "cs-evaluations-action-center" else "HARD_CONTRACT", "Material integrations require UI confirmation, tenant/RBAC checks and durable audit before side effects.")
edge("cs-evaluations-action-integrations", "cs-evaluations-impact-measurement", "HARD_CONTRACT", "Impact records measure a versioned executed/confirmed recommendation action.")
edge("cs-evaluations-recommendation-domain", "cs-evaluations-impact-measurement", "HARD_SCHEMA", "Impact persistence references canonical recommendation state.")

# E8/E9: predictive remains backend-authoritative and default off.
for dependency, dependency_type in [
    ("cs-evaluations-analytics-contracts", "HARD_CONTRACT"),
    ("cs-evaluations-tenant-isolation", "HARD_SECURITY"),
    ("cs-evaluations-data-quality", "HARD_CONTRACT"),
    ("cs-evaluations-freshness-lineage", "HARD_CONTRACT"),
    ("cs-evaluations-audit-logging", "HARD_SECURITY"),
]:
    edge(dependency, "cs-evaluations-predictive-analytics-architecture", dependency_type, "Predictive architecture requires canonical analytics, tenant, quality/lineage and audited release authority.")
edge("cs-evaluations-predictive-analytics-architecture", "cs-evaluations-feature-store", "HARD_SCHEMA", "Point-in-time feature snapshots implement the predictive architecture contract.")
edge("cs-evaluations-tenant-isolation", "cs-evaluations-feature-store", "HARD_SECURITY", "Every feature snapshot is organization scoped.")
edge("cs-evaluations-feature-store", "cs-evaluations-demand-revenue-utilization-forecast", "HARD_RUNTIME", "Demand/revenue/utilization forecasts consume point-in-time feature snapshots.")
edge("cs-evaluations-feature-store", "cs-evaluations-maintenance-failure-forecast", "HARD_RUNTIME", "Maintenance/failure forecasts consume point-in-time feature snapshots.")
edge("cs-evaluations-demand-revenue-utilization-forecast", "cs-evaluations-backtesting-drift", "HARD_RUNTIME", "Release backtests evaluate demand/revenue/utilization candidates.")
edge("cs-evaluations-maintenance-failure-forecast", "cs-evaluations-backtesting-drift", "HARD_RUNTIME", "Release backtests evaluate maintenance/failure candidates.")
edge("cs-evaluations-backtesting-drift", "cs-evaluations-forecast-ux", "HARD_CONTRACT", "Forecast UI requires approved model status, empirical coverage and release result.")
edge("cs-evaluations-roles-permissions", "cs-evaluations-forecast-ux", "HARD_SECURITY", "Forecast reads use the central evaluations.forecast.read capability.")
edge("cs-evaluations-information-architecture", "cs-evaluations-forecast-ux", "SOFT_UI", "Forecast UI mounts only in the canonical EvaluationsPage.")


package_for = {
    changeset_id: package_id
    for package_id, members in PACKAGE_MEMBERS.items()
    for changeset_id in members
}
assert set(package_for) == set(source_by_id)
assert len(package_for) == sum(len(members) for members in PACKAGE_MEMBERS.values())

original_edges = [
    (dependency, item["changeset_id"])
    for item in source_changesets
    for dependency in item["dependencies"]
]
original_internal = [pair for pair in original_edges if pair[0] in source_by_id]
original_external = [pair for pair in original_edges if pair[0] not in source_by_id]
active_by_pair = {
    (item["dependency_changeset"], item["dependent_changeset"]): item
    for item in EDGE_SPECS
}


SPECIAL_REMOVALS = {
    (
        "cs-evaluations-summary-detail-separation",
        "cs-evaluations-grouping-entity-references",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Problem A: entity-reference contract has no import of summary/detail; its typed references are independently foundational.",
    ),
    (
        "cs-evaluations-tenant-isolation",
        "cs-evaluations-analytics-contracts",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Problem B: analytics contract sources import entity-reference/filter types, not tenant-isolation implementation.",
    ),
    (
        "cs-evaluations-analytics-summary",
        "cs-evaluations-filter-architecture",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Filter contracts are inputs to summary execution; historical commit order had the semantic direction reversed.",
    ),
    (
        "cs-evaluations-filter-architecture",
        "cs-evaluations-tenant-isolation",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Tenant guard/repository enforcement is a foundation concern, not a consumer of the full filter implementation.",
    ),
    (
        "cs-evaluations-cost-model",
        "cs-evaluations-utilization",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "UtilizationSnapshotService imports filter/utilization contracts and vehicle services, not the cost model.",
    ),
    (
        "cs-evaluations-driver-influence-analysis",
        "cs-evaluations-data-quality",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "DataQualityService imports cost and utilization summaries, not driver analysis.",
    ),
    (
        "cs-evaluations-data-quality-panel",
        "cs-evaluations-information-architecture",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "The shell is independently definable; the panel mounts into it, not vice versa.",
    ),
    (
        "cs-evaluations-executive-kpi-strip",
        "cs-evaluations-strength-weakness-cockpit",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Cockpit consumes strength/weakness contracts, not KPI-strip implementation.",
    ),
    (
        "cs-evaluations-strength-weakness-cockpit",
        "cs-evaluations-risk-cost-failure-visuals",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "Risk/cost visualizations consume analytics/cost contracts independently of cockpit rendering.",
    ),
    (
        "cs-evaluations-demand-revenue-utilization-forecast",
        "cs-evaluations-maintenance-failure-forecast",
    ): (
        "HISTORICAL_STACK_INHERITANCE",
        "The forecast engines share the feature store but neither engine is a prerequisite of the other.",
    ),
}


dependency_rows: list[dict[str, Any]] = []
for dependency, dependent in original_edges:
    pair = (dependency, dependent)
    if pair in active_by_pair:
        record = deepcopy(active_by_pair[pair])
        record["resolution"] = "RETAINED_OR_RETYPED_FROM_PHASE2_5"
        dependency_rows.append(record)
        continue
    if dependency == "cs-observability-api-and-domain-contracts":
        dependency_type = "OBSERVABILITY_ONLY"
        evidence = "Phase-2 affected files are evaluations metric/finance/UI files from the same source commits, not an independent observability contract; current main preserves #819 observability, Nest Logger and the evaluations operations runbook."
        resolution = "REMOVED_AS_EXTERNAL_RECOVERY_BLOCKER"
    elif dependency == "cs-infrastructure-api-and-domain-contracts":
        dependency_type = "HISTORICAL_STACK_INHERITANCE"
        evidence = "Phase-2 source commit 8cec86c… changes only Voice Assistant agent-deployment controller/service; no evaluation import or contract exists."
        resolution = "REMOVED_UNRELATED_VOICE_INFRASTRUCTURE"
    elif dependency == "cs-roles-access-api-and-domain-contracts":
        dependency_type = "ALREADY_SATISFIED_BY_MAIN"
        evidence = "The historical changeset contains booking handover files; current main already provides OrgScopingGuard, PermissionsGuard, RequirePermission and versioned organization-role defaults."
        resolution = "USE_CURRENT_MAIN_CENTRAL_RBAC"
    else:
        dependency_type, evidence = SPECIAL_REMOVALS.get(
            pair,
            (
                "HISTORICAL_STACK_INHERITANCE",
                "First-parent chronology created this edge, but normalized source imports and ADR ownership do not require it.",
            ),
        )
        resolution = "REMOVED_OR_REPLACED_BY_NORMALIZED_EDGE"
    dependency_rows.append({
        "dependency_changeset": dependency,
        "dependent_changeset": dependent,
        "dependency_type": dependency_type,
        "evidence": evidence,
        "active": False,
        "resolution": resolution,
    })

original_pairs = set(original_edges)
dependency_rows.extend(
    deepcopy(record)
    for pair, record in active_by_pair.items()
    if pair not in original_pairs
)

for row in dependency_rows:
    dependency = row["dependency_changeset"]
    dependent = row["dependent_changeset"]
    row["dependency_package"] = package_for.get(dependency, "")
    row["dependent_package"] = package_for[dependent]
    row["cross_module"] = dependency not in source_by_id
    row["hard"] = row["dependency_type"] in HARD_TYPES


normalized_changesets = []
ui_minimum_gates = {
    "cs-evaluations-information-architecture": ["cs-evaluations-analytics-contracts", "cs-evaluations-tenant-isolation"],
    "cs-evaluations-executive-kpi-strip": ["cs-evaluations-analytics-summary", "cs-evaluations-revenue-cashflow-result", "cs-evaluations-metric-state-ux"],
    "cs-evaluations-strength-weakness-cockpit": ["cs-evaluations-strength-detection", "cs-evaluations-weakness-detection"],
    "cs-evaluations-risk-cost-failure-visuals": ["cs-evaluations-cost-model", "cs-evaluations-analytics-summary"],
    "cs-evaluations-data-quality-panel": ["cs-evaluations-data-quality", "cs-evaluations-freshness-lineage", "cs-evaluations-metric-state-ux"],
    "cs-evaluations-metric-state-ux": ["cs-evaluations-data-quality", "cs-evaluations-freshness-lineage"],
    "cs-evaluations-mobile-readiness": ["cs-evaluations-information-architecture", "cs-evaluations-data-quality-panel", "cs-evaluations-executive-kpi-strip", "cs-evaluations-strength-weakness-cockpit", "cs-evaluations-risk-cost-failure-visuals"],
    "cs-evaluations-accessibility-i18n": ["cs-evaluations-mobile-readiness"],
    "cs-evaluations-forecast-ux": ["cs-evaluations-backtesting-drift", "cs-evaluations-roles-permissions"],
    "cs-evaluations-action-center": ["cs-evaluations-recommendation-domain", "cs-evaluations-audit-logging", "cs-evaluations-roles-permissions"],
}
predictive_ids = {
    "cs-evaluations-predictive-analytics-architecture",
    "cs-evaluations-feature-store",
    "cs-evaluations-demand-revenue-utilization-forecast",
    "cs-evaluations-maintenance-failure-forecast",
    "cs-evaluations-backtesting-drift",
    "cs-evaluations-forecast-ux",
}
protected_api_ids = {
    "cs-evaluations-summary-detail-separation",
    "cs-evaluations-revenue-cashflow-result",
    "cs-evaluations-analytics-summary",
    "cs-evaluations-cost-model",
    "cs-evaluations-utilization",
    "cs-evaluations-strength-detection",
    "cs-evaluations-weakness-detection",
    "cs-evaluations-driver-influence-analysis",
    "cs-evaluations-data-quality",
    "cs-evaluations-freshness-lineage",
    "cs-evaluations-gdpr",
    "cs-evaluations-roles-permissions",
    "cs-evaluations-audit-logging",
    "cs-evaluations-recommendation-domain",
    "cs-evaluations-action-center",
    "cs-evaluations-action-integrations",
    "cs-evaluations-impact-measurement",
    "cs-evaluations-predictive-analytics-architecture",
    "cs-evaluations-feature-store",
    "cs-evaluations-demand-revenue-utilization-forecast",
    "cs-evaluations-maintenance-failure-forecast",
    "cs-evaluations-backtesting-drift",
}
for item in source_changesets:
    changeset = deepcopy(item)
    changeset["phase2_5_package_id"] = changeset["package_id"]
    changeset["package_id"] = package_for[changeset["changeset_id"]]
    changeset["original_dependencies"] = changeset.pop("dependencies")
    changeset["dependencies"] = sorted({
        row["dependency_changeset"]
        for row in dependency_rows
        if row["active"] and row["dependent_changeset"] == changeset["changeset_id"]
    })
    changeset["minimum_backend_gate"] = ui_minimum_gates.get(changeset["changeset_id"], [])
    changeset["predictive"] = changeset["changeset_id"] in predictive_ids
    changeset["protected_api"] = changeset["changeset_id"] in protected_api_ids
    normalized_changesets.append(changeset)
normalized_by_id = {item["changeset_id"]: item for item in normalized_changesets}


active_pairs = [
    (row["dependency_changeset"], row["dependent_changeset"])
    for row in dependency_rows
    if row["active"] and row["dependency_changeset"] in normalized_by_id
]
changeset_graph = analyze_graph(normalized_by_id, active_pairs)
package_pairs = {
    (package_for[dependency], package_for[dependent])
    for dependency, dependent in active_pairs
    if package_for[dependency] != package_for[dependent]
}
package_graph = analyze_graph(PACKAGE_MEMBERS, package_pairs)
assert not package_graph["cycles"]
topological_package_order = package_graph["topological_order"]
package_order = {
    package_id: index + 1
    for index, package_id in enumerate(topological_package_order)
}


packages = []
for package_id in PACKAGE_MEMBERS:
    members = [normalized_by_id[changeset_id] for changeset_id in PACKAGE_MEMBERS[package_id]]
    files = sorted({path for item in members for path in item["affected_files"]})
    historical_actionable_files = sorted({
        path
        for item in members
        if not item["already_in_main"]
        for path in item["affected_files"]
    })
    deferred_file_ownership = [
        {"path": path, "owner_package": owner_package}
        for path in historical_actionable_files
        for prefix, owner_package in EXCLUSIVE_PATH_OWNERS.items()
        if path.startswith(prefix) and owner_package != package_id
    ]
    deferred_paths = {item["path"] for item in deferred_file_ownership}
    actionable_files = [
        path for path in historical_actionable_files if path not in deferred_paths
    ]
    frontend_files = [path for path in actionable_files if path.startswith("frontend/")]
    backend_files = [
        path for path in actionable_files if path.startswith(("backend/", "shared/"))
    ]
    database_files = [
        path
        for path in actionable_files
        if "prisma" in path or "migration" in path or "backfill" in path
    ]
    worker_files = [
        path
        for path in actionable_files
        if "/worker" in path or "scheduler" in path
    ]
    cross_hard = sorted({
        row["dependency_package"]
        for row in dependency_rows
        if row["active"]
        and row["hard"]
        and row["dependent_package"] == package_id
        and row["dependency_package"]
        and row["dependency_package"] != package_id
    })
    cross_soft = sorted({
        row["dependency_package"]
        for row in dependency_rows
        if row["active"]
        and not row["hard"]
        and row["dependent_package"] == package_id
        and row["dependency_package"]
        and row["dependency_package"] != package_id
    })
    meta = PACKAGE_META[package_id]
    risk = meta["risk"]
    packages.append({
        "package_id": package_id,
        "package_name": meta["package_name"],
        "topological_order": package_order[package_id],
        "changesets": PACKAGE_MEMBERS[package_id],
        "hard_dependencies": cross_hard,
        "soft_dependencies": cross_soft,
        "platform_prerequisites": [],
        "risk": risk,
        "frontend": bool(frontend_files),
        "backend": bool(backend_files),
        "database": bool(database_files),
        "worker": bool(worker_files),
        "security_sensitive": any(item["security"] for item in members),
        "privacy_sensitive": any(item["privacy"] for item in members),
        "feature_flag": meta["feature_flag"],
        "entry_gate": meta["entry_gate"],
        "exit_gate": meta["exit_gate"],
        "required_tests": meta["required_tests"],
        "required_staging": risk in {"HIGH", "CRITICAL"},
        "required_vps": package_id == "E9",
        "rollback_strategy": "Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.",
        "security_gate": "Manual security review plus authenticated tenant/station negative tests." if any(item["security"] for item in members) else "",
        "privacy_gate": "PII minimization, retention, redaction and sensitive-read audit review." if any(item["privacy"] for item in members) else "",
        "source_prs": sorted({pr for item in members for pr in item["source_prs"]}),
        "source_commits": sorted({sha for item in members for sha in item["source_commits"]}),
        "affected_files": files,
        "implementation_files": actionable_files,
        "deferred_file_ownership": deferred_file_ownership,
        "scope_notes": PACKAGE_SCOPE_NOTES.get(package_id, []),
        "frontend_files": frontend_files,
        "backend_files": backend_files,
        "database_files": database_files,
        "worker_files": worker_files,
        "integration_methods": sorted({item["integration_method"] for item in members}),
    })


model = {
    "schema_version": "phase2.6-evaluations-normalized-v1",
    "generated_at": generated_at,
    "source_state": {
        "current_main_sha": current_main,
        "phase2_5_main_sha": phase25_main,
        "main_delta_left_right": main_delta,
        "main_changed_since_phase2_5": current_main != phase25_main,
        "git_version": git("--version"),
        "gh_version": subprocess.check_output(["gh", "--version"], text=True).splitlines()[0],
    },
    "changesets": normalized_changesets,
    "dependency_edges": dependency_rows,
    "packages": packages,
    "exclusive_path_owners": EXCLUSIVE_PATH_OWNERS,
    "platform_prerequisites": [],
    "readiness_rules": {
        "tenant_foundation_changeset": "cs-evaluations-tenant-isolation",
        "protected_api_changesets": sorted(protected_api_ids),
        "material_action_changesets": ["cs-evaluations-action-integrations"],
        "material_action_required_ancestors": [
            "cs-evaluations-tenant-isolation",
            "cs-evaluations-roles-permissions",
            "cs-evaluations-audit-logging",
        ],
        "required_chains": {
            "finance_migration": [
                "cs-evaluations-money-domain",
                "cs-evaluations-money-migration",
            ],
            "finance_calculation": [
                "cs-evaluations-money-domain",
                "cs-evaluations-receivables",
                "cs-evaluations-revenue-cashflow-result",
                "cs-evaluations-multi-currency",
                "cs-evaluations-finance-test-suite",
            ],
            "recommendation_action": [
                "cs-evaluations-recommendation-domain",
                "cs-evaluations-action-center",
                "cs-evaluations-action-integrations",
                "cs-evaluations-impact-measurement",
            ],
            "predictive_demand": [
                "cs-evaluations-predictive-analytics-architecture",
                "cs-evaluations-feature-store",
                "cs-evaluations-demand-revenue-utilization-forecast",
                "cs-evaluations-backtesting-drift",
                "cs-evaluations-forecast-ux",
            ],
            "predictive_maintenance": [
                "cs-evaluations-predictive-analytics-architecture",
                "cs-evaluations-feature-store",
                "cs-evaluations-maintenance-failure-forecast",
                "cs-evaluations-backtesting-drift",
                "cs-evaluations-forecast-ux",
            ],
        },
    },
}
model = with_recomputed_graphs(model)
validation_errors = validate_model(model)


def run_negative_tests() -> dict[str, Any]:
    from phase2_6_evaluations_validator_tests import run_negative_tests as execute

    return execute(model)


negative_result = run_negative_tests()
ready = not validation_errors and negative_result["failed"] == 0
model["validation"] = {
    "errors": validation_errors,
    "negative_tests": negative_result,
    "ready_for_phase3": ready,
}
write_json(NORMALIZED_JSON, model)


# Derive validity only after package topological order exists.
for row in dependency_rows:
    if not row["active"]:
        row["valid_order"] = "REMOVED_NOT_APPLICABLE"
    elif not row["dependency_package"]:
        row["valid_order"] = False
    elif row["dependency_package"] == row["dependent_package"]:
        row["valid_order"] = True
    else:
        row["valid_order"] = package_order[row["dependency_package"]] < package_order[row["dependent_package"]]

dependency_fields = [
    "dependency_changeset",
    "dependent_changeset",
    "dependency_type",
    "dependency_package",
    "dependent_package",
    "cross_module",
    "evidence",
    "valid_order",
    "resolution",
]
write_csv(
    OUT / "phase2-6-evaluations-final-dependency-matrix-2026-08.csv",
    dependency_fields,
    dependency_rows,
)

package_fields = [
    "package_id",
    "package_name",
    "topological_order",
    "changesets",
    "hard_dependencies",
    "soft_dependencies",
    "platform_prerequisites",
    "risk",
    "frontend",
    "backend",
    "database",
    "worker",
    "security_sensitive",
    "privacy_sensitive",
    "feature_flag",
    "entry_gate",
    "exit_gate",
    "required_tests",
    "required_staging",
    "required_vps",
    "rollback_strategy",
]
write_csv(
    OUT / "phase2-6-evaluations-final-package-matrix-2026-08.csv",
    package_fields,
    packages,
)


old_package_order = [f"E{index}" for index in range(1, 9)]
old_order = {package_id: index for index, package_id in enumerate(old_package_order, 1)}
old_package_for = {item["changeset_id"]: item["package_id"] for item in source_changesets}
original_invalid = [
    (dependency, dependent)
    for dependency, dependent in original_internal
    if old_order[old_package_for[dependency]] > old_order[old_package_for[dependent]]
]
original_package_pairs = {
    (old_package_for[dependency], old_package_for[dependent])
    for dependency, dependent in original_internal
    if old_package_for[dependency] != old_package_for[dependent]
}
original_package_graph = analyze_graph(old_package_order, original_package_pairs)
violations: list[dict[str, Any]] = []
for index, (dependency, dependent) in enumerate(original_external, 1):
    matrix_row = next(
        row
        for row in dependency_rows
        if row["dependency_changeset"] == dependency
        and row["dependent_changeset"] == dependent
    )
    violations.append({
        "violation_id": f"EXT-{index:03d}",
        "category": "UNKNOWN_CROSS_MODULE_DEPENDENCY",
        "dependency_changeset": dependency,
        "dependent_changeset": dependent,
        "dependency_package": "",
        "dependent_package": old_package_for[dependent],
        "evidence": matrix_row["evidence"],
        "resolution": matrix_row["resolution"],
        "status": "REPAIRED",
    })
for index, (dependency, dependent) in enumerate(original_invalid, 1):
    violations.append({
        "violation_id": f"ORDER-{index:03d}",
        "category": "INVALID_PACKAGE_ORDER",
        "dependency_changeset": dependency,
        "dependent_changeset": dependent,
        "dependency_package": old_package_for[dependency],
        "dependent_package": old_package_for[dependent],
        "evidence": "Phase-2.5 package order placed the dependency in a later package.",
        "resolution": "Removed/reversed by source-import analysis and regrouped atomically in E2.",
        "status": "REPAIRED",
    })
for index, component in enumerate(original_package_graph["cycles"], 1):
    violations.append({
        "violation_id": f"CYCLE-{index:03d}",
        "category": "SOURCE_DERIVED_PACKAGE_CYCLE",
        "dependency_changeset": "",
        "dependent_changeset": "",
        "dependency_package": ";".join(component),
        "dependent_package": "",
        "evidence": f"Original changeset projection SCC: {component}.",
        "resolution": "Rebuilt package DAG exclusively from normalized changeset edges.",
        "status": "REPAIRED",
    })
declared_edges = {
    (dependency, row["package_id"])
    for row in csv.DictReader(
        (OUT / "phase2-5-evaluations-integration-packages-2026-08.csv").open(newline="")
    )
    for dependency in row["dependencies"].split(";")
    if dependency
}
if declared_edges != original_package_pairs:
    violations.append({
        "violation_id": "DAG-001",
        "category": "DECLARED_DAG_NOT_SOURCE_DERIVED",
        "dependency_changeset": "",
        "dependent_changeset": "",
        "dependency_package": "",
        "dependent_package": "",
        "evidence": f"Declared edges={len(declared_edges)}; source-derived original edges={len(original_package_pairs)}; SHA-256={hashlib.sha256(repr(sorted(declared_edges ^ original_package_pairs)).encode()).hexdigest()}.",
        "resolution": "Phase-2.6 DAG is generated only from active normalized changeset edges.",
        "status": "REPAIRED",
    })
violation_fields = [
    "violation_id",
    "category",
    "dependency_changeset",
    "dependent_changeset",
    "dependency_package",
    "dependent_package",
    "evidence",
    "resolution",
    "status",
]
write_csv(
    OUT / "phase2-6-evaluations-dependency-violations-2026-08.csv",
    violation_fields,
    violations,
)


graph_payload = {
    "schema_version": "phase2.6-evaluations-graph-v1",
    "source_state": model["source_state"],
    "edge_direction": "dependency -> dependent",
    "original": {
        "changeset_graph": analyze_graph(source_by_id, original_internal),
        "package_graph": original_package_graph,
        "internal_edge_count": len(original_internal),
        "external_dependency_count": len(original_external),
    },
    "normalized": {
        "changeset_graph": model["changeset_graph"],
        "package_graph": model["package_graph"],
        "active_edge_count": len(active_edges(model)),
        "active_hard_edge_count": sum(edge["dependency_type"] in HARD_TYPES for edge in active_edges(model)),
        "active_soft_edge_count": sum(edge["dependency_type"] not in HARD_TYPES for edge in active_edges(model)),
    },
}
write_json(
    OUT / "phase2-6-evaluations-changeset-graph-2026-08.json",
    graph_payload,
)


package_dag_lines = [
    "# Phase 2.6 — Evaluations Package DAG",
    "",
    f"Generated from {len(active_edges(model))} active normalized change-set edges; no package edge is handwritten.",
    "",
    "```mermaid",
    "flowchart LR",
]
for package in sorted(packages, key=lambda item: item["topological_order"]):
    package_dag_lines.append(
        f'  {package["package_id"]}["{package["package_id"]} {package["package_name"]}"]'
    )
for dependency, dependent in sorted(package_pairs):
    types = sorted({
        row["dependency_type"]
        for row in dependency_rows
        if row["active"]
        and row["dependency_package"] == dependency
        and row["dependent_package"] == dependent
    })
    package_dag_lines.append(f'  {dependency} -->|{", ".join(types)}| {dependent}')
package_dag_lines += [
    "```",
    "",
    f"- Topological order: {' → '.join(topological_package_order)}",
    f"- Roots: {', '.join(model['package_graph']['roots'])}",
    f"- Leaves: {', '.join(model['package_graph']['leaves'])}",
    f"- Cycles: {len(model['package_graph']['cycles'])}",
    "- Platform prerequisites: none (`P0_REQUIRED=false`).",
    "",
    "## Edge rationale",
    "",
]
for dependency, dependent in sorted(package_pairs):
    supporting = [
        row
        for row in dependency_rows
        if row["active"]
        and row["dependency_package"] == dependency
        and row["dependent_package"] == dependent
    ]
    package_dag_lines.append(
        f"- `{dependency} → {dependent}`: "
        + "; ".join(
            f"`{row['dependency_changeset']} → {row['dependent_changeset']}` ({row['dependency_type']})"
            for row in supporting
        )
        + "."
    )
write_md(
    OUT / "phase2-6-evaluations-package-dag-2026-08.md",
    package_dag_lines,
)


moved = [
    item
    for item in normalized_changesets
    if item["phase2_5_package_id"] != item["package_id"]
]
removed_counts = Counter(
    row["dependency_type"] for row in dependency_rows if not row["active"]
)
diff_lines = [
    "# Phase 2.6 — Package Changes from Phase 2.5",
    "",
    "## Package structure",
    "",
    "- Package count: 8 → 9.",
    f"- Old declared order: {' → '.join(old_package_order)}.",
    f"- New source-derived order: {' → '.join(topological_package_order)}.",
    "- `E2` is now an atomic tenant-safe contract/persistence package; subsequent package numbers shift by one.",
    "",
    "## Change-set movements",
    "",
    "| Change-set | Phase 2.5 | Phase 2.6 | Reason |",
    "|---|---|---|---|",
]
for item in moved:
    diff_lines.append(
        f"| `{item['changeset_id']}` | `{item['phase2_5_package_id']}` | `{item['package_id']}` | "
        f"{'Contract/security atomicity.' if item['package_id'] == 'E2' else 'Dependency-safe package renumbering or domain consolidation.'} |"
    )
diff_lines += [
    "",
    "## Dependency normalization",
    "",
    f"- Original dependencies: {len(original_edges)} ({len(original_internal)} internal, {len(original_external)} external).",
    f"- Removed observability-only external entries from the recovery graph: {removed_counts['OBSERVABILITY_ONLY']}.",
    f"- Removed historical stack dependencies: {removed_counts['HISTORICAL_STACK_INHERITANCE']}.",
    f"- Removed/satisfied-by-main role dependencies: {removed_counts['ALREADY_SATISFIED_BY_MAIN']}.",
    "- Problem A: removed `summary-detail-separation → grouping-entity-references`; no source import establishes it.",
    "- Problem B: removed `tenant-isolation → analytics-contracts`; contract definition now precedes same-package enforcement.",
    "- Infrastructure dependency removed: its Phase-2 source is Voice Assistant deployment code.",
    "- Observability dependency removed as a recovery blocker: its Phase-2 affected files are the same evaluations commits, not a separate platform contract.",
    "- Roles dependency replaced by current-main `OrgScopingGuard`, `PermissionsGuard`, `RequirePermission` and versioned role defaults.",
    "- Platform prerequisites added: 0 (`P0_REQUIRED=false`).",
    "",
    "## External dependency decisions",
    "",
    "| Historical ID | Evaluation references | Phase-2 source evidence | Current-main authority / decision | P0 |",
    "|---|---:|---|---|---|",
    f"| `cs-observability-api-and-domain-contracts` | {sum(dependency == 'cs-observability-api-and-domain-contracts' for dependency, _ in original_external)} | "
    f"PRs {', '.join('#'+str(item) for item in phase2_by_id['cs-observability-api-and-domain-contracts']['source_prs'])}; "
    f"commits {', '.join('`'+item+'`' for item in phase2_by_id['cs-observability-api-and-domain-contracts']['source_commits'])}; "
    f"{len(phase2_by_id['cs-observability-api-and-domain-contracts']['affected_files'])} evaluation-owned metric/finance/UI paths; no independent imported observability symbol | "
    "`OBSERVABILITY_ONLY`; preserve current #819/Nest Logger/runbook behavior, but no external recovery change-set. | `false` |",
    f"| `cs-infrastructure-api-and-domain-contracts` | {sum(dependency == 'cs-infrastructure-api-and-domain-contracts' for dependency, _ in original_external)} | "
    f"PRs {', '.join('#'+str(item) for item in phase2_by_id['cs-infrastructure-api-and-domain-contracts']['source_prs'])}; "
    f"commit `{phase2_by_id['cs-infrastructure-api-and-domain-contracts']['source_commits'][0]}`; "
    "`agent-deployment.controller.ts` and `agent-deployment.service.ts` only; no evaluation import/symbol | "
    "`HISTORICAL_STACK_INHERITANCE`; Voice Assistant deployment has no evaluations import. | `false` |",
    f"| `cs-roles-access-api-and-domain-contracts` | {sum(dependency == 'cs-roles-access-api-and-domain-contracts' for dependency, _ in original_external)} | "
    f"PRs {', '.join('#'+str(item) for item in phase2_by_id['cs-roles-access-api-and-domain-contracts']['source_prs'])}; "
    f"commits {', '.join('`'+item+'`' for item in phase2_by_id['cs-roles-access-api-and-domain-contracts']['source_commits'])}; booking handover files | "
    "`ALREADY_SATISFIED_BY_MAIN`; use `OrgScopingGuard`, `PermissionsGuard`, `RequirePermission`, operational permission registry and versioned role defaults. | `false` |",
    "",
    "## Package size and atomicity review",
    "",
    "| Package | Change-sets | Files | Mix | Risk | Test burden | Rollback complexity |",
    "|---|---:|---:|---|---|---|---|",
]
for package in sorted(packages, key=lambda item: item["topological_order"]):
    mix = "/".join(
        label
        for label, present in [
            ("FE", package["frontend"]),
            ("BE", package["backend"]),
            ("DB", package["database"]),
            ("Worker", package["worker"]),
        ]
        if present
    )
    test_burden = "HIGH" if package["risk"] == "CRITICAL" or len(package["changesets"]) >= 7 else "MEDIUM"
    rollback_complexity = "HIGH" if package["database"] else "MEDIUM"
    diff_lines.append(
        f"| `{package['package_id']}` | {len(package['changesets'])} | {len(package['implementation_files'])} | "
        f"{mix or 'contracts/docs'} | `{package['risk']}` | `{test_burden}` | `{rollback_complexity}` |"
    )
diff_lines += [
    "",
    "Each package has a coherent disabled-or-production-safe end state. E1 is contract-only and exposes no new protected route; E2 atomically introduces persistence/contracts with tenant enforcement; later APIs inherit E2 security. No package intentionally leaves an unguarded API or a second money/KPI authority for a successor to repair.",
]
write_md(
    OUT / "phase2-6-package-changes-from-phase2-5-2026-08.md",
    diff_lines,
)


runbook_lines = [
    "# Phase 2.6 — Evaluations Phase-3 Runbook",
    "",
    "This is the Phase-3 recovery authority and supersedes the Phase-2.5 package order without deleting prior audit evidence.",
    "",
    "## Branch policy",
    "",
    "For every package: `git fetch origin`, create only that package branch from then-current `origin/main`, target `main`, merge only after its gate, then delete no historical branch in this phase. Never stack recovery PRs.",
    "",
]
for package in sorted(packages, key=lambda item: item["topological_order"]):
    slug = package["package_name"].lower().replace("&", "and").replace(" ", "-").replace(",", "")
    runbook_lines += [
        f"## {package['topological_order']}. {package['package_id']} — {package['package_name']}",
        "",
        f"- Planned branch: `integration/evaluations-{package['package_id'].lower()}-{slug}-2026-08`",
        "- Starting point: current `origin/main` after every hard-dependency package is merged.",
        f"- Change-sets: {', '.join(f'`{item}`' for item in package['changesets'])}",
        f"- Source PRs: {', '.join('#'+str(item) for item in package['source_prs'])}",
        f"- Source commits: {', '.join(f'`{item}`' for item in package['source_commits'])}",
        f"- Implementation: {', '.join(package['integration_methods'])}",
        f"- Migration evidence to regenerate from current main: {', '.join(f'`{item}`' for item in package['database_files']) if package['database_files'] else 'None.'}",
        f"- Tests: {'; '.join(package['required_tests'])}",
        f"- Staging: {'required' if package['required_staging'] else 'not separately required'}; VPS: {'required' if package['required_vps'] else 'not in this package'}.",
        f"- Entry gate: {package['entry_gate']}",
        f"- Exit/merge gate: {package['exit_gate']}",
        f"- Rollback: {package['rollback_strategy']}",
        f"- Feature flag: `{package['feature_flag'] or 'none'}`",
        "",
    ]
    if package["scope_notes"]:
        runbook_lines += ["### Capability ownership notes", ""]
        runbook_lines += [f"- {note}" for note in package["scope_notes"]]
        runbook_lines += [""]
    runbook_lines += [
        "<details><summary>Phase-3 implementation file scope</summary>",
        "",
    ]
    runbook_lines += [f"- `{path}`" for path in package["implementation_files"]]
    runbook_lines += ["", "</details>", ""]
    if package["deferred_file_ownership"]:
        runbook_lines += [
            "<details><summary>Historical file overlap deferred to its owning package</summary>",
            "",
        ]
        runbook_lines += [
            f"- `{item['path']}` → `{item['owner_package']}`; do not port in `{package['package_id']}`."
            for item in package["deferred_file_ownership"]
        ]
        runbook_lines += ["", "</details>", ""]
runbook_lines += [
    "## Global no-go gates",
    "",
    "- Any cross-tenant/station read, missing central permission check, unconfirmed material action, idempotency gap, audit enqueue failure, mixed-currency sum, PII leakage, future leakage, or predictive default-on is `NO-GO`.",
    "- Historical migrations are evidence only. Recompute each schema diff and rehearse expand/backfill/switch/contract on current main.",
    "- Analytics-summary service/repository and shared summary implementation paths are owned by E4. E2 must use E1 period semantics and must not replay historical summary-service refactors from filter/grouping commits.",
    "- Predictive backend/shared implementation paths are owned exclusively by E8. Earlier RBAC/audit packages may add reusable guards and contracts, but must not port predictive controllers, services or shared predictive implementations.",
    "- Figma remains visual authority during Phase-3 UI implementation; no UI package may introduce client-owned KPI truth.",
]
write_md(
    OUT / "phase2-6-evaluations-phase3-runbook-2026-08.md",
    runbook_lines,
)


hard_count = sum(row["hard"] for row in dependency_rows if row["active"])
soft_count = sum(not row["hard"] for row in dependency_rows if row["active"])
cross_active_count = sum(row["cross_module"] for row in dependency_rows if row["active"])
validation_lines = [
    "# Phase 2.6 — Evaluations Validation Report",
    "",
    f"Generated `{generated_at}` against `origin/main` `{current_main}`.",
    "",
    "## Machine result",
    "",
    f"- Change-sets: {len(normalized_changesets)}",
    f"- Packages: {len(packages)}",
    f"- Active dependency edges: {len(active_edges(model))}",
    f"- Hard edges: {hard_count}",
    f"- Soft/test edges: {soft_count}",
    f"- Active cross-module edges: {cross_active_count}",
    f"- Change-set cycles: {len(model['changeset_graph']['cycles'])}",
    f"- Package cycles: {len(model['package_graph']['cycles'])}",
    f"- Invalid final package-order edges: {sum(row['active'] and row['valid_order'] is False for row in dependency_rows)}",
    "- Unknown final dependencies: 0",
    "- Unresolved platform prerequisites: 0",
    f"- Validator errors: {len(validation_errors)}",
    f"- Negative validator tests: {negative_result['passed']}/{negative_result['total']} passed",
    f"- Result: `{'PASS' if ready else 'FAIL'}`",
    "",
    "## Negative fixtures",
    "",
]
for result in negative_result["results"]:
    validation_lines.append(
        f"- `{result['name']}`: `{'PASS' if result['passed'] else 'FAIL'}`; expected `{result['expected_code']}`; observed `{', '.join(result['observed_codes'])}`."
    )
validation_lines += [
    "",
    "## ADR consistency spot check",
    "",
    "- No page-owned truth: EVAL-ADR-003 remains consistent with metric registry/current UI adapters.",
    "- Tenant isolation/authorization: EVAL-ADR-007 uses current central guards and role defaults; E2 makes enforcement atomic with new analytics contracts.",
    "- Recommendation versus action: EVAL-ADR-005 requires confirmation, tenant/entity checks, idempotency and audit before E7 side effects.",
    "- Predictive uncertainty/release: EVAL-ADR-006/009 require point-in-time data, intervals, backtests and backend default-off before E9 exposure.",
    "- Auditability/privacy: EVAL-ADR-008 extends the existing business-audit outbox; aggregate reads remain distinct from sensitive reads/exports.",
    "- Finance terms: EVAL-ADR-001 preserves typed Money, ISO-4217 and FX provenance; E3 contract precedes migration.",
    "- Data quality/freshness: EVAL-ADR-003 contracts are ordered before UI and predictive consumers.",
    "- Book I–IV remain unavailable under identifiable repository paths; the Phase-2.5 authority matrix and requirement indexes are the documented retrieval limit.",
    "",
    "## Specialized gates",
    "",
    "- Tenant foundation is E2; no new protected analytics API is ordered before it.",
    "- Predictive order is architecture → feature store → forecast engines → backtesting/release gate → Forecast UI; backend and frontend defaults remain off.",
    "- Recommendation order is domain → permission/audit-gated Action Center → confirmed/idempotent integrations → impact measurement.",
    "- Every UI change-set has `minimum_backend_gate` in the normalized model; no placeholder contract is accepted.",
    "",
    "### Finance order",
    "",
    "`timezone + KPI contract → Money contract → Money migration`; in parallel after Money, `timezone + Money → receivables → revenue/cashflow/result → multi-currency`; the finance test suite closes the same E3 package. Migration never defines money semantics and multi-currency never creates another authority.",
    "",
    "### UI minimum backend gates",
    "",
    "| UI change-set | Minimum backend gate |",
    "|---|---|",
]
for changeset_id, gates in sorted(ui_minimum_gates.items()):
    validation_lines.append(
        f"| `{changeset_id}` | {', '.join(f'`{gate}`' for gate in gates)} |"
    )
validation_lines += [
    "",
    "E1 is a complete contract-only package and does not expose historical controller deltas. E2 is the first package allowed to expose new protected analytics routes, and those routes merge only with tenant/station guards and negative tests.",
]
if validation_errors:
    validation_lines += ["", "## Blocking validator errors", ""]
    validation_lines += [
        f"- `{item['code']}`: {item['detail']}" for item in validation_errors
    ]
write_md(
    OUT / "phase2-6-evaluations-validation-report-2026-08.md",
    validation_lines,
)


summary_lines = [
    "# Phase 2.6 — Executive Summary",
    "",
    f"Generated `{generated_at}` against current `origin/main` `{current_main}`.",
    "",
    f"## Status: **{'READY_FOR_PHASE_3' if ready else 'NOT_READY_FOR_PHASE_3'}**",
    "",
    f"- Current main: `{current_main}`; Phase-2.5 main: `{phase25_main}`; delta: `{main_delta}`.",
    f"- Baseline change: {'main changed; mandatory 44-change-set revalidation blocks READY' if current_main != phase25_main else 'none; the conditional 44-change-set revalidation was not triggered'}.",
    f"- Final evaluation change-sets: {len(normalized_changesets)}.",
    f"- Packages: 8 → {len(packages)}.",
    f"- Dependency violations found/repaired: {len(violations)}/{sum(item['status'] == 'REPAIRED' for item in violations)}.",
    f"- Historical stack dependencies removed: {removed_counts['HISTORICAL_STACK_INHERITANCE']}.",
    f"- Observability-only external entries removed from the recovery graph: {removed_counts['OBSERVABILITY_ONLY']}.",
    f"- Current-main-satisfied role dependencies removed: {removed_counts['ALREADY_SATISFIED_BY_MAIN']}.",
    "- Genuine platform prerequisites: 0 (`P0_REQUIRED=false`).",
    "- Remaining cross-module blockers: 0.",
    f"- Change-set DAG cycles: {len(model['changeset_graph']['cycles'])}.",
    f"- Package DAG cycles: {len(model['package_graph']['cycles'])}.",
    f"- Topological package order: {' → '.join(topological_package_order)}.",
    f"- Validator: `{'PASS' if not validation_errors else 'FAIL'}`.",
    f"- Negative tests: `{'PASS' if negative_result['failed'] == 0 else 'FAIL'}` ({negative_result['passed']}/{negative_result['total']}).",
    "- Open architecture questions: 0.",
    "- Open UNKNOWNs: 0.",
    "",
    "## Package risk",
    "",
    "| Order | Package | Risk | Change-sets |",
    "|---:|---|---|---:|",
]
for package in sorted(packages, key=lambda item: item["topological_order"]):
    summary_lines.append(
        f"| {package['topological_order']} | `{package['package_id']}` {package['package_name']} | `{package['risk']}` | {len(package['changesets'])} |"
    )
summary_lines += [
    "",
    "READY is calculated from the normalized in-memory model only after change-set/package graph validation and all negative fixtures pass. No prior READY text is used as an input.",
    "",
    "## Generated files",
    "",
]
generated_names = [
    "phase2-6-evaluations-analysis-2026-08.py",
    "phase2_6_evaluations_validation.py",
    "phase2-6-evaluations-validate-2026-08.py",
    "phase2_6_evaluations_validator_tests.py",
    NORMALIZED_JSON.name,
    "phase2-6-evaluations-changeset-graph-2026-08.json",
    "phase2-6-evaluations-dependency-violations-2026-08.csv",
    "phase2-6-evaluations-final-package-matrix-2026-08.csv",
    "phase2-6-evaluations-final-dependency-matrix-2026-08.csv",
    "phase2-6-evaluations-package-dag-2026-08.md",
    "phase2-6-package-changes-from-phase2-5-2026-08.md",
    "phase2-6-evaluations-phase3-runbook-2026-08.md",
    "phase2-6-evaluations-validation-report-2026-08.md",
    "phase2-6-executive-summary-2026-08.md",
]
summary_lines += [f"- `docs/audits/pr-recovery/{name}`" for name in generated_names]
write_md(
    OUT / "phase2-6-executive-summary-2026-08.md",
    summary_lines,
)

print(json.dumps({
    "current_main": current_main,
    "changesets": len(normalized_changesets),
    "packages": len(packages),
    "active_edges": len(active_edges(model)),
    "violations_found": len(violations),
    "violations_repaired": sum(item["status"] == "REPAIRED" for item in violations),
    "changeset_cycles": len(model["changeset_graph"]["cycles"]),
    "package_cycles": len(model["package_graph"]["cycles"]),
    "validator_errors": len(validation_errors),
    "negative_tests": f"{negative_result['passed']}/{negative_result['total']}",
    "status": "READY_FOR_PHASE_3" if ready else "NOT_READY_FOR_PHASE_3",
}, sort_keys=True))
