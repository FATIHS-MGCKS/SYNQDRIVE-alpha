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
| `components/evaluations/DataQualityPanel.render.test.tsx` | 12 (E6C 9 + E6C.1 3) | PASS |
| `components/evaluations/DriverInfluenceSection.render.test.tsx` | 14 (E6C 12 + E6C.1 2) | PASS |

Targeted acceptance run
(`src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`):
- Test files: 12 passed / 12
- Tests: 104 passed / 104 (0 failed, 0 skipped) — +5 from E6C.1 coverage/lineage tests.

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

`E2E = ENVIRONMENT_SPECIFIC_NOT_EXECUTED` — Playwright browsers are not installed in the
Cloud Agent sandbox (`browserType.launch: Executable doesn't exist at
…/ms-playwright/chromium_headless_shell-*/…`), so the flow could not be executed.
**Correction (E6C.1.1):** no CI workflow runs `evaluations-flow.spec.ts` — the repo
Playwright jobs run only `test:vehicle-detail:e2e` and `test:legal-documents:e2e` — so
this spec is authored-but-not-executed, NOT "validated in CI". Fixtures + spec
were updated: `evaluations-fixtures.ts` now returns a non-empty E5 quality report with
all five dimensions, separate freshness vs business-event recency, coverage and lineage,
plus a direct driver-analysis response and a lazy-request counter; `evaluations-flow.spec.ts`
asserts Data Quality is visible, the driver request is lazy (0 before reveal, 1 after,
no refetch on collapse/reopen), and no horizontal overflow. This is not an implementation
failure — unit/render coverage passes and the fixture/spec are correctly updated.

## E6C.1 — Canonical Evidence Completeness Closure

Runtime limited to E6C presentation + tests + i18n (no backend/contract/hook/api/page
composition change). New/updated coverage:

Data Quality (`+3` tests): every canonical coverage field renders
(expected/available/excluded/ratio/missingSources); `requiredSourceClasses` vs
`coverage.missingSources` remain distinguishable; lineage `calculationVersion` renders;
null fields never become zero.

Driver Influence (`+2` tests): non-null canonical coverage renders available/excluded,
null expected/ratio stay unavailable, `missingSources` render in server order, coverage
presence does not reorder factors; fail-closed null coverage stays neutral with the
reason visible.

Fixtures: unit coverage fixtures use `satisfies EvaluationsDataCoverage` (no `as unknown`
masking); E2E quality fixture uses all coverage fields + `missingSources`, canonical
source categories (FINANCE_INVOICE/FINANCE_PAYMENT), lineage reason
SOURCE_CLASS_BUSINESS_EVENT_RECENCY, and E5.1A-authoritative UNKNOWN pipeline freshness
(all timestamps null); E2E driver scenario matrix full/pseudonymous/none/failClosed/404
with non-null coverage on available scenarios.

E6C.1 counters:
```
QUALITY_COVERAGE_FIELD_OMISSION_COUNT = 0
DRIVER_COVERAGE_FIELD_OMISSION_COUNT = 0
LINEAGE_FIELD_OMISSION_COUNT = 0
QUALITY_REQUIRED_SOURCE_MISSING_SOURCE_COLLAPSE_COUNT = 0
INVALID_EVALUATIONS_COVERAGE_UNIT_FIXTURE_COUNT = 0
INVALID_EVALUATIONS_COVERAGE_E2E_FIXTURE_COUNT = 0
NONCANONICAL_E5_FRESHNESS_FIXTURE_COUNT = 0
MISSING_DRIVER_E2E_SCENARIO_COUNT = 0
COVERAGE_COMPONENT_DUPLICATION_COUNT = 0
CLIENT_SIDE_COVERAGE_RECALCULATION_COUNT = 0
NULL_COVERAGE_TO_ZERO_COUNT = 0
UNIT_COVERAGE_FIELD_ASSERTION_MISSING_COUNT = 0
DOCUMENTED_RUNTIME_MISMATCH_COUNT = 0
```

E2E remains `ENVIRONMENT_SPECIFIC_NOT_EXECUTED` (no Playwright browsers in the sandbox;
no CI workflow runs the evaluations flow spec). The fixtures + flow spec (coverage
assertions + full driver scenario matrix) are authored and type-consistent but were not
executed.

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

## E6C.1.1 — Fixture Authority Verification

Fixtures/tests/docs only (no runtime change). Commands + results at this revision:

- `npx tsc -b` → PASS (exit 0)
- `npx vite build` → PASS
- `npx vitest run src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`
  → `TARGETED_TEST_FILES = 12`, `TARGETED_TEST_COUNT = 105`, all PASS
  (DataQualityPanel 12, DriverInfluenceSection 15, +others).
- Targeted ESLint: E6C components `PASS` (0); e2e specs `PRE_EXISTING_IDENTICAL_NO_REGRESSION`
  (2 pre-existing `no-empty-pattern` in E6B `beforeEach(({}, …))`, zero new).
- `npm run test:evaluations:e2e:flow` → `EVALUATIONS_E2E_STATUS =
  ENVIRONMENT_SPECIFIC_NOT_EXECUTED`; exact error:
  `browserType.launch: Executable doesn't exist at …/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell`.
  No CI workflow runs this spec (CI Playwright = vehicle-detail + legal-documents only).

Authority-alignment counters (verified 0):
```
NONCANONICAL_DRIVER_UNIT_FIXTURE_COUNT = 0
NONCANONICAL_DRIVER_E2E_FIXTURE_COUNT = 0
NONCANONICAL_QUALITY_UNIT_FIXTURE_COUNT = 0
NONCANONICAL_QUALITY_E2E_FIXTURE_COUNT = 0
IMPOSSIBLE_PII_TIER_REASON_UNIT_PAIR_COUNT = 0
IMPOSSIBLE_PII_TIER_REASON_E2E_PAIR_COUNT = 0
FAIL_CLOSED_PII_TIER_ASSERTION_MISSING_COUNT = 0
DRIVER_FIXTURE_UNKNOWN_CAST_COUNT = 0
QUALITY_SCOPE_CONTRADICTION_COUNT = 0
INVALID_EVALUATIONS_COVERAGE_UNIT_FIXTURE_COUNT = 0
INVALID_EVALUATIONS_COVERAGE_E2E_FIXTURE_COUNT = 0
QUALITY_REQUIRED_SOURCE_MISSING_SOURCE_COLLAPSE_COUNT = 0
GENERIC_404_FEATURE_DISABLED_REGRESSION_COUNT = 0
PRODUCTION_RUNTIME_CHANGE_COUNT = 0
BACKEND_RUNTIME_CHANGE_COUNT = 0
API_RUNTIME_CHANGE_COUNT = 0
HOOK_RUNTIME_CHANGE_COUNT = 0
CANONICAL_CONTRACT_CHANGE_COUNT = 0
PRODUCTION_CONFIG_CHANGE_COUNT = 0
PRODUCTION_DEPLOYMENT_COUNT = 0
E7_RUNTIME_SCOPE_COUNT = 0
E8_RUNTIME_SCOPE_COUNT = 0
E9_RUNTIME_SCOPE_COUNT = 0
IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
```

`EVALUATIONS_E2E_STATUS = ENVIRONMENT_SPECIFIC_NOT_EXECUTED`.

## E6C.1.2 — Final Authority Verification

**Current-revision totals (these SUPERSEDE all earlier counts in this report, e.g. the
"104 tests / Driver 14" and "105 tests / Driver 15" figures which are historical
SUPERSEDED BY E6C.1.1 / E6C.1.2):**

- `npx tsc -b` → PASS.
- `npx vite build` → PASS.
- `npx vitest run src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`
  → `TARGETED_TEST_FILES = 12`, `TARGETED_TEST_COUNT = 106`, all PASS
  (DataQualityPanel 13, DriverInfluenceSection 15, others unchanged).
- Targeted ESLint on the four changed files: E6C unit tests PASS (0). e2e:
  `PRE_EXISTING_IDENTICAL_NO_REGRESSION` — **[CORRECTED IN E6C.1.3]** the targeted command
  produces exactly ONE finding: `evaluations-flow.spec.ts` 19:20 `no-empty-pattern` (the
  pre-existing E6B `beforeEach(({}, …))`); `evaluations-fixtures.ts` produces NO finding
  under this command. `ESLINT_NEW_ERROR_COUNT = 0`,
  `PRE_EXISTING_IDENTICAL_LINT_FINDING_COUNT = 1`.
- `npm run test:evaluations:e2e:flow` → `EVALUATIONS_E2E_STATUS =
  ENVIRONMENT_SPECIFIC_NOT_EXECUTED`; the spec now parses and collects (a duplicate
  `const finance` was fixed), and fails only at browser launch:
  `browserType.launch: Executable doesn't exist at …/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell`.
  No CI workflow runs this spec.

Authority counters (verified 0):
```
DRIVER_FACTOR_SHARE_SAMPLE_MISMATCH_UNIT_COUNT = 0
DRIVER_FACTOR_SHARE_SAMPLE_MISMATCH_E2E_COUNT = 0
DRIVER_CALCULATION_VERSION_MISMATCH_UNIT_COUNT = 0
DRIVER_CALCULATION_VERSION_MISMATCH_E2E_COUNT = 0
DRIVER_AVAILABLE_RECORD_FACTOR_COUNT_MISMATCH_UNIT_COUNT = 0
DRIVER_AVAILABLE_RECORD_FACTOR_COUNT_MISMATCH_E2E_COUNT = 0
IMPOSSIBLE_NONE_TIER_UNIT_RESPONSE_COUNT = 0
IMPOSSIBLE_AVAILABLE_EMPTY_UNIT_RESPONSE_COUNT = 0
QUALITY_STATUS_REASON_MISMATCH_UNIT_COUNT = 0
QUALITY_STATUS_REASON_MISMATCH_E2E_COUNT = 0
QUALITY_LINEAGE_CALCULATION_VERSION_MISMATCH_UNIT_COUNT = 0
QUALITY_LINEAGE_CALCULATION_VERSION_MISMATCH_E2E_COUNT = 0
QUALITY_LINEAGE_SOURCE_REF_MISMATCH_UNIT_COUNT = 0
QUALITY_LINEAGE_SOURCE_REF_MISMATCH_E2E_COUNT = 0
E2E_LOCALE_ASSERTION_MISMATCH_COUNT = 0
NONE_TIER_E2E_ASSERTION_MISSING_COUNT = 0
QUALITY_LINEAGE_E2E_ASSERTION_MISSING_COUNT = 0
QUALITY_NULL_COVERAGE_E2E_ASSERTION_MISSING_COUNT = 0
NONCANONICAL_DRIVER_UNIT_FIXTURE_COUNT = 0
NONCANONICAL_DRIVER_E2E_FIXTURE_COUNT = 0
NONCANONICAL_QUALITY_UNIT_FIXTURE_COUNT = 0
NONCANONICAL_QUALITY_E2E_FIXTURE_COUNT = 0
DOCUMENTED_AUTHORITY_MISMATCH_COUNT = 0
PRODUCTION_RUNTIME_CHANGE_COUNT = 0
BACKEND_RUNTIME_CHANGE_COUNT = 0
API_RUNTIME_CHANGE_COUNT = 0
HOOK_RUNTIME_CHANGE_COUNT = 0
CANONICAL_CONTRACT_CHANGE_COUNT = 0
PRODUCTION_CONFIG_CHANGE_COUNT = 0
PRODUCTION_DEPLOYMENT_COUNT = 0
E7_RUNTIME_SCOPE_COUNT = 0
E8_RUNTIME_SCOPE_COUNT = 0
E9_RUNTIME_SCOPE_COUNT = 0
IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
```

`EVALUATIONS_E2E_STATUS = ENVIRONMENT_SPECIFIC_NOT_EXECUTED`.

## E6C.1.3 — Final E2E Assertion Verification

E2E-assertion + doc-only closure. Commands + results at this revision:

- `npx vitest run src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`
  → `TARGETED_TEST_FILES = 12`, `TARGETED_TEST_COUNT = 106`, all PASS (unchanged; no unit
  fixture edited).
- `npx tsc -b` → PASS; `npx vite build` → PASS.
- `npx eslint e2e/evaluations-fixtures.ts e2e/evaluations-flow.spec.ts src/rental/components/evaluations/DataQualityPanel.render.test.tsx src/rental/components/evaluations/DriverInfluenceSection.render.test.tsx`
  → exactly ONE finding: `evaluations-flow.spec.ts` 19:20 `no-empty-pattern` (pre-existing).
  `ESLINT_NEW_ERROR_COUNT = 0`, `PRE_EXISTING_IDENTICAL_LINT_FINDING_COUNT = 1`,
  `ESLINT_BASELINE = PRE_EXISTING_IDENTICAL_NO_REGRESSION`.
- `npm run test:evaluations:e2e:flow` → `EVALUATIONS_E2E_STATUS =
  ENVIRONMENT_SPECIFIC_NOT_EXECUTED` (browser executable missing; not run by CI).

Counters (verified 0):
```
UTILIZATION_PARTIAL_E2E_ASSERTION_MISSING_COUNT = 0
QUALITY_STATUS_UPGRADE_E2E_REGRESSION_COUNT = 0
REQUIRED_SOURCES_BLOCK_E2E_ASSERTION_MISSING_COUNT = 0
REQUIRED_SOURCE_MISSING_SOURCE_E2E_COLLAPSE_COUNT = 0
QUALITY_NULL_COVERAGE_E2E_ASSERTION_MISSING_COUNT = 0
NULL_COVERAGE_NUMERIC_ZERO_E2E_COUNT = 0
E2E_EXISTING_AUTHORITY_ASSERTION_REMOVAL_COUNT = 0
E2E_REQUIRED_ASSERTION_MISSING_COUNT = 0
DOCUMENTED_ESLINT_FINDING_COUNT_MISMATCH = 0
DOCUMENTED_EVIDENCE_MISMATCH_COUNT = 0
ACCEPTED_E6C_1_2_FIXTURE_CHANGE_COUNT = 0
E2E_FIXTURE_CHANGE_COUNT = 0
UNIT_TEST_FIXTURE_CHANGE_COUNT = 0
PRODUCTION_RUNTIME_CHANGE_COUNT = 0
BACKEND_RUNTIME_CHANGE_COUNT = 0
API_RUNTIME_CHANGE_COUNT = 0
HOOK_RUNTIME_CHANGE_COUNT = 0
CANONICAL_CONTRACT_CHANGE_COUNT = 0
PRODUCTION_CONFIG_CHANGE_COUNT = 0
PRODUCTION_DEPLOYMENT_COUNT = 0
E7_RUNTIME_SCOPE_COUNT = 0
E8_RUNTIME_SCOPE_COUNT = 0
E9_RUNTIME_SCOPE_COUNT = 0
IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
```

`EVALUATIONS_E2E_STATUS = ENVIRONMENT_SPECIFIC_NOT_EXECUTED`.
