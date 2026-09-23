# Evaluations UI and KPI Authority

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-003`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

The `financial-insights` route becomes a modular EvaluationsPage backed only by canonical analytics APIs.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance. Differences from current main or unmerged historical designs are implementation/migration gaps, not higher-authority vetoes; this ADR intentionally locks the Phase-3 target.

## Authority evidence

- `docs/audits/evaluations/evaluations-technical-inventory-2026-07.md — current routes and duplicate client calculations`
- `docs/architecture/analytics/evaluations-metric-registry.md — KPI single source of truth`
- `frontend/src/rental/App.tsx — current `financial-insights` and `data-analyse` view keys`
- `frontend/src/rental/components/FinancialInsightsView.tsx — current production shell`
- `frontend/src/rental/components/insights/InsightsCockpit.tsx — current business-insights consumer`

## Decision

- The canonical customer-facing route remains view key `financial-insights`; its target shell becomes `EvaluationsPage` through a controlled cutover.
- `DataAnalyseView` remains a separate privileged diagnostics surface and is not merged into customer analytics.
- Correct presentation components may be reused, but KPI values, groupings, filters and recommendation state come from canonical backend/shared contracts.
- `FinancialInsightsView` is refactored into temporary adapters and then deprecated. `InsightsCockpit` is refactored into modular sections. Client KPI engines become compatibility adapters and are removed after parity acceptance.
- No second KPI, money, recommendation or forecast truth may live in React components.

## Non-negotiable constraints

- Use `VITE_EVALUATIONS_UI_V2=off|shadow|on`, default `off`, with an optional org allowlist.
- Figma remains visual authority at Phase-3 implementation time; Figma MCP was unavailable during this planning run.
- Current #818 E2E/a11y conventions are retained and rebased onto the recovered UI.

## Impact

- Affected change-sets: `cs-evaluations-information-architecture`, `cs-evaluations-executive-kpi-strip`, `cs-evaluations-strength-weakness-cockpit`, `cs-evaluations-risk-cost-failure-visuals`, `cs-evaluations-data-quality-panel`, `cs-evaluations-mobile-readiness`, `cs-evaluations-accessibility-i18n`, `cs-evaluations-metric-state-ux`
- Migration: No DB migration; staged route/component cutover behind an organization-scoped UI flag.
- Security/privacy: The UI must not broaden backend permissions or infer tenant scope locally.

## Consequences

- Historical cumulative branches are evidence only and are not integration authorities.
- Phase 3 reimplements or manually ports the decision on current main with the package gates.
- Any future exception requires a superseding ratified ADR and calculation/contract version update.

## Verification

- Architecture matrix consistency check.
- Package dependency and source-coverage validation.
- Required automated, security, migration and staging gates from the Phase-3 runbook.

## Open questions

None. Runtime activation remains gated by tests and release evidence, not by an unresolved architecture choice.
