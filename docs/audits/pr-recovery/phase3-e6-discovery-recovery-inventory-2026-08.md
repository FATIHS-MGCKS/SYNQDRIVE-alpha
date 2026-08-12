# Phase 3 — E6 Discovery, Recovery Inventory & Source Authority Reconstruction (2026-08)

Discovery-only. NO implementation, cherry-pick, merge, runtime/test/config/Prisma
change, deploy, or E7–E9 work was performed. Only evidence files under
`docs/audits/pr-recovery/**` were created.

## 1. Executive summary

- E6 is, by historical evidence, the **Evaluations presentation / UI layer**
  ("Auswertungen") rendered over the canonical E1–E5 backend. It PRESENTS canonical
  truth; it must not become a second authority.
- The historical source material is the 54-prompt "Auswertungen" recovery series
  (PRs ~#752–#821). The UI/IA prompts (28–35) are the E6 candidates; the
  recommendation/action prompts (36–37) are E7; the forecast prompt (45) is E8/E9.
- No PR is titled/scoped "E6". All E6-candidate branches are OPEN, unmerged, and
  built on a **pre-E1 base** (V4.9.8xx from 2026-07-24) — they predate the entire
  E1–E5 canonical backend and reference superseded endpoints (e.g. the E2
  entity-reference summary rather than the E4 insights summary). They are valuable
  as **design/UX authority**, not as directly mergeable code.
- Current main already ships one wired Auswertungen screen (`FinancialInsightsView`
  + `InsightsCockpit`) consuming E3 finance insights + legacy dashboard-insights;
  it does **not** consume E2/E4/E5 analytics endpoints. Those endpoints exist and
  are ready to consume (behind `EVALUATIONS_ANALYTICS_V2_MODE` for E2/E4/E5).
- Recommended strategy: **STRATEGY_C** — reimplement E6 on current main using the
  historical design only, consuming E4/E5 (and E1/E3) canonical contracts.

## 2. Current main revision

| Ref | SHA |
|-----|-----|
| CURRENT_MAIN_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| E5_MERGE_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| E5_MERGE_ANCESTOR of main | YES (main == E5 merge commit) |
| COMMITS_AFTER_E5_COUNT | 0 |

## 3. E1–E5 canonical foundation (backend, on main)

Global prefix `/api/v1`; org routes `:orgId` under `OrgScopingGuard + RolesGuard +
PermissionsGuard`; E2/E4/E5 additionally gated by `EvaluationsAnalyticsFeatureGuard`
(`EVALUATIONS_ANALYTICS_V2_MODE` ∈ {shadow,on}; default off → 404).

| Phase | Endpoint(s) | Owner service | Contract |
|-------|-------------|---------------|----------|
| E1 | `GET /evaluations-metrics/registry`, `/metrics/lookup?id=` | `EvaluationsMetricService` | `synq/evaluations-metrics/evaluations-metric*.contract.ts` (status: AVAILABLE\|PARTIAL\|STALE\|UNAVAILABLE\|ERROR\|NOT_APPLICABLE; `dataCoverage`, `sourceFreshness`) |
| E1 | period/timezone (echoed on responses) | `EvaluationsAnalyticsScopeService` | `synq/evaluations-periods/evaluations-period.contract.ts` |
| E2 | `GET …/evaluations/analytics/summary`, `/detail` | `EvaluationsAnalyticsService` | `synq/evaluations-analytics/evaluations-analytics.contract.ts` (entity-reference counts; no business KPIs; no freshness) |
| E3 | `GET …/evaluations/finance/insights` (perm `invoices:read`) | `EvaluationsFinanceService` | `FinancialInsightsResult`; per-metric `EvaluationsMetricResponse`; station-scoped → all UNAVAILABLE |
| E4 | `GET …/evaluations/analytics/insights/{summary,cost-model,utilization,strengths,weaknesses,driver-analysis}` | `EvaluationsInsightsService` | `e4/contracts/evaluations-insights.contract.ts` (section status + coverage; driver section carries `piiTier`) |
| E5 | `GET …/evaluations/analytics/insights/quality` | `EvaluationsQualityService` | `e5/contracts/evaluations-quality.contract.ts` (dimensions FRESHNESS/COMPLETENESS/PROVENANCE/VALIDITY/TEMPORAL_APPLICABILITY; `freshness` UNKNOWN; `businessEventRecency`; `lineage`; `overall.complete`) |
| E5 | PII tier + pseudonymization + person audit | `EvaluationsPrivacyResolver`, `pseudonymizePersonRef`, `EvaluationsAuditService` | internal (no HTTP); applied inside driver-analysis |

Key note: two different "summary" endpoints — `/evaluations/analytics/summary`
(E2 entity refs) vs `/evaluations/analytics/insights/summary` (E4 composite
business analytics). E6 wants the **E4 composite** + **E5 quality**.

## 4. PR inventory

No PR titled/scoped "E6". Highest evaluations recovery PR is #1025 (E5, MERGED).
The E1–E5 recovery PRs (#1018 E1, #1020 E2, #1022 E3, #1024 E4, #1025 E5) are all
MERGED. The historical "Auswertungen" 54-prompt series is the source material:

E6 candidates (UI/IA prompts 28–35), all OPEN + unmerged + pre-E1 base:

| PR | Prompt | Head branch | Head SHA | Classification |
|----|--------|-------------|----------|----------------|
| #792 | 28 Metric State UX | cursor/evaluations-metric-state-ux-8427 | c82e4493 | E6_CANDIDATE (truthful status badges/value) |
| #793 | 29 Data-Quality panel (admin) | cursor/evaluations-data-quality-panel-8427 | ff34b66f | E6_CANDIDATE (UI over E5 quality) |
| #794 | 30 Information Architecture | cursor/evaluations-information-architecture-8427 | 14072b31 | E6_CANDIDATE (CORE 9-section IA; contains E7/E8 sections to strip) |
| #795 | 31 Executive KPI Strip | cursor/evaluations-executive-kpi-strip-8427 | 2759f223 | E6_CANDIDATE |
| #796 | 32 Strengths/Weaknesses Cockpit | cursor/evaluations-sw-cockpit-8427 | cb2ced96 | E6_CANDIDATE |
| #798 | 33 Risk/Cost/Downtime Viz | cursor/evaluations-risk-cost-viz-8427 | 7f6dde4c | E6_CANDIDATE (current-state cost/downtime viz; any forecast/risk-prediction part → E8/E9) |
| #801 | 34 Mobile/Responsive | cursor/evaluations-mobile-readiness-8427 | 64344347 | E6_CANDIDATE (cross-cutting UI) |
| #803 | 35 Accessibility & i18n | cursor/evaluations-a11y-i18n-8427 | ddad5606 | E6_CANDIDATE (cross-cutting UI) |
| #818 | 51 E2E & visual regression | cursor/evaluations-e2e-visual-8427 | (MERGED) | E6_OVERLAP (test infra; evaluations E2E specs already present on main) |

E7/E8/E9 contamination (reserve, do NOT implement in E6):

| PR | Prompt | Branch | Head SHA | Phase |
|----|--------|--------|----------|-------|
| #804 | 36 Recommendation domain model | cursor/evaluations-recommendation-domain-8427 | 9eae4b12 | E7 |
| #806 | 37 Maßnahmen-Center (Action Center) UI | cursor/evaluations-action-center-8427 | 723b5666 | E7 |
| #814 | 45 Forecast UX | cursor/evaluations-forecast-ux-8427 | 46b905ad | E8/E9 |

PRE_E6 (already consumed by E1–E5, MERGED via recovery chain or superseded):
prompts 1–27, 46–48 (registry/period/money/finance/analytics/cost/utilization/
detection/driver/quality/lineage/privacy/permissions/audit). UNRELATED: PRs
#966–#1013 (Master Admin remediation: billing/backup/clickhouse/observability),
#1021/#1023 (public landing/coming-soon pages).

## 5. Branch inventory

All 8 E6-candidate branches + 3 contamination branches exist on `origin`, none are
ancestors of main (NOT_MERGED). They are based on the pre-E1 V4.9.8xx line
(2026-07-24), so they are many commits behind current main and would not merge
cleanly. Retained (not deleted). See CSV for per-branch SHAs.

## 6. Commit inventory

Candidate branch head commits (source-authority anchors): c82e4493 (#792),
ff34b66f (#793), 14072b31 (#794), 2759f223 (#795), cb2ced96 (#796), 7f6dde4c
(#798), 64344347 (#801), ddad5606 (#803). All ORPHANED relative to main (not
reachable from `origin/main`); their design intent is SUPERSEDED at the API layer
by E1–E5 (they call pre-recovery endpoints). Full per-commit enumeration inside
each branch was not exhaustively walked (documented as an UNKNOWN to resolve during
execution if specific file reuse is attempted).

## 7. Documentation inventory

- Boundary authority (repeated across merged recovery docs): "E5 Data Quality,
  **E6 UI**, E7 Recommendations/Actions, E8 Predictive/Forecast, E9 Forecast UI"
  — e.g. `architecture/EVALUATIONS_E4_TENANT_SAFE_ANALYTICS_2026-08-11.md`,
  `phase3-e4-tenant-safe-analytics-backend-implementation-2026-08.md`,
  `phase3-e5-*` reports. This fixes E6 = UI.
- `phase3-e5-source-reconstruction-matrix-2026-08.csv` already tagged
  `cs-evaluations-metric-state-ux` (#792) as "E6 UI scope (deferred)".
- IA spec (historical, in PR #794, not on main):
  `docs/frontend/evaluations-information-architecture.md` — 9-section Auswertungen
  page: (1) Global filters & data status, (2) Executive summary, (3) Strengths &
  weaknesses, (4) Risks & forecasts, (5) Finance & receivables, (6) Fleet
  performance, (7) Costs & downtime, (8) Actions & recommendations, (9) Data
  quality. Sections 4 (forecasts) and 8 (actions/recommendations) are E7/E8/E9.
- E2 report: "No frontend consumer is wired yet (contracts available in `shared/`
  for E6)."

## 8. Existing main frontend (Evaluations)

- Wired screen: rental SPA view `financial-insights` → `FinancialInsightsView.tsx`
  (+ embedded `insights/InsightsCockpit.tsx`); nav under Finance → "Auswertungen"
  (DE) / "Insights" (EN). No dedicated `/evaluations/*` route; SPA state only.
- Consumes: E3 `…/evaluations/finance/insights` (core KPIs), legacy
  `…/dashboard-insights`, `…/misuse-cases`, `…/invoices`, `…/customers`.
- Does NOT consume E2/E4/E5 analytics endpoints. No metric-status badge component,
  no freshness/coverage/provenance/validity UI, no utilization/cost/strength/
  weakness/driver-influence surfaces, no metric-registry UI.
- Substantial supporting infra: `rental/lib/evaluations/*` (contracts, provenance
  builders [PLACEHOLDER, unwired], registry lookup [PLACEHOLDER]), finance adapters
  (status-aware, no false zero), and E2E specs `frontend/e2e/evaluations-*.spec.ts`
  (from #818). Legacy client-side invoice math in `financial-insights.logic.ts`,
  `dashboard/runtime/businessPulseSliceBuilder.ts`, `dashboard/FinanceKpiStrip.tsx`
  (flagged "Limited · non-canonical"). Dead: `BreakdownPopup`,
  `businessPulseBuilder.ts` (@deprecated).
- Status classifications per path: see CSV.

## 9. Existing main backend (E6 consumers)

See §3 and the source-authority matrix CSV. All business concepts E6 needs are
already served canonically by E1 (status/period/money), E3 (finance), E4
(cost/utilization/strengths/weaknesses/driver + composite summary), E5
(quality/freshness/coverage/provenance/validity/lineage + privacy tier). E6 needs
NO new backend authority — only presentation + query wiring (a thin frontend API
client / hooks). The one gap: E6 UI reads require `EVALUATIONS_ANALYTICS_V2_MODE`
to be enabled for E2/E4/E5 routes (operational config, not new code).

## 10. Historical E6 implementations (classification)

At candidate level (file-level reuse deferred to execution):

| Unit | Source | Classification |
|------|--------|----------------|
| 9-section IA / page composer (`EvaluationsPage`) | #794 | REUSABLE_WITH_ADAPTATION (re-point data to E4/E5; strip §4 forecasts, §8 actions) |
| Metric State UX badge/value | #792 | REUSABLE_WITH_ADAPTATION (map to E1 `EvaluationsMetricResponse.status`) |
| Data-quality admin panel | #793 | REUSABLE_WITH_ADAPTATION (bind to E5 `EvaluationsQualityReport`) |
| Executive KPI strip | #795 | REUSABLE_WITH_ADAPTATION (E3 finance + E4 summary) |
| Strengths/Weaknesses cockpit | #796 | REUSABLE_WITH_ADAPTATION (E4 strengths/weaknesses sections) |
| Risk/Cost/Downtime viz | #798 | REUSABLE_WITH_ADAPTATION for cost/downtime (E4 cost-model); CONCEPT_ONLY / BELONGS_TO_E8/E9 for any forecast/risk-prediction |
| Mobile/responsive | #801 | CONCEPT_ONLY (design guidance; reimplement on current components) |
| A11y/i18n | #803 | REUSABLE_WITH_ADAPTATION (i18n keys/patterns) |
| Recommendation domain / action center | #804, #806 | BELONGS_TO_E7 |
| Forecast UX | #814 | BELONGS_TO_E8/E9 |
| Data-fetching / client calculations in all candidates | all | SUPERSEDED_BY_E1..E5 (use canonical endpoints, not client math) |

No unit classified REUSABLE_AS_IS (all on pre-E1 base). No unit proven UNSAFE.

## 11. Actual E6 boundary

**E6 = Option A: Evaluations presentation/UI over E1–E5.** Not additional backend
aggregation (E4 owns it), not recommendations/actions (E7), not prediction (E8),
not forecast UI (E9).

In-scope E6 surfaces (IA #794 minus contamination): global filters & data-status
header; executive summary / KPI strip; strengths & weaknesses cockpit; finance &
receivables; fleet performance (utilization); costs & downtime; data-quality panel;
truthful metric-status/availability rendering; driver-influence presentation that
renders the **server-decided** PII tier only; mobile/responsive; a11y/i18n.

Explicitly reserved: Risks & forecasts (E8/E9), Actions & recommendations (E7).

## 12. E6 source authority matrix

See `phase3-e6-source-authority-matrix-2026-08.csv`. Absolute rule enforced: every
visible concept maps to a canonical E1–E5 owner/contract; E6 presents, never
recomputes.

## 13. Duplicate calculation findings

Historical candidates and current-main legacy code compute values the backend now
owns. Concrete duplicates to REPLACE_WITH_CANONICAL_CONTRACT during execution:

| Duplicate calculation | Location (current main) | Canonical replacement |
|-----------------------|-------------------------|-----------------------|
| Invoice-based revenue/receivable math for detail/chart | `frontend/src/rental/lib/financial-insights.logic.ts` | E3 finance insights / E4 finance section |
| Dashboard finance KPI math | `frontend/src/rental/components/dashboard/FinanceKpiStrip.tsx`, `dashboard/runtime/businessPulseSliceBuilder.ts` | E3/E4 (out of strict E6 scope but overlaps) |
| Client provenance builders (unwired) | `frontend/src/rental/lib/evaluations/evaluations-financial-provenance.ts` | E5 quality report `lineage`/dimensions |
| Client registry/calc-version lookup (unwired) | `frontend/src/rental/lib/evaluations/evaluations-metric-registry.ts` | E1 `/evaluations-metrics/registry` |
| Historical UI client status/quality derivation | #792/#793/#794 branches | E1 status + E5 quality dimensions |

DUPLICATE_CALCULATION_COUNT (distinct patterns) = 5. Do not modify now.

## 14. Privacy findings

- Architecture rule: server decides disclosure tier (E5B `EvaluationsPrivacyResolver`
  → full/pseudonymous/none; HMAC pseudonymization; DRIVER hard-deny); frontend must
  render the returned contract (`piiTier` + already-redacted `driverRef`). Frontend
  must NOT implement client-side permission logic.
- Current main: no driver-influence UI exists → `RAW_PERSON_IDENTIFIER_RENDER_COUNT
  = 0`, `UNPROVEN_PERSON_LEVEL_UI_COUNT = 0`, `CLIENT_SIDE_PII_AUTHORITY_COUNT = 0`
  (confirmed: cockpit shows "Buchung"/"Kunde" chips and customer names via
  `customers.read`, never raw driver ids/pseudonyms).
- Historical candidates were not exhaustively file-reviewed for client-side PII
  authority (they predate E5B); this is recorded as an UNKNOWN to verify before
  reusing any driver-influence UI. E6 execution must consume E5B's server tier.

## 15. Quality presentation findings

- Required: never turn UNKNOWN→green, UNAVAILABLE→0, hide PARTIAL/STALE, or claim
  COMPLETE without authority. E5 quality is multi-dimensional (no single score);
  `overall.complete` is structurally false today (freshness UNKNOWN — no ingestion
  watermark).
- Current main is safe here (status-aware formatters: `n/a`/`Fehler`/`unvollständig`/
  `veraltet`/`—`, no false zero; daily chart labeled "Limited · non-canonical").
- Historical #792 (Metric State UX) intent = truthful availability badges (safe).
  No unsafe historical quality behavior confirmed; historical viz (#798) must be
  checked during execution so risk/forecast framing does not fabricate certainty.

## 16. E7–E9 contamination

- E7 (recommendations/actions): PR #804 (recommendation domain), #806 (action
  center UI); IA section 8 "Actions & recommendations". E7_CONTAMINATION_COUNT = 2.
- E8 (prediction/forecast domain): forecast/predictive content within #814; IA
  section 4 "Risks & forecasts" (predictive part). E8_CONTAMINATION_COUNT = 1.
- E9 (forecast UI): PR #814 "Forecast UX". E9_CONTAMINATION_COUNT = 1.
Reserved; not implemented, not planned into E6.

## 17. Reuse decisions

Adopt the historical **design/UX/IA** (9 sections minus §4/§8) and i18n patterns as
authority; reimplement on current main against E1/E3/E4/E5 contracts; discard all
historical data-fetching/calculation code (superseded). Enable
`EVALUATIONS_ANALYTICS_V2_MODE` for the analytics routes E6 consumes. Do not merge
the historical branches. See CSV `reuse_decision` column.

## 18. Recovery strategy

**STRATEGY_C_REIMPLEMENT_E6_ON_CURRENT_MAIN_USING_HISTORICAL_DESIGN_ONLY.**
Rationale: (a) historical E6 branches are on a pre-E1 base and reference superseded
endpoints — not mergeable and not REUSABLE_AS_IS; (b) the canonical E1–E5 backend
already exists on main and differs from what the historical UI expected; (c) current
main already has a partial Auswertungen page to evolve; (d) reimplementing preserves
the "present, don't recompute" rule and avoids reintroducing duplicate client
calculations/privacy logic. STRATEGY_A/B are rejected (stale base, massive drift);
STRATEGY_D is rejected (valid design authority + canonical backend both exist).

## 19. Risks

- Feature-flag gating: E2/E4/E5 routes 404 unless `EVALUATIONS_ANALYTICS_V2_MODE` is
  enabled — E6 UX and tests must account for this (operational config).
- Duplicate-calculation regression: temptation to keep legacy client invoice math;
  must route through canonical contracts.
- Privacy: driver-influence UI must render server tier only; no client PII logic.
- Quality honesty: must faithfully render UNKNOWN/PARTIAL/UNAVAILABLE (no green-washing).
- Scope creep into E7 (actions) / E8–E9 (forecast) via IA sections 4 & 8.
- Two "summary" endpoints (E2 vs E4) — must bind to E4 insights, not E2 entity refs.

## 20. Unknowns (explicitly documented, not silently zeroed)

- Exhaustive per-file reuse/privacy review of the 8 historical candidate branches
  (only PR-level + IA spec reviewed here). UNKNOWN until execution.
- Whether #798 "risk" viz contains predictive/forecast content (E8/E9) vs current-
  state risk indicators — verify before reuse.
- Exact `EVALUATIONS_ANALYTICS_V2_MODE` rollout intent for production.
- Whether #818's merged E2E/visual specs fully cover the E6 target IA or need
  extension.

## 21. Recommended E6 execution plan (for a later, separate task — not executed)

1. Enable/confirm `EVALUATIONS_ANALYTICS_V2_MODE` for analytics routes (config).
2. Build a canonical frontend API client + typed hooks for E1 registry, E4
   `/insights/summary` (+ granular), and E5 `/insights/quality`, importing shared
   `@synq/evaluations-*` contracts.
3. Implement the IA shell (sections 1,2,3,5,6,7,9) as a page composer, evolving
   `FinancialInsightsView`/`EvaluationsPage`; render truthful status/quality.
4. Add a reusable metric-status badge + quality-dimension rendering bound to E1/E5.
5. Driver-influence presentation renders server `piiTier` + redacted refs only.
6. Remove/replace legacy client calculations with canonical contract reads.
7. Mobile/responsive + a11y/i18n pass.
8. Extend E2E/visual coverage; leave E7 (actions) and E8/E9 (forecast) sections as
   explicit "reserved" placeholders or omit until those phases.

## Counters

See §13/§14/§16 and the final output. RUNTIME_FILE_CHANGE_COUNT = 0,
TEST_FILE_CHANGE_COUNT = 0, MIGRATION_CHANGE_COUNT = 0 (docs-only).

Status: E6_DISCOVERY_COMPLETE
