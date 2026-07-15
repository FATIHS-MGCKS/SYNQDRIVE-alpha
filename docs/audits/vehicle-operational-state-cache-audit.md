# Vehicle Operational State — Cache Audit (Prompt 23/43)

**Date:** 2026-07-15  
**Scope:** All caches affecting vehicle operational status, booking context, fleet map, or rental dashboard  
**Mode:** Read-only audit — no code changes  
**Related:** `docs/audits/vehicle-operational-status-inventory.md`, `docs/architecture/vehicle-operational-state-legacy-endpoints.md`

---

## Executive summary

Operational status for **Available / Reserved / Active Rented** flows through a **stack of caches** with no unified invalidation bus. The highest-risk layer is **Redis fleet-map** (`fleet-map:{orgId}:v1`, TTL **5 s**) combined with the **frontend fleet poll** (30 s): booking/handover writes do **not** bust the Redis key, so even an immediate `refreshFleet()` can return stale operational state for up to **5 s**.

| Layer | Affects A/R/AR? | Worst-case staleness (no manual refresh) | Event invalidation |
|-------|-----------------|------------------------------------------|-------------------|
| Redis fleet-map | **Yes** | 5 s (+ up to 30 s frontend poll) | **None** (TTL only) |
| Zustand `useFleetMapStore` | **Yes** | 30 s | Partial (booking/handover hooks) |
| `useFleetHealthMap` | Indirect (readiness/KPI) | Until fleet ids change or manual `reloadHealth` | **Not** on booking/handover (rental shell) |
| Dashboard insights (Postgres) | Indirect (alerts, overdue) | Up to **30 min** cron + detector `expiresAt` | Debounced eval **not wired** from bookings |
| `useDashboardViewModel` memo | **Yes** (KPI slices) | Until `fleetVehicles` / `dashboardNow` change | `dashboardNow` only on manual refresh |
| VehicleLatestState (DB) | Telemetry only | ~30 s DIMO snapshot poll | Worker cadence |
| React Query | — | **Not used** on fleet path | — |
| Service Worker / PWA | — | **Not present** | — |
| WebSocket / SSE | — | **Not used** for fleet ops | — |

**Critical gap:** `BusinessInsightsTriggerService.onBookingChange` / `onVehicleChange` exist but are **not called** from `BookingsService` or `VehiclesService`; only driving-assessment degradation and manual admin triggers enqueue debounced notification evaluation.

---

## Methodology

### Repository searches

```bash
rg 'fleet-map:|FLEET_MAP_CACHE|getFleetMapData|refreshFleet|bumpBookingsVersion' --glob '*.{ts,tsx}' backend frontend
rg 'useFleetMapStore|FleetContext|DashboardInsightsContext|useFleetHealthMap|useDashboardViewModel' --glob '*.{ts,tsx}' frontend
rg 'dashboardInsight|expiresAt|refreshIntervalMin|scheduleDebouncedEvaluation' --glob '*.ts' backend
rg 'notification:eval:|PENDING_EVENTS_KEY|FOLLOW_UP_KEY' --glob '*.ts' backend
rg '@tanstack/react-query|useQuery|QueryClient' --glob '*.{ts,tsx}' frontend
rg 'serviceWorker|workbox|vite-plugin-pwa' --glob '*.{ts,tsx,js}' frontend
rg 'onBookingChange|onVehicleChange|BusinessInsightsTrigger' --glob '*.ts' backend
```

### Key files inspected

| Area | Files |
|------|-------|
| Backend fleet-map Redis | `backend/src/modules/vehicles/vehicles.service.ts` |
| Backend insights persistence | `backend/src/modules/business-insights/dashboard-insights.repository.ts`, `business-insights-scheduler.service.ts`, `business-insights-trigger.service.ts` |
| Backend notification debounce | `backend/src/modules/notifications/runtime/notification-evaluation.service.ts`, `notification-evaluation-queue.util.ts`, `notification-evaluation.config.ts` |
| Backend telemetry snapshot | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts`, `dimo-snapshot.processor.ts` |
| Backend DIMO JWT | `backend/src/modules/dimo/dimo-auth.service.ts` |
| Frontend fleet store | `frontend/src/rental/stores/useFleetMapStore.ts`, `FleetContext.tsx` |
| Frontend dashboard | `frontend/src/rental/DashboardInsightsContext.tsx`, `components/dashboard/useDashboardViewModel.ts` |
| Frontend refresh wiring | `frontend/src/rental/App.tsx`, `operator/components/OperatorHandoverRefreshBridge.tsx`, `operator/hooks/useOperatorBookingMutations.ts` |
| Frontend health / live | `frontend/src/rental/hooks/useVehicleHealth.ts`, `hooks/useLiveVehicleTelemetry.ts`, `stores/useVehicleLiveMapStore.ts`, `hooks/useFleetObdPlugIndex.ts` |

---

## Cache inventory (per layer)

### 1. Redis — Fleet Map read model

| Field | Value |
|-------|-------|
| **Key** | `fleet-map:{organizationId}:v1` |
| **Scope** | Per organization (all fleet-map vehicles, max 500) |
| **TTL** | **5 seconds** (`FLEET_MAP_CACHE_TTL_SECONDS`) |
| **Producer** | `VehiclesService.getFleetMapData()` — on cache miss: Postgres `vehicle.findMany` + `loadFleetOperationalContext` + `mapToFleetMapVehicle`, then `redis.set(..., 'EX', 5)` |
| **Consumers** | `GET /api/v1/organizations/:orgId/fleet-map` → rental `api.vehicles.fleetMap` → `useFleetMapStore.fetchFleetMap` → `FleetContext`, Dashboard, FleetView, Operator booking picker, NewBooking availability |
| **Invalidation** | **TTL expiry only** — no `DEL`/`invalidate` on booking create/update/cancel, handover pickup/return, `Vehicle.status` PATCH, or maintenance/hard-block writes |
| **Stale window** | **0–5 s** after any write that changes operational projection; stacks with frontend 30 s poll → **up to ~35 s** if no explicit `refreshFleet()` |
| **Error behavior** | Read failure: debug log, fall through to Postgres rebuild. Write failure: debug log, response still returned uncached. Fleet-map must not 500 on Redis outage. |
| **Risk A/R/AR** | **High** — canonical `status`, `operationalState`, `bookingContext` served from stale JSON until TTL |

---

### 2. Backend — Vehicle list (`GET /vehicles`)

| Field | Value |
|-------|-------|
| **Key** | None (no cache) |
| **Scope** | Per request, paginated org vehicles |
| **TTL** | N/A |
| **Producer** | `VehiclesService.findByOrganization()` — fresh DB + `loadFleetOperationalContext` per request |
| **Consumers** | Settings station assignment, invoice enrichment, master surfaces; **not** primary rental dashboard fleet source (fleet-map is) |
| **Invalidation** | N/A |
| **Stale window** | None at HTTP layer |
| **Error behavior** | Standard Nest/Prisma errors |
| **Risk A/R/AR** | **Low** for list endpoint itself; divergence risk if UI mixes `/vehicles` and `/fleet-map` |

---

### 3. Backend — Vehicle detail (`GET /vehicles/:id`)

| Field | Value |
|-------|-------|
| **Key** | None |
| **Scope** | Single vehicle per request |
| **TTL** | N/A |
| **Producer** | `VehiclesService.findOne()` |
| **Consumers** | Vehicle detail pages, booking detail vehicle block |
| **Invalidation** | N/A |
| **Stale window** | None |
| **Error behavior** | 404 if missing |
| **Risk A/R/AR** | **Low** per fetch; detail can disagree with fleet-map for up to Redis TTL + frontend poll |

---

### 4. Postgres — Dashboard insights (`dashboardInsight` rows)

| Field | Value |
|-------|-------|
| **Key** | DB rows keyed by `organizationId` + `dedupeKey`; served via `DashboardInsightsRepository.getActiveInsights` |
| **Scope** | Per organization; max **4** visible insights (policy `maxVisibleInsights`) |
| **TTL** | Per-insight `expiresAt` (detector-specific, e.g. booking `endDate` / `startDate`); repository marks `isActive=false` when `expiresAt <= now`. **Stale flag** on API: `lastRunAt` older than `2 × refreshIntervalMin` (default **60 min**). |
| **Producer** | `BusinessInsightsService.runForOrganization()` via `NotificationEvaluationService.executeRun` (scheduled cron `2,32 * * * *` ≈ every **30 min**, boot stagger, debounced jobs). Full replace: deactivate all active → insert new candidates. |
| **Consumers** | `GET /organizations/:orgId/dashboard-insights` → `DashboardInsightsContext` (poll **5 min**) → BusinessInsightsBox, `useVehicleHealthAlerts`, dashboard action queue supplements |
| **Invalidation** | New run replaces active set; `expireStaleInsights` on read. **Not** synchronously tied to booking/handover writes (`onBookingChange` unwired). |
| **Stale window** | **0–30 min** until next scheduled eval; frontend may show same payload for **5 min** between polls. Pickup-overdue / tight-handover detectors use booking timestamps — can lag real ops. |
| **Error behavior** | `error` field on response from last failed run; read path does not recalculate |
| **Risk A/R/AR** | **Medium (indirect)** — does not drive primary fleet badge, but affects overdue pickup alerts, action queue, and dashboard trust signals that operators use alongside fleet status |

---

### 5. Redis — Notification evaluation debounce

| Field | Value |
|-------|-------|
| **Keys** | `notification:eval:pending:{orgId}` (RPUSH event sources), `notification:eval:followup:{orgId}` (PX ~240 s), `notification:eval:lock:{orgId}` (distributed lock), BullMQ job id `notification-evaluation:{orgId}:{triggerClass}` |
| **Scope** | Per organization |
| **TTL** | Debounce delay **120 s** default (`NOTIFICATION_EVALUATION_DEBOUNCE_MS`); lock TTL **300 s** with heartbeat |
| **Producer** | `NotificationEvaluationService.scheduleDebouncedEvaluation`, `scheduleScheduledEvaluation`; `BusinessInsightsTriggerService.requestDebouncedRerun` |
| **Consumers** | BullMQ `notification.evaluation` queue → `executeRun` → `BusinessInsightsService.runForOrganization` |
| **Invalidation** | Pending list drained on job run; follow-up flag consumed after run |
| **Stale window** | Up to **120 s** debounce + job duration before insights refresh |
| **Error behavior** | Redis RPUSH failure: log error, no eval scheduled. Lock contention: skip + schedule follow-up. |
| **Risk A/R/AR** | **Low direct** — indirect via insights/notifications; **booking/vehicle lifecycle does not enqueue debounced eval today** (except driving-assessment path) |

---

### 6. In-memory — DIMO auth JWT (Redis-backed)

| Field | Value |
|-------|-------|
| **Key** | Developer + per-vehicle JWT keys in Redis and process memory (`dimo-auth.service.ts`) |
| **Scope** | Global developer token; per `tokenId` vehicle JWT |
| **TTL** | Config `DIMO_VEHICLE_JWT_TTL_SECONDS` (default **300 s**) |
| **Producer** | `DimoAuthService.fetchAndCache*` |
| **Consumers** | Live GPS proxy, telemetry enrichment in `getVehicleWithTelemetry` |
| **Invalidation** | TTL; explicit refresh timers |
| **Stale window** | JWT lifetime |
| **Error behavior** | On DIMO fetch failure in fleet telemetry path: **keep cached lat/lng** (`// Keep cached values; DIMO fetch failed`) |
| **Risk A/R/AR** | **None** for booking status; **low** for map position freshness |

---

### 7. In-memory — Driving assessment org LTE baseline

| Field | Value |
|-------|-------|
| **Key** | `{orgId}:{excludeVehicleId}` in `DrivingAssessmentDeviceQualityService.orgBaselineCache` |
| **Scope** | Per org per excluded vehicle |
| **TTL** | **60 minutes** (`BASELINE_CACHE_TTL_MS`) |
| **Producer** | `getOrgLteR1Baseline` |
| **Consumers** | `DRIVING_ASSESSMENT_DEVICE_QUALITY` insight detector |
| **Invalidation** | TTL only |
| **Stale window** | Up to 60 min |
| **Error behavior** | Falls back to null baseline |
| **Risk A/R/AR** | **None** |

---

### 8. DB — `VehicleLatestState` (telemetry snapshot)

| Field | Value |
|-------|-------|
| **Key** | Row per `vehicleId` |
| **Scope** | Telemetry fields embedded in fleet-map DTO (`odometerKm`, `fuelPercent`, `evSoc`, lat/lng from snapshot) |
| **TTL** | Updated by DIMO snapshot worker every **~30 s** (`dimo-snapshot.scheduler.ts` `@Interval(30000)`) |
| **Producer** | `DimoSnapshotProcessor` / snapshot polling pipeline |
| **Consumers** | `getFleetMapData`, vehicle telemetry endpoints, fleet connectivity |
| **Invalidation** | Worker overwrite on successful poll |
| **Stale window** | **~30 s** normal; longer if poll fails or vehicle offline |
| **Error behavior** | Last good snapshot retained |
| **Risk A/R/AR** | **None** for A/R/AR labels; affects telemetry freshness overlays on fleet map |

---

### 9. Zustand — `useFleetMapStore`

| Field | Value |
|-------|-------|
| **Key** | In-memory store fields: `vehicles[]`, `filters`, `selectedVehicleId`, `lastFetchedAt` |
| **Scope** | Single SPA session, shared across FleetProvider consumers |
| **TTL** | Implicit **30 s** poll (`FLEET_MAP_REFRESH_MS`); visibility-gated (`document.visibilityState === 'visible'`) |
| **Producer** | `fetchFleetMap(orgId)` → `api.vehicles.fleetMap` → `mapFleetVehicle` (normalizes `status` via `normalizeFleetOperationalStatus`) |
| **Consumers** | `FleetContext`, Dashboard (`useDashboardViewModel`), FleetView, MapboxMap, NewBooking vehicle list, Operator shell |
| **Invalidation** | `fetchFleetMap` on interval, `FleetContext.refresh()`, `App.tsx` `bumpBookingsVersion` / `handover:completed`, Operator mutations, cleaning status PATCH success |
| **Stale window** | **0–30 s** without event refresh; **0–5 s** after event refresh if Redis cache hit |
| **Error behavior** | Sets `error` string; **does not clear** existing `vehicles[]` on failed fetch |
| **Risk A/R/AR** | **High** — primary rental fleet truth for KPIs and map tones |

---

### 10. React context — `FleetContext` (polling orchestration)

| Field | Value |
|-------|-------|
| **Key** | Wraps `useFleetMapStore` + `useFleetHealthMap` |
| **Scope** | Rental app subtree under `FleetProvider` |
| **TTL** | Fleet poll **30 s**; health reload when `fleetVehicleIds` changes |
| **Producer** | `fetchFleetMap`, `useFleetHealthMap.load` |
| **Consumers** | `useFleetVehicles()` across rental + operator |
| **Invalidation** | Same as fleet store; `reloadHealth()` manual |
| **Stale window** | Fleet: as §9; Health: until ids change or manual reload |
| **Error behavior** | Exposes `healthError`; fleet error from store |
| **Risk A/R/AR** | **High** (fleet); **medium** (health blocking readiness KPIs) |

---

### 11. React state — `useFleetHealthMap`

| Field | Value |
|-------|-------|
| **Key** | `Map<vehicleId, VehicleHealthResponse>` in component state |
| **Scope** | Per `orgId` + sorted `vehicleIds` key |
| **TTL** | No timer — refetch on `orgId` or `idsKey` change only |
| **Producer** | `GET .../rental-health/fleet?vehicleIds=...` |
| **Consumers** | Fleet health badges, `useEffectiveHealth`, dashboard `healthMap` input to `buildDashboardRuntimeModel` |
| **Invalidation** | `reloadHealth()` — called from Operator handover bridge, FleetCondition refresh, HealthErrorsView, tire measure; **not** from rental `App.tsx` handover listener |
| **Stale window** | **Unbounded** across booking/handover if vehicle id set unchanged |
| **Error behavior** | Sets error string; may keep prior map |
| **Risk A/R/AR** | **Medium** — `rental_blocked` / readiness can disagree with fresh fleet operational status |

---

### 12. React context — `DashboardInsightsContext`

| Field | Value |
|-------|-------|
| **Key** | `response: InsightsResponse \| null` |
| **Scope** | Per org, rental app |
| **TTL** | Poll **5 minutes** (`REFRESH_MS = 5 * 60_000`) |
| **Producer** | `api.dashboardInsights.get(orgId)` |
| **Consumers** | BusinessInsightsBox, alert derivations, dashboard action queue |
| **Invalidation** | Interval + `refresh()`; `refreshAll()` on dashboard manual sync |
| **Stale window** | **0–5 min** frontend; backend insight age up to **~30 min** |
| **Error behavior** | `error: true`, keeps prior `response` null or last good |
| **Risk A/R/AR** | **Low direct**; pickup-overdue insights can lag after confirm/cancel |

---

### 13. `useMemo` — Dashboard runtime model

| Field | Value |
|-------|-------|
| **Key** | `dashboardRuntime` from `buildDashboardRuntimeModel(...)` |
| **Scope** | Per dashboard view model instance |
| **TTL** | Recomputes when deps change: `filteredFleetVehicles`, booking slices, `insights`, `healthMap`, **`dashboardNow`** |
| **Producer** | `useDashboardViewModel` |
| **Consumers** | ControlKpiStrip, FleetStateBoard, drilldown drawer, action queue, business pulse |
| **Invalidation** | Automatic on fleet/insights/health deps; `dashboardNow` bumped only in `refreshAll()` |
| **Stale window** | Time-based slices (due-soon, overdue) can use stale `dashboardNow` until manual refresh — **not** updated on handover |
| **Error behavior** | Derived from upstream loading/error flags |
| **Risk A/R/AR** | **High** for KPI counts (Ready / Active Rented / Reserved groupings) — entirely driven by cached fleet store |

---

### 14. Zustand — `useVehicleLiveMapStore`

| Field | Value |
|-------|-------|
| **Key** | `boundVehicleId`, `boundOrgId`, telemetry snapshot, GPS history |
| **Scope** | Single vehicle detail overview map |
| **TTL** | GPS poll **5 s**; dashboard telemetry poll **30 s** (`useLiveVehicleTelemetry`) |
| **Producer** | `/live-gps`, `/telemetry` endpoints |
| **Consumers** | Vehicle detail overview tab only |
| **Invalidation** | `bindToVehicle` / `unbind` / `reset`; bound-vehicle guard drops stale responses |
| **Stale window** | 5–30 s |
| **Error behavior** | `patchState({ error })`; prior snapshot may remain |
| **Risk A/R/AR** | **None** |

---

### 15. Module singleton — `useFleetObdPlugIndex`

| Field | Value |
|-------|-------|
| **Key** | `orgCache: Map<orgId, { map, fetchedAt }>` |
| **Scope** | Per org, module-level (survives component unmount) |
| **TTL** | **90 s** (`CACHE_TTL_MS`) |
| **Producer** | `api.vehicles.fleetConnectivity(orgId, { limit: 500 })` |
| **Consumers** | OBD plug indicators in fleet technical UI |
| **Invalidation** | TTL only |
| **Stale window** | 0–90 s |
| **Error behavior** | Empty map on error |
| **Risk A/R/AR** | **None** |

---

### 16. `localStorage` — Dashboard station filter

| Field | Value |
|-------|-------|
| **Key** | `synqdrive.dashboard.selectedStationId` (`STATION_FILTER_STORAGE_KEY`) |
| **Scope** | Browser profile, cross-session |
| **TTL** | Persistent until user changes |
| **Producer** | `persistDashboardStationId` on filter change |
| **Consumers** | Dashboard + fleet station filter hydration in `FleetContext` |
| **Invalidation** | User action only |
| **Stale window** | N/A (filter choice, not vehicle data) |
| **Error behavior** | try/catch ignore |
| **Risk A/R/AR** | **Low** — can hide vehicles from filtered KPI view without changing true status |

---

### 17. React state — `useNotifications` (V2)

| Field | Value |
|-------|-------|
| **Key** | `apiRows[]`, tab counts in hook state |
| **Scope** | Per org dashboard notifications panel |
| **TTL** | No background poll — load on mount + `refresh()` / `refreshAll()` |
| **Producer** | Notification V2 API client |
| **Consumers** | Dashboard action queue (when V2 mode enabled) |
| **Invalidation** | Manual refresh, mutation patches |
| **Stale window** | Until user opens dashboard or manual sync |
| **Error behavior** | `NotificationClientError` exposed |
| **Risk A/R/AR** | **Low direct** |

---

### 18. React state — `usePriceTariffs`

| Field | Value |
|-------|-------|
| **Key** | `catalog` state |
| **Scope** | Per org |
| **TTL** | Load on `orgId` change only |
| **Producer** | `api.pricing.catalog` |
| **Consumers** | NewBooking, dashboard tariff warnings |
| **Invalidation** | `reload()` manual |
| **Stale window** | Session-long |
| **Error behavior** | Clears catalog on error |
| **Risk A/R/AR** | **None** (availability gates use live booking rules, not this cache) |

---

### 19. React Query / TanStack Query

| Field | Value |
|-------|-------|
| **Status** | **Not used** on rental fleet, dashboard, or booking operational paths |
| **Risk A/R/AR** | N/A |

---

### 20. Service Worker / PWA cache

| Field | Value |
|-------|-------|
| **Status** | **Not found** — no `serviceWorker`, Workbox, or `vite-plugin-pwa` in frontend |
| **Risk A/R/AR** | N/A |

---

### 21. WebSocket / SSE for fleet operational state

| Field | Value |
|-------|-------|
| **Status** | **Not used** for fleet status. SSE exists for chat/AI/DIMO agent streams only. |
| **Risk A/R/AR** | N/A — all fleet ops updates are pull-based (poll + manual refresh) |

---

## Event-driven refresh behavior

Legend: **●** = explicit refresh wired; **○** = partial/indirect; **—** = no refresh

| Event | Redis fleet-map | `useFleetMapStore` | `useFleetHealthMap` | Dashboard insights | `dashboardRuntime` | Notes |
|-------|-----------------|--------------------|--------------------|--------------------|--------------------|-------|
| **Booking created** | — | ● rental `App` `bumpBookingsVersion` → `refreshFleet`; ● Operator mutations | — | — | ● via fleet deps | Redis can still serve ≤5 s stale |
| **Booking confirmed** | — | ● same | — | — | ● | |
| **Booking moved (dates/vehicle)** | — | ● on update/cancel callbacks | — | — | ● | Vehicle change may alter health ids → health refetch |
| **Vehicle swapped on booking** | — | ● | ○ if id set changes | — | ● | Old vehicle status may lag until poll |
| **Booking cancelled** | — | ● | — | — | ● | |
| **Pickup completed** | — | ● rental `App` `handover:completed`; ● Operator bridge also `reloadHealth` | ● Operator only | — | ○ fleet only; `dashboardNow` not bumped; today bookings reloaded in dashboard VM | |
| **Return completed** | — | ● same as pickup | ● Operator only | — | ○ | Vehicle → Available in DB immediately; UI up to 5 s + store |
| **Maintenance started/ended** | — | ○ cleaning PATCH refreshes fleet; **vehicle status dropdown in rental App is local state only (no API)** | — | — | — | Workflow/admin PATCH paths may not call `refreshFleet` |
| **Hard block set/removed** | — | — | — | — | — | Same gap as maintenance for rental App status UI |

---

## Stacked stale-window formula (fleet operational status)

```
effective_staleness = redis_fleet_map_ttl (0–5s)
                    + frontend_store_age (0–30s if no event)
                    + optional_health_map_age (unbounded if no reloadHealth)
```

**Best case** after booking mutation with `refreshFleet()`: **0–5 s** (Redis hit).  
**Worst case** idle tab, no events: **~35 s**.  
**Cross-surface divergence**: detail `GET /vehicles/:id` fresh vs fleet-map cached → **≤5 s**.

---

## Invalidation matrix

Rows = lifecycle events. Columns = cache layers. Cell = **current behavior** → **gap** → **recommended action** (documentation only; no implementation in this prompt).

| Event → Cache | Redis `fleet-map:{orgId}:v1` | `useFleetMapStore` | `useFleetHealthMap` | Insights Postgres + context | `dashboardRuntime` / `dashboardNow` |
|---------------|------------------------------|--------------------|--------------------|-----------------------------|-------------------------------------|
| **Booking created** | TTL only → **stale ≤5s** → **DEL key or versioned key bump on booking write** | `refreshFleet` → **ok** → keep | No reload → **ok** → optional reload if readiness gates | No eval → **stale ≤30min** → wire `onBookingChange` | Recompute on fleet → **ok** → bump `dashboardNow` on booking events |
| **Booking confirmed** | Same | Same | Same | Same | Same |
| **Booking moved** | Same | Same | Same | Same | Same |
| **Vehicle changed on booking** | Same | Same | Id change may refetch → **partial** → explicit `reloadHealth` | Same | Same |
| **Booking cancelled** | Same | Same | Same | Same | Same |
| **Pickup completed** | TTL only → **stale ≤5s** → **invalidate Redis** | `refreshFleet` → **ok** | Rental: **no** reload → **gap** → `reloadHealth` in rental handover listener | No eval → **gap** → `onBookingChange('pickup')` | Today bookings reload only → **gap** → `refreshFleet` already; add `setDashboardNow` |
| **Return completed** | Same | Same | Operator reloads health; rental **gap** | Same | Same |
| **Maintenance start/end** | TTL only → **gap** | **No refresh** on rental status UI → **gap** → PATCH + `refreshFleet` | — | — | — |
| **Hard block set/remove** | TTL only → **gap** | **No refresh** → **gap** | — | — | — |

### Secondary layers (same events)

| Event → Cache | Notification eval Redis | DIMO JWT / snapshot | OBD index 90s | Station localStorage |
|---------------|-------------------------|---------------------|---------------|----------------------|
| All booking/handover events | **No enqueue** (unless driving assessment) → wire triggers | Unaffected | Unaffected | Unaffected |
| Maintenance/block | Unaffected | Unaffected | Unaffected | Unaffected |
| Telemetry-only | Unaffected | 30 s snapshot lag acceptable | 90 s TTL acceptable | — |

---

## Risk summary — Available / Reserved / Active Rented

| Risk | Severity | Mechanism |
|------|----------|-----------|
| Redis fleet-map without write-through invalidation | **P0** | Operator sees pre-booking Available or post-pickup Reserved for up to 5 s after explicit refresh |
| 30 s fleet poll without mutation | **P1** | Idle dashboard/fleet tab lags up to 30 s on external changes (other user, workflow) |
| Health map not invalidated on rental handover | **P2** | Ready-to-rent / blocked KPIs use stale `rental_blocked` while fleet status already Active Rented |
| Insights not triggered on booking change | **P2** | Pickup-overdue / tight-handover cards lag up to 30 min |
| `dashboardNow` frozen between manual syncs | **P2** | Due-soon / overdue runtime slices use stale clock |
| Fetch error retains old fleet store | **P2** | Failed refresh leaves previous A/R/AR counts visible with no staleness indicator |
| `/vehicles` vs `/fleet-map` dual paths | **P3** | Theoretical inconsistency if a surface bypasses fleet-map (settings/invoice paths) |

---

## Recommendations (audit only — not implemented)

1. **Invalidate or version** `fleet-map:{orgId}:v1` on all writes affecting `loadFleetOperationalContext` (booking CRUD, handover, guarded `Vehicle.status`, operational PATCH).
2. **Unify event bus**: call `BusinessInsightsTriggerService.onBookingChange` / `onVehicleChange` from booking and vehicle write services.
3. **Rental handover parity**: extend `App.tsx` `handover:completed` to `reloadHealth()` + `refreshInsights()` (match Operator bridge).
4. **Bump `dashboardNow`** on handover and booking version events, not only manual `refreshAll`.
5. **Surface cache age** in fleet UI (already partial via `lastFetchedAt` / countdown) and treat fetch errors as degraded with visible badge.
6. **Avoid mixing** `/vehicles` list and `/fleet-map` for operational KPIs in new surfaces.

---

## Changes / Architektur

**Not updated** — read-only audit per prompt scope; no implementation changes.
