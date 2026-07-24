# Revenue, cashflow & contribution model (Auswertungen)

**Prompt 12/54** — separates invoiced revenue, periodic (accrual) revenue, payment receipts, cashflow, and result metrics.

**Implementation:** `shared/finance/revenue-cashflow-contribution.ts`  
**Definitions (UI tooltips):** `shared/finance/finance-metric-definitions.ts`  
**API bundle:** `GET …/evaluations/kpis/financial-mtd` → `revenueCashflowContribution`

---

## Old vs new definitions

| Concept | Old (misleading) | New (Prompt 12) |
|---------|------------------|-----------------|
| MTD Umsatz UI | `mtdRevenueInRange` = issued ∪ paid (deduped) — prior-month invoice paid this month inflated “Umsatz” | **Periodengerechter Umsatz** = net invoiced in period − adjustments; **Zahlungseingänge** separate by `paidAt` |
| “Issued Revenue MTD” label | Same mixed union | **Fakturierter Umsatz** = strict invoice-date outgoing only |
| “Paid revenue MTD” | Sometimes confused with revenue | **Zahlungseingänge** — cash timing, not accrual |
| “Net Profit MTD” | Always `revenue − expenses` even with incomplete costs | **Operatives Ergebnis** — only when `costBasis === COMPLETE`, else hidden + `PARTIAL` |
| Gewinn / Marge | Shown with partial data | Hidden when `operatingResultVisible === false` |
| Deckungsbeitrag | Planned placeholder | Computed as period net − variable costs; **PARTIAL** until cost-type classification exists |
| Steuern | Bundled in `totalCents` only | `netAmountMinor`, `taxAmountMinor`, `amountMinor` (gross) per bucket |

---

## Accrual policy (`accrualPolicy`)

`invoice_date_net_with_period_adjustments`

1. **Recognize** outgoing revenue invoices by `effectiveInvoiceDate` ∈ period (exclude DRAFT/CANCELLED/CREDITED per revenue rules).
2. **Net** = `subtotalCents` or `totalCents − taxCents`.
3. **Adjust** in same period: CREDITED/CANCELLED/VOID/REFUNDED outgoing by adjustment date (`creditedAt` → `cancelledAt` → invoice date).
4. **Period revenue net** = recognized net − adjustment net (floor 0).

Payment receipts never shift accrual — they only affect cashflow metrics.

---

## Metric formulas

| Metric | Formula |
|--------|---------|
| Fakturierter Umsatz | Σ gross outgoing issued in period |
| Periodengerechter Umsatz | Σ net issued in period − Σ net adjustments in period |
| Zahlungseingänge | Σ `paidCents` (or total if PAID) where `paidAt` ∈ period |
| Rückzahlungen | REFUNDED/PARTIALLY_REFUNDED adjustments in period |
| Operative Ausgaben | Σ incoming vendor/upload by invoice date (net/tax/gross) |
| Netto-Cashflow | Zahlungseingänge − expense cash out − refunds |
| Direkte variable Kosten | Classified variable incoming (none yet → 0, PARTIAL) |
| Deckungsbeitrag | Period net − variable costs |
| Operatives Ergebnis | Period net − operating expenses (only if complete cost basis) |

---

## Completeness rules

| Flag | Condition |
|------|-----------|
| `costBasis: PARTIAL` | Revenue without observed incoming expenses; or missing net/tax split |
| `variableCostBasis: PARTIAL` | No variable cost classification on invoices |
| `operatingResultVisible: false` | Any PARTIAL cost basis — **no Gewinn display** |
| API metric `fin.mtd_net_result` | `PARTIAL` status when hidden |

---

## API mapping

| `revenueCashflowContribution.metrics` | `metricId` |
|---------------------------------------|------------|
| `periodRevenue` | `fin.mtd_issued_revenue` |
| `invoicedRevenue` | `fin.issued_revenue_strict_mtd` |
| `paymentReceipts` | `fin.mtd_paid_revenue`, `fin.cash_inflow_mtd` |
| `netCashflow` | `fin.cashflow_net_mtd` |
| `operatingExpenses` | `fin.mtd_expenses` |
| `contributionMargin` | `fin.contribution_margin_mtd` |
| `operatingResult` | `fin.mtd_net_result` |

---

## Impact on existing values

- **Decrease** in `fin.mtd_issued_revenue` / primary MTD revenue KPI when org had significant “paid this month, invoiced earlier” volume (no longer mixed in).
- **Increase** visibility of **Zahlungseingänge** as separate KPI — may exceed period revenue in collection-heavy months.
- **Profit / margin** may disappear (`—` / PARTIAL) for orgs with revenue but no expense invoices in DB.
- **Business Pulse profit** uses period revenue − expenses with same completeness semantics.

---

## Tests

`backend/src/shared/finance/revenue-cashflow-contribution.spec.ts`:

- Invoice prior month, payment current month
- Invoice and payment same month
- Partial payment
- Credit note
- Refund
- Costs without matching revenue
- Missing expense source → hidden operating result
- Tax split (net vs tax)
- Multi-currency exclusion

Frontend: `financial-insights-scenarios.characterization.test.ts` updated for strict issued vs payment separation.

---

## Known limitations

1. Payment receipts use invoice `paidAt` / `paidCents` — not full `OrgInvoicePayment` ledger (future enhancement).
2. Variable cost classification not on `OrgInvoice` — Deckungsbeitrag equals period net, marked PARTIAL.
3. Net cashflow is invoice-proxy, not bank/Stripe ledger.
4. Expense cash-out falls back to invoice date when `paidAt` missing.
