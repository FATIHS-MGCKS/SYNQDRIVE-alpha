# M3.3C.0 — Retention curve + charge opportunity (shadow) preflight

**Date:** 2026-09-22  
**Mode:** architecture + read-only repository/production analysis  
**Normative roadmap:** `M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md`  
**Reopening authority:** `M3_3_B1_2Y3D_1_SECTION_13_CLOSURE_M3_3C_REOPENING_2026-09-22.md`

## Scope gate

| Field | Value |
|-------|-------|
| `M3_3C_SCOPE_RETENTION_CURVE` | **YES** (shadow session features) |
| `M3_3C_SCOPE_CHARGE_OPPORTUNITY` | **YES** (context enum + raw features) |
| `LONGITUDINAL_PROFILE_OUT_OF_SCOPE` | **YES** → **M3.3D** |
| `HEALTH_SCORE_CHANGE_OUT_OF_SCOPE` | **YES** → **M3.3E** |
| `FAILURE_RISK_OUT_OF_SCOPE` | **YES** → **M3.3E** |
| `PUBLICATION_CHANGE_OUT_OF_SCOPE` | **YES** |
| `AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED` | **NO** (this phase) |
| `M3_3C_AUTHORITATIVE_CUTOVER_AUTHORIZED` | **NO** (M3.3G remains future gate) |

---

## 1 — Architecture map (M3.3C-relevant)

```
DIMO snapshot / LV ingest
  → BatteryMeasurement (immutable rows)
  → BatteryV2SnapshotObservationProducer (STALE_REPLAY vs NEW_OBSERVATION)
  → ProviderObservabilityGapService (NOT a voltage/rest sample)
  → GeneralizedEvidenceCaptureService
       → classify (generalized-evidence-classification.policy.ts)
       → BatteryGeneralizedEvidenceObservation (immutable)
       → BatteryRestSessionService (lifecycle + validRestObservationCount)
            → BatteryRestSession (lifecycle only today)

Parallel authoritative paths (M3.3C must NOT write):
  → LV REST_60M / REST_6H targets → BatteryFeatures upsert → assessment → publication
  → BatteryRetentionAggregate (raw measurement SESSION/DAILY delete rollups — NOT rest-session features)
```

**Isolation today:** No `BatteryRestSessionFeature` entity; assessment/publication code does not read rest-session feature payloads (nothing exists). M3.3C must remain behind a dedicated shadow flag (proposed: `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED`, default **OFF**).

---

## 2 — Current model inventory (code/schema)

| Entity | M3.3C role today |
|--------|------------------|
| `BatteryRestSession` | Lifecycle: anchor, trip link, counts, status/endReason — **no feature JSON** |
| `BatteryGeneralizedEvidenceObservation` | Immutable evidence; `actualRestAgeMs`, `restSessionId`, `evidenceClass` |
| `BatteryMeasurement` | Immutable LV/state measurements |
| `BatteryFeatures` | **Per-vehicle operational** REST_60M/6H + SOH scalars — **not** session retention authority |
| `BatteryAssessment` / publication | Authoritative health — **no M3.3C inputs** |
| `BatteryRetentionAggregate` | Pre-delete **measurement** rollups — wrong semantic home for M3.3C curve |
| `VehicleTrip` | Duration, distance, temps — charge-context window |

```
REST_SESSION_FEATURE_STORAGE_EXISTS=NO
RETENTION_CURVE_STORAGE_EXISTS=NO
CHARGE_OPPORTUNITY_STORAGE_EXISTS=NO
```

---

## 3 — Storage design comparison

| Criterion | A — JSON on `BatteryRestSession` | B — `BatteryRestSessionFeature` (versioned rows) | C — reuse `BatteryRetentionAggregate` |
|-----------|-----------------------------------|-----------------------------------------------------|----------------------------------------|
| Append-only audit | Weak (UPDATE overwrites) | **Strong** | Mixed (UPDATE summary JSON) |
| Recompute / modelVersion | Overwrites prior JSON | **New row per digest** | Overwrites bucket summary |
| Idempotency | Hard on concurrent workers | **Unique (sessionId, modelVersion, inputDigest)** | Bucket key collision |
| Lineage to GE/measurement IDs | Must embed in JSON each time | **First-class columns + JSON summary** | Measurement-centric only |
| M3.3D aggregation | Awkward | **Natural feed** | Wrong bucket type |
| Explainability | OK if disciplined | **Best** | Poor for rest ladder |

**Recommendation:** **B — immutable/versioned `BatteryRestSessionFeature` (shadow) entity**  
Rationale: session lifecycle row stays stable; feature recomputation is append-only; aligns with repository idempotency patterns (`gen-ev:…`, `rest-session:…`) and future M3.3D longitudinal reads without mutating `BatteryFeatures`.

```
RECOMMENDED_STORAGE_MODEL=B_BATTERY_REST_SESSION_FEATURE_VERSIONED
SCHEMA_CHANGE_REQUIRED=YES (C1 package — not in M3.3C.0 doc-only PR)
NEW_TABLE_RECOMMENDED=YES
EXISTING_TABLE_EXTENSION_RECOMMENDED=NO (avoid overloading lifecycle table)
```

**Invariants:**

```
RAW_MEASUREMENTS_IMMUTABLE=YES
GENERALIZED_EVIDENCE_IMMUTABLE=YES
SESSION_FEATURES_DERIVED_AND_RECOMPUTABLE=YES
```

---

## 4 — Retention input contract

**Eligible evidence classes (within one `BatteryRestSession`):**

| Class | Role |
|-------|------|
| `ENGINE_OFF_TRANSITION` | **Anchor only** (T4 shutdown voltage reference; `actualRestAgeMs=0`) — not a ladder rung |
| `REST_WAKE_VOLTAGE` | Primary rest ladder sample when cadence-qualified |
| `PARKED_REST_CANDIDATE` | Valid rest point when `actualRestAgeMs` provider-qualified and alignment ALIGNED/PARTIAL |

**Excluded:** `STALE_REPLAY`, contaminating classes (`CHARGING_CONTAMINATED`, `ACTIVE_VEHICLE_CONTAMINATED`, `DRIVING_*`), `STATE_AMBIGUOUS` / `UNKNOWN` without sufficient alignment, provider-gap intervals (no rows).

**Temporal authority:**

```
RETENTION_TIME_AUTHORITY=actualRestAgeMs
```

Never: gap duration, ingest wall clock, nominal ladder index alone.

**Nominal index:** metadata (`nominalRestIntervalIndex`) — map when within tolerance band; missing rungs allowed.

**Provider gap:** `PROVIDER_OBSERVABILITY_GAP_USED_AS_RETENTION_SAMPLE=NO`, `GAP_DURATION_USED_AS_REST_AGE=NO`. Rest age starts only after GAP→OFF @ T4; GAP→RUNNING → no rest session / no curve.

---

## 5 — Retention feature contract (shadow JSON + typed columns)

Computed from **ordered** eligible points by `(actualRestAgeMs, providerObservationAt, observationId)`.

| Feature | Definition |
|---------|------------|
| `shutdown_to_first_rest_delta_mv` | Anchor OFF voltage − first valid rest voltage |
| `pairwise_rest_deltas_mv` | Map keyed by nominal rung pairs (e.g. `8h→16h`) when both points exist |
| `rest_decay_mv_per_hour` | Robust slope (see §6) |
| `robust_rest_slope` | Same as Theil-Sen output (mV/h) |
| `minimum_rest_voltage` / `maximum_rest_voltage` / `median_rest_voltage` | Over valid rest points |
| `rest_voltage_variance` | Population variance of rest point voltages |
| `number_of_valid_rest_points` | Count |
| `longest_rest_duration_ms` | Max span between consecutive valid points |
| `missing_rung_count` | Nominal rungs with no point in band |
| `observation_span_ms` | Last − first `actualRestAgeMs` among rest points |
| `temperatureC` / `temperatureSource` / `temperatureObservedAt` / `temperatureAgeMs` / `temperatureUncertainty` | Context metadata (§10) |

Do **not** fabricate 8h points; late/early samples use actual age.

---

## 6 — Robust slope method

No Theil-Sen / robust regression in repo today — implement pure TypeScript in C1.

```
RETENTION_SLOPE_METHOD=THEIL_SEN_MEDIAN_PAIRWISE_SLOPE
RETENTION_MIN_POINTS=2
RETENTION_OUTLIER_POLICY=THEIL_SEN_INHERENT_ROBUSTNESS; optional MAD exclusion when n>=4 and one point >3 MAD from median voltage (documented, unit-tested)
```

- Deterministic sort order for tie-breaking  
- `<2` rest points → slope `null`, counts still populated  
- No health “good/bad” thresholds in M3.3C

---

## 7 — Charge opportunity v1

**Enum:**

```
CHARGE_OPPORTUNITY_ENUM=SUFFICIENT | PARTIAL | INSUFFICIENT | UNKNOWN
```

**Raw features v1 (`CHARGE_OPPORTUNITY_V1_INPUTS`):**

| Input | Source |
|-------|--------|
| `preceding_trip_id` | `confirmedTripId` or `candidateTripId` at anchor time |
| `preceding_trip_duration_ms` | `VehicleTrip` end − start (when trip linked) |
| `preceding_trip_distance_km` | Trip odometer delta — **supplemental only** |
| `driving_charging_observation_count` | GE `DRIVING_CHARGING` in window |
| `alternator_band_lv_sample_count` | LV measurements classified alternator-band in window |
| `engine_running_true_duration_ms` | Integrate snapshot `engineRunning` where state timestamps qualified |
| `lv_voltage_time_integral` | Optional when density sufficient (document sparsity → null) |
| `prior_session_median_rest_voltage_mv` | Previous ended session feature if exists |
| `anchor_lv_voltage_mv` | ENGINE_OFF anchor measurement |
| `context_completeness` | Structured reasons (missing trip, sparse LV, etc.) |

**Classification policy:**

```
CHARGE_OPPORTUNITY_THRESHOLD_STATUS=NOT_PRODUCTION_CALIBRATED
```

Default v1: **`UNKNOWN`** unless explicit research policy version + calibrated thresholds ship in a later package. Store **`chargeOpportunityRaw`** always; **`chargeOpportunityClass`** may remain `UNKNOWN`.

**Semantic rule:**

```
LOW_REST_AFTER_INSUFFICIENT_CHARGE != BATTERY_DEGRADATION_PROOF
```

---

## 8 — Charge temporal window

```
CHARGE_CONTEXT_END = restSession.anchorAt
CHARGE_CONTEXT_START =
  1) confirmedTrip.startTime if confirmedTripId set
  2) else candidateTrip.startTime if candidateTripId set
  3) else bounded lookback from anchor (e.g. max 24h) with completeness flag — policy constant in C2
```

Late trip association: recompute features with new `inputDigest`; **never** mutate raw provider timestamps.

---

## 9 — Feature lifecycle

**Recommended:**

```
FEATURE_RECOMPUTE_STRATEGY=INCREMENTAL_SHADOW_RECOMPUTE_ON_VALID_REST_POINT + FINALIZE_ON_SESSION_END
```

| Event | Behavior |
|-------|----------|
| Valid rest observation linked | Recompute shadow feature row if digest changed |
| Session ENDED / INVALIDATED / TIMEOUT | Finalize; INVALIDATED → features marked `sessionTrust=INVALIDATED`, excluded from strong retention evidence |
| NEW_TRIP / CHARGING end | End session; compute with available context |

---

## 10 — Temperature context

Sources (partial): `tractionBatteryTemperatureC` in snapshot context, trip `outsideTemperatureStartC` / route enrichment, assessment `ambientTemperatureC` paths.

Store best-effort aligned metadata on feature row; missing temperature → lower `temperatureUncertainty`, **does not** auto-invalidate retention voltage stats.

---

## 11 — Idempotency / provenance

```
FEATURE_IDEMPOTENCY_STRATEGY=
  unique (organizationId, restSessionId, featureModelVersion, inputDigest)
  where inputDigest = sha256(sorted observationIds + measurementIds + anchorAtMs + policyVersion)

FEATURE_PROVENANCE_STRATEGY=
  persist inputSummary: { observationIds[], measurementIds[], anchorAt, policyVersion, modelVersion, computedAt }
  link feature row → sessionId only (no GE mutation)
```

Multi-replica: upsert/create on unique constraint; same digest → no-op.

---

## 12 — Shadow isolation (read-path proof)

Current code paths:

- `BatteryV2Service` / `batteryFeatures` upsert — REST_60M/6H only  
- Assessment/reconciliation — reads measurements + features, **not** rest sessions for scoring  
- Generalized evidence — write-only shadow chain when flag ON  

M3.3C C3/C4 must:

- Guard all writes with shadow flag  
- Expose no customer UI/API without separate gate  
- Add regression test **M** — no assessment/publication/BatteryFeatures mutation

---

## 13 — REST_60M / REST_6H disposition

```
REST_60M_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET (authoritative until M3.3G)
REST_6H_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
```

M3.3C **may read** completed legacy REST target measurements as **supplementary shadow inputs** with provenance `legacy_rest_target:{REST_60M|REST_6H}` and **lower priority** than generalized rest ladder points (never override `actualRestAgeMs` authority).

---

## 14 — Production data readiness (read-only @ 2026-09-22T19:59Z)

| Metric | Value |
|--------|------:|
| `REST_SESSION_COUNT` | 7 |
| `ACTIVE_REST_SESSION_COUNT` | 2 |
| `ENDED_REST_SESSION_COUNT` | 5 |
| `SESSIONS_WITH_1_PLUS_REST_POINTS` | 2 |
| `SESSIONS_WITH_2_PLUS_REST_POINTS` | 1 |
| `SESSIONS_WITH_3_PLUS_REST_POINTS` | 1 |
| `MAX_ACTUAL_REST_AGE_MS` | 68763000 (~19.1h) |
| `REST_WAKE_VOLTAGE_COUNT` | 0 |
| `ENGINE_OFF_TRANSITION_COUNT` | 7 |
| `PARKED_REST_CANDIDATE_COUNT` | 6 |

**Shadow validation strategy:** Deterministic PostgreSQL tests first; production shadow compares feature rows vs manual SQL on KS MS / WOB sessions; expect **`REST_WAKE_VOLTAGE=0`** until cadence metadata or provider wake semantics produce qualified wakes — use `PARKED_REST_CANDIDATE` + anchor OFF for early shadow curves.

---

## 15 — Deterministic test matrix (pre-merge)

| ID | Scenario | Postgres? |
|----|----------|-----------|
| A | One-point session → no slope | Unit |
| B | Two irregular timestamps → deterministic slope | Unit |
| C | Multi-point → Theil-Sen | Unit |
| D | Outlier does not dominate | Unit |
| E | Missing nominal rung | Unit |
| F | Stale replay excluded | Unit + integration |
| G | Charging/active contamination excluded | Unit |
| H | Gap duration not rest age | Unit + integration |
| I | Late trip association recompute idempotent | Integration |
| J | Concurrent feature compute idempotent | Integration |
| K | Insufficient charge ≠ degradation | Unit (policy) |
| L | Unknown charge → UNKNOWN | Unit |
| M | No authoritative assessment/publication write | Integration |

```
DETERMINISTIC_TEST_MATRIX_DEFINED=YES
POSTGRES_INTEGRATION_REQUIRED=YES (I, J, M minimum)
```

---

## 16 — Implementation packages (proposed)

| Package | Scope |
|---------|--------|
| **C1** | Prisma `BatteryRestSessionFeature` + pure retention policy + Theil-Sen + unit tests A–H |
| **C2** | Charge opportunity raw feature extraction (trip + GE window queries) |
| **C3** | `RestSessionFeatureComputationService` + digest/idempotency |
| **C4** | Shadow hooks post–GE capture + session end (flag-gated) |
| **C5** | Metrics + read-only master/debug query (no customer surface) |

Each package: independently testable, reversible, flag-gated.

---

## 17 — Observability (future C5)

Low-cardinality counters/histograms (no `vehicleId` label):

- `synqdrive_battery_rest_session_features_computed_total`
- `synqdrive_battery_rest_session_features_recomputed_total`
- `synqdrive_battery_retention_valid_point_count` (histogram buckets)
- `synqdrive_battery_charge_opportunity_class_total{class=…}`
- `synqdrive_battery_rest_session_feature_failures_total{reason=…}`

Provider-gap `opened_total` PM2 aggregation remains **separate follow-up**.

---

## 18 — Unresolved decisions (explicit)

1. Bounded lookback when no trip at anchor (24h vs trip-gap heuristic) — decide in C2 with forensics.  
2. Whether `PARKED_REST_CANDIDATE` counts toward slope before first cadence-qualified wake — **default YES** with `evidenceClass` in point provenance.  
3. Production calibration of charge opportunity thresholds — deferred; default `UNKNOWN`.  
4. Shadow flag name/env wiring — align with `backend/.env.example` in C1.

---

## FINAL MACHINE-READABLE BLOCK

```
M3_3C_0_RESULT=PREFLIGHT_COMPLETE_IMPLEMENTATION_NOT_STARTED

CURRENT_MAIN_SHA=47614a13a4b4ee68fbc3f24300e6b5aa586c01bf
PRODUCTION_SHA=2b0ef15fc80069676cd44f1b852a362434f7ffb7

B1_2W_WORKSTREAM_CLOSED=YES
M3_3C_REOPENING_GATE=YES
M3_3C_ALLOWED=YES

M3_3C_IMPLEMENTATION_READY=YES (design); RUNTIME_MERGE_READY=NO (await C1–C5)
BLOCKERS=Schema migration gate C1; charge threshold calibration; sparse REST_WAKE production samples
NEXT_ACTION=Open C1 PR (schema + pure retention policy + unit tests) behind shadow flag default OFF
```
