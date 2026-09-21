# M3.3 — R1 8H REST Evidence Architecture Audit

**Audit date:** `2026-09-21`  
**Mode:** read-only repository + architecture audit — **no production changes**  
**Context:** DIMO R1 hardware is expected to deliver a **new LV sample approximately every 8 hours** while a vehicle remains parked after engine-off. Prior M3.1/M3.2 work correctly identified that **passive 60m/6h REST targets were often unobservable** under wake-only / stale-replay provider behavior. R1 periodic wake is a **new evidence source** and an **architecture evolution** — not a repudiation of earlier audits.

---

## 0 — Contract vs observation semantics (M3.3A errata)

Do **not** conflate device configuration with production-validated cadence or wake semantics.

| Token | M3.3 / M3.3A meaning |
|-------|----------------------|
| `R1_8H_SIGNAL_AVAILABLE_BY_CONTRACT` | **YES** — R1 hardware / DIMO configuration expects ~8h LV while parked |
| `R1_8H_NATURAL_PRODUCTION_SEQUENCE_OBSERVED` | **NO** (as of audit) — no forensically validated 8h→16h→24h ladder in production evidence yet |
| `R1_8H_CADENCE_EMPIRICALLY_VALIDATED` | **NO** — jitter, missing intervals, and tolerance bands not characterized |
| `R1_WAKE_LOAD_ORDER_KNOWN` | **NO** — whether LV precedes/follows other wake fields is unproven |
| `R1_REST_SIGNAL_SEMANTIC` | **`REST_WAKE_VOLTAGE`** until natural evidence proves stable OCV semantics |

Implementation design: **`M3_3A_GENERALIZED_BATTERY_EVIDENCE_REST_SESSION_ARCHITECTURE.md`**.

---

## Executive summary

Battery V2 already persists **canonical `LIVE_VOLTAGE`** on each **new provider observation** via `BATTERY_OBSERVATION_CLASSIFY`, **without** requiring `trip_status=COMPLETED`. Trip FSM still gates **LV rest session arming**, **REST_60M/REST_6H target scheduling**, and **M3.2B shadow shutdown observations** on finalized trips — creating association lag and temporal blind spots documented in M3.2B forensics.

The cleanest forward architecture:

1. Treat every ingested LV as a **raw battery observation** with preserved provider timestamp + idempotency.
2. Classify evidence semantics **before** health scoring (including **`REST_WAKE_VOLTAGE`** for ~8h R1 samples until device semantics are proven).
3. Associate observations into **rest sessions** with a **nominal rest-age ladder** (8h, 16h, 24h, …) using **tolerance bands** derived from production timing forensics — not exact wall-clock equality.
4. Compute **session retention features** and **longitudinal profiles**; emit **SynqDrive-derived** health / charge-system / retention / failure-risk / confidence outputs — never absolute SOH %, Ah, or CCA without calibrated evidence.

**`REST_60M` / `REST_6H` remain in schema and pipelines as opportunistic/legacy targets** — not deleted in M3.3.

---

## 1 — Audit current Battery V2

### End-to-end pipeline (today)

```
DIMO signalsLatest (lowVoltageBatteryCurrentVoltage + timestamp)
  → DimoSnapshotScheduler / DimoSnapshotProcessor
  → vehicle_latest_states (monotonic merge)
  → BatteryV2SnapshotObservationProducer.classifyAndEnqueue
  → BATTERY_OBSERVATION_CLASSIFY
  → BatteryV2SnapshotIngestionService.ingestObservationClassify
       ├─ LvLiveVoltageIngestionService → battery_measurements (LIVE_VOLTAGE)
       ├─ ShutdownEvidenceCaptureService (shadow, COMPLETED-trip gate)
       ├─ LvRestWindowIngestionBridgeService (REST FSM events, REST_SHADOW flag)
       └─ legacy onSnapshot rest capture (LEGACY_REST_CAPTURE flag, off in Stage-2)

Trip finalize → BATTERY_LV_REST_SESSION_OPEN → LvRestWindowSessionArmingService
  → battery_measurement_sessions (LV_REST_WINDOW)
  → schedule REST_60M / REST_6H jobs (BATTERY_REST_TARGET_EVALUATE)
  → battery_measurements (REST_60M | REST_6H) derived from LIVE_VOLTAGE candidates

PKG-01 handoff → BATTERY_ASSESSMENT_RECOMPUTE → battery_assessments (LV_ESTIMATED_HEALTH)
PKG-02 handoff → BATTERY_PUBLICATION_UPDATE → battery_publications
```

### Model inventory

```
CURRENT_MEASUREMENT_MODELS=
  battery_measurements (types: LIVE_VOLTAGE, REST_60M, REST_6H, REST_AFTER_SHUTDOWN, crank/HV/workshop enums)
  battery_measurement_sessions (LV_REST_WINDOW, …)
  battery_evidence (optional linkage to measurements)
  battery_shutdown_evidence_observations (M3.2B shadow)
  battery_trip_shutdown_contexts (M3.2B shadow)

CURRENT_REST_SESSION_MODELS=
  LvRestWindow FSM (CANDIDATE → RESTING → COMPLETED | INVALIDATED | EXPIRED)
  battery_measurement_sessions.type=LV_REST_WINDOW + metadata.scheduledTargets
  BatteryFeatures rest_window_started_at, rest_60m/6h captures (legacy feature row)

CURRENT_REST_TARGET_MODELS=
  Fixed delays from anchor: REST_60M (+60m default), REST_6H (+6h default)
  Quality windows: ±15m (60m), ±30m (6h) + 30m retry grace
  Candidate source: LIVE_VOLTAGE rows only inside window
  No REST_8H / REST_16H target types in code or schema today

CURRENT_ASSESSMENT_MODELS=
  battery_assessments (LV_ESTIMATED_HEALTH, HV paths)
  lv-evidence-selection.policy + lv-estimated-health-assessment.policy
  scoreSemantics: ESTIMATED_HEALTH_NOT_SOH
  Inputs: VALID REST_60M/REST_6H, crank proxies, workshop overrides

CURRENT_PUBLICATION_MODELS=
  battery_publications via PKG-02 track arbitration
  publicationEligible gated by BATTERY_V2_PUBLICATION_ENABLED
```

### Component disposition (no removals in M3.3)

| Component | Disposition | Notes |
|-----------|-------------|-------|
| `battery_measurements` + dedup policy | **REUSE_AS_IS** | Canonical raw store; extend context/provenance |
| `LvLiveVoltageIngestionService` | **REUSE_WITH_EXTENSION** | Add evidence-class tags; optional REST session linkage |
| `battery-provider-observation.policy` | **REUSE_AS_IS** | STALE_REPLAY vs NEW_OBSERVATION remains critical for R1 |
| `LvRestWindowIngestionBridgeService` | **SEMANTIC_REFACTOR** | Decouple raw persist from COMPLETED-trip arming |
| `LvRestWindowSessionArmingService` | **REUSE_WITH_EXTENSION** | Arm sessions from engine-off anchor + optional trip confirm |
| REST_60M/REST_6H producers + evaluator | **REUSE_AS_IS** → **LEGACY/OPPORTUNISTIC** | Keep scheduling; stop hard dependency for health |
| `BatteryRestTargetEvaluationService` | **REUSE_WITH_EXTENSION** | Add ladder evaluator parallel path (shadow first) |
| `BatteryFeatures` (60m/6h columns) | **SUPERSEDE** (later) | Replace with session-scoped feature store / JSON summary |
| M3.2B shutdown shadow tables | **REUSE_WITH_EXTENSION** | Provenance patterns → generalized evidence layer |
| LV assessment / publication PKG | **SEMANTIC_REFACTOR** | New evidence inputs; preserve NOT-SOH semantics |
| Legacy `batteryV2.onSnapshot` rest | **REMOVE_LATER** | Already off in Stage-2 |

---

## 2 — Raw evidence independence

### Code facts

`LvLiveVoltageIngestionService.persistFromObservationClassify()` writes `battery_measurements` when `evaluateBatteryProviderObservation()` returns `shouldPersist=true`. It reads trip detection state **only for JSON context** (`hasActiveTrip`, `tripId`) — not as a write gate.

Trip **COMPLETED** is required for:

- Canonical rest session open via `resolveFinalizedTripForAnchor()` in `LvRestWindowIngestionBridgeService`
- `LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip()` (primary path)
- M3.2B `findLatestCompletedIceTripInCaptureWindow()`

```
RAW_LV_PERSISTENCE_DEPENDS_ON_TRIP_COMPLETED=NO
RAW_LV_PROVIDER_TIMESTAMP_PRESERVED=YES (observed_at + provider_timestamp from lvBatteryObservedAt)
RAW_LV_SOURCE_ID_PRESERVED=PARTIAL (idempotencyKey + classifyIdempotencyKey in provenance; no separate provider message id column)
RAW_LV_DEDUP_AVAILABLE=YES (battery_measurements unique tenant idempotency + dedup key on vehicle/type/observed_at)
```

**Gap:** Raw persistence satisfies independence; **downstream REST association and shadow shutdown do not.** Architecture must treat **persistence** and **association** as separate layers.

---

## 3 — REST session model (target)

### Conceptual lifecycle

```
DRIVING
  → ENGINE_OFF / SHUTDOWN (engine-off transition evidence)
  → RESTING (session open; anchor = engineOffAt or confirmed trip end)
  → REST_WAKE_VOLTAGE @ ~8h (+ tolerance)
  → REST_WAKE_VOLTAGE @ ~16h
  → REST_WAKE_VOLTAGE @ ~24h
  → REST_N …
  → WAKE / NEW_TRIP / CHARGING / SESSION_INVALIDATED
  → SESSION_COMPLETE
```

### Nominal rest-age ladder (not wall-clock equality)

Define for each observation after session anchor:

| Field | Purpose |
|-------|---------|
| `restSessionId` | Stable UUID for parking episode |
| `engineOffAt` | Best engine-off timestamp (shutdown evidence or trip end confirm) |
| `lastDrivingObservationAt` | Last alternator/driving LV context |
| `shutdownVoltage` / `shutdownVoltageObservedAt` | First post-driving LV after engine-off |
| `restObservationIndex` | 0 = shutdown, 1 ≈ first 8h wake, 2 ≈ 16h, … |
| `nominalRestAgeHours` | 0, 8, 16, 24, … |
| `actualRestAgeMs` | `voltageObservedAt - engineOffAt` |
| `expectedDeliveryBandMs` | **TBD from R1 production forensics** (e.g. 8h ± X); do not hard-code in M3.3 audit |
| `voltage`, `voltageObservedAt`, `providerObservationAt` | From measurement row |
| `sourceObservationId` | Link to `battery_measurements.id` |
| `temperature` / `temperatureObservedAt` | When aligned (see §7) |
| `vehicleState` / `stateConfidence` | Speed, ignition, charging contamination flags |
| `sessionStatus` | ACTIVE, COMPLETED, INVALIDATED, MISSED |
| `sessionEndReason` | NEW_TRIP, CHARGING, TIMEOUT, MANUAL |

**Association rule:** Session opens on **engine-off + rest context** from raw observations; Trip FSM **confirms** `tripId` / `engineOffAt` when COMPLETED arrives — may **retro-link** session rows without deleting raw measurements.

**Max session span:** Current FSM `maxWindowMs` = 24h — **must extend** for 32h+ ladders (config-driven, not fixed in audit).

---

## 4 — Evidence classes (target taxonomy)

| Class | Meaning |
|-------|---------|
| `DRIVING_CHARGING` | Alternator / LV charging context while driving |
| `DRIVING_NON_CHARGING` | Engine on, not charging |
| `ENGINE_OFF_TRANSITION` | Engine off, trip may still be open (M3.2B aligned) |
| `REST_WAKE_VOLTAGE` | **Default for ~8h R1 wake samples** until semantics proven |
| `REST_STABLE_VOLTAGE` | Strong resting evidence — **only after** wake-load semantics ruled out + alignment |
| `STALE_REPLAY` | Provider timestamp/value repeat |
| `STATE_AMBIGUOUS` | Missing speed/ignition/trip context |
| `CHARGING_CONTAMINATED` | LV/HV charging |
| `ACTIVE_VEHICLE_CONTAMINATED` | Driving / active trip |
| `UNKNOWN` | Insufficient classification |

**Promotion gate `REST_WAKE_VOLTAGE` → `REST_STABLE_VOLTAGE`:**

- DIMO/device proof that sample precedes modem/OBD load **or** controlled shadow study shows stable pre-load voltage
- Per-field timestamp alignment within policy skew bounds
- Engine off + speed at rest + no charging
- Not immediately before trip start wake

Do **not** label 8h samples laboratory OCV without that evidence.

---

## 5 — Charge opportunity

No `CHARGE_OPPORTUNITY` model exists in code today. Required design:

```
CHARGE_OPPORTUNITY ∈ { SUFFICIENT, PARTIAL, INSUFFICIENT, UNKNOWN }
```

**Inputs (conceptual):**

- Prior trip duration and alternator voltage integrals (duration-weighted, not distance-only)
- Count/duration of `DRIVING_CHARGING` / alternator-band LIVE_VOLTAGE samples
- Engine runtime proxies (`engineRunning`, load)
- Previous session rest level (if known)

**Rule:** Low `REST_WAKE_VOLTAGE` after `INSUFFICIENT` charge opportunity → **must not** auto-imply degradation; down-rank retention interpretation and surface `charge_context_insufficient` reason.

**Disposition:** **NEW MODEL REQUIRED** (M3.3C+).

---

## 6 — REST retention curve

### Session-level features (from ordered valid rest points)

- `shutdown_to_first_rest_delta_mv`
- Pairwise deltas: 8→16h, 16→24h, …
- `rest_decay_mv_per_hour` (robust slope — **Theil-Sen or weighted median regression**, not only pairwise)
- `robust_rest_slope`, `minimum_rest_voltage`, `maximum_rest_voltage`, `median_rest_voltage`, `rest_voltage_variance`
- `number_of_valid_rest_points`, `longest_rest_duration`

### Edge handling

| Condition | Handling |
|-----------|----------|
| Missing 8h point | Mark gap; slope uses available points; confidence ↓ |
| Late 8h (within tolerance band) | Map to index 1 with `actualRestAgeMs`; do not reject solely for lateness |
| Wake between observations | Close session; start new session on next engine-off |
| New trip | `sessionEndReason=NEW_TRIP` |
| Outlier | Robust regression + optional single-point down-weight |
| Duplicate / stale replay | Exclude via provider observation policy outcomes |

Store features on **session summary** + feed **longitudinal profile** — not only `BatteryFeatures` scalar columns.

---

## 7 — Temperature

| Question | Finding |
|----------|---------|
| `TEMPERATURE_SOURCE_AVAILABLE=` | **PARTIAL** — HV traction temp in DIMO snapshot (`tractionBatteryTemperatureC`); trip `outsideTemperatureStartC` / route enrichment for ambient; LV assessment accepts `ambientTemperatureC` with `EXTERIOR_AIR` \| `TRIP_CONTEXT` |
| `TEMPERATURE_TIMESTAMP_QUALITY=` | **MIXED** — per-signal observedAt in snapshot context; trip temps are trip-level, not per-LV sample |
| `TEMPERATURE_CAN_BE_ALIGNED_TO_REST_LV=` | **PARTIAL** — exterior air at trip start/end may approximate rest session; **not** co-timestamped with each 8h LV today |

**Do not** invent correction coefficients in M3.3. First milestone: store aligned-best-effort temp + `temperatureUncertainty` flag (assessment policy already has temperature uncertainty reasons).

---

## 8 — Longitudinal battery model

Assessment today selects evidence from a **candidate measurement set** for one recompute — not a full multi-month profile store.

**Target dimensions:**

- `REST_LEVEL_TREND`
- `REST_RETENTION_TREND`
- `POST_CHARGE_RECOVERY_TREND`
- `CHARGE_SYSTEM_TREND`
- `REPEATED_LOW_REST_EVENTS`
- `RECOVERY_AFTER_LONG_DRIVE`
- `TEMPERATURE_ADJUSTED_PATTERN` (pattern only until calibration)
- `SESSION_REPEATABILITY`

**Anti-single-session dominance:**

- Rolling median / trimmed mean over N sessions
- Minimum session count gates for `DEGRADED` / `HIGH_RISK`
- Explicit down-weight for contaminated or low charge-opportunity sessions
- `BatteryRetentionAggregate` (daily/session buckets) as rollup anchor — extend summaries

---

## 9 — Output model

Separate consumer-facing constructs:

| Output | Semantics |
|--------|-----------|
| `BATTERY_HEALTH_ESTIMATE` | `HEALTHY` \| `WATCH` \| `DEGRADED` \| `HIGH_RISK` \| `UNKNOWN` — **SynqDrive behavioral estimate** |
| `CHARGE_SYSTEM_HEALTH` | Alternator/charging path behavior |
| `CHARGE_RETENTION_HEALTH` | Post-charge rest recovery |
| `BATTERY_FAILURE_RISK` | `LOW` \| `ELEVATED` \| `HIGH` \| `UNKNOWN` |
| `CONFIDENCE` | `LOW` \| `MEDIUM` \| `HIGH` |

Internal numeric score (if used): **`synqDriveDerivedHealthScore`** — never labeled SOH %.

```
ABSOLUTE_SOH_SUPPORTED=NO
CCA_SUPPORTED=NO
CAPACITY_AH_SUPPORTED=NO
BATTERY_HEALTH_ESTIMATE_SUPPORTED_IN_PRINCIPLE=YES
FAILURE_RISK_ESTIMATE_SUPPORTED_IN_PRINCIPLE=YES
```

---

## 10 — Confidence engine (architecture rules)

Derive from **evidence classes + session completeness + longitudinal depth**:

| Evidence picture | Indicative confidence (rules TBD in M3.3E) |
|------------------|---------------------------------------------|
| Driving + engine-off only | LOW–MEDIUM |
| + one valid `REST_WAKE_VOLTAGE` (~8h) | MEDIUM |
| + 8h + 16h + 24h clean session | MEDIUM–HIGH for **retention** (not absolute health) |
| Multiple clean sessions over weeks | HIGH longitudinal |
| Charge opportunity INSUFFICIENT | Cap retention interpretation; do not cap driving/charging diagnostics |

Rules must reference **actual persisted fields** after M3.3B instrumentation — examples above are non-normative.

---

## 11 — Vehicles that never park 8 hours

```
NO_8H_REST_DOES_NOT_MEAN_BAD_BATTERY=YES
```

Degrade gracefully:

- Still assess **charge system** and **shutdown transition** from driving + engine-off
- Short parking → opportunistic REST_60M if it appears
- Confidence stays LOW/MEDIUM with explicit `insufficient_long_rest_evidence`
- Long-rest evidence **upgrades** profile when it later appears — no permanent penalty

---

## 12 — R1 device semantics (open dependency)

```
8H_SIGNAL_SEMANTIC=REST_WAKE_VOLTAGE
```

**Critical unknown (DIMO / device evidence required):**

When R1 wakes ~every 8h, is LV sampled:

- **A.** before LTE/modem/OBD communication load
- **B.** after wake-up electrical load began
- **C.** unknown

Until proven: classify as `REST_WAKE_VOLTAGE`; do not treat as laboratory OCV or `REST_STABLE_VOLTAGE`.

**Ingestion note:** If R1 delivers **new provider timestamps** on wake, `evaluateBatteryProviderObservation` → `NEW_OBSERVATION` → `LIVE_VOLTAGE` persist — **no new queue type required** for raw ingest. Classification + session ladder are the missing layers.

---

## 13 — REST_60M / REST_6H migration

```
CURRENT_REST_60M_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
CURRENT_REST_6H_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
```

| Role | Decision |
|------|----------|
| Primary health observability | **SUPERSEDED** by 8h ladder + retention curve |
| Natural appearance | Still **consume** if VALID in window |
| Scheduling | **REUSE_AS_IS** short term; reduce emphasis in assessment weights over time |
| Schema enum | **RETAIN** — add `REST_8H`, `REST_16H`, … or store ladder points as typed measurements linked to session |

Compatibility: assessment policy continues to accept REST_60M/REST_6H as rest evidence tier; new ladder points gain higher weight when present.

---

## 14 — M3.2B shutdown evidence

**Preserve:**

- Per-field provenance + timestamp sources
- State completeness / alignment / skew
- Pessimistic classification
- Idempotency
- `atomicClaim=false` on trip context snapshots

**Fit in target architecture:**

| Layer | Role |
|-------|------|
| Short term | **Research + provenance reference** for ENGINE_OFF_TRANSITION |
| Medium term | **Absorb** into generalized `BatteryEvidence` / observation classification — shadow tables optional retention |
| Trip COMPLETED gate | **Remove for raw/engine-off**; keep optional enrich when trip confirms |

M3.2B temporal blind spot (COMPLETED-only shadow hook) reinforces §2 separation.

---

## 15 — Target architecture

```
DIMO LV SOURCE (R1: drive + engine-off + ~8h wake)
    ↓
RAW BATTERY OBSERVATION (battery_measurements LIVE_VOLTAGE — trip-independent)
    ↓
EVIDENCE CLASSIFICATION (incl. REST_WAKE_VOLTAGE)
    ↓
REST SESSION ASSOCIATION (engineOffAt anchor; trip confirm enriches)
    ↓
    ├─ DRIVING / SHUTDOWN EVIDENCE
    ├─ REST LADDER POINTS (8h, 16h, …)
    └─ CHARGE OPPORTUNITY CONTEXT (prior trip)
    ↓
SESSION FEATURES (retention curve)
    ↓
LONGITUDINAL BATTERY PROFILE (multi-session)
    ↓
    ├─ Battery Health Estimate
    ├─ Charge System Health
    ├─ Charge Retention Health
    ├─ Failure Risk
    └─ Confidence
```

**Trip FSM interaction (dashed — non-blocking for raw persist):**

```
Trip FSM finalize ──► confirm trip end, link restSessionId, open PKG handoffs
Trip FSM active  ──► contamination flags only (ACTIVE_VEHICLE_CONTAMINATED)
```

---

## 16 — Implementation plan (minimal safe phases)

| Phase | Scope | Reversible | Observable |
|-------|-------|------------|------------|
| **M3.3A** | Evidence taxonomy doc + graph; raw/association boundary; extend measurement context schema design; flags default off | Yes | Metrics: classification counts (shadow) |
| **M3.3B** | Rest session v2 + 8h ladder association (shadow); tolerance from prod forensics | Yes | Session rows + ladder index metrics |
| **M3.3C** | Retention curve + charge opportunity (shadow features) | Yes | Feature JSON on session |
| **M3.3D** | Longitudinal profile store / aggregates | Yes | Profile version + session count |
| **M3.3E** | Health / failure-risk / confidence outputs (shadow assessment track) | Yes | Parallel SHADOW assessments |
| **M3.3F** | Production shadow validation on R1 fleet | Yes | Evidence docs only |
| **M3.3G** | Authoritative cutover; REST_60M/6H demoted to opportunistic | Flag-gated | Publication guard |

**Do not implement in this audit PR.**

---

## 17 — Historical context (preserved)

- M3.1 **correctly** reported 0 natural VALID REST under wake-only/stale-replay behavior.
- M3.2 **correctly** recommended hybrid evidence and identified observability deadlock.
- M3.2A/M3.2B **correctly** scoped shutdown provenance and shadow gating.
- R1 ~8h wake **changes provider contract** — architecture must evolve; prior targets were **hard to observe**, not wrong as engineering hypotheses.

---

## FINAL MACHINE-READABLE BLOCK

```
M3_3_R1_8H_ARCHITECTURE_AUDIT=COMPLETE

R1_8H_SIGNAL_AVAILABLE_BY_CONTRACT=YES
R1_8H_NATURAL_PRODUCTION_SEQUENCE_OBSERVED=NO
R1_8H_CADENCE_EMPIRICALLY_VALIDATED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO
R1_REST_SIGNAL_SEMANTIC=REST_WAKE_VOLTAGE

R1_8H_SIGNAL_AVAILABLE=YES_BY_CONTRACT (legacy alias — prefer BY_CONTRACT token above)
R1_8H_SIGNAL_CURRENTLY_INGESTED=AS_LIVE_VOLTAGE_WHEN_NEW_PROVIDER_TIMESTAMP (no REST_8H type or ladder yet)
R1_8H_PROVIDER_TIMESTAMP_PRESERVED=YES (lvBatteryObservedAt → observed_at / provider_timestamp)

RAW_LV_INDEPENDENT_OF_TRIP_FSM=YES_FOR_PERSISTENCE_NO_FOR_REST_SESSION_AND_M3_2B_SHADOW

CURRENT_REST_60M_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
CURRENT_REST_6H_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET

REST_SESSION_REFACTOR_REQUIRED=YES

CHARGE_OPPORTUNITY_MODEL_REQUIRED=YES
RETENTION_CURVE_MODEL_REQUIRED=YES
LONGITUDINAL_MODEL_REQUIRED=YES
TEMPERATURE_CONTEXT_AVAILABLE=PARTIAL

M3_2B_PROVENANCE_REUSABLE=YES

ABSOLUTE_SOH_SUPPORTED=NO
CCA_SUPPORTED=NO
CAPACITY_AH_SUPPORTED=NO

BATTERY_HEALTH_ESTIMATE_SUPPORTED_IN_PRINCIPLE=YES
FAILURE_RISK_ESTIMATE_SUPPORTED_IN_PRINCIPLE=YES

IMPLEMENTATION_READY=NO
NEXT_PHASE=M3.3A

PRODUCTION_CHANGED=NO
```

---

## References (code)

- `backend/src/modules/vehicle-intelligence/battery-health/lv-live-voltage/lv-live-voltage-ingestion.service.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-ingestion.service.ts`
- `backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/*`
- `backend/src/modules/vehicle-intelligence/battery-health/shutdown-evidence/*`
- `backend/src/config/battery-health-v2.config.ts`
- `architecture/battery-v2/research/M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md`
