# Evaluations Sensitive Read Auditing

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-008`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Routine aggregate reads are not audited; sensitive details, exports and administration are.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance. Differences from current main or unmerged historical designs are implementation/migration gaps, not higher-authority vetoes; this ADR intentionally locks the Phase-3 target.

## Authority evidence

- `backend/src/modules/business-audit/business-audit.service.ts — durable audit outbox`
- `docs/audits/iam-transactional-audit-outbox-2026-07.md — transactional audit pattern`
- `docs/remediation/master-admin-audit-log-hardening.md — privileged audit controls`
- `docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — mutation-only current coverage`
- `historical PR #817 audit-policy evidence — evaluations event catalog, redaction and 730-day retention target`

## Decision

- Normal aggregate KPI/summary reads do not create per-request audit events.
- Audit events are mandatory for customer/driver/employee detail analysis, sensitive customer drill-down, finance or PII export, admin diagnostics, recommendation writes, and forecast/model administration.
- Events record actor, organization, station scope where relevant, action, target type/opaque ID, policy decision, timestamp, correlation/idempotency key and result—never complete analytics or PII payloads.
- Use the existing transactional business/IAM audit outbox and central retention/access controls.
- The default retention target for evaluations sensitive-read and administration audit events is 730 days, subject to a stricter legal deletion or tenant policy; payload minimization remains mandatory.

## Non-negotiable constraints

- Export auditing is fail-closed before download materialization.
- Read-audit failures for sensitive details deny the operation when durable enqueue cannot be guaranteed.
- Metrics/log labels contain no tenant or entity identifiers.

## Impact

- Affected change-sets: `cs-evaluations-gdpr`, `cs-evaluations-audit-logging`, `cs-evaluations-action-center`, `cs-evaluations-roles-permissions`
- Migration: Audit event registry/outbox changes may be required; payload storage remains minimized.
- Security/privacy: Sensitive-read event minimization, integrity, retention and access review.

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
