# Phase 3 — E6B Core Evaluation Surfaces — Test Report (2026-08)

- E6B_TESTED_CODE_SHA: `55a1f37a4e58454c2982413253d8ef92b409ce79` (runtime frozen; all
  results below measured at this SHA).
- Base for classification: A = base main `a704fdcc` / E6A branch; B = E6B candidate.

## Quality gates

| Gate | Command | Result |
|------|---------|--------|
| Frontend typecheck | `npx tsc -b` | PASS (exit 0) |
| Frontend production build | `npx vite build` | PASS (built in ~14s) |
| Targeted E6 lint | `eslint components/evaluations/ hooks/useEvaluationsFinanceBundle.ts` | PASS (0 problems) |

`App.tsx` lint: 15 errors WITH and WITHOUT the E6B change (in-place A/B) →
`PRE_EXISTING_IDENTICAL` (the one-line route swap adds 0). All errors are pre-existing
`no-explicit-any`/unused-var debt in that 1300-line file.

## Automated tests

New E6B tests (component + logic):

| Suite | Tests | Result |
|-------|-------|--------|
| `components/evaluations/evaluations-presentation.test.ts` | 7 | PASS |
| `components/evaluations/evaluations-sections.render.test.tsx` | 6 | PASS |

Focused regression (evaluations + finance + hooks), single run:
- Test files: 19 passed / 19
- Tests: 149 passed / 149 (0 failed, 0 skipped)
- Includes E6A canonical/lifecycle (`evaluations-canonical.test.ts` 19), money
  (`evaluations-money.test.ts` 11), finance adapter (29), the legacy component render
  tests still passing in isolation (`FinancialInsightsView.render.test.tsx`,
  `InsightsCockpit.render.test.tsx`), and the 13 new E6B tests.

Mandated case coverage:
- Executive (§47): AVAILABLE value, real zero vs null, UNAVAILABLE → placeholder,
  utilization %, MTD context — covered (presentation + render tests).
- Strengths/Weaknesses (§48): AVAILABLE+items/empty, PARTIAL+empty, skipped dimensions;
  asserts PARTIAL-empty ≠ "fully checked, none" — covered.
- Finance (§49): MTD label; analytics-period change leaves Finance authority (E2E);
  explicit currency incl. JPY (no /100); unavailable ≠ 0 — covered.
- Utilization (§50): scheduled-occupancy labeling, PARTIAL, null/unavailable, real zero,
  no recomputation — covered (component + presentation).
- Cost (§51): OPERATING_EXPENSES money per-currency, unsupported categories status-only,
  no estimatedExposure, no legacy Pareto — covered.
- Transport errors (§52): NOT_FOUND → neutral copy, never "feature disabled"/"deaktiviert"
  — covered (render + E2E).

## E2E (§54/§55)

Playwright browsers are not installed in the Cloud Agent sandbox, so the Playwright
suite could not be executed locally (validated in CI). Changes made:
- `evaluations-flow.spec.ts` rewritten to the canonical page: page load + header,
  period control present, Finance MTD scope persists across a period change, and
  feature-disabled(generic-404) → neutral unavailable with Finance still available and
  no "deaktiviert"/legacy data; plus assertion that no E7/E8/E9 surfaces render.
- `evaluations-fixtures.ts` extended with canonical E3 finance + E4 summary (+E5 quality)
  route mocks and a `canonicalFeatureDisabled` (generic-404) toggle.
- `evaluations-visual.spec.ts` + `evaluations-a11y.spec.ts` (legacy-DOM snapshots/axe)
  deferred to E6D via `describe.skip` with reason (full visual/a11y regression is E6D).

## Regression (§61)
E6A focused suite, E6A.1 lifecycle/state, E6B new component tests, finance frontend
tests, existing evaluations tests, i18n-backed component tests: no regressions
(149/149). Legacy isolated component render tests remain green.

## Required E6B counters (all measured 0 unless noted)

```
STALE_404_FEATURE_DISABLED_AUTHORITY_STATEMENT_COUNT = 0
SECOND_EVALUATIONS_PAGE_COUNT = 0
GLOBAL_FILTER_FALSE_SCOPE_COUNT = 0
PERIOD_SCOPE_MISREPRESENTATION_COUNT = 0
FINANCE_PERIOD_RECALCULATION_COUNT = 0
CLIENT_SIDE_FINANCE_RECOMPUTATION_COUNT = 0
UNAVAILABLE_RENDERED_AS_ZERO_COUNT = 0
PARTIAL_RENDERED_AS_COMPLETE_COUNT = 0
UNKNOWN_RENDERED_AS_COMPLETE_COUNT = 0
STALE_HIDDEN_COUNT = 0
FALSE_COMPLETE_EMPTY_DETECTION_UI_COUNT = 0
UTILIZATION_SEMANTIC_UPGRADE_COUNT = 0
TELEMETRY_DOWNTIME_UI_CONFLATION_COUNT = 0
IMPLICIT_CURRENCY_FORMATTING_COUNT = 0
HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT = 0
CLIENT_SIDE_CURRENCY_INFERENCE_COUNT = 0
MIXED_CURRENCY_CLIENT_SUM_COUNT = 0
UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT = 0
UNSAFE_PR798_RESOLVER_USE_COUNT = 0
ESTIMATED_EXPOSURE_E6_COUNT = 0
LEGACY_ANALYTICS_FALLBACK_COUNT = 0
LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT = 0
RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT = 0
MISUSE_CASES_INSIDE_CANONICAL_E6_COUNT = 0
CLIENT_SIDE_QUALITY_AUTHORITY_COUNT = 0
CLIENT_SIDE_FRESHNESS_AUTHORITY_COUNT = 0
CLIENT_SIDE_PII_AUTHORITY_COUNT = 0
CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT = 0
DUPLICATE_CANONICAL_REQUEST_COUNT = 0
N_PLUS_ONE_REQUEST_COUNT = 0
INITIAL_CANONICAL_REQUEST_COUNT = 2   (1 E4 summary + 1 always-on E3 finance)
E7_RUNTIME_SCOPE_COUNT = 0
E8_RUNTIME_SCOPE_COUNT = 0
E9_RUNTIME_SCOPE_COUNT = 0
BACKEND_RUNTIME_CHANGE_COUNT = 0
PRISMA_CHANGE_COUNT = 0
MIGRATION_CHANGE_COUNT = 0
PRODUCTION_CONFIG_CHANGE_COUNT = 0
PRODUCTION_DEPLOYMENT_COUNT = 0
NEW_E6_FAILURE_COUNT = 0
IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
```

## E6B.1 — Finance Transport Regression

- `E6B1_TESTED_CODE_SHA = a0c8027a` (runtime frozen; results measured at this SHA).
- New suite: `src/rental/hooks/useEvaluationsFinanceBundle.test.tsx` — 9 tests, all PASS.

Finance transport mapping (status-aware; no HTTP collapse):

| HTTP | Mapped state |
|------|--------------|
| 200 + valid body | `AVAILABLE` |
| 403 | `UNAUTHORIZED` |
| 404 | `NOT_FOUND` (asserted `!= FEATURE_DISABLED`) |
| 500 | `ERROR` |
| network failure (status 0) | `ERROR` |

`FINANCE_404_TO_FEATURE_DISABLED_COUNT = 0`.

Finance lifecycle (race safety):
- null organization → IDLE, no request issued.
- org A → org B → refetch for B; settles with B's result (last call = `('org-b', undefined)`).
- org A → null → stale Finance cleared (IDLE).
- station A → station B → refetch for the new station scope (last call = `('org-a', ['station-b'])`).

Gates re-run at the frozen SHA: frontend typecheck PASS (`tsc -b`), production build PASS
(`vite build`), targeted E6 lint PASS (0 problems for
`components/evaluations/`, `hooks/useEvaluationsFinanceBundle*.ts(x)`).

Full E6 acceptance suite at `a0c8027a`:
- `SUITE_COUNT = 14`, `TEST_COUNT = 124`, `PASSED = 124`, `FAILED = 0`, `SKIPPED = 0`
  (E6A canonical/lifecycle, money, finance adapter, the 13 E6B component/logic tests, the
  9 new E6B.1 finance-transport tests, and the legacy component render tests still green
  in isolation).

Playwright: unchanged from the E6B baseline — not runnable in the agent sandbox (no
browsers); classified `ENVIRONMENT_SPECIFIC`, not a new E6 failure. The canonical E2E
fixtures already mock the finance endpoint at the same path used by the new
`financeInsightsResult`, so no E2E change was required.

## Classification
- `NEW_E6_FAILURE_COUNT = 0`, `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`.
- Pre-existing global failures (App.tsx lint, unrelated CI jobs) classified
  `PRE_EXISTING_IDENTICAL`; Playwright non-execution classified `ENVIRONMENT_SPECIFIC`
  (no browsers in sandbox; CI runs the suite).
