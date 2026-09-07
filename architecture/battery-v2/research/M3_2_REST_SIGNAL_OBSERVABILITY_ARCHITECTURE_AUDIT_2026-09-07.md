# M3.2 — REST Signal Observability & Evidence Acquisition Architecture Audit

**Audit timestamp:** `2026-09-07T03:55:00Z`  
**Scope:** Read-only architecture / signal forensic  
**Production changed:** NO  
**M3.1 status:** unchanged — `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`, blocker `SIGNAL_OBSERVABILITY`

> **Errata (M3.2A, `2026-09-07T04:30:00Z`):** Machine-readable `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES` is **overstrong**. Production forensics (13 post-T0 ICE trips) found **0 confirmed** post-engine-off pre-sleep samples (trip finalized + eng/ign off). HMÜ C 215 provides **partial** shutdown-transition candidates (`hasActiveTrip=true` at all trip-end samples). KS MX 2024 trip-end sample has `engineRunning=true`. See `M3_2A_SHUTDOWN_ANCHOR_HYBRID_EVIDENCE_FEASIBILITY_2026-09-07.md`. Superseded flag: `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=PARTIAL`, `CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP=NO`.

**Canonical M3.1 evidence:** KS MX session `82324f65` — REST_60M/REST_6H both `NATURAL_CONTAMINATED`, vehicle genuinely resting, ~7h17m LV silence. See `M3_1_STAGE2_KS_MX_2024_REST6H_FINAL_MATURITY_2026-09-07.md`.

---

## Executive summary

Battery V2 REST measurement architecture assumes **passive in-window LIVE_VOLTAGE** during genuine rest. Deployed DIMO integration emits **new LV timestamps only during vehicle activity**; parked sleep produces **repeated stale `signalsLatest` payloads**. SynqDrive correctly suppresses duplicate observations and does not invent measurements. REST target evaluation then finds **zero eligible candidates** and, after retry grace, **persists historical alternator-era samples** labeled `CONTAMINATED_BY_WAKE` — even when the vehicle never woke.

This creates an **evidence observability deadlock** with current policy (Step 7). Pipeline health remains **PASS**; the blocker is **signal + evidence-model mismatch**, not scheduler/target defects.

**Recommended direction (Step 10):** Hybrid evidence model — retain REST_60M/REST_6H as **opportunistic** paths when in-window LV exists; add explicit **trip-end shutdown anchor** and **insufficient-evidence** tiers; **do not** treat post-grace contaminated historical fallback as health evidence.

---

## Step 1 — Current LV signal path (reconstructed from code)

```
PROVIDER (DIMO GraphQL)
  └─ DimoTelemetryService.fetchLatestVehicleSnapshot
       query: buildLatestSnapshotQuery → signalsLatest(tokenId)
       signal: lowVoltageBatteryCurrentVoltage { timestamp, value }
       file: backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts
       file: backend/src/modules/dimo/dimo-telemetry.service.ts

POLL SCHEDULER
  └─ DimoSnapshotScheduler (30s tick, activity-tier gating)
       deriveSnapshotPollingTier → LONG_IDLE @ 30min when telemetry stale
       file: backend/src/workers/schedulers/dimo-snapshot.scheduler.ts
       file: backend/src/workers/schedulers/snapshot-polling/derive-snapshot-polling-tier.ts
       file: backend/src/workers/schedulers/snapshot-polling/snapshot-polling-tier.config.ts
  └─ BullMQ queue: dimo.snapshot.poll (QUEUE_NAMES.DIMO_SNAPSHOT)

INGESTION WORKER
  └─ DimoSnapshotProcessor.processSnapshotJob
       mapDimoBatterySignals / resolveLvBatteryObservedAt
       shouldApplyVlsTelemetryUpdate (monotonic sourceTimestamp guard)
       upsert vehicle_latest_states (lv_battery_voltage, source_timestamp, …)
       batteryObservationProducer.classifyAndEnqueue
       file: backend/src/workers/processors/dimo-snapshot.processor.ts
       file: backend/src/modules/dimo/mappers/dimo-battery-signal.mapper.ts
       file: backend/src/modules/dimo/vls-monotonic-merge.util.ts

NORMALIZATION / DEDUP POLICY
  └─ evaluateBatteryProviderObservation
       outcomes: NEW_OBSERVATION | DUPLICATE_OBSERVATION | STALE_REPLAY | …
       idempotency: battery-obs:{org}:{vehicle}:{signal}:{source}:{observedAtMs}:{value}
       file: backend/src/modules/vehicle-intelligence/battery-health/battery-provider-observation.policy.ts

CLASSIFY ENQUEUE
  └─ BatteryV2SnapshotObservationProducer.classify
       lastStored compare: battery_health_snapshots (legacy) for enqueue gate
       file: backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-observation.producer.ts

BATTERY OBSERVATION (async job)
  └─ BATTERY_OBSERVATION_CLASSIFY → BatteryObservationClassifyHandler
       → BatteryV2SnapshotIngestionService.ingestObservationClassify
       → LvLiveVoltageIngestionService.persistFromObservationClassify
       lastStored compare: battery_measurements LIVE_VOLTAGE (canonical)
       table: battery_measurements (type=LIVE_VOLTAGE, observed_at, provider_timestamp, context, provenance)
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-live-voltage/lv-live-voltage-ingestion.service.ts

REST SESSION
  └─ Trip finalize → BATTERY_LV_REST_SESSION_OPEN → LvRestWindowSessionArmingService
  └─ Observation bridge → LvRestWindowIngestionBridgeService.processObservationCycle
       FSM: LvRestWindowStateMachineService / reduceLvRestWindow
       table: battery_measurement_sessions (type=LV_REST_WINDOW, metadata.scheduledTargets)
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-window-session-arming.service.ts

TARGET
  └─ BatteryV2RestTargetProducer.scheduleRest60m / scheduleRest6h
       delays: getBatteryRest60mDelayMs / getBatteryRest6hDelayMs (config)
       job: BATTERY_REST_TARGET_EVALUATE
       file: backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-rest-target.producer.ts

MEASUREMENT (REST_60M / REST_6H)
  └─ BatteryRestTargetEvaluateHandler → BatteryRestTargetEvaluationService.evaluateAndPersist
       candidates: listLvVoltageCandidates (LIVE_VOLTAGE rows only, time-bounded)
       quality: evaluateClassifiedRestTargetOutcome / classifyLvRestObservationQuality
       windows: REST_60M ±15m, REST_6H ±30m; retry grace 30m
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/battery-rest-target-evaluation.service.ts
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-measurement-quality.ts
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/battery-rest-target-evaluation.ts

ASSESSMENT
  └─ LvRestAssessmentHandoffService → BATTERY_ASSESSMENT_RECOMPUTE
       gate: isCanonicalRestAssessmentHandoffEligible (VALID / VALID_PROXY only)
       table: battery_assessments
       file: backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-assessment-handoff.policy.ts

PUBLICATION
  └─ LvPublicationHandoffService → BATTERY_PUBLICATION_UPDATE → BatteryPublicationService
       table: battery_publications / battery_features
       file: backend/src/modules/vehicle-intelligence/battery-health/battery-publication.service.ts
```

**Webhook path:** Device-connection webhooks exist (`DeviceConnectionWebhookProcessor`) but **do not carry LV voltage**. No push path for `lowVoltageBatteryCurrentVoltage`.

---

## Step 2 — Signal inventory (LV-relevant)

| SIGNAL | PROVIDER_SOURCE | RAW_FIELD | NORMALIZED_FIELD | CADENCE_DRIVING | CADENCE_PARKED | AVAILABLE_DURING_SLEEP | TIMESTAMP_SEMANTICS | USED_BY_BATTERY_V2 | PERSISTED_RAW | PERSISTED_NORMALIZED |
|--------|---------------|-----------|------------------|-----------------|----------------|------------------------|---------------------|-------------------|---------------|---------------------|
| LV voltage | DIMO | `lowVoltageBatteryCurrentVoltage` | `lvBatteryVoltage` / `numeric_value` | ~30–60s (ACTIVE_DRIVING tier) | Poll continues (LONG_IDLE 30m) but **timestamp frozen** | Value in API response; **no new timestamp** | Per-signal `timestamp`; fallback `signals.lastSeen` | **YES** (primary REST path) | No raw table | `battery_measurements`, `vehicle_latest_states` |
| Ignition | DIMO | `isIgnitionOn` | `is_ignition_on` | Same snapshot | Same (stale) | Repeated stale | Per-signal timestamp | **YES** (REST quality context) | No | VLS + measurement `context` |
| Engine load / running | DIMO | `obdEngineLoad` | `engineRunning` inference | Same | Stale | Repeated stale | Per-signal | **YES** (engine-off gate) | No | measurement `context.engineRunning` |
| Charging plug | DIMO | `obdIsPluggedIn` | `isLvCharging` heuristic | Same | Stale | Repeated stale | Per-signal | **YES** (charging contamination) | No | measurement `context` |
| Speed | DIMO | `speed` | `speed_kmh` | Same | Stale at 0 | Repeated stale | Per-signal | **YES** | No | VLS + context |
| lastSeen | DIMO | `signalsLatest.lastSeen` | collection anchor | Updates while driving | **Frozen at trip end** (KS MX) | Present but not advancing | Collection-level | **YES** (observedAt fallback) | No | VLS `source_timestamp` |
| HV traction voltage | DIMO | `powertrainTractionBatteryCurrentVoltage` | traction fields | BEV/PHEV | N/A ICE fleet | — | Per-signal | HV path only | No | VLS |
| DTC list | DIMO webhook/API | `obdDTCList` | DTC modules | Event/poll | Not LV | — | — | **NO** for LV REST | Partial | DTC tables |
| Historical signals() | DIMO | time-range query | crank window | On-demand | **Not polled during rest** | Could if queried | Range samples | **NO** for REST (crank proxy only) | No | Crank jobs only |
| Segments | DIMO | segment API | trip boundaries | Trip lifecycle | Indirect | — | Segment times | **Indirect** (trip end anchor) | Segment store | Trip rows |

**Distinctions observed (KS MX):**

| Layer | Status |
|-------|--------|
| Provider emits new LV while parked | **NOT available** (timestamp stuck @ trip end) |
| SynqDrive polls | **Available** — 128 SUCCESS `dimo_poll_logs` post trip end |
| Provider response present | **YES** (same snapshot replayed) |
| Timestamp advances | **NO** |
| New LIVE_VOLTAGE persisted | **NO** (dedup: DUPLICATE/STALE_REPLAY) |
| REST evaluation sees in-window LV | **NO** (query filtering + no rows) |

---

## Step 3 — Why parked LV disappears

Production forensic (KS MX `2026-09-06T20:00:44Z` → REST_6H completion):

| Layer | Finding |
|-------|---------|
| **A** DIMO does not emit new LV while sleeping | **YES** — `last_seen_at` / LV signal timestamp frozen |
| **B** SynqDrive stops polling | **NO** — 128 successful snapshot polls after trip end |
| **C** Stale timestamp replay, no new observation | **YES** — `evaluateBatteryProviderObservation` → DUPLICATE/STALE_REPLAY |
| **D** Dedup suppresses | **YES** — by design (`battery-provider-observation.policy.ts`) |
| **E** Storage filter | **NO** — would persist if NEW_OBSERVATION |
| **F** Battery V2 query filter | **YES for REST targets** — strict quality window excludes trip-end anchor |
| **G** Other | Monotonic VLS merge prevents regressing `source_timestamp` |

```
PARKED_LV_DISAPPEARANCE_LAYER=INGESTION_DEDUP_AFTER_PROVIDER_TIMESTAMP_STALL
PARKED_LV_PROVIDER_EMISSION=NO_NEW_TIMESTAMP_WHILE_SLEEPING
PARKED_LV_POLL_REQUESTED=YES
PARKED_LV_RESPONSE_PRESENT=YES
PARKED_LV_TIMESTAMP_ADVANCES=NO
PARKED_LV_PERSISTED=NO_AFTER_INITIAL_TRIP_END_SAMPLE
PARKED_LV_BATTERY_VISIBLE=NO_IN_REST_QUALITY_WINDOWS
```

**Root cause stack:** A → C → D at ingestion; F at REST evaluation.

---

## Step 4 — DIMO acquisition paths audit

| SOURCE | IMPLEMENTED | CURRENTLY_USED (LV REST) | CAN_CONTAIN_LV | CAN_ADVANCE_WHILE_SLEEPING | EVIDENCE |
|--------|-------------|--------------------------|----------------|----------------------------|----------|
| `signalsLatest` snapshot poll | YES | **YES — sole REST path** | YES | **NO** (prod KS MX) | Primary architecture |
| Activity-tier scheduler | YES | YES (controls poll rate) | indirect | NO | LONG_IDLE 30m still polls |
| Historical `signals(from,to)` | YES | NO (crank/start proxy only) | YES | **Unknown without active query** | `DimoSegmentsService.fetchBatteryCrankWindow` |
| DIMO Segments | YES | Trip boundaries only | NO direct LV | NO | Trip end → session anchor |
| Device webhooks | YES | NO for LV | NO LV field | NO | connection/RPM/DTC only |
| Agent API / triggers | YES | NO for LV REST | NO | NO | `DimoTriggersService` |
| Reference capture HF | YES | Research only | YES | Not production REST | separate module |
| ClickHouse mirror | Optional | Analytics | YES | Same as source | not REST authority |
| Legacy `battery_health_snapshots` | YES | Classify enqueue compare only | YES | Same stall | not REST candidate source |

**Conclusion:** No alternate **production** DIMO path currently feeds REST evaluation besides persisted `LIVE_VOLTAGE` from snapshot poll — and that path **stalls during sleep**.

---

## Step 5 — Multi-trip LV forensic timeline

Production samples (ICE fleet, Sep 2026):

### KS MX 2024 — trip end `20:00:44Z`

| Phase | LV | speed | ignition | engineRunning | Notes |
|-------|-----|-------|----------|---------------|-------|
| Mid-trip | 14.8V | 47–117 | on | on | Alternator era |
| T+0 trip end | **12.15V** | 0 | **off** | **on** | Only post-trip LV; then silence |
| T+5m…T+7h | — | — | — | — | **Zero** new LV |

### HMÜ C 215 — trip end `16:09:59Z`

| Phase | LV | speed | ignition | Notes |
|-------|-----|-------|----------|-------|
| T-1m | 13.01V | 17 | on | Still driving |
| T+0 | **12.868V** | 0 | off | Last LV ever until next day |
| After | **none** | — | — | Complete silence |

### KS MS 661 — trip end `15:51:42Z`

| Phase | LV | speed | ignition | engineRunning |
|-------|-----|-------|----------|---------------|
| T+0 | 13.52V | 0 | off | **on** |
| Next wake | 14.515V @ `00:06:57` | 63 | on | on — **next trip**, no pre-start clean sample |

### WOB L 7503 — trip end `19:36:13Z`

Last LV before end: `19:35:43` @ 14.253V still driving. **No** LV at/after trip end in window queried.

### Pattern summary

| Question | Answer |
|----------|--------|
| `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS` | **PARTIAL** — HMÜ trip-end eng/ign off but `hasActiveTrip=true`; KS MX eng=true at trip end; **0 confirmed** trip-finalized pre-sleep (M3.2A) |
| `PRE_ENGINE_START_WAKE_SAMPLE_EXISTS` | **NO** — KS MS next trip starts at alternator voltage + speed; no isolated pre-crank rest sample |
| `SAMPLE_CADENCE_SUFFICIENT` | **NO** for passive REST windows during sleep |
| `OBSERVED_PATTERN` | **WAKE_ONLY emission** — LV bursts during activity; silence after trip end until next trip |

---

## Step 6 — Trip-end 12.15V sample audit (KS MX)

| Field | Value |
|-------|-------|
| Measurement id | `682269b9-4029-481f-a1f9-2b0a994b9ffb` |
| Provider timestamp | `2026-09-06T20:00:44Z` |
| Ingestion | `2026-09-06T20:01:00.278Z` |
| Voltage | 12.15V |
| speed | 0 |
| ignition | **false** |
| engineRunning | **true** |
| hasActiveTrip | **true** |
| charging | false |
| Classify outcome | NEW_OBSERVATION |

**Semantics:** Plausible resting voltage at trip boundary, but **not** clean post-engine-off evidence — `engineRunning=true`, trip still active in context. Matches **E** (timestamp aligned to trip end) + partial **A** (genuine low V) + **not** policy-eligible for REST due-centered window.

**Cross-vehicle repeatability:**

| Vehicle | Trip-end LV | Repeatable? |
|---------|-------------|-------------|
| KS MX 2024 | 12.15V @ end | YES |
| HMÜ C 215 | 12.868V @ end | YES |
| KS MS 661 | 13.52V @ end | YES |
| WOB L 7503 | none at end | NO |

```
TRIP_END_LV_SAMPLE_SEMANTICS=MIXED_PLAUSIBLE_VOLTAGE_WITH_RESIDUAL_ENGINE_CONTEXT
TRIP_END_LV_REPEATABLE=YES
TRIP_END_LV_POTENTIALLY_USEFUL=CONDITIONAL_NOT_UNDER_CURRENT_REST_WINDOW_POLICY
```

**Do not declare valid rested voltage** under current quality contract.

---

## Step 7 — REST evidence observability deadlock

| Contract | File / symbol | Effect |
|----------|---------------|--------|
| VALID REST requires in-window LIVE_VOLTAGE at rest | `isCandidateEligibleForRestTarget` — `isObservationWithinTargetWindow`, `isEngineOffForRest`, `isSpeedAtRest` | No candidate without new timestamps in `[due±window]` |
| Provider emits LV only during activity | Production fleet forensic | Zero in-window rows while sleeping |
| Wake/activity samples ineligible | `hasWakeContaminationContext`, wake voltage threshold ~13.8V | Alternator samples rejected |
| Trip-end anchor excluded | Window centered on **due_at**, not anchor | 12.15V @ anchor 45m before REST_60M window |
| Post-grace contaminated persistence | `evaluateClassifiedRestTargetOutcome` lines 570–579 | Terminal measurement without health value |

**All three deadlock conditions true:**

```
REST_EVIDENCE_OBSERVABILITY_DEADLOCK=YES
```

The deadlock is **architectural** (evidence model vs signal behavior), not operational failure.

---

## Step 8 — Historical fallback audit

When zero in-window VALID candidates and retry grace elapsed (`evaluateClassifiedRestTargetOutcome`):

1. `selectClassifiedRestTargetObservation` ranks **all classified candidates** in search horizon `[anchor−QW, target+QW+grace]`
2. If none evidence-eligible, picks **best contaminated** by quality priority + distance to target
3. KS MX REST_6H selected `274bbe23` @ `19:48:41` (14.743V, pre-trip alternator) — `selectionMethod=historical_provider_observation`

| Criterion | Verdict |
|-----------|---------|
| `HISTORICAL_FALLBACK_SAFETY_CORRECT` | **YES** — does not produce VALID assessment/publication |
| `HISTORICAL_FALLBACK_SEMANTICALLY_CLEAR` | **NO** — `CONTAMINATED_BY_WAKE` implies wake; vehicle did not wake |
| `HISTORICAL_FALLBACK_OPERATIONALLY_USEFUL` | **NO** — ops forensics misled; no health value |

**Quality taxonomy debt:** Prefer distinct labels e.g. `CONTAMINATED_HISTORICAL_ALTERNATOR` vs session wake. Current `CONTAMINATED_BY_WAKE` conflates observation-era contamination with lifecycle wake events.

---

## Step 9 — Evidence strategy options (observed-data grounded)

| Option | OBSERVABLE | SCIENTIFIC | FP RISK | FN RISK | COVERAGE | PROVIDER DEP | COMPLEXITY | HEALTH SCORE | FAILURE WARN |
|--------|------------|------------|---------|---------|----------|--------------|------------|--------------|--------------|
| A. Passive REST_60M/6H | **NO** during sleep | High if observable | Low | **High** | DIMO ICE | High | Low | Good if VALID | Good if VALID |
| B. Trip-end shutdown anchor | **YES** (repeatable) | Medium | Medium | Medium | High | Medium | Medium | Medium | Medium |
| C. Pre-engine-start wake sample | **NO** (not seen) | High if existed | Low | High | Low | High | High | Good | Good |
| D. Multi-sample decay at shutdown | Partial (mid-trip idle only) | Medium | Medium | Medium | Medium | Medium | High | Medium | Medium |
| E. Alternator/charging response | YES | Low for rest V | High | Low | High | Low | Low | Poor | Poor |
| F. Cross-trip longitudinal | YES (sparse points) | High | Low | Medium | High | Medium | Medium | **Best available** | Good |
| G. DTC-derived LV | Not in prod REST path | Unknown | Unknown | Unknown | Unknown | Medium | High | Unknown | Possible |
| H. Alternate telemetry source | Not deployed | — | — | — | — | — | Very high | — | — |
| I. Hybrid model | **YES** | High | Controlled | Controlled | Highest | Medium | High | **Recommended** | **Recommended** |

---

## Step 10 — Recommended Battery V2 evidence model

### Tier assignment

| Tier | Evidence | Role |
|------|----------|------|
| **PRIMARY** | Trip-end shutdown anchor LV (explicit tier, engine-context qualified) + cross-trip longitudinal VALID LIVE_VOLTAGE trend | Default when sleep blocks passive REST |
| **SECONDARY** | REST_60M / REST_6H **when** in-window LV exists (parked vehicle with continuing telemetry — rare on current DIMO fleet) | Opportunistic high-confidence rest sample |
| **SUPPORTING** | Speed/ignition/engine/charging context, trip FSM, session lifecycle | Contamination guards |
| **UNOBSERVABLE** | True rested voltage during multi-hour sleep without provider emission | Must surface as `INSUFFICIENT_EVIDENCE`, not synthetic VALID |

### REST target roles

```
CURRENT_REST_60M_ROLE=RETAINED_OPPORTUNISTIC
CURRENT_REST_6H_ROLE=RETAINED_OPPORTUNISTIC
```

Do **not** remove — still valid when signal cooperates. Do **not** treat as sole M3.1 validation gate under wake-only DIMO behavior.

### Fallback behavior

```
RECOMMENDED_FALLBACK=INSUFFICIENT_EVIDENCE_UNKNOWN
```

Post-grace contaminated historical rows: retain for audit if needed, but **exclude from health score and customer publication intent**.

```
RECOMMENDED_PRIMARY_EVIDENCE=TRIP_END_SHUTDOWN_ANCHOR_PLUS_LONGITUDINAL_LV
RECOMMENDED_SECONDARY_EVIDENCE=OPPORTUNISTIC_REST_60M_6H_IN_WINDOW
INSUFFICIENT_EVIDENCE_BEHAVIOR=EXPLICIT_UNKNOWN_NOT_CONTAMINATED_PROXY
RECOMMENDED_ARCHITECTURE=HYBRID_TIERED_EVIDENCE_WITH_CONFIDENCE_BANDS
```

Never manufacture certainty.

---

## Step 11 — Impact map (if implemented — not in this audit)

| Area | Impact |
|------|--------|
| **Quality taxonomy** | Split wake-session vs historical-alternator contamination; add `INSUFFICIENT_EVIDENCE` |
| **REST timing policy** | Optional anchor-relative evidence window (architecture decision) |
| **lv-rest-measurement-quality.ts** | New tiers, fallback semantics |
| **battery-rest-target-evaluation.service.ts** | Candidate sources, terminalization |
| **lv-evidence-selection.policy.ts** | Primary/secondary weighting |
| **lv-estimated-health-assessment.policy.ts** | Confidence bands, UNKNOWN handling |
| **BatteryPublicationService** | Gate on evidence tier |
| **LvRestWindow FSM** | Trip-end anchor measurement type (new measurement kind?) |
| **Frontend/API** | Display confidence + insufficient-evidence states |
| **Tests** | Signal-stall fixtures, trip-end anchor fixtures |
| **Docs / graph** | M3.2 spec, CHANGE_LEDGER, Architektur |

**Dependency order:**

1. Evidence tier spec + quality taxonomy (design)
2. Measurement types / provenance contracts
3. Assessment evidence selection + publication policy
4. REST target role demotion to opportunistic
5. UI/API projection
6. M3.1 validation gate revision (explicit signal-aware criteria)

---

## Step 12 — M3.1 / M3.2 status

M3.1 pipeline validation: **PASS** (control plane healthy).  
M3.1 natural E2E validation: **blocked** by signal observability — **do not** set `PRODUCTION_VALIDATED=YES`.

```
IMPLEMENTATION_REQUIRED=YES
NEXT_IMPLEMENTATION_PHASE=M3.2_SIGNAL_OBSERVABILITY_EVIDENCE_MODEL
```

---

## Machine-readable block

```
BATTERY_V2_M3_2_SIGNAL_OBSERVABILITY_AUDIT=COMPLETE

PARKED_LV_DISAPPEARANCE_LAYER=INGESTION_DEDUP_AFTER_PROVIDER_TIMESTAMP_STALL
PARKED_LV_PROVIDER_EMISSION=NO_NEW_TIMESTAMP_WHILE_SLEEPING
PARKED_LV_POLL_REQUESTED=YES
PARKED_LV_RESPONSE_PRESENT=YES
PARKED_LV_TIMESTAMP_ADVANCES=NO
PARKED_LV_PERSISTED=NO_AFTER_INITIAL_TRIP_END_SAMPLE
PARKED_LV_BATTERY_VISIBLE=NO_IN_REST_QUALITY_WINDOWS

POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=PARTIAL
CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP=NO
PRE_ENGINE_START_WAKE_SAMPLE_EXISTS=NO
TRIP_END_LV_SAMPLE_SEMANTICS=MIXED_PLAUSIBLE_VOLTAGE_WITH_RESIDUAL_ENGINE_CONTEXT
TRIP_END_LV_REPEATABLE=YES
TRIP_END_LV_POTENTIALLY_USEFUL=CONDITIONAL_NOT_UNDER_CURRENT_REST_WINDOW_POLICY

REST_EVIDENCE_OBSERVABILITY_DEADLOCK=YES

HISTORICAL_FALLBACK_SAFETY_CORRECT=YES
HISTORICAL_FALLBACK_SEMANTICALLY_CLEAR=NO
HISTORICAL_FALLBACK_OPERATIONALLY_USEFUL=NO

CURRENT_REST_60M_ROLE=RETAINED_OPPORTUNISTIC
CURRENT_REST_6H_ROLE=RETAINED_OPPORTUNISTIC

RECOMMENDED_PRIMARY_EVIDENCE=TRIP_END_SHUTDOWN_ANCHOR_PLUS_LONGITUDINAL_LV
RECOMMENDED_SECONDARY_EVIDENCE=OPPORTUNISTIC_REST_60M_6H_IN_WINDOW
RECOMMENDED_FALLBACK=INSUFFICIENT_EVIDENCE_UNKNOWN
INSUFFICIENT_EVIDENCE_BEHAVIOR=EXPLICIT_UNKNOWN_NOT_CONTAMINATED_PROXY

RECOMMENDED_ARCHITECTURE=HYBRID_TIERED_EVIDENCE_WITH_CONFIDENCE_BANDS
IMPLEMENTATION_REQUIRED=YES

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

NEXT_IMPLEMENTATION_PHASE=M3.2_SIGNAL_OBSERVABILITY_EVIDENCE_MODEL

PR_1551_STATUS=DRAFT
PRODUCTION_CHANGED=NO
```
