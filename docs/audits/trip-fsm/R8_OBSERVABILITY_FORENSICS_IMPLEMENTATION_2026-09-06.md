# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

# R8 — Observability & Forensic Metadata Contract

**Date:** 2026-09-06  
**Branch:** `trip-fsm/r8-observability-forensics`  
**Baseline main SHA:** `140ebdd33c9102bcacb969ce5bef01b144c4b64a`  
**R7 prerequisite:** merged PR #1547 (`644bbec2636f7ca8b9e30d3bb2b6d7e327de6dec` → `140ebdd33`)

**Deploy:** NOT PERFORMED  
**Production mutations:** NONE

---

## R8.1 — Current observability graph (pre-change audit)

### A. START path

`snapshot EVENT_TIME` → `possibleStartAt` → `possibleStartEnteredAt WORKER_TIME` → confirmation → `effectiveStartAt` → create/reopen → `ACTIVE_TRIP` → `tripStartsConfirmed`

### B. END path

`lastMeaningfulMovementAt` / `possibleEndAt EVENT_TIME` → `possibleEndEnteredAt WORKER_TIME` → PEC / EV / CH → canonical `endTime` → `finalizeTrip` → `COMPLETED` → `RESTING`

### C. Legacy metrics (mislabeled)

| Metric | Was labeled as | Actually measured |
|--------|----------------|-----------------|
| `synqdrive_trip_finalize_latency_seconds` | finalization latency | trip duration (`endTime - startTime`) |
| `synqdrive_trip_end_latency_from_movement_seconds` | movement→finalize | boundary delta (`endTime - movementAnchor`), often ~0 |

No metric measured worker-wall-clock COMPLETED recognition before R8.

### D. Timelines

`TRIP_END_TIMELINE` used `finalizedAt = canonical endTime` (misleading).

### E. Tracking runs

`resultState: input.resultState ?? null` allowed NULL for wait/retry runs.

### F. ONGOING consumers

API/UI read raw `endTime` without distinguishing provisional vs canonical semantics.

### G. Raw forensics

`processFinalize` replaced `rawDetectionMeta` wholesale, risking loss of `lifecycleRecovery`, R5, R6 split evidence.

---

## R8.2 — Clock definitions (R1 authority)

| Field | Clock | Meaning |
|-------|-------|---------|
| `startCandidateAt` / `possibleStartAt` | EVENT_TIME | provider boundary |
| `startCandidateEnteredAt` / `possibleStartEnteredAt` | WORKER_TIME | FSM recognition entry |
| `startRecognizedAt` / `endRecognizedAt` | WORKER_TIME | captured immediately before authoritative commit |
| `canonicalStartAt` / `canonicalEndAt` | EVENT_TIME | persisted trip boundaries |

Recognition timestamps are never `requestedAt`, `updatedAt`, or canonical boundary times.

---

## R8.3–R8.9 — New metrics

| Metric | Formula | Labels |
|--------|---------|--------|
| `synqdrive_trip_start_candidate_latency_seconds` | `possibleStartEnteredAt - possibleStartAt` | `profile`, `clock_source` |
| `synqdrive_trip_start_recognition_latency_seconds` | `startRecognizedAt - effectiveStartAt` | `profile`, `mode`, `outcome` |
| `synqdrive_trip_start_boundary_adjustment_seconds` | `\|effectiveStartAt - startCandidateAt\|` | `profile`, `source`, `direction`, `outcome` |
| `synqdrive_trip_end_candidate_latency_seconds` | `possibleEndEnteredAt - possibleEndAt` | `profile`, `evidence_path`, `clock_source` |
| `synqdrive_trip_end_recognition_latency_seconds` | `endRecognizedAt - canonicalEndAt` | `profile`, `commit_confirmation` |
| `synqdrive_trip_end_boundary_adjustment_seconds` | `\|canonicalEndAt - possibleEndAt\|` | `profile`, `end_source`, `direction` |
| `synqdrive_trip_duration_seconds` | `endTime - startTime` | `profile` |
| `synqdrive_trip_timing_sample_rejected_total` | invalid samples | `metric`, `reason` |

Invalid samples (`missing_anchor`, `negative_delta`, `invalid_timestamp`) increment rejection counter — never silently clamped.

Legacy metrics retained with DEPRECATED help text; still observe for backward compatibility.

---

## R8.12 — `tripFsmForensics` R8_V1

Structured block under `VehicleTrip.rawDetectionMeta.tripFsmForensics` with explicit start/end clock semantics, recognition timestamps, boundary adjustments. Flat compatibility fields preserved.

---

## R8.13 — Metadata preservation

`mergeFinalizeRawDetectionMeta()` layers finalize fields atop existing meta — does not erase `lifecycleRecovery`, R5, R6 split evidence.

---

## R8.14 — End coordinate authority (P5-F12)

Before finalize: latest waypoint with `recordedAt <= canonicalEndTime`.  
If found → `WAYPOINT_AT_OR_BEFORE_BOUNDARY`.  
If not → `endLatitude/endLongitude = null`, `endCoordinateSource = NONE`.

---

## R8.18 — TrackingRun `resultState`

`resultState = input.resultState ?? input.stateAtRun` — legitimate wait/retry runs no longer write NULL.

---

## R8.19 — ONGOING `endTime` API contract

| Status | `canonicalEndTime` | `provisionalLastObservedAt` | `endTimeSemantics` |
|--------|-------------------|----------------------------|-------------------|
| ONGOING | null | `endTime` | `PROVISIONAL_WORKER_OBSERVATION` |
| COMPLETED | `endTime` | null | `CANONICAL_EVENT_BOUNDARY` |
| CANCELLED | null | null | `CANCELLED` |

Legacy `endTime` field retained for client compatibility.

---

## R8.20 — UI consumers updated

Rental trip timeline/map/evidence surfaces use `resolveTripDisplayEndTime()` → provisional for ONGOING, canonical for COMPLETED.

---

## Fixed-clock example (R8.22)

| Measure | Value |
|---------|-------|
| Candidate latency | 120s |
| Recognition latency | 235s |
| Boundary adjustment | 5s later |

Three independent values — boundary refinement does not zero-out recognition latency.

---

## Finding status

| Finding | Status |
|---------|--------|
| P5-F06 | RESOLVED_BY_R8 |
| P5-F07 | RESOLVED_BY_R8 |
| P5-F12 | RESOLVED_BY_R8 |
| P3-F05 | RESOLVED_BY_R8 |
| P3-F04 | RESOLVED_BY_R8 |
| P5-F01 | RESOLVED_BY_R1_R8 |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 (unchanged) |

| Invariant | Status |
|-----------|--------|
| INV-10 | CLOSED |
| INV-13 | CLOSED (semantic/API) |
| INV-15 | CLOSED_BY_R5_R8 |

---

## Files changed

**Backend:** `trip-fsm-timing.util.ts`, `trip-fsm-timing-observability.util.ts`, `trip-fsm-forensics.util.ts`, `trip-end-time-projection.util.ts`, `trip-metrics.service.ts`, `trip-detection-orchestration.service.ts`, `trip-api.mapper.ts`, test suites.

**Frontend:** `trips.types.ts`, `trips-map.types.ts`, `trip-end-time-display.util.ts`, `TripMetricRow.tsx`, `TripMapSummaryOverlay.tsx`, `TripEvidencePanel.tsx`, `tripRentalContext.ts`.

**Future canonical destination:** `architecture/trip-fsm/` (not `docs/architecture/trip-fsm/`).
