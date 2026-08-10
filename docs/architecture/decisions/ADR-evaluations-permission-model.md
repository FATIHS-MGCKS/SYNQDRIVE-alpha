# Evaluations Permission Model

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-007`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Evaluations capabilities extend the central module/operational permission model instead of creating a role engine.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.

## Authority evidence

- `backend/src/shared/auth/permission.constants.ts — canonical module keys`
- `backend/src/shared/auth/operational-permission.util.ts — granular action registry integration`
- `backend/src/modules/users/defaults/organization-role.defaults.ts — central role defaults`
- `docs/audits/evaluations/evaluations-technical-inventory-2026-07.md — current guard and station-scope gaps`

## Decision

- Add central module key `evaluations` and granular operational actions: `evaluations.summary.read`, `evaluations.finance.read`, `evaluations.receivables.read`, `evaluations.customer-detail.read`, `evaluations.driver-detail.read`, `evaluations.forecast.read`, `evaluations.data-quality.read`, `evaluations.recommendation.manage`, `evaluations.export`, and `evaluations.admin`.
- Actions map through the existing operational-permission registry to central membership permissions; no evaluations-specific role or assignment engine is allowed.
- Every endpoint enforces organization scope in service/repository queries. Station-scoped members receive only allowed-station aggregates and details.
- Aggregate permission does not imply customer/driver PII detail. Detail and export actions require their dedicated capabilities.

## Non-negotiable constraints

- Default roles are changed only through central versioned role defaults and impact review.
- MASTER_ADMIN access remains explicit and audited.
- Authenticated cross-tenant and cross-station negative tests are release gates.

## Impact

- Affected change-sets: `cs-evaluations-tenant-isolation`, `cs-evaluations-roles-permissions`, `cs-evaluations-analytics-contracts`, `cs-evaluations-gdpr`
- Migration: Permission defaults/versioned-role migration may be required; no parallel role tables.
- Security/privacy: Critical RBAC, organization, station and PII enforcement.

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
