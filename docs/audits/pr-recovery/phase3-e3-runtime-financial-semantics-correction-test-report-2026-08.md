# Phase 3 E3.1 — Runtime Authority & Financial Semantics Correction Test Report

- `PRE_E3_1_HEAD` = `c4942003d5a29c6c96b93fcce862a604002a3b68`
- `TESTED_HEAD_SHA` = the E3.1 branch head after the reports commit (see the PR
  Final Output / `gh pr view 1022`). Branch == PR head is verified there.
- `E3_BASE_MAIN_SHA` = `origin/main` = `6acdb24eb84986b25789c01fb544645231c53dc5`
  (no main drift since E3 creation).

## Results

| Gate | Result |
|---|---|
| Serving Path Authority (client delegates to canonical E3) | PASS |
| Legacy Delegation (no independent legacy formula) | PASS |
| Current Receivable (partial payment = open remainder) | PASS |
| Historical Receivable Semantics (fail closed) | PASS |
| Reporting Currency Authority (ACTIVE account only) | PASS |
| Negative Margin (SIGNED_PERCENT, incl. < -100%) | PASS |
| Zero-denominator margin (NOT_APPLICABLE) | PASS |
| Revenue Lifecycle (positive allowlist) | PASS |
| Expense Lifecycle (positive allowlist; UPLOADED/NEEDS_REVIEW/REJECTED excluded) | PASS |
| Payment→Invoice Tenant Integrity (corrupt relation excluded) | PASS |
| Calculation Version (2.0.0 bumps; issued revenue 1.0.0) | PASS |
| Registry Reconciliation (no active-but-unserved) | PASS |
| Multi-Currency Runtime Claim (fail-closed; honestly documented) | PASS |
| E1 Regression | PASS |
| E2 Regression | PASS |
| Prisma validate | PASS (no schema change) |
| Backend production typecheck | PASS for E3 files (4 pre-existing baseline errors only) |
| Frontend typecheck | PASS |

Backend finance suite: **70/70**. Client serving-path + characterization +
businessPulse: **21/21**. `npm run test:evaluations`: **424 passing**, 2 pre-existing
tire-detector failures (byte-identical to base, unrelated to E3).

## Counters

| Counter | Value |
|---|---|
| `PARALLEL_FINANCE_TRUTH_COUNT` | 0 (core finance metric scope) |
| `FLOAT_MONEY_AUTHORITY_COUNT` | 0 |
| `IMPLICIT_CURRENCY_DEFAULT_COUNT` | 0 |
| `MIXED_CURRENCY_FALSE_AGGREGATION_COUNT` | 0 |
| `HISTORICAL_RECEIVABLE_FALSE_VALUE_COUNT` | 0 (historical ⇒ fail closed) |
| `NEGATIVE_MARGIN_HIDDEN_COUNT` | 0 |
| `INVALID_REVENUE_LIFECYCLE_COUNT` | 0 |
| `INVALID_EXPENSE_LIFECYCLE_COUNT` | 0 |
| `CROSS_TENANT_PAYMENT_INVOICE_RELATION_ACCEPT_COUNT` | 0 |
| `CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT` | 0 |
| `STATION_SCOPE_FINANCE_LEAKAGE_COUNT` | 0 (station-scoped ⇒ fail closed) |
| `FALSE_ZERO_FINANCE_COUNT` | 0 |
| `ACTIVE_BUT_NOT_CANONICALLY_SERVED` | 0 |
| `DOUBLE_COUNTING_FAILURE_COUNT` | 0 |
| `NEW_E3_FAILURE_COUNT` | 0 |
| `UNKNOWN_COUNT` | 0 |

## Service coverage matrix

| metricId | registryStatus | servedByCanonicalE3 | legacyOnly | formulaAuthority | safeToRemainActive |
|---|---|---|---|---|---|
| fin.mtd_issued_revenue | active | yes | no | @synq/evaluations-finance | yes |
| fin.mtd_paid_revenue | active | yes (backend ledger) | no | @synq/evaluations-finance | yes |
| fin.mtd_expenses | active | yes | no | @synq/evaluations-finance | yes |
| fin.mtd_net_result | active | yes | no | @synq/evaluations-finance | yes |
| fin.profit_margin_mtd | active | yes (SIGNED_PERCENT) | no | @synq/evaluations-finance | yes |
| fin.open_receivables | active | yes (current-only) | no | @synq/evaluations-finance | yes |
| fin.overdue_receivables | active | yes (current-only) | no | @synq/evaluations-finance | yes |
| fin.total_outstanding_receivables | active | yes (current-only) | no | @synq/evaluations-finance | yes |
| fin.cashflow_net_mtd | planned | no (needs refund ledger) | n/a | n/a | yes (planned) |
| fin.reserved_revenue_mtd | prepared | client presentation | n/a | client selector | yes (prepared) |

## Live CI classification (PR #1022 head `aebfcbc1`)

Two pre-existing CI workflows run on the head. Red checks:

| Check | Root cause | Classification |
|---|---|---|
| Typecheck | 4 pre-existing errors in `billing/stripe-webhook.*.spec.ts` + `workflows/workflow-dry-run.service.spec.ts` (byte-identical to base) | PRE_EXISTING_IDENTICAL |
| Lint (`lint:all`) | 36 errors in 28 pre-existing files; 0 E3 files | PRE_EXISTING_IDENTICAL |
| Migration tests (PostgreSQL) | `prisma migrate deploy` P3018 baseline; no E3 migration | PRE_EXISTING_MIGRATION_BASELINE |
| Backend integration tests | fails at `prisma migrate deploy` setup (same P3018) | PRE_EXISTING_MIGRATION_BASELINE |
| Security / dependency scan | dependency scan (one workflow passes); E3 adds no dependency | ENVIRONMENT_SPECIFIC |
| Playwright E2E (Vehicle Detail) | `vehicle-detail-flow.spec.ts #1` visibility timeout; **fails identically on all three branch heads** (`fec6eb3d`, `c4942003` pre-E3.1, `aebfcbc1`); E3.1 touches no Vehicle Detail/Fleet source and `financial-insights.logic`/`FinancialInsightsView` are not imported by those pages | PRE_EXISTING / ENVIRONMENT_SPECIFIC (flaky E2E) |

Passing: backend unit tests, backend security tests, frontend component tests,
Prisma validate, Playwright E2E (Legal/general), accessibility, production build,
scoped Lint (`lint:vehicle-detail`).

`NEW_E3_FAILURE = 0`, `UNKNOWN = 0`. `tire-critical.detector.spec` (in the local
`test:evaluations` run) is also PRE_EXISTING_IDENTICAL (byte-identical to base).

## Safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
