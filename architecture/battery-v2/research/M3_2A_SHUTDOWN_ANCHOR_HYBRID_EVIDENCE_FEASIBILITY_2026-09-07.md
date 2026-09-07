# M3.2A — Shutdown Anchor Semantics & Hybrid Evidence Model Feasibility Audit

**Audit timestamp:** `2026-09-07T04:30:00Z`  
**Scope:** Read-only pre-implementation feasibility audit  
**Production changed:** NO  
**Stage-2 T0:** `2026-09-05T23:36:12Z`  
**Supersedes (partial):** M3.2 machine-readable claim `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES` — see Step 1  
**Prior work:** `M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md`, KS MX session `82324f65`

---

## Executive summary

M3.2 correctly identified the REST observability deadlock and proposed a hybrid evidence model with a **trip-end shutdown anchor** as PRIMARY. M3.2A tests whether that primary evidence has a **scientifically defensible acquisition contract** using production data only.

**Verdict:** Trip-end LV is **observable and partially repeatable**, but **not state-verifiable** with current persisted context. No sample meets a full **confirmed post-engine-off / pre-sleep / trip-finalized** contract. HMÜ C 215 provides the best shutdown-transition candidates (4/4 post-T0 trips); KS MX 2024 trip-end sample is **contaminated by residual `engineRunning=true`**; KS MS 661 and WOB L 7503 trip-end samples are alternator- or driving-contaminated.

**Implementation decision:** `HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA` — not `HYBRID_MODEL_IMPLEMENTATION_READY`. Required missing evidence: samples with **aligned trip FSM finalization**, **independently timestamped state fields**, and/or **post-trip LV emission after sleep** (currently absent fleet-wide).

---

## Step 1 — Reconcile the apparent contradiction

### M3.2 claim vs KS MX trip-end observation

M3.2 machine-readable block states:

```
POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES
```

M3.2 Step 5 narrative already qualified this as *"intermittent mid-trip idle (speed 0, ~12–13V) but usually `hasActiveTrip=true`"*, but the machine-readable flag reads as a binary existence proof for post-engine-off pre-sleep evidence.

KS MX 2024 canonical trip end (`2026-09-06T20:00:44Z`, measurement `682269b9`):

| Field | Value |
|-------|-------|
| LV | 12.15 V |
| speed | 0 |
| ignition | false |
| engineRunning | **true** |
| hasActiveTrip | **true** |
| isLvCharging | false |

This is **explicitly NOT clean post-engine-off** under any strict contract.

### Root cause analysis (options A–E)

| Option | Supported? | Evidence |
|--------|------------|----------|
| **A.** Another observation after trip end proves post-engine-off | **NO** | Zero LV rows after `20:00:44Z` until next activity (~7h silence) |
| **B.** Another vehicle proves clean pattern | **PARTIAL** | HMÜ: 4 trip-end samples with speed=0, ign=false, eng=false — but all `hasActiveTrip=true` |
| **C.** Trip FSM end and provider engine state temporally skewed | **YES** | Trip `end_time` aligns with LV provider timestamp; `hasActiveTrip` still true at persist; HMÜ ingest lag up to 44s on trip-end row |
| **D.** State fields stale / carry-forward | **YES** | `buildRestTargetContext()` binds speed/ignition/engine/trip from **current VLS + tripDetectionState at persist**, not per-signal provider timestamps |
| **E.** M3.2 machine-readable claim too strong | **YES** | Conflates mid-trip idle low-V samples and trip-end plausible voltage with **confirmed** post-engine-off pre-sleep |

### Step 1 returns

```
POST_ENGINE_OFF_PRE_SLEEP_CLAIM_SUPPORTED=PARTIAL
SUPPORTING_VEHICLES=HMÜ C 215 (4 trip-end candidates); KS MX 2024 (plausible voltage only, engine context contaminated)
SUPPORTING_OBSERVATIONS=HMÜ: 12.424V@11:07:11, 12.340V@15:42:16, 12.192V@15:58:38, 12.868V@16:09:59 — all speed=0 ign=false eng=false hasActiveTrip=true; KS MX: 12.15V@20:00:44 eng=true hasActiveTrip=true
CONTRADICTIONS=KS MX trip-end contradicts strict post-engine-off; all HMÜ candidates contradict trip-finalized contract (hasActiveTrip=true); M3.2 YES flag overstates mid-trip idle + trip-end mixed semantics
M3_2_DOCUMENTATION_CORRECTION_REQUIRED=YES
```

**Correction:** Replace `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES` with `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=PARTIAL` and distinguish `SHUTDOWN_TRANSITION_CANDIDATE_EXISTS=YES` from `CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP=NO`.

---

## Step 2 — Timestamp semantics

### Signal inventory and timestamp ownership

| Signal / field | Timestamp source | Atomic with LV? |
|----------------|------------------|-----------------|
| LV voltage value | Provider `lowVoltageBatteryCurrentVoltage.timestamp` → `observedAt` / `providerTimestamp` on measurement | **YES** (single provider signal) |
| Provider fetch | `providerFetchedAt` on snapshot context | Separate (ingestion wall clock) |
| SynqDrive ingestion | `receivedAt` on measurement | Separate (~3–49s after `observedAt` in sample) |
| speedKmh | `vehicle_latest_states` at **persist time** | **NO** |
| ignitionOn | VLS `isIgnitionOn` at persist | **NO** |
| engineRunning | Derived from VLS `engineLoad > 5` at persist | **NO** |
| hasActiveTrip | `tripDetectionState.activeTripId != null` at persist | **NO** |
| charging context | LV threshold + VLS HV charging flags at persist | **NO** |
| trip end (canonical) | `vehicle_trips.end_time` | Separate FSM event |
| trip FSM state | `vehicle_trip_detection_states.state` | Not stored on measurement |
| LV per-HV signal times | `signalObservedAt` on snapshot context (HV only) | **Not used for REST context** |

**Code anchor:** `LvLiveVoltageIngestionService.buildRestTargetContext()` — LV `observedAt` from provider; all motion/engine/trip flags from DB row at write time.

### Skew measurements (production)

| Case | LV observedAt | Context anomaly | Ingest lag |
|------|---------------|-----------------|------------|
| KS MX trip end | `20:00:44` | speed=0, ign=false, **eng=true** | 16s |
| HMÜ trip end `16:09:59` | `16:09:59` | eng=false but **hasActiveTrip=true** | **44s** |
| KS MX pre-end alternator | `19:48:41–19:58:45` | eng=true while speed varies 0–117 | 4–49s |

`lv-rest-measurement-quality.ts` defines `TIMESTAMP_SKEW_MS = 5 * 60_000` for REST evaluation — acknowledges cross-field skew risk, but LIVE_VOLTAGE persist path does not attach per-field `stateObservedAt`.

### Step 2 returns

```
SNAPSHOT_FIELDS_ATOMIC=NO
CROSS_SIGNAL_TIMESTAMP_SKEW_PRESENT=YES
MAX_OBSERVED_RELEVANT_SKEW=44s (HMÜ trip-end ingest lag; trip FSM vs hasActiveTrip unbounded — persists through trip-end boundary)
STATE_CARRY_FORWARD_PRESENT=YES
TRIP_END_AND_LV_TEMPORALLY_ALIGNED=PARTIAL (provider LV timestamp aligns to trip end on 7/13 trips within ±5s; state flags not co-timestamped)
```

**Rule:** Do **not** classify voltage using state flags without explicit timestamp alignment metadata and uncertainty tier.

---

## Step 3 — Multi-vehicle shutdown forensics

**Cohort:** ICE trips with `end_time >= 2026-09-05T23:36:12Z` for KS MX 2024, KS MS 661, HMÜ C 215, WOB L 7503. WOB L 9755: **0 post-T0 trips** (insufficient fresh data).

**Trips analyzed:** 13 (KS MS 6, HMÜ 4, KS MX 1, WOB 7503 2)

### Per-trip nearest LV within ±10 minutes of trip end

| Vehicle | Trip end (UTC) | Nearest LV | Δs | V | spd | ign | eng | trip | Class (Step 4) |
|---------|----------------|------------|-----|---|-----|-----|-----|------|----------------|
| KS MX 2024 | 20:00:44 | 20:00:44 | 0 | 12.15 | 0 | F | **T** | T | SHUTDOWN_TRANSITION |
| HMÜ | 11:07:11 | 11:07:11 | 0 | 12.424 | 0 | F | F | T | POST_ENGINE_OFF (partial) |
| HMÜ | 15:42:16 | 15:42:18 | 2 | 12.340 | 0 | F | F | T | POST_ENGINE_OFF (partial) |
| HMÜ | 15:58:36 | 15:58:38 | 2 | 12.192 | 0 | F | F | T | POST_ENGINE_OFF (partial) |
| HMÜ | 16:09:59 | 16:09:59 | 0 | 12.868 | 0 | F | F | T | POST_ENGINE_OFF (partial) |
| KS MS | 07:43:30 | 07:43:32 | 2 | 13.507 | 0 | F | **T** | T | ACTIVE_NON_CHARGING |
| KS MS | 08:33:42 | 08:32:07 | 96 | 13.579 | 0 | F | **T** | T | ACTIVE_NON_CHARGING |
| KS MS | 09:35:00 | 09:35:04 | 4 | 13.622 | 0 | F | **T** | T | ACTIVE_NON_CHARGING |
| KS MS | 09:47:42 | 09:47:26 | 17 | 13.623 | 0 | F | **T** | F | ACTIVE_NON_CHARGING |
| KS MS | 15:51:42 | 15:50:46 | 57 | 13.520 | 0 | F | **T** | T | ACTIVE_NON_CHARGING |
| KS MS | 00:22:19 | 00:21:20 | 60 | 13.507 | 0 | F | **T** | T | ACTIVE_NON_CHARGING |
| WOB 7503 | 10:35:42 | 10:35:09 | 34 | 14.344 | 13 | T | T | T | ACTIVE_ALTERNATOR |
| WOB 7503 | 19:36:13 | 19:35:43 | 30 | 14.253 | 18 | F | T | T | ACTIVE_ALTERNATOR |

### Representative final-10-minute chronology — KS MX 2024 (trip `c2d99942`)

| timestamp | LV | speed | ign | eng | trip | charging |
|-----------|-----|-------|-----|-----|------|----------|
| 19:48:41 | 14.743 | 0 | T | T | F | alt-era |
| 19:50:42 | 14.818 | 13 | T | T | T | alt-era |
| 19:56:42 | 14.834 | 117 | T | T | T | alt-era |
| 19:58:45 | 14.804 | 80 | T | T | T | alt-era |
| **20:00:44** | **12.15** | **0** | **F** | **T** | **T** | non-chg |
| after | *none* | — | — | — | — | silence ~7h |

### Representative final-10-minute chronology — HMÜ C 215 (trip `926488b2`, end 16:09:59)

| timestamp | LV | speed | ign | eng | trip |
|-----------|-----|-------|-----|-----|------|
| 16:02:36 | 12.666 | 0 | F | F | T |
| 16:05:26 | 13.703 | 7 | T | T | T |
| 16:09:35 | 13.010 | 17 | T | T | T |
| **16:09:59** | **12.868** | **0** | **F** | **F** | **T** |
| after | *none until next day* | — | — | — | — |

### WOB L 7503 evening trip — no LV at/after end

Last rows before `19:36:13` end remain at 14.25–14.39 V with speed 15–22 km/h — **no shutdown sample at trip boundary**.

---

## Step 4 — Classify every shutdown sample

### Evidence classes (defined before health conclusions)

| Class | Definition |
|-------|------------|
| `ACTIVE_ALTERNATOR` | speed > 5 and/or LV ≥ ~13.8 V with engine/charging context |
| `ACTIVE_NON_CHARGING` | Low speed, low-moderate V, but engineRunning true or ambiguous load |
| `SHUTDOWN_TRANSITION` | speed=0, plausible rest V, but engine and/or trip FSM not clean |
| `POST_ENGINE_OFF_PRE_SLEEP` | speed=0, ign off, eng off, non-charging, **trip finalized** |
| `UNKNOWN_STATE` | Missing context fields |
| `STALE_OR_SKEWED_STATE` | LV timestamp plausible but context flags inconsistent with voltage era |

### Deterministic classification possible?

**PARTIAL.** Voltage + speed bands reliably exclude alternator-era samples. **Cannot** deterministically confirm trip-finalized or engine-off without independent state timestamps. KS MX trip-end is **`STALE_OR_SKEWED_STATE` + `SHUTDOWN_TRANSITION`** (ign off, eng on — internally inconsistent).

### Per-candidate summary

| Count | Class |
|-------|-------|
| 4 | POST_ENGINE_OFF (partial — missing trip finalized) |
| 1 | SHUTDOWN_TRANSITION (KS MX) |
| 6 | ACTIVE_NON_CHARGING (KS MS) |
| 2 | ACTIVE_ALTERNATOR (WOB) |

---

## Step 5 — Trip-end sample repeatability

```
TRIPS_ANALYZED=13
TRIPS_WITH_LV_NEAR_END=13
TRIPS_WITH_LV_AT_EXACT_END=7
TRIPS_WITH_PLAUSIBLE_SHUTDOWN_TRANSITION=4
TRIPS_WITH_CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP=0
TRIPS_WITH_ONLY_ALTERNATOR_CONTAMINATED_END=2
TRIPS_WITH_AMBIGUOUS_END_STATE=0
```

**Notes:**

- `CONFIRMED` requires trip finalized (`hasActiveTrip=false` or explicit post-trip relation) — **0** trips meet this.
- `PLAUSIBLE_SHUTDOWN_TRANSITION` = HMÜ only (eng/ign off, speed 0, V ≤ 13.5, within ±10m).
- KS MS/WOB counted under alternator/non-charging contamination, not ambiguous — nearest sample class is explicit.

### Descriptive stats — HMÜ partial shutdown cohort (n=4)

| Metric | Value |
|--------|-------|
| Time vs trip end | 0–2 s (provider-aligned) |
| Voltage range | 12.192 – 12.868 V |
| Observations per trip | 1 at boundary |
| Vehicle distribution | HMÜ C 215 only |

**Do not derive health thresholds** from this n=4 single-vehicle cohort.

---

## Step 6 — Can trip-end be PRIMARY evidence?

| Strategy | OBS | REPEAT | STATE_VER | TS_RELIABLE | ALT_CONTAM | CARRY_FWD | PRIMARY | SECONDARY |
|----------|-----|--------|-----------|-------------|------------|-----------|---------|-----------|
| **A.** Exact trip-end voltage | YES | YES (7/13) | **NO** | PARTIAL | HIGH | HIGH | **NO** | CONDITIONAL |
| **B.** Last LV before trip end | YES | YES | NO | PARTIAL | HIGH | HIGH | **NO** | NO |
| **C.** First LV after trip end | YES (KS MX/HMÜ) | YES | NO | YES for LV only | LOW for V | HIGH for state | **NO** | CONDITIONAL |
| **D.** Nearest non-charging LV around end | YES | YES (HMÜ) | PARTIAL | PARTIAL | MEDIUM | HIGH | **NO** | YES (HMÜ-like) |
| **E.** State-qualified shutdown transition | PARTIAL | YES (HMÜ 4/4) | **NO** | **NO** | MEDIUM | **YES** | **NO** | **YES** |

**Conclusion:** Availability ≠ validity. Trip-end voltage is **secondary/corroborating** at best until state alignment is fixed or independently verified.

```
EXACT_TRIP_END_PRIMARY_SUITABILITY=NO
STATE_QUALIFIED_SHUTDOWN_PRIMARY_SUITABILITY=NO
```

---

## Step 7 — Longitudinal evidence feasibility

### What can be compared defensibly?

| Factor | Fleet evidence |
|--------|----------------|
| Same vehicle across trips | HMÜ: 4 aligned points; KS MX: 1; KS MS: 6 points but contaminated eng context |
| Similar shutdown state | Only HMÜ approximates; never trip-finalized |
| Charging context | Mostly non-charging at HMÜ trip ends |
| Temperature | Trip-level exterior temp on `vehicle_trips` — not bound to LV sample in measurement |
| Trip duration | 7–42 min — heterogeneous |
| Voltage stabilization | Single sample at boundary; no decay series post-shutdown |
| Observation-state consistency | **Poor** — engine flag unreliable |

### Distinction: absolute SOH vs longitudinal anomaly

| Capability | Verdict | Rationale |
|------------|---------|-----------|
| Absolute SOH from current LV | **UNSUPPORTED** | Contamination + no rest contract + n too small |
| Longitudinal anomaly detection | **WEAK** | HMÜ 4-point same-vehicle spread ~0.68 V may reflect trip/context noise, not degradation |
| Failure warning potential | **WEAK** | Would need repeated low shutdown-transition series + DTC/crank corroboration |

```
ABSOLUTE_SOH_FROM_CURRENT_LV=UNSUPPORTED
LONGITUDINAL_ANOMALY_DETECTION=WEAK
FAILURE_WARNING_POTENTIAL=WEAK
```

Longitudinal trend may eventually support **`DEGRADATION_SUSPECTED`** — not **`BATTERY_SOH=62%`**.

---

## Step 8 — DTC and supporting signal audit

| Signal | Role | Rationale |
|--------|------|-----------|
| LV-related DTCs | **CORROBORATING** | Strengthen failure suspicion; not resting voltage |
| Starting / crank behavior | **CORROBORATING** | Not observed in REST path; would need event integration |
| Alternator / charging voltage | **SECONDARY** | Explains contamination; not rest SOH |
| Exterior temperature | **CORROBORATING** | Band normalization only with matched context |
| Repeated low shutdown observations | **SECONDARY** | Trend input after class contract fixed |
| Telemetry / connectivity quality | **CORROBORATING** | Explains missing evidence, not health |
| Trip frequency / inactivity | **CORROBORATING** | Session scheduling context |
| Long inactivity + no LV | **CORROBORATING** | Supports INSUFFICIENT_EVIDENCE, not LOW battery |
| REST_60M / REST_6H in-window | **PRIMARY** (when exists) | True rest if ever observable — currently fleet-rare |
| Trip-end shutdown LV | **SECONDARY** (pending contract) | Not PRIMARY until state-verifiable |
| Historical contaminated fallback | **NOT_USEFUL** | Terminal audit only |

---

## Step 9 — Evidence confidence contract (conceptual)

### Minimum observation fields

| Field | Required? | Purpose |
|-------|-----------|---------|
| `evidenceType` | YES | e.g. `IN_WINDOW_REST`, `SHUTDOWN_TRANSITION`, `LONGITUDINAL_TREND` |
| `voltage` | YES | Observed value |
| `observedAt` | YES | Provider LV timestamp |
| `stateObservedAt` | **YES (new)** | Per-field or bundle timestamp for motion/engine/trip flags |
| `tripRelation` | YES | `AT_TRIP_END`, `POST_TRIP`, `MID_TRIP`, `UNKNOWN` |
| `engineState` | YES | With provenance |
| `ignitionState` | YES | With provenance |
| `chargingContext` | YES | LV + HV charging discrimination |
| `speed` | YES | Contamination guard |
| `temperature` | OPTIONAL | Normalization |
| `timestampSkew` | YES | Max delta among bound fields |
| `stateCompleteness` | YES | `COMPLETE`, `PARTIAL`, `MISSING` |
| `qualityClass` | YES | From Step 12 taxonomy |
| `confidenceClass` | YES | Tier below |

### Confidence tiers

| Tier | Qualification |
|------|---------------|
| **HIGH** | In-window REST: speed=0, eng off, ign off, trip finalized, no charging, timestamp skew ≤ 60s, provider NEW_OBSERVATION |
| **MEDIUM** | Shutdown-transition at trip boundary: eng off, ign off, speed=0, non-charging, LV plausible — **but** trip FSM not finalized OR skew ≤ 5m |
| **LOW** | Trip-end voltage plausible but engine/trip context inconsistent or single-sample |
| **INSUFFICIENT** | No qualifying observation, stale replay only, or active alternator/driving context |

Existing `LvAssessmentConfidenceLevel` (`HIGH|MEDIUM|LOW|INSUFFICIENT`) can map to these tiers **after** evidence type separation — not before.

---

## Step 10 — Hybrid evidence hierarchy (evidence-proven only)

M3.2 proposed PRIMARY = shutdown anchor + longitudinal trend. **M3.2A revises** — shutdown anchor cannot be Tier 1/2 PRIMARY until contract fixed.

| Tier | Evidence | Required | Excluded | Confidence | Assessment | Publication | Health score | Warning |
|------|----------|----------|----------|------------|------------|-------------|--------------|---------|
| **1** | True in-window REST LIVE_VOLTAGE | Natural LV in REST_60M/6H window, full rest context | Wake, charging, active trip | HIGH | YES | YES (if policy) | YES | YES |
| **2** | Confirmed post-engine-off pre-sleep | Tier 1 + trip finalized + state timestamps aligned | eng on, trip active, skew > 5m | HIGH | YES | YES | YES | YES |
| **3** | State-qualified shutdown-transition + longitudinal baseline | HMÜ-like eng/ign off at boundary + ≥3 comparable samples/vehicle | Alternator era, single sample | MEDIUM | YES (trend/anomaly) | LIMITED | **NO absolute SOH** | SUSPECTED only |
| **4** | Corroborating DTC / charging / connectivity | Supports tiers 1–3 | Must not alone verdict | LOW | NO alone | NO alone | NO | CORROBORATE |
| **NONE** | Insufficient | — | — | INSUFFICIENT | NO | NO | NO | NO |

```
RECOMMENDED_TIER_1=IN_WINDOW_REST_WHEN_NATURALLY_AVAILABLE
RECOMMENDED_TIER_2=CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP (NOT YET OBSERVED)
RECOMMENDED_TIER_3=SHUTDOWN_TRANSITION_PLUS_LONGITUDINAL_VEHICLE_BASELINE
RECOMMENDED_TIER_4=CORROBORATING_DTC_CHARGING_CONNECTIVITY
INSUFFICIENT_EVIDENCE_BEHAVIOR=EXPLICIT_UNKNOWN_NO_CONTAMINATED_PROXY_HEALTH_VERDICT
```

REST_60M/REST_6H remain **`RETAINED_OPPORTUNISTIC`** (unchanged from M3.2).

---

## Step 11 — Assessment semantics

### Required conceptual split

| Evidence kind | May support | Must NOT support alone |
|---------------|-------------|------------------------|
| **DIRECT_BATTERY_STATE_EVIDENCE** | Resting voltage band → SOH/status | Trend without rest contract |
| **LONGITUDINAL_ANOMALY_EVIDENCE** | `DEGRADATION_SUSPECTED`, comparative warning | Numeric SOH%, publication as definitive health |

### Current model gap

- `LvChemistryAssessmentContext` maps `restingVoltageV` → band → `BatteryHealthStatus` with `confidenceScore` — **assumes resting semantics**.
- `canonical-battery` exposes generic `evidenceType` but LV REST/shutdown paths do not distinguish direct vs longitudinal.
- Publication policy (`evaluateLvPublicationPolicy`) gates on assessment quality — no separate **anomaly publication track**.

**Required changes (documentation only):**

1. Add `evidenceKind: DIRECT_STATE | LONGITUDINAL_ANOMALY` on assessment input contract.
2. Block numeric SOH publication from Tier 3 anomaly-only assessments.
3. Allow `DEGRADATION_SUSPECTED` / watch-tier publication with explicit non-SOH wording.

```
DIRECT_BATTERY_STATE_EVIDENCE_SUPPORTED=PARTIAL (in-window REST only when VALID)
LONGITUDINAL_ANOMALY_EVIDENCE_SUPPORTED=WEAK (HMÜ cohort insufficient)
```

---

## Step 12 — Quality taxonomy cleanup

### Problem

`CONTAMINATED_BY_WAKE` labels:

- Session wake after resting (original intent)
- Pre-anchor alternator observations (`WAKE_AFTER_RESTING=NO`)
- Historical fallback selections

### Proposed taxonomy

| New label | Maps from | Meaning |
|-----------|-----------|---------|
| `SESSION_WAKE_CONTAMINATION` | Wake flank after RESTING session | Lifecycle wake event |
| `ACTIVE_VEHICLE_CONTAMINATION` | Engine running / active trip / driving speed | Vehicle not at rest |
| `CHARGING_OR_ALTERNATOR_CONTAMINATION` | LV ≥ threshold, charging flags | Alternator/charger influence |
| `OUTSIDE_TARGET_WINDOW` | Valid rest context but wrong time | Window policy |
| `STALE_REPLAY` | Provider timestamp stall / DUPLICATE | No new observation |
| `STATE_TIMESTAMP_AMBIGUITY` | **NEW** | Context fields not co-timestamped with LV |

**Runtime mapping (future):** Existing `CONTAMINATED_BY_WAKE` → split by reason code in `lv-rest-measurement-quality.ts` and historical fallback path.

```
QUALITY_TAXONOMY_CHANGE_REQUIRED=YES
```

---

## Step 13 — Go / no-go

**Selected:** **B — `HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA`**

Not A: no proven, repeatable, state-verifiable primary acquisition contract.  
Not C: alternate source not required yet — HMÜ pattern shows signal exists but state binding broken.  
Not D: data supports **partial** shutdown-transition detection — not total insufficiency.

### Missing evidence (specific)

1. **Trip-finalized shutdown samples** — `hasActiveTrip=false` at/post trip end with LV (0/13 trips).
2. **State timestamp metadata** on persisted measurements (code gap, not natural data).
3. **Multi-vehicle repeatable clean shutdown** — HMÜ only, n=4, single vehicle.
4. **Post-trip pre-sleep LV series** — any decay/stabilization after engine off (0 trips).
5. **In-window REST during sleep** — fleet 0 post-T0 VALID (unchanged M3.1 blocker).

```
IMPLEMENTATION_DECISION=HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA
IMPLEMENTATION_READY=NO
```

---

## Step 14 — Implementation blueprint (conditional — not authorized this run)

**Gate:** Proceed only after Tier 2 contract observable in production shadow validation.

### Phase ordering (conceptual)

1. **Evidence contract** — extend measurement context with `stateObservedAt`, `tripRelation`, `timestampSkew`, new quality taxonomy (shadow-only labels).
2. **Ingestion fix** — bind REST context from snapshot-era signals or stamp VLS read time; stop inferring `engineRunning` without load timestamp.
3. **Shutdown anchor selector** — explicit policy module (not REST window-centered); no health verdict from anchor alone.
4. **Longitudinal store** — per-vehicle shutdown-transition series with comparability key (duration, temp bucket, charging history).
5. **Assessment split** — `DIRECT_STATE` vs `LONGITUDINAL_ANOMALY` assessment types.
6. **Publication gates** — anomaly track vs SOH track.
7. **REST targets** — remain opportunistic; historical fallback relabeled; never PRIMARY.
8. **Shadow validation** — require ≥2 vehicles, ≥10 confirmed or ≥20 partial shutdown transitions before PRIMARY promotion.
9. **Rollout** — feature flag `BATTERY_V2_HYBRID_EVIDENCE_SHADOW` → assess-only → publication.
10. **Rollback** — flag off; revert to INSUFFICIENT_EVIDENCE for ICE LV SOH.

### Touch surfaces

- `lv-live-voltage-ingestion.service.ts`, `lv-rest-measurement-quality.ts`, `battery-rest-target-evaluation.ts`
- New: `lv-shutdown-anchor.policy.ts` (conceptual)
- Assessment: `lv-estimated-health-assessment.policy.ts`, publication service
- API/UI: expose `confidenceClass`, `evidenceKind`, not raw contaminated REST as health

---

## Step 15 — Documentation actions

- Created this document.
- M3.2 errata: supersede `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES` → `PARTIAL` / `CONFIRMED=NO`.
- Updated `CURRENT_STATE.md`, `CHANGE_LEDGER.md`.

---

## Machine-readable block

```
BATTERY_V2_M3_2A_FEASIBILITY_AUDIT=COMPLETE

POST_ENGINE_OFF_PRE_SLEEP_CLAIM_SUPPORTED=PARTIAL
M3_2_DOCUMENTATION_CORRECTION_REQUIRED=YES

TRIPS_ANALYZED=13
VEHICLES_ANALYZED=4

TRIPS_WITH_LV_NEAR_END=13
TRIPS_WITH_PLAUSIBLE_SHUTDOWN_TRANSITION=4
TRIPS_WITH_CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP=0
TRIPS_WITH_AMBIGUOUS_END_STATE=0

SNAPSHOT_FIELDS_ATOMIC=NO
CROSS_SIGNAL_TIMESTAMP_SKEW_PRESENT=YES
STATE_CARRY_FORWARD_PRESENT=YES
TRIP_END_AND_LV_TEMPORALLY_ALIGNED=PARTIAL

EXACT_TRIP_END_PRIMARY_SUITABILITY=NO
STATE_QUALIFIED_SHUTDOWN_PRIMARY_SUITABILITY=NO

ABSOLUTE_SOH_FROM_CURRENT_LV=UNSUPPORTED
LONGITUDINAL_ANOMALY_DETECTION=WEAK
FAILURE_WARNING_POTENTIAL=WEAK

DIRECT_BATTERY_STATE_EVIDENCE_SUPPORTED=PARTIAL
LONGITUDINAL_ANOMALY_EVIDENCE_SUPPORTED=WEAK

RECOMMENDED_TIER_1=IN_WINDOW_REST_WHEN_NATURALLY_AVAILABLE
RECOMMENDED_TIER_2=CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP
RECOMMENDED_TIER_3=SHUTDOWN_TRANSITION_PLUS_LONGITUDINAL_VEHICLE_BASELINE
RECOMMENDED_TIER_4=CORROBORATING_DTC_CHARGING_CONNECTIVITY
INSUFFICIENT_EVIDENCE_BEHAVIOR=EXPLICIT_UNKNOWN_NO_CONTAMINATED_PROXY_HEALTH_VERDICT

QUALITY_TAXONOMY_CHANGE_REQUIRED=YES

IMPLEMENTATION_DECISION=HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA
IMPLEMENTATION_READY=NO

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

PR_1551_STATUS=DRAFT
PRODUCTION_CHANGED=NO
```
