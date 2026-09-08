# EXP-021 — Pre-Drive Integrity Gate (Settlement Timing Audit)

**Date:** 2026-09-08  
**Type:** GO/NO-GO audit before physical drive  
**Status:** **BLOCKED** — timing integrity defect found in deployed code; fix drafted (not deployed)

---

## Phase 0 — Authority

| Field | Value |
|-------|-------|
| `CURRENT_MAIN_SHA` | `22863a3d5531acb612a3d7f68b5dbff8cb27199d` |
| `PRODUCTION_SHA` | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| `PR_1561_PRESENT_IN_MAIN` | **YES** (`dce0ce75b`) |
| Deploy delta | Production lags main — EXP-021D ops scripts not on deployed release; env flags set manually |

Production health (2026-09-08T04:12Z): both replicas `ok`; Redis/DB healthy per prior EXP-021D audit.

Effective env file flags:

```
REFERENCE_CAPTURE_ENABLED=true
REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true
```

---

## Phase 3 — Settlement timing integrity audit (deployed code baseline)

### Finding: **FAIL**

`FIXED_PROBE_SCHEDULE_CREATION_AUTHORITY` = **`syncCompletedPhasesFromSession` on phase COMPLETION only**

Evidence (`reference-capture-settlement-shadow.service.ts` pre-fix):

- Fixed-interval BullMQ rows created only when a calibration phase appears in `completedPhases`
- `scheduledAt = sourceIntervalEnd + scheduledAgeMs` is correct **metadata**
- But creation happens at `phaseEndedAt` (~T+300s for a 5min phase)
- Probe A `sourceIntervalEnd` ≈ `phaseStart + 180s` (120s stabilization + 60s window)

### Nominal 300s phase timeline (probe A)

| Age | Intended execute | Created (legacy) | On-time? |
|-----|------------------|------------------|----------|
| +30s | T+210s | T+300s | **NO** (~90s late) |
| +60s | T+240s | T+300s | **NO** (~60s late) |
| +120s | T+300s | T+300s | marginal |
| +180s+ | later | delayed enqueue | YES |

```
EARLY_AGE_30_EXECUTABLE_ON_TIME = NO
EARLY_AGE_60_EXECUTABLE_ON_TIME = NO
EARLY_AGE_120_EXECUTABLE_ON_TIME = NO (at deployed creation time)
EXPECTED_MIN_SCHEDULE_DRIFT_30_MS = 90000
EXPECTED_MIN_SCHEDULE_DRIFT_60_MS = 60000
EXP021_SETTLEMENT_TIMING_INTEGRITY_PASS = NO (deployed)
```

`scheduledAgeMs` alone is **not** proof — late creation yields large `actualAgeMs` / `scheduleDriftMs`.

### Minimum safe correction (draft, not deployed)

1. **Prospective probe A scheduling** while phase is ACTIVE (deterministic from `phaseStartedAt`)
2. **Probe B scheduling** remains at phase COMPLETION (depends on final duration)
3. **Whole-trip shadow recovery** retry when `VehicleTrip.endTime` not yet available at `stopRecording`

Tests added: `reference-capture-settlement-shadow.policy.spec.ts`, `reference-capture-settlement-shadow.service.spec.ts`

Post-fix projection (probe A +30 at phaseStart+60s creation):

```
EARLY_AGE_30_EXECUTABLE_ON_TIME = YES
EARLY_AGE_60_EXECUTABLE_ON_TIME = YES
EXP021_SETTLEMENT_TIMING_INTEGRITY_PASS = YES (with fix deployed)
```

---

## Phase 4 — Whole-trip end-race audit (deployed)

| Field | Value |
|-------|-------|
| `WHOLE_TRIP_SHADOW_REQUIRES_TRIP_END_AT_CAPTURE_STOP` | **YES** — schedules need canonical `VehicleTrip.endTime` |
| `WHOLE_TRIP_SHADOW_MISSING_TRIP_END_RECOVERY_EXISTS` | **NO** (deployed) — only logs warning and returns |
| `WHOLE_TRIP_SHADOW_END_RACE_SAFE` | **NO** (deployed) — race can drop all 6 whole-trip shadows |

Recovery scheduler (60s) only re-enqueues **existing** due schedules; it does not retry trip binding.

Draft fix adds `recoverWholeTripShadowForPendingExperiments()` on recovery tick.

---

## Phase 6 — Session creation

**NOT PERFORMED** — blocked by timing integrity gate on deployed binary.

---

## Phase 7 — Human go gate

```
EXP021_FINAL_PREFLIGHT_PASS = NO
READY_TO_DRIVE = NO

VEHICLE = KS MX 2024
TOKEN_ID = 187336 (re-verify at drive time)
NEXT_SEQUENCE = 60_30_20_10

LIVE_TELEMETRY_READY = REQUALIFY_REQUIRED (vehicle may have been parked since EXP-021D)
SETTLEMENT_TIMING_INTEGRITY_PASS = NO (deployed)
WHOLE_TRIP_SHADOW_END_RACE_SAFE = NO (deployed)
GLOBAL_CLEAN_STATE = REVERIFY_REQUIRED
SESSION_READY = NO
```

**Do not send `START EXP-021 NOW` until:**

1. Timing + whole-trip fixes **deployed** to production
2. Live DIMO telemetry requalified
3. Global clean-state reverified
4. Session created + `READY` + preflight PASS

---

## Policy unchanged

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO
```
