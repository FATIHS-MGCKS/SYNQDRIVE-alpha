# Battery V2 HV R22-P1 — Charging counter evidence (implementation)

## Scope

Default-OFF durable storage for DIMO `powertrainTractionBatteryChargingAddedEnergy` **1-minute `LAST`** interval buckets, linked to HV recharge segment fingerprints.

## Gate 0 — BatteryMeasurement dedup conflict

`battery_measurements` enforces `@@unique([vehicleId, type, observedAt])`. `BatteryMeasurementRepository.createIdempotent` returns the existing row when that triple matches, **dropping corrected values** (see `battery-measurement.repository.spec.ts` R22 gate-0 test).

**Revision model selected:** sidecar tables `battery_hv_charging_counter_ingestion_batches` + `battery_hv_charging_counter_observations` with per-slot `revisionNumber` and `supersedesObservationId`. Global `BatteryMeasurement` behavior is unchanged.

## Feature flag

`BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED` — default **false**.

## Rollback / disable

1. Unset flag or set `BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED=false`.
2. Redeploy — no HV session or H4 code paths required.
3. Optional: retention prune of sidecar tables when policy is defined (not enabled in P1).

## Non-effects

- `HvChargeSession.energyAddedKwh` and `SEGMENT_EXTREMA` provenance unchanged.
- H4 source revision fingerprint and A3.5 semantics unchanged.
- EED recharge energy delta semantics unchanged.
