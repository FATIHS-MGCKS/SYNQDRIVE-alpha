# Battery V2 — Asynchronous Jobs (Bootstrap)

**Epistemic status:** CONFIRMED (Stage 1 REST pipeline jobs)

## Primary job types (seeded)

| Job type | ID prefix / pattern | Producer | Handler |
|----------|---------------------|----------|---------|
| `BATTERY_LV_REST_SESSION_OPEN` | `lv-rest-open:{vehicleId}:{anchorMs}` | `BatteryV2LvRestSessionProducer` | `BatteryLvRestSessionOpenHandler` |
| `BATTERY_REST_TARGET_EVALUATE` | `battery-rest:…` | `BatteryV2RestTargetProducer` | `BatteryRestTargetEvaluateHandler` |
| `BATTERY_OBSERVATION_CLASSIFY` | (observation pipeline) | `BatteryV2SnapshotObservationProducer` | — |
| `BATTERY_ASSESSMENT_RECOMPUTE` | assessment keys | `BatteryV2JobProducerService` | — |

Full job inventory not reconstructed in bootstrap.

## Queue

- BullMQ queue: `QUEUE_NAMES.BATTERY_V2`
- Producer: `BatteryV2JobProducerService`
- Deterministic job IDs via `buildBatteryV2JobId(idempotencyKey)`

## Recovery flag

`recovery: true` on producers enables:

- `ignoreDeadLetter` on enqueue
- per-entity `clearDeadLetter` before re-add

**Never on primary hot path** without recovery context (#1445 architecture memo, code-verified in producers).

## Graph nodes

- `BAT-V2-JOB-LV-SESSION-OPEN-001`
- `BAT-V2-JOB-REST-EVAL-001`
