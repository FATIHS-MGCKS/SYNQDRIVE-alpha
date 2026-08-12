# Phase 3 — E6.0 Historical Component Salvage & Execution Blueprint (2026-08)

Pre-implementation analysis only. NO runtime/test/Prisma/config/flag/VPS change,
no cherry-pick/merge, no E7–E9. Only `docs/audits/pr-recovery/**` changed.

## 1. Executive decision

E6 is a **frontend-only** Evaluations (Auswertungen) UI that PRESENTS the canonical
E1–E5 truth. Every visible concept maps to an existing endpoint; no new backend
authority is required (`BACKEND_DECISION = E6_FRONTEND_ONLY`). Recovery strategy is
**STRATEGY_C** (reimplement on current main using historical design only): the
historical stack (#792–#803) is a stacked chain on a pre-E1 base whose hook layer is
largely canonical-compatible but which (a) points at pre-recovery/E2 endpoints,
(b) carries specific unsafe units, and (c) embeds E7/E8/E9 content. We salvage its
design/components and re-point to E4/E5, deleting the unsafe/duplicate/future-phase
parts. The existing single Auswertungen page (`financial-insights` →
`FinancialInsightsView` + `InsightsCockpit`) is EVOLVED in place — no second page.

`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`.

## 2. Revision identity

| Ref | SHA |
|-----|-----|
| CURRENT_MAIN_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| E5_MERGE_ANCESTOR | YES (main == E5 merge; COMMITS_AFTER_E5_COUNT = 0) |
| Discovery branch | `audit/evaluations-e6-discovery-2026-08` (`b9500b06`) |

## 3. Historical PR forensics

Stacked chain (shared base `57f6b06f` pre-E1; #803 base `4e16a386`), monotonically
growing file/commit counts → each PR builds on the previous:

| PR | Head | Files vs base | Commits | Reachable from main | Deps |
|----|------|---------------|---------|---------------------|------|
| #792 | c82e4493 | 131 | 14 | NO | pre-E1 base |
| #793 | ff34b66f | 146 | 15 | NO | #792 |
| #794 | 14072b31 | 166 | 16 | NO | #793 |
| #795 | 2759f223 | 174 | 17 | NO | #794 |
| #796 | cb2ced96 | 183 | 18 | NO | #795 |
| #798 | 7f6dde4c | 194 | 19 | NO | #796 |
| #801 | 64344347 | 200 | 21 | NO | not linear (own branch) |
| #803 | ddad5606 | 205 | 22 | NO | base 4e16a386 |

Per-PR contribution was isolated by diffing consecutive heads. None are ancestors
of main; all are DESIGN authority only.

## 4. Component salvage summary

See `phase3-e6-component-salvage-matrix-2026-08.csv` (symbol-level). Headline:
- The metric-state layer (#792: badge/value/kpi-card) is safe presentation → ADAPT.
- Data-layer hooks (`useEvaluationsAnalyticsSummary`, `useEvaluationsInsightsAnalytics`)
  are canonical-compatible but point at E2/historical endpoints → REIMPLEMENT against
  E4/E5 (keep validators/shape discipline).
- `useEvaluationsInvoiceData` is a legacy raw-invoice data layer with client math and
  `customerLabel()` PII → REPLACE (do not reuse).
- IA shell + sections (#794) → ADAPT; drop Risks (E9) and Actions (E7) sections.
- Executive KPI strip (#795), S/W cockpit (#796) → ADAPT visuals; the shared
  re-ranking/scoring (`evaluations-sw-cockpit.ts`) is SUPERSEDED_BY_E4 (render E4 order).
- #798 cost/downtime viz → ADAPT; risk-matrix (E8) + forecast block (E9) excluded.
- #801 responsive + #803 a11y/i18n → COPY_PATTERN_ONLY.

## 5. PR #792 — Metric State UX

`EvaluationsMetricStateBadge` maps UX kinds to tones: partial→warning,
stale→watch(+overlay), unavailable→neutral (NOT green), error→critical,
not_applicable→neutral; available/null_value→hidden. `EvaluationsMetricValue`
renders `—` when `!canShowValue`; shared contract states "never substitute 0 on
error". No dangerous UNAVAILABLE→0 / UNKNOWN→green / PARTIAL→complete. Minor fix:
`EvaluationsMetricKpiCard` uses `(rawValue ?? 0) > 0` for accent color only.

Canonical status→E6 visual mapping (hard invariant: no unavailable/partial/unknown
becomes a valid zero):

| CANONICAL_STATUS | E6 visual state | Value rendering | Badge | Tooltip | ARIA |
|------------------|-----------------|-----------------|-------|---------|------|
| AVAILABLE | normal | formatted value | none | — | value read normally |
| PARTIAL | warning | value + "unvollständig" badge | warning | explains partial coverage | aria notes partial |
| STALE | watch | value + stale overlay/badge | watch | last-updated recency | aria notes stale |
| UNAVAILABLE | muted | `—` (never 0) | neutral | why unavailable | aria "nicht verfügbar" |
| ERROR | critical | no value | critical | error reason | aria "Fehler" |
| NOT_APPLICABLE | muted | `—` | neutral | not applicable | aria "n/a" |

## 6. PR #793 — Data Quality Panel

Historical panel has TWO unsafe behaviors to drop: (a) client role gate
`isEvaluationsDataQualityAdmin(userRole)` (client-side permission authority);
(b) shared `deriveErrorRatePercent` heuristic (`100 - coveragePercent` or
`critical*35 + warning*12`) — a client-side quality/error derivation not in the E5
contract. E6 Quality UI must render E5 truth ONLY: `E5SectionQuality.dimensions`
(FRESHNESS/COMPLETENESS/PROVENANCE/VALIDITY/TEMPORAL_APPLICABILITY as COMPLETE|
PARTIAL|UNKNOWN|UNAVAILABLE), `freshness` (UNKNOWN on main), `businessEventRecency`,
`coverage`, `lineage`, `overall.complete`. Salvage: layout, `EvaluationsDataQualityStateBadge`,
source-card layout, expand/collapse, user hint — all bound to E5 fields. No overall
percentage/traffic-light unless E5 supplies it (it does not → show per-dimension).

## 7. PR #794 — Information Architecture

Historical 9 sections, classified:

| Historical section | Classification |
|--------------------|----------------|
| Global Filters & Data Status | E6 |
| Executive Summary | E6 |
| Strengths & Weaknesses | E6 |
| Risks & Forecasts | E8/E9 (REMOVE from E6) |
| Finance & Receivables | E6 |
| Fleet Performance | E6 |
| Costs & Downtime | E6 (current only; predicted → E8) |
| Actions & Recommendations | E7 (REMOVE from E6) |
| Data Quality | E6 |

No future-phase placeholder cards in E6. Historical IA also wrongly wired KPIs to the
E2 entity-reference summary; E6 must use the E4 insights summary.

## 8. PR #795 — Executive KPI Strip

KPI strip resolves via shared `resolveExecutiveKpiStrip` (no client financial
recompute in the component). E6 KPIs and canonical mapping:

| KPI | Canonical source | Endpoint | Status/Money/Period/Station |
|-----|------------------|----------|------------------------------|
| Issued revenue (`fin.mtd_issued_revenue`) | E3 | finance/insights (or E4 summary.finance) | E1 status; EvaluationsMoney; MTD; station→UNAVAILABLE |
| Paid revenue (`fin.mtd_paid_revenue`) | E3 | same | same |
| Expenses (`fin.mtd_expenses`) | E3 | same | same |
| Net result (`fin.mtd_net_result`) | E3 | same | same (fix: do NOT green when unavailable) |
| Profit margin (`fin.profit_margin_mtd`) | E3 | same | percent; status-aware |
| Open/Overdue/Total receivables (`fin.*receivables`) | E3 | same | fail-closed historical |
| Utilization % | E4 | insights/utilization | E1 status |

Any KPI unsupported by E1–E5 = REMOVE_FROM_E6 (no client reconstruction). All eight
`fin.*` keys are supported → none removed. No client-side financial recomputation.

## 9. PR #796 — Strengths / Weaknesses

Frontend cockpit is presentation; the shared `evaluations-sw-cockpit.ts` performs
client re-ranking/scoring/dedupe/root-cause grouping — **forbidden** (E4 owns
detection order/severity/evidence). E6 renders only E4 `strengths`/`weaknesses`
sections (`E4StrengthResult`/`E4WeaknessResult`, `evidenceKind`, `severity`,
`evaluatedDimensions`/`skippedDimensions`→PARTIAL). No client thresholds, no
scoring, no association→causation upgrade. Salvage finding-card/drawer visuals only.

## 10. PR #798 — Cost / Downtime forensic split

| Class | Count | Examples |
|-------|------:|----------|
| E6_CURRENT_STATE | 42 | costsMinor, expensesMtd, fixed/damage/maintenance/actual waterfall, pareto share/cumulative, downtimePercent (from utilization), maintenance/blocked/cleaning vehicle counts, receivables aging, dimension value/deltaVsOrg, current estimatedExposure, currency, period |
| E8_PREDICTIVE | 8 | probability, impact, RiskMatrixPoint.confidence, exposureMinor (P×I allocation), col/axis probability, cellTone score, scaleToFive outputs |
| E9_FORECAST | 5 | quantitativeDeviation.kind==='FORECAST', forecasts list UI, isForecast (chart card + SW card passthrough), forecast i18n |
| GENERIC_VISUAL | 14 | chart shells, tables, empty states, formatters, skeletons |
| UNSAFE | 4 | cellTone(probability+impact); shared deriveErrorRatePercent; derivedDowntimePct fallback; (rawValue??0) accent |

`PREDICTIVE_SYMBOL_COUNT = 8`, `FORECAST_SYMBOL_COUNT = 5`, `E6_SAFE_SYMBOL_COUNT = 42`.
E6 keeps only current/historical costs & downtime from E4 cost-model + utilization.
`EvaluationsRiskMatrixChart` and shared `resolveRiskMatrix`/`scaleToFive`/exposure →
BELONGS_TO_E8. `EvaluationsRisksSection` forecast block → BELONGS_TO_E9. Expected E6
contamination after blueprint = 0.

## 11. PR #801 — Mobile

Historical `evaluations-responsive.constants.ts` + per-component responsive edits +
`evaluations-responsive.spec.ts`. Copy responsive PATTERNS only (breakpoints,
stacking) — not old DOM-specific CSS. Target responsive requirements:
- phone (<640): single column; sticky section nav collapses to select; KPI strip
  horizontal scroll or 1-col; charts min-height + horizontal scroll or fallback data
  table; tables → stacked cards; long money values wrap/tabular-nums; PARTIAL/STALE
  badges remain visible (never hidden to save space).
- tablet (640–1024): 2-col KPI/section grid; charts responsive width.
- desktop (>1024): full multi-column IA with sticky anchor nav.
- Driver Influence + Data Quality: dimension chips wrap; no truncation of state.

## 12. PR #803 — Accessibility / i18n

Reuse ARIA/landmark/heading/keyboard/focus/screen-reader patterns and the DE/EN
`evaluations.*` translation keys via the EXISTING project i18n system (no hardcoded
strings). Number/currency/date formatting via existing locale utilities +
`evaluations-format.ts`. E6 a11y acceptance criteria: single h1 + ordered headings
per section; `<nav>`/`<section>` landmarks; sticky nav keyboard-operable; charts have
text-alternative data tables (`EvaluationsChartDataTable`); status badges have
`aria-label`; focus visible; color is not the only signal (icon+text for status);
DE + EN parity.

## 13. #818 test infrastructure

On main already: `frontend/e2e/evaluations-flow.spec.ts`, `evaluations-a11y.spec.ts`,
`evaluations-visual.spec.ts`, `evaluations-fixtures.ts` (mock invoices,
dashboard-insights, misuse-cases, finance insights). They test the current
`financial-insights` view with legacy mocks. E6 test-extension plan: extend fixtures
to mock E4 `/insights/summary`, E5 `/insights/quality`, driver-analysis (all
tiers), and feature-flag off/on; extend flow spec for the new sections + status
states; extend a11y spec for new landmarks; extend visual spec for section snapshots;
add responsive spec (from #801). Do NOT create a new harness — extend #818.

## 14. Current Auswertungen architecture

Exactly ONE page: `financial-insights` → `FinancialInsightsView` (+ `InsightsCockpit`).
Core finance KPIs already E3-canonical via `finance-insights-adapter` (KEEP). Below
"Financial Intelligence": `financial-insights.logic.ts` (15+ FORBIDDEN_DUPLICATE
functions over `invoices.list`) + client top-customers/vehicles + `customerLabel`
PII. `InsightsCockpit` uses `dashboard-insights` + `misuse-cases`. File verdicts in
salvage CSV. Evolutionary path (no second page): add E4/E5 API clients + hooks →
render exec summary/strengths/weaknesses/utilization/cost-downtime/quality/driver
from canonical → stop using client aggregates on this page → keep
`invoices/customers` only for line-item activity until E4 drilldowns exist.

## 15. Legacy data sources

| Endpoint | Page consumer | Purpose | Canonical replacement | E6 keep? | Other consumers |
|----------|---------------|---------|-----------------------|----------|-----------------|
| evaluations/finance/insights (E3) | FinancialInsightsView | core KPIs | self | KEEP | only this page |
| invoices | FinancialInsightsView | detail/chart/rankings/legacy math | E4 sections | REDUCE to line-items | dashboard, tasks, topbar (KEEP endpoint) |
| customers | FinancialInsightsView | id→name | E4/E5 server refs | REMOVE from page math | many (KEEP endpoint) |
| dashboard-insights | InsightsCockpit | risks/leakage/reco | E4 insights/summary (partial) | REDUCE | app-wide (KEEP endpoint) |
| misuse-cases | InsightsCockpit | abuse cards | none (separate domain) | KEEP short-term | MisuseCasesPanel, handover |
| fleet-map | indirect | station filter/labels | E2 scope | KEEP | fleet shell (KEEP) |

Do not remove shared endpoints; only stop the page from doing client business math.

## 16. Duplicate calculations

FORBIDDEN_DUPLICATE_AUTHORITY on current page (must be removed/replaced during E6):
`financial-insights.logic.ts` (isEurInvoice, sumCents, currentOpen/Overdue/Total
receivables, issued/paid/mtd/reserved/expenses InRange, etc.), `FinancialInsightsView`
(scopedInvoices, bucketed, dailySeries, topCustomers, topVehicles, summary counts).
Historical duplicates: `useEvaluationsInvoiceData` (same), shared
`evaluations-sw-cockpit` scoring, shared risk-matrix synthesis, `deriveErrorRatePercent`,
client provenance builders. Formatting (fmtEUR/fmtPct/adapters) is allowed.
`DUPLICATE_BUSINESS_CALCULATION_COUNT` target after E6 = 0.

## 17. Canonical E1–E5 contract map

See `phase3-e6-canonical-frontend-contract-matrix-2026-08.csv` for exact
endpoint/request/response/status/quality/privacy/period/station/money per section.
Contract shapes captured verbatim: `EvaluationsMetricResponse` (6-state status;
value-bearing vs no-value; `EvaluationsMoney{amountMinor,currency}`; `dataCoverage`;
`sourceFreshness`), `EvaluationsPeriodWindow` (`[start,endExclusive)`, timezone
context), E4 section contracts (incl. `EvaluationsDriverInfluenceSection.piiTier` +
`E4DriverFactor`), E5 `EvaluationsQualityReport` (dimensions, lineage, overall).
Frontend `@synq/*` aliases exist for metrics/periods/finance; E4/E5 have NO shared
mirror → E6 must add local client types (or new aliases).

## 18. Backend gap decision

`BACKEND_DECISION = E6_FRONTEND_ONLY`. Every E6 section maps to an existing endpoint.
`CANONICAL_API_GAP_COUNT = 0`. One data-availability limitation (not an API gap):
downtime `blockedMs` is `null` on main (no authoritative blocked source) — E6 renders
it UNAVAILABLE, does not fabricate. No adapter is required; the E4 composite
`/insights/summary` already aggregates sections server-side.

## 19. Feature flag runtime analysis

`EVALUATIONS_ANALYTICS_V2_MODE` ∈ {off, shadow, on}; default `off`; guard 404s when
`off`; `shadow` == `on` at HTTP today. Gated: all E2/E4/E5 endpoints. Always-on: E3
finance, E1 registry. Committed config sets no production value →
`PRODUCTION_FLAG_STATE = UNSET` (effective default `off`). E6 must render safely when
gated.

## 20. Feature-flag UI contract

| Flag state | E6 behavior |
|------------|-------------|
| on / shadow | Full E6 (E4/E5 sections render) |
| off / UNSET | Analytics sections show an honest "Auswertungen analytics not enabled" state (feature-disabled), NOT legacy client math. E3 finance KPIs + E1 registry (always-on) may still render as the core finance strip. No second-truth fallback. |
| endpoint 404/unauthorized | Section-level UNAVAILABLE/feature-disabled state; never fabricate data |

## 21. Privacy contract

Server resolves PII tier (E5B: `full`/`pseudonymous`/`none`; HMAC pseudonyms; DRIVER
hard-deny); server returns permitted `driverRef` + `piiTier`; frontend renders the
response. FORBIDDEN: frontend role/permission→PII decision, client pseudonym
generation, raw-ID fallback, cross-joining `driverRef` against cached
customers/invoices. Historical violations to NOT carry over:
`useEvaluationsInvoiceData.customerLabel()` (name/email/id.slice),
`EvaluationsFinanceInvoiceDetail` PII render, `EvaluationsDataQualityAdminPanel`
client role gate. `CLIENT_SIDE_PII_AUTHORITY_COUNT` target = 0;
`RAW_ID_FALLBACK_COUNT` target = 0.

## 22. Driver influence contract

Render `EvaluationsDriverInfluenceSection`: by `piiTier` — `full`: show returned
`driverRef` (server-permitted identity); `pseudonymous`: show returned pseudonym as-is;
`none`: show UNAVAILABLE ("insufficient authorization"), no factors. By status:
AVAILABLE→factors; PARTIAL→factors+partial note; STALE→factors+stale; UNAVAILABLE/
ERROR/NOT_APPLICABLE→no factors + reason. Always show association-only disclaimer +
confounders. No client authorization inference; no name reconstruction.

## 23. Quality presentation contract

Per E5 dimension state:

| E5 state | Label | Visual | Tooltip | Value shown? | Warning? |
|----------|-------|--------|---------|--------------|----------|
| COMPLETE | Vollständig | positive/neutral | evidence basis | yes | no |
| PARTIAL | Teilweise | warning | what's missing | yes + caveat | yes |
| UNKNOWN | Unbekannt | muted/neutral | no authority to attest | dimension shown UNKNOWN | yes |
| UNAVAILABLE | Nicht verfügbar | muted | not served | no | yes |

No composite percentage (E5 supplies none). `overall.complete` shown honestly
(false while freshness UNKNOWN). UNKNOWN stays visibly UNKNOWN.
`CLIENT_SIDE_QUALITY_AUTHORITY_COUNT` / `CLIENT_SIDE_FRESHNESS_AUTHORITY_COUNT` = 0.

## 24. Money contract

Currency comes from `EvaluationsMoney.currency` (per value); never inferred from
locale. No float recomputation; `amountMinor` integer minor units; format only
(minor→major for display). Mixed currency never silently summed (E4 cost-model exposes
`mixedCurrency` + `totalsByCurrency[]`; render per-currency). Reuse
`finance-insights-adapter` + `evaluations-format` formatters.

## 25. Period / timezone contract

E6 period selector maps to `periodType` (single canonical enum); the response echoes
`EvaluationsPeriodWindow` with `[start, endExclusive)` and `timezone` context — E6
displays using that, never introduces a second date-range interpretation. E3 finance
is fixed MTD (document in UI).

## 26. Station / tenant contract

E2 owns scope. UI passes `orgId` (from context) + optional `stationIds` (narrow-only).
org-wide → full sections; station-scoped → finance/cost/driver return UNAVAILABLE
(render honestly), utilization/strengths/weaknesses where lineage exists; unauthorized/
mixed station → server fail-closed. Frontend never filters org-wide data into a fake
station result.

## 27. Final information architecture

1. Page Header / Global Controls (period + station) — E1/E2
2. Data Status (E5 overall) — E5
3. Executive Summary (KPI strip) — E4 summary + E3 finance
4. Strengths & Weaknesses — E4
5. Finance & Receivables — E3 (+E4 finance slice)
6. Fleet Performance / Utilization — E4
7. Current Costs & Downtime — E4 cost-model + utilization (no predicted)
8. Driver Influence — E4/E5 (server tier)
9. Data Quality — E5

Reserved (NOT in E6): Risks & Forecasts (E8/E9), Actions & Recommendations (E7).

## 28. Section detail (source / design / states)

For each section: canonical source (see §17 CSV); historical design source (§4);
component strategy (ADAPT historical + current page); loading (skeleton), status
(status-aware per §5), empty (distinct from zero), privacy (§21/22 for driver),
mobile (§11). Downtime section renders UNAVAILABLE for `blockedMs` (data limitation).

## 29. Component architecture

| Component | Strategy | Source |
|-----------|----------|--------|
| EvaluationsPage (composer) | ADAPT_EXISTING (evolve FinancialInsightsView) | #798 + current |
| EvaluationsFilters / GlobalFiltersSection | ADAPT | #792/#794 |
| EvaluationsSection / EvaluationsSectionNav | ADAPT | #794 |
| MetricStatusBadge (EvaluationsMetricStateBadge) | ADAPT | #792 |
| EvaluationsMetricValue / EvaluationsMetricKpiCard | ADAPT | #792 |
| ExecutiveKpiStrip / ExecutiveKpiCard | ADAPT | #795 |
| StrengthWeaknessSection / SwFindingCard / Drawer | ADAPT (visual) | #796 |
| FinanceSection | ADAPT (rebind off legacy) | #794 + current |
| UtilizationSection (Fleet) | ADAPT | #794 |
| CostDowntimeSection + cost/downtime charts + ChartDataTable | ADAPT (exclude risk-matrix) | #798 |
| DriverInfluenceSection | NEW (render E4/E5 tier) | (no safe historical) |
| DataQualitySection + StateBadge + SourceCard | ADAPT (drop client derivation/role gate) | #793 |
| finance-insights-adapter / evaluations-format | REUSE_EXISTING | current/#794 |

Avoid unnecessary abstraction; prefer existing repo conventions.

## 30. Frontend data layer

Convention (confirmed): custom hooks + `fetch` wrapper in `frontend/src/lib/api.ts`,
`useState`/`useEffect` (NO React Query). Follow it.

| Hook / client | Endpoint | Query key deps | Flag behavior | Error | Status |
|---------------|----------|----------------|---------------|-------|--------|
| api.evaluations.analyticsInsightsSummary | E4 /insights/summary | orgId, periodType, stationIds | 404→disabled state | section UNAVAILABLE | preserve per-section status |
| api.evaluations.analyticsQuality | E5 /insights/quality | orgId, periodType, stationIds | 404→disabled | UNAVAILABLE | preserve dimension states |
| api.evaluations.driverAnalysis | E4 driver-analysis | orgId, periodType, stationIds | 404→disabled | UNAVAILABLE | preserve piiTier |
| api.evaluations.financeInsights (exists) | E3 finance | orgId, stationIds | always-on | UNAVAILABLE labels | preserve |
| api.evaluationsMetrics.registry | E1 registry | (none, cached) | always-on | fallback labels | n/a |
No business calculations in hooks; validate + pass through.

## 31. State presentation matrix

LOADING ≠ EMPTY ≠ ZERO ≠ UNAVAILABLE ≠ ERROR ≠ PARTIAL ≠ STALE:

| State | Visual | Value | Notes |
|-------|--------|-------|-------|
| LOADING | skeleton | none | not zero |
| EMPTY (served, no items) | empty illustration/text | n/a | "keine Daten im Zeitraum" |
| ZERO (measured, value-bearing) | value `0` | `0` | only when status value-bearing & measured |
| UNAVAILABLE | muted `—` | none | never 0 |
| ERROR | critical | none | reason |
| PARTIAL | warning + value | value | caveat badge |
| STALE | watch + value | value | recency shown |

## 32. Performance blueprint

Use the E4 composite `/insights/summary` (1 request) + E5 `/insights/quality` (1) +
E1 registry (1, cached) as the initial load; driver-analysis lazy on section view;
E3 finance already inside composite (avoid double-fetch — read finance from composite
on this page). `EXPECTED_INITIAL_REQUEST_COUNT = 3` (summary, quality, registry).
`DUPLICATE_REQUEST_RISK_COUNT = 1` (E3 finance also standalone — mitigate by reading
composite). `N_PLUS_ONE_RISK_COUNT = 0` (factors/sections are in-payload). Frontend
orchestration only; no new aggregation backend.

## 33. Implementation phase plan

**E6A — Canonical Frontend Data Layer.** Scope: `api.ts` client fns + typed hooks +
local E4/E5 types; feature-flag-aware fetch; status preservation; no business calc.
Files: `frontend/src/lib/api.ts`, `frontend/src/rental/hooks/useEvaluations*`,
`frontend/src/rental/lib/evaluations/*` types. Reuse: #792 hooks (repointed),
`finance-insights-adapter`. Tests: hook unit + validators. Gate: no client business
math; flag off → disabled state.

**E6B — IA + Core Surfaces.** Scope: EvaluationsPage composer + Section/Nav +
Executive Summary + Strengths/Weaknesses + Finance + Utilization + Costs/Downtime
(current only), status-aware badges. Reuse: #792/#794/#795/#796/#798 (safe subset).
Tests: extend #818 flow + component render. Gate: no duplicate calc; no risk-matrix/
forecast; single page.

**E6C — Quality + Driver Influence.** Scope: DataQualitySection (E5 truth, drop
derivation/role gate) + DriverInfluenceSection (server tier). Reuse: #793 visuals.
Tests: quality dimension render, driver tier render (full/pseudonymous/none). Gate:
no client quality/PII authority.

**E6D — Legacy Removal + Responsive/A11y/i18n/Test Hardening.** Scope: remove page
client aggregates + dead code (BreakdownPopup etc.); responsive (#801) + a11y/i18n
(#803); extend e2e/visual/a11y/responsive specs. Do NOT delete shared legacy used by
other consumers (dashboard Business Pulse). Gate: all hard gates (§34) pass.

Each phase independently reviewable; explicit exclusions: E7 actions, E8 predictive,
E9 forecast.

## 34. Hard gates (E6 merge)

DUPLICATE_BUSINESS_CALCULATION_COUNT=0; CLIENT_SIDE_QUALITY_AUTHORITY_COUNT=0;
CLIENT_SIDE_FRESHNESS_AUTHORITY_COUNT=0; CLIENT_SIDE_PII_AUTHORITY_COUNT=0;
RAW_ID_FALLBACK_COUNT=0; LEGACY_ANALYTICS_FALLBACK_COUNT=0;
UNAVAILABLE_RENDERED_AS_ZERO_COUNT=0; PARTIAL_RENDERED_AS_COMPLETE_COUNT=0;
UNKNOWN_RENDERED_AS_COMPLETE_COUNT=0; STALE_HIDDEN_COUNT=0; E7_RUNTIME_SCOPE_COUNT=0;
E8_RUNTIME_SCOPE_COUNT=0; E9_RUNTIME_SCOPE_COUNT=0; SECOND_EVALUATIONS_PAGE_COUNT=0;
NEW_PARALLEL_TRUTH_AUTHORITY_COUNT=0.

## 35. Remaining unknowns

Implementation-critical: NONE (`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`).
Non-critical (do not affect architecture/security/privacy/quality/API/scope):
- Exact production `EVALUATIONS_ANALYTICS_V2_MODE` value (repo = UNSET/off; ops
  confirms at rollout; E6 renders honest disabled state regardless).
- Whether `dashboard-insights`/`misuse-cases` remain as complementary operational
  surfaces vs migrate later (product decision; E6 can keep them as non-authoritative).
- Whether E4 will later add invoice line-item drilldown (would let the page drop
  `invoices.list` entirely; not required for E6).

## 36. Final recommendation

Proceed to E6 implementation as **E6_FRONTEND_ONLY**, STRATEGY_C, evolving the single
`financial-insights` page, consuming E4 `/insights/summary` + E5 `/insights/quality`
(+ E3 finance, E1 registry), reusing the historical design (safe subset), deleting
duplicate/unsafe/future-phase code, behind the existing feature flag with an honest
disabled state. Reserve Risks/Forecasts (E8/E9) and Actions/Recommendations (E7).

Status: E6_READY_FOR_IMPLEMENTATION
