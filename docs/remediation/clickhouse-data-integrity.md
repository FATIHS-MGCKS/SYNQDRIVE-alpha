# Master Admin Remediation — Phase 2D.3: ClickHouse Data Integrity

**Date:** 2026-07-26  
**Status:** Integrity framework + per-table baseline documented; **live production metrics pending VPS audit**  
**Prerequisites:** [2D.1 Runtime](./clickhouse-runtime-analysis.md) · [2D.2 Storage Topology](./clickhouse-storage-topology.md)  
**Constraint:** Read-only analysis — **no `ALTER`, `OPTIMIZE`, `ATTACH`, or data mutations in this phase**

---

## Executive summary

| Layer | Status |
|-------|--------|
| **Productive table inventory** | ✅ 8 analytics tables + `schema_migrations` (internal) |
| **Integrity check methodology** | ✅ Documented + automated audit script |
| **Live production integrity** | ❌ **Not verified** — requires VPS `vps-clickhouse-data-integrity-audit.sh` |
| **PostgreSQL canonical truth** | Unaffected — CH issues degrade analytics only |

**Scope:** Database `synqdrive` only. `system.*` tables are monitored for operational health but are not business data stores.

**Operator action:** Run the audit script on production and paste output into [§11](#11-live-audit-results-placeholder).

---

## 1. Integrity dimensions

| Dimension | What it means | Primary signals |
|-----------|---------------|-----------------|
| **Damaged parts** | Corrupt or unreadable data files | `CHECK TABLE`, `system.parts` with `active=0` / negative `level` |
| **Missing parts** | Metadata references parts not on disk | `CHECK TABLE` errors, query exceptions |
| **Duplicates** | Multiple rows for same sort key | Expected on `ReplacingMergeTree` until merge; use `FINAL` for reads |
| **Faulty partitions** | Too many parts, empty partitions with bytes, detached parts | `system.parts`, `system.detached_parts` |
| **MergeTree structure drift** | Engine / `ORDER BY` / `PARTITION BY` ≠ migrations | `system.tables.engine_full` |
| **TTL problems** | Rows surviving beyond retention + grace | Per-table age queries; pending `system.mutations` |
| **Orphaned data** | Detached parts, unexpected tables, stale rows | `system.detached_parts`, extra tables in `synqdrive` |

---

## 2. Audit tooling

### 2.1 Automated script (read-only)

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-data-integrity-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-integrity-$(date -u +%Y%m%dT%H%M%SZ).log

# Markdown table output:
bash .../vps-clickhouse-data-integrity-audit.sh --markdown \
  >> /opt/synqdrive/shared/reports/clickhouse-integrity-$(date -u +%Y%m%dT%H%M%SZ).md
```

Script: `backend/scripts/ops/vps-clickhouse-data-integrity-audit.sh`

**Exit codes:** `0` = no P0 failures · `1` = integrity failure · `2` = connectivity/prerequisite error

### 2.2 Manual deep checks (optional)

```sql
-- Per-table part health
SELECT table, count() AS active_parts, sum(rows) AS rows,
       formatReadableSize(sum(bytes_on_disk)) AS on_disk
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table ORDER BY sum(bytes_on_disk) DESC;

-- CHECK all productive tables
CHECK TABLE synqdrive.telemetry_snapshots;
CHECK TABLE synqdrive.telemetry_state_changes;
-- ... repeat for each table in §3

-- Active merges
SELECT * FROM system.merges WHERE database = 'synqdrive';

-- Replication (expect empty)
SELECT * FROM system.replicas WHERE database = 'synqdrive';
```

---

## 3. Per-table integrity register

> **Live columns** (`Rows`, `Size`, `Integrity status`): fill from VPS audit output.  
> **Repo baseline** below is the expected production schema as of migrations 001–006.

### 3.1 `telemetry_snapshots`

| Attribute | Value |
|-----------|-------|
| **Purpose** | DIMO snapshot mirror (~30s poll) |
| **Producer** | `ClickHouseTelemetryService.insertSnapshot` |
| **Engine** | `MergeTree` |
| **Partition** | `toYYYYMM(recorded_at)` |
| **ORDER BY** | `(vehicle_id, recorded_at)` |
| **TTL** | `recorded_at + 180 DAY` (migration 002) |
| **Expected empty** | No — core mirror table |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | > 0 in prod | _pending audit_ |
| **Size** | Largest table typically | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| High ingest volume → part fragmentation | P2 | Many small parts per month; monitor `parts > 50` per partition |
| TTL lag | P2 | Rows up to ~7 days past 180d acceptable until merge |
| Missing snapshots | P3 | Best-effort mirror — PG `vehicle_latest_states` is canonical |
| Duplicate rows | Low | MergeTree append-only; duplicates possible on retry inserts (rare) |

---

### 3.2 `telemetry_state_changes`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Ignition/motion transition events |
| **Producer** | `ClickHouseTelemetryService.detectAndInsertStateChanges` |
| **Engine** | `MergeTree` |
| **Partition** | `toYYYYMM(changed_at)` |
| **ORDER BY** | `(vehicle_id, signal_name, changed_at)` |
| **TTL** | `changed_at + 365 DAY` |
| **Expected empty** | No |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | > 0 | _pending audit_ |
| **Size** | Medium | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Trip-assist dependency | P1 | `CLICKHOUSE_TRIP_ASSIST_ENABLED` reads this table |
| Transition gaps | P2 | First snapshot per vehicle has no prior state — not corruption |
| TTL 365d | P2 | Longer retention than snapshots by design |

---

### 3.3 `telemetry_waypoints`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Post-trip route waypoint mirror (downsampled) |
| **Producer** | `ClickHouseWaypointsService` (`WAYPOINT_MIRROR_ENABLED`) |
| **Engine** | `MergeTree` |
| **Partition** | `toYYYYMM(recorded_at)` |
| **ORDER BY** | `(vehicle_id, recorded_at)` — provenance cols not in sort key |
| **TTL** | `recorded_at + 365 DAY` |
| **Columns (006)** | `org_id`, `token_id`, `source`, `provider`, `booking_id`, `quality` |
| **Expected empty** | Yes if mirror disabled |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | 0+ depending on mirror flag | _pending audit_ |
| **Size** | Low–medium when enabled | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Empty `org_id` on legacy rows | P3 | Migration 004 default `''` — not integrity failure |
| Sort key without `org_id` | P3 | Tenant filter scans more data — schema debt, not corruption |
| Empty table with mirror on | P2 | Config/producer issue, not CH corruption |

---

### 3.4 `trip_activity_windows`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Post-trip activity window summaries |
| **Producer** | `ClickHouseActivityWindowsService` (`ACTIVITY_WINDOW_MIRROR_ENABLED`) |
| **Engine** | `ReplacingMergeTree(computed_at)` |
| **Partition** | `toYYYYMM(window_start)` |
| **ORDER BY** | `(vehicle_id, window_start, window_end)` |
| **TTL** | `window_start + 365 DAY` |
| **Expected empty** | Yes if mirror disabled |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | 0+ | _pending audit_ |
| **Size** | Low | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Unmerged duplicates | P3 | **Expected** until background merge; use `FINAL` for deduped reads |
| Re-insert same window | Low | `ReplacingMergeTree` keeps row with max `computed_at` |
| Legacy rows missing `org_id`/`trip_id` | P3 | Migration 006 defaults |

---

### 3.5 `trip_segment_candidates`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Cached ignition repair candidates |
| **Producer** | **None wired** (`planned_no_producer`) |
| **Engine** | `ReplacingMergeTree(computed_at)` |
| **Partition** | `toYYYYMM(segment_start)` |
| **ORDER BY** | `(vehicle_id, segment_start)` |
| **TTL** | `segment_start + 180 DAY` |
| **Expected empty** | **Yes — by design** |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | **0** | _pending audit_ |
| **Size** | ~0 | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Non-zero rows without producer | P3 | Investigate manual inserts or removed producer |
| Empty table | None | Normal expected state |

---

### 3.6 `telemetry_hf_points`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Normalized HF signal points |
| **Producer** | `ClickHouseHfService.insertHfPoints` (`HF_MIRROR_ENABLED`) |
| **Engine** | `MergeTree` |
| **Partition** | `toYYYYMM(recorded_at)` |
| **ORDER BY** | `(org_id, vehicle_id, signal_name, recorded_at)` |
| **TTL** | `recorded_at + 90 DAY` |
| **Expected empty** | Yes if HF mirror off |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | 0+ when HF enabled | _pending audit_ |
| **Size** | High when active — shortest TTL | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Volume growth | P1 | 90d TTL is primary guard; disk pressure if TTL stuck |
| `ingested_at` vs `recorded_at` | P3 | TTL on `recorded_at` only — correct by design |
| Invalid `quality='invalid'` rows | P3 | Application-level, not CH corruption |

---

### 3.7 `telemetry_hf_windows`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Aggregated HF 30s windows |
| **Producer** | `ClickHouseHfService.insertHfWindows` |
| **Engine** | `ReplacingMergeTree(computed_at)` |
| **Partition** | `toYYYYMM(window_start)` |
| **ORDER BY** | `(org_id, vehicle_id, window_start, signal_group)` |
| **TTL** | `window_start + 180 DAY` |
| **Columns (005)** | `trip_id`, `booking_id`, `coverage`, `stats_json` |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | 0+ | _pending audit_ |
| **Size** | Medium when HF on | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Unmerged window duplicates | P3 | Normal for ReplacingMergeTree |
| Empty `stats_json` / `coverage=unknown` | P3 | Backfill quality, not structural damage |

---

### 3.8 `telemetry_hf_events`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Derived HF abuse/events mirror |
| **Producer** | `ClickHouseHfService.insertHfEvents` |
| **Engine** | `ReplacingMergeTree(computed_at)` |
| **Partition** | `toYYYYMM(event_start)` |
| **ORDER BY** | `(org_id, vehicle_id, event_type, event_start)` |
| **TTL** | `event_start + 365 DAY` |

| Metric | Repo expected | Live (VPS) |
|--------|---------------|------------|
| **Rows** | 0+ | _pending audit_ |
| **Size** | Low–medium | _pending audit_ |
| **Integrity status** | `CHECK TABLE` OK | _pending audit_ |

**Risks**

| Risk | Severity | Notes |
|------|----------|-------|
| Re-insert same event | Low | ReplacingMergeTree idempotent |
| Large `evidence_json` | P2 | Row bloat — monitor compressed size |

---

### 3.9 `schema_migrations` (internal — not business data)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Track applied CH migrations |
| **Producer** | `ClickHouseSchemaService` |
| **Engine** | Application-defined (typically MergeTree family) |
| **Expected versions** | `001` … `006` |

| Metric | Live (VPS) |
|--------|------------|
| **Rows** | _pending audit_ (expect 6) |
| **Integrity status** | _pending audit_ |

**Risks:** Missing migration rows → schema bootstrap may re-apply idempotent DDL (safe). Wrong count → investigate deploy logs.

---

## 4. Consolidated table matrix (fill after audit)

| Table | Engine | TTL (days) | Rows | On disk | CHECK TABLE | Risks (top) |
|-------|--------|------------|------|---------|-------------|-------------|
| `telemetry_snapshots` | MergeTree | 180 | _TBD_ | _TBD_ | _TBD_ | Volume / fragmentation |
| `telemetry_state_changes` | MergeTree | 365 | _TBD_ | _TBD_ | _TBD_ | Trip-assist dependency |
| `telemetry_waypoints` | MergeTree | 365 | _TBD_ | _TBD_ | _TBD_ | Mirror off → empty OK |
| `trip_activity_windows` | ReplacingMergeTree | 365 | _TBD_ | _TBD_ | _TBD_ | Unmerged dupes normal |
| `trip_segment_candidates` | ReplacingMergeTree | 180 | _TBD_ | _TBD_ | _TBD_ | Should be empty |
| `telemetry_hf_points` | MergeTree | 90 | _TBD_ | _TBD_ | _TBD_ | Highest volume HF |
| `telemetry_hf_windows` | ReplacingMergeTree | 180 | _TBD_ | _TBD_ | _TBD_ | Unmerged dupes normal |
| `telemetry_hf_events` | ReplacingMergeTree | 365 | _TBD_ | _TBD_ | _TBD_ | JSON row size |

---

## 5. Integrity check reference

### 5.1 Damaged / missing parts

```sql
SELECT database, table, partition, name, active, level, bytes_on_disk
FROM system.parts
WHERE database = 'synqdrive' AND (NOT active OR level < 0);

CHECK TABLE synqdrive.<table>;
```

**Pass:** `active=1` for all parts; `CHECK TABLE` succeeds.

### 5.2 Detached / orphaned parts

```sql
SELECT * FROM system.detached_parts WHERE database = 'synqdrive';
```

**Pass:** zero rows, or documented manual recovery plan per part.

**Do not** `DROP DETACHED` or `ATTACH` without backup (Gate G1 from 2D.2).

### 5.3 Duplicates (ReplacingMergeTree)

```sql
SELECT
  (SELECT count() FROM synqdrive.trip_activity_windows) AS raw,
  (SELECT count() FROM synqdrive.trip_activity_windows FINAL) AS deduped;
```

**Pass:** `raw >= deduped`; large gap → schedule `OPTIMIZE TABLE ... FINAL` in maintenance window (2D.4+).

### 5.4 Partition health

```sql
SELECT table, partition, count() AS parts,
       sum(rows) AS rows, formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database = 'synqdrive' AND active
GROUP BY table, partition
HAVING parts > 50 OR (rows = 0 AND sum(bytes_on_disk) > 0)
ORDER BY parts DESC;
```

### 5.5 Engine / TTL drift

Expected TTL clauses (from `engine_full`):

| Table | TTL expression |
|-------|----------------|
| `telemetry_snapshots` | `recorded_at + toIntervalDay(180)` |
| `telemetry_state_changes` | `changed_at + toIntervalDay(365)` |
| `telemetry_waypoints` | `recorded_at + toIntervalDay(365)` |
| `trip_activity_windows` | `window_start + toIntervalDay(365)` |
| `trip_segment_candidates` | `segment_start + toIntervalDay(180)` |
| `telemetry_hf_points` | `recorded_at + toIntervalDay(90)` |
| `telemetry_hf_windows` | `window_start + toIntervalDay(180)` |
| `telemetry_hf_events` | `event_start + toIntervalDay(365)` |

### 5.6 TTL enforcement lag

Rows older than TTL + **7 day grace** indicate stuck merges or disabled TTL:

```sql
-- Example: telemetry_snapshots (180 + 7 days)
SELECT count() FROM synqdrive.telemetry_snapshots
WHERE recorded_at < now() - INTERVAL 187 DAY;
```

**Pass:** count near 0 (small residue acceptable during heavy merge backlog).

### 5.7 Unexpected / orphan logical data

```sql
-- Tables not in registry
SELECT name FROM system.tables
WHERE database = 'synqdrive'
  AND name NOT IN (
    'telemetry_snapshots','telemetry_state_changes','telemetry_waypoints',
    'trip_activity_windows','trip_segment_candidates',
    'telemetry_hf_points','telemetry_hf_windows','telemetry_hf_events',
    'schema_migrations'
  );

-- Orphan vehicle_ids (sanity — requires PG cross-check, optional)
SELECT vehicle_id, count() AS c
FROM synqdrive.telemetry_snapshots
GROUP BY vehicle_id
ORDER BY c DESC LIMIT 5;
```

---

## 6. Severity classification

| Class | Definition | Example |
|-------|------------|---------|
| **P0 — Integrity failure** | `CHECK TABLE` fails, broken parts, cannot query table | Damaged part files |
| **P1 — Operational risk** | Data present but impacts analytics correctness/availability | HF table bloat, trip-assist table empty |
| **P2 — Performance / hygiene** | Fragmentation, TTL lag, high duplicate pressure | 100+ parts per partition |
| **P3 — Expected / informational** | By-design empty tables, ReplacingMergeTree dupes, legacy defaults | `trip_segment_candidates` empty |

---

## 7. Remediation actions (deferred — not executed in 2D.3)

| Condition | Action | Prerequisite |
|-----------|--------|--------------|
| `CHECK TABLE` failure | Stop writes; restore from backup | G1 backup validation |
| Detached parts | Manual `ATTACH` or remove after ident | Backup + ops approval |
| High fragmentation | `OPTIMIZE TABLE ... PARTITION ...` | Maintenance window |
| TTL lag > 30 days | Investigate `system.mutations`; trigger merge | Monitor disk |
| ReplacingMergeTree dupes | `OPTIMIZE TABLE ... FINAL` | Low-traffic window |
| Schema drift | Re-run `ClickHouseSchemaService` migrations | App deploy |

**No automatic repairs in 2D.3.**

---

## 8. Relationship to application health

| Surface | What it shows |
|---------|---------------|
| `GET /api/v1/health/readiness` | `checks.clickhouse` + storage stats from `system.parts` |
| `ClickHouseDiagnosticsService` | Per-table row counts / producer registry status |
| Prometheus | `synqdrive_clickhouse_table_rows{table,status}` |

Integrity failures may **not** surface in readiness until queries fail — run the dedicated audit script quarterly.

---

## 9. Phase dependencies

```
2D.1 Runtime baseline
  └─► 2D.2 Storage topology (mount stability)
        └─► 2D.3 Data integrity (this document)
              └─► 2D.4 Remediation execution (OPTIMIZE / ATTACH / restore)
```

Run integrity audit **after** storage topology is stable (correct bind mounts) to avoid false positives from container restarts mid-merge.

---

## 10. Phase 2D.3 conclusion

| Question | Answer |
|----------|--------|
| All productive tables documented? | **Yes** — 8 tables + schema_migrations |
| Integrity checks defined? | **Yes** — parts, TTL, duplicates, partitions, drift |
| Live integrity verified? | **No** — VPS audit required |
| Repairs executed? | **No** |

---

## 11. Live audit results (placeholder)

```text
# Paste output from:
# bash .../vps-clickhouse-data-integrity-audit.sh | tee ...

Audit timestamp (UTC): ____________________
Host: ____________________
ClickHouse version: ____________________
Audit exit code: ____________________

P0 failures: ____________________
Warnings: ____________________

Per-table rows/size: (from script output)
```

---

## 12. Related files

| File | Role |
|------|------|
| `backend/scripts/ops/vps-clickhouse-data-integrity-audit.sh` | Automated read-only audit |
| `backend/src/modules/clickhouse/clickhouse-table-registry.ts` | Producer / emptiness expectations |
| `backend/src/modules/clickhouse/migrations/*.sql` | Schema source of truth |
| `docs/remediation/clickhouse-runtime-analysis.md` | 2D.1 |
| `docs/remediation/clickhouse-storage-topology.md` | 2D.2 |
