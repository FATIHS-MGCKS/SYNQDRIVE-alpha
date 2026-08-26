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

## Reference

`docs/audits/battery-v2-production-failure-remediation-2026-08.md`
