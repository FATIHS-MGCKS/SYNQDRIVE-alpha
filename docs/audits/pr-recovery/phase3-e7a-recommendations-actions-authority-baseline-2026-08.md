# Phase 3 — E7A Recommendations & Actions Authority Baseline (2026-08)

Authority freeze for Evaluations Recovery **E7 — Recommendations / Actions**.
**Docs-only:** no backend/frontend runtime, Prisma, migration, or production changes.

---

## 0. Machine status (E7A acceptance)

```
CI_E7A_RECOMMENDATIONS_ACTIONS_AUTHORITY_BASELINE_COMPLETED

E7_PHASE = E7A_COMPLETE
E7_RECOMMENDATION_AUTHORITY = FROZEN
E7_ACTION_BOUNDARY = FROZEN
E8_PREDICTIVE_RISK = EXCLUDED
E9_FORECAST = EXCLUDED
R3B_FINAL_STATUS = COMPLETE
E7B_READINESS = READY_FOR_CANONICAL_IMPLEMENTATION
PR_STATE = DRAFT
PRODUCTION_MUTATIONS = 0
PRISMA_CHANGES = 0
MIGRATION_CHANGES = 0
```

---

## 1. Entry coordinates

| Field | Value |
|-------|-------|
| `E7_ENTRY_MAIN_SHA` | `06bae11f37a1843836dedf6a4cfcab0eb2fe37a5` |
| `E7_ENTRY_MAIN_MOVED` | `false` (main HEAD equals expected R3B merge commit) |
| `R3B_MERGE_REACHABLE_FROM_MAIN` | `true` (`git merge-base --is-ancestor 06bae11f origin/main`) |
| `PR1054_REACHABLE_FROM_MAIN` | `true` (same squash merge commit) |
| `R3B_FINAL_STATUS` | `COMPLETE` |
| Branch | `integration/evaluations-e7-recommendations-actions-2026-08` |
| `BRANCH_BASE` | `origin/main` @ `06bae11f…` |
| `WORKTREE_CLEAN` | `true` at branch creation |
| Draft PR title | Evaluations Recovery E7 – Recommendations & Actions |
| `E7_PR_NUMBER` | *(recorded after push — see §23)* |
| `E7_PR_URL` | *(recorded after push — see §23)* |
| `E7_PR_IS_DRAFT` | `true` |

Prior phases E1–E6 are merged into current `main`. The canonical Evaluations UI is
`EvaluationsPage` on route `financial-insights` (E6).

---

## 2. E7_CANONICAL_INPUT_MATRIX

Every E7 recommendation input MUST trace to one of these contracts.  
`SAFE_FOR_RECOMMENDATION_DERIVATION` = safe to **derive** a recommendation **on the server**
when status/quality gates pass — not safe to re-derive on the client.

| SOURCE_CONTRACT | ENDPOINT_OR_SERVICE | PERIOD_AUTHORITY | TENANT_SCOPE | STATION_SCOPE | STATUS_AUTHORITY | QUALITY_AUTHORITY | PII_AUTHORITY | SAFE_FOR_RECOMMENDATION_DERIVATION | LIMITATION |
|-----------------|---------------------|------------------|--------------|---------------|------------------|-------------------|---------------|-------------------------------------|------------|
| E1 metric status semantics | `shared/evaluations-metrics/evaluations-metric-response.contract.ts` | N/A (transport) | N/A | N/A | E1 enum: AVAILABLE, PARTIAL, STALE, UNAVAILABLE, ERROR, NOT_APPLICABLE | N/A | N/A | true (gate only) | Never upgrade status; null ≠ zero |
| E1 period window | `resolveEvaluationsPeriod` / `EvaluationsPeriodWindow` | E1 IANA timezone + `[start,endExclusive)` | org from route | stationIds request narrowed by E2 | N/A | N/A | N/A | true (scope key) | Finance ignores analytics period (E3) |
| E1 money | `EvaluationsMoney { amountMinor, currency }` | N/A | org | station fail-closed for finance | per-metric status | E5 section mirror | N/A | true (observed amounts only) | No mixed-currency sum; no locale currency |
| E2 org/station scope | `EvaluationsAnalyticsScopeService.resolveAuthorizedScope` | via E1 | `:orgId` + membership | station intersection only; fail-closed 403 | N/A | E5 scope block | N/A | true (mandatory gate) | Never org-fallback on station scope |
| E2 RBAC | `evaluations:read` + platform guards | N/A | org | station | 403 → UNAUTHORIZED | N/A | E5B tiers for person-level | true (authorization metadata) | No client permission inference |
| E3 finance MTD bundle | `GET …/evaluations/finance/insights` → `EvaluationsFinanceService` | **Fixed MTD** (not analytics period) | E2 | station → UNAVAILABLE | E1 per-metric | E5 finance section | none (aggregate) | true | Receivables = current snapshot only; no historical as-of |
| E3 receivables | `fin.open_receivables`, `fin.overdue_receivables`, `fin.total_outstanding` | current referenceMs | E2 | station fail-closed | AVAILABLE only for emit | E5 completeness | none | true | Trigger: observed overdue > 0, not “> X days” invented |
| E3 revenue/margin | `fin.mtd_issued_revenue`, `fin.profit_margin_mtd` | MTD | E2 | station fail-closed | AVAILABLE/PARTIAL | E5 | none | true | Previous-period rules need E3 comparison (often absent → silent) |
| E4 insights summary | `GET …/evaluations/analytics/insights/summary` | analytics period | E2 | station narrowed | per-section E1 status | E5 per-section | driver slice gated | true | Orchestrates sections; E7 should reuse not re-query ad hoc |
| E4 utilization | summary.sections.utilization | analytics period | E2 | station fail-closed | PARTIAL typical | E5 | none | true | `blockedMs` always null; scheduled not actual |
| E4 cost model | summary.sections.costModel | analytics period | E2 | station fail-closed | PARTIAL/UNAVAILABLE common | E5 | none | true | Authoritative money = incoming invoices only (E4.1B) |
| E4 strengths | summary.sections.strengths | analytics period | E2 | org-scope detection dims | PARTIAL when dims skipped | E5 | none | true | Rule thresholds = existing E4_DETECTION_THRESHOLDS |
| E4 weaknesses | summary.sections.weaknesses | analytics period | E2 | org-scope detection dims | PARTIAL when dims skipped | E5 | none | true | Severity from gap — existing E4 domain |
| E4 driver influence | `GET …/insights/driver-analysis` (lazy in UI) | analytics period | E2 | station fail-closed | section status | E5 | **E5B piiTier** | conditional | Association-only; person-level recs fail-closed at `none` |
| E5 quality report | `GET …/insights/quality` | analytics period | E2 | station scoped | mirrors E3/E4 verbatim | E5 dimensions | N/A | true (suppress/limitation) | UNKNOWN freshness ≠ stale business; no global score |
| E6 transport | `evaluations-analytics-client.ts`, hooks | passthrough | passthrough | passthrough | no upgrade | passthrough | passthrough | **false on client** | Display/filter only |
| E6 EvaluationsPage | `EvaluationsPage.tsx` | UI period control → E4/E5 only | orgId context | persisted station filter | presentation | DataQualityPanel | DriverInfluenceSection | false | E7 adds section; no second page |

`CANONICAL_INPUTS_MAPPED = true`

---

## 3. E7_EXISTING_IMPLEMENTATION_INVENTORY

| Location | Classification | Notes |
|----------|----------------|-------|
| `backend/src/modules/evaluations-analytics/e4/domain/evaluations-detection.domain.ts` | **CANONICAL_CURRENT** (input, not E7) | Strength/weakness rules; explicitly NOT recommendation layer |
| `backend/src/modules/evaluations-analytics/e4/*` | **CANONICAL_CURRENT** | E7 inputs via summary/sections |
| `backend/src/modules/evaluations-finance/*` | **CANONICAL_CURRENT** | E3 money authority |
| `backend/src/modules/evaluations-analytics/e5/*` | **CANONICAL_CURRENT** | Quality/privacy/audit gates |
| `frontend/src/rental/components/evaluations/*` | **CANONICAL_CURRENT** | E6 presentation; no recommendations section yet |
| `frontend/src/rental/lib/insights-categories.ts` | **UNSAFE_CLIENT_DERIVATION** | Dashboard insight recommendation strings + priority sort |
| `frontend/src/rental/components/insights/InsightsCockpit.tsx` | **LEGACY** (parallel cockpit) | Uses dashboard insights + client `insightRecommendation()` |
| `backend/src/modules/evaluations-metrics/evaluations-metric.definitions.ts` → `ins.recommendations_visible_count` | **PARTIALLY_REUSABLE** | Registry metadata only; no E7 server implementation on main |
| Registry `RECOMMENDATIONS` / `FORECASTS` categories | **E8/E9 scope markers** | Forecast metrics planned; must not leak into E7 |
| `origin/cursor/evaluations-recommendation-domain-8427` | **E8_PREDICTIVE_SCOPE** / **UNSAFE_MONEY** | `expectedBenefit`, `estimatedCost`, `expectedNetBenefit`, confidence, priority score — **not on main** |
| `origin/cursor/evaluations-action-center-8427` | **LEGACY** | Pre-E4 `business-insights` stack |
| `origin/cursor/evaluations-predictive-*`, `evaluations-forecast-*`, `evaluations-baseline-forecasts-*` | **E8_PREDICTIVE_SCOPE** / **E9_FORECAST_SCOPE** | Salvage reference only |
| Vehicle intelligence (brake/battery recommendations[]) | **UNRELATED** | Health module strings; not Evaluations E7 |
| Document extraction action planner | **UNRELATED** | AI upload flow |
| Notifications acknowledge/dismiss | **UNRELATED** (pattern reference) | Mutating action precedent outside E7 scope |
| Workflow automation UI route | **LINK_TO_EXISTING_WORKFLOW** (future nav) | Existing product surface |

`LEGACY_IMPLEMENTATION_INVENTORIED = true`

### Salvage candidates (reference only — do NOT port blindly)

| Salvage source | Reusable intent | Reject |
|----------------|-----------------|--------|
| `recommendation-domain.types.ts` (historical) | Org-scoped record, dedup key, calculationVersion, rationale field | Lifecycle state machine, expectedBenefit/estimatedCost, confidence, numeric priority |
| `evaluations-recommendation-domain.md` (historical) | Traceable rationale, dedup, audit events concept | Monetary benefit fields, driver/customer entity targeting from automated sources |
| E4 weakness/strength results | Evidence envelope (`ruleId`, `evidence`, `comparatorBasis`) | Treating detection AS recommendation without E7 wrapper |

---

## 4. Recommendation definition (E7)

A **Recommendation** in E7 is:

1. **Deterministic** — same org + station scope + period + underlying evidence ⇒ same stable identity.
2. **Evidence-backed** — every record links to canonical E1–E6 provenance (metric/section/rule/status).
3. **Non-predictive** — OBSERVATION only; no ESTIMATE/FORECAST/ML fields.
4. **Explainable** — operator-facing title + explanation derived from evidence, not LLM prose.
5. **Scoped** — organization mandatory; station when input sections are station-scoped.
6. **Gated** — respects E1 status, E5 quality limitations, E5B privacy tier.

A Recommendation is **not** a raw E4 weakness row copy — it is an operator-facing
**synthesis** with optional **Actions** (see §12).

### Proposed field authority

| Field | WHY_REQUIRED | SERVER_OR_CLIENT_AUTHORITY | EXISTING_TYPE_REUSED | NEW_CONTRACT_REQUIRED | PRIVACY_RISK | E8_E9_OVERLAP |
|-------|--------------|------------------------------|----------------------|----------------------|--------------|---------------|
| `id` (stable key) | dedup + refresh stability | SERVER | E4 dedup pattern (`ruleId:dimension`) | yes (E7 stable key string) | low | none |
| `category` | UI grouping + sort buckets | SERVER | map from E4 `dimension` / finance / quality | yes (enum) | low | none |
| `priority` | display order | SERVER (explicit order, not score) | E4 `E4Severity` rank | yes (ordinal rank only) | low | not weighted score |
| `status` | collection transport | SERVER | E1 status for collection envelope | reuse E1 | low | none |
| `title` | operator attention | SERVER | i18n keys + evidence template | yes | low | none |
| `explanation` | why shown | SERVER | E4 `evidence` + section reason | yes | low | no predicted benefit text |
| `evidence[]` | audit/explain | SERVER | `E4DetectionEvidence`, money refs, quality dims | compose | medium if driver | no forecast |
| `sourceMetrics[]` | traceability | SERVER | E1 metric IDs | reuse | low | none |
| `period` | scope | SERVER | `EvaluationsPeriodWindow` | reuse E1 | low | none |
| `scope` | tenant/station | SERVER | `EvaluationsInsightsScope` | reuse E4 | low | none |
| `qualityLimitations[]` | honest partial | SERVER | E5 dimension states | reuse E5 | low | none |
| `actionability` | can operator act? | SERVER | enum: INFORMATIONAL / ACTIONABLE | yes | low | none |
| `actions[]` | next steps | SERVER metadata; CLIENT executes nav | new | yes | medium (permissions) | no auto workflow exec |
| `calculationVersion` | provenance | SERVER | pattern from E4/E5 | yes `recommendations-e7-v1` | low | none |
| `generatedAt` / `asOf` | freshness | SERVER | wall clock at derivation | yes | low | not forecast horizon |

**Excluded fields (E8/E9):** `estimatedExposure`, `expectedBenefit`, `expectedNetBenefit`,
`confidence`, `forecast*`, `riskProbability`, `predictedMoney`.

`E7_ESTIMATED_EXPOSURE_FIELDS = 0`  
`E7_FORECAST_FIELDS = 0`

### Recommendation lifecycle (E7 — presentation + optional future persistence)

| Phase | E7A decision |
|-------|----------------|
| Emitted | Server derives on read from canonical inputs (E7B) |
| Displayed | E7C renders verbatim |
| Acknowledged / Dismissed | **Deferred** — requires mutating store + audit (not E7B/C initial) |
| State-changing operational action | **Excluded** from initial E7 (see §12) |

---

## 5. E7_RECOMMENDATION_CANDIDATE_MATRIX

### Accepted families (evidence-backed)

| RECOMMENDATION_FAMILY | CANONICAL_SOURCE | EXACT_TRIGGER_INPUTS | STATUS_REQUIREMENT | QUALITY_REQUIREMENT | MINIMUM_EVIDENCE | PERIOD_AUTHORITY | STATION_BEHAVIOR | PII_BEHAVIOR | SAFE_ACTION | WHY_NOT_E8 | WHY_NOT_E9 | FAIL_CLOSED_BEHAVIOR |
|----------------------|------------------|----------------------|--------------------|--------------------|------------------|------------------|------------------|--------------|-------------|------------|------------|---------------------|
| `WEAKNESS_ATTENTION` | E4 weaknesses | `weaknesses[]` rule emit | section AVAILABLE or PARTIAL with evaluated weakness | E5 weakness section not UNAVAILABLE | E4 weakness row + evidence | analytics period | emit only when weakness section evaluated for scope | none | NAVIGATION → strengths/weaknesses section | observation only | no projection | suppress if weaknesses empty due to insufficient evidence |
| `STRENGTH_REINFORCE` | E4 strengths | `strengths[]` rule emit | section AVAILABLE or PARTIAL | E5 strength section not UNAVAILABLE | E4 strength row | analytics period | same | none | INFORMATIONAL | not predictive | no forecast | suppress if gated silent |
| `UTILIZATION_ATTENTION` | E4 weakness `UNDERUTILIZATION` | utilization ratio + PLATFORM_RULE 0.40 | utilization AVAILABLE/PARTIAL + evidence gates | utilization dimension evaluated | E4 utilization evidence | analytics period | station-scoped utilization UNAVAILABLE → suppress | none | NAVIGATION → utilization section | uses existing 40% threshold | n/a | no emit on null ratio |
| `RECEIVABLES_ATTENTION` | E3 finance | `fin.overdue_receivables` AVAILABLE && amountMinor > 0 | metric AVAILABLE | E5 finance not ERROR | observed Money + invoice class | **MTD/current snapshot** | station finance UNAVAILABLE → suppress | none | NAVIGATION → finance section | observed overdue only | no collection forecast | UNAVAILABLE → suppress (not “healthy”) |
| `OPEN_RECEIVABLES_REVIEW` | E3 finance | `fin.total_outstanding` AVAILABLE && amountMinor > 0 | metric AVAILABLE | E5 completeness not UNAVAILABLE | observed Money | current snapshot | station fail-closed | none | NAVIGATION → finance | not estimated exposure | no DSO forecast | suppress on UNAVAILABLE |
| `COST_EVIDENCE_INCOMPLETE` | E4 cost model | section PARTIAL + unsupported categories | cost PARTIAL | E5 provenance PARTIAL/UNKNOWN | section reason + missing categories | analytics period | station cost UNAVAILABLE → different rec `DATA_SCOPE_LIMITED` | none | INFORMATIONAL | no invented cost | no forecast | never imply zero cost |
| `DATA_QUALITY_LIMITED` | E5 quality | overall.status PARTIAL or UNAVAILABLE | quality report settled | any dimension not COMPLETE | E5 overall.reason + dimensions | analytics period | station scoped | none | INFORMATIONAL | not predictive | n/a | distinguish from NO_ACTION_NEEDED |
| `DRIVER_INFLUENCE_REVIEW` | E4 driver-analysis | factors present + section AVAILABLE | driver section AVAILABLE | E5 + privacy pass | association factors + disclaimer | analytics period | station fail-closed | **piiTier ≠ none**; pseudonymous stays pseudonymous | NAVIGATION → driver section (lazy) | association not causation | no driver risk score | suppress at `none` / PERSON_LEVEL_ACCESS_DENIED |
| `DETECTION_INPUT_SKIPPED` | E4 strengths/weaknesses | `skippedDimensions[]` non-empty | section PARTIAL | E5 mirrors | skipped reason codes | analytics period | scope-specific | none | INFORMATIONAL | n/a | n/a | never claim full evaluation |

### Rejected candidates

| Candidate | Reject reason |
|-----------|---------------|
| Utilization `< 60%` generic alert | **UNAUTHORIZED_INVENTED_THRESHOLD** (E4 uses 40%/70% platform rules only) |
| Cost `+20%` anomaly | No canonical comparator on main |
| Receivable `> X days` without invoice due semantics | Days threshold not product authority; use observed overdue money only |
| Revenue growth recommendation | E3 comparison often absent → evidence-gated silent (not fabricated) |
| Client `insights-categories` strings on Evaluations page | **UNSAFE_CLIENT_DERIVATION** |
| Historical `expectedNetBenefit` | **E8 monetary prediction** |
| Fleet health brake/tire recommendations | **UNRELATED** domain |
| LLM narrative from raw signals | Forbidden by E7 boundaries |

`UNAUTHORIZED_INVENTED_THRESHOLDS = 0`

---

## 6. Threshold authority

| Condition | Threshold source | Classification |
|-----------|------------------|----------------|
| High utilization ≥ 70% | `E4_DETECTION_THRESHOLDS.highUtilization` | **EXISTING_DOMAIN_THRESHOLD** |
| Underutilization < 40% | `E4_DETECTION_THRESHOLDS.underUtilization` | **EXISTING_DOMAIN_THRESHOLD** |
| Cancellation rate 10%, min 10 outcomes | `E4_DETECTION_THRESHOLDS.cancellationRate`, `cancellationMinOutcomes` | **EXISTING_DOMAIN_THRESHOLD** |
| Revenue growth ≥ 5% / decline ≤ −5% | `revenueGrowthPct`, `revenueDeclinePct` | **EXISTING_DOMAIN_THRESHOLD** (silent without previous revenue) |
| Low margin < 10% | `lowMarginPercent` | **EXISTING_DOMAIN_THRESHOLD** |
| Utilization min vehicles 3, coverage 0.8 | `utilizationMinVehicles`, `utilizationMinCoverage` | **EXISTING_SERVER_DERIVATION** |
| Weakness severity gaps (10/25, 5/15) | `evaluations-detection.domain.ts` severityFromGap | **EXISTING_SERVER_DERIVATION** |
| Overdue receivables attention | `amountMinor > 0` when metric AVAILABLE | **EXISTING_SERVER_DERIVATION** (observed fact, not days) |
| Generic “low utilization” at 60% | not in codebase | **UNAUTHORIZED_INVENTED_THRESHOLD** — rejected |
| Smart priority score | not in codebase | **UNAUTHORIZED_INVENTED_THRESHOLD** — rejected |

---

## 7. Status / quality fail-closed matrix (summary)

| Input state | CAN_EMIT | CAN_EMIT_WITH_LIMITATION | MUST_SUPPRESS | WHY |
|-------------|----------|--------------------------|---------------|-----|
| AVAILABLE + E5 COMPLETE | yes | — | — | full evidence |
| PARTIAL | — | yes (with `qualityLimitations`) | — | never imply complete |
| STALE | — | yes (label stale evidence) | — | never upgrade to healthy |
| UNKNOWN (freshness) | — | — | yes for freshness-based recs | UNKNOWN ≠ current |
| UNAVAILABLE | — | — | yes for metric-backed recs | absence ≠ healthy |
| NOT_FOUND (404) | — | — | yes | neutral not-found UX |
| UNAUTHORIZED (403) | — | — | yes | no data leakage |
| ERROR / 5xx | — | — | yes | error UX distinct |
| null coverage ratio | — | — | yes for coverage claims | null ≠ zero |
| piiTier `none` | — | — | yes for driver families | privacy fail-closed |

E5 dimensions (`FRESHNESS`, `COMPLETENESS`, `PROVENANCE`, `VALIDITY`, `TEMPORAL_APPLICABILITY`):
each can add `qualityLimitations[]` but must not fabricate COMPLETE.

`QUALITY_AUTHORITY_PRESERVED = true`

---

## 8. Money boundary

| Rule | E7A enforcement |
|------|-----------------|
| Finance remains MTD / current snapshot | Receivable recs use E3 bundle, not analytics period |
| Explicit currency on every Money evidence | reuse `EvaluationsMoney` |
| No locale currency inference | E6/E3 rules preserved |
| No default EUR | fail-closed UNAVAILABLE |
| No `/100` heuristic | forbidden |
| Mixed currencies never summed | PARTIAL segmentation only |
| observedMoney only | canonical overdue/outstanding/revenue |
| predictedMoney | **prohibited** (`E7_ESTIMATED_EXPOSURE_FIELDS = 0`) |

`MONEY_AUTHORITY_PRESERVED = true`

---

## 9. Privacy boundary

| Rule | Enforcement |
|------|-------------|
| Server `piiTier` verbatim | reuse E5B resolution |
| `driverRef` opaque | no join to Customer name |
| No identity reconstruction | no driverRef parsing |
| No client role inference | transport only |
| `none` tier | no person-level recommendation |
| pseudonymous tier | pseudonym-only copy |
| Organization-level driver aggregates | allowed when section AVAILABLE and tier permits |

`PRIVACY_AUTHORITY_PRESERVED = true`  
`TENANT_STATION_AUTHORITY_PRESERVED = true`

---

## 10. Action model

### Classification (candidates)

| ACTION_TYPE | MUTATING | SAFE_FOR_E7 (initial) | REASON |
|-------------|----------|----------------------|--------|
| NAVIGATION | false | **yes** | scroll/focus section on EvaluationsPage |
| FILTER | false | **yes** | deep-link with existing station/period context |
| OPEN_ENTITY | false | conditional | only non-PII entity refs (vehicle/booking) with permission metadata |
| OPEN_WORKFLOW | false | **yes (link only)** | route to existing workflow-automation with query context |
| CREATE_WORKFLOW_DRAFT | true | **no** | mutating; deferred |
| ACKNOWLEDGE | true | **no** | needs persistence + audit |
| DISMISS | true | **no** | needs persistence |
| STATE_CHANGING_OPERATION | true | **no** | out of scope |
| EXTERNAL_COMMUNICATION | true | **no** | out of scope |

### E7A decision

**Initial E7 supports: A — non-mutating contextual next steps only.**

`mutating_actions_included = false`  
`ACTION_BOUNDARY_DEFINED = true`

Each action carries: `actionType`, `labelKey`, `target` (route/section/entity ref),
`requiredPermission` (server-declared), `mutating: false`, `confirmationRequired: false`.

---

## 11. Workflow automation boundary

| Relationship | Decision |
|--------------|----------|
| Independent hidden action engine | **NO** |
| LINK_TO_EXISTING_WORKFLOW | **allowed** as NAVIGATION to `workflow-automation` with context query |
| OPEN_WORKFLOW_BUILDER_WITH_CONTEXT | optional E7C+ (read-only prefill via URL state) |
| CREATE_DRAFT_ONLY / EXECUTE_EXISTING_ACTION | **NO_INTEGRATION_IN_E7** initial |

`WORKFLOW_BOUNDARY_DEFINED = true`

---

## 12. E7_RECOMMENDATION_PROVENANCE_CONTRACT

Minimum provenance on every recommendation:

```typescript
interface E7RecommendationProvenance {
  calculationVersion: 'recommendations-e7-v1'; // semver frozen at E7B
  sourceSections: readonly ('finance' | 'utilization' | 'costModel' | 'strengths' | 'weaknesses' | 'driverInfluence' | 'quality')[];
  sourceRuleIds?: readonly string[]; // E4 ruleId when applicable
  sourceMetricIds?: readonly string[]; // E1 ids e.g. fin.overdue_receivables
  period: EvaluationsPeriodWindow;
  scope: EvaluationsInsightsScope;
  inputStatuses: Readonly<Record<string, EvaluationsMetricStatus>>;
  qualityLimitations?: readonly { dimension: E5QualityDimension; state: E5DimensionState }[];
  lineageRefs?: readonly E5LineageRef[]; // safe opaque refs only
  derivationReason: string; // stable machine code, e.g. WEAKNESS_UNDERUTILIZATION
}
```

No raw SQL, internal table names, or PII in operator-facing provenance payload.

`PROVENANCE_CONTRACT_DEFINED = true`

---

## 13. Identity / deduplication

**Stable key (deterministic, no random UUID on read path):**

```
recommendationKey = sha256(orgId + '|' + stationKey + '|' + periodKey + '|' + family + '|' + sourceRuleId + '|' + dimension + '|' + derivationReason)[0:32]
```

| Event | Behavior |
|-------|----------|
| Refresh same scope | same keys ⇒ stable list order |
| Evidence changes | key set diff adds/removes items |
| Period change | new keys (expected) |
| Station filter change | new keys (expected) |
| Input becomes UNAVAILABLE | recommendation dropped (not stale cache) |
| Duplicate families | merge by key; one row |

Optional future persistence (ack/dismiss) may use DB id — **not required for E7B read model**.

---

## 14. E7_SORT_AUTHORITY

`CLIENT_PRIORITY_SCORE_CALCULATION = false`

Deterministic server ordering:

1. Category rank (fixed product policy): `RECEIVABLES` → `WEAKNESS` → `UTILIZATION` → `COST` → `QUALITY` → `DRIVER` → `STRENGTH`
2. Within category: E4 weakness `severity` rank (CRITICAL → WARNING → INFO)
3. Tie-break: `derivationReason` lexicographic

No weighted score, no ML ranker.

---

## 15. Backend vs frontend responsibility

| Layer | Responsibility |
|-------|----------------|
| **BACKEND (E7B)** | Derive recommendations; tenant/station auth; status/quality/privacy gates; action authorization metadata; provenance; stable keys |
| **FRONTEND (E7C)** | Fetch + render; section placement; execute NAVIGATION/FILTER/OPEN_ENTITY links; confirmation UX for future mutating (none initial) |

`CLIENT_BUSINESS_RECOMMENDATION_DERIVATION_COUNT = 0`

---

## 16. E7_PROPOSED_BACKEND_CONTRACT (freeze — implement in E7B)

### Endpoint

```
GET /organizations/:orgId/evaluations/analytics/insights/recommendations
  ?periodType=MTD|…
  &stationIds=…
```

Guards: same as E4 (`OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`, `EvaluationsAnalyticsFeatureGuard`, `evaluations:read`).

### Response (sketch)

```typescript
interface EvaluationsRecommendationsResponse {
  schemaVersion: '1.0.0';
  generatedAt: string;
  calculationVersion: 'recommendations-e7-v1';
  period: EvaluationsPeriodWindow;
  scope: EvaluationsInsightsScope;
  status: EvaluationsMetricStatus; // collection roll-up conservative
  reason: string | null;
  recommendations: readonly E7Recommendation[];
  emptyState: 'NO_ACTION_NEEDED' | 'INSUFFICIENT_EVIDENCE' | null;
}

interface E7Recommendation {
  id: string; // stable deterministic key
  family: string;
  category: 'FINANCE' | 'FLEET' | 'OPERATIONS' | 'QUALITY' | 'DRIVER' | 'INSIGHT';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
  title: string;
  explanation: string;
  provenance: E7RecommendationProvenance;
  actionability: 'INFORMATIONAL' | 'ACTIONABLE';
  actions: readonly E7Action[];
}

interface E7Action {
  actionType: 'NAVIGATION' | 'FILTER' | 'OPEN_ENTITY' | 'OPEN_WORKFLOW';
  mutating: false;
  labelKey: string;
  target: { kind: 'evaluations_section' | 'route' | 'entity'; value: string };
  requiredPermission?: string;
}
```

Transport: 403 → UNAUTHORIZED; generic 404 → NOT_FOUND; 5xx → ERROR. No FEATURE_DISABLED from generic 404.

Implementation note: E7B service orchestrates existing `EvaluationsInsightsService` + `EvaluationsFinanceService` + `EvaluationsQualityService` — **no duplicate SQL**.

---

## 17. UI placement (E7C plan)

**Decision:** dedicated **Recommendations & Actions** section on `EvaluationsPage`, placed **immediately after Executive Summary** and **before** Strengths & Weaknesses.

Rationale:

- Answers “what should I pay attention to?” early without replacing Executive KPIs.
- Avoids duplicating Strength/Weakness lists — synthesizes cross-section signals.
- Preserves E6 section order for detailed evidence below.

Empty states (distinct copy):

| `emptyState` | UX |
|--------------|-----|
| `NO_ACTION_NEEDED` | healthy / no gated findings |
| `INSUFFICIENT_EVIDENCE` | quality/scope limits — not success greenwashing |
| unauthorized / not found / error | reuse E6 transport shells |

---

## 18. E7 test plan matrix (E7B+ implementation)

| # | Area | Case |
|---|------|------|
| 1 | tenant | org A cannot see org B recommendations |
| 2 | station | station scope narrows; no org fallback |
| 3 | period | period change changes recommendation keys |
| 4 | finance | MTD invariance when analytics period changes |
| 5–8 | money | EUR / USD / JPY / KWD explicit currency |
| 9 | money | mixed currency → no blended rec money |
| 10–15 | status | AVAILABLE / PARTIAL / STALE / UNKNOWN / UNAVAILABLE / NOT_APPLICABLE gates |
| 16 | quality | insufficient quality → INSUFFICIENT_EVIDENCE |
| 17 | http | 404 → NOT_FOUND |
| 18 | http | 403 → UNAUTHORIZED |
| 19 | http | 5xx → ERROR |
| 20–22 | privacy | driver full / pseudonymous / none |
| 23 | dedup | stable keys across refresh |
| 24 | action | permission metadata present |
| 25 | action | non-mutating links only |
| 26 | audit | provenance includes calculationVersion |
| 27 | E8 | no estimatedExposure fields |
| 28 | E9 | no forecast fields |
| 29 | client | no business derivation in frontend |
| 30 | weakness | UNDERUTILIZATION uses 40% platform threshold only |
| 31 | receivables | overdue > 0 observed, not days threshold |
| 32 | empty | NO_ACTION_NEEDED vs INSUFFICIENT_EVIDENCE distinct |
| 33 | detection | skipped dimensions → limitation rec, not false complete |
| 34 | cost | PARTIAL cost → incomplete evidence rec |
| 35 | driver | association wording, no causal claims |

**Test matrix size = 35**

---

## 19. E7 phase topology

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| **E7A** ✅ | Authority freeze | This doc, E7-ONBOARDING, Changes/Architektur |
| **E7B** | Backend derivation + API | `evaluations-analytics/e7/*`, controller route, unit/integration tests |
| **E7C** | Frontend integration | `RecommendationsSection.tsx`, hook, i18n, EvaluationsPage slot |
| **E7D** | Acceptance | integrated audit doc, privacy/security regression, draft PR readiness |

No backend work collapsed — **no canonical recommendations endpoint exists on main**.

`E7B_IMPLEMENTATION_SCOPE_FROZEN = true`

---

## 20. E8 / E9 exclusion proof

| Excluded | On main? | E7A guard |
|----------|----------|-----------|
| `estimatedExposure` | only in legacy comments/E8 branches | zero fields in E7 contract |
| Forecast metrics (`fc.*`) | registry `planned` only | not referenced by E7 families |
| `expectedBenefit` / `estimatedCost` | historical branch only | rejected candidate |
| Client priority score | insights-categories legacy | `CLIENT_PRIORITY_SCORE_CALCULATION=false` |
| Predictive risk probabilities | E8 branches | no E7 family uses them |

---

## 21. Acceptance gates checklist

| Gate | Status |
|------|--------|
| E7_BRANCH_FROM_MERGED_MAIN | ✅ |
| E7_DRAFT_PR_CREATED | ✅ (after push) |
| R3B_FINAL_STATUS=COMPLETE | ✅ |
| PR1054_REACHABLE_FROM_MAIN | ✅ |
| CANONICAL_INPUTS_MAPPED | ✅ |
| LEGACY_IMPLEMENTATION_INVENTORIED | ✅ |
| UNAUTHORIZED_INVENTED_THRESHOLDS=0 | ✅ |
| CLIENT_BUSINESS_RECOMMENDATION_DERIVATION_COUNT=0 | ✅ |
| E7_ESTIMATED_EXPOSURE_FIELDS=0 | ✅ |
| E7_FORECAST_FIELDS=0 | ✅ |
| MONEY_AUTHORITY_PRESERVED | ✅ |
| PRIVACY_AUTHORITY_PRESERVED | ✅ |
| QUALITY_AUTHORITY_PRESERVED | ✅ |
| TENANT_STATION_AUTHORITY_PRESERVED | ✅ |
| ACTION_BOUNDARY_DEFINED | ✅ |
| WORKFLOW_BOUNDARY_DEFINED | ✅ |
| PROVENANCE_CONTRACT_DEFINED | ✅ |
| E7B_IMPLEMENTATION_SCOPE_FROZEN | ✅ |
| PRODUCTION_MUTATIONS=0 | ✅ |
| PRISMA_CHANGES=0 | ✅ |
| MIGRATION_CHANGES=0 | ✅ |

---

## 22. Artifact paths

- `docs/audits/pr-recovery/E7-ONBOARDING.md`
- `docs/audits/pr-recovery/phase3-e7a-recommendations-actions-authority-baseline-2026-08.md` (this file)
- `architecture/EVALUATIONS_E7_RECOMMENDATIONS_ACTIONS_2026-08-17.md`
- `frontend/src/master/components/ChangesView.tsx` (E7A entry)
- `frontend/src/master/components/ArchitekturView.tsx` (E7A architecture entry)

---

## 23. Branch / PR record

*(Updated after git push — see commit message `docs(evaluations): E7A recommendations/actions authority baseline`)*
