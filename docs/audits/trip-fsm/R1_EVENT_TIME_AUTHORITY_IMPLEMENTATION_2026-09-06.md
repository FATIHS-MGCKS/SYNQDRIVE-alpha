# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

## R1 — Event-Time Authority & Boundary Field Contract

| Field | Value |
|-------|-------|
| Baseline application SHA | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| P6 design SHA | `64de2333f0475e1eadb7f0c4f386d441f9979cb7` |
| Branch | `trip-fsm/r1-event-time-authority` |
| Deploy | **NOT PERFORMED** |

## Summary

R1 separates **event-time** physical boundary fields from **worker-time** FSM dwell/timeout clocks without changing detection thresholds, scoring weights, polling cadence, or lifecycle ownership.

## Schema migration

**Name:** `20260906120000_trip_fsm_clock_split_entered_at`

Additive nullable columns on `vehicle_trip_detection_states`:

- `possible_start_entered_at`
- `possible_end_entered_at`

No backfill, no defaults, no column renames. Rollback: drop columns.

**Lock/runtime risk:** two nullable `TIMESTAMP(3)` adds — negligible on PostgreSQL; no table rewrite.

## Clock contract (old → new)

| Field | Old authority | New authority |
|-------|---------------|---------------|
| `possibleStartAt` | worker `now` | provider snapshot / event-time candidate |
| `possibleStartEnteredAt` | *(missing)* | worker FSM entry (POSSIBLE_START) |
| `possibleEndAt` | mixed movement / worker | event-time end boundary candidate |
| `possibleEndEnteredAt` | *(missing)* | worker FSM entry (POSSIBLE_END) |
| `lastMeaningfulMovementAt` | often worker `now` | provider core/CH event timestamps only |
| `lastActivityAt` | worker evaluation | unchanged — worker operational time |

Helpers: `backend/src/modules/vehicle-intelligence/trips/trip-fsm-clock-contract.ts`

## Writers

### `possibleStartAt` (EVENT_TIME)

- `evaluateSnapshotForTripStart` — from `SnapshotEvidenceSignals.sourceTimestamp` via `resolveStartCandidateClock`
- `processPossibleStart` confirm paths — refined `effectiveStartAt`
- mid-gap split — `midGap.secondStartAt`

### `possibleStartEnteredAt` (WORKER_TIME)

- `evaluateSnapshotForTripStart` — worker `now` on POSSIBLE_START entry
- cleared on RESTING, confirm → ACTIVE, expiry

### `possibleEndAt` (EVENT_TIME)

- ACTIVE continuity POSSIBLE_END — `resolvePossibleEndBoundaryCandidate`
- no-core inactivity branch — same helper (tagged fallback in evidence)
- CH end assist — `detectedEndAt` segment end
- CUSUM validation window anchor — unchanged boundary reader

### `possibleEndEnteredAt` (WORKER_TIME)

- all POSSIBLE_END entry transitions — worker `now`
- cleared on resume, RESTING finalize, `clearPossibleEndClockFields()`

### `lastMeaningfulMovementAt` (EVENT_TIME)

- ACTIVE tick — `resolveLatestMeaningfulMovementEventAt` (speed, odometer, optional CH `windowEndAt`)
- CH end assist — segment `detectedEndAt`
- CUSUM reopen — evidence `cusumLastMovementAt`
- **not** written on IDLE, CH-only guard without event timestamp, or worker resume without provider points

### `lastActivityAt` (WORKER_TIME)

- unchanged writers; documented as non-physical operational timestamp

## Timeout / gate readers

| Reader intent | Clock |
|---------------|-------|
| POSSIBLE_START confirmation expiry | `possibleStartEnteredAt` (legacy: `updatedAt` → `possibleStartAt`) |
| POSSIBLE_END hard timeout | `possibleEndEnteredAt` |
| PE stability / CH assist 30s dwell | `possibleEndEnteredAt` |
| PE min inactivity before CUSUM | `possibleEndAt` (physical) |
| CUSUM fetch window | `possibleEndAt` |
| Recovery stuck PE (>30 min) | `possibleEndEnteredAt` |
| Suspicious long ACTIVE trip | `possibleStartAt` (trip start boundary) |

## Backward compatibility

Legacy rows with null `*EnteredAt` use deterministic fallback (`updatedAt`, then legacy boundary field). No production backfill required.

## Tests

- `trip-fsm-clock-contract.spec.ts` — clock split, delayed snapshot, movement anchors, profiles, future skew
- `trip-detection.spec.ts` — regression suite (unchanged assertions)
- `dimo-snapshot.trip-start-isolation.spec.ts` — `sourceTimestamp` plumbing

## Findings status

| ID | Status |
|----|--------|
| P4-F02 | **RESOLVED_BY_R1** — snapshot `lastSeenAt` → `sourceTimestamp` → `possibleStartAt` |
| P5-F02 | **RESOLVED_BY_R1** — PE stability/dwell uses `possibleEndEnteredAt` |
| P5-F14 | **RESOLVED_BY_R1** — `lastMeaningfulMovementAt` from provider events |
| P5-F15 | **RESOLVED_BY_R1** — odometer-only ACTIVE advances movement anchor |
| P5-F01 | **PARTIALLY_RESOLVED** — ONGOING `vehicleTrip.endTime` remains provisional worker time by design |

## Known remaining issues

- ONGOING `endTime` dual semantics (R8/UI package)
- PS exception retry architecture (R3)
- Mid-gap fail-closed policy refinements (R6/R5)

## Changed files

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260906120000_trip_fsm_clock_split_entered_at/migration.sql`
- `backend/src/modules/vehicle-intelligence/trips/trip-fsm-clock-contract.ts`
- `backend/src/modules/vehicle-intelligence/trips/trip-fsm-clock-contract.spec.ts`
- `backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts`
- `backend/src/modules/vehicle-intelligence/trips/trip-evidence.helpers.ts`
- `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts`
- `backend/src/modules/vehicle-intelligence/trips/trip-detection.spec.ts`
- `backend/src/workers/processors/dimo-snapshot.processor.ts`
- `backend/src/workers/processors/dimo-snapshot.trip-start-isolation.spec.ts`
- `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/master/components/ArchitekturView.tsx`
