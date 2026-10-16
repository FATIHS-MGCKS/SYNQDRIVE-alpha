# EXP021 — DI admission after Trip-FSM finalization (V1)

**Status:** IMPLEMENTED (repository); historical backfill NOT in scope  
**Diagnosis basis:** PR #2046 @ `91458403a6` (case `533b2bf8…`, WI `339856c6…`)  
**Date:** 2026-10-16

## Problem

S4 PRIMARY discovery and work-item creation treated **COMPLETED + settlement quiet period** as sufficient. Reconciliation could still apply **INTRA_TRIP_GAP_SPLIT** afterward, changing canonical boundaries and `boundaryRepairGeneration`. S4 then acquired telemetry over the **pre-split** enclosing window.

Quiet period and eligibility rules remain necessary but **do not** prove boundary reconciliation is finished.

## Authoritative finalization contract (V1)

Persisted on `vehicle_trips.raw_detection_meta`:

| Key | Semantics |
|-----|-----------|
| `diV0BoundaryAdmissionV1.revisionKey` | Same material as `buildDiV0S4BoundaryFingerprint` (includes `boundaryRepairGeneration`) |
| `diV0BoundaryAdmissionV1.releasedAtUtc` | When reconciliation released the revision |
| `diV0BoundaryAdmissionV1.releasedBy` | `RECONCILIATION` \| `OPERATOR` |

**Release preconditions** (`canReleaseTripDiBoundaryAdmission`):

- `trip_status = COMPLETED` with `end_time`
- Vehicle FSM `RESTING` and `active_trip_id` ≠ this trip
- No `trip_repairs` in `PROPOSED`
- No retryable boundary refresh in flight (`boundary-repair.state.util`)

**S4 admission** (`evaluateTripDiBoundaryAdmission`): release preconditions hold **and** admission record exists with `revisionKey` matching current fingerprint.

**Writer:** `TripDiBoundaryAdmissionService.tryReleaseForTrip` / `releaseCompletedTripsInWindow`, invoked at end of `TripReconciliationService.reconcileWindow` after repair passes.

## S4 enforcement surfaces

| Surface | Behavior |
|---------|----------|
| S4B `selectCandidates` | RESTING FSM, no PROPOSED repairs, admission JSON present |
| T01 `createWorkItem` | `TRIP_BOUNDARY_NOT_RELEASED` if admission evaluation fails |
| `evaluateAttemptStartBoundary` | `SUPERSEDE` / `BOUNDARY_CHANGED` if fingerprint matches but admission invalid |
| T06 `completeWithS2` | Same admission gate before publish |

Existing `BOUNDARY_FINGERPRINT_CHANGED` / supersede paths cover post-release corrections.

## Time boundaries

Acquisition window remains **trip `start_time` / `end_time`** at execution (second-aligned enclosing window). Finalization wait affects **enqueue/claim only**; it does not extend the coverage denominator.

## Historical scope (read-only)

Trips with S4 work items created **before** this contract may lack `diV0BoundaryAdmissionV1` or have pins on superseded boundaries. Remediation plan (not executed here):

1. Inventory WIs where `boundary_fingerprint` ≠ current trip fingerprint or admission missing.
2. Operator-approved re-release via reconciliation pass + optional supersede / re-discovery.
3. No automatic provider re-fetch or projection overwrite in this change set.

## Code

- `backend/src/modules/vehicle-intelligence/trips/di-boundary-admission/*`
- Gates in `di-v0-s4a-work-item.repository.ts`, `di-v0-s4b-discovery.service.ts`, `trip-reconciliation.service.ts`

## Validation

```bash
cd backend && npm test -- --testPathPattern='trip-di-boundary-admission|exp021-533b2bf8'
bash architecture/scripts/validate-module-registry.sh
```
