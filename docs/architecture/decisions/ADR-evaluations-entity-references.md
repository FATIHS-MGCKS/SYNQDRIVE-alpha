# Evaluations Typed Entity References

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-004`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

A relational typed-reference authority is paired with immutable display snapshots.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance. Differences from current main or unmerged historical designs are implementation/migration gaps, not higher-authority vetoes; this ADR intentionally locks the Phase-3 target.

## Authority evidence

- `backend/prisma/schema.prisma — organization-scoped business entities and DashboardInsight persistence`
- `docs/architecture/analytics/evaluations-calculation-versioning.md — applied filters and lineage`
- `backend/src/shared/auth/permission.constants.ts — central permission authority`

## Decision

- Persist a normalized relation with `organizationId`, owner record ID, `entityType`, `entityId`, optional `stationId`, `relationType`, timestamps and a deterministic dedupe key.
- Use a hybrid read model: relational references are authority for scope, joins and drill-down; a versioned JSON display snapshot may preserve historical labels without becoming identity authority.
- Supported entity types are registry-controlled and include vehicle, booking, customer, station, service case, invoice, task and other explicitly added domain types.
- Writes resolve the referenced entity through its owning tenant-scoped service. A free JSON ID list is never sufficient authority.

## Non-negotiable constraints

- Unique constraints prevent duplicate owner/relation/entity tuples.
- Deletes use explicit retention/tombstone policy so historical analytics remain explainable.
- Backfill rows that cannot be verified are quarantined, not guessed.

## Impact

- Affected change-sets: `cs-evaluations-grouping-entity-references`, `cs-evaluations-analytics-contracts`, `cs-evaluations-recommendation-domain`, `cs-evaluations-action-center`
- Migration: Required: normalized reference table, indexes, validation and gradual backfill.
- Security/privacy: Critical tenant/entity ownership validation; cross-tenant reference is a release blocker.

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
