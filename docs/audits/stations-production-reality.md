# Stations Production Reality Audit (Audit 1 of 2)

**Audit type:** Read-only production reality + full code/callsite inventory  
**Audit timestamp (UTC):** 2026-07-17T20:06:00Z  
**Auditor context:** SynqDrive Cloud Agent on `main`  
**Scope:** Stations module — master data, RBAC, fleet assignment, booking integration, KPIs, geofence, UI/UX, runtime topology

---

## 1. Executive Summary

The Stations module is **functionally deployed and tenant-scoped at the organization level**, with a complete CRUD API, booking station validation, handover-driven `currentStationId` updates, and a modern rental UI (`StationsView`, `StationDetailView`, forms, assignment modal). **Production data is small but clean:** 1 tenant org, 2 active stations, 6 vehicles, 9 bookings — **no observed home/current/expected inconsistencies, no archived-station violations, no cross-tenant station links, and no station-scoped users in production yet.**

However, the module is **not production-ready for multi-role or multi-station operations at scale** without remediation:

| Area | Verdict |
|------|---------|
| Org-level tenant isolation | **READY** (`OrgScopingGuard` + Prisma `organizationId` filters) |
| Permission module (`stations` read/write) | **NOT_READY** — defined in role templates but **not enforced** on controller |
| Station scope (SUB_ADMIN / WORKER) | **NOT_READY** — `StationScopeGuard` exists but is **not wired**; JWT lacks `stationScope` |
| Booking station validation (active/archived/pickup/return flags) | **CONDITIONALLY_READY** |
| Opening hours / holidays / capacity rules | **NOT_IMPLEMENTED** (stored + displayed; not enforced on writes) |
| Geofence / auto location | **CONFIG_ONLY** (frontend haversine badge; no backend auto-update) |
| Fleet assignment SET semantics | **CONDITIONALLY_READY** (works; detach omits `expectedStationId`; UI 500 cap) |
| KPI truth | **CONDITIONALLY_READY** (server-local “today”; partial silent failures in list) |
| Monitoring | **NOT_READY** (no station-specific Prometheus series; no Grafana dashboard) |
| Tests | **NOT_READY** (minimal backend unit tests; no frontend station tests) |

**Overall production readiness:** **CONDITIONALLY_READY**

Production currently “works” because the sole tenant operates a tiny fleet with `ORG_ADMIN` + `stationScope=ALL`. **Code-level P0 gaps would become visible immediately** when station-scoped workers or granular permissions are used.

---

## 2. Audit Context

| Item | Value | Evidence |
|------|-------|----------|
| Repository commit (audit workspace) | `c9b3d7c6a91da8f4c2e8e0f87e24c4d6fcfb24aa` | `CODE_VERIFIED` |
| Deployed release on VPS | `20260717181230_v4994` | `LOG_VERIFIED` |
| Deployed commit on VPS | `c9b3d7c6a91da8f4c2e8e0f87e24c4d6fcfb24aa` | `LOG_VERIFIED` |
| API health | `https://app.synqdrive.eu/api/v1/health` → `status: ok` | `API_VERIFIED` |
| Stations routes registered | 18 routes under `/api/v1/organizations/:orgId/stations` | `LOG_VERIFIED` |

---

## 3. Runtime Topology

### 3.1 Process model

| Process | Role | Status | Notes |
|---------|------|--------|-------|
| `synqdrive` (PM2) | API + in-process Bull workers/schedulers | online | Single Node process; **no separate worker PM2** |
| `pm2-logrotate` | Log rotation | online | — |
| `synqdrive-clickhouse` | Analytics (optional) | not audited in depth | Not station-critical |
| `synqdrive-grafana` | Dashboards | present | No station dashboard |
| Prometheus | Metrics scrape | `127.0.0.1:9090` | Station series not found |

**PM2 restarts (synqdrive):** 535 lifetime restarts; uptime ~99m at audit time. **No station-specific errors** in `synqdrive-error.log` grep (90d). **Correlation with station endpoints:** `NOT_VERIFIABLE` from logs alone.

### 3.2 Schedulers / queues touching station data

| Component | Mutates station rows? | Evaluates station data? | Evidence |
|-----------|----------------------|-------------------------|----------|
| Station CRUD API | Yes (user-driven) | — | `CODE_VERIFIED` |
| `POST .../backfill-coordinates` | Yes (lat/lng) | — | `CODE_VERIFIED` |
| `BookingsHandoverService` | No (updates vehicle `currentStationId`, booking actual stations) | — | `CODE_VERIFIED` |
| `StationShortageDetector` | No | Yes (home fleet vs bookings) | `CODE_VERIFIED` |
| `NotificationStationScopeService` | No | Yes (scope filter) | `CODE_VERIFIED` |
| Redis Bull queues | No dedicated `station.*` queue | DIMO/trip/task/notification queues only | `LOG_VERIFIED` |

**Duplicate schedulers / repeated station jobs:** None observed. `LOG_VERIFIED`

### 3.3 Monitoring

| Surface | Station coverage | Evidence |
|---------|------------------|----------|
| `/api/v1/metrics` | Requires bearer token; **no `station` label series** in unauthenticated probe | `API_VERIFIED` |
| Grafana dashboards | `synqdrive-ops.json`, `synqdrive-battery-v2.json`, `synqdrive-driving-intelligence-v2.json` — **no stations dashboard** | `LOG_VERIFIED` |
| PM2 logs | Route mapping on boot; no station 5xx trail in error log sample | `LOG_VERIFIED` |

---

## 4. Code and Callsite Inventory (Teil A)

### 4.1 Backend module map

| Path | Responsibility |
|------|----------------|
| `backend/src/modules/stations/stations.controller.ts` | 18 HTTP endpoints |
| `backend/src/modules/stations/stations.service.ts` | CRUD, stats, fleet, bookings, assignment, geocode backfill |
| `backend/src/modules/stations/station-validation.service.ts` | Booking + vehicle assignment validation (exported) |
| `backend/src/modules/stations/station-mapbox.service.ts` | Mapbox suggest/retrieve |
| `backend/src/modules/stations/station.types.ts` | DTO helpers, `openingHoursIsMissing`, labels |
| `backend/src/modules/stations/station-geocode.util.ts` | Mapbox forward geocode |
| `backend/src/modules/stations/dto/*` | Create/update/list/assign/set-vehicles/mapbox DTOs |
| `backend/src/shared/guards/station-scope.guard.ts` | **Defined, unused on routes** |

### 4.2 Stations controller endpoints

Base: `GET|POST|PATCH|PUT|DELETE /api/v1/organizations/:orgId/stations/...`

| Method | Path | Service | Guards (effective) |
|--------|------|---------|-------------------|
| GET | `/` | `findAll` | Auth + OrgScoping |
| GET | `/stats` | `getStationStats` | Auth + OrgScoping |
| GET | `/search/mapbox` | Mapbox search | Auth + OrgScoping |
| GET | `/search/mapbox/:mapboxId` | Mapbox retrieve | Auth + OrgScoping |
| POST | `/backfill-coordinates` | `backfillCoordinates` | Auth + OrgScoping |
| PATCH | `/vehicles/current-station` | `updateVehicleCurrentStation` | Auth + OrgScoping |
| GET | `/:id` | `findOne` | Auth + OrgScoping |
| GET | `/:id/overview-stats` | `getStationOverviewStats` | Auth + OrgScoping |
| GET | `/:id/fleet` | `getStationFleet` | Auth + OrgScoping |
| GET | `/:id/bookings` | `getStationBookings` (take 100) | Auth + OrgScoping |
| POST | `/` | `create` | Auth + OrgScoping |
| PATCH | `/:id` | `update` | Auth + OrgScoping |
| POST | `/:id/archive` | `archive` | Auth + OrgScoping |
| POST | `/:id/restore` | `restore` | Auth + OrgScoping |
| POST | `/:id/set-primary` | `setPrimaryStation` | Auth + OrgScoping |
| PUT | `/:id/vehicles` | `setStationVehicles` (SET) | Auth + OrgScoping |
| POST | `/:id/assign-vehicle` | `assignVehicleToStation` | Auth + OrgScoping |
| DELETE | `/:id` | `delete` (archive-if-linked else hard delete) | Auth + OrgScoping |

**Activate / deactivate:** No dedicated routes — via `PATCH /:id` with `status: ACTIVE|INACTIVE|ARCHIVED`. `CODE_VERIFIED`

**Unauthenticated probe:** `GET .../stations` and `GET .../stations/stats` → **401** (routes live). `API_VERIFIED`

### 4.3 Prisma `Station` relations

| Relation | FK on child | onDelete |
|----------|-------------|----------|
| `vehiclesHome` | `Vehicle.homeStationId` (`station_id`) | SetNull |
| `vehiclesCurrent` | `Vehicle.currentStationId` | SetNull |
| `vehiclesExpected` | `Vehicle.expectedStationId` | SetNull |
| `pickupBookings` / `returnBookings` | `Booking.pickupStationId` / `returnStationId` | SetNull |
| `actualPickupBookings` / `actualReturnBookings` | actual pickup/return station IDs | SetNull |
| `userAccountPreferences` | `defaultStationId` | — |

**No DB unique index** enforcing one `is_primary` per organization — enforced only in service transactions. `CODE_VERIFIED`

### 4.4 Write paths (summary)

| Operation | Entry | Side effects |
|-----------|-------|--------------|
| Create | `POST /` | Optional geocode; `isPrimary` clears others in tx |
| Update | `PATCH /:id` | Re-geocode on address change; `ARCHIVED` sets `archivedAt` |
| Archive | `POST /:id/archive` | `ARCHIVED`, `archivedAt`, `isPrimary=false`, pickup/return disabled |
| Restore | `POST /:id/restore` | `ACTIVE`, clears `archivedAt`, **forces pickup+return enabled** |
| Set primary | `POST /:id/set-primary` | Tx clears other primaries; rejects archived |
| SET vehicles | `PUT /:id/vehicles` | Detach: `homeStationId=null`, `currentStationId=null`; attach: both set to station |
| Assign vehicle | `POST /:id/assign-vehicle` | `home` sets home+current; `current` / `expected` separate |
| Patch current | `PATCH /vehicles/current-station` | Updates `currentStationId` ± `expectedStationId` |
| Handover pickup/return | `BookingsHandoverService` | Sets `actual*StationId`, updates `vehicle.currentStationId` |
| Booking create/update | `StationValidationService.validateBookingStations` | Active + pickup/return flags; one-way consistency |

### 4.5 Frontend consumers

| Component | Role |
|-----------|------|
| `StationsView.tsx` | List, KPIs, filters, create/edit/archive/primary/backfill |
| `StationDetailView.tsx` | Tabs: overview, fleet, bookings, staff (**empty**), rules, handover |
| `StationFormModal.tsx` | Create/edit + Mapbox |
| `StationAssignVehicleModal.tsx` | Bulk SET (`limit: 500` vehicle load) |
| `StationSelectFields.tsx` | Booking pickup/return (hardcoded DE strings) |
| `BookingStationPanel.tsx` | Planned vs actual stations |
| Operator handover flows | `actualStationId` on pickup/return |
| `StationHealthPanel` / `stationCommandBuilder` | **Separate** dashboard KPI model (runtime state, not `overview-stats`) |
| `SettingsView.tsx` → `StationsTab` | **~1700 lines dead code** (not rendered) |

### 4.6 home / current / expected mixing points

| Location | Behavior | Risk |
|----------|----------|------|
| `assignVehicle` target `home` | Sets **both** `homeStationId` and `currentStationId` | Intentional coupling |
| `setStationVehicles` attach | Sets **both** home + current | Intentional |
| `setStationVehicles` detach | Clears home + current; **not** `expectedStationId` | Stale expected possible |
| `updateVehicleCurrentStation` | Can set current ± expected independently | OK |
| Handover | Updates `currentStationId` from `actualStationId` | OK |
| Overview/fleet queries | `OR` home **or** current on station | Vehicles “away” still counted if home=station |

### 4.7 Hard limits

| Limit | Where | Value |
|-------|-------|-------|
| Assignment modal vehicle load | `StationAssignVehicleModal` | `api.vehicles.listByOrg({ limit: 500 })` |
| Overview open-task booking IDs | `getStationOverviewStats` | `take: 500` |
| Station bookings tab API | `getStationBookings` | `take: 100` |
| Geofence radius | DTO + service | 25–5000 m |
| Capacity | Schema | Optional; **not enforced** on assign |

### 4.8 N+1 / performance patterns

| Pattern | Severity |
|---------|----------|
| `StationsView` loads `overview-stats` per station (batches of 8) | Medium at scale |
| `StationShortageDetector` per-station count loop | Medium |
| `NotificationStationScopeService.buildScopeContext` unbounded vehicle/booking lists | Medium |
| `findAll` with `_count.vehiclesHome` | Good |

### 4.9 Geofence usage

| Layer | Status |
|-------|--------|
| `Station.radiusMeters` persisted | Yes |
| `frontend/src/lib/geospatial.ts` → `isVehicleAtHomeStation` | Frontend badge only |
| Backend auto-update `currentStationId` from GPS | **NOT_IMPLEMENTED** |
| DIMO position → station assignment | **NOT_IMPLEMENTED** |

Classification: **CONFIG_ONLY** (with **PARTIALLY_ACTIVE** UI readout when GPS + coords exist)

### 4.10 Empty / unwired UI

| Item | Status |
|------|--------|
| Station detail **Staff** tab | Permanent empty state |
| `api.stations.restore` | No UI |
| `api.stations.assignVehicle` | No UI |
| `vehicleStationDeviation.ts` | Dead code |
| `stats.unassignedVehicles` | API exists; not in KPI row |

---

## 5. Production Station Inventory (Teil C)

> All identifiers anonymized to 8-char refs. No addresses, names, emails, or plates.

### 5.1 Aggregate counts

| Metric | Value | Evidence |
|--------|-------|----------|
| Organizations with stations | **1** | `PRODUCTION_DATA_VERIFIED` |
| Total stations | **2** | `PRODUCTION_DATA_VERIFIED` |
| Stations per org (max) | **2** | `PRODUCTION_DATA_VERIFIED` |
| Status ACTIVE | **2** | `PRODUCTION_DATA_VERIFIED` |
| Status INACTIVE / ARCHIVED | **0** | `PRODUCTION_DATA_VERIFIED` |
| Type BRANCH | **2** | `PRODUCTION_DATA_VERIFIED` |
| Primary stations | **1** | `PRODUCTION_DATA_VERIFIED` |
| Orgs with multiple primaries | **0** | `PRODUCTION_DATA_VERIFIED` |
| Orgs with stations but no primary | **0** | `PRODUCTION_DATA_VERIFIED` |
| Missing address | **0** | `PRODUCTION_DATA_VERIFIED` |
| Missing coordinates | **0** | `PRODUCTION_DATA_VERIFIED` |
| Partial / invalid coordinates | **0** | `PRODUCTION_DATA_VERIFIED` |
| Missing timezone | **0** | `PRODUCTION_DATA_VERIFIED` |
| Missing opening hours (DB null/empty) | **0** | `PRODUCTION_DATA_VERIFIED` |
| Missing capacity (NULL) | **2** (both stations) | `PRODUCTION_DATA_VERIFIED` |
| Capacity ≤ 0 | **0** | `PRODUCTION_DATA_VERIFIED` |
| Archived invariant violations | **0** | `PRODUCTION_DATA_VERIFIED` |

### 5.2 Anonymized station sample

| station_ref | org_ref | status | type | primary | coords | hours | pickup | return | capacity |
|-------------|---------|--------|------|---------|--------|-------|--------|--------|----------|
| 59486316 | faa710c9 | ACTIVE | BRANCH | yes | ok | set | yes | yes | null |
| fdd93bf4 | faa710c9 | ACTIVE | BRANCH | no | ok | set | yes | yes | null |

### 5.3 Inconsistent station states (production)

**Count: 0** observed across archived links, inactive bookings, multi-primary, and invalid coords.

---

## 6. RBAC and Station Scope (Teil D)

### 6.1 Code evaluation

| Control | Applied to stations routes? | Notes |
|---------|----------------------------|-------|
| `AuthGuard` (global) | Yes | JWT required |
| `OrgScopingGuard` | Yes | Org membership + JWT org match |
| `RolesGuard` | Present | **No `@Roles()`** → no-op |
| `PermissionsGuard` + `@RequirePermission('stations', …)` | **No** | Module key exists in `permission.constants.ts` |
| `StationScopeGuard` | **No** | Would check `params.stationId` (routes use `:id`) |

### 6.2 Production membership / scope data

| Metric | Value | Evidence |
|--------|-------|----------|
| Total memberships (all orgs) | 1 | `PRODUCTION_DATA_VERIFIED` |
| Global scope (`ALL` / null) | 1 | `PRODUCTION_DATA_VERIFIED` |
| Station-scoped users | **0** | `PRODUCTION_DATA_VERIFIED` |
| Invalid scope station ID | **0** | `PRODUCTION_DATA_VERIFIED` |
| Scope pointing to archived station | **0** | `PRODUCTION_DATA_VERIFIED` |

**Potential scope violations in production:** **0** (no scoped users).  
**Code-level exposure if scoped users were added:** **HIGH** — API would still allow list/read/write all stations. `CODE_VERIFIED`

### 6.3 Per-route authorization matrix (static)

| Route | READ | WRITE | Scope enforced | Role/permission |
|-------|------|-------|----------------|-----------------|
| GET list/detail/stats/fleet/bookings | ALLOWED* | — | **SCOPE_MISSING** | **ROLE_MISSING** |
| POST create | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |
| PATCH update | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |
| POST archive/restore/set-primary | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |
| PUT set-vehicles / assign / patch current | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |
| POST backfill-coordinates | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |
| DELETE | — | ALLOWED* | **SCOPE_MISSING** | **ROLE_MISSING** |

\*For any authenticated user with **active org membership** (or `MASTER_ADMIN`). `CODE_VERIFIED`

**Notifications-only scope:** `NotificationStationScopeService` filters SUB_ADMIN/WORKER notifications — **not** station API. `CODE_VERIFIED`

---

## 7. Home / Current / Expected Station (Teil E)

### 7.1 Production distribution

| Metric | Count | Evidence |
|--------|-------|----------|
| Vehicles total | 6 | `PRODUCTION_DATA_VERIFIED` |
| With `homeStationId` | 6 | `PRODUCTION_DATA_VERIFIED` |
| With `currentStationId` | 6 | `PRODUCTION_DATA_VERIFIED` |
| With `expectedStationId` | **0** | `PRODUCTION_DATA_VERIFIED` |
| With none of three | **0** | `PRODUCTION_DATA_VERIFIED` |
| home = current | **6** | `PRODUCTION_DATA_VERIFIED` |
| home ≠ current | **0** | `PRODUCTION_DATA_VERIFIED` |
| expected without current | **0** | `PRODUCTION_DATA_VERIFIED` |
| current on archived/inactive station | **0** | `PRODUCTION_DATA_VERIFIED` |
| cross-org station assignment | **0** | `PRODUCTION_DATA_VERIFIED` |

### 7.2 Fleet per station (home)

| home_ref | vehicles |
|----------|----------|
| 59486316 | 5 |
| fdd93bf4 | 1 |

### 7.3 Inconsistency sample

**0 rows** returned for home≠current, expected set, or missing home with current set.

### 7.4 Semantic assessment

| Concept | Implementation | Production |
|---------|----------------|------------|
| Organizational home | `homeStationId` | All vehicles assigned |
| Physical location | `currentStationId` | Mirrors home (no transfers in data) |
| Expected destination | `expectedStationId` | Unused in prod |
| Location source | Handover + assignment APIs | No GPS auto pipeline |
| Transfer logic | Booking one-way + handover actual station | No one-way bookings in prod |

---

## 8. Vehicle Assignment and Bulk SET (Teil F)

### 8.1 Code semantics

- **SET:** `PUT /:id/vehicles` replaces exact home fleet; detach clears `homeStationId` + `currentStationId`.
- **Single assign:** `target: home|current|expected` with validation.
- **No backend max vehicles per station.**
- **No transaction isolation label** beyond Prisma `$transaction` for SET.

### 8.2 Production scale

| Metric | Value |
|--------|-------|
| Max vehicles per org | 6 |
| Max vehicles per station (home) | 5 |
| Orgs > 500 vehicles | 0 |
| Vehicles beyond UI 500 cap | 0 |

### 8.3 Risk assessment

| Risk | Severity | Prod evidence |
|------|----------|---------------|
| UI truncates fleet >500 on assign | P0 at scale | Not triggered (6 vehicles) |
| Detach leaves `expectedStationId` | P1 | Not observed |
| Concurrent SET races | P2 | Not observable |
| Historical unintended detach | — | **NOT_VERIFIABLE** (10 activity log rows; no field-level diff in sample) |

**Activity logs (station-related):** 10 total, 10 in last 90d (`entity=STATION` or route `%/stations%`). `PRODUCTION_DATA_VERIFIED`

---

## 9. Primary Station (Teil G)

| Check | Result |
|-------|--------|
| Service transaction on create/update/set-primary | Yes — `updateMany` clears other primaries |
| DB unique constraint per org | **No** |
| Parallel set-primary race | **RACE_POSSIBLE** |
| Archived primary in prod | 0 |
| Org without primary (with stations) | 0 |

**Classification:** **SERVICE_LEVEL_SAFE** + **RACE_POSSIBLE** (not **DATABASE_ENFORCED**)

---

## 10. Archive / Restore / Delete (Teil H)

### 10.1 Code behavior

| Action | Behavior |
|--------|----------|
| Archive | Disables pickup/return; clears primary |
| Restore | Forces ACTIVE + re-enables pickup/return (may override prior disabled state) |
| Delete | If vehicles or pickup/return bookings linked → archive; else hard delete |
| Hard delete reachable | Yes (`DELETE` when no links) |
| Relations on hard delete | Station row only; FKs on children are SetNull |

### 10.2 Production

No archived stations; **0** vehicles/bookings on archived stations.

### 10.3 Gap analysis

| Gap | Severity |
|-----|----------|
| Restore always re-enables pickup/return | P2 |
| `expectedStationId` not cleared on archive/detach | P1 |
| `UserAccountPreference.defaultStationId` not checked on delete | P2 |
| `stationIds` JSON on membership not validated on archive | P2 |

---

## 11. Booking Integration (Teil I)

### 11.1 Production (30d / 90d / all)

| Metric | Value |
|--------|-------|
| Bookings total | 9 |
| Bookings last 30d | 9 |
| Without pickup station | 0 |
| Without return station | 0 |
| One-way (`is_one_way_rental`) | 0 |
| Pickup on archived/inactive station | 0 |
| Actual pickup ≠ planned | 0 |
| Actual return ≠ planned | 0 |
| Future active on archived pickup | 0 |

**By status:** CANCELLED 4, CONFIRMED 3, ACTIVE 2. `PRODUCTION_DATA_VERIFIED`

### 11.2 Rule enforcement matrix

| Rule | Backend on create/update | Backend on handover | Production violations |
|------|-------------------------|---------------------|----------------------|
| Station ACTIVE + pickup/return flags | **BLOCKED** (400) | Partial (archived actual blocked) | 0 |
| One-way consistency | **BLOCKED** if flag mismatch | — | 0 |
| Opening hours | **NOT_IMPLEMENTED** | **NOT_IMPLEMENTED** | — |
| Holidays | **NOT_IMPLEMENTED** | **NOT_IMPLEMENTED** | — |
| Capacity / overlap | **NOT_IMPLEMENTED** | — | — |
| After-hours return permission | Stored only | **NOT_IMPLEMENTED** | — |
| Transfer fee | Field stored | Manual | — |

---

## 12. Opening Hours, Holidays, Timezones (Teil J)

| Topic | Status |
|-------|--------|
| Schema | `openingHours` JSONB, `holidayRules` JSONB, `timezone` string (default `Europe/Berlin`) |
| DTO validation | `@IsObject()` only — no semantic schema |
| Backend “open now” | **NOT_IMPLEMENTED** |
| `holidayRules` consumers | **None** in backend business logic |
| Overview “today” pickups/returns | `startOfToday` / `endOfToday` in **server local timezone** — ignores `station.timezone` |
| Frontend hours editor | `StationFormModal` + `stationUtils` |
| DST handling | **NOT_VERIFIABLE** without timezone-aware integration tests |

**Prod:** Both stations have hours set; timezone set. **No deviation test possible** (no bookings outside hours enforced).

---

## 13. KPI and Number Consistency (Teil K)

### 13.1 KPI sources

| KPI | List card | Detail overview | Org stats endpoint | Fleet tab |
|-----|-----------|-----------------|-------------------|-----------|
| vehicleCount (home) | `_count.vehiclesHome` | `totalVehicles` (home OR current) | sum home counts | fleet query |
| available / rented | overview-stats sum | per-station overview | — | vehicle status |
| today pickups/returns | overview-stats sum | per-station | — | bookings tab |
| open tasks | overview flag | overview | — | — |
| capacity % | overview | overview | — | — |

### 13.2 Known inconsistencies

| Issue | Cause | Severity |
|-------|-------|----------|
| `totalVehicles` uses home∪current; list `vehicleCount` uses home only | Different definitions | P1 |
| `bookedVehicles` = `VehicleStatus.RENTED` count | Not booking-based; label “gebucht” misleading | P1 |
| Silent overview-stats failures in list | `.catch(() => null)` per station | P1 |
| `vehiclesWithHealthWarnings` always `null` in overview DTO | Not implemented | P2 |
| Dashboard `StationHealthPanel` vs stations overview | Different data sources | P2 |

**Production KPI cross-check:** Not performed with authenticated API — **NOT_VERIFIABLE** for live JSON equality. Static code analysis only.

---

## 14. Health, Tasks, Notifications (Teil L)

| Integration | Station-aware? | Notes |
|-------------|----------------|-------|
| `getStationOverviewStats` → `orgTask.count` | Yes | Booking IDs capped at 500 |
| Business insights `StationShortageDetector` | Yes | Uses `homeStationId` only |
| Notifications station scope | Yes | SUB_ADMIN/WORKER filter |
| Battery/tire/brake health KPIs on station card | **No** | `vehiclesWithHealthWarnings: null` |
| Runtime “ready for rent” on station dashboard | Via separate `stationCommandBuilder` | Not same as station module |

**Always null in station overview:** `vehiclesWithHealthWarnings`. `CODE_VERIFIED`

---

## 15. Geofence and Location Automation (Teil M)

| Capability | Classification |
|------------|----------------|
| Store lat/lng/radius | **PRODUCTION_ACTIVE** |
| Frontend HOME/AWAY badge | **PARTIALLY_ACTIVE** (needs GPS fix) |
| Auto arrival/departure | **NOT_IMPLEMENTED** |
| Auto `currentStationId` from DIMO | **NOT_IMPLEMENTED** |
| Position source persistence | **NOT_IMPLEMENTED** |
| Geofence flapping monitoring | **NOT_VERIFIABLE** |

Handover **does** set `currentStationId` from operator-selected `actualStationId` — **PRODUCTION_ACTIVE** for manual flows.

---

## 16. API and Frontend Reality (Teil N)

### 16.1 Stations list (`StationsView`)

- Card/list toggle, search, status filter, KPI row, per-card warnings via `getStationWarnings`.
- Loads `stats` + N×`overview-stats` (batch 8).
- Errors: full-page on main load; per-station overview failures silent (`—`).
- Mobile: responsive KPI grid; some labels truncate.

### 16.2 Station detail

- Six tabs; **Staff** is placeholder.
- Fleet + bookings tabs: errors swallowed (no inline error UI).
- Deep link via app view state `station-detail`.

### 16.3 Forms and assignment

- Mapbox typeahead on create/edit.
- Assign modal: SET checkboxes, filters, **500 vehicle cap**, no post-save counters from API result.
- Archive from list; **no restore UI**.

### 16.4 UX issues (selected)

| Issue | Severity |
|-------|----------|
| 500 vehicle silent truncation | P0 at scale |
| Staff tab empty (looks unfinished) | P1 |
| Dead `StationsTab` in Settings (~1700 LOC) | P2 |
| `StationSelectFields` / `BookingStationPanel` not i18n | P2 |
| Assignment does not surface `movedFromOtherStations` / `detached` counts | P2 |

---

## 17. Performance and Scaling (Teil O)

### 17.1 Query plans (production sample)

- Stations by org: index scan on `stations_organization_id_code_key`. `PRODUCTION_DATA_VERIFIED`
- Vehicles by home station: `vehicles_station_id_idx`. `PRODUCTION_DATA_VERIFIED`

### 17.2 Scale assessment (realistic)

| Scale | List + overview | Assignment | Bookings tab | Risk |
|-------|-----------------|------------|--------------|------|
| 10 stations | OK | OK | OK | Low |
| 50 stations | ~50 overview API calls | OK | OK | Medium (list KPI latency) |
| 500 vehicles | OK if <500 loaded | **Broken partial SET** if >500 | OK | **High** |
| 5000 vehicles | Slow list | **Unsafe** | OK | **Critical** |
| 1000s bookings/station | OK | — | **Truncated at 100** | Medium |

No load tests executed (per audit rules).

---

## 18. Test Coverage (Teil P)

| Area | Backend | Frontend |
|------|---------|----------|
| Station validation (archive, pickup flags, one-way) | `stations.service.spec.ts` | — |
| Geocode util | `station-geocode.util.spec.ts` | — |
| SET assignment counters | partial in service spec | — |
| Station scope guard | **missing** | — |
| Permissions on controller | **missing** | — |
| Bulk SET >500 | **missing** | — |
| Home/current/expected edge cases | **missing** | — |
| Archive/restore lifecycle | **missing** | — |
| Primary race | **missing** | — |
| Opening hours / TZ / DST | **missing** | — |
| Booking hours rules | **missing** | — |
| Geofence | — | `fleet-station-filter.test.ts` only (filter, not station CRUD) |
| Station UI components | — | **none** |

---

## 19. P0 / P1 / P2 Findings

### P0

| ID | Finding | Evidence |
|----|---------|----------|
| P0-1 | **No `PermissionsGuard` on stations controller** — any org member can create/update/archive/assign | `CODE_VERIFIED` |
| P0-2 | **`StationScopeGuard` not applied**; scoped SUB_ADMIN/WORKER would see all stations via API | `CODE_VERIFIED` |
| P0-3 | **Assignment UI loads max 500 vehicles** without warning — SET can drop vehicles silently | `CODE_VERIFIED` |
| P0-4 | **Opening hours / holidays / capacity not enforced** on booking or assignment | `CODE_VERIFIED` |

### P1

| ID | Finding | Evidence |
|----|---------|----------|
| P1-1 | Overview `totalVehicles` (home∪current) ≠ list `vehicleCount` (home only) | `CODE_VERIFIED` |
| P1-2 | Today pickup/return uses server TZ, not `station.timezone` | `CODE_VERIFIED` |
| P1-3 | `setStationVehicles` detach does not clear `expectedStationId` | `CODE_VERIFIED` |
| P1-4 | `getStationBookings` hard limit 100 — no pagination | `CODE_VERIFIED` |
| P1-5 | Open tasks use max 500 booking IDs — under-count risk | `CODE_VERIFIED` |
| P1-6 | No station Prometheus metrics / Grafana dashboard | `LOG_VERIFIED` |
| P1-7 | Station detail Staff tab permanently empty | `CODE_VERIFIED` |
| P1-8 | Silent per-station overview failures degrade KPIs | `CODE_VERIFIED` |
| P1-9 | `bookedVehicles` KPI uses `RENTED` status not booking count | `CODE_VERIFIED` |

### P2

| ID | Finding | Evidence |
|----|---------|----------|
| P2-1 | No DB unique constraint on `is_primary` per org | `CODE_VERIFIED` |
| P2-2 | `holidayRules` stored, unused | `CODE_VERIFIED` |
| P2-3 | Dead `StationsTab` in SettingsView | `CODE_VERIFIED` |
| P2-4 | `vehicleStationDeviation.ts` unused | `CODE_VERIFIED` |
| P2-5 | `restore` / `assignVehicle` APIs without UI | `CODE_VERIFIED` |
| P2-6 | Restore forces pickup/return enabled | `CODE_VERIFIED` |
| P2-7 | Station shortage detector N+1 per station | `CODE_VERIFIED` |
| P2-8 | Booking/operator station pickers hardcoded German | `CODE_VERIFIED` |

---

## 20. Production Readiness Matrix (Teil Q)

| Area | Status |
|------|--------|
| Station Master Data | **CONDITIONALLY_READY** |
| RBAC | **NOT_READY** |
| Station Scope | **NOT_READY** |
| CRUD | **CONDITIONALLY_READY** |
| Status Lifecycle | **CONDITIONALLY_READY** |
| Primary Station | **CONDITIONALLY_READY** |
| Fleet Assignment | **CONDITIONALLY_READY** |
| Current Location | **CONDITIONALLY_READY** |
| Expected Location | **SHADOW_ONLY** (field exists; unused in prod) |
| Booking Integration | **CONDITIONALLY_READY** |
| Opening Hours | **NOT_READY** (display only) |
| Holidays | **NOT_READY** |
| Timezones | **NOT_READY** |
| Capacity | **NOT_READY** |
| Geofence | **CONFIG_ONLY** |
| KPIs | **CONDITIONALLY_READY** |
| Health Integration | **SHADOW_ONLY** |
| Task Integration | **CONDITIONALLY_READY** |
| API | **CONDITIONALLY_READY** |
| UI/UX | **CONDITIONALLY_READY** |
| Performance | **CONDITIONALLY_READY** (small fleet) |
| Monitoring | **NOT_READY** |
| Tests | **NOT_READY** |

---

## 21. Recommended Implementation Order

1. **Wire `PermissionsGuard`** with `@RequirePermission('stations', 'read'|'write')` on all routes; align with Users/Roles UI.
2. **Implement station scope** on list + detail + writes (guard + query filters + JWT/membership `stationScope`).
3. **Fix assignment scale:** server-side paginated picker or server-driven SET preview; surface `movedFromOtherStations` / `detached`.
4. **Align KPI definitions** (home vs home∪current; booked vs RENTED) and use `station.timezone` for “today”.
5. **Enforce booking rules:** opening hours, holidays, capacity (at least WARN).
6. **Clear `expectedStationId` on detach/archive**; add DB partial unique index for one primary per org.
7. **Station monitoring:** Prometheus counters + Grafana panel; paginate station bookings.
8. **UI cleanup:** remove or wire Staff tab; delete dead Settings `StationsTab`; i18n for booking station fields.
9. **Tests:** scope, permissions, SET>500, primary race, TZ, archive/restore.

---

## 22. Read-Only Queries and Commands Used

### Git / deploy

```bash
git rev-parse HEAD
ssh root@srv1374778.hstgr.cloud 'readlink -f /opt/synqdrive/current; git -C /opt/synqdrive/current rev-parse HEAD'
```

### PM2 / health / API

```bash
pm2 jlist
curl https://app.synqdrive.eu/api/v1/health
curl -o /dev/null -w "%{http_code}" https://app.synqdrive.eu/api/v1/organizations/<uuid>/stations
curl https://app.synqdrive.eu/api/v1/metrics  # 401 without bearer
```

### PostgreSQL (read-only, via psql on VPS; `DATABASE_URL` query string stripped)

- Station inventory aggregates (counts by status, type, primary, coords, hours, capacity, archived flags)
- Vehicle home/current/expected distribution
- Membership `station_scope` validation
- Booking station integrity (30d/90d, one-way, archived, actual vs planned)
- Fleet size maxima
- Activity log counts: `entity='STATION' OR route ILIKE '%/stations%'`
- `EXPLAIN` on stations-by-org and vehicles-by-home-station

SQL scripts used: `/tmp/stations-audit-readonly.sql`, `/tmp/stations-audit-readonly-2.sql`, `/tmp/stations-audit-readonly-3.sql` (uploaded from workspace `.cursor/tmp/`).

### Logs / Redis

```bash
grep -i station /root/.pm2/logs/synqdrive-error.log
grep -i /stations /root/.pm2/logs/synqdrive-out.log
redis-cli --scan --pattern 'bull:*'  # no station-specific queues
```

---

## 23. Missing Access and Uncertainties

| Item | Status |
|------|--------|
| Authenticated API JSON for live KPI cross-check | **NOT_VERIFIABLE** (no Clerk token in audit env) |
| E2E UI manual on production | **NOT_VERIFIABLE** |
| Historical bulk SET damage | **NOT_VERIFIABLE** (activity logs lack field diffs in sample) |
| Geofence flapping / GPS quality | **NOT_VERIFIABLE** |
| Opening hours real-world mismatch | **NOT_VERIFIABLE** (rules not enforced) |
| PM2 restart root cause | **NOT_VERIFIABLE** (535 restarts; no station error correlation) |
| Station-scoped user abuse in prod | **N/A** (0 scoped users) |

---

## Summary Counts (for closure)

| Metric | Value |
|--------|-------|
| Organizations with stations | 1 |
| Stations total | 2 |
| Inconsistent station states (prod) | 0 |
| Potential scope violations (prod) | 0 |
| Home/current/expected inconsistencies (prod) | 0 |
| Booking rule violations in data (prod) | 0 |
| KPI code-level deviations documented | 9 (P1/P2) |
| **Overall verdict** | **CONDITIONALLY_READY** |

---

*End of Audit 1 of 2 — Stations Production Reality*
