# HV Recharge Session Reconcile (Prompt 49/78)

## Purpose

Orchestrate periodic and event-driven reconciliation of DIMO `recharge` segments into `HvChargeSession` rows — bounded rolling window per capable vehicle, idempotent jobs, no deletion of missing provider segments.

## Module

`backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/`

| File | Role |
|------|------|
| `hv-recharge-session-reconcile.service.ts` | Core reconcile: feature flag, capability gate, ingest, metrics |
| `hv-recharge-session-reconcile-producer.service.ts` | Enqueue jobs + periodic batch selection |
| `hv-recharge-session-reconcile.policy.ts` | 31d rolling window + vehicle-level idempotency keys |
| `hv-recharge-session-reconcile.trigger.ts` | Trigger enum (PERIODIC, CHARGING_STATE, CAPABILITY_REFRESH, …) |
| `hv-recharge-session-reconcile.metrics.ts` | Segment count, persist outcomes, errors, provider delay |

## Behaviour

1. **Rolling window** — default 31 days per vehicle (`buildHvRechargeRollingWindow`)
2. **New segments** — ingest creates `HvChargeSession` via `HvChargeSessionIngestService`
3. **Ongoing sessions** — provider updates merged; completion finalizes `isOngoing=false`
4. **Delayed segments** — re-runs within window pick up late provider data (merge rules apply)
5. **Missing provider segments** — local rows are **not** deleted when absent from provider response
6. **No duplicates** — unique `(vehicleId, segmentFingerprint)` + job idempotency keys
7. **Pagination / rate limits** — delegated to `DimoRechargeSegmentsClient` (31d splits, retry/429)
8. **Capability gate** — `HvMethodProfileService.resolveForVehicle().rechargeSegmentsAvailable`

## Triggers

| Trigger | Source |
|---------|--------|
| `PERIODIC` | `BatteryV2ReconciliationScheduler` → `reconcilePeriodic()` (ongoing sessions + capable vehicles) |
| `CHARGING_STATE` | `BatteryV2SnapshotIngestionService` on charging transition (30s delay) |
| `CAPABILITY_REFRESH` | `HvCapabilityRefreshHandler` after successful preflight |
| `ONGOING_REFRESH` | Single-segment fingerprint reconcile |
| `MANUAL` | Explicit enqueue |

## Job

- Type: `HV_RECHARGE_SESSION_RECONCILE`
- Handler: `HvRechargeSessionReconcileHandler`
- Idempotency: `hv-session:{vehicleId}:reconcile:{trigger}:{bucket}`
- Feature flag: `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` (default `false`)
- Provider errors → retryable `BatteryV2ProviderError`

## Metrics

| Metric | Labels |
|--------|--------|
| `battery_v2_hv_recharge_segments_total` | `trigger`, `outcome` |
| `battery_v2_hv_recharge_sessions_persisted` | `trigger`, `change` (created/updated/unchanged) |
| `battery_v2_hv_recharge_reconcile_errors` | `trigger`, `error_code` |
| `battery_v2_hv_recharge_provider_delay_seconds` | `trigger` |

## Tests

`hv-recharge-session-reconcile.service.spec.ts` — delayed data, duplicate reconciliation (unchanged), provider errors, capability skip, producer enqueue, handler segment-not-found retry.
