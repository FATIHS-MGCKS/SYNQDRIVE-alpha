# R2 Production runtime contract (read-only)

| Evidence ID | `DIM-EV-R2-PROD-RUNTIME-001` |
|-------------|------------------------------|
| **Observed at** | `2026-10-11` |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Release path** | `/opt/synqdrive/releases/20261011154442_v4994` |

## Process topology

| PM2 app | Status |
|---------|--------|
| `synqdrive` | online |
| `synqdrive-b` | online |

## Whitelisted configuration (non-secret values only)

| Variable | Classification | Value @ R2 |
|----------|----------------|------------|
| `DIMO_GLOBAL_BUDGET_ENABLED` | DEPLOY_CONFIGURED | `true` |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | DEPLOY_CONFIGURED | `true` |
| `WORKER_SNAPSHOT_CONCURRENCY` | DEPLOY_CONFIGURED | `8` |
| `WORKER_SNAPSHOT_INTERVAL_MS` | DEPLOY_CONFIGURED | `30000` |
| `WORKER_SNAPSHOT_TIER_*_MS` | CODE_DEFAULT | **not present** in whitelisted grep → tier intervals use code defaults (30s/60s/5m/30m) |
| `DIMO_TRIGGER_BOOTSTRAP_ENABLED` | CODE_DEFAULT | **not present** → `false` (`dimo.config.ts`) |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | CODE_DEFAULT | **not present** → activity-tier path active |

## Effective behavior (INFERRED from config + code)

| Concern | Effective |
|---------|-----------|
| Snapshot scheduler tick | **30s** (`WORKER_SNAPSHOT_INTERVAL_MS`) |
| Per-vehicle poll tiers | **defaults** (no override env observed) |
| Global provider budget | **enabled** |
| Startup legacy trigger bootstrap | **disabled** → `DimoTriggersService.subscribeVehicle` **not** invoked at boot |

## Not verified in R2 (gaps)

| Item | Status |
|------|--------|
| Scheduler leader identity | UNKNOWN — requires Redis/leader key read |
| Queue depth / 429 aggregates | UNKNOWN — no metrics scrape |
| Per-replica wake admission counters | UNKNOWN |

## Mutations

**None.**
