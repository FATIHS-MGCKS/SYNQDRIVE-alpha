# Phase 3 E9A — Forecast Authority, Time-Series Contract, Baseline Salvage, Empirical Viability Freeze (2026-08)

## CI_E9A_FORECAST_AUTHORITY_COMPLETE_RUNTIME_DEFERRED

**E9A docs-only authority freeze.** No E9 backend/frontend runtime, no Prisma, no Production mutations.

Machine artifact (canonical): `docs/audits/ci-recovery/data/e9a01-forecast-timeseries-viability-2026-08.json`  
Production remote SQL (prepared, blocked): `docs/audits/ci-recovery/tooling/e9a01_production_readonly_timeseries_remote.py`

---

## 1. Entry state

| Field | Value |
|-------|-------|
| E9_ENTRY_MAIN_SHA | `2284f4ee8b367468356a54eb6670c48dd6c4dd25` |
| WORKTREE_CLEAN_AT_ENTRY | `true` |
| E9_BRANCH_FROM_CURRENT_MAIN | `true` |
| Branch | `integration/evaluations-e9-forecast-ui-2026-08` |
| E8 merged reachable | `b3f2827274cdd2011a5f999506badfb91cf225d9` (PR #1056) |
| E8_RUNTIME_DEPENDENCY_ALLOWED | `false` |
| E9_DRAFT_PR_CREATED | see commit footer |
| PR_STATE | `DRAFT` |

---

## 2. Forecast taxonomy (frozen)

| Class | Definition | May be labeled "forecast" in product? |
|-------|------------|--------------------------------------|
| **A. HISTORICAL SERIES** | Observed canonical values over time buckets | **No** — observed actuals only |
| **B. PROJECTION** | Deterministic extension of rule/trend without holdout validation | **No** — call "projection" or suppress |
| **C. BASELINE FORECAST** | Defined algorithm evaluated on historical holdout (rolling-origin) | **Yes** — when status AVAILABLE and backtest gates pass |
| **D. STATISTICAL FORECAST** | Model with validated predictive performance vs trivial baseline | **Yes** — when tier STATISTICAL and gates pass |
| **E. SCENARIO** | User/product hypothetical assumption | **No** — never actual future truth |

**Gates:** `HISTORICAL_SERIES_AS_FORECAST_COUNT=0`, `PROJECTION_AS_VALIDATED_FORECAST_COUNT=0`, `SCENARIO_AS_FORECAST_COUNT=0`

---

## 3. E9 vs E8 separation

| Dimension | E8 (Predictive Risk) | E9 (Forecast) |
|-----------|----------------------|---------------|
| Output type | Event risk category / future event probability (deferred) | Continuous, count, money, ratio time-series values |
| Target example | `FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION` | `fin.daily_issued_revenue`, `ops.fleet_utilization_pct` |
| Horizon semantics | Event window for label | Forward bucket series length |
| May use E8 output? | N/A | **Never** as target or feature |

`E8_RISK_OUTPUT_USED_AS_E9_TARGET=false`  
`E8_RISK_OUTPUT_USED_AS_E9_FEATURE=false`  
`E9_DEPENDENCY_ON_E8_RUNTIME_COUNT=0`

---

## 4. E9_CURRENT_TIMESERIES_INVENTORY (summary)

Full table in §4 of `architecture/EVALUATIONS_E9_FORECASTS_2026-08-18.md`.

### Canonical period scalars (served today)

| METRIC | SOURCE | CANONICAL | GRAIN | FORECAST_CANDIDATE |
|--------|--------|-----------|-------|-------------------|
| `fin.mtd_*` (8 metrics) | E3 `EvaluationsFinanceService` | true | MTD scalar | true (needs daily series layer) |
| `ops.fleet_utilization_pct` | E4 utilization domain | true | period scalar | true |
| `cost.*` E4 sections | E4 cost domain | true | period aggregate | moderate |
| `fc.*` (4 ids) | registry only | false | planned | output slots |

### Critical gaps

- **Multi-bucket series API count on main: 0**
- E3 finance locked to MTD regardless of analytics period selector
- `FinancialInsightsView` builds **non-canonical** daily EUR chart from raw `/invoices`
- E3 `comparison: null` — MoM detection broken
- Receivables: point-in-time only; historical reconstruction rejected
- Production: 0 ServiceCase rows (E8B0.1) — downtime series empty

`CURRENT_TIMESERIES_INVENTORY_COMPLETE=true`

---

## 5. Historical forecast branch archaeology

Branches inspected read-only:

- `origin/cursor/evaluations-baseline-forecasts-8427`
- `origin/cursor/evaluations-forecast-backtesting-8427`
- `origin/cursor/evaluations-feature-store-8427`
- `origin/cursor/evaluations-predictive-analytics-architecture-8427`

`HISTORICAL_FORECAST_SALVAGE_COMPLETE=true`

### Salvage decision matrix (selected)

| File / concept | SALVAGE_DECISION | Verdict |
|----------------|------------------|---------|
| `evaluations-forecast.contract.ts` | REUSE_CONCEPT | Target catalog, min-history gates — revalidate thresholds |
| `evaluations-baseline-forecast.ts` | PORT_WITH_REWRITE | MA14 + seasonal naive + holdout selection — E9 only |
| `evaluations-feature-time.ts` | PORT_WITH_REWRITE | Org TZ day boundaries — align E1 period resolver |
| `evaluations-feature-extraction.ts` | PORT_WITH_REWRITE | PIT cutoff — dual revenue paths need E3 alignment |
| `evaluations-backtest.shared.spec.ts` | PORT_TEST_ONLY | Rolling-origin pattern |
| `evaluations-maintenance-risk-forecast.ts` | REJECT | Uncalibrated probability — E8/E9 boundary violation |
| `GLOBAL_SEGMENT` backtest scope | REJECT | Cross-tenant pooling |
| `default_exposure_minor` | REJECT | E8A deferred estimatedExposure |
| `vehicle-forecast-engine.ts` (main rental) | REJECT | Vehicle maintenance planning — not evaluations E9 |

---

## 6. Safe MVP decision

### Candidates evaluated

| Target | Scores (1–5, higher better except privacy/money complexity) | Empirical status |
|--------|--------------------------------------------------------------|------------------|
| `fin.daily_issued_revenue` | Authority 4, depth ?, grain 5, backtest 5, money complexity 3 | INSUFFICIENT_EVIDENCE |
| `ops.fleet_utilization_pct` daily | Authority 3, partial occupancy, station fail-closed | INSUFFICIENT_EVIDENCE |

### Frozen decision

```
E9_INITIAL_FORECAST_TARGET_CANDIDATE = fin.daily_issued_revenue
E9_MVP_TARGETS = []
E9_RUNTIME_AUTHORITY = DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY
E9_SAFE_MVP_DECISION_DEFINED = true
```

**Rationale:** No defensible runtime target until (1) server canonical daily bucket series exists and (2) Production/staging proves min-history for rolling-origin backtest. Platform cross-ref (E8B0.1): 4 orgs, 9 vehicles — sparse.

---

## 7. Observation timestamp authority (frozen for candidate)

| Field | Value |
|-------|-------|
| OBSERVATION_TIME_FIELD | `COALESCE(invoiceDate, createdAt)` for revenue; booking `startDate`/`endDate` for utilization |
| EVENT_TIME_OR_RECORD_TIME | **Event/business time** (invoice business date, booking interval) |
| TIMEZONE_AUTHORITY | E1 `EvaluationsTimezoneContext` — org → station → platform fallback |
| BUCKET_BOUNDARY | `[start, endExclusive)` local calendar day in effectiveTimezone |
| DAY_BOUNDARY | Local midnight via E1 period resolver (not server-local) |

`AMBIGUOUS_FORECAST_TIMEZONE=0`

---

## 8. Time grain authority

| Grain | DATA_DENSITY | BUSINESS_MEANING | BACKTEST_SUPPORT | Decision |
|-------|--------------|------------------|------------------|----------|
| DAILY | Required for revenue/utilization MVP | Natural ops/finance rhythm | Rolling-origin daily folds | **FORECAST_GRAIN=DAILY** (when authorized) |
| WEEKLY | Derivable from daily | Smoother ops view | Requires daily authority first | deferred |
| MONTHLY | E3 MTD exists as scalar | Finance reporting | Do not aggregate daily forecast into monthly without authority | deferred |

---

## 9. Forecast horizon authority

Salvage lists 7/30/60/90d — **not copied without empirical proof.**

| Field | Value |
|-------|-------|
| FORECAST_HORIZON | **NONE** (runtime deferred) |
| Future narrow MVP (when authorized) | Start with **7 daily buckets** only after backtest proves ≥4 folds |
| INVENTED_FORECAST_HORIZON_COUNT | 0 |

---

## 10. History / lookback authority

| Field | Value |
|-------|-------|
| LOOKBACK_WINDOW | NOT_AUTHORIZED_UNTIL_EMPIRICAL |
| Salvage reference (revalidate) | Revenue rule 180d / stat 365d; utilization rule 14d / stat 60d |
| MIN_HISTORY_BEHAVIOR | `INSUFFICIENT_EVIDENCE` — never emit zero forecast merely because history absent |

---

## 11. Missing time bucket semantics

| Semantics | Meaning | Example |
|-----------|---------|---------|
| NO_ACTIVITY_ZERO | Legitimate zero count/amount | Zero bookings on closed day |
| MISSING_DATA | Ingestion/authority gap | Unknown — status UNAVAILABLE/PARTIAL |
| NOT_APPLICABLE | Scope excludes bucket | Station finance unsupported |

`MISSING_BUCKET_AS_ZERO_COUNT=0` (unless source proves zero semantics)

---

## 12. Closed-bucket rule

| Field | Value |
|-------|-------|
| BUCKET_COMPLETE_AT | End of local calendar day `endExclusive` in org timezone |
| CURRENT_PARTIAL_BUCKET_BEHAVIOR | **Exclude from training/backtest**; may show as PARTIAL observed only |
| PARTIAL_CURRENT_BUCKET_USED_AS_COMPLETE | 0 |

---

## 13. Data as-of / leakage authority

| Field | Semantics |
|-------|-----------|
| `forecastAsOf` | UTC instant — evaluation anchor |
| `featureCutoffAt` | Last instant historical inputs allowed |
| `forecastStart` | First forward bucket (strictly after cutoff) |
| `forecastEnd` | Exclusive end of forward window |

Historical inputs: `<= featureCutoffAt`. Forecast targets: `> featureCutoffAt`.  
`FUTURE_INFORMATION_LEAKAGE_ALLOWED=false`

---

## 14. Baseline forecast methods evaluated

| METHOD | FORMULA | SAFE_FOR_MVP (future) | Selected |
|--------|---------|----------------------|----------|
| LAST_OBSERVED_VALUE | `y_hat = y_last` | Yes — required trivial baseline | **Required comparator** |
| SEASONAL_NAIVE_DOW | weekday mean of history | Only if WEEKLY_SEASONALITY_SUPPORTED | conditional |
| MA(7/14) | rolling mean | Yes after revalidation | candidate secondary |
| Seasonal naive weekly | week-of-year mean | REQUIRES_REVALIDATION (weak week key in salvage) | no |
| Linear trend extrapolation | unbounded slope | No without clamp validation | no |
| ML / LLM | — | **Forbidden** | no |

**SELECTED_BASELINE (when E9B authorized):** LAST_OBSERVED_VALUE gate + MA(14) if beats trivial on holdout

`WEEKLY_SEASONALITY_SUPPORTED=NOT_PROVEN`  
`MONTHLY_SEASONALITY_SUPPORTED=NOT_PROVEN`

---

## 15. Backtest design

- **Rolling-origin / walk-forward** — origin every 7 days, max 12 origins
- `training_end < forecast_start` per fold
- Minimum folds: 4 (`BACKTEST_MIN_FOLDS`)
- Compare against LAST_OBSERVED_VALUE; seasonal naive when seasonality proven
- Metrics: MAE, RMSE, WAPE/MASE where denominator valid — **not MAPE when zero actuals**
- `INVALID_ZERO_DENOMINATOR_METRIC_USE=0`
- `FORECAST_TARGET_LEAKAGE_COUNT=0`

`BACKTEST_PLAN_DEFINED=true`  
`BASELINE_COMPARISON_DEFINED=true`

---

## 16. Forecast intervals / confidence

`FORECAST_INTERVAL_AUTHORITY=NOT_AUTHORIZED`  
No ±10% decorative bands. Salvage residual-std intervals require revalidation + backtest PIC coverage.  
`ARBITRARY_FORECAST_INTERVAL_COUNT=0`

---

## 17. Money forecast authority

- Reuse E1/E3: `amountMinor`, explicit `currency`
- Forecast per currency separately; mixed → suppress aggregate
- `MIXED_CURRENCY_FORECAST_SUM_COUNT=0`

---

## 18. Quality fail-closed matrix

| Dimension | Closed historical bucket | Live partial bucket |
|-----------|-------------------------|---------------------|
| FRESHNESS UNKNOWN | May not block if event timestamps closed | **MUST_SUPPRESS** forecast |
| COMPLETENESS partial | PARTIAL status; no AVAILABLE forecast | MUST_SUPPRESS |
| PROVENANCE missing | UNAVAILABLE | UNAVAILABLE |
| VALIDITY fail | UNAVAILABLE | UNAVAILABLE |
| TEMPORAL_APPLICABILITY | Bucket must be complete | Partial → exclude from train |

`QUALITY_FAIL_CLOSED_DEFINED=true`

---

## 19. Scope authority

- **E9 MVP scope:** ORGANIZATION_ONLY
- Station forecast: **NOT_AUTHORIZED** until point-in-time station attribution exists (E3 finance already fail-closed station)
- `PERSON_LEVEL_FORECAST_TARGET_COUNT=0`

---

## 20. Forecast contract proposal (not implemented)

Conceptual `EvaluationsForecastResponse` — see architecture doc §Contract.

Key fields: `schemaVersion`, `forecastContractVersion`, `calculationVersion`, `methodVersion`, `generatedAt`, `forecastAsOf`, `scope`, `target`, `unit`, `grain`, `horizon`, `historyPeriod`, `forecastPeriod`, `status`, `series[]`, `quality`, `provenance`, `method`, `backtestSummary`, `interval` (nullable)

Series point: `{ bucketStart, bucketEnd, value, kind: OBSERVED|FORECAST, status }`  
`OBSERVED_FORECAST_POINT_AMBIGUITY=0`

`FORECAST_CONTRACT_PROPOSED=true`

---

## 21. Frontend / API / UX authority (freeze only)

| Layer | Owns |
|-------|------|
| Backend | Bucketing, target, history, algorithm, values, quality, method, status |
| Frontend | Presentation, formatting, chart interaction, a11y labels |

**API proposal:** `GET /organizations/:orgId/evaluations/analytics/insights/forecasts?target=...&forecastAsOf=...`  
Guards: OrgScopingGuard, RolesGuard, PermissionsGuard, EvaluationsAnalyticsFeatureGuard, EvaluationsAnalyticsScopeService

**Page placement:** `EvaluationsPage` / `financial-insights` — new section after Utilization or Finance (E9C)  
**UX states:** loading, available, partial, insufficient history, unavailable, error  
**Accessibility:** textual summary, non-color-only observed/forecast distinction, keyboard, reduced motion

---

## 22. Persistence & data access

| Decision | Value |
|----------|-------|
| E9_PERSISTENCE_DECISION | **DERIVED_ON_READ** (no Prisma in E9A) |
| Cache | Ephemeral optional in E9B — not precomputed snapshots until proven |

**E9_DATA_ACCESS_PLAN:** E3 invoice repository + E4 booking/serviceCase interval queries → single org-scoped batch per target; bucket in server using E1 resolver; ~2–4 queries per request; series length ≤ 400 daily points; no per-vehicle N+1

---

## 23. Empirical viability audit

| Attempt | Result |
|---------|--------|
| Production read-only SQL | **Blocked** — SSH publickey denied from Cloud Agent |
| Cross-reference E8B0.1 | ORG=4, VEHICLE=9, SERVICE_CASE=0 |
| Fresh bucket counts | **Not captured** |

Per-candidate empirical fields remain null in JSON artifact. Blockers listed in outcome.

---

## 24. E9 phase topology

| Phase | Status |
|-------|--------|
| E9A | ✅ COMPLETE (this document) |
| E9B | NOT_READY — requires bucket API + empirical history |
| E9C | Blocked by E9B |
| E9D | Blocked |
| E9D-DEFER | **Candidate** if re-entry criteria not met |

---

## 25. E9B/C/D test matrix (frozen count)

**47 test categories** documented in architecture §Test Matrix covering: tenant/station isolation, RBAC, timezone/DST, bucket boundaries, closed/partial buckets, zero vs missing, insufficient history, leakage, rolling backtest, baselines, money multi-currency, status semantics, determinism, versioning, observed vs forecast, no E8, no LLM, no frontend derivation, transport errors, responsive/a11y, E7/E8 regression.

---

## 26. E9A acceptance matrix

| Gate | Value |
|------|-------|
| E9_BRANCH_FROM_CURRENT_MAIN | true |
| E9_DRAFT_PR_CREATED | true |
| CURRENT_TIMESERIES_INVENTORY_COMPLETE | true |
| HISTORICAL_FORECAST_SALVAGE_COMPLETE | true |
| FORECAST_TAXONOMY_FROZEN | true |
| E8 independence gates | all pass (see JSON) |
| Taxonomy / leakage / interval gates | all pass |
| FORECAST_CONTRACT_PROPOSED | true |
| BACKTEST_PLAN_DEFINED | true |
| E9_PERSISTENCE_DECISION_DEFINED | true |
| E9_DATA_ACCESS_PLAN_DEFINED | true |
| E9_SAFE_MVP_DECISION_DEFINED | true |
| E9A_BACKEND_RUNTIME_CHANGES | 0 |
| E9A_FRONTEND_RUNTIME_CHANGES | 0 |
| E9A_SHARED_RUNTIME_CHANGES | 0 |
| PRISMA_CHANGES | 0 |
| MIGRATION_CHANGES | 0 |
| PRODUCTION_MUTATIONS | 0 |
| PR_STATE | DRAFT |

---

## 27. Machine outcome

```
CI_STATUS = CI_E9A_FORECAST_AUTHORITY_COMPLETE_RUNTIME_DEFERRED
E9_PHASE = E9A_COMPLETE
E9_FORECAST_AUTHORITY = DEFINED
E9_RUNTIME = DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY
E9_E8_RUNTIME_DEPENDENCY = NONE
E9B_READINESS = NOT_READY
```

**Exact data blockers:** see §6 and JSON artifact `outcome.blockers`.

---

## 28. Commit footer (updated at push)

| Field | Value |
|-------|-------|
| E9A_ENTRY_HEAD_SHA | `2284f4ee8b367468356a54eb6670c48dd6c4dd25` |
| E9A_FINAL_HEAD_SHA | `48b6fba1` |
| E9A_COMMIT_SHA | `844f44ba` |
| E9_PR_NUMBER | **1059** |
| E9_PR_URL | https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1059 |
| PR_IS_DRAFT | true |
