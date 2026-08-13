# Phase 3 — E6C Driver Influence + Data Quality Surfaces — Implementation Report (2026-08)

Frontend-only. Adds the two remaining canonical Evaluations surfaces on the existing
page: the lazy **Driver Influence** UI and the detailed **Data Quality** panel. No
backend/Prisma/migration/config/deploy change. E7/E8/E9 and a full E6D page-wide
redesign remain out of scope.

## 1. Revision identity
- Base branch: `integration/evaluations-e6-canonical-frontend-2026-08` (PR #1026, Draft).
- `PRE_E6C_SHA = 4393b9c19c6d01a686385dfac138a60578457b2d`.
- Figma: `FIGMA_REFERENCE_STATUS = UNAVAILABLE_IN_ENVIRONMENT` — no Figma MCP in the
  sandbox; extended the existing E6B rounded-card / `sq-tone-*` / responsive / dark-light
  visual system rather than inventing a redesign.

## 2. Authority inventory (read)
Rules (`AGENTS.md`, `.cursor/rules/*`, skills) and E6/E5 evidence
(`phase3-e6a/e6b*`, `phase3-e5*`). Runtime contracts:
`evaluations-canonical.types.ts` (E4 `EvaluationsDriverInfluenceSection`/`E4DriverFactor`,
E5 `EvaluationsQualityReport`/`E5SectionQuality`/`E5QualityDimension`/`E5DimensionState`),
`evaluations-analytics-client.ts` (`mapEvaluationsResult`, `fetchEvaluationsQuality`,
`fetchEvaluationsDriverInfluence`), `useEvaluationsCanonicalAnalytics.ts`
(`useEvaluationsQuality`, `useEvaluationsDriverInfluence`). Backend E4/E5 contracts read
read-only as authority; no backend file edited.

## 3. Historical salvage
`HISTORICAL_SALVAGE_CLASSIFICATION = GENERIC_PRESENTATION_CONCEPTS_ONLY`
(`HISTORICAL_BRANCH_BLIND_CHERRYPICK_COUNT = 0`). Only generic ideas (accessible
disclosure, cards, badges, responsive grids) were reused. No old quality contracts,
source-derived error rates, global scores, client role gating, remediation, or legacy
dashboard-insights/misuse were reused.

## 4. Page composition & request budget
Extended `EvaluationsPage.tsx` (no second page/route). Appended `DriverInfluenceSection`
and `DataQualityPanel` after the E6B sections. Scope: `organizationId` from
`useRentalOrg()`, `periodType` from the canonical period control, `stationIds` from the
persisted station scope — the same request object as E4 analytics.

- `INITIAL_E4_SUMMARY_REQUEST_COUNT = 1`
- `INITIAL_E3_FINANCE_REQUEST_COUNT = 1`
- `INITIAL_E5_QUALITY_REQUEST_COUNT = 1` (loaded with the page)
- `INITIAL_DRIVER_ANALYSIS_REQUEST_COUNT = 0`
- `POST_REVEAL_DRIVER_ANALYSIS_REQUEST_COUNT = 1`
- `DUPLICATE_CANONICAL_REQUEST_COUNT = 0`, `N_PLUS_ONE_REQUEST_COUNT = 0`
- `SUMMARY_EMBEDDED_DRIVER_RENDER_COUNT = 0` (the summary's `driverInfluence` slice is
  never rendered; a separate direct driver-analysis request is used).

Lazy driver behavior: the driver hook lives in a child (`DriverInfluenceLoader`) that is
mounted only after the user clicks reveal; once revealed the child stays mounted and only
its visibility is toggled (`hidden`), so collapse/reopen never refetches. The canonical
hook was not modified (lazy child mounting is sufficient).

## 5. Data Quality panel semantics
`DataQualityPanel.tsx` renders `EvaluationsQualityReport` verbatim through the shared
`EvaluationsSectionShell` (transport states) and `MetricStatusBadge` (section E1 status).
Shows `overall.status/complete/reason`, `calculationVersion`, one card per server
section, and all five E5 dimensions with a SEPARATE dimension-state vocabulary
(COMPLETE/PARTIAL/UNKNOWN/UNAVAILABLE) — never mapped onto E1 metric status.
- Pipeline freshness (`section.freshness.state`) and business-event recency
  (`section.businessEventRecency`) are rendered as separate, explicitly-labelled blocks;
  business timestamps are never used as ingestion freshness.
- Coverage: see E6C.1 — the initial E6C render omitted `excludedRecords` and
  `missingSources`; E6C.1 renders all five canonical coverage fields via the shared
  presenter (null → unavailable, never zero).
- Lineage preserves server order; `sourceRef` is shown verbatim as an opaque `<code>`
  reference inside a `<details>`; no entity join, no record-id reconstruction.
- Station-scoped nulls (freshness/recency/lineage/coverage) render neutrally as
  "not available for this scope".
Counters: `CLIENT_SIDE_QUALITY_SCORE_COUNT = 0`, `CLIENT_SIDE_QUALITY_DERIVATION_COUNT = 0`,
`QUALITY_DIMENSION_COLLAPSE_COUNT = 0`, `QUALITY_STATUS_UPGRADE_COUNT = 0`,
`PIPELINE_FRESHNESS_BUSINESS_RECENCY_CONFLATION_COUNT = 0`,
`RAW_LINEAGE_ID_RECONSTRUCTION_COUNT = 0`.

## 6. Driver Influence UI
`DriverInfluenceSection.tsx`: before reveal, an accessible neutral intro + a real
keyboard-operable button (`aria-expanded`, `aria-controls`, min 40×40px) and NO request.
After reveal, renders the direct `EvaluationsDriverInfluenceSection`: canonical status,
`piiTier` verbatim (full/pseudonymous/none), server `disclaimer` and `confounders`
verbatim, `factors` in server order (`driverRef`, `associatedDimension`, `relationship`,
`associationShare` via Intl percent display-only, `sampleSize`), plus reason. **[Corrected
in E6C.1: the initial E6C did NOT render `data.coverage`; E6C.1 renders it via the shared
coverage presenter, independent of the factor list/reason.]**
- `piiTier = none` exposes no factor references (qualified restricted copy).
- Empty factors → qualified neutral copy ("no reportable factors…"), never "no driver
  influence/blame".
- Association-only wording; fail-closed reasons (e.g. PERSON_LEVEL_ACCESS_DENIED) remain
  visible. Transport 403→UNAUTHORIZED, 404→NOT_FOUND (never FEATURE_DISABLED), else ERROR.
Counters: `CLIENT_SIDE_PII_AUTHORITY_COUNT = 0`, `CLIENT_SIDE_IDENTITY_RECONSTRUCTION_COUNT = 0`,
`CLIENT_SIDE_PERSON_ENTITY_JOIN_COUNT = 0`, `DRIVER_CAUSAL_CLAIM_COUNT = 0`,
`DRIVER_FACTOR_REORDER_COUNT = 0`, `UNAUTHORIZED_DRIVER_REFERENCE_RENDER_COUNT = 0`,
`GENERIC_404_FEATURE_DISABLED_CLAIM_COUNT = 0`.

## 7. i18n / visual / accessibility
Typed `evaluations.*` keys added to `en.ts` + `de.ts` for both surfaces (UI-owned labels
only; server disclaimer/reason/source categories/driverRef/confounders are contract data
and rendered verbatim). Existing E6B design language reused (CSS variables, `sq-tone-*`,
tabular-nums, single-column mobile, no `transition: all`). Accessibility: semantic
headings, labelled disclosure control with aria state, status-as-text (not color-only),
keyboard access. Full page-wide E6D a11y/visual migration remains out of scope.

## 8. Transport states
Both surfaces reuse the E6A `mapEvaluationsResult` transport: AVAILABLE / UNAUTHORIZED
(403) / NOT_FOUND (404) / ERROR (5xx + network); a generic 404 is never rendered as
FEATURE_DISABLED.

## 9. Files changed
Added: `frontend/src/rental/components/evaluations/{DataQualityPanel,DriverInfluenceSection}.tsx`
+ their `*.render.test.tsx`. Changed: `evaluations-presentation.ts` (display-only
dimension/freshness/pii mappings), `EvaluationsPage.tsx` (compose + one quality request +
lazy driver), `i18n/translations/{en,de}.ts`, `e2e/evaluations-fixtures.ts` (rich quality
report + driver-analysis mock + lazy-request counter) and `e2e/evaluations-flow.spec.ts`
(quality visible + lazy-driver assertions), `master/components/{ChangesView,ArchitekturView}.tsx`.
`api.ts`, canonical wire contracts, and canonical hooks were NOT modified.

## 10. Scope guarantees
`SECOND_EVALUATIONS_PAGE_COUNT = 0`, `LEGACY_NONCANONICAL_ANALYTICS_IN_E6_COUNT = 0`,
`RAW_ENTITY_RECOMPUTATION_FALLBACK_COUNT = 0`, `NEW_DUPLICATE_BUSINESS_CALCULATION_COUNT = 0`,
`E7_RUNTIME_SCOPE_COUNT = 0`, `E8_RUNTIME_SCOPE_COUNT = 0`, `E9_RUNTIME_SCOPE_COUNT = 0`,
`E6D_PAGE_WIDE_REDESIGN_COUNT = 0`, `BACKEND_RUNTIME_CHANGE_COUNT = 0`,
`PRISMA_CHANGE_COUNT = 0`, `MIGRATION_CHANGE_COUNT = 0`, `PRODUCTION_CONFIG_CHANGE_COUNT = 0`,
`PRODUCTION_DEPLOYMENT_COUNT = 0`, `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0`. No
recommendations/actions/estimatedExposure/forecast/prediction introduced.

## 11. Explicit exclusions
E7 (recommendations/actions), E8 (predictive risk / estimatedExposure), E9 (forecast),
and full E6D visual/a11y migration are explicitly not implemented.

## E6C.1 — Canonical Evidence Completeness Closure

Independent review found three evidence-completeness blockers; all fixed (presentation/
tests/i18n only — no backend, no canonical contract, no business/privacy authority):

- A shared display-only presenter `EvaluationsCoverageDetails.tsx` renders EVERY
  canonical `EvaluationsDataCoverage` field (`expectedRecords`, `availableRecords`,
  `excludedRecords`, `ratio`, `missingSources`); null → unavailable (never zero); ratio
  is Intl-percent display-only; `missingSources` order preserved; no replacement ratio.
  Reused by both surfaces (`COVERAGE_COMPONENT_DUPLICATION_COUNT = 0`).
- Data Quality: coverage now renders all canonical fields (previously omitted
  `excludedRecords`/`missingSources`); `requiredSourceClasses` stays a DISTINCT block
  from `coverage.missingSources`; lineage now renders every `E5LineageRef` field
  including `calculationVersion`. (`QUALITY_COVERAGE_FIELD_OMISSION_COUNT = 0`,
  `LINEAGE_FIELD_OMISSION_COUNT = 0`,
  `QUALITY_REQUIRED_SOURCE_MISSING_SOURCE_COLLAPSE_COUNT = 0`.)
- Driver Influence now renders `data.coverage` via the same presenter, independent of
  the factor list/reason (`DRIVER_COVERAGE_FIELD_OMISSION_COUNT = 0`). All prior E6C
  guarantees preserved: lazy request (0 before reveal, 1 after, no refetch on
  collapse/reopen), server factor order, server-authoritative `piiTier`, no identity
  join, none-tier hides references, association-only wording, generic 404 → NOT_FOUND.
- Fixtures corrected: unit coverage fixtures declare `satisfies EvaluationsDataCoverage`
  (no `as unknown` hiding an incomplete object); E5 freshness fixtures match current
  E5.1A authority (pipeline freshness UNKNOWN with `newestSourceAt`/`oldestSourceAt`/
  `lastSuccessfulImportAt = null`, `evaluatedAt` = fixed test time), business recency
  kept separate; canonical source categories (`FINANCE_INVOICE`/`FINANCE_PAYMENT`) and a
  current-authority lineage reason (`SOURCE_CLASS_BUSINESS_EVENT_RECENCY`). Driver E2E
  scenario matrix complete: full / pseudonymous / none (PERSON_LEVEL_ACCESS_DENIED) /
  fail-closed (PSEUDONYMIZATION_UNAVAILABLE) / generic-404, with non-null canonical
  coverage on the available scenarios (`MISSING_DRIVER_E2E_SCENARIO_COUNT = 0`).
- `DOCUMENTED_RUNTIME_MISMATCH_COUNT = 0` (the two inaccurate E6C claims above are marked
  corrected). No E7/E8/E9, no `api.ts`/canonical hook/`EvaluationsPage` composition change.

## E6C.1.1 — Canonical Fixture Authority Closure

**[PARTIALLY SUPERSEDED BY E6C.1.2 — see the E6C.1.2 section below. E6C.1.1 fixed several
fixtures but left driver `calculationVersion` (`evaluations-driver-e5b-v1`),
sampleSize/associationShare mismatches (42/18 vs 0.6/0.4), a one-factor/availableRecords-2
mismatch, a non-canonical none+factors "none" unit test, quality `AVAILABLE`/`null`-reason
utilization status, and non-canonical lineage sourceRef/calculationVersion. Those are
corrected in E6C.1.2.]**

Fixtures/tests/docs only — no production runtime, backend, API, hook, canonical
contract, config, or deployment change (the E6C.1 runtime presentation was already
correct and is untouched).

- Driver fixtures now mirror executable backend derivation
  (`evaluations-insights.service.ts` + `evaluations-driver.domain.ts`):
  `availableRecords === factors.length`, `excludedRecords === unattributedCount`,
  `expectedRecords = null`, `ratio = null`, `missingSources === dimensionsSkippedInsufficient`.
  The AVAILABLE two-factor case uses `availableRecords: 2`, `missingSources: []`; the
  analyzed dimension is `BOOKING_CANCELLATIONS`. A separate `DRIVER_EVIDENCE_INSUFFICIENT`
  fixture (factors `[]`, `missingSources: ['BOOKING_CANCELLATIONS']`) exercises non-empty
  missing sources.
- Impossible tier/reason pairs removed: `PSEUDONYMIZATION_UNAVAILABLE` now uses
  `piiTier: 'pseudonymous'` (it can only occur after person-level access was granted);
  `PERSON_LEVEL_ACCESS_DENIED` remains `piiTier: 'none'`. Fixtures are fully typed
  (`satisfies EvaluationsDataCoverage` / real `EvaluationsPeriodWindow`); the driver
  response `as unknown` cast was removed.
- Quality non-null coverage moved to the utilization section (finance coverage is
  ALWAYS null per the E5 service). Utilization uses `requiredSourceClasses:
  [BOOKINGS, MAINTENANCE]`, `PROVENANCE: COMPLETE` with both lineages present,
  `VALIDITY: UNKNOWN`, UNKNOWN pipeline freshness; the null-coverage section is a
  backend-reachable UNAVAILABLE finance section (reason `SECTION_UNAVAILABLE`) under the
  same org scope (no section is described as station-scoped while the report scope is
  org-wide). `requiredSourceClasses` and `coverage.missingSources` stay distinct concepts.
- Evidence honesty: `evaluations-flow.spec.ts` is NOT run by any CI workflow (CI runs
  only vehicle-detail and legal-documents Playwright); the prior "validated in CI" claim
  is corrected to authored-but-not-executed. `DOCUMENTED_RUNTIME_MISMATCH_COUNT = 0`.
- No E7/E8/E9; no `api.ts`/canonical hook/`EvaluationsPage` composition change.

## E6C.1.2 — Final Fixture Authority Closure

Fixtures/tests/docs only — the E6C production runtime remained untouched (verified: zero
diff in `EvaluationsCoverageDetails.tsx`, `DataQualityPanel.tsx`, `DriverInfluenceSection.tsx`,
hooks, `lib/evaluations`, `api.ts`, backend, shared, prisma, .github).

- Driver `calculationVersion` now matches E4 authority: `driver-influence-e4-v1`.
- Factor `sampleSize`/`associationShare` are mathematically consistent (6/10 = 0.6,
  4/10 = 0.4); the render assertion is `n=6`.
- Every AVAILABLE driver coverage `availableRecords` equals `factors.length` (the unit
  helper derives coverage from the factor count; the pseudonymous single-factor case is
  `availableRecords: 1`).
- Backend-reachable canonical scenarios: `none` = UNAVAILABLE / PERSON_LEVEL_ACCESS_DENIED
  / `coverage: null` / `factors: []` (renders the empty state, not none-restricted);
  `PSEUDONYMIZATION_UNAVAILABLE` = `piiTier: pseudonymous` / UNAVAILABLE / null coverage /
  no factors; insufficient evidence = UNAVAILABLE / DRIVER_EVIDENCE_INSUFFICIENT /
  `availableRecords: 0` / `missingSources: ['BOOKING_CANCELLATIONS']`; AVAILABLE-empty =
  AVAILABLE / reason null / `factors: []` / non-null coverage with `availableRecords: 0`.
  The none-restricted branch (not backend-reachable) is covered by an explicitly-labelled
  ADVERSARIAL malformed-payload test (unit) and E2E scenario (`noneAdversarial`), not
  counted as canonical.
- Driver disclaimer uses the exact backend authority text.
- Quality utilization mirrors PARTIAL with reason `SECTION_PARTIAL`; lineage
  `calculationVersion = evaluations-quality-e5-v2` and `sourceRef = org:<orgId>:<model>`
  (`org:org-a:Booking` / `org:org-a:ServiceCase` in unit; `org:org-evaluations-e2e:…` in
  E2E). Finance quality stays UNAVAILABLE with null coverage under one org scope.
- E2E assertions use the configured German locale (`Keine fehlenden Quellen gemeldet`,
  `Für diesen Bereich nicht verfügbar`) and add the none-restricted, lineage
  (version + sourceRef), and finance null-coverage assertions, scoped per section test id.
- Fully-typed fixtures (`satisfies` / real `EvaluationsPeriodWindow`; typed
  `EvaluationsDriverInfluenceSection` + `E4DriverFactor[]` / `EvaluationsQualityReport`);
  no `as unknown`/`as any` added.
- `evaluations-flow.spec.ts` is still NOT run by any CI workflow (CI Playwright =
  vehicle-detail + legal-documents only); local execution fails at browser launch
  (`chromium_headless_shell` missing) → `EVALUATIONS_E2E_STATUS =
  ENVIRONMENT_SPECIFIC_NOT_EXECUTED`. The spec now parses and collects cleanly (a
  duplicate `const finance` was fixed).
- No backend/API/hook/contract/config/deployment change; no E7/E8/E9.
  `DOCUMENTED_AUTHORITY_MISMATCH_COUNT = 0`.
