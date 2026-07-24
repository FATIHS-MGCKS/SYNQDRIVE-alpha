# Auswertungen Finance Test Report — July 2026 (Prompt 14/54)

Automated test suite for finance logic introduced/refined in Prompts 9–13 (Money domain, receivables, revenue/cashflow/contribution, multi-currency FX, evaluations KPI API).

## Summary

| Layer | Suites | Tests | Status |
|-------|--------|-------|--------|
| Backend finance suite (`test:evaluations:finance`) | 13 | 113 | ✅ Pass |
| Frontend evaluations (`test:evaluations`) | 10 | 50 | ✅ Pass |
| **Total (finance-focused)** | **23** | **163** | ✅ Pass |

## Golden fixtures

Canonical organizations live in `shared/evaluations-fixtures/finance-golden-organizations.ts`.

| Org | Scenario | Key expectations (MTD Jun 2026, ref `2026-06-16T12:00:00Z`) |
|-----|----------|----------------------------------------------------------------|
| **Alpha** (`org-alpha-eur`) | EUR-only, full cost basis | Period revenue net 67 200; invoiced gross 80 000; payment receipts 20 000; expenses 15 000; open receivables 20 000; overdue 8 000; operating result visible |
| **Beta** (`org-beta-mixed-fx`) | EUR reporting + GBP @ 1.17 | Period revenue 21 700 (10 000 EUR + 11 700 converted); ≥1 converted row; COMPLETE FX |
| **Gamma** (`org-gamma-partial`) | Missing currency, partial pay | Period revenue 25 000; missing currency count 1; operating result hidden; PARTIAL |
| **Delta** (`org-delta-adjustments`) | Credits, refunds, storno | Period revenue 12 000 (20k − 5k credit − 3k refund); refunds 3 000 |
| **Epsilon** (`org-epsilon-missing-fx`) | SEK without FX rate | Period revenue 5 000 EUR only; ≥1 missing rate; PARTIAL |

Invariants enforced in golden tests:

- ERROR/UNAVAILABLE metrics never expose numeric `value`
- No silent currency mixing (reporting currency on all aggregated metrics)
- PARTIAL when FX or cost basis incomplete — never presented as COMPLETE
- No heuristic cent/euro float conversion

## Coverage by test area

### Money arithmetic & minor units

| File | Type |
|------|------|
| `backend/src/shared/money/money-domain.spec.ts` | Unit |
| `backend/src/shared/money/money.util.spec.ts` | Unit |
| `backend/src/shared/money/money-insight-migration.spec.ts` | Unit |
| `backend/src/shared/money/money-domain.properties.spec.ts` | Property-based (fast-check) |

Covers: integer minor units, `sumMoney`, negative amounts, large values, currency mismatch rejection, no float heuristics.

### Receivables, aging, partial/over payments

| File | Type |
|------|------|
| `backend/src/shared/receivables/receivables-analytics.spec.ts` | Unit |
| `backend/src/shared/evaluations-finance-golden.spec.ts` | Golden / characterization |

Covers: aging buckets, partial payments, overpayments, credits/refunds/storno, missing due dates, org timezone overdue.

### Revenue / cashflow / contribution

| File | Type |
|------|------|
| `backend/src/shared/finance/revenue-cashflow-contribution.spec.ts` | Unit |
| `backend/src/modules/evaluations-metrics/financial-kpi.logic.spec.ts` | Unit |
| `frontend/src/rental/lib/evaluations/financial-insights-golden.characterization.test.ts` | Golden |
| `frontend/src/rental/lib/evaluations/financial-insights-scenarios.characterization.test.ts` | Scenarios |

Covers: invoiced vs period revenue, payment receipts (`paidAt`), expenses, contribution margin, operating result visibility, accrual adjustments.

### Multi-currency & FX

| File | Type |
|------|------|
| `backend/src/shared/fx/multi-currency-analytics.spec.ts` | Unit |
| `backend/src/shared/fx/fx.org-reporting-currency.spec.ts` | Unit |
| `backend/src/modules/evaluations-metrics/evaluations-fx-rate.service.spec.ts` | Service |

Covers: reporting currency resolution, FX conversion, missing currency/rate → PARTIAL, HALF_UP_MINOR rounding, no EUR default for missing document currency.

### Periods, month/year boundaries, DST, org timezones

| File | Type |
|------|------|
| `backend/src/modules/evaluations-metrics/evaluations-finance-periods.spec.ts` | Unit |

Covers: MTD in `Europe/Berlin`, year boundary exclusion, DST spring-forward overdue stability, `America/New_York` boundary.

### Repository / service / integration / API contract

| File | Type |
|------|------|
| `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.integration.spec.ts` | Integration (Prisma harness) |
| `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.harness.ts` | Test harness |
| `backend/src/modules/evaluations-metrics/evaluations-kpi.controller.characterization.spec.ts` | API contract |
| `frontend/src/rental/lib/evaluations/evaluations-financial-mtd.contract.test.ts` | API contract (response shape) |
| `frontend/src/rental/lib/evaluations/evaluations-metric.contract.test.ts` | Metric contract |
| `frontend/src/rental/lib/evaluations/evaluations-financial-provenance.test.ts` | Provenance |

Covers: `GET …/evaluations/kpis/financial-mtd` bundle, `EvaluationsMetricResponse` status rules (`value=null` on ERROR/UNAVAILABLE), multi-currency meta on API path.

## Commands executed

```bash
cd backend && npm run test:evaluations:finance
# 13 suites, 113 tests — PASS

cd frontend && npm run test:evaluations
# 10 suites, 50 tests — PASS

cd backend && npm run build
# PASS

cd frontend && npm run build
# PASS (tsc -b && vite build)
```

Verify script (includes finance suite):

```bash
bash scripts/test/evaluations-verify.sh
```

## Build & typecheck

| Command | Result |
|---------|--------|
| `backend npm run build` | ✅ Pass |
| `frontend npm run build` (`tsc -b && vite build`) | ✅ Pass |

Minor build fixes applied on this branch: `OrgReportingCurrencyResolution` export path, `@synq/fx` tsconfig alias, `FinanceMetricId` re-export.

## Remaining gaps

| Gap | Notes |
|-----|-------|
| Live DB integration | Harness uses in-memory Prisma mock — no real Postgres migration test |
| E2E browser | No Playwright/Cypress path for Financial Insights UI |
| Production FX provider | Tests use `MemoryFxRateProvider` / reference static rates — not live ECB/API |
| ClickHouse / telemetry finance | Out of scope for evaluations finance KPIs |
| Contribution margin cost classification | PARTIAL path tested; full cost-class taxonomy not exhaustively enumerated |
| Property-based tests beyond money | fast-check only on `money-domain` today |
| Stale FX rate age policy | `maxRateAgeDays` covered in unit tests; no dedicated integration with org config store |
| Refund Stripe ledger | Payment refund flows (V4.9.449) not in this suite — invoice-level refunds only |

## Test anti-patterns explicitly rejected

Tests assert that implementations **must not**:

1. Treat ERROR as `null` without `status=ERROR` and `value=null`
2. Sum mixed currencies without FX conversion
3. Mark PARTIAL data as COMPLETE operating result
4. Use floating-point euro/cent heuristics (`amount * 100`, etc.)

## Related documentation

- `docs/architecture/finance/revenue-cashflow-contribution-model.md`
- `docs/architecture/finance/multi-currency-analytics.md`
- `shared/evaluations-fixtures/finance-golden-organizations.ts`

---

*Generated: 2026-07-24 — Prompt 14/54*
