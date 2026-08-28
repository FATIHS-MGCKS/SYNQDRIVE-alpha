# Battery V2 LV Rest Session Liveness Fix — 2026-08-28

## Root cause (production defect, gate verdict C)

Vehicle KS MX 2024, trip `61715ecd`, anchor `2026-08-28 12:01:35 UTC`:
`LV_REST_WINDOW` opening depended exclusively on a
`BATTERY_OBSERVATION_CLASSIFY` cycle running AFTER Trip Detection finalized
the trip (`LvRestWindowIngestionBridgeService.processObservationCycle`).
The last provider observation arrived at the anchor; Trip Detection
transitioned to RESTING ~58s later; no further observation ever arrived
(`source_timestamp` frozen while `provider_fetched_at` advanced). Result: no
session, no REST_60M/REST_6H targets, no measurements. Existing
`reconcileLvRestWindowTargets()` could not repair a *missing* session.

## Architecture after

Three convergent paths, ONE canonical open operation:

1. **Canonical operation** —
   `LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip()`
   (`battery-health/lv-rest-window/lv-rest-window-session-arming.service.ts`).
   Derives everything from persisted state: tenant/vehicle-scoped finalized
   `vehicle_trips` row (anchor = `trip.endTime`), read-only trip detection +
   latest state, session creation via the existing FSM
   (`LvRestWindowStateMachineService.processEvent` → `TRIP_ENDED`, optional
   `REST_SNAPSHOT` promotion). No parallel create implementation.
2. **Primary event path** — `TripDetectionOrchestrationService` enqueues the
   durable `BATTERY_LV_REST_SESSION_OPEN` job (via
   `BatteryV2LvRestSessionProducer`) after the COMPLETED trip AND the RESTING
   transition are persisted. Consumed by `BatteryLvRestSessionOpenHandler`.
   Enqueue failure never affects trip lifecycle.
3. **Self-healing recovery** —
   `BatteryV2ReconciliationService.reconcileMissingLvRestSessions()` scans
   authoritative `COMPLETED` trips in the lookback/settle window whose
   canonical `trip.endTime` anchor has no `LV_REST_WINDOW` session — **not**
   the vehicle's transient `TripDetectionState`. This repairs missed primary
   enqueues even after a subsequent trip has started. Re-enqueues the same
   job identity.
4. **Observation bridge convergence** — when a finalized trip matches the
   det-state anchor, the bridge delegates to the canonical arming operation
   (trip-linked, `trip.endTime` anchor); the direct `TRIP_ENDED` emission
   remains only for anchors without a canonical finalized trip.

## Idempotency / concurrency

- Window identity: `lv-rest:{vehicleId}:{anchorMs}`; DB
  `@@unique(vehicleId, idempotencyKey)`; `createIdempotent` (P2002 → fetch).
- Job identity: `lv-rest-open:{vehicleId}:{anchorMs}` (BullMQ job-id dedupe);
  `BatteryV2IdempotentExecutionService` treats an existing session for the
  anchor as already-completed.
- FSM duplicate `TRIP_ENDED` → `duplicate_trip_end_event` no-op; REST targets
  keep deterministic `battery-rest:{vehicleId}:{windowId}:{60m|6h}` identity.

## Provenance rules (unchanged authorities)

- Anchor authority = `trip.endTime` (TripDecisionEngine remains sole trip
  lifecycle writer). Never `receivedAt`/`provider_fetched_at`.
- No fabricated observations: momentary telemetry from
  `vehicle_latest_states` is used only when `source_timestamp` ≥ anchor;
  a frozen pre-anchor observation yields unknown context (CANDIDATE, no
  promotion). Quality is adjudicated by REST target evaluation from real
  in-window `LIVE_VOLTAGE` observations (MISSED when none exist).

## Late-target semantics

Late-armed sessions keep the historical anchor; elapsed REST_60M/REST_6H
targets are scheduled due-immediately and evaluation produces
VALID/CONTAMINATED/MISSED from real evidence only. Anchors older than the FSM
max rest window (24h) are not armed (`anchor_outside_max_window`).
`reconcileLvRestWindowTargets` now includes PLANNED (CANDIDATE) sessions so
unpromoted windows still reach evaluation.

## Flags

`BATTERY_V2_REST_SHADOW_ENABLED=true` gates all paths;
publication/readiness remain disabled. Stage 2 not started.

## Tests

`lv-rest-window-session-arming.service.spec.ts` (exact production race +
matrix A–M with real FSM), `battery-v2-reconciliation.spec.ts` (recovery,
already-exists, no-trip skip, PLANNED targets),
`lv-rest-window-ingestion-bridge.service.spec.ts` (bridge convergence),
`battery-v2-job.validation.spec.ts`, `battery-v2-enqueue-paths.audit.spec.ts`.
