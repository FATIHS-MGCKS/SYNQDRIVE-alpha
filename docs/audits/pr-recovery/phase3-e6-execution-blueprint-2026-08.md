# Phase 3 — E6.0 Historical Component Salvage & Execution Blueprint (2026-08)

> **CORRECTED BY E6.0.1 (2026-08-12).** Independent review corrected four items;
> where this document and the correction differ, the correction governs. See
> `phase3-e6-0-1-blueprint-correction-2026-08.md`. Summary of overrides:
> (A) #798 monetary reclassification — only OPERATING_EXPENSES (OrgInvoice) is
> canonical money; UNPLANNED_MAINTENANCE + DAMAGE_REPAIR are served UNAVAILABLE and
> ESTIMATED_FIXED_COSTS is UNSUPPORTED → render STATUS ONLY, never amounts; corrected
> #798 split = 18 canonical / 10 status-only / 6 unsafe / 8 E8 / 5 E9 / 14 generic
> (supersedes "E6_SAFE 42"). (B) `estimatedExposure` has no canonical contract →
> REMOVE from E6 (E8). (C) generic Money MUST use the currency-aware
> `finance-insights-adapter` formatter (no implicit EUR); historical
> `evaluations-format.ts` `fmtEurMinor` is COPY_FORMATTING_PATTERN_ONLY, not
> REUSE_AS_IS. (D) E3 Finance is FIXED MTD (not user-selectable) while E4/E5 follow
> the global period selector → the UI must show Finance's MTD scope explicitly and
> never imply the selector changes it. Plus legacy separation: dashboard-insights /
> misuse-cases / raw entities are non-canonical and must not feed canonical E6
> sections or act as fallbacks. New Money/Period/Legacy hard gates apply.

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

**[CORRECTED BY E6.0.1 — this is the authoritative split; the E6.0 "E6_CURRENT_STATE=42"
row is superseded and retained below only for traceability.]**

| Class (corrected) | Count | Examples |
|-------------------|------:|----------|
| E6_CANONICAL_RENDERABLE | 18 | OPERATING_EXPENSES `totalsByCurrency`/`eventCount`, section `reportingCurrency`/`mixedCurrency`/status/coverage, downtime `maintenanceMs`/`netCapacityMs`/`capacityMs` + maintenance/blocked/cleaning vehicle counts, currency, period |
| E6_STATUS_ONLY | 10 | maintenance cost, damage cost, fixed cost amounts + waterfall steps + those category totals → render E4 UNAVAILABLE+reason, NO amount |
| UNSAFE_LEGACY_CALCULATION | 6 | client cost series/pareto/aging summing non-canonical categories; `derivedDowntimePct` fallback |
| E8_PREDICTIVE | 8 | probability, impact, RiskMatrixPoint.confidence, exposureMinor/**estimatedExposure** (P×I allocation), col/axis probability, cellTone score, scaleToFive outputs |
| E9_FORECAST | 5 | quantitativeDeviation.kind==='FORECAST', forecasts list UI, isForecast (chart card + SW card passthrough), forecast i18n |
| GENERIC_VISUAL_PATTERN_ONLY | 14 | chart shells, tables, empty states, formatters, skeletons |

Superseded E6.0 row (traceability only — DO NOT use): `E6_CURRENT_STATE = 42` wrongly
included fixed/damage/maintenance cost amounts + `estimatedExposure` as canonical.

`PREDICTIVE_SYMBOL_COUNT = 8`, `FORECAST_SYMBOL_COUNT = 5`. **[CORRECTED BY E6.0.1]**
the former `E6_SAFE_SYMBOL_COUNT = 42` is superseded: only OPERATING_EXPENSES money +
downtime durations/counts + section currency/status/coverage are canonical → 18
E6_CANONICAL_RENDERABLE; maintenance/damage/fixed cost amounts → 10 E6_STATUS_ONLY
(render E4 UNAVAILABLE, no amount); client cost series/pareto/aging mixing unsupported
categories → 6 UNSAFE_LEGACY_CALCULATION; `estimatedExposure` moves to E8. See §10b.
E6 keeps only OPERATING_EXPENSES cost money + observed downtime from E4.
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
strings). Date/number formatting via existing locale utilities; **Money formatting
uses the canonical currency-aware `finance-insights-adapter` (explicit
`Money.currency`, no EUR default) — NOT `evaluations-format.ts` `fmtEurMinor`** [E6.0.1].
E6 a11y acceptance criteria: single h1 + ordered headings
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
`invoices/customers` only for non-analytics line-item activity until E4 drilldowns
exist. **[E6.0.1]** `dashboard-insights` and `misuse-cases` are moved OUTSIDE the
canonical E6 composition (KEEP_OUTSIDE_CANONICAL_E6 / KEEP_IN_PRODUCT_OUTSIDE_E6_
CANONICAL_COMPOSITION) — never mixed into canonical sections, never a canonical
fallback; endpoints and other consumers are untouched.

## 15. Legacy data sources

| Endpoint | Page consumer | Purpose | Canonical replacement | E6 keep? | Other consumers |
|----------|---------------|---------|-----------------------|----------|-----------------|
| evaluations/finance/insights (E3) | FinancialInsightsView | core KPIs | self | KEEP | only this page |
| invoices | FinancialInsightsView | detail/chart/rankings/legacy math | E4 sections | REDUCE to line-items | dashboard, tasks, topbar (KEEP endpoint) |
| customers | FinancialInsightsView | id→name | E4/E5 server refs | REMOVE from page math | many (KEEP endpoint) |
| dashboard-insights | InsightsCockpit | risks/leakage/reco | none canonical (not an E1–E5 analytics contract) | KEEP_OUTSIDE_CANONICAL_E6 [E6.0.1] | app-wide (KEEP endpoint) |
| misuse-cases | InsightsCockpit | abuse cards | none (separate domain) | KEEP_IN_PRODUCT_OUTSIDE_E6_CANONICAL_COMPOSITION [E6.0.1] | MisuseCasesPanel, handover |
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

`BACKEND_DECISION = E6_FRONTEND_ONLY` (re-confirmed by E6.0.1 from actual contracts).
Every E6 section maps to an existing endpoint. `TRUE_CANONICAL_API_GAP_COUNT = 0`.
**[E6.0.1]** `INTENTIONALLY_UNSUPPORTED_CONCEPT_COUNT = 3` — maintenance/damage/fixed
cost money are deliberately served UNAVAILABLE/UNSUPPORTED by E4; E6 renders that
truth and MUST NOT build an adapter to manufacture them. `estimatedExposure` is
out-of-scope predictive (E8), not an API gap. Data-availability limitation (not a
gap): downtime `blockedMs` is `null` on main → render UNAVAILABLE. No adapter
required; E4 composite `/insights/summary` aggregates server-side.

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
locale; missing currency never defaults to EUR (render UNAVAILABLE). No float
recomputation; `amountMinor` integer minor units; format only (minor→major for
display via the currency's real minor-unit exponent). Mixed currency never silently
summed (E4 cost-model exposes `mixedCurrency` + `totalsByCurrency[]`; render
per-currency). **[CORRECTED BY E6.0.1]** the generic Money renderer MUST be the
currency-aware `finance-insights-adapter` (`minorToMajorForPresentation` +
`formatFinanceMoney`, backed by `Money.currency`); the historical
`evaluations-format.ts` `fmtEurMinor` HARDCODES EUR and is
COPY_FORMATTING_PATTERN_ONLY (usable only for known-EUR/percent contexts), NOT the
generic Money renderer. Only OPERATING_EXPENSES is authoritative cost money; other
cost categories are rendered as status, never amounts. Money hard gates:
IMPLICIT_CURRENCY_FORMATTING_COUNT=0, HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT=0,
CLIENT_SIDE_CURRENCY_INFERENCE_COUNT=0, MIXED_CURRENCY_CLIENT_SUM_COUNT=0,
UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT=0.

## 25. Period / timezone contract

E6 period selector maps to `periodType` (single canonical enum) and governs **E4
analytics + E5 quality ONLY**; the response echoes `EvaluationsPeriodWindow` with
`[start, endExclusive)` and `timezone` context — E6 displays using that, never
introduces a second date-range interpretation. **[CORRECTED BY E6.0.1]** E3 Finance is
FIXED `MTD` (server-set; the endpoint accepts no `periodType`) and is NOT
user-selectable. The Finance & Receivables section MUST carry a persistent explicit
"Monat bis heute (MTD)" scope and MUST NOT appear to change with the global selector;
E6 MUST NOT recompute E3 finance client-side and MUST NOT hide the difference. Period
hard gates: PERIOD_SCOPE_MISREPRESENTATION_COUNT=0, FINANCE_PERIOD_RECALCULATION_COUNT=0,
GLOBAL_FILTER_FALSE_SCOPE_COUNT=0.

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
5. Finance & Receivables — E3 (persistent MTD scope badge; not affected by global selector) [E6.0.1]
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
| finance-insights-adapter (currency-aware Money formatter) | REUSE_EXISTING | current | [E6.0.1] canonical Money boundary; generic `formatMoney({amountMinor,currency,locale})` |
| evaluations-format (`fmtEurMinor`) | COPY_FORMATTING_PATTERN_ONLY | #794 | [E6.0.1] EUR-hardcoded; percent/known-EUR only, NOT generic Money |

Avoid unnecessary abstraction; prefer existing repo conventions.

## 30. Frontend data layer

Convention (confirmed): custom hooks + `fetch` wrapper in `frontend/src/lib/api.ts`,
`useState`/`useEffect` (NO React Query). Follow it.

| Hook / client | Endpoint | Query key deps | Flag behavior | Error | Status |
|---------------|----------|----------------|---------------|-------|--------|
| api.evaluations.analyticsInsightsSummary | E4 /insights/summary | orgId, periodType, stationIds | 404→disabled state | section UNAVAILABLE | preserve per-section status |
| api.evaluations.analyticsQuality | E5 /insights/quality | orgId, periodType, stationIds | 404→disabled | UNAVAILABLE | preserve dimension states |
| api.evaluations.driverAnalysis | E4 driver-analysis | orgId, periodType, stationIds | 404→disabled | UNAVAILABLE | preserve piiTier |
| api.evaluations.financeInsights (exists) | E3 finance | orgId, stationIds (NO periodType) | always-on | UNAVAILABLE labels | preserve; **FIXED MTD — global period selector MUST NOT be applied** [E6.0.1] |
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
on this page). **[E6.0.1] Transport ≠ authority:** when the finance slice is read from
the E4 `/insights/summary` response, the transport is the E4 composite but the truth
authority remains E3 and the period authority remains E3 **MTD** — the selected E4
period MUST NOT be applied to or displayed over that finance slice; the Finance
section keeps its explicit MTD scope. `EXPECTED_INITIAL_REQUEST_COUNT = 3` (summary, quality, registry).
`DUPLICATE_REQUEST_RISK_COUNT = 1` (E3 finance also standalone — mitigate by reading
composite). `N_PLUS_ONE_RISK_COUNT = 0` (factors/sections are in-payload). Frontend
orchestration only; no new aggregation backend.

## 33. Implementation phase plan

**E6A — Canonical Frontend Data Layer.** Scope: `api.ts` client fns + typed hooks +
local E4/E5 types; feature-flag-aware fetch; status preservation; no business calc.
**[E6.0.1] Money formatter = canonical currency-aware `finance-insights-adapter`
(explicit `Money.currency`, no EUR default); period semantics = global selector drives
E4/E5 only, E3 finance is fixed MTD (no `periodType`).** Files: `frontend/src/lib/api.ts`,
`frontend/src/rental/hooks/useEvaluations*`, `frontend/src/rental/lib/evaluations/*`
types. Reuse: #792 hooks (repointed), `finance-insights-adapter`. Tests: hook unit +
validators. Gate: no client business math; flag off → disabled state; no implicit-EUR
formatting; no finance period recalculation.

**E6B — IA + Core Surfaces.** Scope: EvaluationsPage composer + Section/Nav +
Executive Summary + Strengths/Weaknesses + Finance (**persistent MTD scope badge**) +
Utilization + Costs/Downtime (**OPERATING_EXPENSES money only; maintenance/damage/
fixed → UNAVAILABLE+reason; no estimatedExposure**), status-aware badges. Reuse:
#792/#794/#795/#796/#798 (safe subset). Tests: extend #818 flow + component render.
Gate: no duplicate calc; no risk-matrix/forecast; no unsupported cost money rendered
as amount; Finance period not misrepresented; single page.

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

**[ADDED BY E6.0.1]** Money: IMPLICIT_CURRENCY_FORMATTING_COUNT=0,
HARDCODED_EUR_FOR_GENERIC_MONEY_COUNT=0, CLIENT_SIDE_CURRENCY_INFERENCE_COUNT=0,
MIXED_CURRENCY_CLIENT_SUM_COUNT=0, UNAUTHORIZED_MONEY_RECONSTRUCTION_COUNT=0. Period:
PERIOD_SCOPE_MISREPRESENTATION_COUNT=0, FINANCE_PERIOD_RECALCULATION_COUNT=0,
GLOBAL_FILTER_FALSE_SCOPE_COUNT=0. Legacy:
LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT=0, RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT=0,
SECOND_ANALYTICS_TRUTH_COUNT=0, LEGACY_QUALITY_INFERENCE_COUNT=0. Privacy:
CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT=0.

## 35. Remaining unknowns

Implementation-critical: NONE (`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`).
Non-critical (do not affect architecture/security/privacy/quality/API/scope):
- Exact production `EVALUATIONS_ANALYTICS_V2_MODE` value (repo = UNSET/off; ops
  confirms at rollout; E6 renders honest disabled state regardless).
- Whether `dashboard-insights`/`misuse-cases` remain as complementary operational
  surfaces vs migrate later (product decision). Either way they stay OUTSIDE the
  canonical E6 composition [E6.0.1] — never mixed into canonical sections.
- Whether E4 will later add invoice line-item drilldown (would let the page drop
  `invoices.list` entirely; not required for E6).

## 36. Final recommendation

Proceed to E6 implementation as **E6_FRONTEND_ONLY**, STRATEGY_C, evolving the single
`financial-insights` page, consuming E4 `/insights/summary` + E5 `/insights/quality`
(+ E3 finance, E1 registry), reusing the historical design (safe subset), deleting
duplicate/unsafe/future-phase code, behind the existing feature flag with an honest
disabled state. Reserve Risks/Forecasts (E8/E9) and Actions/Recommendations (E7).

Status: E6_READY_FOR_IMPLEMENTATION
