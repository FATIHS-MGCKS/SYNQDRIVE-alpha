# M3.3 B1.2W — R1 ICE Provider Observability Gap State Machine (authoritative closure)

**Date:** `2026-09-21` (forensics through `2026-09-21T22:17Z`; semantic closure `B1.2W`)  
**Mode:** architecture authority — **documentation only** in B1.2X PR; **no runtime implementation**  
**Immutable B1 T0:** `M3_3_B1_T0=2026-09-21T18:08:19Z`

**Predecessor chain (read-only forensics):**

| Phase | Result |
|-------|--------|
| B1.2T | `B1_2T_PROVIDER_OBSERVABILITY_GAP` (WOB L 7503 reference trip) |
| B1.2U | `B1_2U_COHORT_OBSERVABILITY_CONTRACT_GAP` (R1 ICE cohort) |
| B1.2V | `B1_2V_MULTI_LAYER_ARCHITECTURE_CHANGE_REQUIRED` |
| B1.2W | `B1_2W_GAP_STATE_MODEL_SUFFICIENT_FOR_STATE_MACHINE_LIVENESS` |

---

## 0 — Critical semantic invariants (normative)

These MUST hold in all future implementation and acceptance text:

| Rule | Meaning |
|------|---------|
| `NO_TELEMETRY != ENGINE_OFF` | Provider silence or gap ≠ physical shutdown |
| `TRIP_COMPLETED != ENGINE_OFF` | Trip FSM end ≠ engine-off evidence |
| `IGNITION_FALSE_ALONE != ENGINE_OFF` | Ignition false without trustworthy engine-off bundle is insufficient |
| `STALE_REPLAY != NEW_EVIDENCE` | Duplicate provider timestamp+value is not a new measurement |
| `PROVIDER_OBSERVABILITY_GAP != ENGINE_OFF` | Gap is observability-only |
| `PROVIDER_OBSERVABILITY_GAP != REST` | Gap does not open rest session or rest age |
| `PROVIDER_OBSERVABILITY_GAP != PARKED` | Gap does not assert parked-rest candidate |
| No authoritative rest age from gap | `actualRestAgeMs` starts only after trustworthy OFF at **T4** |
| No raw provider timestamp mutation | No backdating ENGINE_OFF or rest anchor |

---

## 1 — Production evidence leading to the decision

### 1.1 Reference event (B1.2T / B1.2R — WOB L 7503)

| Field | Value |
|-------|-------|
| Trip | `db0039e8-748f-456c-ba4c-2d89854fc851` |
| `TRIP_ENDED_AT` | `2026-09-21T18:47:47.634Z` |
| Last persisted LV @ provider time | `2026-09-21T18:47:56Z`, 14.126 V |
| Context | `ignition=false`, `engineRunning=true` (load-derived), `speed=0`, LV charging |
| Post-park | SNAPSHOT polls continue; **no** advancing LV `provider_timestamp`; stale replay suppression **working** |
| Post-T0 | **0** `ENGINE_OFF_TRANSITION`; **0** rest sessions |

See `M3_3_B1_2R_WOB_L7503_NATURAL_SHUTDOWN_FORENSICS_2026-09-21.md`.

### 1.2 R1 ICE cohort (B1.2U)

**Cohort definition (production):** `vehicles.hardware_type = 'LTE_R1'` AND `fuel_type IN ('GASOLINE','DIESEL')` — five vehicles; active cycle analysis excludes inactive **WOB L 9755**.

| Vehicle | Classification evidence |
|---------|-------------------------|
| HMÜ C 215 | `LTE_R1` + `GASOLINE` |
| KS MS 661 | `LTE_R1` + `GASOLINE` |
| KS MX 2024 | `LTE_R1` + `GASOLINE` |
| WOB L 7503 | `LTE_R1` + `GASOLINE` |
| WOB L 9755 | `LTE_R1` + `GASOLINE` (inactive; excluded from 20-trip table) |

**20-trip sample (5 per active vehicle, 30d):**

| Cycle class | Count |
|-------------|------:|
| `FRESH_POST_ENGINE_OFF_LV` | 13 (often **hours** later — wake-scale, not immediate post-park) |
| `FRESH_PROVIDER_SIGNAL_NO_TRUSTWORTHY_OFF` | 3 |
| `PROVIDER_TIMESTAMP_FROZEN_AFTER_RUNNING_STATE` | 4 |

**Post–B1-T0 trips (n=3):** WOB ×2, KS MS ×1 — **0** with fresher `provider_timestamp` after near-park when last near-park had `engineRunning=true`.

**Freeze pattern reproduced:** WOB L 7503, KS MS 661, KS MX 2024 on `2026-09-21`.

**Post-T0 fleet:** **0** `ENGINE_OFF_TRANSITION`; **0** rest sessions on ICE cohort.

```
R1_ICE_POST_ENGINE_OFF_FRESH_LV_OBSERVED=YES
R1_ICE_POST_ENGINE_OFF_FRESH_LV_RELIABLE=NO
OBSERVABILITY_CONTRACT_GAP_REPRODUCED_ACROSS_COHORT=YES
```

### 1.3 Provider timestamp freeze behavior

- DIMO **SNAPSHOT** (`signalsLatest`) may return **success** while **`source_timestamp` / LV provider `observedAt` stop advancing**.
- `vehicle_latest_states.provider_fetched_at` advances; **`source_timestamp` frozen** (B1.2U VLS table).
- `evaluateBatteryProviderObservation` → `DUPLICATE_OBSERVATION` / `STALE_REPLAY` for same timestamp+value.
- **`shouldPersist=false`** → no new `battery_measurements` → **no** generalized capture on that poll path.

### 1.4 Stale-replay semantics (code contract)

Policy: `backend/src/modules/vehicle-intelligence/battery-health/battery-provider-observation.policy.ts`

- Only **`NEW_OBSERVATION`** creates persisted evidence.
- Same provider `observedAt`+value after threshold → **`STALE_REPLAY`** (not new evidence).
- **`BatteryV2SnapshotObservationProducer`:** `shouldEnqueue` only when persist would occur → **silent pre-classify void** during freeze.

### 1.5 Observability contract defect

**`CLASSIFIER_DEFECT_FOUND=NO`** — contamination, ambiguous, and stale paths behave correctly.

**`OBSERVABILITY_CONTRACT_DEFECT_FOUND=YES`** — architecture assumed fresh post-park provider timestamps for trustworthy engine-off; R1 ICE production **does not guarantee** them.

**`REST_CHAIN_LIVENESS_DEFECT_FOUND=YES`** — under provider sleep after near-park `engineRunning=true`, the rest chain can **stall forever** with **no named Battery V2 state** today.

---

## 2 — Two liveness properties

| Property | Guaranteed today? | After gap implementation? | Under DIMO contract? |
|----------|-------------------|----------------------------|----------------------|
| **State-machine liveness** | **NO** (silent stall) | **YES** (design) | **YES** (explicit gap state) |
| **Authoritative rest liveness** | **NO** | **NO** | **NO** — T4 trustworthy OFF **not guaranteed** before next RUNNING |

**Do not** hide missing authoritative rest behind “deferred resolution.” Some physical shutdowns will **never** produce Battery V2 authoritative rest evidence.

```
STATE_MACHINE_LIVENESS_GUARANTEED=NO_TODAY_YES_AFTER_GAP_IMPLEMENTATION
AUTHORITATIVE_REST_LIVENESS_GUARANTEED=NO
```

---

## 3 — `PROVIDER_OBSERVABILITY_GAP` semantics

**Recommended name:** `PROVIDER_OBSERVABILITY_GAP`  
(Battery V2 scope: LV provider timestamp + co-evaluated engine-state bundle for ICE generalized path.)

| Question | Answer |
|----------|--------|
| Authoritative for what? | **Observability only** — “fresh provider measurement time stopped advancing after known pre-gap context” |
| Asserts engine off? | **NO** |
| Asserts parked / rest? | **NO** |
| Starts authoritative rest age? | **NO** |

```
GAP_STATE_AUTHORITATIVE=YES_FOR_OBSERVABILITY_ONLY
GAP_STATE_ASSERTS_ENGINE_OFF=NO
GAP_STATE_STARTS_REST_AGE=NO
```

---

## 4 — Gap entry contract

**Not** entered on transport/scheduler failure alone.

### 4.1 Required facts (`GAP_ENTRY_REQUIRED_FACTS`)

1. **`SUCCESSFUL_POLL`** — provider snapshot job completed with normalized payload (distinct from HTTP failure / timeout / auth failure / poll not executed).
2. **`NON_ADVANCING_LV_PROVIDER_OBSERVATION`** — `evaluateBatteryProviderObservation` → `STALE_REPLAY` or `DUPLICATE_OBSERVATION` (same provider timestamp+value vs last stored LV).
3. **`LAST_FRESH_PROVIDER_ANCHOR`** — record `lastFreshProviderAt` from last `NEW_OBSERVATION` (or aligned VLS contract).
4. **`PRE_GAP_NOT_TRUSTWORTHY_ENGINE_OFF`** — last fresh bundle did **not** satisfy parked trustworthy engine-off (includes near-park `engineRunning=true`, charging contamination, active trip + speed not at rest).
5. **`ICE_GENERALIZED_SCOPE`** — same cohort gates as generalized evidence (ICE profile, flag scope when implemented).

### 4.2 Time threshold semantics

Use existing **`staleReplayThresholdMs`** (default 5 min) only as **“successful polls saw no new provider timestamp”** — **not** as “engine off for 5 minutes.”

```
GAP_ENTRY_REQUIRES_SUCCESSFUL_PROVIDER_POLL=YES
GAP_ENTRY_REQUIRES_STALE_PROVIDER_REPLAY=YES
GAP_ENTRY_REQUIRES_PREVIOUS_RUNNING_STATE=YES
(as last fresh bundle not trustworthy parked OFF)
```

### 4.3 Transport failure separation

| Condition | Classification |
|-----------|----------------|
| Snapshot HTTP/GraphQL failure, timeout, auth error | **Transport / operational failure** — monitoring, retries, connectivity episode — **not** `PROVIDER_OBSERVABILITY_GAP` |
| Successful poll + non-advancing measurement timestamp | **`PROVIDER_OBSERVABILITY_GAP` candidate** |

---

## 5 — Field freshness rule (cohort)

```
FIELDS_SHARE_COMMON_MEASUREMENT_FRESHNESS=NO
FIELD_LEVEL_FRESHNESS_AVAILABLE=YES
```

Example (WOB @ `18:47:56Z`): `ignition=false`, `engineRunning=true`, `speed=0`, `LV=14.126V` must **not** be treated as one atomic physical state without signal-specific freshness proof.

- **`IGNITION_FALSE` alone is not shutdown proof** (cohort: 160+ KS MS rows with `ign=false` & `er=true`).
- **`snapshot receivedAt` / `provider_fetched_at`** advancing does **not** make every field fresh.

---

## 6 — Exit matrix (no backdating)

| Case | Gap transition | `ENGINE_OFF`? | Rest session? | Rest anchor | Historical rest age |
|------|----------------|---------------|---------------|-------------|---------------------|
| **A — fresh trustworthy OFF (T4)** | `OPEN → RESOLVED_OFF` | **YES @ T4 only** | Open @ T4 | **`T4`** | From **T4** only |
| **B — fresh RUNNING (T5)** | `OPEN → RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF` | **NO** | **NO** | none | **NOT** recoverable |
| **C — ambiguous** | `OPEN → RESOLVED_AMBIGUOUS` or remain `OPEN` | **NO** until re-classified | **NO** | none | none |
| **D — continued silence** | **`OPEN`** (explicit unresolved) | **NO** | **NO** | none | none |
| **E — new trip without OFF** | Same as **B** | **NO** | **NO** | none | none |

**Indefinite open gap is NOT a hidden stall** — it is an **explicit unresolved observability condition** (rest blocked, state named).

---

## 7 — GAP → OFF semantics (T1, T2, T4)

| Symbol | Meaning |
|--------|---------|
| **T1** | Last fresh trustworthy **RUNNING** (or near-park **not** trustworthy OFF) provider bundle |
| **T2** | Gap **detected** (observability ceased — not physical shutdown time) |
| **T4** | First later **trustworthy parked engine-off** observation (`NEW_OBSERVATION`, classifier rules) |

- Physical shutdown instant ∈ **(T1, T4]** is **unknown** — do **not** assign authoritative `engineOffAt` inside the interval.
- **Only T4** may become **`ENGINE_OFF_TRANSITION`** evidence time and **rest anchor**.
- **Do not** anchor at T1, T2, `trip.endTime`, or inferred physics.
- Gap entity may store **non-authoritative** bounds: `lastFreshProviderAt`, `gapDetectedAt`, `firstFreshProviderAfterGapAt` for forensics.

```
GAP_TO_OFF_ENGINE_OFF_ALLOWED=YES_AT_T4_ONLY
GAP_TO_OFF_REST_ANCHOR=T4
SHUTDOWN_UNCERTAINTY_INTERVAL_MODEL=B_NON_AUTHORITATIVE_OBSERVABILITY_BOUNDS_ON_GAP_ENTITY
UNCERTAINTY_INTERVAL_AUTHORITATIVE=NO
RAW_PROVIDER_TIMESTAMPS_UNCHANGED=YES
```

---

## 8 — GAP → RUNNING semantics (T1, T2, T5)

| Symbol | Meaning |
|--------|---------|
| **T5** | First fresh trustworthy observation after gap with **RUNNING** semantics (engine running / driving / charging contamination per classifier) |

Vehicle **may** have been physically off during **(T2, T5)** — **no inference**.

**Resolution type (normative name):** `RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF`

| Action | Allowed? |
|--------|----------|
| Close gap with provenance | **YES** |
| Emit historical `ENGINE_OFF` | **NO** |
| Create `BatteryRestSession` | **NO** |
| Historical rest age | **NO** |
| Infer shutdown from elapsed time | **NO** |

```
GAP_TO_RUNNING_ENGINE_OFF_INFERENCE_ALLOWED=NO
GAP_TO_RUNNING_AUTHORITATIVE_REST_SESSION_ALLOWED=NO
GAP_TO_RUNNING_HISTORICAL_REST_AGE_ALLOWED=NO
GAP_TO_RUNNING_REST_SESSION_RESULT=NONE
```

---

## 9 — Persistence ownership (specification only — not implemented in B1.2X)

**Layer:** dedicated Battery V2 **observability-gap** entity (future table e.g. `battery_provider_observability_gaps`).

**NOT:** `BatteryRestSession`, physical engine-off evidence, or parked-rest evidence.

### 9.1 Conceptual fields (specification)

| Field | Role |
|-------|------|
| `organizationId`, `vehicleId` | Tenant scope |
| `contractVersion` | e.g. `R1_ICE_LV_ENGINE_BUNDLE_V1` |
| `signalFamily` | e.g. `LIVE_VOLTAGE_ENGINE_STATE_BUNDLE` |
| `gapDetectedAt` | Wall-clock gap open (ingest), not provider OFF |
| `lastFreshProviderAt` | T1 provider timestamp anchor |
| `lastFreshObservationId` | Optional FK to last `battery_measurements` or correlation ref |
| `lastKnownEvidenceClass` | Last generalized class if any (not gap class) |
| `resolutionAt` | Close time |
| `resolutionType` | `RESOLVED_OFF`, `RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF`, `RESOLVED_AMBIGUOUS`, … |
| `firstFreshObservationAfterGapId` | Optional link when real evidence resumes |
| `createdAt`, `updatedAt` | Audit |

```
RECOMMENDED_GAP_PERSISTENCE_LAYER=DEDICATED_BATTERY_V2_GAP_ENTITY
REST_SESSION_SCHEMA_CHANGE_REQUIRED=NO
GENERALIZED_EVIDENCE_SCHEMA_CHANGE_REQUIRED=YES_MINIMAL_OPTIONAL_GAP_LINK
DEDICATED_GAP_STORAGE_REQUIRED=YES
```

Opening/extending gap **MUST NOT** create generalized physical battery evidence. Optional future **`gapId`** on **real** generalized rows only when evidence exists — gap is **not** disguised as `ENGINE_OFF`.

---

## 10 — Multi-replica ownership (design)

```
GAP_MULTI_REPLICA_IDEMPOTENCY_KEY=
  batt-prov-gap:{organizationId}:{vehicleId}:{contractVersion}:{lastFreshProviderAtMs}

MULTIPLE_ACTIVE_GAPS_PER_SIGNAL_ALLOWED=NO
GAP_RESOLUTION_IDEMPOTENT=YES
```

Close keyed by `{gapId}:{resolutionType}:{firstFreshProviderAtMs}`; duplicate → no second logical close.

---

## 11 — Poll-path observability hook (future)

| Field | Value |
|-------|-------|
| **Component** | `BatteryV2SnapshotObservationProducer.classify()` and/or `BatteryProviderObservabilityGapService` invoked from `DimoSnapshotProcessor` when classify does not enqueue |
| **Input** | `orgId`, `vehicleId`, `receivedAt`, `lvDecision.outcome`, `lvDecision.observedAt`, last stored LV, trip context |
| **Output** | Idempotent gap open/extend |
| **`HOOK_MUTATES_BATTERY_EVIDENCE`** | **NO** |
| **`HOOK_CREATES_ENGINE_OFF`** | **NO** |

---

## 12 — B1 revised acceptance contract

**`B1_REQUIRES_EVERY_PHYSICAL_SHUTDOWN_TO_RESOLVE_AUTHORITATIVELY=NO`**

Replaces implicit requirement that every physical shutdown produces immediate post-off LV.

### 12.1 Pillars

| Pillar | Requirement |
|--------|-------------|
| **SAFETY** | No fabricated ENGINE_OFF, RestSession, or rest age; stale replay ≠ new evidence; gap ≠ physical shutdown |
| **STATE-MACHINE LIVENESS** | Qualifying provider freeze → explicit **`PROVIDER_OBSERVABILITY_GAP`**; no silent stall |
| **RESOLUTION** | GAP→OFF @ **T4** only; GAP→RUNNING closes without historical OFF/rest; ambiguous → no fabricated OFF; continued silence → **OPEN** gap |
| **PROVENANCE** | Raw provider timestamps immutable; gap retains last-fresh + resolution linkage |
| **MULTI-REPLICA** | One active gap lifecycle per vehicle/contract; idempotent open/extend/resolve |

### 12.2 Old vs corrected B1

| Topic | Old / implicit | Corrected (B1.2W) |
|-------|----------------|-------------------|
| Success | Natural trustworthy shutdown → rest chain | **Plus** explicit gap on provider freeze |
| Wait for T4 | Indefinite PENDING | **Named gap**; T4 optional |
| Every shutdown | Implied eventual rest | **Explicitly not required** |
| B1.2 PASS | Trustworthy parked OFF only | Shadow: gap entry + resolution path safety |

---

## 13 — M3.3C reopening requirements

**`M3_3C_ALLOWED=NO`** until implementation + validation.

### 13.1 Do NOT require (impossible provider contract)

Natural production **both** GAP→OFF **and** GAP→RUNNING **before** M3.3C.

### 13.2 Deterministic test requirements (both branches mandatory in automated integration)

| ID | Scenario |
|----|----------|
| A | GAP → OFF @ T4, anchor T4, no backdated age |
| B | GAP → RUNNING, `RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF`, no session |
| C | GAP → ambiguous |
| D | GAP remains open under continued freeze |
| E | Duplicate stale replay idempotency |
| F | Multi-replica concurrent open |
| G | Multi-replica concurrent resolve |
| H | No false rest age |
| I | No timestamp mutation |

### 13.3 Natural production shadow (after implementation)

- ≥1 genuine **gap entry** from natural R1 ICE telemetry  
- Stale replay does not create battery evidence  
- Gap persistence / ownership correct  
- ≥1 natural **gap resolution** when available (OFF **high-value** when observed; RUNNING **valid** for resolution-path proof)

---

## 14 — State diagram (normative)

```
RUNNING / fresh evidence
        |
        | successful polls +
        | non-advancing provider measurement
        v
PROVIDER_OBSERVABILITY_GAP
        |
        +--> fresh trustworthy OFF
        |       |
        |       v
        |   ENGINE_OFF @ T4
        |   REST anchor @ T4
        |
        +--> fresh trustworthy RUNNING
        |       |
        |       v
        |   GAP CLOSED (RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF)
        |   NO historical ENGINE_OFF
        |   NO RestSession
        |
        +--> fresh ambiguous evidence
        |       |
        |       v
        |   remain/resolve per explicit evidence semantics
        |   NO fabricated OFF
        |
        +--> no fresh provider data
                |
                v
            GAP remains OPEN
            NO OFF
            NO RestSession
```

---

## 15 — Runtime status (B1.2X documentation PR)

```
ARCHITECTURE_DECISION=COMPLETE
IMPLEMENTATION=NOT_STARTED
PRODUCTION_BEHAVIOR=UNCHANGED
M3_3C=BLOCKED
```

**Next implementation workstream:** gap persistence + poll-path hook + multi-replica lifecycle + deterministic tests + production shadow validation.

---

## FINAL MACHINE-READABLE BLOCK

```
M3_3_B1_2W_RESULT=B1_2W_GAP_STATE_MODEL_SUFFICIENT_FOR_STATE_MACHINE_LIVENESS

STATE_MACHINE_LIVENESS_GUARANTEED=NO_TODAY_YES_AFTER_GAP_IMPLEMENTATION
AUTHORITATIVE_REST_LIVENESS_GUARANTEED=NO

RECOMMENDED_GAP_STATE_NAME=PROVIDER_OBSERVABILITY_GAP
GAP_STATE_AUTHORITATIVE=YES_FOR_OBSERVABILITY_ONLY
GAP_STATE_ASSERTS_ENGINE_OFF=NO
GAP_STATE_STARTS_REST_AGE=NO

B1_REQUIRES_EVERY_PHYSICAL_SHUTDOWN_TO_RESOLVE_AUTHORITATIVELY=NO

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
PRODUCTION_CHANGED=NO

M3_3C_ALLOWED=NO
```
