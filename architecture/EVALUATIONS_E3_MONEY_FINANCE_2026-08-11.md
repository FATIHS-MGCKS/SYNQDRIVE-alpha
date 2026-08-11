# Evaluations E3 — Money & Finance Correctness (2026-08-11)

## Changes

- Added the canonical evaluations money/finance domain under
  `shared/evaluations-finance/` (byte-identical backend mirror
  `backend/src/synq/evaluations-finance/`):
  - `evaluations-money.ts` — currency-safe integer/BigInt money arithmetic,
    central ISO-4217 minor-unit exponent authority, deterministic float-free
    decimal→minor conversion, safe-integer overflow fail-closed, no implicit EUR.
  - `evaluations-fx.ts` — FX provenance + multi-currency aggregation (exact
    scaled HALF_UP conversion, per-currency aggregation, fail-closed on missing
    rates, original value preserved).
  - `evaluations-finance-facts.ts` / `evaluations-finance-calculator.ts` — single
    canonical semantics for revenue, cashflow, receivables, result, margin.
- Added the backend canonical finance authority
  `backend/src/modules/evaluations-finance/` (service + repository + metric
  mapper + module) consuming the E2 authorized analytics scope and E1 money/
  status/period contracts; emits E1 metric responses.
- Made the financial provenance builder currency explicit (removed the hidden
  `currencyFilter: 'EUR'` default) in `evaluations-financial-provenance.ts`
  (shared + backend mirror + frontend wrapper/test).
- Added `@synq/evaluations-finance/*` path alias (backend tsconfig + jest map)
  and extended the shared-contract mirror sync test to the new domain files.
- Reused existing `fin.*` registry IDs and calculation versions; no new metric
  definitions, no registry-version churn.

## Architektur

- **Single finance authority.** The shared `evaluations-finance` calculator is
  the one arithmetic/semantic truth for evaluations revenue/cashflow/
  receivables/result; the backend service is the server authority. Legacy
  client `financial-insights.logic.ts` remains a presentation consumer pending
  delegation (no second evaluations engine introduced).
- **Authority reuse.** Period = E1 `resolveEvaluationsPeriod`; tenant/station =
  E2 `EvaluationsAnalyticsScopeService`; currency codes = E1 ISO-4217 allowlist.
  No second period/scope/currency authority.
- **Money data flow.** Prisma money stays integer minor units + explicit
  currency (no schema change). Facts → per-currency BigInt aggregation → E1
  `EvaluationsMoney` at the wire boundary with safe-integer checks.
- **Fail-closed finance.** Missing source/currency ⇒ UNAVAILABLE (never false
  zero); mixed currency without reporting authority ⇒ UNAVAILABLE (no mixed
  total); station-scoped finance ⇒ UNAVAILABLE (no per-station attribution on
  current main); cross-tenant reads impossible (org-filtered queries).
- **No schema/migration, no deployment.** See
  `docs/audits/pr-recovery/phase3-e3-money-migration-validation-2026-08.md`.

Evidence: `docs/audits/pr-recovery/phase3-e3-*` (source authority matrix,
semantic matrix, money-migration validation, multi-currency reconciliation,
finance test report, implementation report).

## E3.1 — Runtime Authority & Financial Semantics Correction

### Changes (E3.1)

- The Financial Insights serving path (`financial-insights.logic.ts`) now
  delegates all classification and money arithmetic to `@synq/evaluations-finance`
  (single truth); the receivable KPI uses the canonical authoritative CURRENT
  outstanding balance (fixes the legacy `totalCents` receivable bug).
- `EvaluationsFinanceModule` registered in `AppModule`.
- Receivables are current-only; historical references fail closed
  (`HISTORICAL_RECEIVABLE_RECONSTRUCTION_UNAVAILABLE`).
- Reporting currency requires an ACTIVE, charges-enabled payment account
  (deterministic); schema-default EUR on a PENDING account is not authority.
- Profit margin served as additive `SIGNED_PERCENT` (negative/sub -100% served).
- Revenue/expense positive lifecycle allowlists (intake/rejected excluded).
- Payment→invoice same-tenant defense-in-depth.
- calculationVersion `2.0.0` for materially changed metrics; registry `1.3.0`.

### Architektur (E3.1)

- Runtime ownership: the canonical `@synq/evaluations-finance` calculator is the
  single formula authority; both the backend `EvaluationsFinanceService` and the
  client legacy adapter consume it. No parallel finance truth for the core metric
  scope.
- Receivable semantics are explicitly CURRENT-snapshot (Option B); no faked
  historical reconstruction.
- Additive E1 value type `SIGNED_PERCENT` added (E1 `PERCENT` remains [0,100]).

Evidence (E3.1): `phase3-e3-invoice-lifecycle-finance-matrix-2026-08.md`,
`phase3-e3-runtime-financial-semantics-correction-test-report-2026-08.md`,
updated semantic/source matrices and implementation report.

## E3.2 — Canonical Live Serving Path & Finance Metric Ownership

### Changes (E3.2)

- New canonical live endpoint `GET /organizations/:orgId/evaluations/finance/insights`
  (`EvaluationsFinanceController`, OrgScoping+Roles+Permissions `invoices:read`).
- `FinancialInsightsView` core KPIs now come from the backend via a status-aware
  finance adapter; client-side KPI summation/period/margin/EUR authority removed.
- Registry ownership reconciliation: client-only finance value metrics downgraded
  to `active_degraded`; registry `1.4.0`; ownership test enforces
  `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0` for finance value metrics.

### Architektur (E3.2)

- Runtime boundary: the browser is a pure presentation consumer of canonical
  finance values; the backend `EvaluationsFinanceService` is the single live
  authority for the eight core finance metrics. Data flow:
  `UI → finance endpoint → finance service → E1 period + E2 scope + calculator →
  canonical source records`.
- Period/timezone authority is server-side; KPI values are browser-timezone
  independent.
- Presentation-only breakdowns (daily chart, top-N, MoM, avg invoice) are
  explicitly non-canonical (downgraded), not KPI authority.

Evidence (E3.2): `phase3-e3-finance-metric-ownership-matrix-2026-08.csv`,
`phase3-e3-canonical-live-serving-path-test-report-2026-08.md`, updated
implementation report and semantic matrix; E3.1 serving-path claim marked
`SUPERSEDED_BY_E3_2`.

## E3.3 — Final UI Scope, Drilldown Reconciliation & Money Presentation

### Changes (E3.3)

- FinancialInsightsView propagates the selected station to the canonical finance
  endpoint (requested narrowing) and reloads Core KPIs on station change with a
  stale-response generation guard; station-scoped finance stays fail-closed (no
  org-wide fallback).
- Removed the non-canonical issued∪paid Core KPI drilldown popup and client
  contributing counts (correct absence over misleading breakdown).
- Money presentation converts minor→major via the shared ISO-4217 exponent
  authority (JPY=0, KWD=3, …), not `/100`; invalid currency → guarded state.
- Removed the legacy `total - paid` outstanding derivation.
- Legacy daily chart + top-N labeled Limited / non-canonical.

### Architektur (E3.3)

- One visible scope: the selected station drives both the presentation surface and
  the canonical Core KPI request; the backend is the single authority and fails
  closed for station-scoped finance.
- Money presentation is exponent-correct for all ISO-4217 currencies and is a pure
  display concern (no client finance calculation authority).
- Non-canonical legacy surfaces are explicitly degraded in the UI, never presented
  as canonical Core results.

Evidence (E3.3): `phase3-e3-financial-ui-reconciliation-matrix-2026-08.csv`,
`phase3-e3-final-ui-scope-money-presentation-test-report-2026-08.md`; updated
implementation report; E3.2 report claims marked `SUPERSEDED_BY_E3_3`.

## E3.4 — Final Cockpit, False-Zero & Currency Presentation Correction

### Changes (E3.4)

- InsightsCockpit takes a status-aware canonical Open Receivables Money view (not an
  EUR number); shared formatter; no false zero, no EUR relabel, JPY/KWD correct;
  canonical overdue removed from the insight risk sum.
- Core KPI cards use currency-native precision (removed forced 0 fraction digits).
- Recent Activity formats each invoice in its own currency (`formatRawMoney`).
- Raw invoice-detail failure no longer suppresses canonical Core Finance (removed
  early-return; non-blocking banner).
- Backend: station-scoped unavailable reason propagated to every money + margin
  metric.

### Architektur (E3.4)

- One status-aware money presentation authority for the finance surface; every
  visible canonical finance value flows backend → status-aware view → shared
  formatter → display. Canonical Core Finance rendering is independent of the raw
  invoice-detail data source (error isolation). Insights risk heuristics stay in the
  insights domain, separate from canonical E3 finance.

Evidence (E3.4): `phase3-e3-final-cockpit-false-zero-currency-correction-2026-08.md`,
updated UI reconciliation matrix and implementation report; E3.3 report claims marked
`SUPERSEDED_BY_E3_4`.

## E3.5 — Final Financial Risk Unit Safety & Render Acceptance

### Changes (E3.5)

- Removed the `financialImpactEur()` magnitude-based unit-guessing heuristic.
- InsightsCockpit: dropped the monetary "Finanzrisiko (geschätzt)" € card (now a
  non-monetary revenue-risk count) and the per-insight "≈ X € Risiko" badge.
- Added real rendered acceptance tests for InsightsCockpit and FinancialInsightsView
  (false-zero, JPY/KWD, error isolation, USD, station-scoped unavailable).

### Architektur (E3.5)

- Insights financial-impact heuristics are no longer presented as money anywhere on
  the finance surface; only canonical backend Money (via the shared status-aware
  formatter) is shown as finance value. Insights risk is a non-monetary signal.
- Rendered acceptance tests lock the E3.4/E3.5 presentation contract (no false zero,
  currency-correct, error isolation, station fail-closed).

Evidence (E3.5): `phase3-e3-insights-financial-risk-unit-matrix-2026-08.csv`,
`phase3-e3-final-risk-unit-render-acceptance-2026-08.md`; updated UI reconciliation
matrix and implementation report; E3.4 report claims marked `SUPERSEDED_BY_E3_5`.
