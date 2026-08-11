# Phase 3 E3 — Multi-Currency Reconciliation

Base main SHA: `6acdb24eb84986b25789c01fb544645231c53dc5`
Authority: `shared/evaluations-finance/evaluations-fx.ts` +
`shared/evaluations-finance/evaluations-money.ts`.
Evidence: `backend/src/modules/evaluations-finance/evaluations-fx.spec.ts`,
`evaluations-finance-calculator.spec.ts`, `evaluations-finance.service.spec.ts`.

## Supported currencies tested

`EUR`, `USD` (2-decimal), `JPY` (0-decimal), `KWD` (3-decimal), `CLF` (4-decimal)
via the central minor-unit exponent authority (`MONEY_MINOR_UNIT_EXPONENTS`).
No blanket "2 decimals" assumption.

## Aggregation policy

- **Same currency** ⇒ single total (`SINGLE_CURRENCY`).
- **Mixed currency, no reporting currency** ⇒ `PER_CURRENCY` (separate totals);
  the E1 money metric can hold only one value, so the finance service maps a
  genuinely multi-currency metric to **UNAVAILABLE** (`MIXED_CURRENCY_NO_REPORTING_AUTHORITY`)
  rather than a mixed false total.
- **Mixed currency, reporting currency + full rates** ⇒ `CONVERTED` single total.
- **Mixed currency, reporting currency, missing ≥1 rate** ⇒ `INCOMPLETE_FX`
  (fail closed; rows never dropped to fabricate a complete total).

## No-rate behaviour

`aggregateMoney([100 EUR, 100 USD])` ⇒ `PER_CURRENCY` (never `200 EUR`).
Service-level mixed currency without a reporting authority ⇒ UNAVAILABLE. Test:
"never fabricates a mixed 100 EUR + 100 USD = 200 EUR total".

## Full-rate behaviour

`aggregateMoneyToReportingCurrency([10000 EUR, 10000 USD], 'EUR', provider@0.9)`
⇒ `CONVERTED` total `19000 EUR`, with the USD leg carrying full provenance and
its preserved original `10000 USD`.

## Partial-rate behaviour

Same inputs, provider returns `null` for USD ⇒ `INCOMPLETE_FX`,
`missingCurrencies = ['USD']`, no total. The metric would be reported PARTIAL/
UNAVAILABLE per ADR, never AVAILABLE with a dropped row.

## Rate provenance

`EvaluationsFxRate` carries `sourceCurrency`, `targetCurrency`, `rate`,
`rateSource`, `rateObservedAt`, `roundingMode`, `conversionVersion`. A conversion
without a rate object is impossible (type-enforced). `convertMoney` rejects a
rate whose `sourceCurrency` differs from the money currency.

## Rate time

`rateObservedAt` is a UTC ISO-8601 instant on the rate, distinct from the
evaluation period. The conversion utility never substitutes "latest now"; the
caller supplies the business-appropriate (e.g. historical) rate. No look-ahead
bias is introduced by the utility.

## Reporting currency authority

Reporting currency for a true-zero period comes from
`OrganizationPaymentAccount.defaultCurrency` (org settings), never the browser
and never a hardcoded EUR. Absent settings ⇒ UNAVAILABLE.

## Rounding authority

Single documented mode `HALF_UP`, versioned by
`EVALUATIONS_FX_CONVERSION_VERSION = '1.0.0'`, applied only inside the optional
conversion utility when a caller supplies rates. No new rounding policy is
imposed on existing stored money (which is already exact integer minor units).

## Precision

Conversion uses exact BigInt scaled arithmetic
(`amountMinor · rateScaled · 10^targetExp / 10^(sourceExp + rateScale)` with
HALF_UP), never JS float. Cross-exponent example: `100.00 EUR × 160 = 16000 JPY`.
Overflow beyond `Number.MAX_SAFE_INTEGER` fails closed.

## Original amount preservation

`EvaluationsConvertedMoney` always retains `original` alongside `converted`.
Conversion is non-destructive.

## Counters

- `MIXED_CURRENCY_FALSE_AGGREGATION_COUNT = 0`
- `IMPLICIT_CURRENCY_DEFAULT_COUNT = 0`
- `FLOAT_MONEY_AUTHORITY_COUNT = 0` (canonical E3 modules)
