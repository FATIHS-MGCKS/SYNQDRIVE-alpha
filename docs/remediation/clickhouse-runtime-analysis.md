# Master Admin Remediation — Phase 2D.1: ClickHouse Runtime Analysis

**Date:** 2026-07-26  
**Status:** Baseline documented (repo + ops contracts); **live VPS runtime not verified in this run**  
**Constraint:** Analysis only — **no ClickHouse or runtime changes performed**

---

## Executive summary

| Layer | Status | Notes |
|-------|--------|-------|
| **Repository baseline** | ✅ Documented | `docker-compose.yml`, config XMLs, migrations 001–006, ops scripts |
| **Cloud Agent runtime** | ⚠️ N/A | No Docker socket; cannot inspect local or remote containers from this environment |
| **Production VPS runtime** | ❌ Not verified | SSH to `srv1374778.hstgr.cloud` failed (`Permission denied (publickey)`) |
| **Replication** | ✅ Confirmed absent (design) | All analytics tables use `MergeTree` / `ReplacingMergeTree` — no `ReplicatedMergeTree` |
| **Tiered storage policy** | ✅ Confirmed absent (design) | Only a local `backups` disk for BACKUP/RESTORE; no hot/cold tiering |

**Before any Phase 2D remediation change:** run the read-only VPS inspection bundle in [§12](#12-read-only-vps-inspection-bundle) and attach outputs to this document or a follow-up addendum.

---

## 1. Scope and methodology

### 1.1 What was inspected

| Source | Method |
|--------|--------|
| `backend/docker-compose.yml` | Static review |
| `backend/docker/clickhouse/**` | Static review (config.d + users.d) |
| `backend/src/modules/clickhouse/migrations/*.sql` | Static review (001–006) |
| `backend/src/modules/clickhouse/clickhouse-table-registry.ts` | Static review |
| `backend/scripts/ops/vps-*.sh` | Static review (backup, log hardening, mirrors, restore drill) |
| `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` | Cross-reference |
| `backend/docs/clickhouse-local-selfhosted.md` | Cross-reference |
| Production VPS | **Attempted SSH — blocked** |

### 1.2 Runtime model (SynqDrive)

```
┌─────────────────────────────────────────────────────────────────┐
│ NestJS backend — connects ONLY via CLICKHOUSE_URL (+ creds)     │
│ No Docker dependency in application code                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (8123) / native (9000)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ ClickHouse instance (environment-specific)                      │
│  • Local dev: docker compose → synqdrive-clickhouse             │
│  • Prod VPS: expected Docker container from release compose     │
│    (historical ops note: bind-mount path drift caused Exit 127) │
└─────────────────────────────────────────────────────────────────┘
```

PostgreSQL remains the system of record. ClickHouse is an optional append-only analytics mirror.

---

## 2. Docker container (repo baseline)

| Property | Value (from `backend/docker-compose.yml`) |
|----------|-------------------------------------------|
| **Service name** | `clickhouse` |
| **Container name** | `synqdrive-clickhouse` |
| **Image** | `clickhouse/clickhouse-server:25.8` |
| **Restart policy** | Compose default (`unless-stopped` when started via compose) |
| **Profile** | Default — started with `npm run infra:up` (postgres + redis + clickhouse) |
| **Depends on** | None declared (standalone service) |

### 2.1 Port bindings

| Host | Container | Protocol | Exposure |
|------|-----------|----------|----------|
| `127.0.0.1:8123` | `8123` | HTTP | Localhost only |
| `127.0.0.1:9000` | `9000` | Native TCP | Localhost only |

**Prod expectation:** same localhost binding when using compose on VPS; firewall must not expose 8123/9000 publicly.

### 2.2 Health check (compose)

```yaml
test: clickhouse-client --user $CLICKHOUSE_USER --password $CLICKHOUSE_PASSWORD --query "SELECT 1"
interval: 10s
timeout: 5s
retries: 5
start_period: 20s
```

Ops script `vps-clickhouse-log-hardening.sh` polls `docker inspect synqdrive-clickhouse --format '{{.State.Health.Status}}'` until `healthy`.

### 2.3 ulimits

| Limit | Soft | Hard |
|-------|------|------|
| `nofile` | 262144 | 262144 |

### 2.4 Docker logging driver

Inherited from compose anchor `docker_log_limits`:

- Driver: `json-file`
- `max-size`: 50m
- `max-file`: 3

`vps-clickhouse-log-hardening.sh` additionally truncates container `*-json.log` files **> 512 MB** before recreate (write ops — documented here for awareness; **not executed in 2D.1**).

---

## 3. Image version

| Environment | Image tag (repo) | Live tag (VPS) |
|-------------|------------------|----------------|
| Local dev compose | `clickhouse/clickhouse-server:25.8` | **Not verified** |
| Production VPS | Same compose file at `/opt/synqdrive/current/backend` | **Not verified** |

**Verification command (read-only):**

```bash
docker inspect synqdrive-clickhouse --format '{{.Config.Image}}'
docker exec synqdrive-clickhouse clickhouse-client -q "SELECT version()"
```

---

## 4. Volumes

### 4.1 Named Docker volumes (compose)

| Volume name | Mount point (container) | Purpose |
|-------------|-------------------------|---------|
| `clickhouse_data` | `/var/lib/clickhouse` | Primary data directory (MergeTree parts, metadata) |
| `clickhouse_logs` | `/var/log/clickhouse-server` | Server log files |

**Warning:** `docker compose down -v` deletes these volumes and all analytics data.

### 4.2 Host paths (production ops contracts)

| Path | Purpose | Source |
|------|---------|--------|
| `/opt/synqdrive/shared/clickhouse/backups` | BACKUP/RESTORE disk target on VPS | `vps-backup-clickhouse.sh`, `clickhouse-backup.env.example` |
| `/opt/synqdrive/shared/backups/clickhouse/daily` | Encrypted `.zip.gpg` archives | `vps-backup-clickhouse.sh` |
| `/opt/synqdrive/shared/backups/clickhouse/staging` | Pre-move staging | `vps-backup-clickhouse.sh` |
| `backend/storage/clickhouse/backups` (relative) | Local dev bind mount → `/backups` | `docker-compose.yml` |

**Live volume mapping (VPS):** not verified. Inspect with:

```bash
docker inspect synqdrive-clickhouse --format '{{json .Mounts}}' | jq .
docker volume ls | grep clickhouse
docker volume inspect <volume_name>
```

---

## 5. Bind mounts

From `backend/docker-compose.yml` (relative to `backend/`):

| Host path | Container path | Mode | Purpose |
|-----------|----------------|------|---------|
| `./storage/clickhouse/backups` | `/backups` | rw | Local backup disk for `Disk('backups')` |
| `./docker/clickhouse/config.d/backup_disk.xml` | `/etc/clickhouse-server/config.d/backup_disk.xml` | ro | Backup disk + concurrency policy |
| `./docker/clickhouse/config.d/01_logger.xml` | `/etc/clickhouse-server/config.d/01_logger.xml` | ro | Logger level/size |
| `./docker/clickhouse/config.d/z_system_logs.xml` | `/etc/clickhouse-server/config.d/z_system_logs.xml` | ro | System log TTL/disable |
| `./docker/clickhouse/users.d/z_log_profiles.xml` | `/etc/clickhouse-server/users.d/z_log_profiles.xml` | ro | Query log filtering |

### 5.1 Known production risk (historical)

Architecture notes (P78 / `ArchitekturView`) record a prior incident where bind mounts pointed to deleted `/tmp/synqdrive-ch-fix/backend/docker/clickhouse/*` paths, causing container **Exit 127**. Correct fix: recreate from `/opt/synqdrive/current/backend` so mounts resolve to the linked release tree.

**2D.1 action:** verify live mount sources on VPS before any config change.

---

## 6. Storage policy

### 6.1 Data storage (MergeTree)

All `synqdrive.*` analytics tables use the **default** storage configuration — a single local disk at `/var/lib/clickhouse`. There is **no** tiered storage policy (no S3/cold tier, no `storage_policy` clause on table DDL).

Migration `002_retention_ttl_and_storage_policy.sql` adjusts **TTL only**; the filename references storage policy conceptually but the SQL contains **no** `ALTER … MODIFY SETTING storage_policy` or policy XML.

### 6.2 Backup disk (separate from table data)

`backend/docker/clickhouse/config.d/backup_disk.xml`:

| Setting | Value |
|---------|-------|
| Disk name | `backups` |
| Type | `local` |
| Path | `/backups/` |
| Allowed for BACKUP/RESTORE | yes |
| `allow_concurrent_backups` | `false` |
| `allow_concurrent_restores` | `false` |

No cloud/object storage configured in repo.

**Verification (read-only):**

```sql
SELECT name, path, type FROM system.disks;
SELECT * FROM system.storage_policies;
```

---

## 7. Data directories

| Path (container) | Contents |
|------------------|----------|
| `/var/lib/clickhouse` | Databases, table parts, metadata (`store/`, `data/`, `metadata/`) |
| `/var/log/clickhouse-server` | Rotated server logs (warning level, 100M × 3 per config) |
| `/backups` | Logical backup ZIPs from `BACKUP DATABASE` |
| `/etc/clickhouse-server/config.d/` | Drop-in server config |
| `/etc/clickhouse-server/users.d/` | Drop-in user/profile config |

**Host disk usage (VPS):**

```bash
df -h /
du -sh /var/lib/docker/volumes/*clickhouse* 2>/dev/null
docker exec synqdrive-clickhouse du -sh /var/lib/clickhouse /backups /var/log/clickhouse-server
```

---

## 8. Configuration

### 8.1 Environment variables (compose)

| Variable | Default (dev) | Purpose |
|----------|---------------|---------|
| `CLICKHOUSE_DB` | `synqdrive` | Default database |
| `CLICKHOUSE_USER` | `synqdrive` | Application user |
| `CLICKHOUSE_PASSWORD` | `synqdrive_clickhouse_dev` | **Must differ in prod** |
| `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT` | `1` | SQL-driven user management |

Backend uses `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE` (see `backend/.env.example`).

### 8.2 Server config overlays

#### `01_logger.xml`

- Level: `warning` (vs default `trace` in upstream image)
- Rotation: 100M × 3 files

#### `z_system_logs.xml`

| System log | Policy |
|------------|--------|
| `text_log`, `trace_log`, `processors_profile_log`, `asynchronous_metric_log`, `query_thread_log`, `query_views_log`, `query_metric_log`, `session_log` | **Removed** |
| `query_log` | MergeTree, 7-day TTL on `event_date` |
| `metric_log` | TTL 3 days |
| `part_log` | TTL 7 days |

`vps-clickhouse-log-hardening.sh` may `DROP TABLE` on disabled logs if they were created before hardening (best-effort).

#### `z_log_profiles.xml` (default profile)

- Log queries slower than **1000 ms** only
- `log_query_threads`, `log_query_views`, `log_processors_profiles`: off

### 8.3 Backend mirror feature flags (VPS)

Set by `vps-enable-clickhouse-mirrors.sh` in `/opt/synqdrive/shared/backend.env`:

| Flag | Value when enabled |
|------|-------------------|
| `HF_MIRROR_ENABLED` | `true` |
| `WAYPOINT_MIRROR_ENABLED` | `true` |
| `ACTIVITY_WINDOW_MIRROR_ENABLED` | `true` |
| `CLICKHOUSE_TRIP_ASSIST_ENABLED` | `true` |

Requires pre-existing `CLICKHOUSE_URL`.

---

## 9. Users and access

### 9.1 Application user (expected)

| Property | Dev default | Prod |
|----------|-------------|------|
| Username | `synqdrive` | `synqdrive` (typical) |
| Database | `synqdrive` | `synqdrive` |
| Password | `synqdrive_clickhouse_dev` | **Operator secret** (`clickhouse-backup.env`, `backend.env`) |

### 9.2 Verification (read-only)

```sql
SELECT name, storage, auth_type FROM system.users;
SHOW GRANTS FOR synqdrive;
SELECT name, value FROM system.settings WHERE changed;
```

```bash
# HTTP ping (no auth)
curl -sS http://127.0.0.1:8123/ping

# Authenticated
clickhouse-client --host 127.0.0.1 --user synqdrive --password "$CLICKHOUSE_PASSWORD" -q "SELECT currentUser(), currentDatabase()"
```

---

## 10. Networks

Compose attaches the container to the default project network (`backend_default` or similar) alongside `synqdrive-postgres` and `synqdrive-redis`.

| Listener | Bind | Notes |
|----------|------|-------|
| HTTP | `0.0.0.0:8123` inside container | Host published as `127.0.0.1:8123` |
| Native | `0.0.0.0:9000` inside container | Host published as `127.0.0.1:9000` |

**Verification:**

```bash
docker inspect synqdrive-clickhouse --format '{{json .NetworkSettings.Networks}}' | jq .
ss -tlnp | grep -E '8123|9000'
```

Backend on same host typically uses `CLICKHOUSE_URL=http://127.0.0.1:8123`.

---

## 11. Resources

| Resource | Compose setting | Live (VPS) |
|----------|-----------------|------------|
| CPU / memory limits | **None defined** | Not verified |
| `nofile` ulimit | 262144 | Not verified |
| Merge concurrency | Server defaults | Not verified |

**Verification:**

```bash
docker inspect synqdrive-clickhouse --format 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'
docker stats synqdrive-clickhouse --no-stream
```

```sql
SELECT metric, value FROM system.asynchronous_metrics
WHERE metric IN ('OSMemoryTotal', 'OSMemoryAvailable', 'NumberOfTables', 'MaxPartCountForPartition');
```

---

## 12. Logs

| Log sink | Location | Retention / limits |
|----------|----------|-------------------|
| ClickHouse server log | `/var/log/clickhouse-server/` (volume) | warning, 100M × 3 |
| Docker json-file | `/var/lib/docker/containers/<id>/<id>-json.log` | 50m × 3 (compose) |
| `system.query_log` | Inside CH data dir | 7-day TTL |
| Disabled logs | N/A | Removed via config |

**Read-only inspection:**

```bash
docker logs synqdrive-clickhouse --tail 200
docker exec synqdrive-clickhouse tail -n 100 /var/log/clickhouse-server/clickhouse-server.log
```

```sql
SELECT event_time, type, query_duration_ms, exception
FROM system.query_log
WHERE type = 'ExceptionWhileProcessing'
ORDER BY event_time DESC LIMIT 20;
```

---

## 13. Health status

### 13.1 Container health

| Check | Expected |
|-------|----------|
| Docker health | `healthy` after `SELECT 1` |
| HTTP `/ping` | `Ok.` |
| `npm run clickhouse:ping:url` | exit 0 (uses `CLICKHOUSE_URL`) |

### 13.2 Application readiness

`GET /api/v1/health/readiness` → `checks.clickhouse`:

| Backend status | Meaning |
|----------------|---------|
| `disabled` | `CLICKHOUSE_URL` unset |
| `degraded` | configured but unreachable |
| `schema_error` | reachable but migration failure |
| `available` | reachable + schema healthy |

Storage details (when available) come from `ClickHouseAnalyticsService.getStorageStats()` querying `system.parts` — table count, row counts, compressed/uncompressed bytes, oldest/newest event times.

### 13.3 Prometheus (when scraped)

- `synqdrive_clickhouse_available`
- `synqdrive_clickhouse_schema_status`
- `synqdrive_clickhouse_table_rows{table,status}`
- `synqdrive_clickhouse_mirror_writes_total{table}`

---

## 14. Tables (schema inventory)

Database: **`synqdrive`** (plus `system` for internals).

| Table | Engine | Partition key | ORDER BY | TTL field | Retention |
|-------|--------|---------------|----------|-----------|-----------|
| `telemetry_snapshots` | MergeTree | `toYYYYMM(recorded_at)` | `(vehicle_id, recorded_at)` | `recorded_at` | 180 days |
| `telemetry_state_changes` | MergeTree | `toYYYYMM(changed_at)` | `(vehicle_id, signal_name, changed_at)` | `changed_at` | 365 days |
| `telemetry_waypoints` | MergeTree | `toYYYYMM(recorded_at)` | `(vehicle_id, recorded_at)` | `recorded_at` | 365 days |
| `trip_activity_windows` | ReplacingMergeTree(`computed_at`) | `toYYYYMM(window_start)` | `(vehicle_id, window_start, window_end)` | `window_start` | 365 days |
| `trip_segment_candidates` | ReplacingMergeTree(`computed_at`) | `toYYYYMM(segment_start)` | `(vehicle_id, segment_start)` | `segment_start` | 180 days |
| `telemetry_hf_points` | MergeTree | `toYYYYMM(recorded_at)` | `(org_id, vehicle_id, signal_name, recorded_at)` | `recorded_at` | 90 days |
| `telemetry_hf_windows` | ReplacingMergeTree(`computed_at`) | `toYYYYMM(window_start)` | `(org_id, vehicle_id, window_start, signal_group)` | `window_start` | 180 days |
| `telemetry_hf_events` | ReplacingMergeTree(`computed_at`) | `toYYYYMM(event_start)` | `(org_id, vehicle_id, event_type, event_start)` | `event_start` | 365 days |
| `schema_migrations` | (internal) | — | — | — | — |

**Producer registry:** `backend/src/modules/clickhouse/clickhouse-table-registry.ts`

Notable: `trip_segment_candidates` has **no writer yet** (`planned_no_producer`).

### 14.1 Schema verification SQL

```sql
SELECT database, name, engine, partition_key, sorting_key, total_rows, total_bytes
FROM system.tables
WHERE database = 'synqdrive'
ORDER BY name;

SELECT version, applied_at FROM synqdrive.schema_migrations ORDER BY version;
```

---

## 15. Database size and disk usage

### 15.1 Per-table size (read-only)

```sql
SELECT
  table,
  sum(rows) AS rows,
  formatReadableSize(sum(data_compressed_bytes)) AS compressed,
  formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
  formatReadableSize(sum(bytes_on_disk)) AS on_disk
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table
ORDER BY sum(bytes_on_disk) DESC;
```

### 15.2 Database totals

```sql
SELECT
  formatReadableSize(sum(bytes_on_disk)) AS total_on_disk,
  sum(rows) AS total_rows
FROM system.parts
WHERE database = 'synqdrive' AND active;
```

### 15.3 System / log table footprint

```sql
SELECT table, formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE active AND database = 'system'
GROUP BY table
ORDER BY sum(bytes_on_disk) DESC
LIMIT 20;
```

**Historical prod note (architecture):** ~410k rows cited after P78 recovery — **live count not re-verified in 2D.1**.

---

## 16. Partitions

All analytics tables partition **monthly** by event time (`toYYYYMM(...)`).

```sql
SELECT
  table,
  partition,
  sum(rows) AS rows,
  formatReadableSize(sum(bytes_on_disk)) AS size,
  min(min_time) AS min_time,
  max(max_time) AS max_time
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table, partition
ORDER BY table, partition;
```

```sql
-- Partition count per table
SELECT table, uniqExact(partition) AS partition_count
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table
ORDER BY table;
```

---

## 17. Merge queue and background tasks

### 17.1 Active merges

```sql
SELECT
  database, table, partition_id, num_parts, progress,
  total_size_bytes_compressed, elapsed,
  is_mutation
FROM system.merges;
```

### 17.2 Merge backlog (parts per partition)

```sql
SELECT
  table,
  partition,
  count() AS part_count,
  formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table, partition
HAVING part_count > 10
ORDER BY part_count DESC
LIMIT 30;
```

### 17.3 Background pool / mutations

```sql
SELECT type, status, num_tries, last_exception, create_time
FROM system.mutations
WHERE database = 'synqdrive'
ORDER BY create_time DESC
LIMIT 20;

SELECT * FROM system.replication_queue;  -- expect empty (no replication)
```

### 17.4 Background schedule (server tasks)

```sql
SELECT type, status, progress, last_exception
FROM system.processes
WHERE is_cancelled = 0 AND query NOT LIKE '%system.processes%';
```

---

## 18. Replication

| Aspect | Status |
|--------|--------|
| `ReplicatedMergeTree` tables | **None** in migrations |
| ZooKeeper / Keeper | **Not configured** in repo |
| `system.replicas` | Expected **empty** |
| Cluster DDL | **None** |

```sql
SELECT * FROM system.replicas;
SELECT * FROM system.clusters;
```

Single-node deployment is the intended architecture for the self-hosted VPS path.

---

## 19. TTL jobs

### 19.1 Business tables (`synqdrive`)

TTL enforced on event-time columns (see §14). ClickHouse removes expired rows during merges — no separate cron.

```sql
SELECT database, table, engine_full
FROM system.tables
WHERE database = 'synqdrive' AND engine_full LIKE '%TTL%';
```

### 19.2 TTL merge activity

```sql
SELECT event_time, table, part_name, rows, bytes_uncompressed
FROM system.part_log
WHERE event_type IN ('RemovePart', 'MutatePart')
  AND database IN ('synqdrive', 'system')
ORDER BY event_time DESC
LIMIT 50;
```

### 19.3 System log TTL

| Table | TTL |
|-------|-----|
| `system.query_log` | 7 days |
| `system.metric_log` | 3 days |
| `system.part_log` | 7 days |

---

## 20. Backup and restore runtime

| Component | Path / mechanism |
|-----------|------------------|
| Backup script | `backend/scripts/ops/vps-backup-clickhouse.sh` |
| Schedule (automation) | 03:30 UTC daily (see `backup-automation.md`) |
| Command | `BACKUP DATABASE synqdrive TO Disk('backups', '<zip>')` |
| Staging disk | `/opt/synqdrive/shared/clickhouse/backups` (VPS) |
| Archive | `/opt/synqdrive/shared/backups/clickhouse/daily/*.zip.gpg` |
| Restore drill | `vps-restore-test-clickhouse.sh` (isolated DB, non-prod port) |

Local dev: `npm run clickhouse:backup:docker` → `backend/storage/clickhouse/backups/`

---

## 21. Gaps and risks (pre-remediation)

| ID | Risk | Severity | Evidence |
|----|------|----------|----------|
| R1 | Live VPS state unknown in 2D.1 | **P0** | SSH blocked from Cloud Agent |
| R2 | Bind-mount path drift can brick container | **P0** | P78 incident in ArchitekturView |
| R3 | No CPU/memory limits on CH container | P2 | compose has no `deploy.resources` |
| R4 | Dev password in compose defaults | P1 | prod must use strong secret |
| R5 | `trip_segment_candidates` empty by design | P3 | no producer wired |
| R6 | Single-node, no replication | P2 | accepted for VPS; no HA |
| R7 | Backup/restore disk depends on mount | P1 | verify `/backups` + shared path on VPS |
| R8 | DR acceptance NO-GO | P0 | `disaster-recovery-production-readiness.md` |

---

## 22. Read-only VPS inspection bundle

Run on the VPS as root (or deploy user with docker access). **No mutations.**

```bash
#!/usr/bin/env bash
# clickhouse-runtime-snapshot.sh — read-only 2D.1 inspection
set -euo pipefail
CH=synqdrive-clickhouse
BACKEND=/opt/synqdrive/current/backend

echo "=== HOST / DISK ==="
hostname; date -u; df -h /

echo "=== CONTAINER ==="
docker ps -a --filter name=$CH --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker inspect $CH --format 'Health={{.State.Health.Status}} Started={{.State.StartedAt}}' 2>/dev/null || true

echo "=== IMAGE VERSION ==="
docker exec $CH clickhouse-client -q "SELECT version()" 2>/dev/null || true

echo "=== MOUNTS ==="
docker inspect $CH --format '{{json .Mounts}}' | jq -r '.[] | "\(.Type)\t\(.Source) -> \(.Destination)"' 2>/dev/null || true

echo "=== RESOURCES ==="
docker stats $CH --no-stream 2>/dev/null || true

echo "=== LOGS (tail) ==="
docker logs $CH --tail 30 2>&1 || true

echo "=== HTTP PING ==="
curl -sS http://127.0.0.1:8123/ping || true

echo "=== CH SQL SNAPSHOT ==="
source /opt/synqdrive/shared/clickhouse-backup.env 2>/dev/null || true
clickhouse-client --host "${CLICKHOUSE_HOST:-127.0.0.1}" --port "${CLICKHOUSE_PORT:-9000}" \
  --user "${CLICKHOUSE_USER:-synqdrive}" ${CLICKHOUSE_PASSWORD:+--password "$CLICKHOUSE_PASSWORD"} -q "
SELECT 'disks' AS section;
SELECT name, path, formatReadableSize(free_space) AS free, formatReadableSize(total_space) AS total FROM system.disks;
SELECT 'db_size' AS section;
SELECT formatReadableSize(sum(bytes_on_disk)) AS synqdrive_on_disk, sum(rows) AS rows FROM system.parts WHERE database='synqdrive' AND active;
SELECT 'tables' AS section;
SELECT table, sum(rows) AS rows, formatReadableSize(sum(bytes_on_disk)) AS size FROM system.parts WHERE database='synqdrive' AND active GROUP BY table ORDER BY sum(bytes_on_disk) DESC;
SELECT 'merges' AS section;
SELECT count() AS active_merges FROM system.merges;
SELECT 'replication' AS section;
SELECT count() AS replica_count FROM system.replicas;
SELECT 'migrations' AS section;
SELECT version, applied_at FROM synqdrive.schema_migrations ORDER BY version;
"

echo "=== COMPOSE DRIFT CHECK ==="
test -f "$BACKEND/docker-compose.yml" && grep -A2 'clickhouse:' "$BACKEND/docker-compose.yml" | head -5
ls -la "$BACKEND/docker/clickhouse/config.d/" 2>/dev/null || true
```

Save output:

```bash
bash clickhouse-runtime-snapshot.sh | tee /opt/synqdrive/shared/reports/clickhouse-runtime-$(date -u +%Y%m%dT%H%M%SZ).log
```

---

## 23. Related documentation

| Document | Role |
|----------|------|
| `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` | Runtime model, no-gos |
| `architecture/MASTER_ADMIN_CLICKHOUSE_RUNTIME_ANALYSIS_2026-07-26.md` | Architecture change record |
| `backend/docs/clickhouse-local-selfhosted.md` | Local ops guide |
| `docs/remediation/disaster-recovery-production-readiness.md` | DR acceptance (NO-GO) |
| `docs/remediation/backup-automation.md` | CH backup schedule |

---

## 24. Phase 2D.1 conclusion

| Question | Answer |
|----------|--------|
| Is the **intended** ClickHouse architecture documented? | **Yes** — single-node Docker compose on VPS, URL-driven backend, TTL-bound analytics mirror |
| Is the **live** runtime fully documented? | **No** — requires VPS snapshot script output |
| Safe to proceed with 2D remediation design? | **Conditional** — complete §22 on production first |
| Were any changes made? | **No** |

**Next step (2D.2+):** attach VPS snapshot log, reconcile live vs repo baseline, then plan targeted hardening (resources, mount validation, mirror flags audit, backup disk verification).
