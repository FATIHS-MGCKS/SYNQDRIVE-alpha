# Evaluations Timezone and Business-Period Authority

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-002`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

UTC storage is evaluated through an explicit report timezone, station timezone, then organization timezone.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance. Differences from current main or unmerged historical designs are implementation/migration gaps, not higher-authority vetoes; this ADR intentionally locks the Phase-3 target.

## Authority evidence

- `backend/prisma/schema.prisma — Organization.timezone and Station.timezone`
- `docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — local-Date month-boundary gap`
- `docs/architecture/analytics/evaluations-calculation-versioning.md — periodStart/periodEnd provenance`

## Decision

- Timestamps are stored and exchanged in UTC. Business boundaries use an IANA timezone recorded in calculation provenance.
- Timezone precedence is: explicit report scope; unique station scope; organization timezone. User/browser timezone is presentation-only.
- A day is local midnight inclusive to next local midnight exclusive. A week is ISO Monday through next Monday. A month, quarter and year use local calendar boundaries.
- MTD/QTD/YTD start at the corresponding local calendar boundary and end at the report `asOf` instant. Rolling windows are explicit elapsed durations ending at `asOf`, not aliases for calendar periods.
- Previous comparable periods use the immediately preceding equal local-calendar period and clip to equivalent elapsed business time for in-progress comparisons.
- DST gaps and overlaps resolve through the IANA zone database; APIs return UTC bounds plus timezone and local labels so boundaries are reproducible.

## Non-negotiable constraints

- Invalid or ambiguous scope fails closed with a validation error.
- No browser-local `Date` boundary may define a business KPI.
- Timezone and period identifiers are part of cache keys and calculation provenance.

## Impact

- Affected change-sets: `cs-evaluations-timezone-period-model`, `cs-evaluations-filter-architecture`
- Migration: No mandatory data rewrite; period contracts and timezone validation are required.
- Security/privacy: Tenant/station scope and period scope must be evaluated together.

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
