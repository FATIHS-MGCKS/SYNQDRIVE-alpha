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

**Writer:** `TripDiBoundaryAdmissionService.tryReleaseForTripTransactional`, invoked only for trip IDs returned from the intra-trip gap **boundary scan** in the same successful `reconcileWindow` pass (`releaseForBoundaryScannedTripIds`). Window-wide blanket release is intentionally disabled.

**Concurrency:** Release runs in a single DB transaction with `FOR UPDATE` on the trip row, re-checks PROPOSED repairs + FSM preconditions, and merges admission via `raw_detection_meta || patch` (sibling keys preserved). `contractVersion: 1` required.

**Product read:** `evaluateTripDiProductReadBoundaryGate` — CURRENT V2 / READY requires live admission + fingerprint match (V1 ops read uses the same projection service gate).

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

## Historical scope (read-only inventory categories)

| Category | Discovery / S4 effect | Notes |
|----------|----------------------|--------|
| A — Unchanged legacy | No `diV0BoundaryAdmissionV1` | Not discovered until reconciliation **scans** the trip in gap-split pass and releases |
| B — Boundary drift | Admission revision mismatch or `BOUNDARY_FINGERPRINT_CHANGED` | S4E drift / T11 supersede; product read hides stale CURRENT |
| C — Waiting new revision | COMPLETED, admission missing, scan not yet run | PENDING/UNAVAILABLE on product read; no provider fetch |

Remediation plan (not executed here): operator-scoped reconcile windows + optional supersede/re-discovery; no blanket `releaseCompletedTripsInWindow` on deploy.

## Code

- `backend/src/modules/vehicle-intelligence/trips/di-boundary-admission/*`
- Gates in `di-v0-s4a-work-item.repository.ts`, `di-v0-s4b-discovery.service.ts`, `trip-reconciliation.service.ts`

## Validation

```bash
cd backend && npm test -- --testPathPattern='trip-di-boundary-admission|exp021-533b2bf8'
bash architecture/scripts/validate-module-registry.sh
```
