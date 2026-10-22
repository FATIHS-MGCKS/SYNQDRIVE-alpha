# TDL P1B.10 — Durable start-boundary admission shadow evidence

**Date (UTC):** 2026-10-22  
**Mode:** Minimal implementation, shadow default OFF unchanged, no canonical cutover.

## Problem

P1B start-shadow comparisons were merged into ephemeral `VehicleTripDetectionState.lastEvidenceSummary` only. RESTING transitions replace that summary with `{ lastRestingReason }`, so per-trip shadow outcomes from live confirmations were not durably recoverable (e.g. Tesla 2026-10-21 offline replays).

## Design

| Item | Choice |
|------|--------|
| Store | `VehicleTrip.rawDetectionMeta.startBoundaryAdmissionShadowV1` |
| Writer | Atomic PostgreSQL `jsonb` merge (`COALESCE(raw) \|\| jsonb_build_object(key, record)`), conditional on key absent |
| Canonical start writer | Unchanged (`resolveLegacyConfirmedStartBoundary` + `TripDecisionEngine.createTrip`) |
| Split follow-on | `NOT_EXECUTED` / `MID_TRIP_GAP_SPLIT_FOLLOW_ON` via same atomic inserter |
| Persist failure | Non-blocking; one immediate retry; `tripStartBoundaryAdmissionShadowErrors{phase=durable_persist}` |

## Post-commit crash window (best-effort)

1. `TripDecisionEngine.createTrip` / `reopenTripForMerge` commits the canonical trip.
2. `persistStartBoundaryAdmissionShadowDurable` runs immediately after (same worker turn).

If the process crashes between (1) and (2), the trip exists without durable shadow until a future manual/backfill path (out of scope). No new queue/infra; a single in-process retry covers transient DB errors only.

## Shadow OFF write impact

Every start confirmation still performs one best-effort durable persist (records `NOT_EXECUTED` / `SHADOW_DISABLED`). No extra DIMO/provider calls. Legacy canonical writer unchanged.

## Lifecycle `rawDetectionMeta` preservation

| Path | Shadow preserved |
|------|------------------|
| Start `createTrip` | N/A (persist follows) |
| Merge reopen | `mergeLifecycleRecoveryMeta` spreads prior keys |
| Finalize | `mergeFinalizeRawDetectionMeta` spreads prior + explicit shadow key guard |
| RESTING | Detection `lastEvidenceSummary` only — trip row untouched |
| Reconciliation boundary refresh | spreads `priorMeta` |
| Mid-gap split (first trip) | prior meta spread before split fields |
| Mid-gap split (follow-on) | atomic shadow insert after create |
| `discardTrip` | replaces meta (CANCELLED — intentional) |

## Record fields (summary)

Trip/vehicle/org ids, decision time, `SYNQDRIVE_DEPLOYED_GIT_SHA`, FSM candidate + confirmation, shadow payload when executed, data-source counts/flags at decision time (no raw GPS bulk), persistence status.

## Tests

`trip-start-boundary-admission-p1b10-durable.spec.ts` — single write, idempotency, RESTING vs trip meta, disabled shadow, split follow-on, persist failure, org-scoped read, parallel skip.

Orchestration wiring extended in `trip-start-boundary-admission-p1b-orchestration.spec.ts`.

## Production

No flag activation, no deploy, no historical trip backfill.
