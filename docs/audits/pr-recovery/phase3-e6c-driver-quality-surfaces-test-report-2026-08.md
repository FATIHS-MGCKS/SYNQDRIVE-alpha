# Phase 3 — E6C Driver Influence + Data Quality Surfaces — Test Report (2026-08)

- Base: `PRE_E6C_SHA = 4393b9c1`. Frontend-only change.

## Quality gates

| Gate | Command | Result |
|------|---------|--------|
| Frontend typecheck | `npx tsc -b` | PASS (exit 0) |
| Frontend production build | `npx vite build` | PASS |
| Targeted E6 lint | `eslint src/rental/components/evaluations/ src/rental/hooks/useEvaluationsFinanceBundle.ts` | PASS (0) |

`ESLINT_NEW_ERROR_COUNT = 0` for all new/changed E6C TS/TSX. E2E specs: the flow spec
carries 2 pre-existing `no-empty-pattern` findings in the E6B `beforeEach(({}, …))`
blocks — identical with and without E6C (A/B verified) →
`PRE_EXISTING_IDENTICAL_NO_REGRESSION` (zero new from E6C).

## Automated tests

New E6C render/logic suites:

| Suite | Tests | Result |
|-------|-------|--------|
| `components/evaluations/DataQualityPanel.render.test.tsx` | 9 | PASS |
| `components/evaluations/DriverInfluenceSection.render.test.tsx` | 12 | PASS |

Targeted acceptance run
(`src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`):
- Test files: 12 passed / 12
- Tests: 99 passed / 99 (0 failed, 0 skipped)

Broader regression (finance adapter, finance navigation, legacy `FinancialInsightsView`
+ `InsightsCockpit` render tests): 4 files / 46 tests, all PASS.

### Data Quality coverage (mandated)
1. all five dimensions render distinctly ✓
2. UNKNOWN does not become COMPLETE/healthy ✓
3. UNAVAILABLE is not zero ✓
4. no global quality score appears ✓
5. pipeline freshness and business-event recency have separate labels ✓
6. unknown pipeline freshness stays UNKNOWN even with recent business events ✓
7. null station-scoped freshness/recency/lineage render neutrally ✓
8. coverage null is not zero ✓
9. lineage `sourceRef` preserved verbatim, no entity reconstruction ✓
10. generic 404 → neutral NOT_FOUND copy ✓

### Driver Influence coverage (mandated)
1. no driver request before reveal ✓
2. exactly one request after first reveal ✓
3. collapse/reopen issues no second request ✓
4. full tier renders driverRef verbatim, server order ✓
5. pseudonymous tier renders the pseudonym verbatim (not resolved) ✓
6. none tier renders no driver references ✓
7. fail-closed reason (e.g. PERSON_LEVEL_ACCESS_DENIED) remains visible ✓
8. associationShare + sampleSize render without re-ranking ✓
9. disclaimer + confounders render ✓
10. no causal language appears ✓
11. empty factors → qualified neutral copy ✓
12. 403 / generic 404 / ERROR remain distinct ✓

## E2E (Playwright)

`E2E = ENVIRONMENT_SPECIFIC` — Playwright browsers are not installed in the Cloud Agent
sandbox, so the flow could not be executed locally (validated in CI). Fixtures + spec
were updated: `evaluations-fixtures.ts` now returns a non-empty E5 quality report with
all five dimensions, separate freshness vs business-event recency, coverage and lineage,
plus a direct driver-analysis response and a lazy-request counter; `evaluations-flow.spec.ts`
asserts Data Quality is visible, the driver request is lazy (0 before reveal, 1 after,
no refetch on collapse/reopen), and no horizontal overflow. This is not an implementation
failure — unit/render coverage passes and the fixture/spec are correctly updated.

## Required E6C counters (all 0 unless noted)

```
INITIAL_E4_SUMMARY_REQUEST_COUNT = 1
INITIAL_E3_FINANCE_REQUEST_COUNT = 1
INITIAL_E5_QUALITY_REQUEST_COUNT = 1
INITIAL_DRIVER_ANALYSIS_REQUEST_COUNT = 0
POST_REVEAL_DRIVER_ANALYSIS_REQUEST_COUNT = 1
DUPLICATE_CANONICAL_REQUEST_COUNT = 0
N_PLUS_ONE_REQUEST_COUNT = 0
SUMMARY_EMBEDDED_DRIVER_RENDER_COUNT = 0
CLIENT_SIDE_QUALITY_SCORE_COUNT = 0
CLIENT_SIDE_QUALITY_DERIVATION_COUNT = 0
QUALITY_DIMENSION_COLLAPSE_COUNT = 0
QUALITY_STATUS_UPGRADE_COUNT = 0
PIPELINE_FRESHNESS_BUSINESS_RECENCY_CONFLATION_COUNT = 0
RAW_LINEAGE_ID_RECONSTRUCTION_COUNT = 0
CLIENT_SIDE_PII_AUTHORITY_COUNT = 0
CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT = 0
CLIENT_SIDE_PERSON_ENTITY_JOIN_COUNT = 0
DRIVER_CAUSAL_CLAIM_COUNT = 0
DRIVER_FACTOR_REORDER_COUNT = 0
UNAUTHORIZED_DRIVER_REFERENCE_RENDER_COUNT = 0
GENERIC_404_FEATURE_DISABLED_CLAIM_COUNT = 0
SECOND_EVALUATIONS_PAGE_COUNT = 0
LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT = 0
RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT = 0
NEW_DUPLICATE_BUSINESS_CALCULATION_COUNT = 0
E7_RUNTIME_SCOPE_COUNT = 0
E8_RUNTIME_SCOPE_COUNT = 0
E9_RUNTIME_SCOPE_COUNT = 0
E6D_PAGE_WIDE_REDESIGN_COUNT = 0
BACKEND_RUNTIME_CHANGE_COUNT = 0
PRISMA_CHANGE_COUNT = 0
MIGRATION_CHANGE_COUNT = 0
PRODUCTION_CONFIG_CHANGE_COUNT = 0
PRODUCTION_DEPLOYMENT_COUNT = 0
IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
```
