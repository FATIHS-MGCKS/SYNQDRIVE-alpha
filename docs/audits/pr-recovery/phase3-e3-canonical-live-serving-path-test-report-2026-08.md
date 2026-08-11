# Phase 3 E3.2 — Canonical Live Serving Path Test Report

> **SUPERSEDED note (E3.3, 2026-08-11).** The independent E3.2 audit found residual
> issues on top of E3.2: (a) the selected station scope was not consistently passed
> to the canonical Core Finance KPIs, (b) Core KPI counts/drilldown used
> non-canonical (issued∪paid) client semantics, and (c) frontend money formatting
> used a hardcoded `/100`, wrong for non-2-decimal currencies (JPY/KWD). Those
> specific claims below (station scope, KPI/drilldown reconciliation, money
> presentation) are marked `SUPERSEDED_BY_E3_3` and are corrected in
> `phase3-e3-final-ui-scope-money-presentation-test-report-2026-08.md`. All other
> E3.2 results remain valid.

## Revision

- `BASE_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5` (no drift)
- `PRE_E3_2_HEAD` = `e15c4a103698abf6dcf41463591b78aabcbf7f79`
- `TESTED_CODE_SHA` = `d9387e0901183c68ba677f51365307cb826474ed`
- `FINAL_PR_HEAD_SHA` / `CHECK_RUN_HEAD_SHA` = E3.2 branch head after the evidence
  commit (verified in the PR Final Output; branch == PR head).

## Live serving path

`FinancialInsightsView` → `api.evaluations.financeInsights` →
`GET /organizations/:orgId/evaluations/finance/insights` (`EvaluationsFinanceController`)
→ `EvaluationsFinanceService` (E2 scope + E1 period) → canonical calculator/
repository → `OrgInvoice` / `OrgInvoicePayment` / `OrganizationPaymentAccount`.

## Core KPI ownership

Issued Revenue, Paid Revenue, Expenses, Net Result, Profit Margin, Open/Overdue/
Total Receivables — all served by the canonical backend; the browser only formats.
`raw invoices KPI authority = NO` (raw invoices used for detail/daily/top-N only).

| Gate | Result |
|---|---|
| FinancialInsightsView uses canonical backend values | PASS |
| No parallel KPI formula (core) | PASS |
| Issued Revenue excludes later payments | PASS (backend semantics + adapter test) |
| Paid Revenue from payment ledger (partial payment) | PASS |
| Net Result server authoritative | PASS |
| Profit Margin server authoritative (signed) | PASS |
| Negative margin displayed (-50%) | PASS |
| Zero denominator → NOT_APPLICABLE (n/a, not 0%) | PASS |
| Open/Overdue receivables server authoritative | PASS |
| No client outstanding fallback for KPIs | PASS |
| Historical receivable fail-closed preserved | PASS |
| Period from E1/E2 (browser timezone cannot change KPI) | PASS (period label in backend tz) |
| Money.currency backend authoritative (no hardcoded EUR KPI) | PASS → money `/100` presentation **SUPERSEDED_BY_E3_3** |
| FinancialInsightsView uses canonical backend values | PASS → station-scope propagation **SUPERSEDED_BY_E3_3** |
| Mixed currency fail-closed visible (no silent EUR subtotal) | PASS |
| Active finance metric has canonical owner | PASS (ownership test) |
| Tenant: route :orgId only, E2 scope, station fail-closed | PASS |
| Endpoint auth (OrgScoping + Roles + Permissions invoices:read) | PASS |

## Counters

| Counter | Value |
|---|---|
| `PARALLEL_FINANCE_TRUTH_COUNT` | 0 (core scope) |
| `INVALID_CLIENT_KPI_CALCULATION_COUNT` | 0 (core scope) |
| `CLIENT_IMPLICIT_EUR_AUTHORITY_COUNT` | 0 (remaining EUR is drilldown/top-N presentation) |
| `CLIENT_MIXED_CURRENCY_SILENT_DROP_COUNT` | 0 |
| `LEGACY_OUTSTANDING_DERIVATION_COUNT` | 0 (KPI paths) |
| `ISSUED_REVENUE_CASHFLOW_MIX_COUNT` | 0 |
| `PAID_REVENUE_INVOICE_SUBSTITUTION_COUNT` | 0 (payment ledger) |
| `ACTIVE_BUT_NOT_CANONICALLY_SERVED` | 0 (finance value metrics) |
| `CANONICAL_FINANCE_CALCULATOR_COUNT` | 1 |
| `NEW_E3_FAILURE_COUNT` | 0 |
| `UNKNOWN_COUNT` | 0 |

## Frontend tests

- `finance-insights-adapter.test.ts` (8): canonical read, backend currency (USD $),
  UNAVAILABLE → no false zero, available zero, negative margin, NOT_APPLICABLE n/a,
  MISSING, partial-payment values.
- `financial-insights.serving-path.test.ts` (3): canonical delegation + outstanding.
- `financial-insights-scenarios.characterization.test.ts`, businessPulse,
  provenance — updated to corrected semantics.
- Frontend typecheck + production build PASS.

## Backend tests

- `evaluations-finance.controller.spec.ts` (3): route-org only (no client org
  override), station passthrough, no controller recomputation.
- `evaluations-finance.service.spec.ts` (19), calculator/fx/money specs, ownership
  spec (3). Backend finance suite: 76 passing.
- Tenant isolation (cross-tenant read = 0) and station fail-closed proven in the
  service spec; endpoint guards are the E2-tested OrgScoping/Roles/Permissions stack.

## Baseline classification (live CI)

Red checks (Typecheck, Lint `lint:all`, Migration tests, Backend integration,
Security scan, Playwright Vehicle Detail) are all PRE_EXISTING_IDENTICAL /
PRE_EXISTING_MIGRATION_BASELINE / ENVIRONMENT_SPECIFIC — identical on prior heads
and untouched by E3 code. `NEW_E3_FAILURE = 0`, `UNKNOWN = 0`.

## Safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
