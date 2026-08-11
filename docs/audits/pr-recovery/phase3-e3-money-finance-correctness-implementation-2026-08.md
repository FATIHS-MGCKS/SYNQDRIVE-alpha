# Phase 3 E3 — Money & Finance Correctness Implementation

## 1. Base / main identity

- `E3_BASE_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5`
- E2 ancestry verified: `git merge-base --is-ancestor 6acdb24e… origin/main` ⇒ true
  (the base is itself the E2 merge commit).
- Branch: `integration/evaluations-e3-money-finance-correctness-2026-08`, created
  detached from `origin/main`; no historical finance branch in ancestry.
- Method: `REIMPLEMENT_ON_CURRENT_MAIN`; no merge, cherry-pick, or blind port.

## 2. E3 change-set mapping

The Phase-2.6 final manifest and ADRs live on the recovery-authority branch and
are not on current `main` (as recorded for E1/E2); E3 follows the documented E1/E2
decisions and the current-code authority.

| Change-set | Disposition | Location |
|---|---|---|
| `cs-evaluations-money-domain` | Implemented | `shared/evaluations-finance/evaluations-money.ts` (+ mirror) |
| `cs-evaluations-money-migration` | NOT_REQUIRED_ON_CURRENT_MAIN | money-migration validation report |
| `cs-evaluations-receivables` | Implemented | calculator + service (open/overdue/total outstanding) |
| `cs-evaluations-revenue-cashflow-result` | Implemented | calculator + service |
| `cs-evaluations-multi-currency` | Implemented | `shared/evaluations-finance/evaluations-fx.ts` (+ mirror) |
| `cs-evaluations-finance-test-suite` | Implemented | `backend/src/modules/evaluations-finance/*.spec.ts` |

## 3. Historical evidence used

Historical commits/PRs (#756, #757, #760, #762, #765) were read as EVIDENCE for
intent, formulas, edge cases, and known bugs (EUR-only filtering, receivables
summed from `totalCents` instead of `outstandingCents`, client-side float chart
math). None were merged or cherry-picked; the known receivables bug is corrected
by the new authority (authoritative `outstandingCents`).

## 4. Canonical money authority

`shared/evaluations-finance/evaluations-money.ts` (byte-identical backend mirror):
- Reuses E1 `EvaluationsMoney { amountMinor, currency }`; does not replace it.
- `add/subtract/negate/compare/zero/sum/sumByCurrency`, all currency-checked;
  cross-currency add throws `MoneyCurrencyMismatchError`.
- BigInt accumulator; safe-integer boundary check ⇒ `MoneyOverflowError`.
- Central ISO-4217 minor-unit exponent authority (`MONEY_MINOR_UNIT_EXPONENTS`),
  reusing the E1 currency-code allowlist (no second code list).
- `decimalStringToMinor` — deterministic float-free decimal→minor, precision-loss
  fails closed.
- No implicit EUR anywhere (missing currency ⇒ throw / UNAVAILABLE upstream).

## 5. Financial source authority

See `phase3-e3-financial-source-authority-matrix-2026-08.csv`. Canonical sources:
`OrgInvoice` (revenue/expense/receivable), `OrgInvoicePayment` (cash inflow),
`OrganizationPaymentAccount.defaultCurrency` (reporting currency for true-zero).
Deposits, payouts, platform subscriptions, provider fees are explicitly excluded
from analytic metrics.

## 6. Revenue semantics

Issued revenue = finalized outgoing invoices (`issuedAt`/`invoiceDate`), excluding
DRAFT/CANCELLED/VOID/CREDITED. Not bookings, payment intents, deposits, or
authorizations. Per-currency; mixed ⇒ UNAVAILABLE.

## 7. Cashflow semantics

Cash inflow (paid revenue) = settled `OrgInvoicePayment` on outgoing invoices by
`paidAt`. Authorizations/pending intents are not rows and never count. Refund
outflows are modeled in the calculator (Fixture C) but not sourced by the
current-main service (no unified refund settlement ledger); `fin.cashflow_net_mtd`
therefore remains `planned`. Revenue and cashflow may fall in different periods.

## 8. Receivables semantics

Point-in-time authoritative `outstandingCents`. Partial payments reduce (not
clear) the balance. `total_outstanding` = all open; `overdue` = past governed
`dueDate` (or status OVERDUE); `open` = total − overdue. Paid/void/cancelled/
credited/draft excluded. Never negative. No payment-allocation guessing.

## 9. Result semantics

Net result = issued revenue − existing expenses (incoming invoices) per currency.
No estimated/E4 cost inputs. Profit margin = net/revenue×100 for a single
currency; zero revenue ⇒ NOT_APPLICABLE; multi-currency ⇒ NOT_APPLICABLE;
out-of-`[0,100]` ⇒ NOT_APPLICABLE (never NaN/Infinity/blind 0/100).

## 10. Multi-currency policy

See `phase3-e3-multi-currency-reconciliation-2026-08.md`. Per-currency by default;
single reporting total only with full authoritative FX; missing rate ⇒ fail
closed; no mixed false totals.

## 11. FX provenance

`shared/evaluations-finance/evaluations-fx.ts`: `EvaluationsFxRate`
(source/target/rate/rateSource/rateObservedAt/roundingMode/conversionVersion),
exact BigInt scaled conversion, HALF_UP, original preserved. No converted amount
without provenance.

## 12. Migration

None. All money fields are already integer minor units + currency. See
money-migration validation report. `PRODUCTION_MIGRATION_PERFORMED = NO`.

## 13. Tenant / station security

All finance queries go through the E2 authorized scope (organization + station +
period + timezone). Repository filters every query by `organizationId`. Station-
scoped actors receive UNAVAILABLE (no per-station finance attribution on current
main ⇒ fail closed). No second organizationId/period authority is introduced.

## 14. Tests

`backend/src/modules/evaluations-finance/*.spec.ts` (60 tests): money precision,
currency mismatch, overflow, decimal→minor, FX conversion/rounding/exponents,
aggregation modes, revenue/cashflow period separation, partial-payment
receivable, refund period, deposit exclusion, overdue, net result, zero-
denominator margin, multi-currency, false-zero prevention, tenant isolation,
station fail-closed. Plus E1/E2 regression via `npm run test:evaluations`.

## 15. Baseline classification

All red global gates are `PRE_EXISTING_IDENTICAL` /
`PRE_EXISTING_MIGRATION_BASELINE` (byte-identical to base; no E3 file involved).
`NEW_E3_FAILURE = 0`, `UNKNOWN = 0`. See finance test report.

## 16. Residual risks

- The canonical authority is the shared calculator + backend service; the live
  Financial Insights UI still uses the client-side `financial-insights.logic.ts`
  (EUR-only, `totalCents`-based receivables). Migrating the serving path to the
  backend authority (and thereby correcting the live receivables display) is a
  UI/serving change deferred to a later phase; E3 delivers the correct authority
  and single semantic source. The client classification remains a mirror of the
  canonical status sets.
- Refund/net-cashflow completeness depends on a unified refund settlement ledger
  not present on current main; net cashflow with refunds stays `planned`.
- Legacy rows may carry lowercase/non-ISO currency; such rows fail closed to
  UNAVAILABLE rather than being coerced to EUR.

## 17. Scope confirmation

No E4–E9 work: no cost model, maintenance-cost allocation, depreciation,
utilization engine, strength/weakness/driver-influence, data-quality engine,
audit logging, new UI/cockpit, recommendations, actions, predictive, or
forecasts. `E4_STARTED = NO`. `MERGE_PERFORMED = NO`.
`PRODUCTION_DEPLOYMENT_PERFORMED = NO`.

## Canonical finance authority count

`CANONICAL_FINANCE_CALCULATOR_COUNT = 1` for the evaluations finance metric scope
(the shared `evaluations-finance` calculator, consumed by the backend service).
The legacy client calculator is a presentation-layer consumer pending delegation,
documented above; it introduces no second *evaluations authority* engine.

---

# E3.1 — Runtime Authority & Financial Semantics Correction (2026-08-11)

Correction pass on the same branch/PR (#1022) addressing the E3 post-implementation
audit findings. This is not a new package; it does not re-design the known-good E3
base (E1 money contract, BigInt arithmetic, no cross-currency add, deposit≠revenue,
E2 scope reuse, no migration, no deployment).

## 1. Serving path authority

The actual Financial Insights serving path is the client `financial-insights.logic.ts`
computing over the org invoice list. It is now a thin ADAPTER that delegates all
classification and money arithmetic to `@synq/evaluations-finance` (the same
canonical calculator the backend `EvaluationsFinanceService` uses). It contains no
independent revenue/expense/receivable/margin formula. The receivable KPI in
`FinancialInsightsView` uses the canonical authoritative CURRENT outstanding balance
(`currentOpenReceivablesMinor` / `currentOverdueReceivablesMinor`) — fixing the
legacy `totalCents` receivable bug. `EvaluationsFinanceModule` is registered in
`AppModule` (canonical authority present in the runtime path).

## 2. Legacy calculator delegation

`financial-insights.logic.ts` row selectors use canonical fact classification and
`sumCents` uses the canonical BigInt money sum. `PARALLEL_FINANCE_TRUTH_COUNT = 0`
for the core finance metric scope (revenue/expense/receivable/result/margin);
legacy wrappers only map/select, they do not compute a competing formula.

## 3. Receivable time semantics

Option B (current-only). Receivables are an explicit CURRENT snapshot of the
authoritative `outstandingCents`. A clearly historical reference fails closed with
`HISTORICAL_RECEIVABLE_RECONSTRUCTION_UNAVAILABLE` (never a false past value). The
ignored `void referenceMs` is removed; `isCurrentReceivableReference` guards the
snapshot. Available financial history on current main (invoice `issuedAt`, payment
`paidAt`, `outstandingCents`) is insufficient to reconstruct an arbitrary as-of
open balance with confidence, so historical reconstruction is intentionally not
faked.

## 4. Reporting currency authority

Only an ACTIVE, charges-enabled `OrganizationPaymentAccount` (deterministic
selection by `lastSyncedAt`/`createdAt`) provides the reporting currency used to
express a true-zero period. A Prisma `@default("EUR")` on a PENDING account is not
treated as business authority → UNAVAILABLE, never a fabricated 0 EUR. Currency for
non-empty metrics always comes from the invoice/payment rows.

## 5. Negative margin semantics

Profit margin is served as the additive `SIGNED_PERCENT` value type (finite signed
percentage; losses beyond -100% allowed). E1's generic `PERCENT` stays bounded
[0,100]. Only zero-revenue and multi-currency remain NOT_APPLICABLE; no real
negative margin is hidden; no NaN/Infinity.

## 6. Invoice lifecycle allowlists

Positive finalized-state allowlists replace denylists (see
`phase3-e3-invoice-lifecycle-finance-matrix-2026-08.md`). `INCOMING + UPLOADED /
NEEDS_REVIEW / REJECTED` no longer count as expense.

## 7. Payment → invoice tenant integrity

The payment query requires the parent invoice to be same-tenant (`invoice: { is:
{ organizationId } }`) plus an in-code guard. A payment whose parent invoice
belongs to another org is excluded (no foreign currency/amount/status/existence
leak).

## 8. Calculation version reconciliation

Materially changed active metrics bumped to `2.0.0`
(`fin.mtd_paid_revenue`, `fin.mtd_expenses`, `fin.mtd_net_result`,
`fin.profit_margin_mtd`, `fin.open_receivables`, `fin.overdue_receivables`,
`fin.total_outstanding_receivables`) via registry definitions + the override map
(sync test enforced). `fin.mtd_issued_revenue` stays `1.0.0` (result unchanged).
Registry version `1.3.0`. No finance metric is marked `active` that the canonical
E3 authority cannot serve.

## 9. Multi-currency runtime capability

FX conversion foundation is implemented, but no authoritative runtime FX source is
connected on current main. Therefore mixed-currency aggregates remain fail-closed
(per-currency or UNAVAILABLE); "full multi-currency aggregation active" is NOT
claimed.

## 10. Tests

Backend finance suite: 70 tests (`backend/src/modules/evaluations-finance/*.spec.ts`),
incl. negative/sub-100% margin, lifecycle exclusions, corrupt payment relation,
pending-account currency, current receivable, historical-reference fail-closed,
calculation versions. Client serving-path: 21 tests
(`financial-insights.serving-path.test.ts`,
`financial-insights-scenarios.characterization.test.ts`,
`businessPulseSliceBuilder.test.ts`). E1/E2 regression via `npm run test:evaluations`
(424 passing; 2 pre-existing tire-detector failures unrelated to E3).

## 11. Residual limitations

- Historical (as-of) receivables are intentionally UNAVAILABLE (no reliable
  reconstruction source); only CURRENT receivables are served.
- Ledger-based net cashflow with refunds remains `planned` (no unified refund
  settlement ledger for all payments on current main).
- Runtime FX source not connected → mixed-currency remains fail-closed.
- The client presentation breakdowns (daily series, top-N, MoM) remain in the UI as
  presentation over canonically-classified rows; the core metric money authority is
  the canonical calculator.

---

# E3.2 — Canonical Live Serving Path & Finance Metric Ownership (2026-08-11)

Correction pass (same branch/PR #1022) closing the remaining live-serving and
single-truth gaps found by the E3.1 audit.

## Old live path

`FinancialInsightsView` → `GET /organizations/:orgId/invoices` (raw invoices) →
client `financial-insights.logic.ts` computed the core KPIs in the browser
(issued+paid mixing, invoice-status paid revenue, client net result/margin,
browser `new Date()` period, EUR-hardcoded formatting/filtering).

## New live path

`FinancialInsightsView` → `api.evaluations.financeInsights` →
`GET /organizations/:orgId/evaluations/finance/insights`
(`EvaluationsFinanceController`) → `EvaluationsFinanceService` (E2 scope + E1
period) → canonical calculator/repository → canonical finance source records.
The browser only formats/displays the returned values via a status-aware adapter.

## Client calculations removed (core KPIs)

Issued revenue, paid revenue, expenses, net result, profit margin, open/overdue/
total receivables are no longer computed in the browser. Removed: `sumCents`-based
KPI sums, `profitCents`/`profitMargin` client math, issued∪paid mixing for the
revenue card, browser-period KPI boundaries, EUR-hardcoded KPI formatting, and the
`currentOpenReceivablesMinor` client receivable KPI. Raw invoices remain only for
the detail table, daily chart, top-N and drilldown popups (presentation), which are
downgraded to non-canonical (see ownership matrix).

## Canonical backend endpoint

`GET /organizations/:orgId/evaluations/finance/insights` — guarded by
OrgScopingGuard + RolesGuard + PermissionsGuard (`invoices:read`, matching the
existing audience). Returns `{ organizationId, period, metrics }` where each metric
is an E1 metric response (`MONEY` → `{amountMinor,currency}`, margin →
`SIGNED_PERCENT`, with status/warnings). Not dark-gated because it replaces an
existing live capability.

## Period / time authority

The KPI period comes from the backend E1 period window; the period label is
rendered in the backend's effective timezone, so KPI values/labels no longer depend
on the browser timezone.

## Multi-currency UI behavior

The adapter surfaces the backend status: mixed-currency-without-FX → UNAVAILABLE is
shown as a status label (no silent USD drop, no false EUR subtotal). Zero with a
known currency → formatted zero; unknown reporting currency → unavailable, not €0.

## Metric ownership reconciliation

The 8 core metrics are canonically served (active). Client-only finance value
metrics (`fin.issued_revenue_strict_mtd`, `fin.avg_invoice_value_mtd`,
`fin.daily_revenue_mtd`, `fin.daily_expenses_mtd`, `fin.daily_net_result_mtd`,
`fin.mom_revenue_delta_pct`, `fin.mom_expense_delta_pct`, `fin.top_vehicles_mtd`)
are downgraded to `active_degraded`. Registry version `1.4.0`. Observed COUNT
metrics remain active as presentation (not finance value calculations). A registry
ownership test enforces `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0` for finance value
metrics. See `phase3-e3-finance-metric-ownership-matrix-2026-08.csv`.

## Tests

Backend finance suite: 76 (adds controller + ownership specs). Frontend finance:
adapter + serving-path + characterization + provenance + businessPulse. E1/E2/E3.1
regression via `npm run test:evaluations` (430 passing; 2 pre-existing tire
failures). Frontend typecheck + production build PASS.

## Residual limitations (E3.2)

- Station-scoped finance remains fail-closed (no per-station attribution); the core
  finance KPI surface is org-scoped canonical.
- MoM deltas and avg-invoice have no canonical backend owner yet → shown as
  unavailable / non-canonical (not recomputed client-side).
- Daily chart and top-N remain client presentation (downgraded, EUR-scoped),
  explicitly non-canonical.
- Ledger-based net cashflow with refunds and historical as-of receivables remain
  out of scope (fail-closed), as in E3/E3.1.

---

# E3.3 — Final UI Scope, Drilldown Reconciliation & Money Presentation (2026-08-11)

Final narrow correction pass (same branch/PR #1022) closing the residual issues
from the E3.2 audit. No finance redesign, no E4.

## Selected station propagation

`FinancialInsightsView` passes the selected station to the canonical endpoint
(`buildFinanceInsightsPath` → `?stationIds=…`) as a requested narrowing; the loader
depends on `selectedStationId` (station change → Core KPI refetch); a generation
guard discards stale responses (rapid A→B safe). Backend E2 remains authoritative.

## No org-wide fallback

Station-scoped finance stays fail-closed at the backend (UNAVAILABLE); the UI shows
the governed unavailable state and never falls back to org-wide totals for a
selected station.

## KPI / drilldown reconciliation

Removed the non-canonical issued∪paid client drilldown popup and the client-derived
contributing counts from the Core KPI cards. No misleading breakdown is shown
(correct absence over wrong drilldown).

## Money exponent correction

`formatFinanceMoney` converts minor→major via the shared ISO-4217 minor-unit
exponent authority (`getCurrencyMinorUnitExponent`), not a hardcoded `/100`. JPY
(exp 0) and KWD (exp 3) format correctly; invalid currency → guarded state.

## JPY/KWD tests

`finance-insights-adapter.test.ts`: EUR/USD (2), JPY (0), KWD (3), negative, zero,
invalid currency; plus station request-path tests.

## Degraded surface treatment

Daily chart labeled "Limited · non-canonical"; Top customers/vehicles suffixed
"· Limited"; MoM deltas and Avg invoice shown as "—". Registry `active_degraded`;
ownership test enforces `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Outstanding fallback removal

`financial-insights.logic.ts` no longer derives `total - paid`; missing
authoritative outstanding contributes 0 (excluded), never an invented receivable.

## Final serving path

`FinancialInsightsView → api.evaluations.financeInsights → EvaluationsFinanceController
→ E2 scope → E1 period → EvaluationsFinanceService → calculator/repository → sources`.
Frontend Core KPI = display only.

## Residual limitations (E3.3)

- Station-scoped finance is fail-closed (org-level canonical KPI surface); per-station
  finance attribution is deferred (no lineage on current main).
- Daily chart, top-N, MoM, avg-invoice remain non-canonical presentation (labeled
  Limited / shown as unavailable), pending E4/E6.
- Ledger net cashflow with refunds and historical as-of receivables remain fail-closed.
- See `phase3-e3-financial-ui-reconciliation-matrix-2026-08.csv` and
  `phase3-e3-final-ui-scope-money-presentation-test-report-2026-08.md`.

---

# E3.4 — Final Cockpit, False-Zero & Currency Presentation Correction (2026-08-11)

Final narrow presentation correction (same branch/PR #1022) closing the residual
UI defects found by the independent post-E3.3 audit. No finance redesign, no E4.

## InsightsCockpit money model

The cockpit no longer receives EUR-shaped numbers. Open Receivables is passed as a
status-aware `FinanceMoneyView` and rendered via the shared `formatFinanceMoney`
(status/currency preserved; UNAVAILABLE → label, never `0 €`; JPY/KWD correct). The
canonical overdue amount is no longer folded into the insight risk heuristic
(`financialRiskEur` prop removed) — that was a currency relabel + mixed truth.

## False zero + precision

Core KPI cards dropped the forced `maximumFractionDigits: 0`; currency-native
precision (EUR `0.49`, KWD 3 decimals, negative preserved). No UNAVAILABLE→0 and no
rounding-to-zero.

## Recent Activity currency

Each invoice is formatted in its own currency (`formatRawMoney`), never
EUR-relabeled; missing/invalid currency → guarded label.

## Error isolation

The `invoiceError` early-return is removed — a raw invoice-detail failure shows a
non-blocking banner and cannot suppress canonical Core Finance; a finance failure is
never reconstructed from raw invoices.

## Station reason propagation

`buildUnavailableBundle` propagates the specific reason to every money AND margin
metric; station-scoped finance surfaces `STATION_SCOPED_FINANCE_UNSUPPORTED` on all
Core metrics (no collapse).

## Money formatter consolidation

One shared canonical presentation authority (`finance-insights-adapter`:
`formatFinanceMoney` / `formatRawMoney` / `minorToMajorForPresentation`) for the
finance surface; `fmtEUR` remains only in EUR-scoped legacy degraded surfaces
(daily/top-N) and dead drilldown code.

## Residual limitations (E3.4)

- Insights "Finanzrisiko (geschätzt)" remains an insights-domain EUR heuristic
  (`ins.estimated_financial_exposure_eur`), explicitly estimated, not canonical E3
  finance.
- Legacy daily/top-N/MoM/avg-invoice remain non-canonical presentation (labeled
  Limited / shown unavailable), pending E4/E6.
- Per-station finance attribution, ledger net cashflow with refunds, and historical
  as-of receivables remain fail-closed.
- Evidence: `phase3-e3-final-cockpit-false-zero-currency-correction-2026-08.md`,
  updated UI reconciliation matrix; E3.3 report claims marked `SUPERSEDED_BY_E3_4`.
