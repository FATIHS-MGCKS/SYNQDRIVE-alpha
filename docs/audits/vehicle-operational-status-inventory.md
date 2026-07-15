# Vehicle Operational Status — Read-only Inventory (Prompt 1/43)

**Date:** 2026-07-15  
**Scope:** SynqDrive repository — backend, frontend (rental, operator, master), workers, tests, architecture docs  
**Mode:** Read-only. No Prisma, business-logic, or UI changes.  
**Prior audit:** `docs/audits/vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf`

---

## Methodology

### Documents read

| Source | Relevance |
|--------|-----------|
| `docs/audits/vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf` | KS FH 660E case, canonical precedence, module index |
| `AGENTS.md` | Repo layout, DIMO/booking architecture rules |
| `.cursor/rules/projektregel.mdc` | Preserve booking/handover architecture; no duplicate flows |
| `.cursor/rules/Architectur-Updates.mdc` | Changes/Architektur update policy |
| `frontend/src/master/components/ArchitekturView.tsx` | Fleet status pipeline, dashboard runtime |
| `frontend/src/master/components/ChangesView.tsx` | V4.6.70 booking derivation, V4.6.85–90 hardening |
| `docs/operational-issue-normalization.md` | Runtime reason / readiness separation |
| `docs/notification-engine-current-state.md` | Vehicle runtime state references |

### Repository search commands executed

```bash
# Broad status / booking-context sweep
rg 'AVAILABLE|RESERVED|RENTED|Active Rented|reservedBookingId|activeBookingId|nextBooking|rentalReadiness|operationalStatus' \
  --glob '*.{ts,tsx,prisma}' /workspace

# Ghost guards, catch→[], derivation helpers
rg 'deriveFleetStatus|buildBookingContext|EMPTY_BOOKING|ghost|catch.*\[\]' \
  --glob '*.{ts,tsx}' /workspace/backend /workspace/frontend

# Direct VehicleStatus writes
rg 'VehicleStatus\.(RESERVED|RENTED|AVAILABLE)|status:\s*VehicleStatus' \
  --glob '*.ts' /workspace/backend

# Fleet-map cache
rg 'fleet-map:|FLEET_MAP_CACHE|fetchFleetMap|refreshFleet' \
  --glob '*.{ts,tsx}' /workspace

# Runtime / dashboard builders
rg 'vehicleRuntimeState|mapOperationalStatus|buildDashboardRuntimeModel|Ready for Rent' \
  --glob '*.{ts,tsx,md}' /workspace/frontend

# Workflow status writes
rg 'execVehicleStatusUpdate|vehicle\.status\.update|normalizeVehicleStatus' \
  --glob '*.ts' /workspace/backend

# Frontend mapping gaps
rg 'FleetMapVehicleResponse|reservedReturnAt|activeStartAt|normalizeStatus' \
  --glob '*.{ts,tsx}' /workspace/frontend

# nextBooking (backend + frontend)
rg 'nextBooking|deriveNextBookingContext' --glob '*.ts' /workspace
```

---

## Executive model (three truths)

| Truth layer | Storage / transport | Values | Used by |
|-------------|---------------------|--------|---------|
| **A — DB column** | `Vehicle.status` (Prisma `VehicleStatus`) | `AVAILABLE`, `RENTED`, `RESERVED`, `IN_SERVICE`, `OUT_OF_SERVICE` | Handover writes, workflows, org stats, insights detectors, DIMO scheduler |
| **B — Fleet read-model** | API field `status` (string) on `/fleet-map`, `/vehicles` | `Available`, `Reserved`, `Active Rented`, `Maintenance` | Rental fleet UI, dashboard runtime input |
| **C — Runtime overlay** | In-memory `VehicleRuntimeState` | `operationalStatus`, `rentalReadiness`, `bookingState`, reasons | Dashboard KPIs, drilldown drawer, action queue |

**Canonical derivation (layer B):** `VehiclesService.buildBookingContextMap` → `deriveFleetStatusContext`  
**Precedence:** `Maintenance` > `Active Rented` (ACTIVE booking) > `Reserved` (PENDING/CONFIRMED, `endDate >= now`) > DB label > ghost demotion to `Available`

**Root cause of early Reserved:** `buildBookingContextMap` has **no `startDate` filter** for reserved slot. Any future `PENDING`/`CONFIRMED` booking with `endDate >= now` immediately yields `reservedBookingId` → UI `Reserved` (since V4.6.70).

---

## 1. File and callsite matrix

### 1.1 Backend — schema & enums

| File | Symbol / field | Op | Role |
|------|----------------|-----|------|
| `backend/prisma/schema.prisma` | `enum VehicleStatus` | def | `AVAILABLE`, `RENTED`, `IN_SERVICE`, `OUT_OF_SERVICE`, `RESERVED` |
| `backend/prisma/schema.prisma` | `Vehicle.status` | R/W | `@default(AVAILABLE)` |
| `backend/prisma/schema.prisma` | `enum BookingStatus` | def | `PENDING`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| `backend/prisma/schema.prisma` | `Booking.status` | R/W | Drives reserved/active derivation; no FK sync to `Vehicle.status` |

### 1.2 Backend — canonical fleet derivation (single source for rental API `status`)

| File | Function / constant | Op | Status source |
|------|---------------------|-----|---------------|
| `vehicles.service.ts` | `RENTAL_STATUS_MAP` | normalize | DB enum → rental label |
| `vehicles.service.ts` | `VEHICLE_STATUS_MAP` | normalize | DB enum → master label (`Blocked` for `OUT_OF_SERVICE`) |
| `vehicles.service.ts` | `buildBookingContextMap` | read, **derive** | Bookings → `activeBookingId`, `reservedBookingId`, overdue flags |
| `vehicles.service.ts` | `deriveFleetStatusContext` | **derive** | Precedence + ghost guard |
| `vehicles.service.ts` | `deriveMaintenanceContext` | derive | `IN_SERVICE` / `OUT_OF_SERVICE` |
| `vehicles.service.ts` | `mapToVehicleData` | map | Paginated `/vehicles` DTO |
| `vehicles.service.ts` | `getFleetMapData` | map + **cache** | `/fleet-map` DTO |
| `vehicles.service.ts` | `mapToRegisteredVehicle` | map | Master admin; `operationalStatus: ''` placeholder |
| `vehicles.service.ts` | `fetchPickupOdometerMap` | read | PICKUP protocol odometer for `liveKmDriven` |
| `vehicles.service.spec.ts` | Jest suite | test | Precedence, ghost guard, telemetry |

### 1.3 Backend — vehicle HTTP surface

| Endpoint | Controller | Service | Status in response |
|----------|------------|---------|-------------------|
| `GET /organizations/:orgId/vehicles` | `findByOrganization` | `findByOrganization` → `mapToVehicleData` | **Booking-derived** `status` + booking fields |
| `GET /organizations/:orgId/fleet-map` | `getFleetMap` | `getFleetMapData` | **Booking-derived** (Redis cache 5s) |
| `GET /organizations/:orgId/vehicles/:vehicleId` | `findOne` | `findOne` → `mapToVehicleData` | **Booking-derived** |
| `GET /admin/vehicles`, `GET /admin/vehicles/:id` | admin | `findAllPlatform` / `findById` | **Raw DB** via `VEHICLE_STATUS_MAP` |
| `PATCH .../vehicles/:vehicleId/status` | `updateVehicleStatus` | guarded write | Only `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` |
| `PATCH .../vehicles/:vehicleId` | `updateByOrg` | `update` | **Unguarded** — any `VehicleUpdateInput` |
| `PATCH /vehicles/:vehicleId` | `update` | `update` | **Unguarded** (global route) |

### 1.4 Backend — booking lifecycle writers

| File | Function | Op | Vehicle.status written | Booking.status |
|------|----------|-----|------------------------|----------------|
| `bookings.service.ts` | `create` | write | **none** | `PENDING` / `CONFIRMED` |
| `bookings.service.ts` | `update` | write | **none** | may change booking status |
| `bookings.service.ts` | `cancel` | write | `AVAILABLE` (if not maintenance) | `CANCELLED` |
| `bookings.service.ts` | `markNoShow` | write | `AVAILABLE` (if not maintenance) | `NO_SHOW` |
| `bookings-handover.service.ts` | `createHandover` PICKUP | write | `RENTED` | `CONFIRMED` → `ACTIVE` |
| `bookings-handover.service.ts` | `createHandover` RETURN | write | `AVAILABLE` (if no other ACTIVE) | `ACTIVE` → `COMPLETED` |
| `booking-conflict.util.ts` | `BLOCKING_BOOKING_STATUSES` | filter | — | Overlap gate: `PENDING`, `CONFIRMED`, `ACTIVE` |
| `booking-conflict.util.ts` | `buildOverlapWhere` | filter | — | Half-open interval overlap |

### 1.5 Backend — other status readers/writers

| File | Function | Op | Status source | Note |
|------|----------|-----|---------------|------|
| `workflow-action-executor.service.ts` | `execVehicleStatusUpdate` | **write** | workflow | Can write **any** enum incl. `RENTED`/`RESERVED` |
| `vehicle-status.util.ts` | `normalizeVehicleStatusForPrisma` | normalize | UI labels → enum | `Active Rented` → `RENTED`, `Reserviert` → `RESERVED` |
| `organizations.service.ts` | `getOrganizationStats` | **count** | **raw DB** `groupBy status` | `available`, `rented`, `reserved` — not booking-derived |
| `stations.service.ts` | `getStationMetrics` | count | raw DB | `AVAILABLE` / `RENTED` at station |
| `stations.service.ts` | `getStationFleet` | read | raw DB | No derivation |
| `rental-health.service.ts` | `isRentalBlocked` | gate | health modules | Blocks **booking create**, not fleet tab |
| `device-connection-read-model.ts` | `buildDeviceConnectionSummary` | derive | `activeBookingId` from ACTIVE/CONFIRMED now-window | `rentalRelevant` flag |
| `vehicle-cleaning-task.service.ts` | `resolveCleaningPriority` | read | **nextBooking** query | Earliest future `PENDING`/`CONFIRMED` → task priority |
| `dimo-snapshot.scheduler.ts` | vehicle selection | filter | raw DB | Only `AVAILABLE` + `RENTED` |
| Business insights detectors (6×) | `detect` | filter/count | raw DB | Often includes `RESERVED` in `status IN (...)` |
| `billable-vehicles.service.ts` | billable set | filter | raw DB | Excludes `OUT_OF_SERVICE` |

### 1.6 Frontend — API ingest & store

| File | Function | Op | Status source | Note |
|------|----------|-----|---------------|------|
| `lib/api.ts` | `FleetMapVehicleResponse` | type | backend DTO | Defines all booking context fields |
| `lib/api.ts` | `api.vehicles.fleetMap` | read | `GET .../fleet-map` | Primary fleet source |
| `stores/useFleetMapStore.ts` | `normalizeStatus` | **re-derive** | substring heuristics | Unknown → **`Available`** |
| `stores/useFleetMapStore.ts` | `mapFleetVehicle` | map | API → `VehicleData` | **Drops** `reservedReturnAt`, `activeStartAt` |
| `FleetContext.tsx` | `FleetProvider` | read | store + 30s poll | `refresh()` → `fetchFleetMap` |
| `App.tsx` | `bumpBookingsVersion` | invalidate | — | Calls `refreshFleet()` after booking CRUD |

### 1.7 Frontend — status utilities & display layer

| File | Function | Op | Status source |
|------|----------|-----|---------------|
| `rental/lib/vehicle-status.ts` | `PRISMA_TO_FLEET_STATUS_KEY` | map (unused at runtime) | doc mirror of backend |
| `rental/lib/vehicle-status.ts` | `fleetStatusMatchesTab`, `countFleetStatusTab` | filter/count | `vehicle.status` string |
| `rental/data/vehicles.ts` | `FleetStatus`, `VehicleData` | type | canonical 4 rental labels |
| `rental/lib/fleetVisualState.ts` | `deriveRentalStatus` | **derive** | `status` + requires matching booking id |
| `rental/lib/fleetVisualState.ts` | `deriveFleetVisualState` | derive | status + health + telemetry |
| `rental/lib/fleetVehicleDisplay.ts` | `resolveFleetVehicleDisplayState` | display | operational + rental badges |
| `rental/lib/fleet-operator-panel.ts` | `vehicleMatchesCommandTab`, tab counts | filter/count | raw `vehicle.status`; Maintenance → Available tab |
| `rental/lib/booking-vehicle-preflight.ts` | `resolveBookingVehiclePreflight` | gate | status + health + offline |
| `rental/lib/task-operator.utils.ts` | `deriveNextBookingContext` | derive | `reservedPickupAt` only (future pickup) |

### 1.8 Frontend — dashboard runtime (layer C)

| File | Function | Op | Status source |
|------|----------|-----|---------------|
| `runtime/vehicleRuntimeStateBuilder.ts` | `mapOperationalStatus` | map | `VehicleData.status` → `operationalStatus` |
| `runtime/vehicleRuntimeStateBuilder.ts` | `buildVehicleRuntimeStates` | **derive** | status + health + cleaning + telemetry + tiles |
| `runtime/vehicleRuntimeStateBuilder.ts` | `isReadyToRent` | derive | `operationalStatus === available` + cleaners |
| `runtime/dashboardSliceBuilder.ts` | `buildDashboardRuntimeModel` | slice/count | runtime states |
| `runtime/dashboardSliceBuilder.ts` | `buildReadyToRentSlice` | count | **Ready for Renting** KPI |
| `runtime/dashboardSliceBuilder.ts` | `buildActiveRentedSlice` | count | **Today's Operations** KPI |
| `dashboard/useDashboardViewModel.ts` | status splits | filter | `v.status === 'Available'` etc. (parallel to runtime) |
| `dashboard/ControlKpiStrip.tsx` | KPI display | read | runtime slices |
| `dashboard/DashboardDrilldownDrawer.tsx` | drilldown | display | runtime rows |
| `dashboard/dashboardDrilldownRowDisplay.ts` | row VM | display | hides raw `operationalStatus` tokens |

### 1.9 Frontend — fleet surfaces

| File | Surface | Op |
|------|---------|-----|
| `FleetView.tsx` | Fleet page + map | read store + `buildFleetMapGeoJson` |
| `fleet-operator/FleetCommandPanel.tsx` | Tabs Available/Active/Reserved | filter/count |
| `fleet-operator/FleetOperatorRow.tsx` | Row badges | display |
| `fleet-operator/FleetCommandView.tsx` | Dashboard fleet card | same panel |
| `StatInlineDetail.tsx` | Legacy fleet popups | filter by `v.status` (**not wired in main DashboardView**) |
| `vehicle-detail/VehicleDetailHeader.tsx` | Detail header + status dropdown | display + **write** `Available`/`Manual Block`/`Maintenance` |

### 1.10 Frontend — operator & master

| File | Surface | Op |
|------|---------|-----|
| `operator/lib/operatorStatus.ts` | `deriveVehicleOperatorStatuses` | badge stack |
| `operator/hooks/useOperatorVehiclesData.ts` | list | reads `FleetContext` |
| `operator/views/OperatorVehiclesView.tsx` | operator fleet | display |
| `operator/views/OperatorTodayView.tsx` | today handovers | bookings API |
| `master/data/platform-data.ts` | `VehicleStatus` type | includes **`Blocked`** |
| `master/components/PlatformVehiclesView.tsx` | admin metrics | count raw `v.status` |
| `master/components/OrganizationDetailView.tsx` | org fleet table | display `v.status` |
| `master/App.tsx` | platform mapper | `operationalStatus` separate field |

---

## 2. All status write paths

| # | Trigger | File | Target | Values written | Guards |
|---|---------|------|--------|----------------|--------|
| W1 | Pickup handover | `bookings-handover.service.ts` | `Vehicle.status` | `RENTED` | Rejects if `IN_SERVICE`/`OUT_OF_SERVICE` |
| W2 | Return handover | `bookings-handover.service.ts` | `Vehicle.status` | `AVAILABLE` | Only if no other `ACTIVE` booking |
| W3 | Booking cancel | `bookings.service.ts` | `Vehicle.status` | `AVAILABLE` | `notIn: [IN_SERVICE, OUT_OF_SERVICE]` |
| W4 | No-show | `bookings.service.ts` | `Vehicle.status` | `AVAILABLE` | same as W3 |
| W5 | Workflow `vehicle.status.update` | `workflow-action-executor.service.ts` | `Vehicle.status` | any normalized enum | org-scoped vehicle lookup |
| W6 | Dedicated status PATCH | `vehicles.controller.ts` | `Vehicle.status` | `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` | **Rejects RENTED/RESERVED** |
| W7 | Generic vehicle PATCH | `vehicles.controller.ts` | `Vehicle.status` | **any** if in body | **No RENTED/RESERVED guard** |
| W8 | Vehicle create/register | `vehicles.service.ts` | `Vehicle.status` | default `AVAILABLE` | schema default |
| W9 | Booking create/update | `bookings.service.ts` | `Booking.status` only | `CONFIRMED` etc. | **Does not touch Vehicle.status** |
| W10 | Vehicle detail UI dropdown | `VehicleDetailHeader.tsx` | via API PATCH | maps to maintenance/block | separate from booking derivation |

**Not found in production paths:** automatic write of `VehicleStatus.RESERVED` on booking create. Reserved fleet label is **read-derived only**.

---

## 3. All status derivation paths

| # | Path | Input | Output | Location |
|---|------|-------|--------|----------|
| D1 | **Canonical fleet** | bookings + `Vehicle.status` + telemetry | `status`, booking DTO, maintenance ctx | `deriveFleetStatusContext` |
| D2 | Booking context batch | `Booking` rows | `activeBookingId`, `reservedBookingId`, … | `buildBookingContextMap` |
| D3 | Ghost demotion | DB `RENTED`/`RESERVED` without booking | `Available` + warn log | `deriveFleetStatusContext` |
| D4 | Unknown enum key | invalid `Vehicle.status` | `Available` | `RENTAL_STATUS_MAP[…] ?? 'Available'` |
| D5 | Fleet-map store ingest | API `status` string | `FleetStatus` | `normalizeStatus` (heuristic) |
| D6 | Visual rental layer | `status` + booking ids | `active_rented` / `reserved` / `available` | `deriveRentalStatus` — **demotes** Reserved/Active without id |
| D7 | Visual fleet state | vehicle + health + telemetry | `ready`/`active`/`reserved`/`blocked`/… | `deriveFleetVisualState` |
| D8 | Display state | visual + health | primary/rental badges | `resolveFleetVehicleDisplayState` |
| D9 | Dashboard runtime | `VehicleData.status` | `operationalStatus` | `mapOperationalStatus` |
| D10 | Ready to rent | runtime reasons + cleaning | `rentalReadiness`, `isReadyToRent` | `buildVehicleRuntimeStates` |
| D11 | Booking runtime overlay | pickup/return tiles + status | `bookingState` | `deriveBookingState` |
| D12 | Next booking (tasks UI) | `reservedPickupAt` future | `VehicleNextBookingContext` | `deriveNextBookingContext` |
| D13 | Next booking (cleaning worker) | Prisma earliest future booking | priority tier | `vehicle-cleaning-task.service.ts` |
| D14 | Device connection | active booking now | `activeBookingId`, `rentalRelevant` | `device-connection-read-model.ts` |
| D15 | Master platform map | raw DB | `Available`/`Active Rented`/…/ `Blocked` | `VEHICLE_STATUS_MAP` |

---

## 4. API endpoints and status source

| Endpoint | Response status field | Source | Booking fields | Cached |
|----------|----------------------|--------|----------------|--------|
| `GET /organizations/:orgId/fleet-map` | `status` | **D1 booking-derived** | full ctx incl. `reservedReturnAt`, `activeStartAt` | Redis 5s |
| `GET /organizations/:orgId/vehicles` | `status` | **D1 booking-derived** | full ctx | no |
| `GET /organizations/:orgId/vehicles/:id` | `status` | **D1** (org `findOne`) | full ctx | no |
| `GET /admin/vehicles` | `status` | **raw DB** → `VEHICLE_STATUS_MAP` | none | no |
| `GET /admin/vehicles/:id` | `status` + `operationalStatus: ''` | raw DB | none | no |
| `GET /organizations/:orgId/stations/.../fleet` | `status` | raw DB | none | no |
| Booking detail APIs | `vehicleStatus` on vehicle block | **raw DB** | booking status separate | no |
| `GET /organizations/:orgId/rental-health/...` | `rental_blocked` | health modules | not fleet occupancy | no |
| Org stats / master dashboards | counts | **raw DB groupBy** | — | no |

---

## 5. All frontend consumers

| Consumer | Reads | Field used | Derives locally? |
|----------|-------|------------|------------------|
| Fleet Command tabs | `FleetContext` | `vehicle.status` | tab mapping only |
| Fleet map markers | store + geojson | `deriveFleetVisualState` | yes (visual) |
| Fleet operator rows | store | `resolveFleetVehicleDisplayState` | yes |
| Dashboard KPI strip | `dashboardRuntime.slices` | `operationalStatus`, `isReadyToRent` | yes (layer C) |
| Dashboard drilldown drawer | runtime slices | display VM | yes |
| New booking vehicle picker | `FleetContext` | `status` + preflight | yes |
| Vehicle detail header | vehicle + display | dropdown ≠ fleet tab | yes |
| Vehicle tasks / cleaning | `VehicleData` | `reservedPickupAt` | `deriveNextBookingContext` |
| Operator vehicles list | `FleetContext` | badges via `operatorStatus` | yes |
| Master platform vehicles | platform API | `status`, `operationalStatus` | count only |
| Business insights UI | insights API | vehicle ids from detectors | indirect (DB status) |
| Legacy `StatInlineDetail` | props vehicles | `v.status === 'Reserved'` | filter only (deprecated path) |

---

## 6. Cache and invalidation paths

| Layer | Key / mechanism | TTL | Contents | Invalidation |
|-------|-----------------|-----|----------|--------------|
| Redis | `fleet-map:{orgId}:v1` | **5 seconds** | Full derived fleet-map DTO array incl. `status`, booking ids | **TTL only** — no explicit bust on booking/handover |
| `useFleetMapStore` | in-memory Zustand | until refetch | `VehicleData[]` after `mapFleetVehicle` | `fetchFleetMap`, 30s interval, visibility refocus |
| `FleetContext.refresh` | calls store fetch | on demand | same | `App.bumpBookingsVersion` after booking CRUD; manual refresh |
| `useDashboardViewModel` | composes runtime | per render | `VehicleRuntimeState[]` | recomputed when `fleetVehicles` or tiles change |
| Rental health map | separate hook | own poll | `healthMap` | independent of status derivation |

**Risk:** 5s Redis cache can serve stale derived status briefly after handover; frontend also polls every 30s unless `refreshFleet()` is called.

---

## 7. Conflicts: raw DB vs derived status

| Conflict | Symptom | Where |
|----------|---------|-------|
| **Dual truth** | Org admin shows `reserved: N` from DB but fleet UI shows Reserved from bookings | `organizations.service.ts` vs `deriveFleetStatusContext` |
| **DB RENTED, UI Available** | Ghost guard when booking completed/cancelled without RETURN write | `deriveFleetStatusContext` |
| **DB AVAILABLE, UI Reserved** | Normal case: CONFIRMED future booking | `buildBookingContextMap` (by design since V4.6.70) |
| **DB RESERVED never set** | Enum exists but booking flow never writes it; only workflows/PATCH can | schema vs handover |
| **Reserved without `reservedBookingId` in UI** | `deriveRentalStatus` treats as `available` for visual layer | `fleetVisualState.ts` |
| **`normalizeStatus` → Available** | Backend sends unknown label (e.g. `Blocked` on rental surface) | `useFleetMapStore.ts` |
| **Maintenance in Available tab** | `resolveOperatorTabForVehicle` default branch | `fleet-operator-panel.ts` |
| **Ready KPI ≠ Available tab** | `isReadyToRent` stricter than `status === Available` | runtime builder |
| **Today's Ops ≠ Active tab** | slice includes `bookingState` return overdue/due soon | `dashboardSliceBuilder.ts` |
| **Booking detail `vehicleStatus`** | raw DB while fleet list shows derived | `bookings.service.ts` detail mapper |
| **Generic PATCH bypass** | Can set `RENTED`/`RESERVED` while dedicated endpoint forbids | two PATCH routes |
| **Cancel → AVAILABLE** | DB flipped even when another future CONFIRMED booking exists | `bookings.service.ts` — UI still Reserved via D2 |
| **Lost API fields** | `reservedReturnAt`, `activeStartAt` in DTO but not in store map | Reserved duration / active time bar broken |

---

## 8. Findings (P0 / P1 / P2)

### P0 — correctness / operator trust

| ID | Finding | Evidence |
|----|---------|----------|
| P0-1 | **Early Reserved is by design, not accident** — `CONFIRMED`/`PENDING` + `endDate >= now` triggers Reserved **without** `startDate` gate | `buildBookingContextMap` L315–318, L425–444; V4.6.70 ChangesView |
| P0-2 | **Two fleet truths** — rental UI uses booking-derived `status`; org stats, station metrics, insights use **raw DB** | `organizations.service.ts` L599–603 vs `deriveFleetStatusContext` |
| P0-3 | **`buildBookingContextMap` catch → `[]`** — DB error silently drops all reserved/active context fleet-wide | `vehicles.service.ts` L335–348 |
| P0-4 | **`mapFleetVehicle` drops `reservedReturnAt` and `activeStartAt`** — API sends them; UI type supports them; store omits | `useFleetMapStore.ts` L215–226 vs `api.ts` L6284–6291 |

### P1 — consistency / drift risk

| ID | Finding | Evidence |
|----|---------|----------|
| P1-1 | **`normalizeStatus` fallback unknown → `Available`** | `useFleetMapStore.ts` L77–82 |
| P1-2 | **Maintenance vehicles listed under Available tab** (no Maintenance tab in Fleet Command) | `fleet-operator-panel.ts` `resolveOperatorTabForVehicle` |
| P1-3 | **Unguarded `PATCH .../vehicles/:id`** can write `RENTED`/`RESERVED` | `vehicles.controller.ts` L183–189 vs L241–258 |
| P1-4 | **Workflow can write `RENTED`/`RESERVED`** bypassing handover semantics | `workflow-action-executor.service.ts` L189–192 |
| P1-5 | **Dashboard KPI counts ≠ Fleet tab counts** (Ready for Renting, Today's Operations vs Available/Active/Reserved tabs) | `dashboardSliceBuilder.ts`, `ControlKpiStrip.tsx` |
| P1-6 | **`deriveRentalStatus` demotes** Reserved/Active Rented if booking id missing — can disagree with backend `status` string | `fleetVisualState.ts` L159–171 |
| P1-7 | **Booking detail exposes raw `vehicleStatus`** while fleet endpoints expose derived status | bookings detail mapper |
| P1-8 | **`VehicleStatus.RESERVED` in DB** rarely synchronized with booking-derived Reserved | no write on booking create |

### P2 — cleanup / tech debt

| ID | Finding | Evidence |
|----|---------|----------|
| P2-1 | `PRISMA_TO_FLEET_STATUS_KEY` documented but **not imported** by runtime UI | `vehicle-status.ts` |
| P2-2 | `operationalStatus` on master vehicles is **empty string** placeholder | `mapToRegisteredVehicle` L612 |
| P2-3 | `buildFleetStateTabs` / `StatInlineDetail` fleet popups — **deprecated / unwired** but still in repo | ChangesView V4.8.x |
| P2-4 | `fleetStateBuilder` lanes deprecated vs runtime slices | `fleetStateBuilder.ts` |
| P2-5 | Redis fleet-map cache has **no event invalidation** (only 5s TTL) | `getFleetMapData` |
| P2-6 | `availableVehicles` / `reservedVehicles` / `activeRentedVehicles` passed to runtime builder but **unused inside** `buildVehicleRuntimeStates` | `vehicleRuntimeStateBuilder.ts` input interface |
| P2-7 | Controller comment says “CONFIRMED with **future start** show as Reserved” — encodes early Reserved intent | `vehicles.controller.ts` L225–226 |

---

## 9. Files likely to change in later prompts (2–43)

### Backend (high probability)

- `backend/src/modules/vehicles/vehicles.service.ts` — `buildBookingContextMap`, `deriveFleetStatusContext`, maps, cache
- `backend/src/modules/bookings/bookings.service.ts` — cancel/no-show vehicle release semantics
- `backend/src/modules/bookings/bookings-handover.service.ts` — pickup/return vehicle writes
- `backend/src/modules/bookings/booking-conflict.util.ts` — if “booked but Available” split from overlap
- `backend/src/modules/vehicles/vehicles.controller.ts` — PATCH guard alignment
- `backend/src/modules/organizations/organizations.service.ts` — count alignment
- `backend/src/modules/workflows/workflow-action-executor.service.ts` — restrict RENTED/RESERVED writes
- `backend/src/modules/vehicles/vehicles.service.spec.ts` — precedence/regression tests

### Frontend (high probability)

- `frontend/src/rental/stores/useFleetMapStore.ts` — `normalizeStatus`, `mapFleetVehicle` field parity
- `frontend/src/rental/lib/fleetVisualState.ts` — `deriveRentalStatus` alignment
- `frontend/src/rental/lib/fleet-operator-panel.ts` — tab bucketing / Maintenance tab
- `frontend/src/rental/lib/vehicle-status.ts` — single mapping source
- `frontend/src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.ts` — operational vs fleet status contract
- `frontend/src/rental/components/dashboard/runtime/dashboardSliceBuilder.ts` — KPI definitions
- `frontend/src/rental/components/fleet-operator/FleetCommandPanel.tsx`
- `frontend/src/rental/components/vehicle-detail/VehicleDetailHeader.tsx`
- `frontend/src/lib/api.ts` — DTO documentation / consistency

### Docs / architecture

- `docs/audits/vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`

---

## Appendix A — `activeBookingId` / `reservedBookingId` / `nextBooking` / `rentalReadiness` / `operationalStatus`

| Field | Set where | Read where | Semantics |
|-------|-----------|------------|-----------|
| `activeBookingId` | `buildBookingContextMap` (ACTIVE booking) | fleet API, store, visual layer, device connection | In-flight rental |
| `reservedBookingId` | `buildBookingContextMap` (PENDING/CONFIRMED, `endDate >= now`) | same | Upcoming / not yet picked up |
| `nextBooking` | **Backend:** `vehicle-cleaning-task.service.ts` local query; **Frontend:** `deriveNextBookingContext` from `reservedPickupAt` | `VehicleTasksView`, `VehicleTaskActionCenter` | Task priority / UI hint — **not** a fleet API field |
| `rentalReadiness` | `buildVehicleRuntimeStates` | dashboard runtime, action queue adapters | `ready` / `not_ready` / `blocked` — stricter than tab status |
| `operationalStatus` | `mapOperationalStatus(vehicle.status)` + runtime overrides | dashboard slices, drilldown | `available` / `reserved` / `active_rented` / `maintenance` / `unavailable` / `unknown` |
| `operationalStatus` (master) | hardcoded `''` in `mapToRegisteredVehicle` | `PlatformVehiclesView` | **Legacy admin field**, unrelated to rental runtime |

---

## Appendix B — Explicit search targets (requested)

| Pattern | Hits (summary) |
|---------|----------------|
| unknown status → Available | `deriveFleetStatusContext`, `normalizeStatus`, `mapToRegisteredVehicle`, `mapOperationalStatus` default `unknown` |
| missing booking context → Available | ghost guard; `deriveRentalStatus` without ids; empty `buildBookingContextMap` |
| same field name raw + derived | API `status` is derived; DB `Vehicle.status` separate; booking detail `vehicleStatus` raw |
| UI-side derivation | `fleetVisualState`, `fleetVehicleDisplay`, `vehicleRuntimeStateBuilder`, `normalizeStatus` |
| direct RESERVED/RENTED writes | handover PICKUP → RENTED; workflow executor; unguarded PATCH |
| catch → `[]` on bookings | `buildBookingContextMap`, `fetchPickupOdometerMap`, `buildTripStateMap` |
| lost mapping fields | `reservedReturnAt`, `activeStartAt` not in `mapFleetVehicle` |
| divergent counts | org stats DB vs fleet tabs derived; KPI slices vs tabs; master Blocked vs rental Maintenance |

---

## Central cause of early Reserved (summary)

Since **V4.6.70**, fleet occupancy labels for the rental UI are **derived from open bookings at read time**, not from “pickup day only” rules. `buildBookingContextMap` assigns the **Reserved** slot to the earliest `PENDING`/`CONFIRMED` booking with `endDate >= now`, **regardless of whether `startDate` is in the future**. That matches the controller comment (“CONFIRMED with future start show as Reserved”) and the original 2026-04-18 user request to show vehicles with bookings as Reserved in fleet status — but it **conflicts** with the 2026-07 operator expectation that Reserved should apply only on pickup day while the vehicle remains Available until then.

Overlap blocking (`BLOCKING_BOOKING_STATUSES`) is a **separate** mechanism: the calendar still blocks the booked window even if fleet-tab semantics change later.

---

## Open questions (for Prompt 2+)

1. **Product contract:** Should `Reserved` mean (a) any confirmed future booking, (b) only pickup day / `startDate <= end of org today`, or (c) something else (e.g. within N hours)?
2. **DB column `Vehicle.status`:** Should `RESERVED`/`RENTED` remain writeable at all, or become derived-only / deprecated?
3. **Overlap vs display:** If fleet shows `Available` before pickup, should short-gap bookings still block the calendar for the reserved window?
4. **Org/station KPI alignment:** Should master/org vehicle counts use booking-derived buckets instead of raw `groupBy status`?
5. **Maintenance bucket:** Should Fleet Command get a fourth tab, or should maintenance vehicles leave the Available tab?
6. **Cancel/no-show DB write:** When canceling one booking but another future CONFIRMED exists, should `Vehicle.status` stay unchanged (currently forced to `AVAILABLE`)?
7. **Field parity:** Confirm `reservedReturnAt` / `activeStartAt` must flow through `mapFleetVehicle` for Reserved/Active cards — intentional omission or bug?
8. **Prod verification for KS FH 660E:** Need live DB rows (booking status, dates, handover protocols, `Vehicle.status`) — not available in this agent environment.

---

## Changes / Architektur

| Document | Updated |
|----------|---------|
| `docs/audits/vehicle-operational-status-inventory.md` | **Created** (this file) |
| `ChangesView` | Not updated (read-only inventory prompt) |
| `ArchitekturView` | Not updated (read-only inventory prompt) |

---

*End of Prompt 1/43 inventory.*
