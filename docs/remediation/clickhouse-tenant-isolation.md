# Master Admin Remediation — Phase 2D.4: ClickHouse Tenant Isolation

**Date:** 2026-07-26  
**Status:** Schema + query-path analysis; migration **designed** (not applied)  
**Prerequisites:** [2D.1](./clickhouse-runtime-analysis.md) · [2D.2](./clickhouse-storage-topology.md) · [2D.3](./clickhouse-data-integrity.md)  
**Constraint:** No destructive schema changes or query rewrites executed in this phase

---

## Executive summary

| Area | Verdict | Notes |
|------|---------|-------|
| **`tenant_id` column** | N/A | SynqDrive uses **`org_id`** (organization UUID) — no `tenant_id` in CH schema |
| **HF tables (003)** | Partial | `org_id` in schema + ORDER BY; queries filter **`vehicle_id` only** |
| **Legacy mirror tables (001)** | Gap | **No `org_id`** on `telemetry_snapshots`, `telemetry_state_changes` |
| **Extended tables (004–006)** | Partial | `org_id` column added; **not** in PARTITION BY or ORDER BY |
| **Application isolation** | Defense-in-depth | API paths use `OrgScopingGuard` + `assertVehicle`; CH has **no RLS** |
| **Cross-tenant query risk** | Medium (design debt) | Mitigated by globally unique `vehicle.id` (UUID) + PG pre-checks |
| **Materialized views** | None | No CH MVs in repo or migrations |
| **ClickHouse constraints** | None | No FK/CHECK — isolation is application-enforced |

**Recommendation:** Apply additive migration **007** (org_id on legacy tables) + backfill + add `org_id` to all read/write SQL in phase **2D.5**. Long-term: tenant-leading sort keys via **new tables** (controlled migration).

---

## 1. Terminology

| Term | SynqDrive meaning |
|------|-------------------|
| **Tenant** | `Organization` (`organizations.id`) |
| **`org_id`** | Organization UUID stored in CH (HF + some mirrors) |
| **`tenant_id`** | **Not used** in ClickHouse schema |
| **Canonical truth** | PostgreSQL — vehicles scoped by `organization_id` |

---

## 2. Schema inventory — tenant columns

### 2.1 Summary matrix

| Table | `org_id` in DDL | In PARTITION BY | In ORDER BY | Written on insert | Read queries filter `org_id` |
|-------|-----------------|-----------------|-------------|-------------------|------------------------------|
| `telemetry_snapshots` | **No** | `toYYYYMM(recorded_at)` | `(vehicle_id, recorded_at)` | No | No |
| `telemetry_state_changes` | **No** | `toYYYYMM(changed_at)` | `(vehicle_id, signal_name, changed_at)` | No | No |
| `telemetry_waypoints` | Yes (004, default `''`) | `toYYYYMM(recorded_at)` | `(vehicle_id, recorded_at)` | Yes | No |
| `trip_activity_windows` | Yes (006, default `''`) | `toYYYYMM(window_start)` | `(vehicle_id, window_start, window_end)` | Yes | No |
| `trip_segment_candidates` | **No** | `toYYYYMM(segment_start)` | `(vehicle_id, segment_start)` | N/A (no producer) | No |
| `telemetry_hf_points` | Yes (003) | `toYYYYMM(recorded_at)` | **`(org_id, vehicle_id, signal_name, recorded_at)`** | Yes | No |
| `telemetry_hf_windows` | Yes (003) | `toYYYYMM(window_start)` | **`(org_id, vehicle_id, window_start, signal_group)`** | Yes | No |
| `telemetry_hf_events` | Yes (003) | `toYYYYMM(event_start)` | **`(org_id, vehicle_id, event_type, event_start)`** | Yes | No |
| `schema_migrations` | N/A | — | — | Internal | N/A |

### 2.2 Indexes

ClickHouse uses **primary key = ORDER BY prefix** (sparse index). No secondary skip indexes defined in migrations.

| Table | Effective primary index | Tenant isolation in index |
|-------|-------------------------|---------------------------|
| Legacy snapshots / state_changes | `vehicle_id` first | **No** — org not in key |
| HF family | `org_id` first | **Yes** — partition pruning by org possible |
| Waypoints / activity_windows | `vehicle_id` first | **No** — org is attribute only |

### 2.3 Materialized views & aggregations

| Artifact | Count | Notes |
|----------|-------|-------|
| Materialized views | **0** | None in migrations or ops |
| Projections | **0** | — |
| AggregatingMergeTree | **0** | ReplacingMergeTree used for idempotent aggregates |
| Live aggregations | App-layer | `ClickHouseAnalyticsService.summarizeActivityWindow`, HF window aggregates in `HfMirrorService` |

---

## 3. Write path analysis (producers)

| Producer | Table | `org_id` persisted | Risk |
|----------|-------|-------------------|------|
| `ClickHouseTelemetryService.insertSnapshot` | `telemetry_snapshots` | **No** | Legacy rows have no tenant attribute |
| `ClickHouseTelemetryService.detectAndInsertStateChanges` | `telemetry_state_changes` | **No** | Same |
| `ClickHouseWaypointsService.insertWaypoints` | `telemetry_waypoints` | Yes (`p.orgId`) | OK if producer passes correct org |
| `ClickHouseActivityWindowsService.insertActivityWindows` | `trip_activity_windows` | Yes | OK |
| `ClickHouseHfService.insertHf*` | HF tables | Yes | OK |
| _(none)_ | `trip_segment_candidates` | — | Empty by design |

**Gap:** `DimoSnapshotProcessor` has `vehicle.organizationId` but does not pass it to `insertSnapshot` / `detectAndInsertStateChanges`.

---

## 4. Read path analysis (analytics queries)

### 4.1 Isolation model today

```
API / Worker request
    │
    ├─► PostgreSQL: org + vehicle ownership verified (most user-facing paths)
    │
    └─► ClickHouse: WHERE vehicle_id = {uuid}   ← no org_id predicate
```

`Vehicle.id` is **UUID** (`@default(uuid())`) — globally unique across tenants. Cross-tenant leakage via guessed `vehicle_id` is **unlikely** if all entry points validate PG ownership first.

### 4.2 Query inventory

| Service / method | Tables | Filters | Org pre-check | Cross-tenant risk |
|------------------|--------|---------|---------------|-------------------|
| `ClickHouseAnalyticsService.findIgnitionSegments` | `telemetry_state_changes` | `vehicle_id`, time | Worker (vehicle context) | Low |
| `ClickHouseAnalyticsService.findMotionSegments` | `telemetry_state_changes` | `vehicle_id`, time | Worker | Low |
| `ClickHouseAnalyticsService.fetchSnapshotsInWindow` | `telemetry_snapshots` | `vehicle_id`, time | Worker | Low |
| `ClickHouseAnalyticsService.summarizeActivityWindow` | `telemetry_snapshots` | `vehicle_id`, time | Worker | Low |
| `ClickHouseAnalyticsService.summarizeRecentIngestion` | snapshots + state_changes | **time only** | **None** (health) | **Ops — fleet-wide** |
| `ClickHouseAnalyticsService.getStorageStats` | `system.parts` | database | **None** (ops) | **Ops — all tenants** |
| `ClickHouseHfService.*` (all reads) | HF tables | `vehicle_id` (+ trip/time) | Partial via callers | Low–Medium |
| `ClickHouseWaypointsService.hasTripWaypoints` | `telemetry_waypoints` | `vehicle_id`, `trip_id` | Caller | Low |
| `TripEvidenceReadService` | snapshots + HF | `vehicle_id` | `SignalQualityReadService` PG trip check | Low |
| `SignalQualityReadService.getTripSignalQuality` | HF via above | `vehicle_id`, `trip_id` | **PG: trip ∈ org** | Low |
| `DataAnalyseService.*` CH methods | snapshots, waypoints, HF | `vehicle_id` | **`assertVehicle(orgId, vehicleId)`** | Low |
| `DeviceConnectionEpisodeReconciliationHistoricalLoader` | `telemetry_snapshots` | `vehicle_id`, time | Reconciliation job scope | Low |
| `ClickHouseDiagnosticsService` | metadata | registry | Org-scoped API route | Low |

### 4.3 Identified cross-tenant / missing-filter findings

| ID | Finding | Severity | Mitigation |
|----|---------|----------|------------|
| **T1** | Legacy tables lack `org_id` column | **P1** | Migration 007 + backfill + write path |
| **T2** | All CH reads use `vehicle_id` only, never `org_id` | **P2** | Add `org_id` predicate (defense in depth) |
| **T3** | `summarizeRecentIngestion` — fleet-wide counts | **P3** | Accept for health; restrict CH credentials |
| **T4** | `getStorageStats` — all tables, all tenants | **P3** | Ops/metrics only |
| **T5** | Waypoints / activity_windows: `org_id` not in ORDER BY | **P2** | Future table rewrite with `(org_id, vehicle_id, …)` |
| **T6** | Empty `org_id` default on legacy backfill rows | **P2** | Backfill script from PG `vehicles` |
| **T7** | No ClickHouse row policies / users per tenant | **P2** | Single shared CH user — rely on app + network |
| **T8** | Direct `clickhouse-client` on VPS bypasses app | **P1** | Localhost bind + ops access control |
| **T9** | HF query without PG pre-check if new caller added | **P1** | Lint/guard: require `orgId` in CH service API |

**No `tenant_id` references exist** — search confirmed zero matches in `backend/src/modules/clickhouse`.

---

## 5. Per-table tenant isolation register

### 5.1 `telemetry_snapshots`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | None |
| **Partition key** | `toYYYYMM(recorded_at)` — not tenant-scoped |
| **Primary key** | `(vehicle_id, recorded_at)` |
| **Isolation status** | **Partial** — relies on UUID `vehicle_id` + app layer |
| **Size / rows** | _pending VPS audit_ |
| **Risks** | No CH-level tenant boundary; largest table; no org attribution for audits |

### 5.2 `telemetry_state_changes`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | None |
| **Partition key** | `toYYYYMM(changed_at)` |
| **Primary key** | `(vehicle_id, signal_name, changed_at)` |
| **Isolation status** | **Partial** |
| **Risks** | Trip-assist detectors read this; same as snapshots |

### 5.3 `telemetry_waypoints`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | `org_id` (default `''` for pre-004 rows) |
| **Partition key** | `toYYYYMM(recorded_at)` |
| **Primary key** | `(vehicle_id, recorded_at)` — org not in key |
| **Isolation status** | **Partial** |
| **Risks** | Legacy empty `org_id`; scans not org-pruned |

### 5.4 `trip_activity_windows`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | `org_id` (006) |
| **Primary key** | `(vehicle_id, window_start, window_end)` |
| **Isolation status** | **Partial** |
| **Risks** | ReplacingMergeTree dupes are per sort key, not org-aware |

### 5.5 `trip_segment_candidates`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | None |
| **Isolation status** | **N/A** (empty, no producer) |
| **Risks** | Future writer must include `org_id` |

### 5.6 `telemetry_hf_points`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | `org_id` (required on insert) |
| **Partition key** | `toYYYYMM(recorded_at)` — monthly, not per-org |
| **Primary key** | **`(org_id, vehicle_id, signal_name, recorded_at)`** |
| **Isolation status** | **Good (schema)** / **Partial (queries)** |
| **Risks** | Reads omit `org_id` filter; wrong org in write would persist |

### 5.7 `telemetry_hf_windows`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | `org_id` |
| **Primary key** | **`(org_id, vehicle_id, window_start, signal_group)`** |
| **Isolation status** | **Good (schema)** / **Partial (queries)** |

### 5.8 `telemetry_hf_events`

| Attribute | Value |
|-----------|-------|
| **Tenant column** | `org_id` |
| **Primary key** | **`(org_id, vehicle_id, event_type, event_start)`** |
| **Isolation status** | **Good (schema)** / **Partial (queries)** |

---

## 6. Application guardrails (existing)

| Layer | Mechanism |
|-------|-----------|
| **API** | `OrgScopingGuard` on `/organizations/:orgId/...` routes |
| **Data Analyse** | `assertVehicle(orgId, vehicleId)` before CH queries |
| **Trip signal quality** | PG `vehicleTrip` where `vehicle.organizationId = orgId` |
| **Vehicle IDs** | UUID primary keys — no per-org namespace |
| **CH credentials** | Single service user; localhost-only on VPS |

**Missing:** Central `ClickHouseTenantGuard` requiring `orgId` on every query method.

---

## 7. Proposed migration (additive — not executed)

### 7.1 Migration `007_legacy_mirror_org_id_columns.sql`

File: `backend/src/modules/clickhouse/migrations/007_legacy_mirror_org_id_columns.sql`

```sql
-- Phase 2D.4 — additive org_id on legacy high-volume mirror tables.
-- Safe: ADD COLUMN IF NOT EXISTS only. No ORDER BY / PARTITION BY change.

ALTER TABLE synqdrive.telemetry_snapshots
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.telemetry_state_changes
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;

ALTER TABLE synqdrive.trip_segment_candidates
    ADD COLUMN IF NOT EXISTS org_id String DEFAULT '' AFTER vehicle_id;
```

**Applied by:** `ClickHouseSchemaService` on next backend bootstrap after deploy.

### 7.2 Backfill (separate ops script — phase 2D.5)

Non-destructive backfill pattern (pseudo):

1. Export `SELECT id, organization_id FROM vehicles` from PostgreSQL
2. For each org batch, `ALTER TABLE ... UPDATE org_id = {org} WHERE vehicle_id IN (...)`  
   _(ClickHouse lightweight updates or mutation — run in maintenance window)_
3. Verify: `SELECT count() FROM telemetry_snapshots WHERE org_id = ''` → 0

### 7.3 Application changes (phase 2D.5 — not in 2D.4)

| Change | Files |
|--------|-------|
| Pass `orgId` to `insertSnapshot` / `detectAndInsertStateChanges` | `clickhouse-telemetry.service.ts`, `dimo-snapshot.processor.ts` |
| Add `orgId` param + `AND org_id = {orgId}` to analytics queries | `clickhouse-analytics.service.ts` |
| Add `orgId` to HF read methods | `clickhouse-hf.service.ts` |
| Update detector call sites | `*-segment.detector.ts`, `activity-window.detector.ts` |

### 7.4 Future migration `008` — tenant-leading sort keys (destructive — design only)

Requires **new tables** + copy + atomic rename:

```
telemetry_snapshots_v2  ORDER BY (org_id, vehicle_id, recorded_at)
telemetry_state_changes_v2  ORDER BY (org_id, vehicle_id, signal_name, changed_at)
telemetry_waypoints_v2  ORDER BY (org_id, vehicle_id, recorded_at)
```

**Not executable** without backup validation (G1) + maintenance window. Documented in 2D.2 migration plan.

---

## 8. Audit procedure

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-tenant-isolation-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-tenant-audit-$(date -u +%Y%m%dT%H%M%SZ).log
```

Checks:

1. Tables with / without `org_id` column
2. Row counts with `org_id = ''` per table
3. `engine_full` ORDER BY includes `org_id` or not
4. No unexpected materialized views
5. Distinct `org_id` counts on HF tables

Script: `backend/scripts/ops/vps-clickhouse-tenant-isolation-audit.sh`

---

## 9. Risk register (future)

| Risk | Likelihood | Impact | Trigger |
|------|------------|--------|---------|
| New API calls CH without PG org check | Medium | High | New feature code |
| Ops runs raw SQL without `org_id` | Low | High | Manual debugging |
| Vehicle ID collision (non-UUID) | Very low | Critical | Would require schema change |
| Shared CH credentials leaked | Low | Critical | Network misconfiguration |
| Multi-tenant SaaS compliance audit | Medium | Medium | Missing org in legacy tables |

---

## 10. Phase 2D.4 conclusion

| Question | Answer |
|----------|--------|
| All schemas analyzed? | **Yes** — 8 tables + migrations 001–006 |
| `tenant_id` used? | **No** — `org_id` only |
| Cross-tenant query paths found? | **Yes** — documented (T1–T9); mitigated by UUID + PG |
| Migration designed? | **Yes** — 007 additive; 008 future rewrite |
| Changes executed? | **No** |

**Next:** Apply 007 after backup validation; implement 2D.5 query/write hardening; run tenant audit on VPS.

---

## 11. Related files

| File | Role |
|------|------|
| `backend/src/modules/clickhouse/migrations/007_legacy_mirror_org_id_columns.sql` | Additive migration (draft) |
| `backend/scripts/ops/vps-clickhouse-tenant-isolation-audit.sh` | VPS audit |
| `docs/remediation/clickhouse-data-integrity.md` | 2D.3 |
| `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` | No hardcoded org assumptions |
