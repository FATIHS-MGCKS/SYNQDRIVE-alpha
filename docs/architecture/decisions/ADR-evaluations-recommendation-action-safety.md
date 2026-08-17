# Evaluations Recommendation Action Safety

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-005`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Navigation is direct; material writes use central policies, confirmation, idempotency and audit.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance. Differences from current main or unmerged historical designs are implementation/migration gaps, not higher-authority vetoes; this ADR intentionally locks the Phase-3 target.

## Authority evidence

- `backend/src/modules/tasks — canonical Task Domain services`
- `backend/src/modules/workflows — canonical workflow execution and policy services`
- `backend/src/modules/business-audit/business-audit.service.ts — transactional audit outbox`
- `docs/compliance/workflow-audit-and-ai-transparency-2026-07.md — controlled automation evidence`

## Decision

- Read/navigation actions may open a vehicle, booking, invoice or data source directly after normal read authorization.
- Material writes—task/service-case creation, assignment, workflow start, message/customer contact, finance, booking or vehicle-state changes—require tenant and entity checks, central permission policy, an idempotency key, audit event and explicit user confirmation unless an existing approved workflow policy provides maker-checker approval.
- Recommendations are evidence and proposed intent, not an execution engine. Side effects delegate to canonical Task, Workflow, Notification, Booking, Invoice or Vehicle services.
- AI-generated recommendations can never bypass policy or confirmation and cannot fabricate missing entity references.

## Non-negotiable constraints

- Action state transitions are versioned and auditable.
- Retries are idempotent and fail closed.
- Financial, customer-contact and booking/vehicle-state actions always require explicit confirmation.

## Impact

- Affected change-sets: `cs-evaluations-recommendation-domain`, `cs-evaluations-action-center`, `cs-evaluations-action-integrations`, `cs-evaluations-impact-measurement`, `cs-evaluations-audit-logging`
- Migration: Recommendation/impact schema migrations require redesign on current main.
- Security/privacy: Critical authorization and side-effect safety; no autonomous irreversible action.

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
