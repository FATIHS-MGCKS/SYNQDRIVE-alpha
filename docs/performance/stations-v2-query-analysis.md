# Stations V2 — Query Path Analysis (Prompt 59/78)

**Date:** 2026-07-18  
**Scope:** Occupied read paths only — no speculative indexes, no production load tests.  
**Migration:** `20260718220000_stations_v2_query_path_indexes` (additive `CREATE INDEX` only).

---

## Method

1. Trace **actual** Prisma `where` clauses from `StationAccessScopeService`, `StationSummaryReadModelService`, `StationOperationsTimelineService`, and `StationsService` nested reads.
2. Map each path to existing PostgreSQL indexes (Prisma `@@index` + prior migrations).
3. Add indexes **only** where a hot path filters on columns without a matching leading prefix.
4. Prefer **pagination** over hard caps where the product already defines it; document remaining fixed limits.

**Out of scope:** JSON-path filters (`metadata.stationId`, `actionTarget.stationId`) — no btree index without a dedicated expression/GIN strategy; attribution remains org-scoped + in-memory filter for org summaries.

---

## Shared scope filter

All station reads resolve through `StationAccessScopeService` (`station-access-scope.util.ts`).

| Scope mode | Station list | Vehicle/booking nested reads |
|------------|--------------|------------------------------|
| `ALL_STATIONS` | `organizationId` | `organizationId` + station linkage |
| `ASSIGNED_STATIONS` | `organizationId` + `id IN (...)` | same + readable station guard |
| `NO_STATIONS` | empty (`id IN []`) | empty |

**Stations table** — already covered by Prompt 54 indexes:

- `(organization_id)`
- `(organization_id, status)` — list filter + default sort
- `(organization_id, type)`, `(organization_id, is_primary)` — org summaries filters

**Verdict:** No new station-table indexes.

---

## 1. Summary list (`GET .../stations/summaries`)

**Service:** `StationSummaryReadModelService.resolveForOrganization`

| Step | Query shape | Existing index | Gap |
|------|-------------|----------------|-----|
| Count + page stations | `organization_id` + optional `status`/`type`/`is_primary`/search + `id IN` | `stations_organization_id_status_idx`, type, is_primary | None |
| Batch vehicles | `organization_id` + `OR(home_station_id IN, current_station_id IN, expected_station_id IN)` | `vehicles_organization_id_current_station_id_idx`, `..._expected_...` | **Home arm lacked `(organization_id, station_id)`** |
| Batch bookings | `organization_id` + `status IN` + `OR(pickup_station_id IN, return_station_id IN)` | `bookings_organization_id_status_idx`, single-column station ids | **Date-agnostic batch OK**; station+date paths need composites (see §6) |
| Batch transfers | `organization_id` + `status IN` + `OR(from_station_id IN, to_station_id IN)` | `..._to_station_id_status_idx` | **Missing mirror for `from_station_id`** |
| Open tasks | `organization_id` + `status IN (OPEN, IN_PROGRESS)` + OR attribution | `org_tasks_organization_id_status_idx` | Adequate |
| Notifications | `organization_id` + `status IN` + entity OR | `notifications_organization_id_status_last_seen_at_idx`, `entity_type_entity_id` | Adequate |

**Pagination:** `page` / `pageSize` on station list; aggregation capped at `maxAggregationStations=500` with transparent metadata — not a silent DB `LIMIT`.

---

## 2. Home fleet

**Paths:**

- Single station summary / KPI: in-memory filter on `homeStationId === stationId` after `buildStationLinkedVehicleWhere`.
- Org summaries batch: `vehicles WHERE organization_id = ? AND station_id IN (...)`.

**Before:** `home_station_id` indexed alone; org batch could not use `(organization_id, home_station_id)` composite.

**After:** `vehicles_organization_id_home_station_id_idx`.

---

## 3. Current fleet (on-site)

**Paths:**

- `buildStationLinkedVehicleWhere` → `current_station_id = stationId`
- Overview stats on-site slice: `... AND current_station_id = stationId`
- Org batch: `current_station_id IN (stationIds)`

**Index:** `vehicles_organization_id_current_station_id_idx` (existing).

**Verdict:** No change.

---

## 4. Expected vehicles

**Paths:**

- KPI `expectedArrivalCount`: `expected_station_id === stationId` (in-memory)
- Org batch: `expected_station_id IN (stationIds)`

**Index:** `vehicles_organization_id_expected_station_id_idx` (existing).

**Verdict:** No change.

---

## 5. Timeline (`GET .../stations/:id/operations-timeline`)

**Service:** `StationOperationsTimelineService.resolveForStation`

| Entity | Filter | Index before | Index after |
|--------|--------|--------------|-------------|
| Bookings | `org` + station OR + status + time OR on `start_date` / `end_date` | `pickup_station_id`, `return_station_id` (single column) | `(organization_id, pickup_station_id, start_date)`, `(organization_id, return_station_id, end_date)` |
| Transfers | `org` + `from/to_station_id` + `status` + time on planned/expected/started | `to_station_id + status` only | `from_station_id + status` mirror |
| Tasks | `org` + open status + due/activates window + attribution OR | `org_tasks_organization_id_status_idx`, `..._due_date`, `..._status_activates_at` | Adequate |
| Handovers | `org` + `actual_station_id` + `performed_at` range | `organization_id` only (full org scan) | **Partial** `(organization_id, actual_station_id, performed_at) WHERE actual_station_id IS NOT NULL` |

**Pagination:** Resolver sorts in memory then `slice` by `page`/`pageSize` (max 200). Window default 14 days bounds row count — not an arbitrary 500-id cap.

**Note:** Task preload still loads all booking ids for the station (no time filter) to build attribution OR clauses. Acceptable for typical station booking volume; revisit with cursor pagination if profiling shows pressure.

---

## 6. Today's pickups / returns

**Paths:**

- `StationsService.getStationOverviewStats` — counts with `pickup_station_id` + `start_date` today window; `return_station_id` + `end_date` today window.
- `resolveStationKpis` — same booking rows loaded once for summary; today/overdue computed in resolver using station timezone.

**Before:** Planner could use `pickup_station_id` / `return_station_id` then filter `start_date`/`end_date` — poor selectivity on busy stations.

**After:** composites with `organization_id` leading column for tenant isolation on large orgs.

---

## 7. Transfers

**Paths:**

- Summary / timeline / KPI: `organization_id` + `status IN (PLANNED, READY, IN_TRANSIT, OVERDUE)` + `to_station_id` or `from_station_id`.

**Before:** `vehicle_station_transfers_organization_id_to_station_id_stat_idx` for arrivals only.

**After:** `vehicle_station_transfers_organization_id_from_station_id_stat_idx` for departures.

**Not added:** time columns on transfer indexes — status + station narrow sufficiently; time filter applied as residual predicate.

---

## 8. Tasks

**Paths:**

- Open tasks (summary): `buildStationOpenTasksWhere` — `organization_id`, `status IN (OPEN, IN_PROGRESS)`, OR(`metadata.stationId`, `vehicle_id IN`, `booking_id IN`).
- Timeline tasks: adds `OR(due_date range, activates_at range)`.

**Indexes used:** `(organization_id, status)`, `(organization_id, due_date)`, `(organization_id, status, activates_at)`, `(vehicle_id)`, `(booking_id)`.

**Verdict:** No new indexes. JSON `metadata.stationId` equality is not indexed (would need expression index; not justified without measured JSON scan cost).

---

## 9. Scope filter (recap)

Readable station IDs materialize as `id IN (...)` on `stations` — PK lookup. Nested reads never scan cross-tenant: `organization_id` is always present.

---

## New indexes (migration summary)

| Index | Table | Rationale |
|-------|-------|-----------|
| `vehicles_organization_id_home_station_id_idx` | `vehicles` | Home fleet org batch |
| `bookings_organization_id_pickup_station_id_start_date_idx` | `bookings` | Pickups today + timeline pickup window |
| `bookings_organization_id_return_station_id_end_date_idx` | `bookings` | Returns today + overdue + timeline return window |
| `vehicle_station_transfers_organization_id_from_station_id_stat_idx` | `vehicle_station_transfers` | Outgoing transfers (symmetry with `to_station_id`) |
| `booking_handover_protocols_org_actual_station_performed_at_idx` | `booking_handover_protocols` | Timeline after-hours handovers (partial, non-null station) |

---

## Lock / write risk (SQL review)

| Statement | Risk | Mitigation |
|-----------|------|------------|
| `CREATE INDEX` (default) | `SHARE UPDATE EXCLUSIVE` — blocks writes to target table until build completes | Additive only; no `DROP`, no `ALTER` rewrites. For prod VPS with large `bookings`, run `CREATE INDEX CONCURRENTLY` manually with same definition, then `prisma migrate resolve`. |
| Partial handover index | Smaller index footprint; excludes rows with `actual_station_id IS NULL` | Matches timeline query (`actual_station_id = stationId`) |

No `VACUUM FULL`, no column rewrites, no constraint changes.

---

## Large organizations

- **Tenant prefix:** New booking indexes lead with `organization_id` so planner can narrow before station/date.
- **Org summaries:** Pagination + `maxAggregationStations=500` cap with `aggregationStationCapApplied` flag — clients must page station list, not assume full org in one response.
- **Timeline:** Time window + server pagination instead of unbounded fetch.
- **Bookings tab:** Fixed `take: 100` on `getStationBookings` — UI list cap; not used by summary/timeline paths.

---

## Validation

```bash
cd backend && npx prisma validate
cd backend && npm test -- --testPathPattern="station-query-path-indexes|station-summary|station-operations-timeline|station-org-summaries"
```

---

## Explicitly not indexed

| Pattern | Reason |
|---------|--------|
| `metadata->>'stationId'` on `org_tasks` | JSON path; no measured full-scan regression |
| `action_target->>'stationId'` on `notifications` | Same; org+status filter first |
| Transfer `planned_at` / `expected_arrival_at` | Residual filter after station+status; speculative without EXPLAIN on prod-sized data |
| GIN on `stations.name` for search | Org summaries search uses `ILIKE`; trigram index out of scope unless search latency is reported |

---

## References

- `backend/src/shared/stations/station-access-scope.util.ts`
- `backend/src/modules/stations/station-summary-read-model.service.ts`
- `backend/src/modules/stations/station-operations-timeline.service.ts`
- `backend/src/modules/stations/stations.service.ts` (`getStationOverviewStats`, `getStationFleet`)
- Migration: `backend/prisma/migrations/20260718220000_stations_v2_query_path_indexes/migration.sql`
