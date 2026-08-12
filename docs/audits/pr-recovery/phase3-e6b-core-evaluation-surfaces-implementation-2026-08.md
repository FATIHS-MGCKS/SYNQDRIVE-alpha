# Phase 3 — E6B Core Evaluation Surfaces — Implementation Report (2026-08)

Frontend-only. Builds the visible canonical Auswertungen presentation on top of the
E6A data layer. No backend/Prisma/migration/config/feature-flag/production change.
Driver Influence UI and the detailed Data Quality panel are deferred to E6C; E7–E9
excluded.

## 1. Revision identity
- Base main / E6A base: `a704fdcca76f03703a0816f71a4d11ffdbaf4292` (no drift).
- Branch: `integration/evaluations-e6-canonical-frontend-2026-08` (PR #1026, Draft).
- PRE_E6B_HEAD: `f426c2b3…`. E6B_TESTED_CODE_SHA: `55a1f37a4e58454c2982413253d8ef92b409ce79`.
- E6A runtime/test SHAs `582cbe0c` / `e26ed3da` are ancestors.

## 2. E6A lineage
E6A canonical data layer (clients, transport types, money formatter, hooks, result
states) is reused unchanged. E6A.1 lifecycle/404 semantics preserved. The one E6A.1
follow-up cleanup (§2 of E6B) fixed the stale top-of-file comment in
`evaluations-analytics-client.ts` (now states 404 → NOT_FOUND) and marked the old
404→FEATURE_DISABLED statement in the E6A implementation report as SUPERSEDED_BY_E6A.1.
`STALE_404_FEATURE_DISABLED_AUTHORITY_STATEMENT_COUNT = 0`.

## 3. Existing page replacement strategy
Evolutionary, single route: the `financial-insights` view now renders the new
`EvaluationsPage`; the legacy `FinancialInsightsView`/`InsightsCockpit` are no longer
routed (files retained for their isolated tests / other modules). One user-facing
Auswertungen route, one canonical composition. `SECOND_EVALUATIONS_PAGE_COUNT = 0`.

## 4. Final implemented IA
1. Page Header / Scope Controls · 2. (availability handled per-section) · 3. Executive
Summary · 4. Strengths & Weaknesses · 5. Finance & Receivables (MTD) · 6. Fleet
Performance / Utilization · 7. Costs & Downtime. No placeholder sections for
E6C/E7/E8/E9.

## 5. Global controls
`EvaluationsHeaderControls`: canonical E1 period selector (MTD/MONTH/QUARTER/YEAR/
ROLLING_7/30) governing E4/E5 only (note shown), plus a read-only station-scope
indicator (server authority; scope from the persisted dashboard station filter, passed
as canonical `stationIds`). No client date arithmetic, no org-wide→client station
filtering. `GLOBAL_FILTER_FALSE_SCOPE_COUNT = 0`, `CLIENT_SIDE_STATION_RECONSTRUCTION_COUNT = 0`.

## 6. Availability states
`EvaluationsSectionShell` renders IDLE / LOADING (skeleton) / and for SETTLED:
AVAILABLE (content) or a neutral transport message for UNAUTHORIZED / NOT_FOUND /
ERROR. Generic NOT_FOUND uses neutral copy ("…not available for this scope"), never
"feature disabled". `FEATURE_DISABLED_FALSE_POSITIVE_COUNT = 0`,
`LEGACY_ANALYTICS_FALLBACK_COUNT = 0`.

## 7. Executive summary
Derived from the shared E4 summary: Issued revenue (E3/MTD from the summary finance
slice, MTD-labelled), Utilization %, Strengths count, Weaknesses count — each with
canonical status; no-value statuses show `—` (never 0). No recompute from raw entities.

## 8/9. Strengths / Weaknesses
Render canonical E4 `strengths`/`weaknesses` only (no re-rank/re-score/threshold/
causation). Empty states are qualified: PARTIAL or skipped-dimensions → "…(coverage
incomplete)"; only fully-AVAILABLE empty uses strong "none detected" wording.
`FALSE_COMPLETE_EMPTY_DETECTION_UI_COUNT = 0`.

## 10. Finance & Receivables
Always-on E3 bundle via `useEvaluationsFinanceBundle`; values read status-aware via
the canonical `finance-insights-adapter` (`readMoneyMetric`/`formatFinanceMoney`,
`readPercentMetric`/`formatFinancePercent`); persistent "Monat bis heute" badge.
`PERIOD_SCOPE_MISREPRESENTATION_COUNT = 0`, `FINANCE_PERIOD_RECALCULATION_COUNT = 0`,
`CLIENT_SIDE_FINANCE_RECOMPUTATION_COUNT = 0`.

## 11. Utilization
Canonical E4 utilization only; scheduled-occupancy note shown (never "actual usage");
blocked/downtime-unknown note when `blockedMs === null`; PARTIAL reason surfaced. No
frontend utilization recomputation. `UTILIZATION_SEMANTIC_UPGRADE_COUNT = 0`,
`TELEMETRY_DOWNTIME_UI_CONFLATION_COUNT = 0` (telemetry not shown as downtime).

## 12/13. Costs & Downtime
Only OPERATING_EXPENSES rendered as authoritative Money (per currency, never summed);
maintenance/damage/fixed shown STATUS-ONLY with reason (never reconstructed amounts).
Mixed-currency flagged. No Pareto/waterfall/aging over unsupported categories, no
estimatedExposure. `UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT = 0`,
`UNSAFE_PR798_RESOLVER_USE_COUNT = 0`, `ESTIMATED_EXPOSURE_E6_COUNT = 0`.

## 14. Money semantics
E6A `formatCanonicalMoney`/`formatEvaluationsMoney` + the E3 finance adapter — explicit
`Money.currency`, shared ISO-4217 minor-unit authority (JPY=0, KWD=3), no EUR default,
no `/100`, no mixed-currency sum. `IMPLICIT_CURRENCY_FORMATTING_COUNT = 0`,
`HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT = 0`, `CLIENT_SIDE_CURRENCY_INFERENCE_COUNT = 0`,
`MIXED_CURRENCY_CLIENT_SUM_COUNT = 0`.

## 15. Period semantics
Analytics selector → canonical `periodType` (E4/E5). Finance fixed MTD (E3), never
altered by the selector. Server-echoed period displayed; no second date interpretation.

## 16. Legacy removal
Canonical composition uses none of dashboard-insights / misuse-cases / raw invoice or
customer recomputation. Endpoints/files retained for other consumers.
`LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT = 0`,
`RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT = 0`,
`MISUSE_CASES_INSIDE_CANONICAL_E6_COUNT = 0`.

## 17/18. Responsive & a11y baseline
Responsive grids (2→3/4/5 cols), tabular-nums + break-words for long money, wrapping
badges. Headings hierarchy (h1 page + h2 sections), `role="status"` badges with text
(not color-only), keyboard-operable `<select>`. Full responsive/visual/a11y hardening
is E6D.

## 19. i18n
`evaluations.*` DE + EN keys via the existing `useLanguage().t` system; currency/period
authority remains canonical (locale controls display only).

## 20. Request fan-out
ONE E4 `/insights/summary` (shared by Executive/S&W/Utilization/Cost) + ONE always-on
E3 finance request. `INITIAL_CANONICAL_REQUEST_COUNT = 2`,
`DUPLICATE_CANONICAL_REQUEST_COUNT = 0`, `N_PLUS_ONE_REQUEST_COUNT = 0`. (E5 quality is
available via E6A for E6C; not requested by E6B.)

## 21. Explicit E6C deferrals
Driver Influence UI (E6A transport intact, no client identity), detailed Data Quality
panel (E5 dimensions). Not rendered in E6B.

## 22. Explicit E7–E9 exclusions
No recommendations/actions (E7), no estimatedExposure/predictive risk (E8), no forecast
UI (E9). `E7/E8/E9_RUNTIME_SCOPE_COUNT = 0`.

## 23. Files changed
Added: `frontend/src/rental/components/evaluations/{MetricStatusBadge,EvaluationsSectionShell,
EvaluationsKpiCard,ExecutiveSummarySection,StrengthWeaknessSection,FinanceReceivablesSection,
FleetUtilizationSection,CostDowntimeSection,EvaluationsHeaderControls,EvaluationsPage,
evaluations-presentation,evaluations-section-derive}.tsx/.ts` + tests
(`evaluations-presentation.test.ts`, `evaluations-sections.render.test.tsx`);
`frontend/src/rental/hooks/useEvaluationsFinanceBundle.ts`. Changed:
`frontend/src/rental/App.tsx` (route → EvaluationsPage), `i18n/translations/{en,de}.ts`
(evaluations keys), `evaluations-analytics-client.ts` (comment), e2e
(`evaluations-flow.spec.ts` rewritten canonical; `evaluations-fixtures.ts` canonical
mocks; `evaluations-visual.spec.ts` + `evaluations-a11y.spec.ts` deferred to E6D).

## 24. Risk review
- Feature flag off by default on main → canonical analytics sections render neutral
  NOT_FOUND; Finance (always-on E3) still renders. Honest, no legacy fallback.
- Playwright not runnable in the sandbox (no browsers) → E2E flow spec rewritten to
  canonical selectors/copy I control but validated in CI only; legacy snapshot specs
  deferred (E6D). Unit/component tests (validated) are the primary evidence.
- `App.tsx` carries pre-existing lint debt (unchanged by the one-line route swap).
