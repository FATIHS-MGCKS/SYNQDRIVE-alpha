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
