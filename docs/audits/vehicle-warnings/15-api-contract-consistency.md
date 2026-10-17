# Vehicle Warnings — API Contract Consistency Audit (Prompt 16/26)

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **16 von 26** — API-Vergleich Fahrzeugstatus & Warnmeldungen |
| **Erstellt (UTC)** | 2026-07-25 |
| **Basis-Commit** | `1d0f2caebe56aa1ecd23295aa33d20e953daa95d` |
| **Vorgänger** | [`14-runtime-readiness-builder-audit.md`](./14-runtime-readiness-builder-audit.md) |
| **Modus** | **Analyse only** — keine Codeänderungen, keine Remediation |
| **Produktionsdaten verändert** | **Nein** |
| **Live-API-Evidence** | **Nicht ausführbar** — keine `backend/.env`, kein erreichbarer Dev-Stack im Cloud Agent |

**Referenz-Dokumente:**

- [`02-canonical-status-model.md`](./02-canonical-status-model.md) — D1–D9 Dimensionen
- [`03-warning-data-lineage.md`](./03-warning-data-lineage.md) — Lineage, MT-* Divergenzen
- [`14-runtime-readiness-builder-audit.md`](./14-runtime-readiness-builder-audit.md) — Runtime Builder, parallele Ableitungen
- [`../dimo-tesla-hv-signal-capability.md`](../dimo-tesla-hv-signal-capability.md) — KS FH 660E
- [`../../notification-engine-current-state.md`](../../notification-engine-current-state.md) — WOB L 7503

---

## 1. Executive Summary

SynqDrive exponiert Fahrzeugstatus und Warnungen über **mindestens 28 distinkte HTTP-Routen** (plus client-seitige Runtime-Projektionen ohne API). Es gibt **keinen einheitlichen API-Contract** für die 11 Vergleichsfelder — stattdessen **gestaffelte Wahrheiten**:

| Wahrheit | Primäre API | Client-Ableitung |
|----------|-------------|------------------|
| Commercial Status (D1) | `GET …/fleet-map` → `operationalState` | `fleetVehicleDisplay`, Runtime Builder |
| Technical Health (D3) | `GET …/rental-health/*` | FHS `healthSeverityBand` |
| Rental Readiness (D2) | **Keine API** — Client `deriveIsReadyForRenting` | Dashboard Runtime |
| Telemetry (D5) | `fleet-map` + `fleet-connectivity` | `deriveTelemetryState` (FE, eigene Schwellen) |
| Warnings/Insights | `dashboard-insights`, `notifications` | Action Queue, Operational Issues |
| Booking Gate | `bookings/:id/detail` → `eligibility` | Gatekeeper v1.0.0 |

**Kernbefunde:**

| Thema | Urteil |
|-------|--------|
| Einheitlicher Status-Contract | **Nein** — 6+ verschiedene DTO-Familien |
| `rentalReadiness` als API-Feld | **Nur** Booking-Detail `eligibility` / AI Tool — nicht auf Fleet-Map |
| `projectionVersion` | **Nur** Connectivity Runtime + Booking Gate `engineVersion` |
| Count-Semantik | **Pro Endpoint unterschiedlich** (Fahrzeug vs. Finding vs. Notification vs. Occurrence) |
| Station-Filter | Rental-Health-Fleet, Notifications, Bookings, Tasks — **nicht** Fleet-Map |
| Cache-Kohärenz | Fleet-Map 5s, Rental-Health 45s, Runtime live — **sichtbare Lag-Fenster** |
| Screenshot-Fahrzeuge | **Kein Live-Read** — Vergleich aus Code-Mapping + Test-Fixtures |

---

## 2. Scope & Methodik

### 2.1 UI-Surfaces → API-Mapping

| Surface | Primäre APIs | Client-Ableitung |
|---------|--------------|------------------|
| **Dashboard** | fleet-map, rental-health/fleet, dashboard-insights, bookings/today/*, notifications, service-cases | `buildDashboardRuntimeModel` |
| **Fleet** | fleet-map, rental-health/fleet, stations | `deriveFleetVisualState`, `resolveOperationalStatus` |
| **Fleet Command** | *(gleich wie Fleet + Dashboard)* | `fleet-operator-panel`, Runtime Slices |
| **Readiness** | rental-health, fleet-map | `deriveIsReadyForRenting` (kein Endpoint) |
| **Vehicle Detail** | fleet-map (lookup), rental-health, health/summary, device-connection | `deriveVehicleOverviewReadiness` (deprecated) |
| **Health** | rental-health, `/vehicles/:id/health/*`, Modul-Endpunkte | Health Tab Summary |
| **Warnings** | dashboard-insights, notifications, rental-health modules | Operational Issues normalizer |
| **Notifications** | notifications, notifications/counts | V2 Panel + Legacy Insight-Adapter |
| **Active Rentals** | fleet-map `bookingContext`, bookings/today/returns | — |
| **Bookings** | bookings, bookings/:id/detail | eligibility, health checkpoints |
| **Maintenance** | tasks, service-cases, vehicles/:id/tasks | — |
| **Connectivity** | fleet-connectivity, fleet-connectivity/:id | Connectivity Runtime Builder (BE) |
| **Operator App** | bookings/today/*, tasks, fleet-map, rental-health, dashboard-insights | Operator alerts |
| **AI Context** | Chat-Tools (kein REST): `get_vehicle_health_summary`, `get_vehicle_booking_context` | Tool Cache Redis |
| **Workflow Automation** | workflows, task-automation/rules | Kein Fahrzeugstatus direkt |

### 2.2 Evidence-Limits (Screenshot-Fahrzeuge)

Geprüfte Kennzeichen aus Screenshots / Regression-Suite:

| Kennzeichen | Bekannte Evidence-Quelle | Live-API |
|-------------|--------------------------|----------|
| KS FH 660E | Battery-Audit, Operational-State-Tests, DIMO-Audit | ❌ |
| WOB L 9755 | Keine dedizierte Fixture im Repo | ❌ |
| KS MS 661 | Notification-Grouping-Tests | ❌ |
| HMÜ C 215 | deriveOperationalInsights-Test (LOW_UTILIZATION) | ❌ |
| KS MX 2024 | Dashboard-Runtime-Tests, Service-Overdue-Critical | ❌ |
| WOB L 7503 | notificationEngine.fixtures, Notification-Docs | ❌ (Fixture only) |

**Grund:** Cloud Agent ohne `backend/.env` / DB — kein lesender API-Lauf gegen Staging/Prod (Audit-Charter: keine Produktionsänderungen).

Fixture-Evidence: [`evidence/15-api-contract-fixture-evidence.json`](./evidence/15-api-contract-fixture-evidence.json)

---

## 3. Endpoint-Inventar (nach Surface)

Alle Pfade mit Prefix `/api/v1`. Org-Scoping standardmäßig `:orgId` + `OrgScopingGuard` + Permission.

### 3.1 Dashboard

#### E-01 `GET /organizations/:orgId/fleet-map`

| Attribut | Wert |
|----------|------|
| **Controller** | `vehicles.controller.ts` → `getFleetMap` |
| **Service** | `VehiclesService.getFleetMap` |
| **Query** | — |
| **DTO** | `FleetMapVehicleResponse[]` |
| **Cache** | Redis `fleet-map:{orgId}:v1`, TTL **5s**; invalidiert bei Status-Patch |
| **Filter** | Kein Server-Filter (Client: Station, Status) |
| **organizationId** | `:orgId` Route-Param |
| **Stationfilter** | **Nein** (Client-seitig über `stationId`) |
| **Statusberechnung** | `deriveFleetStatusContext` → `buildFleetOperationalStateDto` + `interpretVehicleState` (Telemetry) + Booking-Embedding |
| **Count-Semantik** | Array-Länge = Fahrzeuge in Org (ungefiltert) |
| **Zeitbasis** | `lastSeenAt`, `signalAgeMs`, `derivedAt` in operationalState |
| **Fehler/Fallback** | Booking-Context-Load-Fail → `operationalState.status=UNKNOWN`, `dataQualityState=UNAVAILABLE` |

**Relevante Felder:** `status` (legacy), `operationalState`, `bookingContext`, `connectivityRuntime`, `telemetryFreshness`, `healthStatus` (legacy enum), `cleaningStatus`, `lastSeenAt`, `isFresh`, `onlineStatus`

#### E-02 `GET /organizations/:orgId/rental-health/fleet`

| Attribut | Wert |
|----------|------|
| **Controller** | `rental-health.controller.ts` → `getScopedFleetHealth` |
| **Service** | `RentalHealthFleetService.listFleetHealthPage` → `RentalHealthSummaryService` |
| **Query** | `FleetRentalHealthQueryDto`: `stationId`, `search`, `vehicleStatus`, `limit` (1–50), `cursor` |
| **DTO** | `FleetRentalHealthPageResult<FleetVehicleHealthRow>` → mapped to `VehicleHealthResponse` |
| **Cache** | Redis per vehicle `rental-health-summary:{orgId}:{vehicleId}:v1`, TTL **45s**, soft-stale **30s** |
| **Filter** | Station + Search + VehicleStatus + Cursor-Pagination |
| **organizationId** | `:orgId` |
| **Stationfilter** | **`?stationId=`** (+ User Station Access via `StationAccessService`) |
| **Statusberechnung** | `RentalHealthService.computeOverallState`, `collectBlockingReasons`, Modul-Evaluatoren |
| **Count-Semantik** | `page.total` = gefilterte Fahrzeuge; Modul-States pro Fahrzeug |
| **Zeitbasis** | `generated_at`, `modules.*.last_updated_at`, `cached_at` (read-model) |
| **Fehler/Fallback** | Pipeline degraded → `availability: partial/unavailable`, `rental_blocked: null`, `degradation` |

#### E-03 `GET /organizations/:orgId/dashboard-insights`

| Attribut | Wert |
|----------|------|
| **Controller** | `dashboard-insights.controller.ts` |
| **Service** | `DashboardInsightsRepository.getActiveInsights` |
| **Query** | Policy-driven limit |
| **DTO** | `DashboardInsightsResponse` (`insights[]`, `summary` counts) |
| **Cache** | Kein HTTP-Cache; DB `DashboardInsight` (active batch) |
| **Filter** | Tenant policy `enabledTypes`, `maxVisibleInsights` |
| **organizationId** | `:orgId` |
| **Stationfilter** | **Nein** (entity-scoped via `entityIds`) |
| **Statusberechnung** | Insight-Detektoren (BATTERY_CRITICAL, TIRE_CRITICAL, DRIVING_ASSESSMENT_DEVICE_QUALITY, …) |
| **Count-Semantik** | `summary.bySeverity` — **pro Insight**, nicht pro Fahrzeug deduped |
| **Zeitbasis** | `generatedAt`, `expiresAt`, `calculationMeta` |
| **Fehler/Fallback** | Policy disabled → leere Liste |

#### E-04 `GET /organizations/:orgId/bookings/today/pickups` | `…/returns`

| Attribut | Wert |
|----------|------|
| **Controller** | `bookings.controller.ts` |
| **Service** | `BookingsService` |
| **DTO** | Inline booking rows (vehicleId, plate, dates, overdue flags) |
| **Cache** | Keiner |
| **Stationfilter** | **Nein** auf Route (Client filtert) |
| **Statusberechnung** | Booking-Status + Overdue-Heuristik |
| **Count-Semantik** | Array-Länge = Today's handovers |
| **Zeitbasis** | Org-TZ „today“, `startDate`/`endDate` |

#### E-05 `GET /organizations/:orgId/notifications` | `…/counts`

| Attribut | Wert |
|----------|------|
| **Controller** | `notifications.controller.ts` |
| **Service** | `NotificationApiService` |
| **Query** | `ListNotificationsQueryDto`: status, domain, severity, `stationId`, entity filters, pagination |
| **DTO** | `NotificationResponseDto`, `NotificationCountsResponseDto` |
| **Cache** | Keiner |
| **Stationfilter** | **`?stationId=`** + impliziter User-Scope |
| **Statusberechnung** | Notification Materialization Pipeline (Fingerprints, Producers) |
| **Count-Semantik** | `counts.critical/warning` — **pro Notification**; `occurrenceCount` pro Deduplicated Event |
| **Zeitbasis** | `firstSeenAt`, `lastSeenAt`, `createdAt` |
| **Fehler/Fallback** | `NOTIFICATIONS_V2` disabled → **503** |

#### E-06 Dashboard Runtime (Client-only)

| Attribut | Wert |
|----------|------|
| **„Route“** | — (kein Endpoint) |
| **Builder** | `buildDashboardRuntimeModel` ← E-01 + E-02 + E-03 + E-04 |
| **DTO** | `DashboardRuntimeModel`, `VehicleRuntimeState` |
| **Cache** | React `useMemo`; Invalidation via `vehicleOperationalQueryKeys.dashboardRuntime` |
| **Statusberechnung** | `vehicleRuntimeStateBuilder` + `deriveIsReadyForRenting` |
| **Count-Semantik** | Slices zählen **Fahrzeuge** (deduped reasons pro Fahrzeug) |

---

### 3.2 Fleet / Fleet Command

Fleet Command hat **keinen dedizierten Backend-Endpoint** — konsumiert E-01, E-02 client-seitig (`fleet-command-filters.ts`, `fleet-operator-panel.ts`).

Zusätzlich:

#### E-07 `GET /organizations/:orgId/stations/:id/fleet`

| Attribut | Wert |
|----------|------|
| **Controller** | `stations.controller.ts` |
| **Service** | `StationsService` |
| **Stationfilter** | **Path-Param** `:id` |
| **DTO** | Station-scoped fleet subset |
| **Cache** | Keiner |

**Client-Chips:** `fleetVehicleDisplay.resolveOperationalStatus` — **nicht** API, mappt `healthCritical`/`rentalBlocked` auf Chip „Kritisch/Blockiert/Warnung“.

---

### 3.3 Readiness

#### E-08 `GET /organizations/:orgId/vehicles/:vehicleId/rental-health`

| Attribut | Wert |
|----------|------|
| **Controller** | `rental-health.controller.ts` |
| **Service** | `RentalHealthService.getVehicleHealth` (**live**, kein Redis) |
| **DTO** | `VehicleHealth` |
| **Cache** | **Keiner** (canonical detail) |
| **Statusberechnung** | Gleich wie E-02, aber frisch berechnet |
| **Felder** | `overall_state`, `rental_blocked`, `blocking_reasons`, `availability`, `modules`, `generated_at` |

**Readiness proper:** `deriveIsReadyForRenting` — nur Client, Inputs aus E-01 + E-02.

#### E-09 Booking Readiness `GET …/bookings/:id/detail`

| Attribut | Wert |
|----------|------|
| **Controller** | `bookings.controller.ts` |
| **Service** | `BookingsService` + `BookingEligibilityGatekeeper` |
| **DTO** | `BookingDetailDto.health`, `.eligibility`, `.rentalEligibility` |
| **Cache** | Keiner |
| **Statusberechnung** | Gatekeeper v1.0.0 + Rental Health Snapshot |
| **Zeitbasis** | `rentalEligibility.evaluatedAt` |
| **projectionVersion** | `rentalEligibility.engineVersion` = **`1.0.0`** |

---

### 3.4 Vehicle Detail / Health

#### E-10 `GET /vehicles/:vehicleId/health/summary`

| Attribut | Wert |
|----------|------|
| **Controller** | `vehicle-intelligence.controller.ts` |
| **Service** | `VehicleHealthTabSummaryService` |
| **Scoping** | `VehicleOwnershipGuard` (JWT org) |
| **DTO** | `VehicleHealthTabSummaryDto` |
| **Cache** | Keiner |
| **Statusberechnung** | Aggregiert Modul-Endpunkte + Rental Health + HM/DIMO Freshness |
| **Felder** | `overall.state`, `findings[]`, `moduleStates`, `dataQuality`, `generatedAt` |
| **Count-Semantik** | `findings.length` — **pro Finding**, nicht deduped across modules |
| **Fehler/Fallback** | `degradedDependencies[]` — partial render |

#### E-11 `GET /vehicles/:vehicleId/health/dashboard-warning-lights`

| Service | `DashboardWarningLightsService` |
| **DTO** | Telltales / Warning lights payload |
| **Status** | OEM/HM signal-based, orthogonal zu Rental Health |

#### E-12 Modul-Endpunkte (Health Tab Lazy-Load)

| Route | Service | DTO |
|-------|---------|-----|
| `GET …/battery-health-summary` | `BatteryHealthService` | `BatteryHealthSummary` |
| `GET …/tires/summary` | `TireHealthService` | Tire summary |
| `GET …/brake-health/summary` | `BrakeHealthService` | Brake summary |
| `GET …/dtc/summary` | `DtcService` | DTC summary |
| `GET …/service-info-status` | `ServiceComplianceService` | Service compliance |
| `GET …/health/ai-health-care` | `AiHealthCareAggregationService` | AI aggregate |

Alle: **kein Cache**, Vehicle-Ownership-Guard, **kein Station-Filter**.

---

### 3.5 Warnings (kombiniert)

| Quelle | Route | Severity-Semantik |
|--------|-------|-------------------|
| Rental Health Modules | E-02, E-08 | `state: warning/critical` pro Modul |
| Dashboard Insights | E-03 | `InsightSeverity: WARNING/CRITICAL` |
| Notifications V2 | E-05 | `NotificationSeverity` |
| Health Tab Findings | E-10 | `finding.severity: critical/warning/info` |
| Technical Observations | `GET …/technical-observations` | Observation severity |

**Kein einheitliches `highestSeverity`-Feld** — jede Schicht berechnet eigen.

---

### 3.6 Active Rentals & Bookings

#### E-13 `GET /organizations/:orgId/bookings`

| Query | `stationId`, `vehicleId`, `from`, `to`, `search`, pagination |
| **DTO** | Paginated booking list |
| **Status** | `BookingStatus` enum — **nicht** Vehicle Health |

Active-Rental-Kontext primär aus **E-01** `bookingContext.activeBooking`.

---

### 3.7 Maintenance

#### E-14 `GET /organizations/:orgId/tasks` | `…/tasks/summary`

| Service | `TasksService` |
| **Query** | `stationId`, status filters |
| **DTO** | `ApiTask[]`, `ApiTaskSummary` |
| **Count** | `blockingCount`, `criticalCount`, `dueTodayCount` — **pro Task**, vehicle-linked |

#### E-15 `GET /organizations/:orgId/service-cases`

| Service | `ServiceCasesService` |
| **Count** | Open cases per vehicle (Dashboard: `rentalBlockingServiceCases` map) |

---

### 3.8 Connectivity

#### E-16 `GET /organizations/:orgId/fleet-connectivity`

| Controller | `vehicles.controller.ts` |
| **Service** | `VehiclesService.getFleetConnectivity` |
| **Query** | `FleetConnectivityQueryDto`: `page`, `limit`, `status`, `q` |
| **DTO** | `FleetConnectivityResponse` (`items[]`, `summary` KPIs, `generatedAt`) |
| **Cache** | Keiner |
| **Stationfilter** | **Nein** |
| **Statusberechnung** | `vehicle-connectivity-runtime-state.builder` |
| **projectionVersion** | `CONNECTIVITY_RUNTIME_STATE_VERSION` in domain types |
| **Felder** | `telemetryState`, `overallState`, `attentionState`, `primaryReasonCode`, `requiresAction` |
| **Count-Semantik** | `summary.actionRequired` — Fahrzeuge mit `requiresAction=true` |

#### E-17 `GET /organizations/:orgId/fleet-connectivity/:vehicleId`

Detail-DTO: `FleetConnectivityDetail` + Timeline, Episodes, Capabilities.

#### E-18 `GET /organizations/:orgId/vehicles/:vehicleId/device-connection`

Device-Connection-Card (DIMO triggers, plug state) — separates von E-16.

---

### 3.9 Operator App

Komponiert **E-01, E-02, E-03, E-04, E-05, E-14** ohne eigene Status-API.

| Operator Surface | APIs |
|------------------|------|
| Today | `bookings/today/pickups`, `…/returns` |
| Vehicles | fleet-map + rental-health (FleetContext) |
| Alerts | dashboard-insights |
| Tasks | tasks + tasks/summary |
| Handover | `bookings/:id/detail`, handover POST |
| Booking Sheet | `bookings/:id/detail` → eligibility |

---

### 3.10 AI Context (Tools, kein REST)

#### T-01 `get_vehicle_health_summary`

| Attribut | Wert |
|----------|------|
| **Tool** | `AiGetVehicleHealthSummaryTool` |
| **Services** | `RentalHealthService`, Tasks, Connectivity evidence |
| **DTO** | `AiGetVehicleHealthSummaryData` |
| **Cache** | Redis `synqdrive:ai-chat:tool:{orgId}:…` per-tool TTL |
| **Felder** | `overallStatus`, `rentalBlocked`, `readyToRentBlockers[]`, `domains.*.severity`, `lastUpdatedAt` |
| **projectionVersion** | **Keine** explizite Version im Output |

#### T-02 `get_vehicle_booking_context`

| Service | `VehicleBookingContextService` |
| **Felder** | `operationalState`, `bookingContext`, active/reserved/next booking |
| **Kein REST** | Nur via Chat-Tool |

---

### 3.11 Workflow Automation

#### E-19 `GET /organizations/:orgId/workflows` | `…/workflows/stats`

| Service | `WorkflowsService` |
| **DTO** | `OrgWorkflow`, stats object |
| **Fahrzeugstatus** | **Indirekt** — Trigger auf Events, nicht Status-Polling |
| **Stationfilter** | `scope.stationIds[]` in Workflow-Definition (Body, nicht Query) |

#### E-20 `GET /organizations/:orgId/task-automation/rules`

| Service | `TaskAutomationAdminService` |
| **DTO** | `TaskAutomationRulesOverviewDto` |
| **Fahrzeugstatus** | Regel-Simulation only (`POST …/simulate`) |

---

## 4. Vergleichsmatrix — 11 Contract-Felder

Legende: ✅ = explizites Feld | 🔶 = ableitbar/indirekt | ❌ = nicht vorhanden | 🖥️ = nur Client

| Feld | fleet-map E-01 | rental-health E-02/08 | dashboard-insights E-03 | notifications E-05 | health/summary E-10 | fleet-connectivity E-16 | booking/detail E-09 | dashboard-runtime 🖥️ | AI tool T-01 |
|------|----------------|----------------------|-------------------------|---------------------|--------------------|-----------------------|--------------------|-----------------------|-------------|
| **commercialStatus** | ✅ `operationalState.status` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (booking status only) | ✅ `operationalStatus` | ❌ |
| **rentalReadiness** | ❌ | 🔶 `availability` (pipeline, ≠ ready) | ❌ | ❌ | ❌ | ❌ | ✅ `eligibility.canStartRental` | ✅ `isReadyToRent` | 🔶 `readyToRentBlockers` |
| **technicalState** | 🔶 `healthStatus` legacy | ✅ `overall_state` | ❌ | ❌ | ✅ `overall.state` | ❌ | ✅ `health.overallState` | 🔶 `healthSeverity` | ✅ `overallStatus` |
| **telemetryState** | ✅ `telemetryFreshness` + signals | ❌ | ❌ | ❌ | 🔶 `dataQuality` | ✅ `telemetryState` | ❌ | ✅ `telemetryState` (FE derive) | ✅ `domains.connectivity` |
| **highestSeverity** | ❌ | 🔶 max module state | 🔶 per insight | ✅ `severity` | ✅ `overall.state` | 🔶 `attentionState` | 🔶 max of health warnings | ✅ `isCritical/isWarning` | ✅ per domain slice |
| **findingCount** | ❌ | 🔶 modules in warning/critical | ✅ insights count | ✅ `occurrenceCount` | ✅ `findings.length` | ❌ | 🔶 `criticalWarnings+warningWarnings` | ✅ `criticalReasons/warningReasons` | 🔶 domain facts count |
| **blockerCount** | ❌ | ✅ `blocking_reasons.length` | ❌ | ❌ | 🔶 findings with blocker | ❌ | ✅ `blockingReasons` / eligibility | ✅ `blockReasons.length` | ✅ `readyToRentBlockers` |
| **warning labels** | ❌ | ✅ `modules.*.reason` | ✅ `title/message` | ✅ `titleKey/bodyKey` | ✅ `findings[].label` | ✅ `primaryReasonCode` | ✅ `warnings[]` | ✅ `RuntimeReason.title` | ✅ `summaryFacts` |
| **freshness** | ✅ `isFresh`, `signalAgeMs` | ✅ `data_stale`, `cached_at` | ❌ | ❌ | ✅ `dataQuality` | ✅ `lastTelemetryAt` | ❌ | 🔶 telemetry buckets | ✅ `freshness` per domain |
| **evaluatedAt** | ✅ `operationalState.derivedAt` | ✅ `generated_at` | ✅ insight timestamps | ✅ `lastSeenAt` | ✅ `generatedAt` | ✅ `generatedAt` | ✅ `evaluatedAt` | 🖥️ `now` input | ✅ `lastUpdatedAt` |
| **projectionVersion** | ❌ | 🔶 cache key `v1` | ❌ | ❌ | ❌ | ✅ `CONNECTIVITY_RUNTIME_STATE_VERSION` | ✅ `engineVersion 1.0.0` | ❌ | ❌ |

---

## 5. Count-Semantik — Vergleich

| Surface | Was wird gezählt? | Dedup? | Pro Fahrzeug? |
|---------|-------------------|--------|---------------|
| Rental Health Fleet | Fahrzeuge mit `overall_state` Band | Ja (1 row/vehicle) | ✅ |
| FHS KPI Strip | Fahrzeuge pro `healthSeverityBand` | Ja | ✅ |
| Dashboard Runtime Slices | Fahrzeuge pro Slice-Gruppe | Ja (reason dedupe) | ✅ |
| Dashboard Insights Summary | Insights by severity | **Nein** (multi per vehicle möglich) | ❌ |
| Notifications Counts | Active notifications by severity | Fingerprint-deduped | ❌ (multi per vehicle) |
| Fleet Command Critical | Fahrzeuge mit critical reasons | Ja | ✅ |
| Tasks Summary | Open/blocking/critical **tasks** | Per task | ❌ |
| Connectivity KPI | `actionRequired` vehicles | Per vehicle | ✅ |
| Health Tab Findings | Individual findings | Per finding | ❌ |

**Risiko:** Ein Fahrzeug mit 3 Modul-Warnings kann in Notifications als 1–3 Items erscheinen, in Rental Health als 1 Fahrzeug mit `overall_state=warning`, im Dashboard Runtime als 3 `warningReasons` aber 1 Slice-Eintrag.

---

## 6. Zeitbasis & Cache-Lag

| API | Zeitbasis | TTL | Stale-Verhalten |
|-----|-----------|-----|-----------------|
| fleet-map | `lastSeenAt`, request-time `derivedAt` | 5s Redis | Nach Patch sofort invalidiert |
| rental-health/fleet | `generated_at`, module `last_updated_at` | 45s Redis | `cache_stale: true` ab 30s |
| rental-health detail | Live compute | 0 | Always fresh |
| dashboard-insights | Detector `now`, DB `publishedAt` | Policy refresh ~30min | Expired insights hidden |
| notifications | `firstSeenAt`/`lastSeenAt` | 0 | Materialized on event |
| fleet-connectivity | `calculatedAt`, `lastTelemetryAt` | 0 | Per-request build |
| dashboard-runtime | `dashboardNow` (client clock) | 0 (useMemo) | Rebuild on deps |

**Maximales Inkonsistenz-Fenster:** ~45s (Health cached, Fleet-Map refreshed alle 5s, Runtime sofort bei Health-Map-Update im Client).

---

## 7. Screenshot-Fahrzeuge — Feldvergleich (Fixture/Code-Evidence)

> ⚠️ **Keine Live-API-Responses.** Werte aus Test-Fixtures, Audit-Docs und Code-Pfaden. Für Produktionsverifikation: `audit-vehicle-booking-handover-data.ts --license-plate=…`

### 7.1 WOB L 7503 (Volkswagen Tiguan 2026)

**Evidence:** `notificationEngine.fixtures.ts`, `notification-engine-current-state.md`

| Feld | fleet-map (Fixture) | rental-health | insights | notifications | runtime (abgeleitet) |
|------|---------------------|---------------|----------|---------------|---------------------|
| commercialStatus | `AVAILABLE` | — | — | — | `available` |
| rentalReadiness | — | — | — | — | `true` wenn clean + no blockers |
| technicalState | `healthStatus: Warning` | — | — | — | Modul-abhängig |
| telemetryState | `online: true` | — | — | — | `live` (Fixture now) |
| highestSeverity | — | — | `INFO` (RECOVERING) oder `WARNING` (DEGRADED) | `warning`/`info` | `warning` (insight) |
| findingCount | — | — | 1 (DRIVING_ASSESSMENT_DEVICE_QUALITY) | 1–3 (bekanntes Duplikat-Risiko) | 1+ reasons |
| blockerCount | 0 | — | 0 | 0 | 0 |
| warning labels | — | — | „Fahrbewertung …" | Notification titleKey | Insight title |
| freshness | `lastSignal` = now | — | — | — | `live` |
| evaluatedAt | Fixture ISO | — | `NOTIFICATION_TEST_INSIGHTS_GENERATED_AT` | — | client now |
| projectionVersion | — | — | — | — | — |

**Bekanntes Duplikat:** DRIVING_ASSESSMENT_DEVICE_QUALITY kann gleichzeitig als Insight, Notification und Operational Issue erscheinen (Docs Anhang A).

### 7.2 KS FH 660E (Tesla Model 3 2023, BEV)

**Evidence:** `dimo-tesla-hv-signal-capability.md`, `vehicle-operational-state-v2` tests

| Feld | Bekannte Semantik |
|------|-------------------|
| commercialStatus | Kann `UNKNOWN` sein wenn Telemetry unzuverlässig (Runbook G) |
| technicalState | Battery: `UNSUPPORTED_PROFILE` ohne LV-Signale |
| telemetryState | Divergenz-Risiko: BE `interpretVehicleState` vs FE `deriveTelemetryState` |
| rentalReadiness | Offline-Policy blockiert; BEV ohne LV → keine 12V-Warnungen aus REST |
| blockerCount | Nur wenn `rental_blocked` + `blocking_reasons` |
| projectionVersion | Connectivity Runtime versioniert; Rental Health cache `v1` |

### 7.3 KS MX 2024 (Mercedes C 63 AMG)

**Evidence:** `dashboardDrawerNormalize.test.ts` — Service-Overdue-Critical

| Feld | Bekannte Semantik |
|------|-------------------|
| technicalState | Service overdue → `critical` reason in Runtime |
| blockerCount | Service-Kategorie: **`blocking: false`** im Runtime (seit V4.9.x) |
| findingCount | Merged service-overdue reasons (dedup test) |
| warning labels | „Service überfällig" / HM-OEM variants |

### 7.4 KS MS 661 (Audi A4 2016)

**Evidence:** Notification grouping tests

| Feld | Bekannte Semantik |
|------|-------------------|
| warning labels | Entity label `KS MS 661` in Notification groups |
| highestSeverity | Notification-domain dependent |

### 7.5 HMÜ C 215

**Evidence:** `deriveOperationalInsights.test.ts` — `LOW_UTILIZATION` insight

| Feld | Bekannte Semantik |
|------|-------------------|
| highestSeverity | Insight `OPPORTUNITY`/`INFO` (low utilization) |
| blockerCount | 0 (utilization ≠ rental block) |
| commercialStatus | Unabhängig von Utilization-Insight |

### 7.6 WOB L 9755

**Evidence:** **Keine** dedizierte Fixture oder Audit-Referenz im Repo.

| Empfehlung | `audit-vehicle-booking-handover-data.ts --license-plate="WOB L 9755"` auf Staging |
| Erwartung | Gleiche API-Felder wie andere Fahrzeuge; konkrete Werte **unbekannt** in diesem Audit |

---

## 8. Fehler- & Fallback-Verhalten (übergreifend)

| Szenario | Betroffene APIs | Verhalten |
|----------|-----------------|-----------|
| Rental Health Pipeline down | E-02, E-08 | `availability: unavailable`, `rental_blocked: null`, `degradation.PIPELINE_UNAVAILABLE` |
| Booking context load fail | E-01 | `operationalState: UNKNOWN`, `isReliable: false` |
| Notifications V2 disabled | E-05 | HTTP 503 |
| Health module endpoint error | E-10, E-12 | `endpoint_error` / `degradedDependencies` |
| AI tool timeout | T-01 | Partial response + `internalDetail` codes |
| Gatekeeper unevaluable | E-09 | `canStartRental: false`, fail-closed |
| Fleet-map cache miss | E-01 | Recompute from DB (slight latency) |
| Station access denied | E-02 | Empty page or filtered subset |

---

## 9. Risiko-Register

| ID | Risiko | Schwere | APIs betroffen |
|----|--------|---------|----------------|
| **API-C01** | `commercialStatus` nur auf fleet-map, nicht auf rental-health | Mittel | E-01 vs E-02 |
| **API-C02** | `rentalReadiness` nur Client — Booking-API nutzt Gatekeeper, nicht Runtime | Hoch | E-06 vs E-09 |
| **API-C03** | `telemetryState` 3 Vokabulare (fleet-map, connectivity, runtime) | Hoch | E-01, E-16, E-06 |
| **API-C04** | `highestSeverity` inkonsistent über Insights/Notifications/Health | Hoch | E-03, E-05, E-10 |
| **API-C05** | Count pro Finding vs pro Fahrzeug | Hoch | E-03, E-05 vs E-02 |
| **API-C06** | 45s Health-Cache vs 5s Fleet-Map | Mittel | E-01, E-02 |
| **API-C07** | Kein `projectionVersion` auf Rental Health / Runtime | Mittel | E-02, E-06 |
| **API-C08** | Legacy `healthStatus` auf fleet-map parallel zu rental-health | Mittel | E-01 |
| **API-C09** | AI Tool vs REST Health Tab unterschiedliche Domain-Slices | Mittel | T-01 vs E-10 |
| **API-C10** | WOB L 7503 Triple-Exposure (Insight+Notification+Issue) | Hoch | E-03, E-05, Client |

---

## 10. Querbezüge

| Audit | Bezug |
|-------|-------|
| Prompt 15 (`14-runtime-readiness-builder-audit.md`) | Client-Runtime vs API-Inputs |
| Prompt 14 (`13-severity-readiness-policy-audit.md`) | Severity/Blocking-Policy pro Schicht |
| Prompt 13 (`12-deduplication-idempotency-audit.md`) | Notification/Insight Dedup |
| Prompt 03 (`03-warning-data-lineage.md`) | MT-* Feld-Divergenzen |
| Prompt 02 (`02-canonical-status-model.md`) | D1–D9 Owner-Matrix |

---

## 11. Fazit

SynqDrive hat **bewusst getrennte API-Wahrheiten** — nicht einen konsolidierten Vehicle-Status-Endpoint. Die 11 Vergleichsfelder sind **nirgends vollständig** in einer Response vereint; `fleet-map` + `rental-health` + Client-Runtime decken zusammen ~70% ab, der Rest ist surface-spezifisch.

**Größte Contract-Lücken:**

1. **`rentalReadiness`** existiert nicht als Backend-Feld (nur Gatekeeper + Client)
2. **`projectionVersion`** fehlt auf Rental Health und Dashboard-Runtime
3. **`highestSeverity` / `findingCount`** haben keine einheitliche Semantik
4. **Telemetry** hat drei parallele Klassifikationen

Für die Screenshot-Fahrzeuge konnte **kein Live-Vergleich** durchgeführt werden; Fixture-Evidence für WOB L 7503 und Code-Mapping für die übrigen fünf Kennzeichen dokumentieren erwartete Divergenzen.

**Changes / Architektur:** nicht aktualisiert (Audit-only).
