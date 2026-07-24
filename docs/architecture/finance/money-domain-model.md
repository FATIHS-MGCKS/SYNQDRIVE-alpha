# Money Domain Model

SynqDrive canonical representation for monetary values across backend, shared contracts, and frontend display.

## Canonical type

```typescript
type Money = {
  amountMinor: number; // integer minor units only
  currency: string;    // uppercase ISO-4217 (EUR, USD, JPY, …)
};
```

**Rules**

| Rule | Detail |
|------|--------|
| Storage & transport | Always integer `amountMinor` + ISO-4217 `currency` |
| No float arithmetic | Sums, subtractions, comparisons use `@synq/money/money.util` |
| No FX by default | Different currencies cannot be added without an explicit conversion step |
| No magnitude heuristics | Field name / schema defines unit semantics — never infer cents vs major from value size |
| Frontend formatting | Display-only via `formatMoneyMinor` / `formatMoney` — no business rounding or conversion |

## Module layout

| Path | Role |
|------|------|
| `shared/money/money.contract.ts` | `Money` type, `MoneyDomainError` |
| `shared/money/currency-decimals.ts` | ISO-4217 minor decimal places (0/2/3) |
| `shared/money/money.util.ts` | `moneyFromMinor`, `addMoney`, `subtractMoney`, `compareMoney`, `sumMoney`, … |
| `shared/money/money.format.ts` | `formatMoneyMinor`, `formatMoney` (Intl display only) |
| `shared/money/money.legacy-insight.ts` | Legacy insight field resolver (no heuristics) |
| `backend/src/shared/money/index.ts` | Re-export + Nest currency guards |
| `frontend/src/lib/money.ts` | Re-export + pricing helpers |

## Core operations

- `moneyFromMinor(amountMinor, currency)` — construct / validate
- `zeroMoney(currency)` — zero amount
- `addMoney(a, b)` / `subtractMoney(a, b)` — same currency required
- `compareMoney(a, b)` — `-1 | 0 | 1`, same currency required
- `sumMoney(values, currency?)` — homogeneous list; empty + currency → zero
- `majorUnitsStringToMinor(string, currency)` — parse major-unit strings without float drift
- `roundMinorToCurrency(amountMinor, currency)` — round to currency precision

## Currency minor decimals

| Decimals | Examples |
|----------|----------|
| 0 | JPY, KRW, VND, CLP, … |
| 2 | EUR, USD, GBP, … (default) |
| 3 | BHD, KWD, OMR, JOD, … |

## Audit (Prompt 9/54)

### Replaced heuristics

| Location | Before | After |
|----------|--------|-------|
| `frontend/src/rental/lib/insights-categories.ts` `financialImpactEur` | `> 1000 ? cents/100 : round(cents)` | `resolveLegacyInsightFinancialImpact` — `financialImpactCents` = minor, `lostRevenueEur` = whole major EUR |
| `frontend/.../evaluations-metric-response.ts` `formatMetricCentsDisplay` | `value / 100` hardcoded | `formatMoneyMinor` with currency decimals |
| `backend/.../financial-kpi.logic.ts` `sumCents` | naive `reduce` | `sumMoney` (throws on mixed currency) |

### Legacy fields (Prompt 10 migration)

| Field / area | Current unit | Target |
|--------------|--------------|--------|
| `financialImpactCents` (insights) | minor (EUR cents) | `Money` JSON or keep `*_cents` + `currency` |
| `lostRevenueEur` (insights) | whole major EUR | rename → `lostRevenueCents` + `currency` |
| `financialRiskEur`, `openReceivablesEur` (FinancialInsightsView props) | whole major EUR | minor + `formatMoneyMinor` |
| Invoice `totalCents`, `subtotalCents`, `taxCents` (Prisma) | minor + `currency` column | already aligned — enforce `sumMoney` at aggregation |
| Payments / refunds / credits | `amountCents` patterns in bookings/billing | audit in Prompt 10 |
| Maintenance / damage costs | mixed `costCents` / display `/100` | migrate callers to `Money` |
| Forecast values | chart buckets using `/100` in `FinancialInsightsView` | display-only refactor in Prompt 10 |

### Already aligned storage

- Org invoices: `totalCents`, `subtotalCents`, `taxCents`, `currency`
- Document extraction: `totalCents`, `taxCents`, `amountCents`
- Booking deposits: `amountCents`
- Evaluations financial KPI API: `value` in minor units + `currency` on `EvaluationsMetricResponse`

## Legacy insight resolution

```typescript
// financialImpactCents → minor units (always)
// lostRevenueEur → whole major EUR → converted to minor via majorUnitsNumberToMinor
resolveLegacyInsightFinancialImpact(metrics, 'EUR');
```

No value-magnitude branching.

## Testing

Backend: `backend/src/shared/money/money-domain.spec.ts`

Cases covered: `0`, `1`, `999`, `1000`, large integers, negatives, rounding, JPY (0 decimals), BHD (3 decimals), incompatible currency add/compare, legacy insight fields.

Run:

```bash
cd backend && npm run test:evaluations   # includes money-domain
cd frontend && npm test -- src/lib/money.test.ts
```

## Prompt 10 scope (out of band here)

- Controlled column/JSON renames (`lostRevenueEur` → minor + currency)
- FinancialInsightsView chart aggregation without `/100` business math
- Payment/refund/credit service unification
- Prisma DTO adapters returning `Money` on API boundaries
