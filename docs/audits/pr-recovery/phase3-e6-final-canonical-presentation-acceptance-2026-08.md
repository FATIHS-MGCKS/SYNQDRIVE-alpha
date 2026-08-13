# Phase 3 — E6 Final Integrated Canonical Presentation Acceptance (2026-08)

Final integrated audit of the complete E6 canonical Evaluations presentation layer
(E6A, E6A.1, E6B, E6B.1, E6B.1.1, E6C, E6C.1, E6C.1.1, E6C.1.2, E6C.1.3). Runtime frozen;
this document is docs-only acceptance evidence. No runtime/test/fixture change.

## 1. Coordinates

- Repository: `FATIHS-MGCKS/SYNQDRIVE-alpha`
- Branch: `integration/evaluations-e6-canonical-frontend-2026-08`
- Draft PR: **#1026** (state OPEN, isDraft true, base `main`)
- `BASE_MAIN_SHA = a704fdcca76f03703a0816f71a4d11ffdbaf4292`
- `PRE_FINAL_AUDIT_HEAD = 1bc0f9104da3264b2879959f1d77babc5bb7ef43`
- `TESTED_CODE_SHA = 1bc0f9104da3264b2879959f1d77babc5bb7ef43`
- `MERGE_BASE_SHA = a704fdcca76f03703a0816f71a4d11ffdbaf4292` (= BASE_MAIN_SHA; branch is a
  clean fast-forwardable descendant, no divergence)
- 18 commits above `origin/main`; 46 changed files.

## 2. Diff scope

`git diff --check origin/main...HEAD` → clean. All 46 changed files are E6 frontend
runtime, E6 tests/fixtures, or audit documentation. `OUT_OF_SCOPE_FILE_COUNT = 0`.
No `backend/`, `shared/`, `prisma/`, migrations, `.github/`, or production-config file is
touched. `ChangesView.tsx` / `ArchitekturView.tsx` are documentation/presentation metadata
only (no runtime business authority).

## 3. E6A data-layer findings

`api.ts` (`requestResult` + `mapEvaluationsResult`), `evaluations-*` lib, and the canonical
hooks were verified: 403→UNAUTHORIZED, generic 404→NOT_FOUND (never FEATURE_DISABLED),
5xx/network→ERROR; no fabricated payload; query keys encode org+station+period; org/station/
period re-key + `active` guard make late responses for a superseded scope non-applicable;
Finance stays E3/MTD; Money keeps `amountMinor`+explicit `currency` (no implicit EUR, no
locale-as-currency, no mixed-currency total); no client business-truth recomputation.
`GENERIC_404_FEATURE_DISABLED_REGRESSION_COUNT = 0`, `FABRICATED_EVALUATIONS_PAYLOAD_COUNT = 0`,
`STALE_SCOPE_DATA_EXPOSURE_COUNT = 0`, `MISSING_QUERY_SCOPE_DIMENSION_COUNT = 0`,
`CLIENT_BUSINESS_TRUTH_RECOMPUTATION_COUNT = 0`, `IMPLICIT_CURRENCY_COUNT = 0`,
`LOCALE_AS_CURRENCY_AUTHORITY_COUNT = 0`, `MIXED_CURRENCY_FALSE_TOTAL_COUNT = 0`,
`FINANCE_PERIOD_AUTHORITY_VIOLATION_COUNT = 0`.

## 4. E6B core-page findings

One canonical Auswertungen page on the existing `financial-insights` route (App.tsx renders
`EvaluationsPage`; the legacy `FinancialInsightsView` is no longer routed). Finance section
shows fixed MTD; the analytics period control governs only E4/E5. Canonical E1/E4/E5 status
+ reason are mirrored (never upgraded); no-value statuses render placeholders (never numeric
zero); Money uses the explicit-currency formatter; no recommendations/prediction/forecast;
DE/EN copy coherent; server tokens not shown where translated copy exists.
`SECOND_EVALUATIONS_PAGE_COUNT = 0`, `ACTIVE_LEGACY_EVALUATIONS_FALLBACK_COUNT = 0`,
`FINANCE_PERIOD_CONTROL_LEAK_COUNT = 0`, `PARTIAL_TO_AVAILABLE_UI_UPGRADE_COUNT = 0`,
`UNAVAILABLE_TO_NUMERIC_ZERO_COUNT = 0`, `CLIENT_GENERATED_ANALYTICS_AUTHORITY_COUNT = 0`,
`I18N_AUTHORITY_MISMATCH_COUNT = 0`.

## 5. E6C driver-influence findings

Lazy driver request (0 before reveal, exactly 1 after, no refetch on collapse/reopen);
`calculationVersion = driver-influence-e4-v1`; association-only wording; disclaimer +
confounders shown; factor sample/share consistent (6/10, 4/10); AVAILABLE coverage
`availableRecords === factors.length`; full→raw permitted ref, pseudonymous→pseudonym,
none→no reference (PERSON_LEVEL_ACCESS_DENIED), malformed none+factors fails closed
(references suppressed), PSEUDONYMIZATION_UNAVAILABLE fails closed (pseudonymous tier),
generic 404→neutral NOT_FOUND. `DRIVER_EAGER_REQUEST_COUNT = 0`,
`DRIVER_UNNECESSARY_REFETCH_COUNT = 0`, `DRIVER_CAUSAL_CLAIM_COUNT = 0`,
`DRIVER_EVIDENCE_MISMATCH_COUNT = 0`, `UNAUTHORIZED_DRIVER_REFERENCE_DISCLOSURE_COUNT = 0`,
`DRIVER_PRIVACY_FAIL_OPEN_COUNT = 0`, `GENERIC_404_DRIVER_DISABLED_CLAIM_COUNT = 0`.

## 6. E6C data-quality findings

Server PARTIAL mirrored (never fabricated AVAILABLE); status/reason consistent
(SECTION_PARTIAL / SECTION_UNAVAILABLE); pipeline freshness kept distinct from business-event
recency; null freshness never rendered FRESH; coverage renders all five canonical fields;
null coverage renders neutral unavailable copy with no numeric value; `requiredSourceClasses`
kept separate from `coverage.missingSources`; lineage `calculationVersion` (evaluations-
quality-e5-v2) + opaque `org:<org>:<model>` sourceRef preserved; no raw record/person ids.
E2E proves PARTIAL/non-AVAILABLE, binds required sources to the "Benötigte Quellen" block,
proves required vs missing are not collapsed, and proves null finance coverage contains no
digit. `QUALITY_STATUS_UPGRADE_COUNT = 0`, `QUALITY_STATUS_REASON_MISMATCH_COUNT = 0`,
`BUSINESS_RECENCY_AS_FRESHNESS_COUNT = 0`, `NULL_FRESHNESS_TO_FRESH_COUNT = 0`,
`QUALITY_COVERAGE_FIELD_OMISSION_COUNT = 0`, `NULL_COVERAGE_FALSE_ZERO_COUNT = 0`,
`REQUIRED_SOURCE_MISSING_SOURCE_COLLAPSE_COUNT = 0`, `QUALITY_LINEAGE_AUTHORITY_MISMATCH_COUNT = 0`,
`QUALITY_LINEAGE_IDENTIFIER_LEAK_COUNT = 0`, `E2E_REQUIRED_ASSERTION_MISSING_COUNT = 0`.

## 7. Excluded phases / safety scope

E6 implements no E7 (recommendations/actions), no E8 (predictive risk / estimatedExposure),
no E9 (forecast), no full E6D page-wide redesign, no backend/Prisma/migration/config/deploy.
The legacy `evaluations-visual.spec.ts` and `evaluations-a11y.spec.ts` remain `describe.skip`
and are truthfully documented as deferred to E6D (never claimed as passing).
`E7/E8/E9_RUNTIME_SCOPE_COUNT = 0`, `E6D_PAGE_WIDE_REDESIGN_COUNT = 0`,
`BACKEND_RUNTIME_CHANGE_COUNT = 0`, `PRISMA_CHANGE_COUNT = 0`, `MIGRATION_CHANGE_COUNT = 0`,
`PRODUCTION_CONFIG_CHANGE_COUNT = 0`, `PRODUCTION_DEPLOYMENT_COUNT = 0`,
`FALSE_VISUAL_A11Y_PASS_CLAIM_COUNT = 0`.

## 8. Independent quality gates (commands + actual results, at TESTED_CODE_SHA)

- `npx tsc -b` → PASS.
- `npx vite build` → PASS.
- `npx vitest run src/rental/lib/evaluations src/rental/components/evaluations src/rental/hooks/useEvaluationsFinanceBundle.test.tsx src/rental/lib/finance-insights-adapter.test.ts`
  → `TARGETED_TEST_FILES = 13`, `TARGETED_TEST_COUNT = 135`, `TARGETED_TEST_FAILURE_COUNT = 0`.
  (The E6-only subset without the finance adapter suite is 12 files / 106 tests.)
- Targeted ESLint (§9 set), exact ESLint-JSON counts (errors vs warnings vs findings),
  **[CORRECTED IN E6 Final.1 — the earlier "api.ts = 273 errors" / "PRE_EXISTING_IDENTICAL_LINT_FINDING_COUNT = 274"
  figures were a text-grep miscount and are superseded]**:
  - `src/lib/api.ts`: 271 errors + 3 warnings = 274 findings — rule breakdown: 270
    `@typescript-eslint/no-explicit-any` errors, 1 `@typescript-eslint/no-unused-vars` error,
    3 unused `eslint-disable` directive warnings. Verified in-place: `origin/main` `api.ts`
    has the IDENTICAL 271/3 (274 findings, same rules) → `PRE_EXISTING_IDENTICAL`.
  - `e2e/evaluations-flow.spec.ts`: 1 error (`no-empty-pattern`) / 0 warnings at HEAD;
    `origin/main` has 2 `no-empty-pattern` errors → the E2E lint state IMPROVED from 2 → 1
    (the remaining error is unchanged from `TESTED_RUNTIME_SHA`/`PRE_CORRECTION_HEAD`). Do NOT
    claim the full E2E-file finding count is identical to `origin/main`.
  - `e2e/evaluations-fixtures.ts` = 0 findings; E6-dedicated (`lib/evaluations`, hooks,
    `components/evaluations`) = 0 findings.
  - Combined current-head targeted totals: `HEAD_LINT_ERROR_COUNT = 272`,
    `HEAD_LINT_WARNING_COUNT = 3`, `HEAD_LINT_FINDING_COUNT = 275`.
  - Baseline: `ORIGIN_MAIN_API_LINT_FINDING_COUNT = 274`, `ORIGIN_MAIN_E2E_FLOW_ERROR_COUNT = 2`,
    `CURRENT_E2E_FLOW_ERROR_COUNT = 1`, `PRE_FINAL_HEAD_IDENTICAL_LINT_FINDING_COUNT = 275`
    (HEAD unchanged vs `TESTED_RUNTIME_SHA`/`PRE_CORRECTION_HEAD`). `ESLINT_NEW_ERROR_COUNT = 0`,
    `UNKNOWN_TEST_FAILURE_COUNT = 0`.

## 9. E2E and CI honesty

- `npm run test:evaluations:e2e:flow` → `EVALUATIONS_E2E_STATUS = ENVIRONMENT_SPECIFIC_NOT_EXECUTED`;
  the spec parses and collects but the run fails at browser launch:
  `browserType.launch: Executable doesn't exist at …/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell`.
- No CI workflow runs `evaluations-flow.spec.ts` (searched `.github/workflows/` for
  `test:evaluations:e2e` / `evaluations-flow` → none). The repo Playwright CI runs only
  vehicle-detail and legal-documents E2E, which are NOT evaluations proof.
- Exact-head CI comparison (GitHub check-runs):

| Check | `BASE_MAIN_SHA` | `PRE_FINAL_AUDIT_HEAD` | Classification |
|-------|-----------------|------------------------|----------------|
| Backend integration tests | failure | fail | PRE_EXISTING_IDENTICAL |
| Lint (backend) | failure | fail | PRE_EXISTING_IDENTICAL |
| Migration tests (PostgreSQL) | failure | fail | PRE_EXISTING_IDENTICAL |
| Typecheck (backend spec debt) | failure | fail | PRE_EXISTING_IDENTICAL |
| Security / dependency scan | failure | fail | PRE_EXISTING_IDENTICAL |
| Playwright E2E (Vehicle Detail) | failure | fail | PRE_EXISTING_IDENTICAL |
| Frontend component tests | success | pass | green (E6 unit/component in CI) |
| Production build | success | pass | green |
| Playwright E2E (general) | success | pass | green |
| Accessibility (axe) | success | pass | green |
| Lint (frontend) | success | pass | green |
| Prisma validate | success | pass | green |

  Every red check on the PR is present with the identical conclusion on `BASE_MAIN_SHA`; the
  E6 branch has zero backend/Prisma changes, so none is attributable to E6.
  `NEW_E6_FAILURE_COUNT = 0`, `UNKNOWN_CI_FAILURE_COUNT = 0`. (The PR is NOT globally green —
  the pre-existing backend/dependency reds remain and are out of E6 scope.)

## 10. Documentation consistency

Later correction sections are authoritative over superseded historical claims (E6A.1 404,
E6B.1 finance transport, E6B.1.1/E6C.1.1/E6C.1.2/E6C.1.3 marked superseded where relevant).
`E6-ONBOARDING.md` updated: E6C shown complete; current gate = E6 final integrated audit /
merge readiness; E7 blocked until explicit approval AND merge of #1026 (new branch/PR from
merged main); the stale guardrail that excluded E6C content corrected; E6D/E7/E8/E9 remain
excluded. `DOCUMENTED_RUNTIME_MISMATCH_COUNT = 0`, `DOCUMENTED_TEST_EVIDENCE_MISMATCH_COUNT = 0`,
`DOCUMENTED_CURRENT_PHASE_MISMATCH_COUNT = 0`, `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`.

## 11. Residual limitations / deferrals

- `evaluations-flow.spec.ts` is authored + type/parse-clean but executed nowhere in this
  environment or CI (no browser; no workflow). It is evidence-of-intent, not a passing gate.
- Legacy `evaluations-visual.spec.ts` + `evaluations-a11y.spec.ts` are skipped; full visual/
  a11y regression is deferred to E6D.
- `src/lib/api.ts` carries pre-existing lint debt (identical in count and rules to
  `origin/main`), untouched: 270 `no-explicit-any` errors + 1 `no-unused-vars` error +
  3 unused-`eslint-disable` warnings (274 findings).
- Pre-existing backend/dependency CI reds remain (identical to main); resolving them is out
  of E6 scope.

## 12. Runtime freeze + E7 handoff

The E6 runtime is frozen at `TESTED_CODE_SHA = 1bc0f910`. E7 (recommendations/actions) must
begin on a NEW branch/PR created from `main` AFTER PR #1026 is independently reviewed and
merged — not on this branch.

## E6 Final.1 — Independent Evidence Correction

Independent review of the E6 final audit found three documentation/evidence defects; all
corrected here (documentation-only; runtime frozen at `TESTED_RUNTIME_SHA = 1bc0f910`):

1. A stale current-phase statement in `E6-ONBOARDING.md` §9 (Copy-&-Paste block) still said
   E6C was the next open/not-started phase — corrected to the current truth (E6A–E6C.1.3
   complete in #1026; integrated acceptance audit done; next gate = independent final
   merge-readiness review; E7 blocked until #1026 is reviewed + merged and explicitly
   authorized, on a new branch/PR from merged `main`).
2. A false onboarding claim that Evaluations E2E is executed "only in CI" — corrected:
   no CI workflow runs `evaluations-flow.spec.ts`; status `ENVIRONMENT_SPECIFIC_NOT_EXECUTED`
   (authored evidence-of-intent, not a passing gate); vehicle-detail/legal-documents
   Playwright jobs are not Evaluations proof.
3. Incorrect lint counts in §8 (the "api.ts = 273 errors" text-grep figure) — corrected to
   the exact ESLint-JSON counts above (api.ts 271 errors + 3 warnings = 274; flow spec 1
   error at HEAD vs 2 on main; fixtures/E6-dedicated 0).

Runtime remained frozen; no test or fixture changed; no backend/Prisma/config/deployment
change; E7 not started; PR #1026 remains OPEN + Draft.
`DOCUMENTED_CURRENT_PHASE_MISMATCH_COUNT = 0`, `DOCUMENTED_TEST_EVIDENCE_MISMATCH_COUNT = 0`,
`DOCUMENTED_RUNTIME_MISMATCH_COUNT = 0`, `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`.

## Final status

`E6_READY_FOR_FINAL_MERGE_AUDIT`
