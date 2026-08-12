# Phase 3 – E5A Data Quality, Freshness & Lineage — Implementation Report (2026-08)

## Revision

- `E5_BASE_MAIN_SHA` = `960365a9b095a54f4656947ac2067a104e56bd8a` (E4 merge; E4 confirmed ancestor; no drift)
- Branch = `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`
- `TESTED_CODE_SHA` = `07e7e59aa2f3b2d4bb0c638ec285ca82d81a22c4`
- No Prisma schema change (`E5_SCHEMA_MIGRATION_REQUIRED = NO`).

## Historical source reconstruction

The E5 package mapping was reconstructed unambiguously from the Phase-2.6 recovery-authority branch `audit/repository-pr-recovery-evaluations-phase2-6-2026-08` (`phase2-6-evaluations-final-package-matrix-2026-08.csv` + `phase2-unique-changesets-2026-08.csv`). E5 = "Quality, Privacy, Authorization & Audit" (topological order 5; hard deps E2;E4) with six changesets. E5A implements the quality subset (see `phase3-e5-source-reconstruction-matrix-2026-08.csv`):

- `cs-evaluations-data-quality` — PR #788, `2c32183956d3aa4ce56cd3ce4b02f33bcb3dc9b4`
- `cs-evaluations-freshness-lineage` — PR #790, `5de5e0295658ae3e23f4025e9c316b54193d2872`
- `cs-evaluations-metric-state-ux` — PR #792, `c82e449362177a4c9d30ae308558464a2ab934f4` (truthful-availability intent only; historical UI badges are E6)

Deferred to E5B/E5C: `cs-evaluations-gdpr` (#815), `cs-evaluations-roles-permissions` (#816), `cs-evaluations-audit-logging` (#817). Historical commits are evidence only — no cherry-pick, no stack merge.

## Architecture (governance layer, not a second engine)

`request → E2 resolveAuthorizedScope → E1 period → EvaluationsQualityService → (E4 EvaluationsInsightsService sections) + tenant-scoped freshness repository → quality report`. E5 consumes the E4 section outputs (status/coverage) and E1 freshness/coverage shapes; it never recomputes a metric, money, period, or status. `PARALLEL_QUALITY_TRUTH_COUNT = 0`. New module `backend/src/modules/evaluations-analytics/e5/`; endpoint `GET /organizations/:orgId/evaluations/analytics/insights/quality` (same guards + `EvaluationsAnalyticsFeatureGuard` + `evaluations:read`).

## Quality dimensions (no global score)

Distinct dimensions `FRESHNESS`, `COMPLETENESS`, `PROVENANCE`, `VALIDITY`, `TEMPORAL_APPLICABILITY` with conservative states `COMPLETE|PARTIAL|UNKNOWN|UNAVAILABLE`. No universal 0–100 score (`UNSUPPORTED_GLOBAL_QUALITY_SCORE_COUNT = 0`). Aggregation is weakest-wins.

## Freshness semantics

Each freshness claim reuses the E1 `EvaluationsSourceFreshness` (`newestSourceAt`, `oldestSourceAt`, `lastSuccessfulImportAt`=null, `evaluatedAt`, `state`). The temporal reference is `evaluatedAt` for a live/current period but the **period boundary** for a historical period, so a current snapshot is never presented as historical freshness (`CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT = 0`). Source business timestamps are used per source class (invoice `invoiceDate`, booking `startDate`, service `completedAt`, damage `repairedAt`, telemetry `lastSeenAt` current-only) — never a blanket `createdAt`.

## Coverage / completeness

Reuses the E4 section coverage. `COMPLETE` requires `ratio === 1` with no `missingSources`; E4 limitations (eligibility/station/possession/blocked/currency) keep it PARTIAL (`FALSE_FULL_COVERAGE_COUNT = 0`). Missing/unsupported/stale never becomes 0/healthy (`QUALITY_FALSE_ZERO_COUNT = 0`).

## Truthful availability

The quality section status mirrors the underlying E4/E3 status verbatim; a quality wrapper never upgrades PARTIAL/UNAVAILABLE/STALE → AVAILABLE (`QUALITY_STATUS_UPGRADE_COUNT = 0`).

## Lineage (tenant-safe)

Each served org-scoped section exposes lineage refs: source category → opaque `org:<orgId>:<Model>` token → effective business timestamp → calculationVersion → reason. Only source-CLASS tokens are emitted — never raw record ids, PII, document content, or cross-tenant/out-of-station identifiers (`CROSS_TENANT_LINEAGE_LEAKAGE_COUNT = 0`, `QUALITY_METADATA_PII_DUPLICATION_COUNT = 0`). Station-scoped requests do not run org-wide freshness/lineage reads and emit no lineage (`STATION_LINEAGE_SCOPE_LEAKAGE_COUNT = 0`); the underlying E4 sections are already fail-closed.

## Determinism

Pure domain; the only wall-clock input is `evaluatedAt`/`generatedAt`. Same facts/scope/period/version → same report (`NON_DETERMINISTIC_QUALITY_COUNT = 0`).

## Deferrals

E5B (privacy/GDPR), E5C (roles/permissions, audit logging) not started. E6–E9 not started. No UI redesign.
