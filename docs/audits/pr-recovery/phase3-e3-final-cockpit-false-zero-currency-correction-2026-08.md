# Phase 3 E3.4 — Final Cockpit, False-Zero & Currency Presentation Correction

## 1. Revision identity

- `CURRENT_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5` (no drift)
- `PRE_E3_4_HEAD` = `a70cb83e7380095e42db8054d128d35f3b948d65`
- `TESTED_CODE_SHA` = `6d1e369449ef6ab43a8f339aa78acbae8963a551`
- `FINAL_BRANCH_HEAD` / PR headRefOid / `CHECK_RUN_HEAD_SHA` = branch head after the
  evidence commit (verified in the PR Final Output; branch == PR head).

## 2. InsightsCockpit money model

`InsightsCockpit` no longer receives EUR-shaped numbers. Its `openReceivables` prop
is a status-aware `FinanceMoneyView` (status + amountMinor + currency + reason),
rendered via the shared `formatFinanceMoney`. The `financialRiskEur` /
`openReceivablesEur` numeric props are removed.

## 3. Status preservation

`formatFinanceMoney` renders AVAILABLE as currency-correct money and
UNAVAILABLE/PARTIAL/STALE/NOT_APPLICABLE/ERROR/MISSING as a status label — status
is never converted to a numeric fallback.

## 4. False-zero prevention

UNAVAILABLE Open Receivables renders `—` (label), never `0 €`.
`COCKPIT_FALSE_ZERO_COUNT = 0`. Core KPI cards no longer force
`maximumFractionDigits: 0`, so `49` EUR minor shows `0.49 €`, never `€0`.
`VISUAL_ROUNDING_FALSE_ZERO_COUNT = 0`.

## 5. Currency preservation

Cockpit + Core cards + Recent Activity format with the backend/source currency and
the shared ISO-4217 minor-unit exponent authority — no hardcoded EUR / `/100`.
`INVALID_CANONICAL_CURRENCY_RELABEL_COUNT = 0`; `RECENT_ACTIVITY_CURRENCY_RELABEL_COUNT = 0`.

## 6. JPY / KWD full-page validation

JPY: `100` minor → `100 JPY` (cockpit + cards). KWD: `1000` minor → `1.000 KWD`.
Never `€`, never `1`/`10`. Covered by adapter tests (Core, cockpit money model,
raw money).

## 7. Core KPI precision

Currency-native fraction digits (EUR 2, USD 2, JPY 0, KWD 3). `49 EUR → 0.49 EUR`;
`-49 EUR → -0.49 EUR`; `1234 KWD → 1.234 KWD`.
`MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT = 0`.

## 8. Recent Activity currency

Each invoice is formatted in its own `currency` via `formatRawMoney` (USD → `$`,
JPY/KWD correct); missing/invalid currency → guarded label (no EUR guess).

## 9. Raw invoice error isolation

The `invoiceError` early-return is removed. A raw invoice-detail failure shows a
non-blocking banner and does NOT suppress canonical Core Finance cards (which render
from `financeBundle`). `RAW_INVOICE_ERROR_CORE_FINANCE_SUPPRESSION_COUNT = 0`.

## 10. Finance error isolation

When the finance endpoint fails, `financeBundle` is null → Core KPIs render
unavailable via the adapter (MISSING); they are never reconstructed from raw
invoices. Both-fail uses the existing loading/error pattern; no fabricated zeros.

## 11. Station reason propagation

`buildUnavailableBundle` propagates the specific reason to every money AND margin
metric. Station-scoped finance → all Core metrics `UNAVAILABLE` with reason
`STATION_SCOPED_FINANCE_UNSUPPORTED` (no collapse to `FINANCE_SOURCE_UNAVAILABLE`).
`INVALID_STATION_REASON_COLLAPSE_COUNT = 0`. Backend test:
"propagates STATION_SCOPED_FINANCE_UNSUPPORTED to every metric reason".

## 12. Core / cockpit reconciliation

The cockpit Open Receivables uses the SAME canonical metric response
(`readMoneyMetric(financeBundle, 'fin.open_receivables')`) as the Core Open
Receivables card — same status/amount/currency/reason, shorter formatting only.
`COCKPIT_CORE_RECONCILIATION_MISMATCH_COUNT = 0`.

## 13. Legacy degraded surfaces

E3.3 degraded treatment intact: daily chart "Limited · non-canonical"; top
customers/vehicles "· Limited"; MoM/avg-invoice "—". No regression.

## 14–16. E1 / E2 / E3 regression

`npm run test:evaluations`: 431 passing, 2 pre-existing `tire-critical.detector`
failures (byte-identical to base). Covers E1 money/currency/registry/SIGNED_PERCENT/
period/status/mirror, E2 tenant/station/HTTP/entity-ref, and E3/E3.1/E3.2/E3.3
(money arithmetic, lifecycle, payment ledger, current/historical receivables,
reporting currency, negative margin, payment→invoice tenant, mixed-currency
fail-closed, canonical endpoint, station propagation, JPY/KWD adapter).

## 17. Frontend quality

Finance adapter tests (money exponent, raw money, cockpit model, precision, station
path): 50 across finance suites; serving-path, characterization, businessPulse
pass. Frontend typecheck + production build PASS.

## 18. Backend quality

Backend finance suite: 77 (controller, service incl. reason propagation, calculator,
fx, money, ownership). Backend production typecheck: E3 clean (4 pre-existing
baseline). Prisma validate PASS.

## 19. Current-head CI

Recorded in the PR Final Output on the exact final head; red checks classified
PRE_EXISTING_IDENTICAL / PRE_EXISTING_MIGRATION_BASELINE / ENVIRONMENT_SPECIFIC.

## 20. Final counters

| Counter | Value |
|---|---|
| COCKPIT_FALSE_ZERO_COUNT | 0 |
| INVALID_CANONICAL_CURRENCY_RELABEL_COUNT | 0 |
| COCKPIT_CORE_RECONCILIATION_MISMATCH_COUNT | 0 |
| VISUAL_ROUNDING_FALSE_ZERO_COUNT | 0 |
| RECENT_ACTIVITY_CURRENCY_RELABEL_COUNT | 0 |
| RAW_INVOICE_ERROR_CORE_FINANCE_SUPPRESSION_COUNT | 0 |
| INVALID_STATION_REASON_COLLAPSE_COUNT | 0 |
| MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT | 0 |
| CLIENT_MIXED_CURRENCY_SILENT_DROP_COUNT | 0 |
| LEGACY_MIXED_CURRENCY_SILENT_DROP_COUNT | 0 |
| LEGACY_OUTSTANDING_DERIVATION_COUNT | 0 |
| PARALLEL_FINANCE_TRUTH_COUNT | 0 |
| INVALID_CLIENT_CORE_FINANCE_FORMULA_COUNT | 0 |
| INVALID_CLIENT_CORE_CURRENCY_AUTHORITY_COUNT | 0 |
| CORE_KPI_CLIENT_PERIOD_AUTHORITY_COUNT | 0 |
| STATION_SCOPE_ORG_FALLBACK_COUNT | 0 |
| KPI_DRILLDOWN_SCOPE_MISMATCH_COUNT | 0 |
| FALSE_ZERO_FINANCE_COUNT | 0 |
| CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT | 0 |
| STATION_SCOPE_FINANCE_LEAKAGE_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| FRONTEND_CANONICAL_MONEY_FORMATTER_COUNT | 1 (finance surface) |
| NEW_E3_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## Safety

- `MERGE_PERFORMED = NO`
- `PRODUCTION_MIGRATION_PERFORMED = NO`
- `PRODUCTION_DEPLOYMENT_PERFORMED = NO`
- `E4_STARTED = NO`
