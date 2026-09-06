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
| POSSIBLE_START confirmation expiry | `possibleStartEnteredAt` (legacy: `possibleStartAt` → `updatedAt`) |
| POSSIBLE_END hard timeout | `possibleEndEnteredAt` (legacy: `possibleEndAt` → `updatedAt`) |
| PE stability / CH assist 30s dwell | `possibleEndEnteredAt` (legacy: `possibleEndAt` → `updatedAt`) |
| PE min inactivity before CUSUM | `possibleEndAt` (physical) |
| CUSUM fetch window | `possibleEndAt` |
| No-core operational inactivity gate | `resolveOperationalNoCoreInactivityAnchor()` (worker hierarchy) |
| Recovery stuck PE (>30 min) | `possibleEndEnteredAt` (legacy: `possibleEndAt` → `updatedAt`) |
| Suspicious long ACTIVE trip | `possibleStartAt` (trip start boundary) |

## Backward compatibility

Legacy rows with null `*EnteredAt` use deterministic fallback (**R1A corrected**):

- confirmation / FSM dwell: legacy `possible*At` before mutable `updatedAt`
- `updatedAt` only when no boundary exists (never ahead of legacy boundary clocks)

Worker-lock mutations on `updatedAt` must not reset age for pre-migration rows. No production backfill required.

## Tests

- `trip-fsm-clock-contract.spec.ts` — clock split, delayed snapshot, legacy fallback, no-core gate, odometer plateau, timestamp safety
- `trip-tracking-recovery.scheduler.spec.ts` — legacy POSSIBLE_END recovery age
- `trip-detection.spec.ts` — regression suite (unchanged assertions)
- `dimo-snapshot.trip-start-isolation.spec.ts` — `sourceTimestamp` plumbing

## Findings status

| ID | Status |
|----|--------|
| P4-F02 | **RESOLVED_BY_R1** — snapshot `lastSeenAt` → `sourceTimestamp` → `possibleStartAt` |
| P5-F02 | **RESOLVED_BY_R1** — PE stability/dwell uses `possibleEndEnteredAt` (+ R1A legacy fallback) |
| P5-F14 | **RESOLVED_BY_R1** — `lastMeaningfulMovementAt` from provider events |
| P5-F15 | **RESOLVED_BY_R1** — odometer-only ACTIVE advances at actual progression timestamp (R1A plateau fix) |
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
- `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.spec.ts`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/master/components/ArchitekturView.tsx`

---

## R1A — Closure Corrections

| Field | Value |
|-------|-------|
| R1 base commit | `3740029a6578b2ebead63bcaadf4d9789ae80cf3` |
| Closure scope | compatibility / semantic edge cases only |
| Deploy | **NOT PERFORMED** |

### Legacy lock / updatedAt issue

Initial R1 legacy fallback used `updatedAt` before legacy boundary clocks. `acquireWorkerLock()` mutates the same `VehicleTripDetectionState` row (`workerLockedUntil`, `workerRunToken`), advancing `@updatedAt` before FSM handlers read state. Pre-migration rows with null `*EnteredAt` could therefore reset confirmation/dwell age on every attempt.

**Corrected hierarchy:**

| Anchor | Fallback order |
|--------|----------------|
| POSSIBLE_START confirmation | `possibleStartEnteredAt` → `possibleStartAt` → `updatedAt` → `workerNow` |
| POSSIBLE_END FSM dwell / recovery | `possibleEndEnteredAt` → `possibleEndAt` → `updatedAt` → `workerNow` |

### Recovery scheduler legacy behavior

`TripTrackingRecoveryScheduler` stuck POSSIBLE_END reconciliation now uses `isPossibleEndRecoveryEligible()` / `resolvePossibleEndFsmDwellAnchor()` so legacy rows with `possibleEndEnteredAt = null` remain eligible when `possibleEndAt` age exceeds 30 minutes.

### No-core operational vs boundary separation

Successful empty-core inactivity gate restored pre-R1 operational hierarchy via `resolveOperationalNoCoreInactivityAnchor()`:

`lastMeaningfulMovementAt` → `lastActivityAt` → `possibleStartAt` → `workerNow`

Physical `possibleEndAt` on entry still uses R1 boundary contract (`resolvePossibleEndBoundaryCandidate`).

### Odometer plateau correction

`resolveLatestOdometerAdvanceEventAt()` timestamps the latest provider instant odometer **increased**, not the last repeated plateau sample.

### Timestamp edge tests added

Future skew rejection/acceptance, out-of-order core points, duplicate timestamps, odometer plateau/multi-increment cases.

### Final finding status (post-R1A)

| ID | Status |
|----|--------|
| P4-F02 | RESOLVED_BY_R1 |
| P5-F02 | RESOLVED_BY_R1 |
| P5-F14 | RESOLVED_BY_R1 |
| P5-F15 | RESOLVED_BY_R1 |
| P5-F01 | PARTIALLY_RESOLVED |

---

## R1B — Final No-Core Clock Semantics Closure

| Field | Value |
|-------|-------|
| R1A base commit | `6782eac83169ade3d785b3c55347c1c40c3c67b3` |
| Scope | successful-empty-core operational inactivity anchor only |
| Deploy | **NOT PERFORMED** |

### Why pre-R1 field hierarchy became semantically wrong after R1

R1 reclassified `lastMeaningfulMovementAt` as **EVENT_TIME** (provider physical evidence) and retained `lastActivityAt` as **WORKER_TIME** (FSM evaluation activity). R1A restored an operational no-core helper but ordered `lastMeaningfulMovementAt` before `lastActivityAt`, mirroring pre-R1 storage overlap when both fields often held worker `now`.

After R1, ACTIVE ticks write:

- `lastActivityAt` = worker evaluation instant
- `lastMeaningfulMovementAt` = provider event timestamp when qualifying movement exists

A delayed provider observation therefore yields `lastMeaningfulMovementAt = T0` and `lastActivityAt = T0 + 5min`. The pre-R1B helper measured operational inactivity from T0, immediately exceeding the 120s no-core threshold even though the FSM had just evaluated ACTIVE 30s earlier.

### Operational gate hierarchy (corrected)

Successful empty-core inactivity uses `resolveOperationalNoCoreInactivityAnchor()`:

`lastActivityAt` → `lastMeaningfulMovementAt` → `possibleStartAt` → `workerNow`

This answers: *when did the FSM last successfully record operational activity?*

### Physical boundary hierarchy (unchanged)

`resolvePossibleEndBoundaryCandidate()` remains EVENT_TIME first:

`lastMeaningfulMovementAt` (provider event) → `lastActivityAt` (WORKER_FALLBACK) → `workerNow`

This answers: *when did physical movement last occur?*

### Regression scenario

| Step | Time | State |
|------|------|-------|
| Provider movement | T0 | `lastMeaningfulMovementAt = T0` |
| Worker ACTIVE evaluation | T0 + 5min | `lastActivityAt = T0 + 5min` |
| Successful empty-core tick | T0 + 5min + 30s | operational anchor = T0 + 5min, inactiveMs = 30s → **below** 120s |
| No later activity | T0 + 7min+ | inactiveMs ≥ 120s from `lastActivityAt` → gate may qualify |

When the gate qualifies, `possibleEndAt` is still resolved separately via `resolvePossibleEndBoundaryCandidate()` and remains **T0 EVENT_TIME** in the delayed-observation case.

Compatibility fallback: when `lastActivityAt` is null, `lastMeaningfulMovementAt` may still serve as the operational anchor.

### Final finding status (post-R1B)

| ID | Status |
|----|--------|
| P4-F02 | RESOLVED_BY_R1 |
| P5-F02 | RESOLVED_BY_R1 |
| P5-F14 | RESOLVED_BY_R1 |
| P5-F15 | RESOLVED_BY_R1 |
| P5-F01 | PARTIALLY_RESOLVED |
