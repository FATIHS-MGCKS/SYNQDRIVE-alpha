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
