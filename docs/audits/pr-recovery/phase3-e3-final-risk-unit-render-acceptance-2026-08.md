# Phase 3 E3.5 — Final Financial Risk Unit Safety & Render Acceptance

## 1. Revision identity

- `CURRENT_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5` (no drift)
- `PRE_E3_5_HEAD` = `6e15f3dc885a333dbf6a5ad2d12bda0a4e89d1f4`
- `TESTED_CODE_SHA` = `4eedec2b744e5d0481669a50a4fd92e97b3d2765`
- `FINAL_BRANCH_HEAD` / PR headRefOid / `CHECK_RUN_HEAD_SHA` = branch head after the
  evidence commit (verified in the PR Final Output; branch == PR head).

## 2. Risk money contract inventory

See `phase3-e3-insights-financial-risk-unit-matrix-2026-08.csv`. No insight
financial-impact field has an explicit unit + currency contract; `financialImpactCents`
and `lostRevenueEur` were mixed and unit-guessed. Only `fin.open_receivables`
(canonical backend Money) is a safe monetary contract.

## 3. Unit guess removal

`financialImpactEur()` (magnitude-based `cents > 1000 ? /100 : as-is`) is deleted.
No code infers a monetary unit from magnitude. `FINANCIAL_UNIT_GUESS_COUNT = 0`;
`FINANCIAL_IMPACT_HEURISTIC_LIVE_CALL_COUNT = 0` (no live callers; a test asserts
the export is gone).

## 4. Financial risk final UI behavior

The monetary "Finanzrisiko (geschätzt)" `≈ X €` cockpit card is removed and
replaced by a non-monetary "Umsatzrisiken (Hinweise)" count (revenue-leakage
insight count). No noncanonical monetary financial-risk amount is displayed.
`NONCANONICAL_FINANCIAL_RISK_VISIBLE_AMOUNT_COUNT = 0`;
`NONCANONICAL_RISK_EUR_RELABEL_COUNT = 0`.

## 5. Individual insight impact behavior

The per-insight "≈ X € Risiko" badge is removed. Insight title/message/recommendation
content is retained. No monetary badge derived from the heuristic remains.

## 6. Cockpit component tests (real render)

`InsightsCockpit.render.test.tsx` (happy-dom, react-dom/client):
- UNAVAILABLE open receivables → no `0 €` / `€0`; status label rendered.
- JPY `100` → `100` shown, no `€`.
- KWD `1000` → `1.000` (3 decimals), no `/100`.
- No monetary "Finanzrisiko (geschätzt)" € card / `≈ X € Risiko`.

## 7. JPY/KWD component tests

Covered in the cockpit render test (JPY/KWD) and adapter tests; currency-native
exponent via the shared authority.

## 8. Invoice failure isolation (view render)

`FinancialInsightsView.render.test.tsx`: invoices API rejects, finance API succeeds
→ Core cards render with canonical values (`1.000…`); page not replaced.
`RAW_INVOICE_ERROR_CORE_FINANCE_SUPPRESSION_COUNT = 0`.

## 9. Finance failure isolation (view render)

Finance API rejects, invoices succeed → Core KPIs render unavailable (adapter
MISSING), never reconstructed from invoices, no `0 €`.
`FINANCE_ERROR_INVOICE_RECONSTRUCTION_COUNT = 0`.

## 10. Recent Activity currency (view render)

USD bundle → Core cards render USD (`$`), no `€` relabel. Recent Activity uses
per-invoice currency via `formatRawMoney` (unit-tested for USD/JPY/KWD/invalid).

## 11. Station unavailable (view render)

Station selected → `financeInsights('org-1', ['station-A'])`; backend UNAVAILABLE
(`STATION_SCOPED_FINANCE_UNSUPPORTED`) → no `0 €`, no org-wide fallback.
`STATION_SCOPE_ORG_FALLBACK_COUNT = 0`.

## 12. E1 regression

E1 money/currency/ISO exponent/metric response/SIGNED_PERCENT/period/timezone/status
via `npm run test:evaluations` — PASS.

## 13. E2 regression

Tenant/station/worker/subadmin/driver/mixed-station/HTTP/entity-ref — PASS
(no backend change in E3.5).

## 14. E3 regression

Money arithmetic, revenue, payment ledger, receivables (current + historical
fail-closed), profit margin, reporting currency, lifecycle, payment→invoice tenant,
mixed-currency, canonical endpoint, station propagation + reason propagation, Core
serving, JPY/KWD adapter — PASS. `npm run test:evaluations`: 431 passing, 2
pre-existing `tire-critical.detector` failures (byte-identical to base).

## 15. Frontend quality

Finance/insights suites: adapter (money exponent/raw money/precision/cockpit model/
station path), serving-path, InsightsCockpit render (4), FinancialInsightsView render
(4), characterization (insights-categories, insights-cockpit-kpi, scenarios),
businessPulse. Frontend typecheck PASS; production build PASS.

## 16. Backend quality

No backend runtime change in E3.5. Backend finance suite (77) and E1/E2 regression
remain green from E3.4; backend production typecheck E3 clean (4 pre-existing
baseline); Prisma validate PASS.

## 17. Current exact-head CI

Recorded in the PR Final Output on the exact final head; red checks classified
PRE_EXISTING_IDENTICAL / PRE_EXISTING_MIGRATION_BASELINE / ENVIRONMENT_SPECIFIC.

## 18. Scope audit

Runtime diff limited to `InsightsCockpit.tsx`, `insights-categories.ts`, and finance
frontend tests. No backend change, no risk/forecast/cost/utilization engine, no
migration. `git diff --name-status origin/main...HEAD` contains only evaluations
finance frontend/backend, tests, and E3 docs.

## 19. Final counters

| Counter | Value |
|---|---|
| FINANCIAL_UNIT_GUESS_COUNT | 0 |
| FINANCIAL_IMPACT_HEURISTIC_LIVE_CALL_COUNT | 0 |
| NONCANONICAL_RISK_EUR_RELABEL_COUNT | 0 |
| NONCANONICAL_FINANCIAL_RISK_VISIBLE_AMOUNT_COUNT | 0 |
| COCKPIT_FALSE_ZERO_COUNT | 0 |
| COCKPIT_CORE_RECONCILIATION_MISMATCH_COUNT | 0 |
| RECENT_ACTIVITY_CURRENCY_RELABEL_COUNT | 0 |
| RAW_INVOICE_ERROR_CORE_FINANCE_SUPPRESSION_COUNT | 0 |
| FINANCE_ERROR_INVOICE_RECONSTRUCTION_COUNT | 0 |
| INVALID_STATION_REASON_COLLAPSE_COUNT | 0 |
| MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT | 0 |
| VISUAL_ROUNDING_FALSE_ZERO_COUNT | 0 |
| PARALLEL_FINANCE_TRUTH_COUNT | 0 |
| INVALID_CLIENT_CORE_FINANCE_FORMULA_COUNT | 0 |
| INVALID_CLIENT_CORE_CURRENCY_AUTHORITY_COUNT | 0 |
| STATION_SCOPE_ORG_FALLBACK_COUNT | 0 |
| FALSE_ZERO_FINANCE_COUNT | 0 |
| CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT | 0 |
| STATION_SCOPE_FINANCE_LEAKAGE_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| NEW_E3_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## 20. Final decision

All E3.5 acceptance gates pass; residual finance-risk presentation defects are
removed and covered by real rendered acceptance tests. Status:
`E3_READY_FOR_FINAL_MERGE_AUDIT`.

## Safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
