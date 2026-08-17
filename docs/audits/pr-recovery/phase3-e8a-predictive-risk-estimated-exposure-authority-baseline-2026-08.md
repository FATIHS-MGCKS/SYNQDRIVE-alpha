# Phase 3 E8A — Predictive Risk & estimatedExposure Authority Baseline (2026-08)

## Entry state

| Field | Value |
|-------|-------|
| E8_ENTRY_MAIN_SHA | `bd732a8f7a6467565a8668ea136e81b79a04666a` |
| E7_MERGE_SHA | `bd732a8f7a6467565a8668ea136e81b79a04666a` |
| E7_MERGE_REACHABLE_FROM_MAIN | true |
| E8_ENTRY_MAIN_MOVED_AFTER_E7 | false (main HEAD = E7 merge commit at E8A entry) |
| WORKTREE_CLEAN_AT_ENTRY | true |
| E8 branch | `integration/evaluations-e8-predictive-risk-2026-08` |
| E8A scope | **docs-only authority freeze** |

---

## 1. E7 merge ancestry

```bash
git merge-base --is-ancestor bd732a8f7a6467565a8668ea136e81b79a04666a origin/main
# E7_MERGE_REACHABLE_FROM_MAIN=true
```

E8 branches from exact current `origin/main` @ `bd732a8`.

---

## 2. E8_EXISTING_PREDICTIVE_INVENTORY (current main)

Full repository search classified every hit. Summary by classification:

| Classification | Count (material) | Examples on main |
|----------------|------------------|------------------|
| **CANONICAL_CURRENT_FACT** | E3/E4 finance & cost observed metrics | `fin.overdue_receivables`, `fin.open_receivables` (MTD/point-in-time) |
| **CANONICAL_CURRENT_RISK_AUTHORITY** | none (E8 not implemented) | — |
| **METRIC_REGISTRY_PLACEHOLDER** | 4 | `fc.revenue_forecast_30d`, `fc.utilization_forecast_30d`, `fc.receivables_collection_forecast`, `fc.maintenance_downtime_forecast` in `evaluations-metric.definitions.ts` + i18n "(geplant/planned)" |
| **E8_SALVAGE_REFERENCE** | docs only | E7A/E7D explicit E8 exclusions; `architecture/EVALUATIONS_E7_*` |
| **E9_FORECAST_SCOPE** | observability hooks | `evaluations-prometheus.metrics.ts` `forecastTotal`, `forecastDriftTotal` (placeholder counters, no engine) |
| **UNSAFE_PREDICTION** | 0 runtime | E7 derive spec negative assertion |
| **UNSAFE_MONEY** | 0 runtime | E7 excludes `expectedBenefit` |
| **UNSAFE_CLIENT_DERIVATION** | legacy dashboard only | `insights-categories.ts` (not EvaluationsPage) — rejected for E8 |
| **LEGACY_ONLY** | 0 on main | historical branches only |
| **UNRELATED** | many | battery/tire `modelVersion`, document extraction confidence — out of Evaluations E8 scope |

**Runtime predictive fields on main:** `estimatedExposure=0`, `riskScore=0`, `probability=0`, `forecastValue=0` in Evaluations E7/E6 paths.

E2E fixtures retain `forecast-available` / `forecast-unavailable` scenario names from pre-E6 era — **LEGACY_ONLY** test scaffolding; no canonical forecast API on main.

---

## 3. Historical branch salvage inventory

Read-only archaeology (no cherry-pick). See detailed tables in appendix A.

| Branch | Primary salvage | Classification |
|--------|-----------------|---------------|
| `evaluations-predictive-analytics-architecture-8427` | Tier catalog, release gates, tenant isolation prose | **SAFE_CONCEPT_ONLY** |
| `evaluations-feature-store-8427` | PIT feature snapshots, leakage tests | **REQUIRES_REVALIDATION** |
| `evaluations-baseline-forecasts-8427` | MA/seasonal baseline forecast functions | **E9_ONLY** |
| `evaluations-forecast-backtesting-8427` | Maintenance risk heuristics + backtest gates | Risk: **REQUIRES_REVALIDATION**; backtest: **E9_ONLY** |
| `evaluations-recommendation-domain-8427` | `expectedBenefit`, `confidence`, persistence | **UNSAFE_LEGACY / REJECT** |

**Accepted concepts (concept-only):**
- Inference tiers (OBSERVED → RULE → STATISTICAL → ML) as governance vocabulary
- PIT `asOfUtc` feature cutoff discipline
- Rolling-origin temporal validation + calibration gates (reuse pattern, revalidate thresholds)
- Org-scoped training/serving separation

**Rejected concepts:**
- `expectedBenefit` / `expectedNetBenefit` on recommendations (E7 canonical path supersedes)
- Decorative `RecommendationConfidence` enum without statistical basis
- `probabilityEstimate = min(0.85, historicalRate + healthFactor)` as production probability (uncalibrated)
- Weighted fleet risk scores without validation
- Per-customer default probability (architecture doc explicitly blocked)

---

## 4. Observed vs predictive taxonomy (frozen)

| Class | Definition | E8A rule | Example on main |
|-------|------------|----------|-----------------|
| **A. OBSERVED FACT** | Canonical current/historical truth | Must NOT be labeled predictive | E3 `fin.overdue_receivables` |
| **B. OBSERVED RISK INDICATOR** | Current fact associated with elevated concern | May inform rules; NOT a probability | E4 critical health + open unplanned cases count |
| **C. DETERMINISTIC FORWARD-RISK RULE** | Policy-authorized rule flagging future concern | May emit **RISK_CATEGORY** only; no fake P | "≥N unplanned cases in trailing 90d AND critical health ≥ threshold" (thresholds require E8B validation) |
| **D. STATISTICAL PREDICTION** | Model estimating defined future target | Requires labels, temporal validation, calibration before **EVENT_PROBABILITY** | Historical ServiceCase rate baseline (E8B offline) |

**Gates:** `OBSERVED_FACT_AS_PREDICTION_COUNT=0`, `RULE_AS_PROBABILITY_COUNT=0`, `ARBITRARY_WEIGHTED_RISK_SCORE_COUNT=0`, `DECORATIVE_CONFIDENCE_PERCENTAGES=0`

---

## 5. Prediction target matrix

| TARGET_NAME | Future event | LABEL_AVAILABLE | CAN_BE_VALIDATED | E8A verdict |
|-------------|--------------|-----------------|------------------|-------------|
| `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` | ≥1 unplanned maintenance ServiceCase with fleet downtime opens in horizon | **true** (ServiceCase timestamps) | **true** (temporal backtest possible) | **SELECTED — E8_INITIAL_TARGET** |
| `INVOICE_PAYMENT_DEFAULT` | Invoice transitions to overdue/default within horizon | partial (invoice lifecycle exists) | requires label policy for write-off/default | **DEFERRED** — no canonical default label authority |
| `UTILIZATION_DETERIORATION` | Fleet utilization below E4 threshold in future window | partial | leakage risk vs scheduled bookings | **DEFERRED** — target definition overlaps E4 weakness |
| `RECEIVABLES_COLLECTION_FAILURE` | Portfolio collection rate below baseline | weak labels on main | mixes E3 snapshot with forward cashflow | **DEFERRED** |
| `DRIVER_ASSOCIATED_INCIDENT` | Person-level outcome | blocked at `piiTier=none` | privacy/fairness | **REJECT** for E8 MVP |
| "high risk" / "likely problem" | undefined | false | false | **REJECT** (`UNDEFINED_PREDICTION_TARGETS_ACCEPTED=0`) |

### Selected target (frozen)

| Field | Value |
|-------|-------|
| TARGET_NAME | `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` |
| WHAT_FUTURE_EVENT_IS_PREDICTED | At least one **unplanned** maintenance `ServiceCase` with recorded downtime affecting fleet availability opens within the prediction horizon |
| TARGET_TYPE | Binary event (org or station fleet scope) |
| PREDICTION_UNIT | `EVENT_OCCURRENCE` (not money) |
| PREDICTION_HORIZON | `NEXT_30_DAYS` |
| PREDICTION_TIMESTAMP | `predictionAsOf` = E4 summary `generatedAt` / request reference time |
| OUTCOME_TIMESTAMP | First qualifying ServiceCase `downtimeStart` (or case open) in `(predictionAsOf, predictionAsOf + 30d]` |
| GROUND_TRUTH_SOURCE | `ServiceCase` (E4 repository path); MAINTENANCE category; unplanned classification per domain rules |
| LABEL_QUALITY | **REQUIRES_REVALIDATION** — need E8B empirical class balance + minimum sample audit |
| TENANT_SCOPE | org-isolated; station-scoped variant optional |
| STATION_SCOPE | reuse E2 `EvaluationsInsightsScope` |
| PII_SCOPE | aggregate fleet/vehicle operational — **no driver person-level features in MVP** |
| MONEY_INVOLVED | false (initial E8B surface) |

---

## 6. estimatedExposure semantic decision

### Evaluated meanings

| # | Meaning | E8A assessment |
|---|---------|----------------|
| 1 | EXPECTED LOSS = P(event) × loss | **NOT authorized** — no calibrated P(event) on main |
| 2 | MAXIMUM / AT-RISK exposure | Legacy `default_exposure_minor` design only; **not on main**; aging weights not product-authoritative |
| 3 | OBSERVED CURRENT EXPOSURE | Already canonical E3 `fin.overdue_receivables` / `fin.open_receivables` — **Class A, not E8** |
| 4 | MODEL-PREDICTED FUTURE AMOUNT | Requires forecast engine — **E9_ONLY** for revenue/utilization series |

### Decision

```
ESTIMATED_EXPOSURE_AUTHORITY = DEFERRED_INSUFFICIENT_AUTHORITY
ESTIMATED_EXPOSURE_SEMANTIC_AMBIGUITY = 0  (by not emitting the field)
```

**Rationale:** Emitting `estimatedExposure` as EXPECTED LOSS would violate `UNVALIDATED_SCORE_USED_AS_PROBABILITY=0`. Emitting AT-RISK exposure would duplicate E3 observed facts or require uninvented aging weights. E8B implements **predictive risk without monetary exposure field** until a separately authorized exposure semantics pass (E8B.1 or E8C scope amendment).

**When revisited:** Only after (a) calibrated binary model for a **money-linked target** (e.g., receivables default) passes offline gates, OR (b) product explicitly authorizes non-predictive AT-RISK exposure with documented formula — under a distinct field name if not Class A observed.

`UNKNOWN_ESTIMATED_EXPOSURE_AS_ZERO_COUNT=0` (field absent).

---

## 7. Money authority (for deferred exposure)

When/if authorized later:

- Representation: canonical E1 `EvaluationsMoney` (`amountMinor`, `currency`)
- No float, no default EUR, no `/100`, no mixed-currency sum
- Multi-currency: per-currency exposure objects or suppress aggregate
- `MIXED_CURRENCY_ESTIMATED_EXPOSURE_SUM=0`, `DEFAULT_ESTIMATED_EXPOSURE_CURRENCY_COUNT=0`

Current E8 MVP: **no monetary predictive output**.

---

## 8. Horizon authority

| Candidate | Classification |
|-----------|----------------|
| `NEXT_30_DAYS` | **EXISTING_MODEL_HORIZON** (salvage maintenance-risk 30d) + **PRODUCT_POLICY_REQUIRED** confirmation in E8B |
| `NEXT_7_DAYS`, `NEXT_90_DAYS` | **EXISTING_MODEL_HORIZON** (salvage) — secondary horizons deferred to post-MVP |
| Ad-hoc horizons | **INVENTED** — forbidden |

`INVENTED_PREDICTION_HORIZONS=0` for E8A freeze (single primary horizon `NEXT_30_DAYS`).

---

## 9. As-of / cutoff authority

| Concept | Authority |
|---------|-----------|
| `predictionAsOf` | Request reference instant (E1 period reference / E4 `generatedAt`) |
| `featureCutoffAt` | Same as `predictionAsOf` for MVP (features from E4 summary snapshot + historical ServiceCase queries ≤ cutoff) |
| `generatedAt` | Wall clock at derivation (E7 pattern) |
| `horizonStart` | `predictionAsOf` |
| `horizonEnd` | `predictionAsOf + 30 days` |

**Rule:** No ServiceCase, invoice, or booking event with effective timestamp **after** `featureCutoffAt` may influence prediction.

`FUTURE_INFORMATION_LEAKAGE_ALLOWED=false`

---

## 10. Freshness blocker analysis

E5 preserves structural **FRESHNESS = UNKNOWN** when no ingestion watermark exists (finance, utilization on main).

| SOURCE | CAN_SUPPORT_FORWARD_PREDICTION | E8A gate |
|--------|-------------------------------|----------|
| E3 Finance (overdue) | For **observed** exposure only (Class A) — not E8 MVP target | N/A |
| E4 Utilization | Historical window OK; live "current fleet state" claims blocked when FRESHNESS UNKNOWN | Predictive features from **closed historical windows** only |
| ServiceCase history | Business timestamps (`completedAt`, `downtimeStart`) — **SAFE_CLOSED_HISTORICAL_WINDOW** | Primary label + feature source |
| E7 recommendations | **NOT a feature** — duplicate of E3/E4 inputs | `DUPLICATE_FEATURE_TRUTH_COUNT=0` |
| Telemetry live snapshot | STRUCTURAL_FRESHNESS_UNKNOWN | Exclude from live-dependent MVP features |

`PREDICTION_FROM_UNBOUNDED_FRESHNESS_COUNT=0`

E8 gates stricter than E7: if quality report overall PARTIAL/UNAVAILABLE or required historical sample insufficient → **MUST_SUPPRESS** predictive output.

---

## 11. Feature inventory (summary)

| FEATURE | CANONICAL_SOURCE | SAFE_FOR_E8 | Notes |
|---------|------------------|-------------|-------|
| `trailing_unplanned_case_count_90d` | ServiceCase query ≤ cutoff | true | Primary signal |
| `fleet_critical_health_count` | E4 health/weakness inputs | true (aggregate) | No per-vehicle score weighting without validation |
| `fleet_vehicle_count` | E4 utilization denominator | true | Cold-start denominator |
| `fin.overdue_receivables` | E3 | **false for MVP target** | Class A observed — not independent |
| E7 recommendation families | E7 derive | **false** | Duplicate truth |
| Driver factors | E5B | **false for MVP** | Privacy/fairness |

Full matrix: appendix B.

---

## 12. E8_TARGET_LEAKAGE_MATRIX

| Feature | Target | Leakage risk | Verdict |
|---------|--------|--------------|---------|
| ServiceCase in horizon window | unplanned disruption in horizon | **HIGH if case opens before prediction** | Exclude cases with `downtimeStart > featureCutoffAt` from features; labels only in future window |
| E4 weakness emitted same day | future utilization weakness | medium | Use prior-period weakness only |
| E7 receivables rec | maintenance disruption | duplicate | Excluded |

`KNOWN_TARGET_LEAKAGE_FEATURES_ACCEPTED=0`

---

## 13. Model type decision

| Approach | E8A decision |
|----------|--------------|
| **DETERMINISTIC_POLICY_RULE** | **Phase 1 (E8B)** — baseline gate: historical rate + fleet health pressure → `RISK_CATEGORY` |
| **STATISTICAL_BASELINE** | **Phase 1 offline** — trailing unplanned rate vs fleet size; compare to policy threshold |
| CALIBRATED_CLASSIFIER | Phase 2 — only after temporal validation + calibration gates pass |
| ML / LLM | **Rejected** for E8 MVP (`LLM_PREDICTIVE_AUTHORITY_COUNT=0`) |

**Baseline model:** trailing 90d unplanned case rate per fleet vehicle (org-scoped); challenger = constant base rate; must beat baseline in offline backtest before any probability emission.

`BASELINE_MODEL_DEFINED=true`, `MODEL_VALIDATION_PLAN_DEFINED=true`, `CALIBRATION_VALIDATION_DEFINED=true`

`PROBABILITY_CALIBRATION_REQUIRED_FOR_ESTIMATED_EXPOSURE=true` (when exposure ever authorized)

---

## 14. Probability & confidence authority

| Output | E8A decision |
|--------|--------------|
| `EVENT_PROBABILITY` | **Absent in E8B MVP** until calibration passes |
| `RISK_CATEGORY` | **Allowed** — `ELEVATED` / `NORMAL` / suppressed |
| `confidence` / `confidenceScore` | **Absent** — use E1 `status` + E5 `qualityLimitations` |
| Decorative % | **Forbidden** |

Statistical confidence intervals deferred to post-calibration phase; never conflate with data-quality tier.

---

## 15. Quality fail-closed matrix (E8)

Stricter than E7 recommendations:

| Input status | Predictive output |
|--------------|-------------------|
| AVAILABLE + sufficient history + quality COMPLETE on required dims | CAN_PREDICT (category) |
| PARTIAL | CAN_PREDICT_WITH_LIMITATION (explicit limitations) OR MUST_SUPPRESS if history incomplete |
| STALE | MUST_SUPPRESS for forward claims requiring current state |
| UNAVAILABLE / ERROR | MUST_SUPPRESS |
| FRESHNESS UNKNOWN + live-dependent feature | MUST_SUPPRESS |
| Cold start (below MIN_SAMPLE) | `INSUFFICIENT_EVIDENCE` |

`QUALITY_FAIL_CLOSED_DEFINED=true`

---

## 16. Privacy / fairness

| Rule | Decision |
|------|----------|
| `piiTier = none` | No person-level predictive features |
| Driver person-level risk | **Out of E8 MVP** |
| Vehicle/operational aggregate | Preferred |
| Identity reconstruction | Forbidden (`DRIVER_IDENTITY_RECONSTRUCTION_COUNT=0`) |
| Proxy attributes | No protected-class proxies; prefer operational signals |

`PRIVACY_FAIL_CLOSED_DEFINED=true`

---

## 17. Tenant / station model authority

| Decision | Value |
|----------|-------|
| Architecture | **GLOBAL_POLICY + TENANT_SCOPED_FEATURES** (org-specific historical rates; shared rule structure) |
| Training | Org-isolated historical ServiceCase rows only |
| Serving | Org + station scope via E2 |
| Cross-tenant | **Forbidden** (`CROSS_TENANT_PREDICTION_LEAKAGE_ALLOWED=false`) |

`TENANT_STATION_AUTHORITY_DEFINED=true`

---

## 18. Cold start

| Field | Decision |
|-------|----------|
| MIN_HISTORY_AUTHORITY | Empirical — E8B must compute; E8A freezes **concept** only |
| MIN_SAMPLE_AUTHORITY | Minimum fleet vehicles + minimum unplanned cases in trailing window (salvage suggests ≥5 cases, ≥3 vehicles — **REQUIRES_REVALIDATION**, not hardcoded in runtime) |
| COLD_START_BEHAVIOR | `INSUFFICIENT_EVIDENCE` / E1-compatible UNAVAILABLE — **never fake prediction** |

---

## 19. Explainability / provenance contract (proposed)

Minimum future payload provenance:

- prediction target + horizon
- `predictionAsOf`, `featureCutoffAt`
- `predictionContractVersion`, `modelVersion`, `calculationVersion`
- source sections + periods
- input statuses + quality limitations
- model type + baseline comparison metadata
- contributing evidence (counts, not raw PII)
- **No causal claims** from association (`CAUSAL_CLAIMS_FROM_ASSOCIATION=0`)

---

## 20. Versioning & reproducibility

| Version | Purpose |
|---------|---------|
| `schemaVersion` | Wire contract |
| `predictionContractVersion` | E8 API envelope (proposed `predictive-risk-e8-v1`) |
| `modelVersion` | Scoring/rule bundle id |
| `featureVersion` | Feature extraction snapshot id |
| `calculationVersion` | Derivation logic id |

Fixed inputs ⇒ fixed output. No LLM, no unseeded randomness.

`NONDETERMINISTIC_PREDICTION_AUTHORITY=0`

---

## 21. E8 / E9 boundary

| Scope | Owner |
|-------|-------|
| E8 | Binary/ categorical **risk** about defined future **event** |
| E9 | Time-series **forecast** (revenue, utilization, downtime minutes, intervals) |

Salvage `evaluations-baseline-forecast.ts` → **E9_ONLY**. E8A creates no forecast series.

`E9_RUNTIME_SCOPE_IN_E8A=0`

---

## 22. E7 interaction

| Decision | Value |
|----------|-------|
| Relationship | **PREDICTIVE_RISK_SEPARATE_SECTION** |
| E7 mutation | **None** — E7 derive unchanged |
| Future | E7 may **reference** E8 in later phase with explicit product authority |
| Circular truth | **Forbidden** (`E7_E8_CIRCULAR_AUTHORITY=0`) |

---

## 23. Proposed E8 response contract (NOT implemented)

Conceptual wire shape under `shared/evaluations-predictive-risk/` (E8B):

| FIELD | SEMANTICS | OPTIONAL | CLIENT_CAN_DERIVE |
|-------|-----------|----------|-------------------|
| `schemaVersion` | contract version | no | false |
| `generatedAt` | response time | no | false |
| `predictionAsOf` | cutoff anchor | no | false |
| `scope` | E2 scope | no | false |
| `target` | `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` | no | false |
| `horizon` | `NEXT_30_DAYS` | no | false |
| `status` | E1 metric status | no | false |
| `riskCategory` | `ELEVATED` \| `NORMAL` \| null | yes | false |
| `eventProbability` | calibrated P — **deferred** | absent MVP | false |
| `estimatedExposure` | **deferred** | absent | false |
| `qualityLimitations` | E5 dimensions | yes | false |
| `provenance` | explainability block | no | false |
| `emptyState` | `INSUFFICIENT_EVIDENCE` etc. | yes | false |

---

## 24. API boundary (proposed)

```
GET /organizations/:orgId/evaluations/analytics/insights/predictive-risk
```

Query: analytics period (for scope context), stationIds — **not** for relabeling prediction horizon.

Guards: reuse `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`, `EvaluationsAnalyticsFeatureGuard`, `EvaluationsAnalyticsScopeService`.

Transport: 403→UNAUTHORIZED, generic 404→NOT_FOUND, 5xx→ERROR.

---

## 25. UI placement (proposed, not implemented)

Single page: `EvaluationsPage` / `financial-insights`.

Order:

1. Executive Summary  
2. Recommendations / Actions (E7)  
3. **Predictive Risk (E8)** ← new  
4. Strengths & Weaknesses  
5. Finance …  

Labels must distinguish **Observed / Estimated / Predicted / Potential**.

---

## 26. Persistence decision

```
E8_PERSISTENCE_DECISION = DERIVED_ON_READ
```

Optional future: `CACHED_EPHEMERALLY` (Redis, version-keyed) — no Prisma in initial E8.

Rationale: reproducibility + audit via request metadata; avoids schema migration.

`E8_PERSISTENCE_DECISION_DEFINED=true`

---

## 27. E8_DATA_ACCESS_PLAN

| Access | Reuse | New |
|--------|-------|-----|
| E4 summary | 1× `getSummary()` orchestration (E7 pattern) | — |
| ServiceCase history | E4 repository patterns | Time-bounded query ≤ featureCutoffAt |
| E5 quality | From summary | — |
| E3 finance direct | **No** for MVP target | — |
| Per-vehicle N+1 | Avoid — aggregate counts | Batch query |

---

## 28. E8 safe MVP selection

| Family | DATA_AUTHORITY | LABEL_QUALITY | PRIVACY | E8A |
|--------|----------------|---------------|---------|-----|
| Fleet unplanned maintenance disruption | **High** (ServiceCase) | **Medium** (needs E8B audit) | **Low** (aggregate) | **SELECTED** |
| Receivables default | Medium | Low (label policy) | Medium | Deferred |
| Utilization deterioration | Medium | Medium | Low | Deferred |
| Driver incident | Low | Low | **High** | Rejected MVP |

```
E8_INITIAL_TARGET_CANDIDATE = FLEET_UNPLANNED_MAINTENANCE_DISRUPTION
E8_SAFE_MVP_DECISION_DEFINED = true
```

---

## 29. E8B / C / D topology (frozen)

| Phase | Scope |
|-------|-------|
| **E8A** | Authority freeze (this document) — **complete** |
| **E8B** | Backend derive-on-read + offline validation harness; **no estimatedExposure** |
| **E8B.1** | Optional exposure semantics if separately authorized |
| **E8C** | Frontend Predictive Risk section (presentation only) |
| **E8D** | Integrated acceptance + merge readiness |

No E8B0 unless offline dataset certification blocks E8B — **not required at E8A**.

`E8B_SCOPE_FROZEN=true`

---

## 30. Test matrix (E8B–D)

**47 planned test areas** (see E8-ONBOARDING §7): tenant/station/RBAC, target/horizon/as-of, temporal + target leakage, cold start, status matrix, money (deferred exposure tests stubbed), calibration, model/feature version, reproducibility, privacy tiers, no client derivation, no LLM, transport semantics, E7 regression, E9 exclusion, wording safety.

`TEST_MATRIX_CASES=47`

---

## 31. E8A runtime boundary verification

```
E8A_BACKEND_RUNTIME_CHANGES = 0
E8A_FRONTEND_RUNTIME_CHANGES = 0
E8A_SHARED_RUNTIME_CHANGES = 0
PRISMA_CHANGES = 0
MIGRATION_CHANGES = 0
PRODUCTION_MUTATIONS = 0
```

---

## 32. Acceptance matrix

All E8A gates **PASS** (Form B):

| Gate | Result |
|------|--------|
| E7_MERGE_REACHABLE_FROM_MAIN | true |
| E8_BRANCH_FROM_CURRENT_MAIN | true |
| PREDICTIVE_INVENTORY_COMPLETE | true |
| HISTORICAL_SALVAGE_INVENTORY_COMPLETE | true |
| OBSERVED_FACT_AS_PREDICTION_COUNT | 0 |
| RULE_AS_PROBABILITY_COUNT | 0 |
| ARBITRARY_WEIGHTED_RISK_SCORE_COUNT | 0 |
| DECORATIVE_CONFIDENCE_PERCENTAGES | 0 |
| UNDEFINED_PREDICTION_TARGETS_ACCEPTED | 0 |
| INVENTED_PREDICTION_HORIZONS | 0 |
| KNOWN_TARGET_LEAKAGE_FEATURES_ACCEPTED | 0 |
| PREDICTION_FROM_UNBOUNDED_FRESHNESS_COUNT | 0 |
| ESTIMATED_EXPOSURE_SEMANTIC_AMBIGUITY | 0 |
| ESTIMATED_EXPOSURE_AUTHORITY | DEFERRED |
| MONEY_AUTHORITY_PRESERVED | true |
| QUALITY/PRIVACY/TENANT fail-closed | defined |
| MODEL_VALIDATION + CALIBRATION plans | defined |
| CLIENT_PREDICTIVE_BUSINESS_DERIVATION | 0 |
| LLM_PREDICTIVE_AUTHORITY | 0 |
| E7_E8_CIRCULAR | 0 |
| E9_RUNTIME_SCOPE_IN_E8A | 0 |

---

## 33. Machine status (Form B)

```
CI_E8A_PREDICTIVE_RISK_AUTHORITY_COMPLETED_EXPOSURE_DEFERRED

E8_PHASE = E8A_COMPLETE
E8_PREDICTIVE_TARGET_AUTHORITY = FROZEN
E8_ESTIMATED_EXPOSURE_AUTHORITY = DEFERRED_INSUFFICIENT_AUTHORITY
E8_MODEL_GOVERNANCE = FROZEN
E8B_READINESS = READY_FOR_PREDICTIVE_RISK_ONLY_IMPLEMENTATION
```

---

## Appendix A — Historical salvage detail

(See E8-ONBOARDING §6 and subagent archaeology report embedded in E8A commit message.)

## Appendix B — Full feature inventory

Available in E8B implementation plan; E8A freezes principles and primary features listed in §11.

## Appendix C — Unresolved blockers for estimatedExposure

1. No calibrated P(event) for money-linked outcomes on main  
2. AT-RISK exposure formula (`default_exposure_minor`) exists only in legacy design doc — not product-authoritative  
3. EXPECTED LOSS requires same-horizon, same-scope, same-currency loss base — not established  
4. Re-enabling exposure must not duplicate E3 observed overdue metrics  

E8B may proceed on **risk category only** without these blockers.
