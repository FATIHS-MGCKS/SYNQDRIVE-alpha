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
| Blackbox HTTP probe + alert | **In repo** (Prometheus reload on next ops refresh) |
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
| Prometheus VPS config not reloaded yet | Low | Run `vps-refresh-monitoring.sh` or equivalent |

---

## 14. Validation Results (final window)

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
