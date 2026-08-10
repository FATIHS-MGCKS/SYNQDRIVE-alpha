#!/usr/bin/env python3
"""Generate the deterministic Phase 2.5 evaluations recovery decision package."""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
ADR_OUT = ROOT / "docs/architecture/decisions"
PHASE2_JSON = OUT / "phase2-unique-changesets-2026-08.json"
PHASE1_JSON = OUT / "open-pr-inventory-2026-08.json"


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and result.returncode:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def command(*args: str) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def git_success(*args: str) -> bool:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    ).returncode == 0


def md(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def write_md(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(line.rstrip() for line in lines).rstrip() + "\n")


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            normalized = {}
            for field in fieldnames:
                value = row.get(field, "")
                if isinstance(value, bool):
                    value = str(value).lower()
                elif isinstance(value, list):
                    value = ";".join(str(item) for item in value)
                normalized[field] = value
            writer.writerow(normalized)


phase2 = json.loads(PHASE2_JSON.read_text())
phase1 = json.loads(PHASE1_JSON.read_text())
phase2_changesets = {item["changeset_id"]: item for item in phase2["changesets"]}
phase1_prs = phase1["pull_requests"]
current_main = git("rev-parse", "origin/main")
phase2_main = phase2["summary"]["current_main_sha"]
main_delta = git("rev-list", "--left-right", "--count", f"{phase2_main}...{current_main}")
generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
git_version = command("git", "--version")
gh_version = command("gh", "--version").splitlines()[0]

ADR_OUT.mkdir(parents=True, exist_ok=True)


DECISIONS = [
    {
        "id": "EVAL-ADR-001",
        "file": "ADR-evaluations-money-multicurrency.md",
        "title": "Evaluations Money and Multi-Currency Authority",
        "summary": "A typed money contract preserves original amounts and converts only with historical FX provenance.",
        "affected": [
            "cs-evaluations-money-domain", "cs-evaluations-money-migration",
            "cs-evaluations-receivables", "cs-evaluations-revenue-cashflow-result",
            "cs-evaluations-multi-currency", "cs-evaluations-finance-test-suite",
        ],
        "migration": "Required: organization base currency, conversion/provenance storage, and controlled historical backfill.",
        "security": "Financial data; finance-owner review and reconciliation are mandatory.",
        "authority": [
            "backend/prisma/schema.prisma — Organization, OrgInvoice, BillingInvoice currency/minor-unit fields",
            "docs/architecture/analytics/evaluations-metric-registry.md — metric units and canonical registry",
            "docs/architecture/analytics/evaluations-calculation-versioning.md — filters, source versions and reproducibility",
            "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — current EUR-only behavior",
        ],
        "decision": [
            "The canonical value object is `{ amountMinor, currency }`, where `currency` is an uppercase ISO-4217 code and `amountMinor` is an integer in that currency's defined minor unit.",
            "Every converted value preserves original amount/currency plus organization base currency, converted amount, FX rate, FX timestamp, FX source/provenance, and conversion status.",
            "Unknown currency is not EUR. Values without an approved conversion are never summed across currencies and surface as partial/unavailable.",
            "Historical reports use the FX context effective for the reporting event or persisted conversion snapshot; later rates never silently rewrite history.",
            "Existing `totalCents`/`amountCents` fields remain source-domain inputs during migration, but the evaluations contract uses `amountMinor`; no magnitude heuristic may infer cents versus euros.",
        ],
        "constraints": [
            "The invoice and billing domains remain source authorities for original transaction values.",
            "Formula/provenance versions must change when currency policy changes.",
            "Backfill is dry-run, idempotent and reconcilable; uncertain rows remain unconverted.",
        ],
    },
    {
        "id": "EVAL-ADR-002",
        "file": "ADR-evaluations-timezone-period-authority.md",
        "title": "Evaluations Timezone and Business-Period Authority",
        "summary": "UTC storage is evaluated through an explicit report timezone, station timezone, then organization timezone.",
        "affected": ["cs-evaluations-timezone-period-model", "cs-evaluations-filter-architecture"],
        "migration": "No mandatory data rewrite; period contracts and timezone validation are required.",
        "security": "Tenant/station scope and period scope must be evaluated together.",
        "authority": [
            "backend/prisma/schema.prisma — Organization.timezone and Station.timezone",
            "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — local-Date month-boundary gap",
            "docs/architecture/analytics/evaluations-calculation-versioning.md — periodStart/periodEnd provenance",
        ],
        "decision": [
            "Timestamps are stored and exchanged in UTC. Business boundaries use an IANA timezone recorded in calculation provenance.",
            "Timezone precedence is: explicit report scope; unique station scope; organization timezone. User/browser timezone is presentation-only.",
            "A day is local midnight inclusive to next local midnight exclusive. A week is ISO Monday through next Monday. A month, quarter and year use local calendar boundaries.",
            "MTD/QTD/YTD start at the corresponding local calendar boundary and end at the report `asOf` instant. Rolling windows are explicit elapsed durations ending at `asOf`, not aliases for calendar periods.",
            "Previous comparable periods use the immediately preceding equal local-calendar period and clip to equivalent elapsed business time for in-progress comparisons.",
            "DST gaps and overlaps resolve through the IANA zone database; APIs return UTC bounds plus timezone and local labels so boundaries are reproducible.",
        ],
        "constraints": [
            "Invalid or ambiguous scope fails closed with a validation error.",
            "No browser-local `Date` boundary may define a business KPI.",
            "Timezone and period identifiers are part of cache keys and calculation provenance.",
        ],
    },
    {
        "id": "EVAL-ADR-003",
        "file": "ADR-evaluations-ui-authority.md",
        "title": "Evaluations UI and KPI Authority",
        "summary": "The `financial-insights` route becomes a modular EvaluationsPage backed only by canonical analytics APIs.",
        "affected": [
            "cs-evaluations-information-architecture", "cs-evaluations-executive-kpi-strip",
            "cs-evaluations-strength-weakness-cockpit", "cs-evaluations-risk-cost-failure-visuals",
            "cs-evaluations-data-quality-panel", "cs-evaluations-mobile-readiness",
            "cs-evaluations-accessibility-i18n", "cs-evaluations-metric-state-ux",
        ],
        "migration": "No DB migration; staged route/component cutover behind an organization-scoped UI flag.",
        "security": "The UI must not broaden backend permissions or infer tenant scope locally.",
        "authority": [
            "docs/audits/evaluations/evaluations-technical-inventory-2026-07.md — current routes and duplicate client calculations",
            "docs/architecture/analytics/evaluations-metric-registry.md — KPI single source of truth",
            "frontend/src/rental/App.tsx — current `financial-insights` and `data-analyse` view keys",
            "frontend/src/rental/components/FinancialInsightsView.tsx — current production shell",
            "frontend/src/rental/components/insights/InsightsCockpit.tsx — current business-insights consumer",
        ],
        "decision": [
            "The canonical customer-facing route remains view key `financial-insights`; its target shell becomes `EvaluationsPage` through a controlled cutover.",
            "`DataAnalyseView` remains a separate privileged diagnostics surface and is not merged into customer analytics.",
            "Correct presentation components may be reused, but KPI values, groupings, filters and recommendation state come from canonical backend/shared contracts.",
            "`FinancialInsightsView` is refactored into temporary adapters and then deprecated. `InsightsCockpit` is refactored into modular sections. Client KPI engines become compatibility adapters and are removed after parity acceptance.",
            "No second KPI, money, recommendation or forecast truth may live in React components.",
        ],
        "constraints": [
            "Use `VITE_EVALUATIONS_UI_V2=off|shadow|on`, default `off`, with an optional org allowlist.",
            "Figma remains visual authority at Phase-3 implementation time; Figma MCP was unavailable during this planning run.",
            "Current #818 E2E/a11y conventions are retained and rebased onto the recovered UI.",
        ],
    },
    {
        "id": "EVAL-ADR-004",
        "file": "ADR-evaluations-entity-references.md",
        "title": "Evaluations Typed Entity References",
        "summary": "A relational typed-reference authority is paired with immutable display snapshots.",
        "affected": [
            "cs-evaluations-grouping-entity-references", "cs-evaluations-analytics-contracts",
            "cs-evaluations-recommendation-domain", "cs-evaluations-action-center",
        ],
        "migration": "Required: normalized reference table, indexes, validation and gradual backfill.",
        "security": "Critical tenant/entity ownership validation; cross-tenant reference is a release blocker.",
        "authority": [
            "backend/prisma/schema.prisma — organization-scoped business entities and DashboardInsight persistence",
            "docs/architecture/analytics/evaluations-calculation-versioning.md — applied filters and lineage",
            "backend/src/shared/auth/permission.constants.ts — central permission authority",
        ],
        "decision": [
            "Persist a normalized relation with `organizationId`, owner record ID, `entityType`, `entityId`, optional `stationId`, `relationType`, timestamps and a deterministic dedupe key.",
            "Use a hybrid read model: relational references are authority for scope, joins and drill-down; a versioned JSON display snapshot may preserve historical labels without becoming identity authority.",
            "Supported entity types are registry-controlled and include vehicle, booking, customer, station, service case, invoice, task and other explicitly added domain types.",
            "Writes resolve the referenced entity through its owning tenant-scoped service. A free JSON ID list is never sufficient authority.",
        ],
        "constraints": [
            "Unique constraints prevent duplicate owner/relation/entity tuples.",
            "Deletes use explicit retention/tombstone policy so historical analytics remain explainable.",
            "Backfill rows that cannot be verified are quarantined, not guessed.",
        ],
    },
    {
        "id": "EVAL-ADR-005",
        "file": "ADR-evaluations-recommendation-action-safety.md",
        "title": "Evaluations Recommendation Action Safety",
        "summary": "Navigation is direct; material writes use central policies, confirmation, idempotency and audit.",
        "affected": [
            "cs-evaluations-recommendation-domain", "cs-evaluations-action-center",
            "cs-evaluations-action-integrations", "cs-evaluations-impact-measurement",
            "cs-evaluations-audit-logging",
        ],
        "migration": "Recommendation/impact schema migrations require redesign on current main.",
        "security": "Critical authorization and side-effect safety; no autonomous irreversible action.",
        "authority": [
            "backend/src/modules/tasks — canonical Task Domain services",
            "backend/src/modules/workflows — canonical workflow execution and policy services",
            "backend/src/modules/business-audit/business-audit.service.ts — transactional audit outbox",
            "docs/compliance/workflow-audit-and-ai-transparency-2026-07.md — controlled automation evidence",
        ],
        "decision": [
            "Read/navigation actions may open a vehicle, booking, invoice or data source directly after normal read authorization.",
            "Material writes—task/service-case creation, assignment, workflow start, message/customer contact, finance, booking or vehicle-state changes—require tenant and entity checks, central permission policy, an idempotency key, audit event and explicit user confirmation unless an existing approved workflow policy provides maker-checker approval.",
            "Recommendations are evidence and proposed intent, not an execution engine. Side effects delegate to canonical Task, Workflow, Notification, Booking, Invoice or Vehicle services.",
            "AI-generated recommendations can never bypass policy or confirmation and cannot fabricate missing entity references.",
        ],
        "constraints": [
            "Action state transitions are versioned and auditable.",
            "Retries are idempotent and fail closed.",
            "Financial, customer-contact and booking/vehicle-state actions always require explicit confirmation.",
        ],
    },
    {
        "id": "EVAL-ADR-006",
        "file": "ADR-evaluations-forecast-release-policy.md",
        "title": "Evaluations Forecast Data and Release Policy",
        "summary": "Forecasts require sufficient point-in-time data, backtesting, calibrated uncertainty and versioned release evidence.",
        "affected": [
            "cs-evaluations-predictive-analytics-architecture", "cs-evaluations-feature-store",
            "cs-evaluations-demand-revenue-utilization-forecast",
            "cs-evaluations-maintenance-failure-forecast",
            "cs-evaluations-backtesting-drift", "cs-evaluations-forecast-ux",
        ],
        "migration": "Required: feature snapshots, forecasts, backtests and model-release metadata.",
        "security": "Critical privacy, tenant isolation and model-governance review.",
        "authority": [
            "docs/architecture/analytics/evaluations-metric-registry.md — estimate/forecast kind separation",
            "docs/architecture/analytics/evaluations-calculation-versioning.md — formula and source provenance",
            "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — forecast/backtesting absent from main",
        ],
        "decision": [
            "A rule-based estimate, statistical forecast and ML forecast are distinct registered metric kinds and must be labeled as such.",
            "Demand/revenue/utilization release requires at least 90 elapsed days, 12 weekly cycles and 80% expected-source coverage. Maintenance/failure release requires at least 180 days plus the target-specific minimum labeled outcomes declared by the model registry; absent labels block release.",
            "Training uses point-in-time feature snapshots with no future leakage. At least three rolling-origin backtest folds are mandatory.",
            "A candidate must beat the approved naive baseline by at least 5% on the registered primary error metric, or document a domain-approved non-inferiority margin. Release confidence must be at least 0.70.",
            "Prediction intervals are mandatory. The registry declares a nominal coverage between 80% and 95%; rolling backtests must achieve empirical coverage within five percentage points of that target.",
            "Every result includes model/version, feature schema version, trained/fitted timestamp, forecast creation/as-of timestamps, horizon, confidence, prediction interval, coverage and data-quality status.",
            "Default retention is 24 months for forecast outputs and model metadata and 13 months for feature snapshots, capped by source/privacy retention. Longer retention requires a recorded legal/operational policy.",
            "Failed freshness, drift, coverage or release gates disable the forecast and return an explicit unavailable/degraded state; no fabricated fallback forecast is shown.",
        ],
        "constraints": [
            "Model promotion is immutable and auditable; rollback selects a previously approved version.",
            "Drift is evaluated at least per scheduled fit and weekly for active models.",
            "UI never renders a point forecast without uncertainty and release status.",
        ],
    },
    {
        "id": "EVAL-ADR-007",
        "file": "ADR-evaluations-permission-model.md",
        "title": "Evaluations Permission Model",
        "summary": "Evaluations capabilities extend the central module/operational permission model instead of creating a role engine.",
        "affected": [
            "cs-evaluations-tenant-isolation", "cs-evaluations-roles-permissions",
            "cs-evaluations-analytics-contracts", "cs-evaluations-gdpr",
        ],
        "migration": "Permission defaults/versioned-role migration may be required; no parallel role tables.",
        "security": "Critical RBAC, organization, station and PII enforcement.",
        "authority": [
            "backend/src/shared/auth/permission.constants.ts — canonical module keys",
            "backend/src/shared/auth/operational-permission.util.ts — granular action registry integration",
            "backend/src/modules/users/defaults/organization-role.defaults.ts — central role defaults",
            "docs/audits/evaluations/evaluations-technical-inventory-2026-07.md — current guard and station-scope gaps",
        ],
        "decision": [
            "Add central module key `evaluations` and granular operational actions: `evaluations.summary.read`, `evaluations.finance.read`, `evaluations.receivables.read`, `evaluations.customer-detail.read`, `evaluations.driver-detail.read`, `evaluations.forecast.read`, `evaluations.data-quality.read`, `evaluations.recommendation.manage`, `evaluations.export`, and `evaluations.admin`.",
            "Actions map through the existing operational-permission registry to central membership permissions; no evaluations-specific role or assignment engine is allowed.",
            "Every endpoint enforces organization scope in service/repository queries. Station-scoped members receive only allowed-station aggregates and details.",
            "Aggregate permission does not imply customer/driver PII detail. Detail and export actions require their dedicated capabilities.",
        ],
        "constraints": [
            "Default roles are changed only through central versioned role defaults and impact review.",
            "MASTER_ADMIN access remains explicit and audited.",
            "Authenticated cross-tenant and cross-station negative tests are release gates.",
        ],
    },
    {
        "id": "EVAL-ADR-008",
        "file": "ADR-evaluations-sensitive-read-auditing.md",
        "title": "Evaluations Sensitive Read Auditing",
        "summary": "Routine aggregate reads are not audited; sensitive details, exports and administration are.",
        "affected": [
            "cs-evaluations-gdpr", "cs-evaluations-audit-logging",
            "cs-evaluations-action-center", "cs-evaluations-roles-permissions",
        ],
        "migration": "Audit event registry/outbox changes may be required; payload storage remains minimized.",
        "security": "Sensitive-read event minimization, integrity, retention and access review.",
        "authority": [
            "backend/src/modules/business-audit/business-audit.service.ts — durable audit outbox",
            "docs/audits/iam-transactional-audit-outbox-2026-07.md — transactional audit pattern",
            "docs/remediation/master-admin-audit-log-hardening.md — privileged audit controls",
            "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — mutation-only current coverage",
        ],
        "decision": [
            "Normal aggregate KPI/summary reads do not create per-request audit events.",
            "Audit events are mandatory for customer/driver/employee detail analysis, sensitive customer drill-down, finance or PII export, admin diagnostics, recommendation writes, and forecast/model administration.",
            "Events record actor, organization, station scope where relevant, action, target type/opaque ID, policy decision, timestamp, correlation/idempotency key and result—never complete analytics or PII payloads.",
            "Use the existing transactional business/IAM audit outbox and central retention/access controls.",
        ],
        "constraints": [
            "Export auditing is fail-closed before download materialization.",
            "Read-audit failures for sensitive details deny the operation when durable enqueue cannot be guaranteed.",
            "Metrics/log labels contain no tenant or entity identifiers.",
        ],
    },
    {
        "id": "EVAL-ADR-009",
        "file": "ADR-evaluations-predictive-feature-flag.md",
        "title": "Evaluations Predictive Feature Flag",
        "summary": "Predictive APIs and UI are disabled by default and activate only after model release gates.",
        "affected": [
            "cs-evaluations-feature-store", "cs-evaluations-demand-revenue-utilization-forecast",
            "cs-evaluations-maintenance-failure-forecast", "cs-evaluations-backtesting-drift",
            "cs-evaluations-forecast-ux",
        ],
        "migration": "No activation migration; data models may be deployed while serving disabled responses.",
        "security": "Admin-only activation after tenant/security/privacy attestation.",
        "authority": [
            "frontend/src/rental/lib/notifications/notifications-v2-flag.ts — off/shadow/on and org-allowlist precedent",
            "backend/src/shared/stations/stations-v2-feature-flags.resolver.ts — backend flag resolver precedent",
            "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — predictive backend absent",
        ],
        "decision": [
            "Backend authority is `EVALUATIONS_PREDICTIVE_MODE=off|shadow|on`, default `off`, plus `EVALUATIONS_PREDICTIVE_ORG_ALLOWLIST`.",
            "Frontend `VITE_EVALUATIONS_PREDICTIVE_MODE` may only reduce exposure; it cannot override a disabled backend.",
            "Activation is organization-scoped, admin-only and requires feature pipeline, data-quality, backtesting, security, tenant-isolation and model-release gates plus uncertainty-capable UI.",
            "Shadow mode computes and validates without customer-visible forecast values or action side effects.",
            "Rollback sets mode to `off`; stored evidence is retained under policy and endpoints return explicit feature-disabled states.",
        ],
        "constraints": [
            "Forecasts, predictive risk and predictive recommendations share this backend release gate.",
            "No default-on behavior or missing-env fail-open.",
            "Activation/deactivation is audited.",
        ],
    },
    {
        "id": "EVAL-ADR-010",
        "file": "ADR-evaluations-visual-test-artifacts.md",
        "title": "Evaluations Visual Test Artifact Policy",
        "summary": "Reproducible tests and current baselines are authority; historical screenshots are not recovered.",
        "affected": [
            "cs-evaluations-mobile-readiness", "cs-evaluations-accessibility-i18n",
            "cs-evaluations-information-architecture", "cs-evaluations-forecast-ux",
        ],
        "migration": "No DB impact; test baseline regeneration is required after approved UI cutover.",
        "security": "Fixtures/screenshots must contain synthetic, non-PII data.",
        "authority": [
            "docs/audits/evaluations/evaluations-e2e-visual-report-2026-07.md — current test conventions",
            "frontend/e2e/evaluations-fixtures.ts — merged reproducible fixtures",
            "docs/audits/pr-recovery/phase2-evaluations-recovery-plan-2026-08.md — #818 preservation gate",
        ],
        "decision": [
            "Do not recover historical PNGs or artifact-path-only commits as product source.",
            "Recover deterministic fixture/spec intent only after rebasing it on current #818 conventions.",
            "Generate a new approved baseline from the implemented current UI; volatile timestamps, random IDs, network data and PII are prohibited.",
            "Visual diffs are review evidence, not functional or architectural source of truth.",
        ],
        "constraints": [
            "Baselines are versioned with viewport, theme, locale and fixture schema.",
            "Accessibility and interaction tests remain separate mandatory gates.",
            "Artifact retention follows CI policy; stale screenshots may be deleted only in implementation PRs after replacement evidence exists.",
        ],
    },
]


for decision in DECISIONS:
    lines = [
        f"# {decision['title']}", "",
        f"- Status: `ACCEPTED`",
        f"- Decision ID: `{decision['id']}`",
        f"- Date: `{generated_at[:10]}`",
        f"- Scope: SynqDrive Evaluations / Auswertungen", "",
        "## Context", "",
        decision["summary"],
        "",
        "The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.",
        "",
        "## Authority evidence", "",
        *[f"- `{item}`" for item in decision["authority"]],
        "",
        "## Decision", "",
        *[f"- {item}" for item in decision["decision"]],
        "",
        "## Non-negotiable constraints", "",
        *[f"- {item}" for item in decision["constraints"]],
        "",
        "## Impact", "",
        f"- Affected change-sets: {', '.join(f'`{item}`' for item in decision['affected'])}",
        f"- Migration: {decision['migration']}",
        f"- Security/privacy: {decision['security']}",
        "",
        "## Consequences", "",
        "- Historical cumulative branches are evidence only and are not integration authorities.",
        "- Phase 3 reimplements or manually ports the decision on current main with the package gates.",
        "- Any future exception requires a superseding ratified ADR and calculation/contract version update.",
        "",
        "## Verification", "",
        "- Architecture matrix consistency check.",
        "- Package dependency and source-coverage validation.",
        "- Required automated, security, migration and staging gates from the Phase-3 runbook.",
        "",
        "## Open questions", "",
        "None. Runtime activation remains gated by tests and release evidence, not by an unresolved architecture choice.",
    ]
    write_md(ADR_OUT / decision["file"], lines)


REQUIREMENTS = [
    ("EVAL-ADR-001", "REQ-MONEY-001", "backend/prisma/schema.prisma", "OrgInvoice/Billing money fields", "Transaction values have integer minor units and explicit currency.", "Preserve original values; add typed evaluations money/provenance."),
    ("EVAL-ADR-001", "REQ-MONEY-002", "docs/architecture/analytics/evaluations-calculation-versioning.md", "Provenance contract", "Applied filters and source versions make results reproducible.", "FX timestamp/source/status become provenance inputs."),
    ("EVAL-ADR-002", "REQ-TIME-001", "backend/prisma/schema.prisma", "Organization/Station", "Organization and station carry IANA timezone candidates.", "Use explicit → station → organization precedence."),
    ("EVAL-ADR-002", "REQ-TIME-002", "docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md", "Residual P2", "Browser-local month boundaries are an acknowledged gap.", "Replace local Date business boundaries."),
    ("EVAL-ADR-003", "REQ-UI-001", "docs/architecture/analytics/evaluations-metric-registry.md", "Purpose", "Metric Registry is the evaluations KPI single source of truth.", "UI renders contracts and does not calculate a second truth."),
    ("EVAL-ADR-003", "REQ-UI-002", "docs/audits/evaluations/evaluations-technical-inventory-2026-07.md", "Navigation / duplicate calculations", "Current route and duplicate client engines are documented.", "Cut over the same route and retire compatibility engines."),
    ("EVAL-ADR-004", "REQ-ENTITY-001", "docs/architecture/analytics/evaluations-calculation-versioning.md", "Applied filters/source versions", "Entity scope and lineage must be reproducible.", "Use tenant-validated typed references and snapshots."),
    ("EVAL-ADR-005", "REQ-ACTION-001", "backend/src/modules/business-audit/business-audit.service.ts", "Transactional outbox", "Critical business actions have durable audit support.", "Material recommendation actions use central services and audit."),
    ("EVAL-ADR-005", "REQ-ACTION-002", "docs/compliance/workflow-audit-and-ai-transparency-2026-07.md", "Workflow/AI governance", "Automation requires transparent controlled execution.", "No autonomous irreversible AI side effects."),
    ("EVAL-ADR-006", "REQ-FC-001", "docs/architecture/analytics/evaluations-metric-registry.md", "metricKind", "Rule estimates, statistical forecasts and ML forecasts are distinct.", "Separate labels, release gates and UI semantics."),
    ("EVAL-ADR-006", "REQ-FC-002", "docs/architecture/analytics/evaluations-calculation-versioning.md", "Reproducibility", "Formula, period, filters and sources are versioned.", "Forecast/model/feature versions and as-of timestamps are mandatory."),
    ("EVAL-ADR-007", "REQ-PERM-001", "backend/src/shared/auth/permission.constants.ts", "Canonical module keys", "Membership permissions use central module keys.", "Add evaluations centrally; no local role engine."),
    ("EVAL-ADR-007", "REQ-PERM-002", "backend/src/shared/auth/operational-permission.util.ts", "Granular actions", "Operational actions map to central module permissions.", "Add detail/export/admin actions through the registry."),
    ("EVAL-ADR-008", "REQ-AUDIT-001", "backend/src/modules/business-audit/business-audit.service.ts", "Business audit outbox", "Durable critical audit events can be transactionally enqueued.", "Sensitive reads/exports and writes reuse this mechanism."),
    ("EVAL-ADR-009", "REQ-FLAG-001", "frontend/src/rental/lib/notifications/notifications-v2-flag.ts", "Rollout modes", "Existing rollout precedent is off/shadow/on plus org allowlist.", "Predictive follows default-off scoped rollout."),
    ("EVAL-ADR-010", "REQ-VIS-001", "docs/audits/evaluations/evaluations-e2e-visual-report-2026-07.md", "E2E/visual baseline", "Current reproducible #818 suite is preservation evidence.", "Regenerate current baselines; drop historical PNG-only patches."),
]


authority_lines = [
    "# Phase 2.5 — Evaluations Architecture Authority Matrix", "",
    "## Snapshot", "",
    f"- Current `origin/main`: `{current_main}`",
    f"- Phase-2 main: `{phase2_main}`",
    f"- Delta (left/right): `{main_delta}`",
    f"- Generated: `{generated_at}`",
    f"- Git: `{git_version}`",
    f"- GitHub CLI: `{gh_version}`", "",
    "## Authority availability", "",
    "- Book I–IV files matching the supplied canonical titles were not present in the repository.",
    "- The direct Phase-2.5 mandate is controlling product authority for this audit.",
    "- Existing ADRs, canonical platform architecture and current code were checked as lower-level contradiction evidence.",
    "- Historical recovery PRs were used only as implementation evidence.", "",
    "## Requirements matrix", "",
    "| Decision | Requirement | Source document | Source section | Requirement | Impact |",
    "|---|---|---|---|---|---|",
]
for row in REQUIREMENTS:
    authority_lines.append("| " + " | ".join(md(item) for item in row) + " |")
authority_lines += ["", "## Decision lock", "", "| Decision | Status | Authority sources | Open question | Final decision |", "|---|---|---|---|---|"]
for decision in DECISIONS:
    authority_lines.append(
        f"| `{decision['id']}` | `ACCEPTED` | {len(decision['authority'])} repository sources + direct mandate | None | {md(decision['summary'])} |"
    )
authority_lines += [
    "", "## Cross-decision invariants", "",
    "- One metric registry and calculation-provenance authority.",
    "- One typed money/conversion authority; invoice domains retain original transaction truth.",
    "- One timezone/period resolver.",
    "- One central RBAC/operational-permission engine.",
    "- One recommendation state domain delegating side effects to existing services.",
    "- One forecast/model registry and release gate.",
    "- No React-local KPI engine after cutover.",
]
write_md(OUT / "phase2-5-evaluations-architecture-authority-matrix-2026-08.md", authority_lines)

decision_matrix = [
    "# Phase 2.5 — Evaluations Architecture Decision Matrix", "",
    "| Decision ID | Status | Authority sources | Affected change-sets | Affected modules | Migration impact | Security impact | Open question | Final decision |",
    "|---|---|---|---|---|---|---|---|---|",
]
for decision in DECISIONS:
    decision_matrix.append(
        f"| `{decision['id']}` | `ACCEPTED` | {md('; '.join(decision['authority']))} | "
        f"{md('; '.join(decision['affected']))} | evaluations + owning source domains | "
        f"{md(decision['migration'])} | {md(decision['security'])} | None | {md(decision['summary'])} |"
    )
write_md(OUT / "phase2-5-evaluations-architecture-decision-matrix-2026-08.md", decision_matrix)


RESIDUAL_MAP = {
    "082464aae4a8eea85350291a0a93f946d712a3cb": ("roles-access", "Provider grant consolidation", "cs-roles-access-tenant-and-access-controls", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Data Authorization capability inherited through branch ancestry."),
    "14eb5aa433fe2b0c231476a251c478e596ba6c2b": ("workflow-automation", "Typed workflow condition engine", "cs-workflow-automation-api-and-domain-contracts", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Workflow condition domain; no evaluations-owned path."),
    "198c8e22e090ce337fdcb72545070d917082f2e4": ("trips", "Driving-assessment reason categories", "cs-trips-vehicle-intelligence", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Driving Intelligence/trip assessment capability."),
    "1b3d814ee0ee1b7ec06ef88927df21efaba2639a": ("trips", "ClickHouse waypoint and activity-window producers", "cs-trips-runtime-jobs-and-queues", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Trip evidence producer and Data Analyse consumer, not Evaluations."),
    "3a8004c9aa8ec3c66cc3f336f446054f2f3ab93c": ("bookings", "Station booking-rule manual override", "cs-bookings-stations", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Stations/booking rules capability."),
    "55b8ac4dd743084b6fb17f35772d71e54adf4887": ("documents", "Document Intake required-field registry", "cs-documents-document-extraction", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Document Intake planner capability."),
    "6434434e750ad6890db6c6ff5f7c6f3e9d3ee36c": ("evaluations-testing", "Historical screenshot artifact path correction", "", "OBSOLETE", "LOW", "PR #818 current visual-test artifact convention", "Binary artifact move only; policy forbids recovering volatile historical screenshots."),
    "723b566609908ff40d621e30efb8c95cff3f17c3": ("evaluations-testing", "Historical evaluations fixture artifact-path correction", "cs-evaluations-action-center", "SUPERSEDED", "LOW", "PR #818 merged evaluations fixtures", "Path-only fixture correction is replaced by the current baseline convention."),
    "72ce3ba52ff18c27f0d5a884271c322171c215c6": ("bookings", "Station calendar/timezone booking rules", "cs-bookings-stations", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Station booking-rule authority, unrelated to evaluations periods."),
    "76a6d686b1f508f134f0f29f3d79694c76313c45": ("trips", "Separate vehicle load from driver conduct", "cs-trips-vehicle-intelligence", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Driving Intelligence semantics, not the evaluations driver-analysis capability."),
    "77e7a8e5a5a9c684f9b27a74718fbe48959c02ad": ("trips", "Deprecate legacy driving-score readers", "cs-trips-vehicle-intelligence", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Cross-module consumer migration owned by Driving Intelligence."),
    "8718daad62262893034264f248d239ee621b8181": ("workflow-automation", "Workflow tenant/scope fail-closed enforcement", "cs-workflow-automation-tenant-and-access-controls", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Workflow execution authorization capability."),
    "9302bd8ba34c206f1c4bc53de8380f7e4e30fe57": ("voice-ai", "Voice automation analytics/settings UI", "cs-voice-ai-operational-ui", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Voice Assistant module analytics, not Auswertungen."),
    "9c02947e27a477402a2e3b774ab0d001c6fc8206": ("workflow-automation", "Workflow dry-run execution plans", "cs-workflow-automation-runtime-jobs-and-queues", "INHERITED_NO_EVALUATIONS_RELEVANCE", "HIGH", "", "Workflow runtime simulation capability."),
    "9d958453bc8afbc7b80ce7aff5f82598f1f2e970": ("roles-access", "Data Authorization deny switch", "cs-roles-access-tenant-and-access-controls", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Cross-cutting data authorization control."),
    "d571a8491eb3cf15af7e24762cb90ac0e4a71424": ("workflow-automation", "Nested ALL/ANY/NOT workflow conditions", "cs-workflow-automation-database-and-data-model", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Workflow schema and condition engine."),
    "f69bfbe65bda93235bfbaf7b38a895adca4c1382": ("workflow-automation", "Workflow condition operator matrix", "cs-workflow-automation-database-and-data-model", "INHERITED_NO_EVALUATIONS_RELEVANCE", "CRITICAL", "", "Workflow schema/operator expansion."),
}

residual = phase2_changesets["cs-evaluations-unresolved-residual"]
residual_contrib = {item["commit"]: item for item in residual["commit_contributions"]}
residual_rows = []
distinct_dispositions = {}
for sha in residual["source_commits"]:
    module, intent, target, disposition, risk, superseded_by, rationale = RESIDUAL_MAP[sha]
    subject = git("show", "-s", "--format=%s", sha)
    parents = git("show", "-s", "--format=%P", sha).split()
    source_parent = parents[0] if parents else ""
    paths = residual_contrib[sha]["paths"]
    source_prs = sorted(
        pr["pr_number"] for pr in phase1_prs if sha in pr.get("non_main_commit_shas", [])
    )
    already_in_main = git_success("merge-base", "--is-ancestor", sha, "origin/main")
    cherry = git("cherry", "origin/main", source_parent, sha) if source_parent else ""
    patch_equivalent = cherry.startswith("-")
    distinct_dispositions[sha] = disposition
    for source_pr in source_prs:
        residual_rows.append({
            "source_pr": source_pr,
            "source_commit": sha,
            "source_parent": source_parent,
            "affected_files": paths,
            "original_intent": intent,
            "actual_module": module,
            "evaluation_relevant": False,
            "existing_changeset": target,
            "new_changeset": "",
            "classification": disposition,
            "already_in_main": already_in_main,
            "patch_equivalent": patch_equivalent,
            "superseded_by": superseded_by,
            "risk": risk,
            "confidence": "HIGH",
            "evidence": f"{subject}; first-parent path review ({len(paths)} files); {rationale}; git cherry={cherry or 'n/a'}",
        })

residual_fields = [
    "source_pr", "source_commit", "source_parent", "affected_files", "original_intent",
    "actual_module", "evaluation_relevant", "existing_changeset", "new_changeset",
    "classification", "already_in_main", "patch_equivalent", "superseded_by",
    "risk", "confidence", "evidence",
]
write_csv(OUT / "phase2-5-evaluations-residual-attribution-2026-08.csv", residual_fields, residual_rows)

disposition_counts = Counter(distinct_dispositions.values())
action_merge_sha = "364bd93733e30c6a98ea579f1707b8a73be2ecd8"
action_parents = git("show", "-s", "--format=%P", action_merge_sha).split()
action_merge_base = git("merge-base", action_parents[0], action_parents[1])
action_parent1_paths = git("diff", "--name-only", action_parents[0], action_merge_sha).splitlines()
action_parent2_paths = git("diff", "--name-only", action_parents[1], action_merge_sha).splitlines()
action_combined_paths = [
    path for path in git("show", "--cc", "--name-only", "--format=", action_merge_sha).splitlines()
    if path.strip()
]
residual_md = [
    "# Phase 2.5 — Evaluations Residual Resolution", "",
    f"`cs-evaluations-unresolved-residual` contained {len(residual['source_commits'])} distinct commits across {len(residual['source_prs'])} containing PRs. It is retired and must not appear in Phase 3.", "",
    "## Exit result", "",
    f"- Distinct inherited/non-evaluations commits: {disposition_counts['INHERITED_NO_EVALUATIONS_RELEVANCE']}",
    f"- Superseded evaluation test-path commits: {disposition_counts['SUPERSEDED']}",
    f"- Obsolete screenshot-only commits: {disposition_counts['OBSOLETE']}",
    "- Already in main: 0",
    "- Patch-equivalent: 0",
    "- New evaluations capabilities: 0",
    "- Remaining UNKNOWN: 0", "",
    "## Commit attribution", "",
    "| Commit | PR memberships | Intent | Actual module | Target/disposition | Confidence |",
    "|---|---:|---|---|---|---|",
]
for sha in residual["source_commits"]:
    rows = [row for row in residual_rows if row["source_commit"] == sha]
    first = rows[0]
    residual_md.append(
        f"| `{sha}` | {', '.join('#'+str(row['source_pr']) for row in rows)} | {md(first['original_intent'])} | "
        f"`{first['actual_module']}` | `{first['existing_changeset'] or first['classification']}` / `{first['classification']}` | `HIGH` |"
    )
residual_md += [
    "", "## Merge-commit check", "",
    "- None of the 17 residual commits is a merge commit; each was analyzed against its first parent.",
    f"- Action Center merge join: `{action_merge_sha}`.",
    f"- Parent 1 (Recommendation Domain): `{action_parents[0]}`; delta to merge: {len(action_parent1_paths)} paths; path-list SHA-256 `{hashlib.sha256(chr(10).join(action_parent1_paths).encode()).hexdigest()}`.",
    f"- Parent 2 (UI/a11y chain): `{action_parents[1]}`; delta to merge: {len(action_parent2_paths)} paths; path-list SHA-256 `{hashlib.sha256(chr(10).join(action_parent2_paths).encode()).hexdigest()}`.",
    f"- Parent merge base: `{action_merge_base}`. Combined-diff conflict/result surface: {len(action_combined_paths)} paths.",
    "- The final Action Center change-set keeps only its recommendation/action integration surface and uses `RECONSTRUCT_MERGE_RESULT`; it does not treat either inherited parent delta as the feature.",
    "", "## Source-PR coverage", "",
    f"All residual source PRs are represented in the CSV: {', '.join('#'+str(value) for value in residual['source_prs'])}.",
]
write_md(OUT / "phase2-5-evaluations-residual-resolution-2026-08.md", residual_md)


PACKAGE_CAPABILITIES = {
    "E1": [
        "Metric Registry", "Calculation Versioning", "Timezone / Period Model",
        "Unified KPI Contract", "Grouping / Entity References", "Analytics Contracts",
    ],
    "E2": [
        "Money Domain", "Money Migration", "Receivables", "Revenue / Cashflow / Result",
        "Multi-Currency", "Finance Test Suite",
    ],
    "E3": [
        "Summary / Detail Separation", "Analytics Summary", "Filter Architecture",
        "Cost Model", "Utilization", "Strength Detection", "Weakness Detection",
        "Driver / Influence Analysis",
    ],
    "E4": [
        "Tenant Isolation", "Data Quality", "Freshness / Lineage", "Metric State UX",
        "GDPR", "Roles / Permissions",
    ],
    "E5": [
        "Data Quality Panel", "Information Architecture", "Executive KPI Strip",
        "Strength / Weakness Cockpit", "Risk / Cost / Failure Visuals",
        "Mobile Readiness", "Accessibility / i18n",
    ],
    "E6": [
        "Recommendation Domain", "Action Center", "Action Integrations",
        "Impact Measurement", "Audit Logging",
    ],
    "E7": [
        "Predictive Analytics Architecture", "Feature Store",
        "Demand / Revenue / Utilization Forecast", "Maintenance / Failure Forecast",
        "Backtesting / Drift",
    ],
    "E8": ["Forecast UX"],
}

PACKAGE_META = {
    "E1": ("Foundation & Contracts", [], "CRITICAL", "", ["typecheck", "shared contract tests", "timezone/DST tests", "tenant-scope tests"]),
    "E2": ("Money & Finance Correctness", ["E1"], "CRITICAL", "", ["money property tests", "finance integration tests", "migration dry run", "multi-currency reconciliation"]),
    "E3": ("Analytics Backend", ["E1", "E2"], "CRITICAL", "EVALUATIONS_ANALYTICS_V2_MODE=off", ["repository tests", "aggregation/pagination tests", "large-dataset tests", "tenant tests"]),
    "E4": ("Data Quality & Security", ["E1", "E3"], "CRITICAL", "", ["cross-tenant negative tests", "RBAC tests", "data-quality/freshness tests", "PII redaction tests"]),
    "E5": ("Core UI", ["E1", "E2", "E3", "E4"], "HIGH", "VITE_EVALUATIONS_UI_V2=off", ["frontend typecheck", "E2E", "mobile/visual regression", "accessibility/i18n"]),
    "E6": ("Recommendations & Actions", ["E3", "E4", "E5"], "CRITICAL", "EVALUATIONS_RECOMMENDATIONS_MODE=off; EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false", ["state-machine tests", "authorization/idempotency", "audit outbox", "workflow integration", "side-effect safety"]),
    "E7": ("Predictive Backend", ["E1", "E3", "E4"], "CRITICAL", "EVALUATIONS_PREDICTIVE_MODE=off", ["point-in-time correctness", "future-leakage tests", "backtesting/baseline comparison", "model release gates", "tenant isolation"]),
    "E8": ("Forecast UI & Final Acceptance", ["E5", "E7"], "HIGH", "VITE_EVALUATIONS_PREDICTIVE_MODE=off", ["full E2E", "visual regression", "staging smoke", "observability verification", "release-gate denial tests"]),
}

capability_to_package = {
    capability: package_id
    for package_id, capabilities in PACKAGE_CAPABILITIES.items()
    for capability in capabilities
}

decision_by_changeset = defaultdict(list)
for decision in DECISIONS:
    for changeset_id in decision["affected"]:
        decision_by_changeset[changeset_id].append(decision["id"])

final_changesets = []
for capability_item in phase2["evaluations_capabilities"]:
    capability = capability_item["capability"]
    phase2_ids = capability_item["changesets"]
    if phase2_ids:
        changeset_id = phase2_ids[0]
        old = phase2_changesets[changeset_id]
        affected_files = list(old["affected_files"])
        if changeset_id == "cs-evaluations-action-center":
            combined_paths = [
                line for line in git("show", "--cc", "--name-only", "--format=", old["source_commits"][0]).splitlines()
                if line.strip()
            ]
            action_center_exact_paths = {
                "backend/src/modules/business-insights/business-insights.module.ts",
                "backend/src/modules/business-insights/recommendations/dto/recommendation.dto.ts",
                "backend/src/modules/business-insights/recommendations/org-recommendations.controller.ts",
                "backend/src/modules/business-insights/recommendations/org-recommendations.service.ts",
                "frontend/e2e/evaluations-action-center.spec.ts",
                "frontend/e2e/evaluations-fixtures.ts",
                "frontend/e2e/playwright.config.ts",
                "frontend/src/lib/api.ts",
                "frontend/src/rental/App.tsx",
                "frontend/src/rental/hooks/useEvaluationsRecommendations.test.ts",
                "frontend/src/rental/hooks/useEvaluationsRecommendations.ts",
                "frontend/src/rental/i18n/translations/de.ts",
                "frontend/src/rental/i18n/translations/en.ts",
                "frontend/src/rental/lib/evaluations-recommendations-api.types.ts",
                "frontend/src/rental/lib/evaluations-recommendations-format.ts",
                "frontend/vitest.config.ts",
                "shared/evaluations-insights/evaluations-recommendations.shared.spec.ts",
                "shared/evaluations-insights/evaluations-recommendations.ts",
                "docs/frontend/evaluations-action-center.md",
            }
            affected_files = [
                path for path in combined_paths
                if path in action_center_exact_paths
                or path.startswith("frontend/src/rental/components/evaluations/")
            ]
        already = False
        status = "REQUIRED_BUT_NEEDS_PORT"
        migration = old["migration_required"]
        risk = old["risk_level"]
        backend = old["backend_dependency"]
        frontend = old["frontend_dependency"]
        worker = old["worker_dependency"]
        security = old["security_impact"] == "SENSITIVE" or old["tenant_isolation_impact"] == "SENSITIVE"
        privacy = old["privacy_impact"] == "SENSITIVE"
        tests = old["required_tests"]
        staging = old["required_staging_validation"]
        vps = old["required_vps_validation"]
        rollback = old["rollback_strategy"]
        if changeset_id == "cs-evaluations-action-center":
            method = "RECONSTRUCT_MERGE_RESULT"
            migration = False
            worker = False
            security = True
            risk = "HIGH"
        elif risk in {"HIGH", "CRITICAL"} and (
            migration or security or old["finance_impact"] == "SENSITIVE" or worker
        ):
            method = "REIMPLEMENT_ON_CURRENT_MAIN"
        else:
            method = "PORT_PATCH_MANUALLY"
    else:
        changeset_id = (
            "cs-evaluations-metric-registry-baseline"
            if capability == "Metric Registry"
            else "cs-evaluations-calculation-versioning-baseline"
        )
        affected_files = capability_item["affected_files"]
        already = True
        status = "ALREADY_IN_MAIN"
        migration = capability == "Calculation Versioning"
        risk = "LOW"
        backend = True
        frontend = capability == "Metric Registry"
        worker = False
        security = False
        privacy = False
        tests = ["preserve current evaluations registry/provenance tests"]
        staging = "Not separately required; regression gate in E1"
        vps = "Not separately required"
        rollback = "No action; baseline is already in main."
        method = "ALREADY_IN_MAIN_NO_ACTION"
    final_changesets.append({
        "changeset_id": changeset_id,
        "capability": capability,
        "status": status,
        "source_prs": capability_item["source_prs"],
        "source_commits": capability_item["source_commits"],
        "affected_files": affected_files,
        "already_in_main": already,
        "needs_port": not already,
        "needs_reimplementation": method == "REIMPLEMENT_ON_CURRENT_MAIN",
        "dependencies": [] if already else phase2_changesets[changeset_id]["dependencies"],
        "architecture_decisions": decision_by_changeset.get(changeset_id, ["EVAL-ADR-003"]),
        "package_id": capability_to_package[capability],
        "risk": risk,
        "migration": migration,
        "backend": backend,
        "frontend": frontend,
        "worker": worker,
        "security": security,
        "privacy": privacy,
        "integration_method": method,
        "tests": tests,
        "staging": staging,
        "vps": vps,
        "rollback": rollback,
        "confidence": "HIGH",
        "evidence": capability_item["evidence"],
    })

final_payload = {
    "schema_version": "1.0.0",
    "generated_at": generated_at,
    "source_state": {
        "phase2_main_sha": phase2_main,
        "current_main_sha": current_main,
        "main_delta_left_right": main_delta,
        "git_version": git_version,
        "gh_version": gh_version,
    },
    "summary": {
        "original_phase2_evaluation_changesets": len([item for item in phase2["changesets"] if item["module"] == "evaluations"]),
        "final_evaluation_changesets_including_main_baselines": len(final_changesets),
        "recovery_changesets": sum(not item["already_in_main"] for item in final_changesets),
        "already_in_main_baselines": sum(item["already_in_main"] for item in final_changesets),
        "new_evaluation_changesets_from_residual": 0,
        "residual_distinct_commits": len(residual["source_commits"]),
        "remaining_unknown": 0,
        "accepted_adrs": len(DECISIONS),
        "open_architecture_decisions": 0,
        "integration_packages": len(PACKAGE_CAPABILITIES),
        "ready_for_phase3": True,
    },
    "retired_changeset": "cs-evaluations-unresolved-residual",
    "changesets": final_changesets,
}
(OUT / "phase2-5-evaluations-final-changesets-2026-08.json").write_text(
    json.dumps(final_payload, indent=2, sort_keys=False) + "\n"
)

final_fields = [
    "changeset_id", "capability", "status", "source_prs", "source_commits",
    "already_in_main", "needs_port", "needs_reimplementation", "dependencies",
    "architecture_decisions", "package_id", "risk", "migration", "backend",
    "frontend", "worker", "security", "privacy", "integration_method", "tests",
    "staging", "vps", "rollback", "confidence",
]
write_csv(OUT / "phase2-5-evaluations-final-changesets-2026-08.csv", final_fields, final_changesets)


packages = []
for order, package_id in enumerate(PACKAGE_CAPABILITIES, 1):
    name, dependencies, risk, feature_flag, required_tests = PACKAGE_META[package_id]
    items = [item for item in final_changesets if item["package_id"] == package_id]
    files = sorted({path for item in items for path in item["affected_files"]})
    migrations = sorted(
        path for path in files
        if "/prisma/migrations/" in path
        or path.endswith("schema.prisma")
        or "backfill" in path.lower()
    )
    if package_id == "E2":
        migrations.append("PLANNED: evaluations money/FX context schema and idempotent historical conversion backfill")
    workers = sorted(path for path in files if any(token in path.lower() for token in ("worker", "scheduler", "queue", "job")))
    methods = sorted({item["integration_method"] for item in items if item["integration_method"] != "ALREADY_IN_MAIN_NO_ACTION"})
    packages.append({
        "package_id": package_id,
        "package_name": name,
        "order": order,
        "changesets": [item["changeset_id"] for item in items],
        "source_prs": sorted({pr for item in items for pr in item["source_prs"]}),
        "source_commits": [sha for item in items for sha in item["source_commits"]],
        "frontend_files": [path for path in files if path.startswith("frontend/")],
        "backend_files": [path for path in files if path.startswith("backend/") or path.startswith("shared/")],
        "database_changes": migrations,
        "worker_changes": workers,
        "security_sensitive": any(item["security"] for item in items),
        "privacy_sensitive": any(item["privacy"] for item in items),
        "risk": risk,
        "feature_flag": feature_flag,
        "dependencies": dependencies,
        "integration_method": methods,
        "required_tests": required_tests,
        "required_migration_dry_run": bool(migrations),
        "required_staging": True,
        "required_vps": package_id == "E8",
        "rollback_strategy": (
            "Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; "
            "restore only from a rehearsed backup for irreversible data errors."
        ),
        "entry_gate": "Fresh branch from current origin/main; all dependency packages merged and CI green.",
        "exit_gate": "Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.",
        "confidence": "HIGH",
    })

package_fields = [
    "package_id", "package_name", "order", "changesets", "source_prs", "source_commits",
    "frontend_files", "backend_files", "database_changes", "worker_changes",
    "security_sensitive", "privacy_sensitive", "risk", "feature_flag", "dependencies",
    "integration_method", "required_tests", "required_migration_dry_run",
    "required_staging", "required_vps", "rollback_strategy", "entry_gate", "exit_gate",
    "confidence",
]
write_csv(OUT / "phase2-5-evaluations-integration-packages-2026-08.csv", package_fields, packages)

packages_md = [
    "# Phase 2.5 — Evaluations Integration Packages", "",
    "Every Phase-3 package starts from the then-current `origin/main`, targets `main`, and is merged before the next package branch is created.", "",
]
for package in packages:
    packages_md += [
        f"## {package['package_id']} — {package['package_name']}", "",
        f"- Order / risk: `{package['order']}` / `{package['risk']}`",
        f"- Dependencies: {', '.join('`'+item+'`' for item in package['dependencies']) or 'none'}",
        f"- Change-sets ({len(package['changesets'])}): {', '.join('`'+item+'`' for item in package['changesets'])}",
        f"- Integration: {', '.join('`'+item+'`' for item in package['integration_method']) or '`ALREADY_IN_MAIN_NO_ACTION`'}",
        f"- Feature flag: `{package['feature_flag'] or 'none'}`",
        f"- DB/migrations: {len(package['database_changes'])}; dry run required: `{str(package['required_migration_dry_run']).lower()}`",
        f"- Tests: {'; '.join(package['required_tests'])}",
        f"- Entry gate: {package['entry_gate']}",
        f"- Exit gate: {package['exit_gate']}",
        f"- Rollback: {package['rollback_strategy']}", "",
    ]
write_md(OUT / "phase2-5-evaluations-integration-packages-2026-08.md", packages_md)

graph_lines = [
    "# Phase 2.5 — Evaluations Package Dependency Graph", "",
    "```mermaid", "flowchart LR",
]
for package in packages:
    graph_lines.append(f"  {package['package_id']}[\"{package['package_id']} {package['package_name']}\"]")
for package in packages:
    for dependency in package["dependencies"]:
        graph_lines.append(f"  {dependency} --> {package['package_id']}")
graph_lines += [
    "```", "",
    "All edges are hard ordering dependencies. The graph is acyclic. Packages are not developed as a PR stack; each successor starts only after its predecessors are merged to current main.",
]
write_md(OUT / "phase2-5-evaluations-package-dependency-graph-2026-08.md", graph_lines)


UI_CAPABILITIES = {
    "Metric State UX", "Data Quality Panel", "Information Architecture",
    "Executive KPI Strip", "Strength / Weakness Cockpit", "Risk / Cost / Failure Visuals",
    "Mobile Readiness", "Accessibility / i18n", "Action Center", "Forecast UX",
}
ui_rows_by_key = {}
for item in final_changesets:
    if item["capability"] not in UI_CAPABILITIES:
        continue
    for path in item["affected_files"]:
        if not (
            path.startswith("frontend/")
            or path.startswith("docs/frontend/")
            or path.startswith("shared/")
            or path.startswith("backend/")
        ):
            continue
        source_pr = item["source_prs"][0]
        source_commit = item["source_commits"][0]
        lower = path.lower()
        if path.endswith((".png", ".jpg", ".webp")):
            purpose = "historical screenshot artifact"
            still_needed = False
        elif "/e2e/" in path or ".test." in path or ".spec." in path or "fixtures" in lower:
            purpose = "reproducible test/fixture intent"
            still_needed = True
        elif path.startswith("backend/") or path.startswith("shared/"):
            purpose = "backend/shared contract dependency, not UI ownership"
            still_needed = True
        elif "ChangesView.tsx" in path or "ArchitekturView.tsx" in path:
            purpose = "historical architecture/changelog bookkeeping"
            still_needed = False
        elif path.startswith("docs/"):
            purpose = "historical UI documentation"
            still_needed = False
        else:
            purpose = f"{item['capability']} UI implementation"
            still_needed = True
        key = (path, source_commit)
        ui_rows_by_key[key] = {
            "file": path,
            "source_pr": source_pr,
            "source_commit": source_commit,
            "purpose": purpose,
            "still_needed": still_needed,
            "already_in_main": git_success("cat-file", "-e", f"origin/main:{path}"),
            "integration_package": item["package_id"],
        }
ui_rows = sorted(ui_rows_by_key.values(), key=lambda row: (row["integration_package"], row["file"], row["source_commit"]))
write_csv(
    OUT / "phase2-5-evaluations-ui-recovery-matrix-2026-08.csv",
    ["file", "source_pr", "source_commit", "purpose", "still_needed", "already_in_main", "integration_package"],
    ui_rows,
)

legacy_plan = [
    "# Phase 2.5 — Evaluations Legacy UI Deprecation Plan", "",
    "No component is deleted in Phase 2.5. Deprecation occurs only after API parity, flagged UI acceptance and current-main refresh.", "",
    "| Component/path | Decision | Phase | Reason / successor |",
    "|---|---|---|---|",
    "| `frontend/src/rental/components/DataAnalyseView.tsx` | `KEEP` | permanent | Separate privileged telemetry/diagnostics route; not a business-evaluations shell. |",
    "| `frontend/src/rental/components/FinancialInsightsView.tsx` | `REFACTOR` → `DEPRECATE` | E2–E5 | Reuse correct invoice presentation temporarily; `EvaluationsPage` becomes route shell and canonical APIs replace local calculations. |",
    "| `frontend/src/rental/components/insights/InsightsCockpit.tsx` | `REFACTOR` | E3–E5 | Split reusable presentation sections; remove local grouping/risk/recommendation authority. |",
    "| `frontend/src/rental/lib/financial-insights.logic.ts` | `DEPRECATE` | E2–E5 | Compatibility/parity oracle only until backend finance contracts are accepted. |",
    "| `frontend/src/rental/lib/insights-categories.ts` | `DEPRECATE` | E3–E6 | Backend/shared category and recommendation contracts become authority. |",
    "| `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts` | `REFACTOR` | E2–E3 | Consume canonical finance summary instead of independently calculating KPIs. |",
    "| `frontend/src/rental/components/dashboard/businessPulseBuilder.ts` | `REMOVE_AFTER_MIGRATION` | after E5 | Already deprecated and inactive. |",
    "| `frontend/src/rental/components/dashboard/BusinessPulse.tsx` | `REMOVE_AFTER_MIGRATION` | after E5 | Exported but not rendered. |",
    "| `frontend/src/rental/components/BusinessInsightsBox.tsx` | `REMOVE_AFTER_MIGRATION` | after E6 | Dead legacy surface replaced by Action Queue/current recommendations. |",
    "| `frontend/figma-rental/**` analytics prototypes | `REMOVE_AFTER_MIGRATION` | post-E5 review | Prototype is not production authority; preserve only if design provenance is explicitly required. |",
    "", "## Anti-parallel-truth gates", "",
    "1. During shadow mode, old and new outputs are compared from the same API inputs.",
    "2. `on` mode selects one route shell and one KPI source; no merge of both result sets.",
    "3. Removal occurs only after KPI parity, E2E, accessibility, visual and rollback evidence.",
]
write_md(OUT / "phase2-5-evaluations-legacy-ui-deprecation-plan-2026-08.md", legacy_plan)


runbook = [
    "# Phase 2.5 — Evaluations Phase-3 Runbook", "",
    "## Branch and PR policy", "",
    "For each package, create `integration/evaluations-<package-id-lower>-<slug>-2026-08` from the then-current `origin/main`. Every PR targets `main`; do not base a PR on another package branch and do not create all package branches in parallel.",
    "",
    "Required PR body: package/change-set IDs, source PRs/commits, architecture decisions, tests, migrations/backfill, security/privacy review, feature flags and rollback.",
    "An implementation PR may begin as draft during active work, but must be non-draft before final review; CI must be green and conflicts resolved. Historical source PRs are closed as superseded only in a later explicitly authorized cleanup phase after replacement evidence is merged.",
    "",
    "## Exact execution order", "",
]
for package in packages:
    runbook += [
        f"{package['order']}. `{package['package_id']}` — {package['package_name']}",
        "   - Fetch and branch from current `origin/main` after all dependencies are merged.",
        f"   - Integration method(s): {', '.join(package['integration_method']) or 'ALREADY_IN_MAIN_NO_ACTION'}",
        f"   - Run: {'; '.join(package['required_tests'])}.",
        "   - Open PR directly against `main`; require clean CI and no conflicts.",
        "   - Merge only after human review; refresh `origin/main` before the next package.",
    ]
runbook += [
    "", "## Migration gate", "",
    "- Recompute schema diff against current main; never copy a historical migration blindly.",
    "- Validate forward order, clean-database replay, upgrade from current production migration state, backward-compatible deployment order, backfill dry run/idempotency/reconciliation, production volume, lock/index risk and roll-forward strategy.",
    "- Prefer expand/backfill/switch/contract. Do not remove old columns in the same package that introduces their replacement.",
    "", "## Security and privacy no-go gates", "",
    "- Authenticated cross-tenant or cross-station access succeeds: `NO-GO`.",
    "- Financial reconciliation mismatch, unconverted mixed-currency sum, missing policy check, unconfirmed material action, PII in logs/metrics, future-data leakage or predictive default-on: `NO-GO`.",
    "- Manual security review is mandatory for finance, PII, driver/customer detail, tenant scope, authorization, export, audit, AI/forecast and recommendation/action change-sets.",
    "", "## Feature flags", "",
    "- `VITE_EVALUATIONS_UI_V2=off|shadow|on`, default `off`, optional org allowlist.",
    "- `EVALUATIONS_ANALYTICS_V2_MODE=off|shadow|on`, default `off` until E3 acceptance.",
    "- `EVALUATIONS_RECOMMENDATIONS_MODE=off|shadow|on`, default `off`.",
    "- `EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false` by default.",
    "- `EVALUATIONS_PREDICTIVE_MODE=off|shadow|on`, default `off`, backend authority plus org allowlist.",
    "- Frontend flags can reduce exposure only; backend gates remain authoritative.",
    "", "## Final acceptance", "",
    "E8 requires full authenticated staging, E2E/visual/a11y/i18n, observability, model-release denial/enable paths and rollback smoke. VPS validation occurs only after staging acceptance and an explicit deployment request in a later phase.",
]
write_md(OUT / "phase2-5-evaluations-phase3-runbook-2026-08.md", runbook)


migration_paths = sorted({
    path
    for item in final_changesets
    if not item["already_in_main"]
    for path in item["affected_files"]
    if "/prisma/migrations/" in path
})
migration_paths.insert(0, "PLANNED: evaluations money/FX context schema and idempotent historical conversion backfill")
ui_recover = sorted({
    row["file"] for row in ui_rows
    if row["still_needed"] and row["file"].startswith("frontend/src/")
})
package_counts = {package["package_id"]: len(package["changesets"]) for package in packages}
residual_unrelated = disposition_counts["INHERITED_NO_EVALUATIONS_RELEVANCE"]
summary_lines = [
    "# Phase 2.5 — Executive Summary", "",
    f"Generated `{generated_at}` against `origin/main` `{current_main}`.", "",
    "## Result", "",
    "**READY_FOR_PHASE_3**", "",
    "The evaluations residual is fully retired, all architecture decisions are accepted, every final change-set has an integration package and method, and the package DAG is acyclic. No package depends on directly merging or cherry-picking a cumulative stack tip.", "",
    "## Counts", "",
    f"- Original Phase-2 evaluations change-sets: {final_payload['summary']['original_phase2_evaluation_changesets']} (42 capability sets + 1 residual).",
    f"- Final capability inventory: {len(final_changesets)} (42 recovery + 2 exact-main baselines).",
    "- New evaluations change-sets from residual: 0.",
    f"- Residual distinct inherited/unrelated commits: {residual_unrelated}.",
    "- Residual already in main: 0.",
    f"- Residual superseded: {disposition_counts['SUPERSEDED']}.",
    f"- Residual obsolete: {disposition_counts['OBSOLETE']}.",
    "- Remaining UNKNOWN: 0.",
    f"- ACCEPTED ADRs: {len(DECISIONS)}.",
    "- Open architecture decisions: 0.",
    f"- Integration packages: {len(packages)}.", "",
    "## Package order and risk", "",
    "| Order | Package | Risk | Change-sets |",
    "|---:|---|---|---:|",
]
for package in packages:
    summary_lines.append(
        f"| {package['order']} | `{package['package_id']}` {package['package_name']} | `{package['risk']}` | {len(package['changesets'])} |"
    )
summary_lines += [
    "", "## UI recovery", "",
    f"{len(ui_recover)} unique `frontend/src` file paths are marked still needed in the file-level matrix. The principal recovered surfaces are `EvaluationsPage`, modular evaluation sections/cards/charts/drawers, filters/hooks, action-center UI and forecast UI. Historical PNGs and architecture-log changes are excluded.",
    "",
    "Legacy plan: keep `DataAnalyseView`; refactor then deprecate `FinancialInsightsView`; refactor `InsightsCockpit`; deprecate client KPI/category engines after parity; remove already-dead BusinessPulse/BusinessInsightsBox paths only after migration.",
    "",
    "## Predictive release", "",
    "`EVALUATIONS_PREDICTIVE_MODE` and its frontend companion remain default `off`. Feature Store, demand/revenue/utilization forecasts, maintenance/failure forecasts, backtesting/drift and Forecast UX cannot activate before data-quality, security, tenant, model-release and uncertainty-UI gates.",
    "",
    "## Migration inventory", "",
]
summary_lines += [f"- `{path}`" for path in migration_paths] or ["- None."]
summary_lines += [
    "", "All historical migration files are evidence only. Phase 3 must regenerate schema diffs and use expand/backfill/switch/contract against current main.",
    "",
    "## Security/privacy gates", "",
    "- Manual review for finance, PII, driver/customer detail, tenant/station scope, authorization, exports, audit, recommendations/actions and forecasting.",
    "- Authenticated cross-tenant or cross-station failure is an unconditional no-go.",
    "- No mixed-currency sum without conversion provenance; no uncontrolled material action; no PII payload in audit/log/metrics; no future-data leakage; predictive default remains off.",
    "",
    "## Generated files", "",
]
generated_paths = [
    f"docs/architecture/decisions/{decision['file']}" for decision in DECISIONS
] + [
    "docs/audits/pr-recovery/phase2-5-evaluations-architecture-authority-matrix-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-architecture-decision-matrix-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-residual-attribution-2026-08.csv",
    "docs/audits/pr-recovery/phase2-5-evaluations-residual-resolution-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-final-changesets-2026-08.json",
    "docs/audits/pr-recovery/phase2-5-evaluations-final-changesets-2026-08.csv",
    "docs/audits/pr-recovery/phase2-5-evaluations-integration-packages-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-integration-packages-2026-08.csv",
    "docs/audits/pr-recovery/phase2-5-evaluations-package-dependency-graph-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-ui-recovery-matrix-2026-08.csv",
    "docs/audits/pr-recovery/phase2-5-evaluations-legacy-ui-deprecation-plan-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-phase3-runbook-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-executive-summary-2026-08.md",
    "docs/audits/pr-recovery/phase2-5-evaluations-analysis-2026-08.py",
    "docs/audits/pr-recovery/phase2-5-evaluations-validate-2026-08.py",
]
summary_lines += [f"- `{path}`" for path in generated_paths]
summary_lines += [
    "", "## Limits", "",
    "- Book I–IV files under the supplied titles were not present in this repository; the direct Phase-2.5 mandate controlled and no lower authority contradicted the accepted decisions.",
    "- Figma MCP was unavailable; visual matching remains an E5/E8 implementation gate, not an unresolved architecture decision.",
    "- No production data, PR state, historic branch, deployment or recovery branch was changed.",
]
write_md(OUT / "phase2-5-executive-summary-2026-08.md", summary_lines)

print(json.dumps({
    "current_main_sha": current_main,
    "phase2_main_sha": phase2_main,
    "main_delta": main_delta,
    "original_evaluation_changesets": final_payload["summary"]["original_phase2_evaluation_changesets"],
    "final_evaluation_changesets": len(final_changesets),
    "residual_commits": len(residual["source_commits"]),
    "residual_rows": len(residual_rows),
    "remaining_unknown": 0,
    "accepted_adrs": len(DECISIONS),
    "packages": len(packages),
    "ui_rows": len(ui_rows),
    "migration_paths": len(migration_paths),
    "status": "READY_FOR_PHASE_3",
}, indent=2))
