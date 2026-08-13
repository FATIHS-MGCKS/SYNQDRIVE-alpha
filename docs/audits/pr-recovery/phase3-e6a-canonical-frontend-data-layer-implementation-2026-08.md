# Phase 3 — E6A Canonical Frontend Data Layer — Implementation Report (2026-08)

Implements E6A only (canonical frontend data layer). No page redesign (E6B/C/D
deferred); no backend/Prisma/migration/config/feature-flag/production change.

## 1. Revision identity

| Ref | SHA |
|-----|-----|
| E6A_BASE_MAIN_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` (== E5 merge; 0 commits after) |
| Branch | `integration/evaluations-e6-canonical-frontend-2026-08` (from current main) |
| TESTED_CODE_SHA | `582cbe0c58e6da09b3f322110a251e41501311b3` |
| PR | #1026 (Draft, base main) |

## 2. Branch / PR

Fresh implementation branch off current main (NOT the audit/discovery branch). One
Draft PR (#1026) titled "Evaluations Recovery E6 – Canonical Presentation Layer";
it will carry E6A–E6D and remains Draft.

## 3. Existing frontend data architecture

Convention confirmed: custom `useState`/`useEffect` hooks over a shared `fetch`
wrapper in `frontend/src/lib/api.ts` (`request<T>` + `get<T>`); NO React Query/SWR.
`FRONTEND_SERVER_STATE_AUTHORITY = custom fetch hooks (api.ts)`. E6A follows this;
it introduces no second data-fetching framework.

The one Auswertungen page (`financial-insights` → `FinancialInsightsView` +
`InsightsCockpit`) currently consumes E3 finance + legacy dashboard-insights/misuse/
invoices. E6A does not modify these; the new canonical layer is additive and is
wired into the page in E6B.

## 4. Canonical contract sources

E1 primitives (`EvaluationsMetricStatus`, `EvaluationsMetricResponse`,
`EvaluationsMoney`, `EvaluationsDataCoverage`, `EvaluationsSourceFreshness`,
`EvaluationsPeriodWindow`, `EvaluationsPeriodType`) imported from the shared mirror
(`@synq/evaluations-metrics`, `@synq/evaluations-periods`) — aliases already present
in `frontend/vite.config.ts` + `tsconfig.app.json`. E4 (`e4/contracts/
evaluations-insights.contract.ts`) and E5 (`e5/contracts/evaluations-quality.contract.ts`)
have no shared mirror, so their shapes are mirrored verbatim in
`evaluations-canonical.types.ts` with documented provenance.
`FRONTEND_CONTRACT_DIVERGENCE_COUNT = 0`.

## 5. E3 Finance client

Reused existing `api.evaluations.financeInsights` (always-on E3). E3 finance remains
MTD; `EVALUATIONS_FINANCE_PERIOD_AUTHORITY = 'MTD'` marks that the selected analytics
period is never applied to Finance. E6A also exposes finance via the E4 summary
`sections.finance` slice (transport), whose period authority remains E3 MTD.
`FINANCE_PERIOD_RECALCULATION_COUNT = 0`.

## 6. E4 Analytics client

`api.evaluations.analyticsInsightsSummary(orgId, {periodType, stationIds})` →
`EvaluationsAnalyticsInsightsSummary` (complete composite: finance slice, costModel,
utilization, strengths, weaknesses, driverInfluence). Full server response preserved
(status/reason/coverage/calculationVersion/period/mixedCurrency/unsupported cost
categories/driver piiTier). Optional direct `driverAnalysis` client for the
person-level section (separate request, privacy-tiered).
`DUPLICATE_CANONICAL_REQUEST_COUNT = 0` (summary is the single composite source;
driver influence is a distinct person-level request by design).

## 7. E5 Quality client

`api.evaluations.analyticsQuality(orgId, req)` → `EvaluationsQualityReport` with all
five dimensions (FRESHNESS/COMPLETENESS/PROVENANCE/VALIDITY/TEMPORAL_APPLICABILITY)
and states (COMPLETE/PARTIAL/UNKNOWN/UNAVAILABLE) preserved. No client-side quality
score. `CLIENT_SIDE_QUALITY_SCORE_COUNT = 0`.

## 8. Period semantics

`EvaluationsAnalyticsRequest.periodType` maps to the canonical E1 `EvaluationsPeriodType`;
request construction only (no metric computed from dates; no day=24h/month=30d
assumption). The server-echoed `period` is transported unchanged. Finance is MTD and
kept separate.

## 9. Station semantics

`stationIds` sent narrow-only (comma-separated) as accepted by E2/E3/E4/E5; server is
the scope authority. No org-wide fetch + client station filtering.
`CLIENT_SIDE_STATION_RECONSTRUCTION_COUNT = 0`. Tenant (orgId) is passed per the
existing endpoint contract; no browser-side tenant widening.

## 10. Feature flag semantics

`EVALUATIONS_ANALYTICS_V2_MODE` (backend guard) returns 404 when off. **[SUPERSEDED
BY E6A.1 — see the "E6A.1 Independent Review Correction" section below: a generic 404
now maps to the neutral `NOT_FOUND`, NOT `FEATURE_DISABLED`, because the guard emits a
non-disclosing generic 404 with no reliable discriminator.]** The original E6A
status-aware `requestResult` mapped 404 → `FEATURE_DISABLED` (distinct from data),
403 → `UNAUTHORIZED`, other non-2xx/network → `ERROR`. A disabled feature never
becomes empty/zero/healthy data and never falls back to legacy analytics.
`FEATURE_DISABLED_AS_EMPTY_COUNT = 0`, `LEGACY_ANALYTICS_FALLBACK_COUNT = 0`. Config
was not changed.

## 11. Money formatting

`evaluations-money.ts` `formatCanonicalMoney({amountMinor, currency, locale})` reuses
the shared `getCurrencyMinorUnitExponent` authority (`@synq/evaluations-finance/
evaluations-money`). Currency from contract only; locale controls display style only;
missing/invalid currency → `null` (guarded), never EUR; no `/100`. `fmtEurMinor` is
NOT used for generic money. `IMPLICIT_CURRENCY_FORMATTING_COUNT = 0`,
`HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT = 0`, `CLIENT_SIDE_CURRENCY_INFERENCE_COUNT = 0`.

## 12. Mixed currency

`partitionByCurrency` transports `totalsByCurrency` unchanged and flags
`mixedCurrency`; it provides no cross-currency aggregate. `MIXED_CURRENCY_CLIENT_SUM_COUNT = 0`.
Unsupported cost categories (maintenance/damage/fixed) are transported with their E4
UNAVAILABLE status; no client reconstruction. `UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT = 0`.

## 13. Metric status preservation

Transport types keep the E1 6-state status and nullable analytical values verbatim;
no `?? 0`, no status normalization. `STATUS_COLLAPSE_COUNT = 0`,
`UNKNOWN_TO_ZERO_ADAPTER_COUNT = 0`, `QUALITY_STATE_COLLAPSE_COUNT = 0`.

## 14. Privacy / Driver Influence

`piiTier` and `driverRef` are transported exactly as returned; no join against
customers/users/drivers/bookings/invoices/misuse; no client role/permission→PII
logic. `CLIENT_SIDE_PII_AUTHORITY_COUNT = 0`,
`CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT = 0`.

## 15. Query keys / cache scope

`evaluations-query-keys.ts` builds `['evaluations', capability, orgId, period,
stations]` with sorted station ids; finance ignores period (fixed MTD). Org is
included → no cross-tenant collision. `CACHE_SCOPE_COLLISION_COUNT = 0`.

## 16. Request deduplication

`useEvaluationsCanonicalAnalytics` fetches summary + quality once for the page; all
core sections consume that single summary result (no per-section re-request). Driver
influence is one additional person-level request. `EXPECTED_INITIAL_REQUEST_COUNT = 2`
(summary + quality) for core sections; +1 lazy for driver influence.
`N_PLUS_ONE_REQUEST_COUNT = 0`.

## 17. Legacy boundary

The new canonical layer uses none of dashboard-insights/misuse-cases/raw
invoices/customers. Legacy files remain for their other consumers.
`LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT = 0`,
`RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT = 0`. No new business calculation:
`NEW_DUPLICATE_BUSINESS_CALCULATION_COUNT = 0`.

## 18. Files added/changed

Added: `frontend/src/rental/lib/evaluations/{evaluations-canonical.types.ts,
evaluations-money.ts, evaluations-request.ts, evaluations-query-keys.ts,
evaluations-analytics-client.ts}` + tests (`evaluations-money.test.ts`,
`evaluations-canonical.test.ts`); `frontend/src/rental/hooks/useEvaluationsCanonicalAnalytics.ts`.
Changed: `frontend/src/lib/api.ts` (add `requestResult` + `buildEvaluationsAnalyticsQuery`
+ 3 `api.evaluations` methods). No backend/Prisma/migration/config change.

## 19. Explicit deferrals to E6B/C/D

- E6B: wire hooks into the page IA, render sections/status badges, Finance MTD badge,
  cost/downtime (OPERATING_EXPENSES money + status-only unsupported categories).
- E6C: Data Quality UI (render E5 dimensions), Driver Influence UI (server tier).
- E6D: legacy source removal on the page, responsive/a11y/i18n, E2E/visual hardening.
The current `FinancialInsightsView` visuals are intentionally untouched in E6A (no
mixing of canonical + legacy for the same concept).

## E6A.1 Independent Review Correction (2026-08-12)

Two narrowly-scoped runtime corrections; no redesign, no backend change.

- Old 404 behavior: `mapEvaluationsResult` mapped every HTTP 404 →
  `FEATURE_DISABLED`.
- Actual FeatureGuard behavior: `EvaluationsAnalyticsFeatureGuard` throws
  `NotFoundException('Not found')` — a deliberately generic 404 with NO
  machine-readable discriminator (intentional non-disclosure so a disabled route
  leaks no existence). NestJS serializes `{ statusCode: 404, message: 'Not found',
  error: 'Not Found' }`.
- Discriminator decision: `FEATURE_DISABLED_DISCRIMINATOR_DOES_NOT_EXIST`. Message
  text ("Not found") is not a reliable discriminator and is never parsed as feature
  authority. Backend fail-closed non-disclosure is preserved
  (`BACKEND_RUNTIME_CHANGE_COUNT = 0`).
- Final 404 semantics: generic 404 → neutral `NOT_FOUND` (added to the result
  union). `FEATURE_DISABLED` remains in the union but is NEVER emitted from a bare
  404 — reserved for a future reliable, non-leaking discriminator.
  `HTTP_404_ALWAYS_FEATURE_DISABLED_COUNT = 0`. No legacy fallback on any state.
- Organization lifecycle: hooks now use a phased async state
  (`IDLE`/`LOADING`/`SETTLED`). No organization → `IDLE` (no request, no permanent
  spinner, no stale prior-org data); org A→B → `LOADING` then B (stale A cleared
  before B resolves); org A→null → `IDLE` (stale A cleared). Pure helpers
  `orgFetchState` + `shouldApplyResponse` encode this and are unit-tested.
- Race safety: the effect re-keys on organization+period+station; an `active` guard
  plus `shouldApplyResponse` ensure a late response for a superseded scope never
  overwrites the current one. `STALE_SCOPE_RESPONSE_OVERWRITE_COUNT = 0`.
- E6A1_TESTED_CODE_SHA: `e26ed3da638d1854656a237a9acceea2c1070e1c`.

## 20. Risk review

- No second Evaluations page (`SECOND_EVALUATIONS_PAGE_COUNT = 0`).
- No E7–E9 runtime (`E7/E8/E9_RUNTIME_SCOPE_COUNT = 0`; estimatedExposure/forecast/
  risk not present).
- `api.ts` carries pre-existing `no-explicit-any` lint debt (unrelated lines); E6A
  additions add zero new lint errors; dedicated E6 files lint clean.
- Feature flag is `off` by default on main; the layer renders an honest transport
  state so it is safe before the flag is enabled (E6B UX consumes this state).
  **[SUPERSEDED BY E6A.1: a generic 404 renders as the neutral `NOT_FOUND`, NOT
  `FEATURE_DISABLED` — the FeatureGuard's 404 is non-disclosing and carries no
  reliable discriminator.]**
