# Tire Wear V3 — Calibration Shadow P3 (implementation)

Status: **implemented, default OFF**. Last updated: 2026-11-01.

## Purpose

Prospective, immutable per-wheel V3 predictions in `tire_wear_v3_calibration_snapshot_v1` for later pairing with independent tread-depth measurements. Does **not** change customer Tire V3 reads or wear equations.

## Separation from P3A prior shadow

| Store | Table | Flag | Role |
|-------|-------|------|------|
| P3A prior shadow | `tire_wear_v3_prior_shadow_v1` | `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` | Full setup JSON fingerprint store |
| **P3 calibration shadow** | `tire_wear_v3_calibration_snapshot_v1` | `TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED` | Per-wheel calibration snapshots |

Reuse: **`TireWearV3PriorService.computeForSetup(..., { persistShadow: false })`** — no duplicate wear pipeline.

## Activation (ops-only, not enabled by this PR)

```bash
# After migration + deploy review:
TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED=true
# optional tuning:
# TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE=25
# TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS=900000
```

Scheduler job: `tire_wear_v3_calibration_shadow_writer` (singleton leader via `SchedulerLeaderGuardService`).

## Rollback

1. Set `TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED=false` (or unset).
2. Restart replicas — writer stops; customer path unchanged.
3. Table is additive; no rollback migration required for safety. Optional DBA purge of calibration rows is out of band.

## Master Admin inspection (read-only)

- `GET /api/v1/admin/master-intelligence/tire-wear-v3-calibration-shadow/summary`
- `GET /api/v1/admin/master-intelligence/tire-wear-v3-calibration-shadow/writer-health`
- `GET /api/v1/admin/master-intelligence/tire-wear-v3-calibration-shadow/organizations/:orgId/vehicles/:vehicleId/setups/:tireSetupId`

Requires `MASTER_ADMIN` role.

## Idempotency

Unique `idempotency_key` = SHA-256 over org, setup, mount period, wheel, model version, input fingerprint, schema version.

## Pairing foundation

Policy module `tire-wear-v3-calibration-pairing.policy.ts` — prospective match only (`computed_at` / `prediction_created_at` strictly before measurement). No coefficient updates.

## Deferred

- Persisted pairing result rows / batch calibration jobs
- Dedicated Master UI (API sufficient for P3)
