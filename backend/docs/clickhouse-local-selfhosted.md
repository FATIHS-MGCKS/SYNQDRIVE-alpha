# ClickHouse — local / self-hosted

> **Architektur & No-Gos:** `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`

## What ClickHouse is in SynqDrive

- An **optional analytics / telemetry / evidence mirror** (append-only sidecar).
- **PostgreSQL stays the canonical truth** for Vehicles, Trips, Bookings, Damages,
  Customers, Billing, and Tasks.
- Operational logic (DIMO snapshots, Trips FSM, Health, Rental, Enrichment) does
  **not** depend on ClickHouse being up.
- If ClickHouse is down, only analytics mirroring and Data Analyse depth are
  affected — the rest of SynqDrive keeps running.

## Runtime model (local vs production)

| Environment | Typical setup | Backend binding |
|-------------|---------------|-----------------|
| **Local / Dev** | `docker compose` can provide ClickHouse via `npm run infra:up` | `CLICKHOUSE_URL=http://localhost:8123` (dev defaults) |
| **Prod / VPS** | Native install, external managed CH, or self-hosted Docker **outside** `infra:up` | **Only** `CLICKHOUSE_URL` (+ user/password/database) |

**Important:**

- Docker Compose is a **local/dev default**, not the global runtime truth.
- The NestJS backend uses `@clickhouse/client` against `CLICKHOUSE_URL` only.
- **Before any prod infra change:** check what already listens on ports **8123** (HTTP)
  and **9000** (native). Do **not** run `npm run infra:up` blindly on a VPS — it may
  start a second ClickHouse or collide with an existing native/external instance.
- Omit `CLICKHOUSE_URL` to disable ClickHouse entirely (backend starts normally).

## Start (local dev only)

From the `backend/` directory:

```bash
npm run infra:up
```

This starts `postgres`, `redis` and `clickhouse` via `docker-compose.yml`.

To stop containers (does **not** remove volumes):

```bash
npm run infra:down
```

**Never** use `docker compose down -v` without a backup — that deletes Docker volumes
including `clickhouse_data`.

## Environment

Local dev defaults (see `.env.example`, matching `docker-compose.yml`):

```bash
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=synqdrive
CLICKHOUSE_PASSWORD=synqdrive_clickhouse_dev
CLICKHOUSE_DATABASE=synqdrive
HF_MIRROR_ENABLED=false   # optional HF trip mirror; see .env.example
```

If `CLICKHOUSE_URL` is unset, the analytics layer is **disabled** at startup.

The schema (`synqdrive.telemetry_*`, `synqdrive.trip_*`) is created
automatically by `ClickHouseSchemaService` on application bootstrap — all
statements are idempotent (`CREATE ... IF NOT EXISTS` / additive `ALTER` only).

## Verify

**URL-based (works for local Docker, native, or external — recommended for prod):**

```bash
npm run clickhouse:ping:url
```

**Docker Compose container only (local dev):**

```bash
npm run clickhouse:ping:docker
# legacy alias: npm run clickhouse:ping
```

**HTTP health (no auth):**

```bash
curl http://localhost:8123/ping    # -> "Ok."
```

The backend exposes its own readiness check that includes ClickHouse:

```
GET /health/readiness
```

ClickHouse appears under `checks.clickhouse`. A `degraded` overall status with
ClickHouse `error` does **not** mean operational logic is broken — it only means
the analytics mirror is unavailable.

## Backup (local Docker only)

```bash
npm run clickhouse:backup:docker
# legacy alias: npm run clickhouse:backup:local
```

- Requires the **docker compose** `clickhouse` service (not for native/external prod).
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

## Restore (local Docker only)

```bash
npm run clickhouse:restore:docker -- synqdrive_YYYYMMDD_HHMMSS.zip
# legacy alias: npm run clickhouse:restore:local
```

- Requires the **docker compose** `clickhouse` service.
- Restores the database from a local backup file.
- It does **not** drop or overwrite existing data. If the database/tables
  already exist, the restore fails on purpose and the error stays visible so the
  operator can decide what to do.

## Production / VPS notes

- **Do not expose** ClickHouse ports publicly. `docker-compose.yml` binds to
  `127.0.0.1` — keep it that way (and behind the firewall) when using Compose.
- Set a **strong** `CLICKHOUSE_PASSWORD` (do not ship the dev default).
- Point `CLICKHOUSE_URL` at your existing native/external instance — **do not**
  assume `infra:up` is the correct prod bootstrap.
- Verify with `npm run clickhouse:ping:url` and `GET /api/v1/health/readiness`.
- Keep backups **local** for Docker-dev; prod backup strategy is operator-owned.
  An optional S3 / object-storage tier can be added later as a separate phase.

## Architecture boundaries (summary)

| Store | Role |
|-------|------|
| PostgreSQL | System of record (Vehicles, Trips, Bookings, …) |
| ClickHouse | Append-only analytics / telemetry / evidence mirror |
| Redis / BullMQ | Runtime, queues, workers |
| Prometheus | Ops / health (`/api/v1/metrics`) — not business data |

ClickHouse may supply **repair/evidence suggestions** (e.g. ignition segments) but
must **never** be the sole source of final trip truth. Canonical trips live in
PostgreSQL; DIMO Segments apply where architected.

Full detail: `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`

## Do NOT (No-Go list)

| Rule | Reason |
|------|--------|
| ClickHouse as truth for Vehicles / Trips / Bookings / Damages / Customers / Billing | PostgreSQL is canonical |
| `docker compose down -v` without backup | Deletes `clickhouse_data` and other volumes |
| Destructive CH migrations without a controlled migration plan | Risks existing native/external data |
| Force Docker for production | Backend is `CLICKHOUSE_URL`-driven |
| `vehicle_id`, `vin`, `customer_id`, `booking_id`, `trip_id`, `org_id` as Prometheus labels | High cardinality |
| Operational booking/damage data only in ClickHouse | Business data belongs in PostgreSQL |
| UI/API that returns 500 when ClickHouse is down (operational paths) | CH is optional |
| Blind `infra:up` on prod VPS | Port conflict / second instance |
| Overwrite existing native/external ClickHouse without runtime check | Check 8123/9000 first |

Additional ops rules:

- No mandatory cloud connection (S3 / ClickHouse Cloud) in this phase.
- Do not migrate PostgreSQL business data into ClickHouse.
- ClickHouse only mirrors analytics/telemetry; it does not replace Prisma models.
