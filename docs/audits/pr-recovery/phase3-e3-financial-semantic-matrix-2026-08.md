# Phase 3 E3 — Financial Semantic Matrix

Base main SHA: `6acdb24eb84986b25789c01fb544645231c53dc5`
Branch: `integration/evaluations-e3-money-finance-correctness-2026-08`
Calculation authority: `shared/evaluations-finance/*` (canonical), consumed by
`backend/src/modules/evaluations-finance/evaluations-finance.service.ts`.

All money metrics use the E1 wire contract `EvaluationsMoney { amountMinor,
currency }` with `valueType=MONEY`, `unit=CURRENCY_MINOR`. `currency` is the sole
value currency authority. Period authority is E1 (`resolveEvaluationsPeriod`);
tenant/station authority is E2 (`EvaluationsAnalyticsScopeService`).

## Canonical terminology (kept strictly distinct)

`INVOICE ≠ PAYMENT ≠ AUTHORIZATION ≠ CAPTURE ≠ DEPOSIT ≠ REFUND ≠ PAYOUT ≠
PLATFORM SUBSCRIPTION`. Analytic terms: `REVENUE`, `CASHFLOW`, `RECEIVABLE`,
`EXPENSE`, `RESULT`. Deposits and authorizations are never projected as invoice
or payment facts, so they are excluded from every analytic metric by
construction.

## Per-metric matrix

| metricId | business meaning | source of truth | inclusion statuses | exclusion statuses | period timestamp | currency authority | FX policy | formula | zero semantics | missing-data semantics | tenant scope | calc version |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `fin.mtd_issued_revenue` | Finalized outgoing revenue in period | `OrgInvoice.totalCents` (outgoing) | ISSUED, SENT, PARTIALLY_PAID, PAID, OVERDUE | DRAFT, CANCELLED, VOID, CREDITED | `issuedAt` else `invoiceDate` in `[start,endExclusive)` | `OrgInvoice.currency` per row | per-currency; mixed ⇒ UNAVAILABLE (no reporting authority) | Σ totalMinor per currency | AVAILABLE `Money(0, reportingCurrency)` when complete | UNAVAILABLE (no currency authority / source error) | E2 org scope; station-scoped ⇒ UNAVAILABLE | 1.0.0 |
| `fin.mtd_paid_revenue` | Settled customer cash inflow in period | `OrgInvoicePayment.amountCents` on outgoing invoices | payment rows (settled) | authorizations/pending intents (not rows) | `paidAt` in window | parent `OrgInvoice.currency` | per-currency; mixed ⇒ UNAVAILABLE | Σ amountMinor per currency | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |
| `fin.mtd_expenses` | Vendor expenses in period | `OrgInvoice.totalCents` (incoming) | APPROVED, BOOKED, PAID, PARTIALLY_PAID, OVERDUE | DRAFT, CANCELLED, VOID, REJECTED | `invoiceDate` else `createdAt` in window | `OrgInvoice.currency` | per-currency; mixed ⇒ UNAVAILABLE | Σ totalMinor per currency | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |
| `fin.mtd_net_result` | Result = revenue − expenses | derived (revenue, expenses) | as above | as above | revenue/expense windows | per currency | per-currency subtract; mixed ⇒ UNAVAILABLE | revenue − expenses per currency | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |
| `fin.profit_margin_mtd` | Net result / revenue (%) | derived | as above | as above | window | single currency only | NOT_APPLICABLE if multi-currency | net/revenue×100 | — | NOT_APPLICABLE when revenue=0 (never NaN/Inf); UNAVAILABLE on source error | E2 org scope | 1.0.0 |
| `fin.open_receivables` | Open, not-yet-overdue collectible balance | `OrgInvoice.outstandingCents` | outgoing open, outstanding>0, not overdue | DRAFT, CANCELLED, VOID, CREDITED, PAID | point-in-time (`reference`) | `OrgInvoice.currency` | per-currency; mixed ⇒ UNAVAILABLE | total_outstanding − overdue | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |
| `fin.overdue_receivables` | Past-due collectible balance | `OrgInvoice.outstandingCents` | open receivable and dueDate<reference or status OVERDUE | paid/void/cancelled/credited/draft | `dueDate` vs `reference` | `OrgInvoice.currency` | per-currency; mixed ⇒ UNAVAILABLE | Σ outstandingMinor of overdue | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |
| `fin.total_outstanding_receivables` | All open collectible balance | `OrgInvoice.outstandingCents` | all open receivables (open + overdue) | paid/void/cancelled/credited/draft | point-in-time (`reference`) | `OrgInvoice.currency` | per-currency; mixed ⇒ UNAVAILABLE | Σ outstandingMinor of open | AVAILABLE zero when complete | UNAVAILABLE | E2 org scope | 1.0.0 |

## Policy notes

- **Issued revenue ≠ cash.** Revenue is recognized on the finalized invoice
  (`issuedAt`/`invoiceDate`); cash inflow is recognized on payment settlement
  (`paidAt`). They may fall in different periods (Fixture A).
- **Deposit ≠ revenue.** `BookingDeposit` is a separate lifecycle and is not
  queried by the finance service, so it never enters revenue/cashflow/result.
- **Refund ≠ revenue correction.** Refund settlements are cashflow outflows in
  their own settlement period; revenue is only corrected via credit note / void
  (`CREDITED` status excludes the invoice), never by an automatic backdated
  deduction. The calculator supports refund outflow facts; the current-main
  service does not source them (no unified refund settlement ledger for all
  payments), so net-cashflow-with-refunds remains `planned` in the registry.
- **Payout ≠ customer payment**; **platform subscription ≠ rental revenue** —
  both are distinct domains and are never summed into tenant rental metrics.
- **No implicit EUR.** Currency always comes from the invoice/payment row or, for
  a true-empty period, from `OrganizationPaymentAccount.defaultCurrency`
  (settings authority). If neither exists ⇒ UNAVAILABLE, never EUR.
- **Zero ≠ unavailable.** A complete period with no activity yields AVAILABLE
  `Money(0, currency)`; only a missing source or missing currency authority
  yields UNAVAILABLE.
- **Station-scoped finance fails closed.** Finance sources have no authoritative
  per-station attribution on current main, so a station-narrowed actor receives
  UNAVAILABLE rather than org-wide totals (no station leakage).
