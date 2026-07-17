# Battery V2 Retention (V4.9.570)

Safe, domain-aware retention for Battery Health V2 data with aggregation-before-delete.

## Principles

| Principle | Implementation |
|-----------|----------------|
| Duplicates not written | `BatteryMeasurementRepository.createIdempotent` pre-checks dedup keys before insert |
| Live state = current mirror | Never deletes `battery_features`, `hv_battery_health_current`, `vehicle_battery_capabilities` |
| Raw provider observations time-limited | `battery_health_snapshots`, `hv_battery_health_snapshots` by `recordedAt` |
| Measurements kept longer | LV 730d / HV 1095d defaults |
| Qualified evidence/sessions/assessments/publications long-term | Qualified evidence + publications retention `0` (disabled); superseded assessments only |
| Aggregates before raw delete | `battery_retention_aggregates` SESSION + DAILY buckets |
| Existing evidence/HV retention | Complements `DataRetentionScheduler` (`RETENTION_BATTERY_EVIDENCE_DAYS`, `RETENTION_HV_BATTERY_SNAPSHOTS_DAYS`) — V2 worker uses `observedAt`/`recordedAt` and business guards |

## Components

| File | Role |
|------|------|
| `config/battery-v2-retention.config.ts` | ENV-driven windows + dry-run |
| `retention/battery-v2-retention.service.ts` | Phased batch retention orchestration |
| `retention/battery-v2-retention-aggregate.service.ts` | Session/day rollups |
| `workers/schedulers/battery-v2-retention.scheduler.ts` | Cron `0 4 * * *` — no run on deploy |

## Phases (order)

1. `prepare_aggregates` — session + daily rollups for aged measurements
2. `prune_shadow_evidence` — shadow telemetry evidence only
3. `prune_hv_capacity_observations` — unreferenced shadow observations
4. `prune_measurements` — only when aggregate exists + no qualified evidence reference
5. `prune_hv_charge_sessions` — after observations removed
6. `prune_measurement_sessions` — empty sessions with aggregate
7. `prune_superseded_assessments` — not referenced by publications
8. `prune_lv_provider_snapshots` / `prune_hv_provider_snapshots`
9. `prune_capability_changes` / `prune_dead_letters`

## Safety defaults

- `BATTERY_V2_RETENTION_ENABLED=false` — opt-in
- `BATTERY_V2_RETENTION_DRY_RUN=true` — counts only until explicitly disabled
- Batched `deleteMany` by primary key — no `TRUNCATE` / unscoped deletes
- `maxBatchesPerPhase` caps rows per table per run

## Metrics

- `synqdrive_battery_retention_runs_total{dry_run}`
- `synqdrive_battery_retention_rows_deleted_total`
- `synqdrive_battery_retention_rows_aggregated_total`
- `synqdrive_battery_measurement_duplicate_skip_total`

## Tests

```bash
cd backend
npm test -- battery-v2-retention
# Integration (requires DATABASE_URL + migrated schema):
BATTERY_V2_RETENTION_INTEGRATION=1 npm test -- battery-v2-retention.integration
```

## Manual run

```bash
cd backend
BATTERY_V2_RETENTION_ENABLED=true BATTERY_V2_RETENTION_DRY_RUN=true npm run battery:retention:dry-run
```
