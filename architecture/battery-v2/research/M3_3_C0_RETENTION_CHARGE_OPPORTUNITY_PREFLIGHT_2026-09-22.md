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
| `PARKED_REST_CANDIDATE` | **Shadow retention ladder point only** when attached to a real session, provider-time qualified, no charging/driving contamination, alignment ALIGNED/PARTIAL — **never** promoted to `REST_STABLE_VOLTAGE` |

**PARKED_REST_CANDIDATE contract:**

```
PARKED_REST_CANDIDATE_SHADOW_ONLY=YES
PARKED_CANDIDATE_EQUALS_STABLE_REST=NO
```

Per-point provenance must retain `evidenceClass` + `evidenceConfidence` so M3.3D/E can distinguish ENGINE_OFF anchor vs PARKED_REST_CANDIDATE vs REST_WAKE_VOLTAGE.

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

Computed from **ordered eligible rest ladder points** (excludes ENGINE_OFF anchor row) by `(actualRestAgeMs, providerObservationAt, observationId)`.

Each rest point persisted in provenance with: `observationId`, `measurementId`, `evidenceClass`, `evidenceConfidence`, `stateAlignmentClass`, `actualRestAgeMs`, `voltageMv`, `nominalRestIntervalIndex` (metadata).

| Feature | Unit | Definition |
|---------|------|------------|
| `shutdown_to_first_rest_delta_mv` | mV | **`anchorVoltageMv - firstRestVoltageMv`** (anchor = ENGINE_OFF @ T4). **Positive** = voltage **dropped** after shutdown anchor; **negative** = voltage **increased**. |
| `pairwise_rest_deltas_mv` | mV | Map keyed by nominal rung pairs (e.g. `8h→16h`) when both points exist: `vLater - vEarlier` |
| `robust_rest_slope_mv_per_hour` | mV/h | **Canonical stored slope** — Theil-Sen median pairwise slope vs `actualRestAgeMs` (see §6). Presentation alias `rest_decay_mv_per_hour` allowed at API layer only; **do not store duplicate slope fields**. |
| `minimum_rest_voltage_mv` / `maximum_rest_voltage_mv` / `median_rest_voltage_mv` | mV | Over eligible rest ladder points |
| `rest_voltage_variance_mv2` | mV² | Population variance of rest point voltages |
| `number_of_valid_rest_points` | count | Eligible rest ladder points |
| `max_actual_rest_age_ms` | ms | **`max(actualRestAgeMs)`** among eligible rest ladder points |
| `max_inter_observation_gap_ms` | ms | **`max(delta actualRestAgeMs)`** between consecutive eligible points in sort order |
| `observation_span_ms` | ms | **`lastEligibleAge - firstEligibleAge`** among rest ladder points |
| `missing_rung_count` | count | Nominal rungs with no point in tolerance band |
| Temperature context | see §10 | Not a retention voltage correction |

Do **not** fabricate 8h points; late/early samples use actual age. Do **not** use overloaded “longest rest duration” — use **`max_actual_rest_age_ms`** vs **`max_inter_observation_gap_ms`** distinctly.

---

## 6 — Robust slope method

No Theil-Sen / robust regression in repo today — implement pure TypeScript in C1.

```
RETENTION_SLOPE_METHOD=THEIL_SEN_MEDIAN_PAIRWISE_SLOPE
RETENTION_MIN_POINTS=2
RETENTION_OUTLIER_POLICY=NO_HARD_POINT_DELETION_THEIL_SEN_ROBUST_ONLY
```

Optional **diagnostic-only** outlier metadata (e.g. MAD distance) may be stored for explainability; **eligible points remain in provenance** and are not dropped in C1 v1. No calibrated >3 MAD deletion rule in M3.3C v1.

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

| Input | Unit | Source / semantics |
|-------|------|-------------------|
| `preceding_trip_id` | id | `confirmedTripId` or `candidateTripId` at compute time |
| `preceding_trip_start_at` / `preceding_trip_end_at` | ISO UTC | Trip timestamps used for window |
| `preceding_trip_duration_ms` | ms | `trip.end - trip.start` when both known |
| `preceding_trip_distance_km` | km | Trip odometer delta — **supplemental only**, not authoritative for charge |
| `driving_charging_observation_count` | count | GE `DRIVING_CHARGING` in charge window |
| `charge_context_source_observation_ids` | id[] | Sorted GE IDs included in window |
| `alternator_band_lv_sample_count` | count | LV samples in alternator band in window |
| `engine_running_observed_coverage_ms` | ms | **Observation-qualified proxy**: sum of contiguous snapshot intervals where `engineRunning=true` and state timestamp is provider-qualified — **not** continuous crank-time guarantee; document sparsity in `context_completeness` |
| `lv_voltage_time_proxy_v_ms` | V·ms | **Voltage–time proxy only** over qualified LV samples in window — **NOT** current, **NOT** Ah, **NOT** delivered charge energy |
| `prior_session_median_rest_voltage_mv` | mV | Prior ended session feature if exists |
| `anchor_lv_voltage_mv` | mV | ENGINE_OFF anchor measurement |
| `context_completeness` | object | Structured reasons (missing trip, sparse LV, etc.) |

```
CHARGE_CURRENT_MEASURED=NO
CHARGE_AH_INFERRED=NO
```

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

Late trip association or charge-context enrichment changes trip fields / raw charge features → **must change `FEATURE_INPUT_DIGEST`** (see §11). **Never** mutate raw provider timestamps.

---

## 9 — Feature row lifecycle & canonical selection (C1 design)

Append-only **`BatteryRestSessionFeature`** rows carry explicit lifecycle semantics (exact enum/column names are C1 schema decisions):

| Dimension | Values | Meaning |
|-----------|--------|---------|
| `computationPhase` | `INCREMENTAL` \| `FINAL` | Incremental recompute after new evidence; `FINAL` written when session ends (or final pass after end) |
| `sessionTrust` | `VALID` \| `INVALIDATED` | Snapshot of session trust at compute time — INVALIDATED sessions must not be treated as strong retention evidence |

**Canonical row selection (shadow readers only — no authoritative consumer in M3.3C):**

Within `(restSessionId, featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion)` family:

1. Prefer rows with `sessionTrust=VALID`.
2. If session `endedAt` set, prefer latest **`computationPhase=FINAL`** among VALID rows.
3. Else prefer latest **`computationPhase=INCREMENTAL`** among VALID rows.
4. Tie-break: highest monotonic **`semanticRevision`** (integer incremented whenever `FEATURE_INPUT_DIGEST` changes) — **not** `createdAt` alone.

```
FEATURE_RECOMPUTE_STRATEGY=INCREMENTAL_SHADOW_RECOMPUTE_ON_VALID_REST_POINT + FINALIZE_ON_SESSION_END
FEATURE_ROW_LIFECYCLE_DEFINED=YES
CANONICAL_FEATURE_SELECTION_DEFINED=YES
```

| Event | Behavior |
|-------|----------|
| Valid rest observation linked | INCREMENTAL recompute if digest changed |
| Session ENDED / TIMEOUT | FINAL row when digest stable or on end |
| Session INVALIDATED | FINAL or INCREMENTAL with `sessionTrust=INVALIDATED` |
| NEW_TRIP / CHARGING end | End session; compute with available context |

---

## 10 — Temperature context

Temperature is **context only** — no correction coefficient in M3.3C.

**Source taxonomy (explicit):**

| `temperatureSource` | Meaning |
|---------------------|---------|
| `LV_RELEVANT_AMBIENT` | Best-effort ambient aligned to rest/LV window |
| `TRIP_EXTERIOR` | Trip-level exterior air (e.g. `outsideTemperatureStartC`) |
| `TRACTION_BATTERY_PROXY` | HV traction temp — **proxy only**; **do not claim** as 12V battery temperature |
| `UNKNOWN` | Missing or unclassified |

```
TRACTION_TEMP_NOT_CLAIMED_AS_LV_TEMP=YES
MISSING_TEMPERATURE_INCREASES_UNCERTAINTY=YES
```

Missing or weak temperature evidence **increases** `temperatureUncertainty` (higher = less reliable context). It does **not** automatically invalidate raw retention voltage features.

---

## 11 — Idempotency / provenance / `FEATURE_INPUT_DIGEST`

**`FEATURE_INPUT_DIGEST`** = SHA-256 hex over **canonical deterministic JSON** (UTF-8, sorted object keys, stable array ordering, integer ms for timestamps, fixed decimal formatting for floats) of a **normalized input snapshot**.

**Must include all semantically relevant inputs** (minimum):

- `restSessionId`, `anchorAt`, `sessionStatus`, `sessionTrust`, `endReason` (if ended)
- Sorted **`retentionPoints[]`**: each with `observationId`, `measurementId`, `evidenceClass`, `evidenceConfidence`, `stateAlignmentClass`, `actualRestAgeMs`, `voltageMv`, `nominalRestIntervalIndex`
- Anchor snapshot: `anchorMeasurementId`, `anchorVoltageMv`
- Trip context: `confirmedTripId`, `candidateTripId`, `tripStartAt`, `tripEndAt`, `tripDurationMs`, `tripDistanceKm`
- Charge window: sorted `chargeContextObservationIds[]`, `drivingChargingCount`, `alternatorBandLvCount`, `engineRunningObservedCoverageMs`, `lvVoltageTimeProxyVms`, all charge raw scalars above
- Temperature: `temperatureC`, `temperatureSource`, `temperatureObservedAt`, `temperatureAgeMs`, `temperatureUncertainty`
- Versions: `featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`

**Excluded from digest:** `computedAt`, DB `id`, `createdAt`.

```
LATE_TRIP_ASSOCIATION_CHANGES_DIGEST=YES
CONTEXT_ENRICHMENT_CHANGES_DIGEST=YES
SAME_CANONICAL_INPUT_SAME_DIGEST=YES
```

**Persistence:**

```
FEATURE_IDEMPOTENCY_STRATEGY=
  unique (organizationId, restSessionId, featureModelVersion, FEATURE_INPUT_DIGEST)
  semanticRevision monotonic per (session, model, policy family) when digest changes

FEATURE_PROVENANCE_STRATEGY=
  persist full normalized input snapshot (or hash-verifiable subset) + output features
  never mutate BatteryMeasurement / BatteryGeneralizedEvidenceObservation
```

Multi-replica: insert-on-conflict-do-nothing or equivalent; same digest → one logical row.

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

**Pipeline vs evidence role (do not conflate):**

| Layer | Status |
|-------|--------|
| **Current runtime pipeline** | REST_60M / REST_6H targets → `BatteryFeatures` → assessment/publication remain **unchanged** and **still authoritative today** |
| **M3.3 architecture evidence role** | REST_60M/6H target **types** are **opportunistic legacy** relative to the R1 generalized rest ladder — not the long-term canonical rest model |
| **M3.3C** | Does **not** demote, disable, or cut over REST_60M/6H |
| **M3.3G** | Future **authoritative cutover** phase only |

```
REST_60M_PIPELINE_AUTHORITY=UNCHANGED_UNTIL_M3_3G
REST_6H_PIPELINE_AUTHORITY=UNCHANGED_UNTIL_M3_3G
REST_60M_EVIDENCE_ROLE=OPPORTUNISTIC_LEGACY (architecture taxonomy)
REST_6H_EVIDENCE_ROLE=OPPORTUNISTIC_LEGACY (architecture taxonomy)
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

## 19 — M3.3C.0A semantic hardening (PR #1725)

Doc-only amendments (no runtime):

- Rebased PR branch onto `main` @ `47614a13…` — removed inherited no-op #1724 test diff from PR compare base.
- Expanded **`FEATURE_INPUT_DIGEST`** canonical snapshot (late trip + charge enrichment change digest).
- Defined **`computationPhase`** / **`sessionTrust`** / **`semanticRevision`** selection semantics.
- Explicit retention units/sign conventions; split **`max_actual_rest_age_ms`** vs **`max_inter_observation_gap_ms`**.
- Temperature uncertainty wording + source taxonomy; traction temp not LV temp.
- Charge proxies: **`engine_running_observed_coverage_ms`**, **`lv_voltage_time_proxy_v_ms`**; no Ah/current claims.
- Outlier policy: Theil-Sen only for C1 v1.
- PARKED_REST_CANDIDATE shadow-only contract; REST_60M/6H pipeline vs evidence-role clarification.

---

## FINAL MACHINE-READABLE BLOCK

```
M3_3C_0A_RESULT=PREFLIGHT_SEMANTIC_HARDENING_COMPLETE

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
