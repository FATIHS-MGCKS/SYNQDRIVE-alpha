# Phase 3 E3.3 — Final UI Scope, Drilldown Reconciliation & Money Presentation Test Report

## 1. Revision identity

- `CURRENT_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5` (no drift)
- `PRE_E3_3_HEAD` = `62cd6f4311e34666656c5dfb525c8c157a4e48e8`
- `TESTED_CODE_SHA` = `821f26dfb535eb7f8f9f098c9fb1f723f83d6aad`
- `FINAL_BRANCH_HEAD` / PR headRefOid / `CHECK_RUN_HEAD_SHA` = branch head after the
  evidence commit (verified in the PR Final Output; branch == PR head).

## 2. Station scope propagation

`FinancialInsightsView` passes the selected station to
`api.evaluations.financeInsights(orgId, selectedStationId ? [selectedStationId] : undefined)`
(`buildFinanceInsightsPath` → `?stationIds=…`). `selectedStationId` is in the loader
dependencies, so a station change re-requests the canonical Core KPIs. A generation
guard (`loadGenRef`) discards stale responses (rapid A→B cannot overwrite B).
The station is a requested narrowing only; backend E2 remains authoritative.

## 3. No org-wide fallback

Station-scoped finance is fail-closed at the backend (`STATION_SCOPED_FINANCE_UNSUPPORTED`
→ UNAVAILABLE). The UI renders the governed unavailable state; it never falls back
to org-wide totals for a selected station. `STATION_SCOPE_ORG_FALLBACK_COUNT = 0`.

## 4. Core KPI / drilldown reconciliation

The non-canonical issued∪paid client drilldown popup and the client-derived
contributing counts were removed from the Core KPI cards. No misleading breakdown
is shown (correct absence over wrong drilldown). `KPI_DRILLDOWN_SCOPE_MISMATCH_COUNT = 0`,
`ISSUED_REVENUE_DRILLDOWN_MISMATCH_COUNT = 0`.

## 5. Issued Revenue July/August fixture

Backend (calculator/service specs): an invoice issued 31 July contributes 0 to
August issued revenue; the August payment contributes to paid revenue/cashflow.
The UI no longer attaches any client contributing-record list, so no drilldown can
reintroduce the July invoice into August issued revenue.

## 6. Payment fixture

Paid Revenue is served from the payment ledger (`fin.mtd_paid_revenue`, 2.0.0);
partial payment 30 (not 100). `PAID_REVENUE_INVOICE_SUBSTITUTION_COUNT = 0`.

## 7. Money minor exponent authority

`finance-insights-adapter.minorToMajorForPresentation` reuses the shared
`getCurrencyMinorUnitExponent` (`@synq/evaluations-finance/evaluations-money`) —
no new frontend exponent map, no hardcoded `/100`.

## 8. EUR/USD/JPY/KWD presentation

| currency | amountMinor | major | status |
|---|---|---|---|
| EUR | 12345 | 123.45 | PASS |
| USD | 12345 | 123.45 | PASS |
| JPY | 100 | 100 | PASS (not 1) |
| KWD | 1000 | 1.000 | PASS (not 10) |
| EUR | -5000 | -50.00 | PASS (sign preserved) |
| EUR | 0 | 0.00 | PASS |
| ZZZ (invalid) | 12345 | — | guarded state (no crash, no /100 guess) |

`MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT = 0`.

## 9. Multi-currency UI

Mixed-currency-without-FX → backend UNAVAILABLE; the adapter renders the status
label (no EUR subset, no silent USD drop, no false zero).
`CLIENT_MIXED_CURRENCY_SILENT_DROP_COUNT = 0`. Legacy daily/top-N are EUR-scoped
presentation, explicitly labeled Limited/non-canonical (not presented as complete
canonical totals); `LEGACY_MIXED_CURRENCY_SILENT_DROP_COUNT = 0`.

## 10. Receivable missing-authority behavior

The legacy client outstanding derivation (`total - paid`) is removed; missing
authoritative outstanding contributes 0 (excluded), never an invented receivable.
`LEGACY_OUTSTANDING_DERIVATION_COUNT = 0`. Core receivable KPIs come from the
backend authoritative current outstanding; historical references remain fail-closed.

## 11. Degraded legacy surfaces

Daily Revenue & Expenses chart labeled "Limited · non-canonical"; Top customers /
Top vehicles titles suffixed "· Limited"; MoM deltas and Avg invoice shown as "—".
Registry marks these `active_degraded`; ownership test enforces
`ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0` for finance value metrics.

## 12. Core serving path

`FinancialInsightsView → api.evaluations.financeInsights → EvaluationsFinanceController
→ authenticated actor → E2 scope resolver → E1 period/time → EvaluationsFinanceService
→ calculator/repository → canonical source records`. Frontend Core KPI = display only.

## 13–15. E1 / E2 / E3 regression

`npm run test:evaluations`: 430 passing, 2 pre-existing `tire-critical.detector`
failures (byte-identical to base, unrelated). Covers E1 (money, registry, response,
SIGNED_PERCENT, period, timezone, mirror), E2 (tenant/station/HTTP/entity-ref), and
E3/E3.1/E3.2 (money arithmetic, lifecycle, payment ledger, partial payment, current
+ historical receivables, reporting currency, negative margin, payment→invoice
tenant, mixed-currency fail-closed, canonical endpoint, ownership).

## 16. Frontend quality

FinancialInsightsView + finance adapter + serving-path + money-exponent +
station-path + characterization + businessPulse tests pass (FE finance suites: 41).
Frontend typecheck PASS; production build PASS.

## 17. Backend quality

Backend finance suite: 76 (controller, service, calculator, fx, money, ownership).
Backend production typecheck: E3 clean (4 pre-existing baseline errors). Prisma
validate PASS.

## 18. Current-head CI

Recorded in the PR Final Output on the exact final head. Red checks classified
PRE_EXISTING_IDENTICAL / PRE_EXISTING_MIGRATION_BASELINE / ENVIRONMENT_SPECIFIC.

## 19. Scope audit

`git diff --name-status origin/main...HEAD` limited to evaluations finance
frontend/backend, finance tests, and E3 docs. No E4–E9 code.

## 20. Final counters

| Counter | Value |
|---|---|
| PARALLEL_FINANCE_TRUTH_COUNT | 0 |
| INVALID_CLIENT_CORE_FINANCE_FORMULA_COUNT | 0 |
| INVALID_CLIENT_CORE_CURRENCY_AUTHORITY_COUNT | 0 |
| CORE_KPI_CLIENT_PERIOD_AUTHORITY_COUNT | 0 |
| STATION_SCOPE_ORG_FALLBACK_COUNT | 0 |
| KPI_DRILLDOWN_SCOPE_MISMATCH_COUNT | 0 |
| ISSUED_REVENUE_DRILLDOWN_MISMATCH_COUNT | 0 |
| CLIENT_MIXED_CURRENCY_SILENT_DROP_COUNT | 0 |
| LEGACY_MIXED_CURRENCY_SILENT_DROP_COUNT | 0 |
| LEGACY_OUTSTANDING_DERIVATION_COUNT | 0 |
| MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT | 0 |
| STATION_SCOPE_FINANCE_LEAKAGE_COUNT | 0 |
| FALSE_ZERO_FINANCE_COUNT | 0 |
| NEW_E3_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## Safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
