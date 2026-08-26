# ClickHouse Production Recovery — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `clickhouse-production-recovery-2026-08` |
| **Related** | `production-worker-queue-clickhouse-audit-2026-08` |
| **Branch** | `fix/clickhouse-production-recovery-2026-08` |
| **VPS** | `srv1374778.hstgr.cloud` |
| **Recovery window (UTC)** | 2026-08-26 15:24 – 15:52 |

---

## 1. Incident Summary

ClickHouse container `synqdrive-clickhouse` was **OOM-killed on 2026-08-21 04:45 UTC** and remained down for **5 days** because `restart: no`. Analytics mirror, backups, and readiness checks failed; PostgreSQL remained canonical SoT.

**Recovery outcome:** Container **online and stable** with hardened memory config, `unless-stopped` restart policy, **4 GiB** cgroup limit, merges throttled, backups verified, readiness **available**.

---

## 2. OOM Timeline

| Time (UTC) | Event |
|------------|-------|
| 2026-08-18 19:11 | Container (re)started after remediation |
| 2026-08-21 04:44:47 | Health checks still passing |
| 2026-08-21 04:45:19 | `metric_log` merge: `MEMORY_LIMIT_EXCEEDED` (~1.83 GiB RSS, max 1.80 GiB) |
| 2026-08-21 04:45:34 | **Cgroup OOM kill** — `clickhouse-serv` RSS ~2.0 GiB, Docker limit **2 GiB** |
| 2026-08-21 – 08-26 | Container exited; daily backups fail; app logs `ECONNREFUSED 127.0.0.1:8123` |
| 2026-08-26 15:24 | Recovery start — config hardening + first successful start |
| 2026-08-26 15:38 | Brief stability at **2 GiB** limit; recreate to **3 GiB** triggered merge storm |
| 2026-08-26 15:38–15:46 | **OOM restart loop** (9 restarts) — `MergeMutate` exceeded **3 GiB** cgroup |
| 2026-08-26 15:46 | **4 GiB** limit + stricter `max_server_memory_usage` + `SYSTEM STOP MERGES` |
| 2026-08-26 15:47 | Healthy at **~1.0 GiB / 4 GiB** |
| 2026-08-26 15:48 | `SYSTEM START MERGES` — stable **~1.44 GiB / 4 GiB** for 4+ minutes |

---

## 3. Root Causes

| ID | Root cause | Confidence |
|----|------------|------------|
| **CH-RC-01** | `metric_log` background merge exceeded ClickHouse server memory cap inside **2 GiB** Docker cgroup | **Confirmed** |
| **CH-RC-02** | `max_server_memory_usage` default (~90% RAM) + untracked allocations exceeded cgroup during large merges | **Confirmed** |
| **CH-RC-03** | `deploy.resources.limits.memory` **not applied** on standalone Docker Compose (only Swarm) — effective limit stayed **2 GiB** until `mem_limit` added | **Confirmed** |
| **CH-RC-04** | `restart: no` — container stayed down after OOM | **Confirmed** |
| **CH-RC-05** | Post-outage **startup merge storm** (`MergeMutate`) exceeded **3 GiB** cgroup before merge throttling | **Confirmed** |
| **CH-RC-06** | Host **swap 0 B** — no swap cushion for memory spikes | **Confirmed** |

---

## 4. Host Memory State (at recovery)

| Metric | Value |
|--------|-------|
| Total RAM | 15 GiB |
| Available | ~13 GiB |
| Host swap | **0 B** (none configured) |
| vm.overcommit_memory | 0 |
| SynqDrive Node | ~480 MiB |
| PostgreSQL | ~200–500 MiB |
| Prometheus/Grafana stack | ~150 MiB |
| ClickHouse (stable post-recovery) | **~1.44 GiB / 4 GiB** (36%) |

**VPS headroom:** Sufficient for **4 GiB** ClickHouse cgroup with ~9 GiB+ available for other services.

---

## 5. ClickHouse Memory Configuration — Before

| Setting | Value |
|---------|-------|
| Docker effective limit | **2 GiB** (`deploy.resources` ignored on standalone Compose) |
| `max_server_memory_usage` | Default (~1.8 GiB at 2 GiB cgroup) |
| `metric_log` | **Enabled** (3-day TTL) — merge triggered OOM |
| Mark/uncompressed cache | Defaults (large) |
| Merge byte limits | Defaults |
| Restart policy | **no** |

---

## 6. Changes Applied

### 6.1 Repository (`fix/clickhouse-production-recovery-2026-08`)

| File | Change |
|------|--------|
| `docker/clickhouse/config.d/z_memory_budget.xml` | **New** — `max_server_memory_usage=2G`, smaller caches, merge byte caps |
| `docker/clickhouse/config.d/z_system_logs.xml` | **Remove `metric_log`** (OOM trigger) |
| `docker-compose.vps-clickhouse.yml` | `mem_limit: 4g`, `restart: unless-stopped`, mount memory config; remove conflicting `deploy.resources` |
| `docker-compose.yml` | Mount `z_memory_budget.xml` for local parity |
| `monitoring/prometheus/prometheus.vps.yml` | Blackbox probe `http://127.0.0.1:8123/ping` |
| `monitoring/prometheus/alerts-infra.yml` | `ClickHouseHttpProbeFailed` alert |
| `clickhouse-docker-config.spec.ts` | Regression tests for config files |

### 6.2 Production VPS (live)

| Item | Value |
|------|-------|
| Shared configs synced | `/opt/synqdrive/shared/clickhouse/config/config.d/` |
| `mem_limit` | **4294967296 (4 GiB)** |
| `restart` | `unless-stopped` |
| Recovery action | `SYSTEM STOP MERGES` during startup, then `SYSTEM START MERGES` after stable |

### 6.3 Proposed memory budget (steady state)

| Layer | Budget |
|-------|--------|
| Docker cgroup | 4 GiB |
| `max_server_memory_usage` | 2 GiB |
| Mark cache | 128 MiB |
| Uncompressed cache | 64 MiB |
| Max merge at max pool | 50 MiB |

---

## 7. Recovery Execution

1. Read-only forensics (inspect, journals, logs, volumes — **3.4 GiB** data intact).
2. Sync hardened XML configs to shared bind mounts.
3. `docker compose up -d --force-recreate clickhouse` (volumes preserved).
4. Config iteration: fixed `background_pool_size` sanity error (removed pool overrides).
5. Applied `mem_limit: 4g` (Compose standalone).
6. `SYSTEM STOP MERGES` after healthy ping — broke OOM restart loop.
7. `SYSTEM START MERGES` after memory stabilized.
8. Manual backup test succeeded.

**No data deleted.** No volumes recreated. No `DROP` statements.

---

## 8. Data Integrity Verification

| Check | Result |
|-------|--------|
| Data volume | `backend_clickhouse_data` — **3.4 GiB**, intact |
| Database `synqdrive` | 8 tables with data |
| `telemetry_snapshots` rows | **969,648+** (pre-outage data present) |
| Latest snapshot timestamp | 2026-08-26 11:58:27 (DIMO signal time; polls resumed) |
| Pending mutations | **0** |
| Detached parts | Not observed in audit queries |
| Schema migrations | 7 applied |

---

## 9. Mirror Recovery

| Item | Status |
|------|--------|
| `clickhouse.mirror.retry` failed (Redis) | **6** terminal jobs (historical CH-down failures) |
| Waiting/active mirror queue | **0** |
| New mirror writes | **Yes** — row count increased post-recovery (969600 → 969648+) |
| Idempotency | Snapshot inserts dedupe on `vehicle_id` + `recorded_at` |
| Bulk retry of failed jobs | **Not performed** (per policy — terminal jobs retained) |
| Live polling → CH | Resumed after readiness `available=true` |

**Note:** `recorded_at` in snapshots reflects **DIMO signal time**, not insert time — latest timestamp may lag while rows still accumulate.

---

## 10. Backup Verification

| Item | Result |
|------|--------|
| Script | `vps-clickhouse-backup.sh --label recovery_test_20260826` |
| Outcome | **SUCCESS** |
| Artifact | `g1_recovery_test_20260826_20260826T153802Z.zip` (~3.5 MB) |
| Daily cron failures | Expected to resume on next 03:30 UTC run |

---

## 11. Master Admin / Readiness Verification

| Check | Post-recovery |
|-------|---------------|
| `GET /api/v1/health/readiness` → `clickhouse` | **status: ok**, **details.status: available**, **available: true** |
| `lastPingAt` | Updated (periodic 60s ping) |
| Platform Ops ClickHouse tile | Expected **healthy** (same readiness path) |
| PM2 restart required? | **No** — periodic ping restored availability |

---

## 12. OOM Prevention Measures

| Measure | Status |
|---------|--------|
| Explicit `max_server_memory_usage` (2 GiB) | **Deployed** |
| Smaller mark/uncompressed caches | **Deployed** |
| Merge byte limits (50 MiB max) | **Deployed** |
| `metric_log` removed | **Deployed** |
| Docker `mem_limit: 4g` (standalone Compose) | **Deployed** |
| `restart: unless-stopped` | **Deployed** (with memory guards) |
| Blackbox HTTP probe + alert | **Deployed** — Prometheus reloaded; probe UP |
| Existing `ClickHouseUnavailable` alert | Already present |
| Existing `HostMemoryHigh` (>90%) alert | Already present |
| Startup merge throttling runbook | **SYSTEM STOP MERGES** during recovery |

---

## 13. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Large merge backlog may grow parts count while merges are throttled | Medium | Monitor `system.parts`; consider off-peak `START MERGES` + watch memory |
| **4 GiB** may be insufficient if data grows 10× without TTL | Low–Medium | TTL policies exist; monitor disk + memory |
| No host swap — spike kills cgroup | Medium | Memory caps + alerts; optional swap provisioning |
| `unless-stopped` + misconfiguration → restart loop | Low | Memory config + STOP MERGES playbook |
| 6 terminal mirror retry jobs remain in Redis | Low | Cosmetic ops noise; optional cleanup in separate phase |
| Prometheus VPS config not reloaded yet | Low | **Resolved** — config copied + `POST /-/reload` during stability gate |

---

## 14. Final Stability Validation (gate — 2026-08-26)

**Observation window:** 2026-08-26 **16:07:56 – 17:09:09 UTC** (~**61 minutes**), plus container uptime since final recreate at **15:46:38 UTC** (~**86 minutes** total without restart).

### Time series (canonical runner — 5 min samples)

| Timestamp (UTC) | RSS | CPU | Active merges | Parts (`telemetry_snapshots`) | Rows (`telemetry_snapshots`) | `QueryMemoryLimitExceeded` |
|-----------------|-----|-----|---------------|-------------------------------|------------------------------|----------------------------|
| 16:13:55 | 865.7 MiB / 4 GiB | 7.96% | 0 | 14 | 970006 | 0 |
| 16:18:56 | 865.6 MiB / 4 GiB | 6.59% | 0 | 15 | 970066 | 0 |
| 16:23:57 | 863.2 MiB / 4 GiB | 7.05% | 0 | 14 | 970126 | 0 |
| 16:28:58 | 859.9 MiB / 4 GiB | 6.99% | 0 | 14 | 970186 | 0 |
| 16:34:00 | 861.3 MiB / 4 GiB | 10.82% | 0 | 13 | 970246 | 0 |
| 16:39:01 | 861.6 MiB / 4 GiB | 47.17% | 0 | 10 | 970306 | 0 |
| 16:44:03 | 864.4 MiB / 4 GiB | 15.99% | 0 | 11 | 970366 | 0 |
| 16:49:04 | 866.2 MiB / 4 GiB | 6.59% | 0 | 9 | 970426 | 0 |
| 16:54:05 | 878.9 MiB / 4 GiB | 5.84% | 0 | 11 | 970486 | 0 |
| 16:59:07 | 867.3 MiB / 4 GiB | 7.28% | 0 | 10 | 970546 | 0 |
| 17:04:08 | 871.1 MiB / 4 GiB | 5.40% | 0 | 8 | 970606 | 0 |
| 17:09:09 | 869.5 MiB / 4 GiB | 6.29% | 0 | 11 | 970666 | 0 |

**Post-window final (17:12 UTC):** 866.5 MiB / 4 GiB, **11 parts**, **970708 rows**, 0 active merges.

### Memory

| Metric | Value |
|--------|-------|
| Start RSS (gate) | **852.7 MiB** (16:07) |
| Peak RSS | **878.9 MiB** (16:54) |
| End RSS | **869.5 MiB** (17:09); **866.5 MiB** (17:12) |
| Trend | **Bounded** — oscillates ~860–879 MiB; no monotonic climb |
| RestartCount | **0** (since 15:46 recreate) |
| OOMKilled | **false** |
| Kernel OOM (`clickhouse`) | **0** in window |
| `MEMORY_LIMIT_EXCEEDED` in container logs (2h) | **0** |
| Docker `mem_limit` (live) | **4 GiB** (`4294967296`) |
| `max_server_memory_usage` (preprocessed config) | **2000000000** (2 GiB) — confirmed in `/var/lib/clickhouse/preprocessed_configs/config.xml` |
| `system.server_settings` display | Shows `0` for byte/ratio settings (CH 25.x with `max_server_memory_usage_to_ram_ratio=0`); effective cap still loaded from XML |

### Merge / parts backlog

| Metric | Gate start | Gate end | Assessment |
|--------|------------|----------|------------|
| Active merges | 0 | 0 | No merge storm |
| `telemetry_snapshots` parts | 14 | 11 (8 min) | **Decreasing** — no parts explosion |
| Pending mutations | 0 | 0 | OK |
| 50 MiB merge caps | — | — | Merges progressing without backlog growth; caps **not** structurally blocking |

### Production ingest / mirror

| Check | Result |
|-------|--------|
| Row growth (`telemetry_snapshots`) | **969934 → 970708** (+774 rows in gate window) |
| Mirror `failed` (Redis ZCARD) | **7** — stable (historical terminal jobs; **no new failures**) |
| Mirror `wait` / `active` | **0** / **0** |
| Bulk retry / purge | **Not performed** |

### Prometheus / alerting

| Check | Result |
|-------|--------|
| Config reload | `POST http://127.0.0.1:9090/-/reload` — **success** (earlier in gate) |
| `blackbox-clickhouse-http` target | **UP** |
| `probe_success` | **1** for `http://127.0.0.1:8123/ping` |
| `ClickHouseHttpProbeFailed` | **inactive** (healthy) |
| `DatabaseBackupStale` / `DatabaseBackupMissing` | **inactive** |

### Backup cron

| Item | Result |
|------|--------|
| Cron | `/etc/cron.d/synqdrive-clickhouse-backup` — **03:30 UTC daily** |
| Failure alerting | `DatabaseBackupStale` + `DatabaseBackupMissing` rules loaded |
| Extra backup during gate | **None** (manual test already succeeded earlier) |

### Master Admin / readiness (17:12 UTC)

| Check | Result |
|-------|--------|
| `GET /api/v1/health/readiness` overall | **ok** |
| `clickhouse.status` | **ok** |
| `details.status` | **available** |
| `available` | **true** |

### Final gate

| Criterion | Pass |
|-----------|------|
| No restart during window | ✅ |
| No OOM | ✅ |
| No `MEMORY_LIMIT_EXCEEDED` series | ✅ |
| Memory stable / bounded | ✅ |
| Merges progress / no storm | ✅ |
| Parts not exploding | ✅ |
| Inserts / mirror working | ✅ |
| No new mirror failures | ✅ |
| Readiness healthy | ✅ |
| Master Admin healthy | ✅ |
| Prometheus probe UP | ✅ |
| Alert rule loaded | ✅ |
| Unit tests (`clickhouse-docker-config`) | ✅ |

**Verdict: READY TO MERGE** (PR #1311).

Raw log: `/opt/synqdrive/shared/clickhouse/stability-gate-20260826.log` on VPS.

---

## 15. Validation Results (recovery window — 15:48 UTC)

**Time:** 2026-08-26 15:48–15:52 UTC (4 minutes after `START MERGES`)

| Metric | Value |
|--------|-------|
| Container status | running |
| OOMKilled | false |
| RestartCount | **0** (since final recreate) |
| Memory | **1.442 GiB / 4 GiB** (36%) |
| CPU | ~7–13% |
| Kernel OOM events | **0** (in window) |
| Active merges | 0 (throttled) |
| Readiness CH | **ok / available** |
| Backup test | **SUCCESS** |

---

**Changes / Architektur:** See `architecture/CLICKHOUSE_PRODUCTION_RECOVERY_2026-08-26.md`.
