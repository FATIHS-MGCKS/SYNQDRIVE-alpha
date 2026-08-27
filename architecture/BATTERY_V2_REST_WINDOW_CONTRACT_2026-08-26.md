# Battery V2 REST Window Contract — 2026-08-26

## Summary

Fixed production `battery.v2` failures (`REST target job missing restWindowId`) caused by legacy reconciliation enqueueing incomplete payloads.

## Contract

- `BATTERY_REST_TARGET_EVALUATE` requires `restWindowId` (`lv-rest:{vehicleId}:{anchorAtMs}`).
- Enqueue via `BatteryV2RestTargetProducer` with canonical `battery-rest:*` idempotency keys.
- Validation rejects enqueue without `restWindowId`.

## Reconciliation

- `reconcileLegacyRestTargets` bridges `battery_features` only when matching `LV_REST_WINDOW` session exists.
- No direct `rest-target:*` enqueue without `restWindowId`.
- Session metadata updated after schedule to prevent duplicate reconciliation enqueue.

## Ingestion wiring (Phase 1 — 2026-08-26)

`BatteryV2SnapshotIngestionService.ingestObservationClassify()` → `LvRestWindowIngestionBridgeService` → `LvRestWindowStateMachineService.processEvent()`.

- Gated by `BATTERY_V2_REST_SHADOW_ENABLED`
- Internal `TRIP_ENDED` synthesized from read-only `vehicle_trip_detection_states` (RESTING + `lastActivityAt`)
- Event order per cycle: invalidate → `TRIP_ENDED` → `REST_SNAPSHOT`
- Legacy `BatteryV2Service.onSnapshot()` unchanged (separate `battery_features` persistence)

See `docs/audits/battery-v2-integration-point-audit-2026-08.md` Appendix A.

## Reference

`docs/audits/battery-v2-production-failure-remediation-2026-08.md`
