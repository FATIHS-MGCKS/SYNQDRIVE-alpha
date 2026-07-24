# Multi-currency analytics (Auswertungen)

**Prompt 13/54** — reporting-layer FX for financial evaluations.

**Implementation:** `shared/fx/`  
**Backend service:** `EvaluationsFxRateService`  
**API bundle:** `GET …/evaluations/kpis/financial-mtd` → `multiCurrency`

---

## Supported currencies

| Code | Minor decimals | Notes |
|------|----------------|-------|
| EUR | 2 | Default platform reporting currency |
| GBP | 2 | Reference static rate |
| USD | 2 | Reference static rate |
| CHF | 2 | Reference static rate |
| PLN | 2 | Reference static rate |
| CZK | 2 | Reference static rate |
| JPY | 0 | Integer yen — special cross-minor conversion |
| BHD | 3 | Three-decimal fils |

Extend `SUPPORTED_ANALYTICS_CURRENCIES` and `createReferenceFxRateProvider()` when adding markets.

---

## Architecture fields

| Field | Location | Description |
|-------|----------|-------------|
| Organisationsbasiswährung | `multiCurrency.reportingCurrency` | Resolved from payment account → price book → platform default |
| Originalwährung | `FxConversionResult.originalCurrency` | Document ISO-4217 code |
| Originalbetrag | `originalAmountMinor` | Integer minor units in document currency |
| Umgerechneter Betrag | `convertedAmountMinor` | Integer minor units in reporting currency |
| Wechselkurs | `exchangeRate { numerator, denominator }` | Rational major-unit rate |
| Wechselkursdatum | `exchangeRateDate` | ISO date-only of selected historical rate |
| Wechselkursquelle | `exchangeRateSource` | e.g. `reference_static`, future `ecb`, `org_override` |
| Umrechnungsstatus | `FxConversionStatus` | NATIVE / CONVERTED / EXCLUDED_* |
| Rundungsregel | `roundingRule` | `HALF_UP_MINOR` |

---

## FX source / abstraction

```typescript
interface FxRateProvider {
  getRate(from, to, asOf: Date): FxRateQuote | null;
}
```

- **`MemoryFxRateProvider`** — date-keyed rates; selects latest rate on or before `asOf` (historical analytics).
- **`createReferenceFxRateProvider()`** — static dev/test rates (not live market data).
- **`EvaluationsFxRateService`** — NestJS wrapper; resolves org reporting currency from Prisma.

No second FX stack — builds on `shared/money` (integer minor units, no float business math).

---

## Org reporting currency resolution

Order (`resolveOrgReportingCurrency`):

1. `organization_explicit` (future `Organization.reportingCurrency`)
2. `payment_account_default` — `OrganizationPaymentAccount.defaultCurrency`
3. `price_book_primary` — active `PriceBook.currency`
4. `platform_default` — EUR (org config only, **not** applied to documents)

---

## Rate date policies

| Metric type | Rate date |
|-------------|-----------|
| Accrual (invoiced / period revenue, expenses) | Invoice date |
| Cash (payment receipts, refunds, cash out) | `paidAt` |
| Receivables snapshot | Reference / snapshot date |

Historical evaluations use the rate effective on or before that date.

---

## Fallback behaviour

| Condition | Behaviour |
|-----------|-----------|
| Missing document currency | Row **excluded** — never defaulted to EUR |
| Same as reporting currency | `NATIVE` — no FX |
| FX rate available | `CONVERTED` — aggregated in reporting currency |
| No FX rate | `EXCLUDED_MISSING_RATE` — KPI **PARTIAL** |
| Stale rate (> `maxRateAgeDays`) | `EXCLUDED_STALE_RATE` — KPI **PARTIAL** |
| All rows excluded | **UNAVAILABLE** |
| No `fxContext` (legacy path) | Foreign currency excluded (no silent mixing) |

---

## Excluded data visibility

- `multiCurrency.dataQuality`: `nativeCount`, `convertedCount`, `excludedCount`, `missingRateCount`, `staleRateCount`, `missingCurrencyCount`
- UI: `MultiCurrencySummary` component on Financial Insights
- API: `missingSources` includes `fx_rate_unavailable`, `fx_rate_stale`, `documents_missing_currency`

Forecasts must state base currency (`MULTI_CURRENCY_DEFINITIONS.forecastCurrency`).

---

## Tests

`backend/src/shared/fx/multi-currency-analytics.spec.ts`:

| Scenario | Result |
|----------|--------|
| EUR-only | Native aggregation, COMPLETE |
| EUR + GBP with FX | Both summed in EUR |
| Missing FX rate | Foreign excluded, PARTIAL |
| Stale FX rate | Foreign excluded, PARTIAL |
| JPY (0 decimals) | Correct cross-minor conversion |
| BHD (3 decimals) | Correct cross-minor conversion |
| GBP credit note | Period revenue reduced in EUR |
| Missing document currency | Excluded, not treated as EUR |
| Receivables GBP open | Converted to EUR |
| Historical rates | May vs June rate selection |

All **10/10** passing (plus existing finance/receivables suites).

---

## Known limitations

1. Reference rates are static — production should persist org/ECB rates in `OrgFxRate` (future).
2. Filter helpers (`filterOpenReceivables`) still match native currency only — use analytics totals for FX-aware sums.
3. `Organization.reportingCurrency` column not yet in Prisma — resolved from payment account / price book.

---

## Impact on Prompt 12 metrics

- Foreign invoices **included** when FX rate available (previously excluded).
- `incompatibleCurrencyCount` now tracks all exclusion reasons.
- Completeness may be PARTIAL when rates missing/stale even if EUR rows exist.
