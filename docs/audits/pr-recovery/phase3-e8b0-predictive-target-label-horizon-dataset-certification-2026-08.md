# Phase 3 E8B0 — Predictive Target Label / Horizon / Point-in-Time Dataset Certification (2026-08)

## Purpose

E8A (Form B) froze predictive risk governance but explicitly deferred empirical certification of:

1. reconstructible **target label** authority,
2. **horizon** product authority,
3. **point-in-time (PIT)** feature/label dataset integrity.

E8B0 performs that certification. **No runtime implementation.**

Machine artifact: `docs/audits/ci-recovery/data/e8b0-predictive-target-certification-2026-08.json`  
Harness: `docs/audits/ci-recovery/tooling/e8b0_predictive_target_certification.py`

---

## 1. Entry state

| Field | Value |
|-------|-------|
| E8B0_ENTRY_HEAD_SHA | `9501a985d06e2ef7e59f37299e7adbb387f1de52` |
| E8B0_FINAL_HEAD_SHA | *(set at commit)* |
| CURRENT_BRANCH | `integration/evaluations-e8-predictive-risk-2026-08` |
| CURRENT_MAIN_SHA | `bd732a8f7a6467565a8668ea136e81b79a04666a` |
| WORKTREE_CLEAN_AT_ENTRY | `true` |
| E8A_ANCESTOR | `true` |
| Commits after E8A at entry | `0` |

---

## 2. Draft PR verification

| Field | Value |
|-------|-------|
| E8_DRAFT_PR_VERIFIED | `true` *(after repair — see commit)* |
| E8_PR_NUMBER | *(set after PR create)* |
| E8_PR_URL | *(set after PR create)* |
| PR repair required | **yes** — E8A failed to create PR; E8B0 created Draft PR |

---

## 3. E8A Form B preserved

| Authority | E8B0 status |
|-----------|-------------|
| estimatedExposure | **DEFERRED_INSUFFICIENT_AUTHORITY** — unchanged |
| eventProbability | **ABSENT** |
| numeric confidence | **ABSENT** |
| LLM predictive authority | **FORBIDDEN** |
| E9 forecast | **EXCLUDED** |
| driver person-level prediction | **EXCLUDED_FROM_MVP** |
| persistence | **DERIVED_ON_READ** candidate |

---

## 4. ServiceCase domain audit

### Prisma model (read-only)

`ServiceCase` fields audited: `category`, `status`, `source`, `openedAt`, `scheduledAt`, `expectedReadyAt`, `completedAt`, `cancelledAt`, `downtimeStart`, `downtimeEnd`, `blocksRental`, `createdAt`, `updatedAt`.

Enums: `ServiceCaseCategory` (9 values), `ServiceCaseStatus` (7 values), `ServiceCaseSource` (8 values). **No `unplanned` enum or field.**

### Create / update paths

| Path | Behavior |
|------|----------|
| `service-cases.service.ts#create` | Sets `status = SCHEDULED` if `scheduledAt` provided else `OPEN`; `blocksRental` default false |
| `service-cases.service.ts#update` | Mutates category, status, scheduledAt, downtimeStart/End, blocksRental |
| `service-cases.service.ts#complete` | Terminal COMPLETED; sets completedAt, downtimeEnd default now |
| `service-cases.service.ts#cancel` | Terminal CANCELLED; sets cancelledAt |
| Health/DTC conversion | No dedicated ServiceCase factory found beyond generic create with `source` param |
| Task linkage | `OrgTask.serviceCaseId` optional; `assertCaseAccessible` blocks completed/cancelled |

### E4 reads

`evaluations-insights.repository.ts#loadUtilizationFacts`:

- ServiceCase filter: `blocksRental: true`, downtime overlap with window
- **Skips** rows missing `downtimeStart` OR `downtimeEnd`
- Vehicle eligibility: `createdAt < window.endExclusive`

### SERVICE_CASE_LABEL_AUTHORITY_MATRIX

| FIELD | IMMUTABLE | KNOWN_AT_CREATION | CAN_CHANGE_AFTER_CREATION | HISTORICAL_CHANGE_LOG | PIT_RECONSTRUCTIBLE | SAFE_AS_FEATURE | SAFE_AS_POST_HORIZON_LABEL |
|-------|-----------|-------------------|---------------------------|----------------------|---------------------|-----------------|---------------------------|
| category | false | true | true | false | false | true | true |
| status | false | true | true | false | false | false | true |
| source | false | true | true | false | false | false | true |
| scheduledAt | true* | false | true | false | false | false | false |
| openedAt | true | true | false | false | true | true | true |
| createdAt | true | true | false | false | true | true | false |
| blocksRental | false | true | true | false | false | false | true |
| downtimeStart | true* | false | true | false | false | false | true |
| downtimeEnd | true* | false | true | false | false | false | true |
| cancelledAt | true* | false | true | false | true | false | true |
| completedAt | true* | false | true | false | true | false | true |

\*Immutable once set in normal flow, but may be null at creation and populated later.

---

## 5. Prove or reject “unplanned”

| Result | Value |
|--------|-------|
| UNPLANNED_LABEL_CANONICAL | **false** |

**Findings:**

- No ServiceCase field, enum, or service rule defines “unplanned”.
- `UNPLANNED_MAINTENANCE` exists only as **E4 cost category** label (`evaluations-cost.domain.ts`); E4 reports it as `UNAVAILABLE` (`SERVICECASE_COST_CURRENCY_UNPROVEN`).
- Forbidden proxies **not** authorized on main:
  - `scheduledAt == null` ⇒ unplanned — **rejected** (reactive cases may still be scheduled later)
  - `source != SERVICE_COMPLIANCE` ⇒ unplanned — **rejected**
  - `source in {HEALTH,DTC}` ⇒ unplanned — **rejected**
  - `category == REPAIR` ⇒ unplanned — **rejected**
  - `blocksRental == true` ⇒ unplanned — **rejected**

**E8A target name `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` is corrected in E8B0.**

---

## 6. Certified fallback target

| Field | Frozen value |
|-------|--------------|
| TARGET_NAME | **`FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION`** |
| QUALIFYING_CATEGORIES | All `ServiceCaseCategory` enum values |
| QUALIFYING_SOURCES | All `ServiceCaseSource` enum values (source does not define outcome) |
| QUALIFYING_STATUSES | Any except `CANCELLED` at label finalization |
| REQUIRE_BLOCKS_RENTAL | `true` at label finalization |
| OPEN_EVENT_TIMESTAMP | `openedAt` — case must **open** after `predictionAsOf` |
| DOWNTIME_EVENT_TIMESTAMP | `downtimeStart` — must fall in `(predictionAsOf, horizonEnd]` |
| CANCELLED_BEHAVIOR | Exclude from positive label |
| MISSING_DOWNTIME_BEHAVIOR | **NOT_POSITIVE** — null ≠ no event (matches E4 utilization skip semantics) |

**Label predicate (frozen):**

```
organizationId in scope
AND openedAt > predictionAsOf AND openedAt <= horizonEnd
AND status != CANCELLED at labelFinalizationAt
AND blocksRental == true at labelFinalizationAt
AND downtimeStart IS NOT NULL
AND downtimeStart > predictionAsOf AND downtimeStart <= horizonEnd
```

| Guard | Value |
|-------|-------|
| TARGET_LABEL_USES_FUTURE_OUTCOME_ONLY_AS_LABEL | true |
| TARGET_LABEL_USES_FUTURE_OUTCOME_AS_FEATURE | false |

---

## 7. Target event timestamp authority

| Role | Timestamp | Why |
|------|-----------|-----|
| New case entry | `openedAt` | Case must arise after cutoff |
| Outcome / disruption | `downtimeStart` | E4 utilization authoritative blocking signal requires downtime interval |
| Label finalization | `labelFinalizationAt = max(horizonEnd, observationEnd)` | Uses final post-horizon truth; late-added downtimeStart allowed |

**TARGET_EVENT_TIMESTAMP:** `downtimeStart` (primary outcome time); `openedAt` gates eligibility.

---

## 8. Point-in-time mutability audit

Mutable without complete history: `status`, `category`, `source`, `scheduledAt`, `blocksRental`, `downtimeStart`, `downtimeEnd`, `Vehicle.homeStationId`, `Vehicle.currentStationId`, `Vehicle.status`.

| Result | Value |
|-------|-------|
| PIT_MUTABLE_FIELD_INVENTORY_COMPLETE | **true** |

**Rule:** Do not reconstruct historical scheduled/unplanned/blocksRental state from today's row values.

---

## 9. ServiceCase history authority

Searched: `ServiceCaseEvent`, activity/audit logs, `TaskEvent`, `BusinessAuditOutbox`, change history.

| Source | ServiceCase field history | Complete | Tenant scoped |
|--------|--------------------------|----------|---------------|
| ServiceCaseEvent | N/A — **model absent** | — | — |
| TaskEvent | Task lifecycle only | partial | yes |
| BusinessAuditOutbox | Generic business events | not ServiceCase-field granular | yes |
| ServiceCaseComment | comments only | no field history | yes |

| Result | Value |
|-------|-------|
| SERVICE_CASE_POINT_IN_TIME_HISTORY | **LIMITED** |

---

## 10. Station-scope historical authority

| Field | PIT reconstructible |
|-------|---------------------|
| HOME_STATION_PIT_RECONSTRUCTIBLE | **false** (mutable `Vehicle.homeStationId`) |
| CURRENT_STATION_PIT_RECONSTRUCTIBLE | **false** (mutable snapshot) |
| EXPECTED_STATION_PIT_RECONSTRUCTIBLE | **true** via `VehicleStationTransfer.plannedAt` / `arrivedAt` with caveats |

Partial history exists but is **not complete** for all vehicles/stations.

| Result | Value |
|-------|-------|
| PREDICTION_SCOPE | **ORGANIZATION_ONLY** |
| Station filtering | **NOT_SUPPORTED_FOR_E8_MVP** |

---

## 11. Fleet membership at cutoff

E4 pattern: `vehicle.createdAt < cutoff`.

| Result | Value |
|-------|-------|
| HISTORICAL_FLEET_DENOMINATOR_AUTHORITY | **FROZEN** |
| Rule | Vehicles with `createdAt < predictionAsOf` and not provably removed before cutoff (`deletedAt` if present) |
| Caveat | Vehicle deletion/archive timestamps incomplete — denominator may be biased |

Do **not** use current `Vehicle.status` retroactively.

---

## 12–13. Horizon certification & product authority

Evaluated horizons: `NEXT_7_DAYS`, `NEXT_30_DAYS`, `NEXT_90_DAYS` on synthetic rolling-origin harness.

| Horizon | Classification | Notes |
|---------|----------------|-------|
| NEXT_7_DAYS | EMPIRICALLY_VIABLE (synthetic) | Lower label count; higher variance |
| NEXT_30_DAYS | EMPIRICALLY_VIABLE (synthetic) | Recommended balance |
| NEXT_90_DAYS | EMPIRICALLY_VIABLE (synthetic) | Longer censoring; fewer valid cutoffs |

| Field | Value |
|-------|-------|
| RECOMMENDED_HORIZON | **NEXT_30_DAYS** |
| HORIZON_PRODUCT_AUTHORITY | **REQUIRES_EXPLICIT_PRODUCT_APPROVAL** |
| E8B_RUNTIME_BLOCKER | **HORIZON_PRODUCT_AUTHORITY** |

No product/domain rule on main explicitly authorizes 30-day predictive maintenance horizon (E8A cited salvage only).

**PREDICTION_HORIZON frozen for technical certification only — not runtime authorized.**

---

## 14. Empirical dataset audit

| Field | Value |
|-------|-------|
| Dataset authority | **SYNTHETIC_SANITIZED_REPRESENTATIVE** |
| Production read-only | **not used** (`DATABASE_URL` unavailable in certification environment) |
| Production mutations | **0** |

| Metric | Value |
|--------|-------|
| OBSERVATION_START | `2025-01-01T00:00:00Z` |
| OBSERVATION_END | `2026-01-01T00:00:00Z` |
| ORG_COUNT | 3 (pseudonymized) |
| SERVICE_CASE_COUNT | 7 |
| QUALIFYING_LABEL_COUNT | 5 |
| LABEL_RATE (illustrative 30d @ 2025-06-01) | see JSON |
| VEHICLE_HISTORY_COVERAGE | 1.0 |
| DOWNTIME_FIELD_COVERAGE | see JSON |
| BLOCKS_RENTAL_COVERAGE | see JSON |

---

## 15–17. Label completeness, stability, censoring

| Topic | Decision |
|-------|----------|
| LABEL_NULL_SEMANTICS_DEFINED | **true** |
| downtimeStart null | NOT_POSITIVE |
| blocksRental false | negative even if downtime exists |
| cancelled | excluded at finalization |
| LABEL_FINALIZATION_TIME | post-horizon final field truth |
| RIGHT_CENSORED_WINDOWS_TREATED_AS_NEGATIVE | **0** (excluded cutoffs within `horizonDays` of observation end) |

---

## 18. Rolling-origin dataset

Deterministic harness: 14-day step, org-scoped samples.

| Guard | Value |
|-------|-------|
| FUTURE_FEATURE_ROWS | **0** (with PIT filters) |
| LABEL_WINDOW_OVERLAP_WITH_FEATURE_WINDOW | **0** |

---

## 19–22. Feature PIT certification

| Feature | PIT_RECONSTRUCTIBLE | SAFE_FOR_MODEL |
|---------|---------------------|----------------|
| trailing_blocking_case_count_90d | **false** | **false** |
| trailing_open_case_count_90d | **true** | **true** |
| fleet_critical_health_count | **false** | **false** |
| fleet_vehicle_count | **true** | **true** |

| Guard | Value |
|-------|-------|
| LIVE_UNBOUNDED_FRESHNESS_FEATURES_ACCEPTED | **0** |
| E7_RECOMMENDATION_FEATURE_COUNT | **0** |
| DRIVER_FEATURE_COUNT | **0** |
| DRIVER_IDENTITY_LOOKUPS | **0** |

**PIT_FEATURE_SET (frozen candidate):** `trailing_open_case_count_90d`, `fleet_vehicle_count` only until health history exists.

---

## 23–24. Base rate & temporal split

Chronological split (synthetic):

| Split | Window |
|-------|--------|
| TRAIN | 2025-01-01 → 2025-07-01 |
| VALIDATION | 2025-07-01 → 2025-10-01 |
| TEST | 2025-10-01 → 2026-01-01 |

Base rates per split in JSON artifact. No test-set optimization.

---

## 25. Tenant generalization

3 pseudonymized orgs in synthetic data — **too few** for Production generalization claims. Strategy remains `GLOBAL_POLICY_WITH_TENANT_SCOPED_FEATURES` with org-scoped queries (E2 preserved).

---

## 26. Target / feature leakage tests

Automated negative tests in harness:

| Test | Result |
|------|--------|
| Future ServiceCase → trailing feature | PASS |
| Horizon case → vehicle count | PASS |
| Post-cutoff downtimeStart → pre-cutoff feature | PASS |
| Post-cutoff mutation without history | documented FAIL-CLOSED |
| Future booking → historical feature | PASS |
| E7 recommendation → feature | PASS (count=0) |
| Current station without history | documented NOT_SUPPORTED |

| Result | Value |
|-------|-------|
| TARGET_LEAKAGE_TEST_FAILURES | **0** |

---

## 27. Risk category threshold authority

| Field | Value |
|-------|-------|
| THRESHOLD_SOURCE | **NO_THRESHOLD_AUTHORITY** |
| THRESHOLD_VALUE | null |
| E8_RISK_CATEGORY_THRESHOLD_AUTHORITY | **REQUIRES_PRODUCT_APPROVAL** |

ELEVATED/NORMAL split cannot be defended without product policy or TRAIN/VALIDATION-only empirical threshold study on Production-scale data.

---

## 28–31. Probability, baseline, cold start, min sample

| Guard | Value |
|-------|-------|
| EVENT_PROBABILITY_RUNTIME_AUTHORITY | **false** |
| UNVALIDATED_SCORE_AS_PROBABILITY | **0** |
| MIN_SAMPLE_AUTHORITY | **UNRESOLVED** |
| COLD_START behavior | **INSUFFICIENT_EVIDENCE** |
| COLD_START_AS_NORMAL_COUNT | **0** |

Baseline comparison (TEST split, 30d horizon): see JSON — simple trailing-open-case indicator vs always-NORMAL.

---

## 32. Quality / status gate (frozen)

| Input status | Predictive output |
|--------------|-------------------|
| AVAILABLE + sufficient certified history | candidate **RISK_CATEGORY** allowed |
| PARTIAL | **MUST_SUPPRESS** |
| STALE | **MUST_SUPPRESS** |
| UNAVAILABLE / ERROR | **MUST_SUPPRESS** |
| FRESHNESS UNKNOWN + live-dependent feature | **MUST_SUPPRESS** |
| Cold start | **INSUFFICIENT_EVIDENCE** |

---

## 33. Target name correction (E8B0 POST-E8A EMPIRICAL CERTIFICATION)

| E8A (preserved as historical decision) | E8B0 certified |
|----------------------------------------|----------------|
| `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` | **`FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION`** |

Reason: no canonical unplanned classification; blocking downtime semantics are authoritative via E4.

---

## 34–36. Scope, horizon, runtime re-entry

| Authority | E8B0 status |
|-----------|-------------|
| TARGET_LABEL | **FROZEN** |
| TARGET_EVENT_TIME | **FROZEN** (`downtimeStart` + `openedAt` gate) |
| PREDICTION_SCOPE | **FROZEN** (`ORGANIZATION_ONLY`) |
| PREDICTION_HORIZON | **NOT RUNTIME FROZEN** — requires product approval |
| PIT_FEATURE_SET | **FROZEN** (limited set) |
| MIN_HISTORY / COLD_START | **FROZEN** (`INSUFFICIENT_EVIDENCE`) |
| CATEGORY_THRESHOLD_AUTHORITY | **REQUIRES_PRODUCT_APPROVAL** |
| QUALITY_GATE | **FROZEN** |

**E8B runtime blocked until:** `HORIZON_PRODUCT_AUTHORITY` and `E8_RISK_CATEGORY_THRESHOLD_AUTHORITY` explicitly approved.

Still prohibited: eventProbability, confidenceScore, estimatedExposure.

---

## 37. estimatedExposure remains deferred

| Field | Value |
|-------|-------|
| E8_ESTIMATED_EXPOSURE_AUTHORITY | **DEFERRED_INSUFFICIENT_AUTHORITY** |
| E8B0_ESTIMATED_EXPOSURE_FIELDS | **0** |

---

## 38. Runtime change guard

| Guard | Value |
|-------|-------|
| BACKEND_RUNTIME_CHANGED | **false** |
| FRONTEND_RUNTIME_CHANGED | **false** |
| SHARED_RUNTIME_CHANGED | **false** |
| PRISMA_CHANGED | **false** |
| MIGRATIONS_CHANGED | **false** |
| Production mutation count | **0** |

---

## 39. Outcome — Form B (Product Decision Required)

```
CI_E8B0_PREDICTIVE_DATASET_CERTIFIED_PRODUCT_AUTHORITY_REQUIRED
E8_PHASE = E8B0_COMPLETE
E8_TARGET_LABEL_AUTHORITY = FROZEN
E8_PIT_DATASET_AUTHORITY = CERTIFIED
E8_HORIZON_AUTHORITY = REQUIRES_PRODUCT_APPROVAL
E8_SCOPE_AUTHORITY = FROZEN
E8_RISK_CATEGORY_THRESHOLD_AUTHORITY = REQUIRES_PRODUCT_APPROVAL
E8B_READINESS = NOT_READY_PENDING_PRODUCT_AUTHORITY
EVENT_PROBABILITY_AUTHORITY = NOT_AUTHORIZED
E8_ESTIMATED_EXPOSURE_AUTHORITY = DEFERRED_INSUFFICIENT_AUTHORITY
```

### Product decisions required before E8B runtime

1. **Authorize prediction horizon** — recommend `NEXT_30_DAYS` with evidence in JSON.
2. **Authorize ELEVATED/NORMAL threshold policy** — or approve empirical derivation protocol on TRAIN/VALIDATION only.

### Blockers **not** preventing technical certification

- ~~NO_CANONICAL_UNPLANNED_LABEL~~ → resolved via target rename
- ~~NO_POINT_IN_TIME_SERVICECASE_HISTORY~~ → mitigated via limited feature set + label finalization semantics; history remains LIMITED
- ~~NO_HISTORICAL_STATION_AUTHORITY~~ → resolved via ORG-only scope

---

## 40. Files changed (E8B0)

| Path | Role |
|------|------|
| `docs/audits/pr-recovery/phase3-e8b0-predictive-target-label-horizon-dataset-certification-2026-08.md` | This document |
| `docs/audits/ci-recovery/data/e8b0-predictive-target-certification-2026-08.json` | Machine artifact |
| `docs/audits/ci-recovery/tooling/e8b0_predictive_target_certification.py` | Deterministic harness |
| `docs/audits/pr-recovery/E8-ONBOARDING.md` | Updated phase status |
| `architecture/EVALUATIONS_E8_PREDICTIVE_RISK_2026-08-17.md` | E8B0 certification addendum |
| `frontend/src/master/components/ChangesView.tsx` | V4.9.900 entry |
| `frontend/src/master/components/ArchitekturView.tsx` | E8B0 architecture note |

---

## Appendix A — E8B0 vs E8A (non-deceptive correction)

E8A correctly froze Form B governance (no exposure, no probability). E8B0 **does not reopen** those decisions. It empirically certifies that E8A's **target name** (`unplanned`) lacks domain authority and replaces it with **`FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION`** per E4 blocking downtime semantics.
