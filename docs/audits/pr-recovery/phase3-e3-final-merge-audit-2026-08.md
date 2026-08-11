# Phase 3 E3 — Final Merge Audit

Independent pre-merge audit of PR #1022 (Evaluations Recovery E3 – Money & Finance
Correctness), performed on the exact PR head before the controlled squash merge.

## Identity

- `CURRENT_MAIN_SHA` (pre-merge) = `6acdb24eb84986b25789c01fb544645231c53dc5` (= E2 merge; no drift)
- `PR_HEAD_SHA` = `0d10bd0d5a3de2b7bb30a4444880e0d9f20fc17b`
- reviewed tested runtime SHA (E3.5) = `4eedec2b744e5d0481669a50a4fd92e97b3d2765`
- PR #1022: OPEN, base `main`, head `integration/evaluations-e3-money-finance-correctness-2026-08`, mergeable=MERGEABLE, mergeStateStatus=UNSTABLE (failing checks are non-required baseline)
- branch head == PR head == local clean tree (PREMERGE_TEST_SHA = PR head)

## Ancestry & lineage

- E2 ancestor of main: PASS (`git merge-base --is-ancestor 6acdb24… origin/main`)
- `MAIN_DRIFT_COUNT = 0` (main == E2 reference)
- tested SHA `4eedec2b` is ancestor of PR head: PASS
- commits after tested SHA: 1 (`0d10bd0d`, docs/evidence only) →
  `RUNTIME_CHANGE_AFTER_TESTED_SHA_COUNT = 0`, `TEST_CHANGE_AFTER_TESTED_SHA_COUNT = 0`

## Diff scope

73 files changed vs main (6791 insertions). Runtime files all within E3 scope
(canonical money/fx/finance calculator+facts+service+repository+controller+module,
metric contracts/registry/definitions, financial provenance, FinancialInsightsView,
InsightsCockpit, finance adapter + api client, shared finance + config/aliases,
finance tests, E3 docs). `E4_E9_SCOPE_LEAK_COUNT = 0`, `UNRELATED_SCOPE_LEAK_COUNT = 0`.
No Prisma schema change → `E3_SCHEMA_MIGRATION_REQUIRED = NO`.

## Pre-merge acceptance (clean tree at PR head)

- Backend `test:evaluations` (E1+E2+E3): **431 passed**, 2 pre-existing
  `tire-critical.detector` failures (byte-identical to base, unrelated to E3).
- Backend finance suite (`evaluations-finance/`): **77 passed** (money, fx,
  calculator, service, controller, ownership).
- Frontend finance/render suites: **71 passed / 9 files** (adapter money-exponent/
  raw/precision/cockpit-model/station-path, serving-path, InsightsCockpit render,
  FinancialInsightsView render, characterization, businessPulse, provenance).
- Backend production typecheck: 4 pre-existing errors only (billing/workflow specs,
  byte-identical to main); **0 E3-attributable**.
- Backend `nest build`: PASS. Frontend typecheck: PASS. Frontend build: PASS.
- `prisma validate`: PASS (no E3 schema change).

## Gate summary (all verified via the acceptance suites)

Money precision/currency, Revenue≠Cashflow (July-issued/August-paid), partial
payment (paid 30 / open 70), current + historical(fail-closed) receivables,
positive lifecycle allowlists, deposit exclusion, signed profit margin
(+50/-50/-200/NOT_APPLICABLE), multi-currency fail-closed + JPY/KWD presentation,
InsightsCockpit status-aware money (no false zero), financial-risk heuristic
removed, error isolation, Recent Activity per-invoice currency, station scope
fail-closed + reason propagation, payment→invoice same-tenant, registry ownership
(active-but-not-served = 0). All corresponding counters = 0.

## Current-head CI (`0d10bd0d`, 24 check-runs)

SUCCESS: Backend unit, Frontend component, Production build, Prisma validate,
Backend security, Playwright E2E (general), Accessibility, scoped Lint.
Red (classified): Typecheck (4 pre-existing billing/workflow spec errors) →
PRE_EXISTING_IDENTICAL; Lint `lint:all` (0 E3 files) → PRE_EXISTING_IDENTICAL;
Migration tests + Backend integration (`prisma migrate deploy` P3018 baseline) →
PRE_EXISTING_MIGRATION_BASELINE; Playwright E2E (Vehicle Detail) (fails on all
heads; untouched code) → ENVIRONMENT_SPECIFIC; Security/dependency scan (no E3 dep)
→ ENVIRONMENT_SPECIFIC. `NEW_E3_FAILURE = 0`, `UNKNOWN = 0`.

## Merge eligibility decision

All pre-merge hard gates pass → MERGE_ALLOWED. Merge method: normal GitHub squash,
no admin bypass, source branch retained.
