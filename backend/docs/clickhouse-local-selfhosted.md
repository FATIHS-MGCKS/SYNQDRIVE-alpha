# ClickHouse — local / self-hosted

## What ClickHouse is in SynqDrive

- An **optional analytics / telemetry mirror**.
- **PostgreSQL stays the canonical truth.** ClickHouse never becomes a second
  source of truth and operational logic (DIMO, Trips, Health, Battery, Tire,
  Brake, Data-Analyse, RentalHealth) does not depend on it being up.
- If ClickHouse is down, only analytics / data-analyse / telemetry mirroring is
  affected — the rest of SynqDrive keeps running.

## Start

From the `backend/` directory:

```bash
npm run infra:up
```

This starts `postgres`, `redis` and `clickhouse` via `docker-compose.yml`.

To stop everything:

```bash
npm run infra:down
```

## Environment

Local dev defaults (see `.env.example`, already matching `docker-compose.yml`):

```bash
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=synqdrive
CLICKHOUSE_PASSWORD=synqdrive_clickhouse_dev
CLICKHOUSE_DATABASE=synqdrive
```

The schema (`synqdrive.telemetry_*`, `synqdrive.trip_*`) is created
automatically by `ClickHouseSchemaService` on application bootstrap — all
statements are idempotent (`CREATE ... IF NOT EXISTS`).

## Verify

```bash
npm run clickhouse:ping            # SELECT 1 via clickhouse-client
curl http://localhost:8123/ping    # ClickHouse HTTP health -> "Ok."
```

The backend exposes its own readiness check that includes ClickHouse:

```
GET /health/readiness
```

ClickHouse appears under `checks.clickhouse`. A `degraded` overall status with
ClickHouse `error` does **not** mean operational logic is broken — it only means
the analytics mirror is unavailable.

## Backup (local, Phase 1)

```bash
npm run clickhouse:backup:local
```

- Location: `backend/storage/clickhouse/backups/`
- Filename format: `synqdrive_YYYYMMDD_HHMMSS.zip`
- Retention: **max 7 days** (older backups are deleted automatically after a
  successful backup).
- Backups are written to the local ClickHouse disk `backups`
  (`docker/clickhouse/config.d/backup_disk.xml`). **No cloud / S3.**

## Retention / TTL (data growth safety)

ClickHouse enforces per-table retention via TTL (migration
`002_retention_ttl_and_storage_policy.sql`). Old analytics rows are removed
automatically by ClickHouse in the background once they exceed the retention:

| Table | Retention | TTL field |
| --- | --- | --- |
| `telemetry_snapshots` | 180 days | `recorded_at` |
| `telemetry_waypoints` | 365 days | `recorded_at` |
| `telemetry_state_changes` | 365 days | `changed_at` |
| `trip_activity_windows` | 365 days | `window_start` |
| `trip_segment_candidates` | 180 days | `segment_start` |

Notes:

- **TTL only affects the ClickHouse analytics mirror.** PostgreSQL (the
  canonical truth) is never touched by TTL.
- TTL deletes old analytics data automatically — there is no manual cleanup job.
- On a small VPS, retention is what keeps ClickHouse from growing without bound.
  Keep these TTLs (or shorten them) rather than disabling them.
- **Local backups** are a separate concern and are kept **max 7 days** (see
  Backup section). Backups are local-only — no cloud / S3.
- Storage usage is observable via the backend readiness endpoint
  (`GET /health/readiness` → `checks.clickhouse.details.storage`): table count,
  compressed/uncompressed bytes, row counts and oldest/newest record per table.

## High-Frequency Telemetry Layer

The HF layer (migration `003_high_frequency_telemetry.sql`) is the ClickHouse-only
foundation for high-frequency DIMO telemetry. It is **analytics-only** — there is
no Prisma model and no second source of truth.

| Table | Purpose | Retention |
| --- | --- | --- |
| `telemetry_hf_points` | Normalized HF signal points (per vehicle/signal/time) | 90 days |
| `telemetry_hf_windows` | Aggregated HF time windows (so UI/API need not scan raw points) | 180 days |
| `telemetry_hf_events` | Derived HF events (harsh accel/braking, gaps, charging, …) | 365 days |

Key rules:

- **PostgreSQL stays the canonical truth.** HF data only feeds analytics /
  data-analyse / telemetry views.
- **An HF / ClickHouse outage must never block SynqDrive.** Ingestion
  (`ClickHouseHfService.insertHfPoints` / `insertHfEvents`) is best-effort:
  it skips + logs + returns when ClickHouse is unavailable, and never throws.
  Read methods (`getHfAvailability`, `getSignalFrequencySummary`,
  `getRecentHfEvents`) degrade gracefully (return `available: false`).
- Signal classification lives in `hf-signal-map.ts` (`resolveSignalGroup`) — a
  pure helper that does **not** call DIMO or change polling.
- Observability: `synqdrive_clickhouse_hf_points_inserted_total`,
  `synqdrive_clickhouse_hf_events_detected_total`, plus the shared
  `synqdrive_clickhouse_mirror_writes_total{table=...}` (success/error/skipped)
  and `synqdrive_clickhouse_last_mirror_unix_seconds{table=...}`.

Status of the HF layer per vehicle is surfaced (best-effort) in the data-analyse
high-frequency response via `hfConfigured`, `hfPointCount24h`, `hfLatestPointAt`,
`hfSignalGroupsSeen`, `hfRecentEvents`.

> Note: No new aggressive HF polling job is added in this step. The intended
> future mirror hook is the existing post-trip-enrichment HF fetch in
> `dimo-segments.service.ts` (`fetchHighFrequency`) — see the `TODO(hf-mirror)`
> there. Polling frequencies are unchanged.

## Restore

```bash
npm run clickhouse:restore:local -- synqdrive_YYYYMMDD_HHMMSS.zip
```

- Restores the database from a local backup file.
- It does **not** drop or overwrite existing data. If the database/tables
  already exist, the restore fails on purpose and the error stays visible so the
  operator can decide what to do.

## Production / VPS notes

- **Do not expose** ClickHouse ports publicly. They are bound to `127.0.0.1`
  in `docker-compose.yml` — keep it that way (and behind the firewall).
- Set a **strong** `CLICKHOUSE_PASSWORD` (do not ship the dev default).
- Keep backups **local** for now; an optional S3 / object-storage tier can be
  added later as a separate phase.

## Do NOT

- No cloud connection (no S3, no Hetzner Object Storage, no ClickHouse Cloud).
- No second source of truth — PostgreSQL stays canonical.
- Do not migrate PostgreSQL data into ClickHouse. ClickHouse only mirrors
  analytics/telemetry, it does not replace Postgres models.
