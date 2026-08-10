# Evaluations Predictive Feature Flag

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-009`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Predictive APIs and UI are disabled by default and activate only after model release gates.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.

## Authority evidence

- `frontend/src/rental/lib/notifications/notifications-v2-flag.ts — off/shadow/on and org-allowlist precedent`
- `backend/src/shared/stations/stations-v2-feature-flags.resolver.ts — backend flag resolver precedent`
- `docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — predictive backend absent`

## Decision

- Backend authority is `EVALUATIONS_PREDICTIVE_MODE=off|shadow|on`, default `off`, plus `EVALUATIONS_PREDICTIVE_ORG_ALLOWLIST`.
- Frontend `VITE_EVALUATIONS_PREDICTIVE_MODE` may only reduce exposure; it cannot override a disabled backend.
- Activation is organization-scoped, admin-only and requires feature pipeline, data-quality, backtesting, security, tenant-isolation and model-release gates plus uncertainty-capable UI.
- Shadow mode computes and validates without customer-visible forecast values or action side effects.
- Rollback sets mode to `off`; stored evidence is retained under policy and endpoints return explicit feature-disabled states.

## Non-negotiable constraints

- Forecasts, predictive risk and predictive recommendations share this backend release gate.
- No default-on behavior or missing-env fail-open.
- Activation/deactivation is audited.

## Impact

- Affected change-sets: `cs-evaluations-feature-store`, `cs-evaluations-demand-revenue-utilization-forecast`, `cs-evaluations-maintenance-failure-forecast`, `cs-evaluations-backtesting-drift`, `cs-evaluations-forecast-ux`
- Migration: No activation migration; data models may be deployed while serving disabled responses.
- Security/privacy: Admin-only activation after tenant/security/privacy attestation.

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
