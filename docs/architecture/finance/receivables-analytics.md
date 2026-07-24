# Receivables analytics (Auswertungen)

Canonical receivables KPIs and aging for the Financial Insights / Auswertungen surface.

**Implementation:** `shared/receivables/`  
**Consumers:** `financial-kpi.logic.ts`, `financial-insights.logic.ts`, `EvaluationsFinancialKpiService`, `FinancialInsightsView`, `businessPulseSliceBuilder`

---

## Design principles

1. **Outstanding balance is the receivable amount** — never invoice `totalCents` when a balance is open.
2. **Overdue is calendar-day based in the org reporting timezone** — not raw UTC instant comparison.
3. **Cancelled and fully credited invoices are not receivables** — they appear in separate KPI buckets.
4. **Missing due dates are a data-quality signal** — amounts still count in open total; aging falls back to `not_due` with explicit counters.
5. **No silent nulls for bad rows** — incompatible currencies are excluded from EUR reporting with `incompatibleCurrencyCount`; overpayments are clamped to zero open balance with `overpaidCount`.

---

## Canonical metrics

| Metric key | DE label (UI) | Formula |
|------------|---------------|---------|
| `openTotal` | Offene Forderungen gesamt | Sum of `resolveOutstandingMinor` for open outgoing invoices (EUR reporting currency) |
| `openNotDue` | Noch nicht fällige offene Forderungen | Open total where `daysOverdueInTimezone(due, ref, tz) <= 0` |
| `overdue` | Überfällige Forderungen | Open total where `daysOverdueInTimezone > 0` |
| `partiallyPaid` | Teilweise bezahlte Forderungen | Open total where `paidCents > 0` and outstanding > 0 |
| `disputed` | Strittige Forderungen | Outstanding on status `DISPUTED` / `CHARGEBACK` |
| `deferred` | Gestundete Forderungen | Outstanding on status `DEFERRED` / `PAYMENT_DEFERRED` |
| `uncollectible` | Uneinbringliche Forderungen | Status `UNCOLLECTIBLE` / `WRITTEN_OFF` |
| `cancelled` | Stornierte Rechnungen | Status `CANCELLED` / `CANCELED` / `VOID` — absolute `totalCents` |
| `credits` | Gutschriften | Status `CREDITED` or negative outgoing total |
| `refunds` | Erstattungen | Status `REFUNDED` / `PARTIALLY_REFUNDED` |

### Outstanding balance

```ts
resolveOutstandingMinor(inv):
  if outstandingCents is finite → max(0, trunc(outstandingCents))
  else if paidCents > 0 → max(0, totalCents - paidCents)
  else → max(0, totalCents)
```

Overpayments (`paidCents > totalCents`) yield **0** open balance and increment `dataQuality.overpaidCount`.

### Open receivable invoice

Outgoing type (`OUTGOING_BOOKING`, `OUTGOING_MANUAL`, `OUTGOING_FINAL`), not draft/cancelled/credited/paid/uncollectible, outstanding > 0.

---

## Aging buckets

Computed only for **open** receivables with a valid due date. Missing due date → counted in `not_due` aging bucket + `missingDueDateCount`.

| Bucket | Condition (days overdue in org TZ) |
|--------|-----------------------------------|
| `not_due` | `<= 0` |
| `overdue_1_7` | `1–7` |
| `overdue_8_30` | `8–30` |
| `overdue_31_60` | `31–60` |
| `overdue_61_90` | `61–90` |
| `overdue_90_plus` | `> 90` |

```ts
daysOverdue = calendarDaysBetween(dueDateOnlyInTz, referenceDateOnlyInTz)
```

Uses `shared/evaluations-periods/evaluations-zoned-date` for timezone-safe date-only extraction.

---

## API surface

`GET /organizations/:orgId/evaluations/kpis/financial-mtd` returns:

- `metrics[]` with `fin.open_receivables`, `fin.overdue_receivables`, `fin.total_outstanding_receivables` (outstanding-based)
- `receivablesAnalytics` — full `ReceivablesAnalyticsResult` payload

---

## UI label migration

| Previous (misleading) | New |
|----------------------|-----|
| `Open Receivables` (excluded overdue) | **Offene Forderungen gesamt** |
| `Overdue` (summed `totalCents`) | **Überfällige Forderungen** (outstanding) |
| `Finanzrisiko (geschätzt)` (mixed overdue + insights) | **Geschätzte Insight-Exposition** (insights only) + separate **Überfällige Forderungen** card |
| `Outstanding` (snapshot) | **Offen gesamt** / **Noch nicht fällig** |

---

## Test coverage

`backend/src/shared/receivables/receivables-analytics.spec.ts`:

- Partial payment
- Overpayment
- Credit note / storno exclusion
- Refund bucket
- Missing due date + data quality
- All aging buckets
- Timezone boundary (Berlin vs New York)
- Multi-currency exclusion (EUR reporting)

Frontend characterization: `financial-insights-scenarios.characterization.test.ts`  
Backend mirror: `financial-insights.logic.spec.ts`

---

## Known limitations

1. **Single reporting currency per analytics run** — default EUR; non-EUR rows are excluded, not converted.
2. **Disputed / deferred / uncollectible statuses** — supported in analytics strings for forward compatibility; not all may exist on `OrgInvoiceStatus` in Prisma yet.
3. **Partially paid without `outstandingCents`** — falls back to `total - paid`; persisted `outstandingCents` is preferred.
4. **Aging for missing due dates** — placed in `not_due` bucket intentionally; flagged via `dataQuality.missingDueDateCount`.
5. **Insight exposure vs receivables** — cockpit “Geschätzte Insight-Exposition” is independent from invoice receivables balances.
