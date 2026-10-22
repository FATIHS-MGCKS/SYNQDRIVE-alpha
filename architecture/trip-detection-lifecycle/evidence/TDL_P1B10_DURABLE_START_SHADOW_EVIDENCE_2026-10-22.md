# TDL P1B.10 — Durable start-boundary admission shadow evidence

**Date (UTC):** 2026-10-22  
**Mode:** Minimal implementation, shadow default OFF unchanged, no canonical cutover.

## Problem

P1B start-shadow comparisons were merged into ephemeral `VehicleTripDetectionState.lastEvidenceSummary` only. RESTING transitions replace that summary with `{ lastRestingReason }`, so per-trip shadow outcomes from live confirmations were not durably recoverable (e.g. Tesla 2026-10-21 offline replays).

## Design

| Item | Choice |
|------|--------|
| Store | `VehicleTrip.rawDetectionMeta.startBoundaryAdmissionShadowV1` |
| Writer | Append-only, first-write-wins per trip |
| Canonical start writer | Unchanged (`resolveLegacyConfirmedStartBoundary` + `TripDecisionEngine.createTrip`) |
| Split follow-on | `NOT_EXECUTED` / `MID_TRIP_GAP_SPLIT_FOLLOW_ON` at second-trip create |
| Persist failure | Non-blocking; `tripStartBoundaryAdmissionShadowErrors{phase=durable_persist}` |

## Record fields (summary)

Trip/vehicle/org ids, decision time, `SYNQDRIVE_DEPLOYED_GIT_SHA`, FSM candidate + confirmation, shadow payload when executed, data-source counts/flags at decision time (no raw GPS bulk), persistence status.

## Tests

`trip-start-boundary-admission-p1b10-durable.spec.ts` — single write, idempotency, RESTING vs trip meta, disabled shadow, split follow-on, persist failure, org-scoped read, parallel skip.

Orchestration wiring extended in `trip-start-boundary-admission-p1b-orchestration.spec.ts`.

## Production

No flag activation, no deploy, no historical trip backfill.
