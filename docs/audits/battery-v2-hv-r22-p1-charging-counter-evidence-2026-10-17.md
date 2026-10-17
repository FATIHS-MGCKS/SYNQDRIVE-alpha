# Battery V2 HV R22-P1 — Charging counter evidence (implementation)

## Scope

Default-OFF durable storage for DIMO `powertrainTractionBatteryChargingAddedEnergy` **1-minute `LAST`** interval buckets, linked to HV recharge segment fingerprints.

## Gate 0 — BatteryMeasurement dedup conflict

`battery_measurements` enforces `@@unique([vehicleId, type, observedAt])`. `BatteryMeasurementRepository.createIdempotent` returns the existing row when that triple matches, **dropping corrected values** (see `battery-measurement.repository.spec.ts` R22 gate-0 test).

**Revision model selected:** sidecar tables `battery_hv_charging_counter_ingestion_batches` + `battery_hv_charging_counter_observations` with per-slot `revisionNumber` and `supersedesObservationId`. Global `BatteryMeasurement` behavior is unchanged.

## Feature flag

`BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED` — default **false**.

## P1.1 — Correction revalidation policy

DIMO does not expose an explicit interval-bucket revision signal. Corrected values are only discoverable by re-querying the segment window.

- **Skip DIMO query** when the latest sidecar batch matches session start/end/`providerObservedAt`, the HV session was not re-ingested (`updatedAt` ≤ batch `createdAt`), the persist result is unchanged, and the batch is younger than `BATTERY_V2_HV_CHARGING_COUNTER_REVALIDATION_INTERVAL_MS` (default 6h).
- **Force DIMO query** when any of: no prior batch, session identity changed, persist `changed`, session `updatedAt` after batch, or revalidation interval elapsed.

**Trade-off:** lower query frequency reduces rate-budget use but increases correction-detection latency (bounded by the interval unless a provider refresh re-ingest occurs).

Unavailable provider outcomes (`no_vehicle_jwt`, `empty_interval_series`, invalid shape, rate limit) do **not** create ingestion batches.

**P1.1 final review:** `battery_hv_charging_counter_revalidation_checkpoints` records `last_provider_query_at` after a successful provider fetch (including duplicate-batch recognition) so unchanged observation sets do not trigger repeat DIMO queries within the revalidation interval. Reduced-coverage provider responses (fewer buckets, unchanged values) persist a new batch without false observation revisions.

## Rollback / disable

1. Unset flag or set `BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED=false`.
2. Redeploy — no HV session or H4 code paths required.
3. Optional: retention prune of sidecar tables when policy is defined (not enabled in P1).

## Non-effects

- `HvChargeSession.energyAddedKwh` and `SEGMENT_EXTREMA` provenance unchanged.
- H4 source revision fingerprint and A3.5 semantics unchanged.
- EED recharge energy delta semantics unchanged.
