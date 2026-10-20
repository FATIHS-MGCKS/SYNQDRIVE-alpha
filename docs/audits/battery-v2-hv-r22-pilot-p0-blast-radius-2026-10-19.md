# HV R22 Pilot P0 — blast radius (Tesla 186946)

**Mode:** analysis only · **Production mutations:** none

## Trigger path

R22 capture runs only from `HvRechargeSessionReconcileService.scheduleChargingCounterEvidence` after HV recharge ingest/fallback persist — **not** a standalone historical backfill job.

Each reconcile tick for a vehicle:

1. Ingests DIMO recharge segments in the **31-day rolling window** (`HV_RECHARGE_ROLLING_WINDOW_DAYS`).
2. Passes **every** `HvChargeSessionPersistResult` in that ingest batch to `captureForPersistResults`.
3. For each closed native session, `captureForSession` may issue **one** DIMO interval GraphQL query when revalidation policy authorizes (`no_prior_batch`, identity change, persist changed, interval elapsed).

## Tesla production baseline (read-only audit 2026-10-19)

- **13** closed `hv_charge_sessions` for vehicle `68868291-5478-42cd-b0c4-cc77b2a78e21`
- **0** R22 sidecar rows (capture never enabled)
- **0** duplicate `(vehicle_id, segment_fingerprint)` rows

## First activation (capture ON + allowlist = Tesla only)

| Scenario | Max provider queries (first leader reconcile) | Notes |
|----------|-----------------------------------------------|-------|
| All 13 sessions in 31d window returned by ingest | **Up to 13** | Each session lacks `no_prior_batch` anchor → policy queries provider |
| Subsequent periodic reconciles within 6h default revalidation | **0–N** | Only sessions with `persist_result_changed` or interval elapsed |
| Non-allowlisted vehicles | **0** | P0 allowlist fail-closed |

**Rate budget:** 13 GraphQL interval queries × full session duration windows (multi-hour) — **high** relative to a single capability probe. Recommend staged pilot:

1. Owner capability probe on **≤13m** window first.
2. Enable capture with allowlist **only** after probe PASS.
3. Optional follow-up: segment-scoped reconcile (`segmentFingerprint` input) to cap first-wave queries.

## Revalidation interval

Default `BATTERY_V2_HV_CHARGING_COUNTER_REVALIDATION_INTERVAL_MS` = **6h** prevents repeat queries for unchanged observation sets.

## Dual replicas

HV reconcile jobs are scheduler-leader guarded in the broader Battery V2 reconciliation architecture; R22 capture executes on the replica handling that vehicle’s reconcile job — **not** duplicated across 3001/3002 for the same job.

## Rollback

1. `BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED=false` (or unset)
2. Remove allowlist entries
3. Redeploy — HV H1–H4 recharge ingest unchanged
