# Phase 3 – E5.1A Quality Truth & Provenance Correction — Test Report (2026-08)

- `TESTED_CODE_SHA` = `61cf40945ee78d2e5236e06aae5def40f4e9c440`
- `PRE_E5_1A_HEAD` = `a93a958751539baadfec38441b1fa84eeba9f0f9`
- `CURRENT_MAIN_SHA` = `960365a9b095a54f4656947ac2067a104e56bd8a`
- PR #1025 (OPEN, DRAFT), same branch. No schema change. Quality calc version `evaluations-quality-e5-v1 → v2`.

## Corrections

1. **Freshness ≠ business recency.** No authoritative ingestion/observation/sync watermark exists for the E5 sources (see `phase3-e5-freshness-source-authority-matrix-2026-08.csv`), so pipeline freshness is now `UNKNOWN`; the business timestamps are exposed separately as `businessEventRecency`. A business with no recent events is no longer marked STALE (`BUSINESS_RECENCY_AS_FRESHNESS_COUNT = 0`, `UNPROVEN_FRESHNESS_AVAILABLE_COUNT = 0`). The bogus universal 3-day threshold is removed.
2. **Conservative roll-up.** `rollupQualityStatus` never upgrades: AVAILABLE only when every input is AVAILABLE; AVAILABLE+PARTIAL → PARTIAL, PARTIAL+PARTIAL → PARTIAL, AVAILABLE+STALE → PARTIAL (`QUALITY_STATUS_UPGRADE_COUNT = 0`).
3. **Composite provenance.** Each section declares `requiredSourceClasses`; PROVENANCE is COMPLETE only when every required class is present — e.g. Finance requires both `FINANCE_INVOICE` and `FINANCE_PAYMENT` (issued + paid revenue), so invoice-only is PARTIAL (`FALSE_COMPLETE_PROVENANCE_COUNT = 0`). Added `paymentsFreshness` (OrgInvoicePayment) tenant-scoped source.
4. Historical safety preserved: `businessEventRecency` is period-bounded; freshness never fabricated from a current snapshot (`CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT = 0`).

## Tests

| Suite | Tests | Result |
|---|---|---|
| `e5/domain/evaluations-quality.domain.spec.ts` | rewritten | PASS |
| `e5/evaluations-quality.service.spec.ts` | rewritten | PASS |
| `e5/evaluations-quality.postgres.integration.spec.ts` (live DB) | 3 | PASS |
| **E5 total** | **27** | **PASS** |

Mandatory coverage (STEP 13): no business activity 10 days → not stale (freshness UNKNOWN, not STALE); recent business event + no freshness authority → freshness not AVAILABLE; historical period → no fabricated freshness; AVAILABLE+PARTIAL / PARTIAL+PARTIAL / AVAILABLE+STALE roll-ups → never AVAILABLE; Finance invoice present + payment absent → provenance PARTIAL; invoice+payment present → COMPLETE; missing lineage → UNKNOWN (not healthy); E4 PARTIAL preserved through E5.

## Regression (no regression)

`npx jest src/modules/business-audit …evaluations-metrics …evaluations-analytics …evaluations-finance` → 37 passed suites, **445 passed, 4 skipped, 0 failed**. E1/E2/E3/E4 + E5A/B/C all PASS.

## Quality gates

Backend typecheck PASS · Nest build PASS · Prisma valid (no schema diff) · lint (E5) PASS · frontend typecheck PASS. Pre-existing global-red CI gates remain `PRE_EXISTING_IDENTICAL`/`ENVIRONMENT_SPECIFIC` vs `CURRENT_MAIN_SHA`. `NEW_E5_FAILURE_COUNT = 0`, `UNKNOWN_COUNT = 0`.

## Counters (all 0)

| Counter | Value |
|---|---|
| BUSINESS_RECENCY_AS_FRESHNESS_COUNT | 0 |
| UNPROVEN_FRESHNESS_AVAILABLE_COUNT | 0 |
| CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT | 0 |
| QUALITY_STATUS_UPGRADE_COUNT | 0 |
| FALSE_COMPLETE_PROVENANCE_COUNT | 0 |
| FALSE_FULL_COVERAGE_COUNT | 0 |
| QUALITY_FALSE_ZERO_COUNT | 0 |
| CROSS_TENANT_LINEAGE_LEAKAGE_COUNT | 0 |
| STATION_LINEAGE_SCOPE_LEAKAGE_COUNT | 0 |
| QUALITY_METADATA_PII_DUPLICATION_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## Calculation version

`evaluations-quality-e5-v1 → evaluations-quality-e5-v2` (material change: freshness semantics, conservative roll-up, composite provenance). Only the quality definition bumped.
