# EXP-021 — Pre-Drive Integrity Gate (Settlement Timing Audit)

**Date:** 2026-09-08  
**Type:** GO/NO-GO audit before physical drive  
**Status:** **HARDENED DRAFT** — PR #1570 pre-merge scientific integrity gate (not deployed)

---

## Phase 0 — Authority

| Field | Value |
|-------|-------|
| `CURRENT_MAIN_SHA` | `22863a3d5531acb612a3d7f68b5dbff8cb27199d` |
| `PRODUCTION_SHA` | `0ba96e03fc2f1551db79d2bae151c928a9fd936a` |
| `PR_1561_PRESENT_IN_MAIN` | **YES** (`dce0ce75b`) |
| `PR_1570` | Draft — prospective probe A+B scheduling + whole-trip partial recovery |
| Deploy delta | Production lags main — fix **not deployed** |

Production health (2026-09-08T04:12Z): both replicas `ok`; Redis/DB healthy per prior EXP-021D audit.

Effective env file flags:

```
REFERENCE_CAPTURE_ENABLED=true
REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true
```

---

## DEPLOYED_BASELINE_FAIL

### Finding: **FAIL**

`FIXED_PROBE_SCHEDULE_CREATION_AUTHORITY` = **`syncCompletedPhasesFromSession` on phase COMPLETION only**

Evidence (`reference-capture-settlement-shadow.service.ts` pre-fix):

- Fixed-interval BullMQ rows created only when a calibration phase appears in `completedPhases`
- `scheduledAt = sourceIntervalEnd + scheduledAgeMs` is correct **metadata**
- But creation happens at `phaseEndedAt` (~T+300s for a 5min phase)
- Probe A `sourceIntervalEnd` ≈ `phaseStart + 180s` (120s stabilization + 60s window)
- Probe B `sourceIntervalEnd` ≈ `phaseStart + 225s` (0.55×duration offset + 60s)

### Nominal 300s phase timeline (deployed baseline)

| Probe | Age | Intended execute | Created (legacy) | On-time? |
|-------|-----|------------------|------------------|----------|
| A | +30s | T+210s | T+300s | **NO** (~90s late) |
| A | +60s | T+240s | T+300s | **NO** (~60s late) |
| B | +30s | T+255s | T+300s | **NO** (~45s late) |
| B | +60s | T+285s | T+300s | **NO** (~15s late) |

```
PROBE_B_30_EXECUTABLE_ON_TIME_CURRENT_PR = NO (first draft: probe B still at completion)
PROBE_B_60_EXECUTABLE_ON_TIME_CURRENT_PR = NO (first draft)
PROBE_B_120_EXECUTABLE_ON_TIME_CURRENT_PR = NO (first draft, at completion time)
EXP021_ALL_48_FIXED_OBSERVATIONS_TIMING_VALID = NO (deployed; NO first draft)
```

`scheduledAgeMs` alone is **not** proof — late creation yields large `actualAgeMs` / `scheduleDriftMs`.

---

## FIRST_DRAFT_FIX (PR #1570 initial commit)

Partial correction — probe A only:

1. **Prospective probe A scheduling** while phase is ACTIVE (deterministic from `phaseStartedAt`)
2. **Probe B scheduling** still at phase COMPLETION (depends on final duration) — **BLOCKING GAP**
3. **Whole-trip shadow recovery** retry when `VehicleTrip.endTime` not yet available at `stopRecording`

Post-first-draft projection (probe A only):

```
PROBE_A_30_ON_TIME_CAPABLE = YES
PROBE_A_60_ON_TIME_CAPABLE = YES
PROBE_B_30_ON_TIME_CAPABLE = NO
PROBE_B_60_ON_TIME_CAPABLE = NO
EXP021_ALL_48_FIXED_OBSERVATIONS_TIMING_VALID = NO
```

Unit test gap: direct `syncCompletedPhasesFromSession` call only — no processor lifecycle proof.

---

## FINAL_PRE_MERGE_FIX (PR #1570 hardened)

### Probe B prospective geometry

Probe B offset uses **nominal phase duration** (`EXP021_NOMINAL_PHASE_DURATION_MS = 300_000`) at phase EFFECTIVE — not fabricated final duration:

```
probeBStart = snapToSecond(phaseStart + floor(0.55 × 300_000)) = phaseStart + 165s
probeBEnd   = probeBStart + 60s = phaseStart + 225s
```

At completion, `validateProspectiveProbeBAgainstCompletedPhase` compares against actual `floor(0.55 × actualDuration)` — schedules remain immutable (idempotency keys).

### Nominal 300s phase — both probes schedulable before deadlines

| Probe | Source end | +30 execute | +60 execute | Schedule at T+60s | On-time? |
|-------|------------|-------------|-------------|-------------------|----------|
| A | T+180s | T+210s | T+240s | T+60s | **YES** |
| B | T+225s | T+255s | T+285s | T+60s | **YES** |

```
PROBE_B_30_EXECUTABLE_ON_TIME_CURRENT_PR = YES (final fix)
PROBE_B_60_EXECUTABLE_ON_TIME_CURRENT_PR = YES (final fix)
PROBE_B_120_EXECUTABLE_ON_TIME_CURRENT_PR = YES (final fix)
EXP021_ALL_48_FIXED_OBSERVATIONS_TIMING_VALID = YES (with hardened fix deployed)
```

### Runtime invocation proof

| Field | Value |
|-------|-------|
| `ACTIVE_PHASE_SETTLEMENT_SYNC_RUNTIME_CALLER` | `ReferenceCaptureProcessor.processCycle` |
| `ACTIVE_PHASE_SETTLEMENT_SYNC_CALL_FREQUENCY` | ~5s (`referenceCapture.cycleIntervalMs`, default 5000) |
| `PROBE_A_SCHEDULE_CREATED_BEFORE_SOURCE_INTERVAL_END` | **YES** — first RECORDING cycle with active phase |
| `PROBE_B_SCHEDULE_CREATED_BEFORE_EARLY_DEADLINES` | **YES** — same prospective sync path |

Trigger path: `RECORDING` session → acquisition cycle → `syncCompletedPhasesFromSession` → `syncProspectiveProbesForActivePhase` (probes A + B).

Also invoked at `stopRecording` via `syncSettlementShadowAfterCaptureStop`.

### Whole-trip recovery completeness

| Field | Value |
|-------|-------|
| `PARTIAL_WHOLE_TRIP_SCHEDULE_RECOVERY_SUPPORTED` | **YES** (hardened) |
| Prior gap | Query selected only `vehicleTripId null OR tripEndTime null` — missed 1–5 partial WHOLE_TRIP rows |
| Fix | Broadened candidate scan; filter `wholeTripCount < 6`; `createSchedulesIfAbsent` idempotent to exactly 6 ages |

### Idempotency / restart / multi-replica

| Invariant | Authority |
|-----------|-----------|
| `PROSPECTIVE_SCHEDULE_IDEMPOTENT` | `createSchedulesIfAbsent` + unique `idempotencyKey` (`experimentId\|probeId\|ageMs`) |
| `RESTART_RECOVERY_SAFE` | Recovery scheduler re-enqueues due PENDING; `executeScheduledObservation` skips if observation exists |
| `MULTI_REPLICA_DUPLICATE_SAFE` | P2002 on schedule create; duplicate observation unique constraint |
| `PARTIAL_SCHEDULE_RECOVERY_SAFE` | Whole-trip recovery fills missing ages without duplicating completed rows |

Tests: `reference-capture-settlement-shadow-runtime.spec.ts`, `reference-capture-settlement-shadow.service.spec.ts`, `reference-capture-settlement-shadow.policy.spec.ts` (21 focused tests PASS).

### End-to-end lifecycle timing test

```
RUNTIME_LIFECYCLE_TIMING_TEST = PASS
A30_RUNTIME_VALID = YES
A60_RUNTIME_VALID = YES
B30_RUNTIME_VALID = YES
B60_RUNTIME_VALID = YES
```

Proven via processor runtime spec + prospective schedule creation with `computeScheduleTimingProjection` at T+60s creation time.

---

## Phase 4 — Whole-trip end-race audit

| Field | Deployed | Hardened draft |
|-------|----------|----------------|
| `WHOLE_TRIP_SHADOW_REQUIRES_TRIP_END_AT_CAPTURE_STOP` | YES | YES |
| `WHOLE_TRIP_SHADOW_MISSING_TRIP_END_RECOVERY_EXISTS` | NO | **YES** |
| `WHOLE_TRIP_SHADOW_END_RACE_SAFE` | NO | **YES** (pending deploy) |
| `WHOLE_TRIP_6_OF_6_RECOVERABLE` | NO | **YES** |

---

## Phase 6 — Session creation

**NOT PERFORMED** — blocked until hardened fix deployed + live preflight.

---

## Phase 7 — Human go gate

```
EXP021_FINAL_PREFLIGHT_PASS = NO (not deployed)
READY_TO_DRIVE = NO

VEHICLE = KS MX 2024
TOKEN_ID = 187336 (re-verify at drive time)
NEXT_SEQUENCE = 60_30_20_10

LIVE_TELEMETRY_READY = REQUALIFY_REQUIRED
SETTLEMENT_TIMING_INTEGRITY_PASS = NO (deployed) / YES (hardened draft)
WHOLE_TRIP_SHADOW_END_RACE_SAFE = NO (deployed) / YES (hardened draft)
GLOBAL_CLEAN_STATE = REVERIFY_REQUIRED
SESSION_READY = NO
```

**Do not send `START EXP-021 NOW` until:**

1. PR #1570 merged **and deployed** to production
2. POST-DEPLOY live preflight PASS
3. Live DIMO telemetry requalified
4. Global clean-state reverified
5. Session created + `READY`

---

## Policy unchanged

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO
TRIP_FSM_CHANGED = NO
```
