# Master Admin Remediation — Phase 2D.5: ClickHouse Performance

**Date:** 2026-07-26  
**Status:** Performance analysis + optimization recommendations only  
**Prerequisites:** [2D.1](./clickhouse-runtime-analysis.md) · [2D.3](./clickhouse-data-integrity.md) · [2D.4](./clickhouse-tenant-isolation.md)  
**Constraint:** **No optimizations executed** — suggestions only

---

## Executive summary

| Area | Assessment | Top risk |
|------|------------|----------|
| **CPU / RAM** | Unbounded in compose | CH can contend with PG/Redis/PM2 on small VPS |
| **Inserts** | Single-row snapshot writes | **Part explosion** → merge backlog |
| **Queries** | Mostly `vehicle_id` + time scoped | Data Analyse window scans are heaviest |
| **Merges** | Background, TTL-driven | Many small parts without `async_insert` |
| **Compression** | Default LZ4 | Acceptable; no custom codecs |
| **Indexes** | ORDER BY = sparse primary index | No skip indexes; `FINAL` on ReplacingMergeTree |
| **Partitions** | Monthly by event time | Generally good; watch parts/partition > 50 |
| **Storage policy** | Single local disk | No tiering — disk = retention bound |

**Verdict:** Current schema is **reasonable for a small self-hosted VPS analytics mirror**. Primary bottlenecks are **insert granularity** (30s single-row polls), **merge pressure**, and **analytical window queries** (Data Analyse UI). Live metrics require VPS audit script output.

---

## 1. Runtime resource model

### 1.1 Container resources (repo baseline)

| Resource | `docker-compose.yml` | Risk |
|----------|----------------------|------|
| CPU limit | **None** | CH may consume full host CPU during merges |
| Memory limit | **None** | OOM risk on small VPS under heavy query + merge |
| `nofile` ulimit | 262144 | OK for connection/part handles |
| Disk | Named volume `clickhouse_data` | Shared root filesystem with backups |

### 1.2 VPS inspection (live — pending)

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-performance-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-performance-$(date -u +%Y%m%dT%H%M%SZ).log
```

Script: `backend/scripts/ops/vps-clickhouse-performance-audit.sh`

### 1.3 Key system metrics to capture

| Metric | Source | Healthy indicator |
|--------|--------|-------------------|
| CPU normalized | `system.asynchronous_metrics` | Sustained < 70% during normal ops |
| RAM available | `OSMemoryAvailable` | Headroom > 20% on VPS |
| MergeTree bytes/rows | async metrics | Stable growth within TTL |
| `MaxPartCountForPartition` | async metrics | < 100 per partition |
| Active merges | `system.merges` | Short `elapsed`, not permanently > 0 |

---

## 2. Table size & compression

### 2.1 Expected volume hierarchy (repo design)

| Table | Relative volume | TTL | Compression sensitivity |
|-------|-----------------|-----|-------------------------|
| `telemetry_snapshots` | **Highest** (continuous ~30s poll) | 180d | Float columns — moderate ratio |
| `telemetry_hf_points` | **High** when HF mirror on | 90d | Many small rows per trip |
| `telemetry_state_changes` | Low–medium | 365d | Sparse events |
| `telemetry_waypoints` | Medium when mirror on | 365d | lat/lng doubles |
| HF windows/events | Low–medium | 180–365d | JSON `evidence_json` / `stats_json` |
| Activity windows | Low | 365d | Small aggregates |

Historical prod note (architecture): ~410k total rows — **live size TBD**.

### 2.2 Compression analysis

- All tables use default MergeTree compression (typically **LZ4**).
- No `CODEC(ZSTD(...))` or column-specific codecs in migrations.
- **Suggestion P2:** After VPS audit, if `compression_ratio < 0.15` on `telemetry_snapshots`, evaluate ZSTD on low-cardinality columns only (requires table rewrite — phase 2D.6+).

```sql
SELECT table,
       round(sum(data_compressed_bytes)/sum(data_uncompressed_bytes), 3) AS ratio
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table ORDER BY sum(bytes_on_disk) DESC;
```

---

## 3. Partitioning

### 3.1 Current strategy

All productive tables: **`PARTITION BY toYYYYMM(<event_time>)`**

| Pros | Cons |
|------|------|
| Monthly drop via TTL aligns with partitions | Hot partition gets all current writes |
| Time-range queries prune old months | No org-based partition (multi-tenant pruning N/A) |
| Manageable part count per month | Fleet growth → larger active partition |

### 3.2 Poor partitioning indicators

| Signal | Query | Threshold |
|--------|-------|-----------|
| Too many parts per partition | `system.parts` GROUP BY table, partition | **> 50** parts (warn), **> 100** (P1) |
| Tiny parts | avg `rows` per part low | Many parts with < 1000 rows |
| Wide scans | `read_rows` >> returned rows in `query_log` | See §5 |

**Assessment:** Monthly partitioning is **appropriate** for SynqDrive time-series mirrors. Poor partitioning is more likely from **insert pattern** than wrong partition key.

---

## 4. Index usage (ORDER BY / primary key)

### 4.1 Schema index map

| Table | ORDER BY (sparse index) | Query pattern match |
|-------|-------------------------|---------------------|
| `telemetry_snapshots` | `(vehicle_id, recorded_at)` | ✅ Vehicle + time windows |
| `telemetry_state_changes` | `(vehicle_id, signal_name, changed_at)` | ✅ Segment detectors |
| `telemetry_waypoints` | `(vehicle_id, recorded_at)` | ✅ Route replay |
| `telemetry_hf_points` | `(org_id, vehicle_id, signal_name, recorded_at)` | ✅ HF reads (org not in WHERE yet) |
| ReplacingMergeTree tables | vehicle/org + time keys | ✅ Trip-scoped reads |

- `index_granularity = 8192` (default) on all tables.
- **No** bloom filter / minmax skip indexes defined.

### 4.2 Index inefficiency risks

| ID | Query | Issue | Suggestion |
|----|-------|-------|------------|
| **I1** | `summarizeRecentIngestion` | No `vehicle_id` — scans all tenants (15 min window) | Accept for health; keep window narrow |
| **I2** | Data Analyse `querySignalColumnAggregates` | 7-day scan, many `countIf` per column | Cap window; cache per vehicle |
| **I3** | `leadInFrame` window queries | Full sort within filtered set | Already limited to 24h + `vehicle_id` |
| **I4** | `FINAL` on HF events/windows | Forces merge semantics at read time | Prefer dedup in app or `OPTIMIZE` schedule |
| **I5** | Missing `org_id` in legacy WHERE | Extra granules if multi-tenant rows coexist | Migration 007 + query hardening (2D.4) |

---

## 5. Query performance inventory

### 5.1 Application query catalog

| Query / service | Table(s) | Scope | Timeout | Perf notes |
|-----------------|----------|-------|---------|------------|
| `findIgnitionSegments` | `telemetry_state_changes` | vehicle + time | default | Window fn `leadInFrame` — OK for repair windows |
| `findMotionSegments` | same | same | default | Same |
| `fetchSnapshotsInWindow` | `telemetry_snapshots` | vehicle + time | 15s | Linear read — OK |
| `summarizeActivityWindow` | `telemetry_snapshots` | vehicle + time | default | Aggregation — OK |
| `summarizeRecentIngestion` | snapshots + state_changes | **fleet-wide** 15m | default | Small window — low risk |
| `getStorageStats` | `system.parts` | metadata | 5s | Cheap |
| Data Analyse `querySignalColumnAggregates` | `telemetry_snapshots` | vehicle + **7d** | none explicit | **Heavy** — multi-column scan |
| Data Analyse `querySnapshotIntervals` | `telemetry_snapshots` | vehicle + 24h | none | **Two** window passes |
| `getHfAvailability` / frequency | `telemetry_hf_points` | vehicle + range | 10s | GROUP BY — OK with key |
| `getRecentHfEvents` | `telemetry_hf_events` | vehicle + range | 10s | **`FINAL`** + ORDER BY |
| `getTripHfWindows` | `telemetry_hf_windows` | vehicle + trip | 10s | **`FINAL`** |

### 5.2 Observability (existing)

| Signal | Location |
|--------|----------|
| `synqdrive_clickhouse_query_duration_seconds{query_type}` | Prometheus histogram |
| `synqdrive_clickhouse_analytics_queries_total{query,result}` | Counter |
| Circuit breaker | 5s default analysis timeout, 3 failures / 30s cooldown |
| `system.query_log` | Slow queries > 1s (when enabled) |

**Gap:** No Prometheus alert on query latency P95 — suggestion only.

### 5.3 Unnecessary scan patterns

| Pattern | Location | Recommendation |
|---------|----------|----------------|
| Double window scan (avg + LIMIT 500 intervals) | `querySnapshotIntervals` | Combine into single subquery |
| 7-day multi-column `countIf` in one SELECT | `querySignalColumnAggregates` | Pre-aggregate or reduce to 24h for UI |
| `FINAL` on every HF event read | `getRecentHfEvents` | Schedule `OPTIMIZE` + read without FINAL where safe |
| Repair detectors on wide time windows | Trip reconciliation | Enforce max lookback (e.g. 7d) at caller |

---

## 6. Insert performance

### 6.1 Write paths

| Path | Pattern | Frequency | Part impact |
|------|---------|-----------|-------------|
| `insertSnapshot` | **1 row** JSONEachRow | ~every 30s / vehicle | **High** — many small parts |
| `detectAndInsertStateChanges` | 0–2 rows | per snapshot | Low |
| HF `insertHfPoints` | **batch** post-trip | per trip | Medium |
| Waypoints / activity windows | batch | per trip | Low–medium |

### 6.2 Insert bottlenecks

| ID | Bottleneck | Severity | Suggestion |
|----|------------|----------|------------|
| **IN1** | Single-row snapshot inserts | **P1** | Enable `async_insert=1` + `wait_for_async_insert=1` on CH user profile |
| **IN2** | No batching across vehicles | P2 | Acceptable — async_insert addresses this |
| **IN3** | `markUnavailable` on any write error | P2 | Can disable mirror temporarily — ops not perf |
| **IN4** | HF burst after trip enrichment | P2 | Monitor merge queue post-trip spikes |

### 6.3 Suggested server settings (not applied)

```xml
<!-- users.d profile — illustration only -->
<async_insert>1</async_insert>
<wait_for_async_insert>1</wait_for_async_insert>
<async_insert_max_data_size>1048576</async_insert_max_data_size>
```

Or client-side: buffer snapshots in Redis/BullMQ and flush every N seconds (larger change — 2D.6+).

---

## 7. Merge & background task performance

### 7.1 Merge drivers

| Driver | Tables affected |
|--------|-----------------|
| Background merge | All MergeTree |
| TTL deletes | All tables with TTL |
| ReplacingMergeTree dedup | HF windows/events, activity windows |
| Mutations | Schema migrations, TTL changes |

### 7.2 Merge health indicators

```sql
SELECT * FROM system.merges;
SELECT table, partition, count() AS parts
FROM system.parts WHERE database='synqdrive' AND active
GROUP BY table, partition HAVING parts > 50;
```

| State | Meaning | Action (future) |
|-------|---------|-----------------|
| Permanent active merges | Disk/CPU bound | Add resources or reduce insert rate |
| parts > 100 / partition | Insert too granular | async_insert / OPTIMIZE PARTITION |
| TTL mutations pending | Normal after migration 002 | Wait; monitor `system.mutations` |

### 7.3 Scheduled maintenance (suggestion)

Weekly low-traffic window (after backup validation):

```sql
OPTIMIZE TABLE synqdrive.telemetry_hf_events FINAL;
OPTIMIZE TABLE synqdrive.telemetry_hf_windows FINAL;
OPTIMIZE TABLE synqdrive.trip_activity_windows FINAL;
-- telemetry_snapshots: OPTIMIZE only if parts/partition > threshold
```

---

## 8. Storage policy

| Aspect | Current | Performance impact |
|--------|---------|---------------------|
| Data disk | Default `/var/lib/clickhouse` | Single-tier — all hot |
| Backup disk | `/backups` local only | Separate path — no IO contention with merges if on same disk ⚠️ |
| Tiered / S3 | None | N/A |
| TTL | Per-table 90–365d | Primary disk control mechanism |

**Suggestion:** Ensure backup I/O runs off-peak; same root disk on small VPS can slow merges during `BACKUP DATABASE`.

---

## 9. Bottleneck register (prioritized)

| ID | Bottleneck | Likelihood | Impact | Optimization (suggestion only) |
|----|------------|------------|--------|--------------------------------|
| **B1** | Single-row snapshot inserts → part explosion | **High** | **High** | `async_insert` or micro-batching |
| **B2** | No Docker CPU/RAM limits | Medium | High | `deploy.resources` caps (e.g. 2 CPU / 4G) |
| **B3** | Data Analyse 7d multi-column scan | Medium | Medium | Reduce window; cache; materialized agg (future) |
| **B4** | `FINAL` on HF reads | Medium | Medium | Periodic OPTIMIZE + drop FINAL |
| **B5** | Double window query in `querySnapshotIntervals` | Low | Medium | Refactor to single pass |
| **B6** | Wide repair segment scans | Low | Medium | Cap lookback window in detectors |
| **B7** | Same-disk backup + merges | Medium | Medium | Off-peak backups; monitor `iowait` |
| **B8** | Fleet-wide ingestion probe | Low | Low | Keep 15m window (already narrow) |
| **B9** | No query latency alerts | Medium | Low | Prometheus P95 on `query_duration_seconds` |
| **B10** | ReplacingMergeTree dup accumulation | Medium | Low | Scheduled OPTIMIZE |

---

## 10. Optimization roadmap (suggestions — not executed)

### 10.1 Quick wins (low risk, post-audit)

1. Run `vps-clickhouse-performance-audit.sh` — establish baseline
2. Enable `async_insert` for mirror user profile
3. Add Docker memory limit (e.g. 4GiB) + CPU quota
4. Schedule weekly `OPTIMIZE` on ReplacingMergeTree tables
5. Add Prometheus alert: `histogram_quantile(0.95, synqdrive_clickhouse_query_duration_seconds) > 10`

### 10.2 Medium term (2D.6+ code changes)

1. Refactor `querySnapshotIntervals` to single subquery
2. Reduce Data Analyse CH window from 7d → 24h for column aggregates (or make configurable)
3. Remove `FINAL` where post-OPTIMIZE invariant holds
4. Pass `org_id` in queries (2D.4) — minor granule reduction on HF tables
5. Cap trip-repair segment lookback to 7 days

### 10.3 Long term (architectural)

1. **Buffer table** or `Buffer` engine for `telemetry_snapshots` (flush every 60s)
2. **Projection** or pre-aggregated daily rollups for Data Analyse cadence stats
3. Tenant-leading sort keys (migration 008) for org-fleet queries
4. Separate CH host or managed ClickHouse when fleet exceeds VPS capacity
5. ZSTD codecs on JSON columns (`evidence_json`, `stats_json`)

---

## 11. Monitoring checklist

| Check | Tool | Frequency |
|-------|------|-----------|
| CPU/RAM/disk | performance audit script | Weekly |
| Parts per partition | integrity + performance audit | Weekly |
| Slow queries | `system.query_log` | Weekly |
| Mirror write rate | `synqdrive_clickhouse_mirror_writes_total` | Continuous |
| Query latency P95 | `synqdrive_clickhouse_query_duration_seconds` | Continuous |
| Merge backlog | `system.merges` | On alert |

---

## 12. Phase 2D.5 conclusion

| Question | Answer |
|----------|--------|
| Performance dimensions analyzed? | **Yes** — CPU/RAM, merges, inserts, queries, compression, indexes, partitions, storage |
| Bottlenecks identified? | **Yes** — B1–B10 register |
| Live VPS metrics captured? | **No** — run performance audit script |
| Optimizations applied? | **No** — suggestions only |

**Next:** Run VPS performance audit, attach baseline to this doc §13, then prioritize B1–B3 in 2D.6 implementation phase.

---

## 13. Live performance baseline (placeholder)

```text
# bash .../vps-clickhouse-performance-audit.sh | tee ...

Audit timestamp (UTC): ____________________
Host CPU/RAM (docker stats): ____________________
Largest table on disk: ____________________
Max parts per partition: ____________________
Active merges: ____________________
Slowest query (7d): ____________________
```

---

## 14. Related files

| File | Role |
|------|------|
| `backend/scripts/ops/vps-clickhouse-performance-audit.sh` | VPS performance snapshot |
| `backend/src/modules/clickhouse/clickhouse-analytics.service.ts` | Core analytics queries |
| `backend/src/modules/data-analyse/data-analyse.service.ts` | Heaviest UI-driven CH scans |
| `docs/remediation/clickhouse-data-integrity.md` | Part/TTL health (2D.3) |
