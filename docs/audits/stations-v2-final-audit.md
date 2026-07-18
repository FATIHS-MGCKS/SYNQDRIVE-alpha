# Stations V2 — Final Audit (Prompt 76/78)

| Feld | Wert |
|------|------|
| **Audit-Datum (UTC)** | 2026-07-18 |
| **Modus** | Read-only Repository- und Runtime-Audit (keine Codeänderungen) |
| **Branch / Commit** | `cursor/station-v2-final-audit-c2c2` @ `c21c6269…` |
| **Ausführungsvertrag** | [`stations-v2-execution-contract.md`](../architecture/stations-v2-execution-contract.md) |
| **Basis** | [`stations-v2-implementation-inventory.md`](./stations-v2-implementation-inventory.md), [`stations-production-reality.md`](./stations-production-reality.md), [`stations-workflow-ux-test-matrix.md`](./stations-workflow-ux-test-matrix.md) |
| **Runbooks** | [`stations-v2-deployment.md`](../runbooks/stations-v2-deployment.md), [`stations-v2-shadow-validation.md`](../runbooks/stations-v2-shadow-validation.md) |
| **Architektur** | [`stations-v2.md`](../architecture/stations-v2.md), [`stations-v2-rollout-flags.md`](../architecture/stations-v2-rollout-flags.md) |

---

## 1. Executive Summary

Stations V2 ist **architektonisch spezifiziert** (11-Schichten-Modell, Feature Flags, Shadow-/Deployment-Runbooks) und **teilweise im Code angelegt** (Lifecycle-Commands, drei Vehicle-FKs, Feature-Flag-Resolver, Enforcement-Scaffold, Rental-UI). Der **V2-Vertrag ist repository- und runtimeweit nicht erfüllt**.

| Gesamturteil | Bedingung |
|--------------|-----------|
| **READY_FOR_SHADOW_ONLY** | Kleine Pilot-Org, `ORG_ADMIN` only, Feature Flags `shadow`/`warning`, Geofence **nur** Client-Badge, kein Scope-Rollout |
| **NOT_READY** | Scoped Roles, Flotten > 100 Fahrzeuge, `enforce` Booking Rules, Legacy-SET-Abschaltung, Transfer-Lifecycle, breite UI-Freigabe |
| **NOT_READY_FOR_PRODUCTION_V2** | Vollständige Aktivierung Schritt 7–10 im Deployment-Runbook ohne vorherige Remediation der P0-Funde |

**Kernblocker (P0):** RBAC/Scope unwired, stiller Mass-Detach via SET aus partieller Fahrzeugliste (API-Limit 100, UI `limit: 500`), Home/Current-Kopplung, Hard Delete, fehlende Booking-Rules-Engine, kein kanonisches Read Model, Frontend-Flag-Gating fehlt.

**Geofence:** Kein operativer Auto-Write auf `currentStationId` aus GPS/Geofence — **konform** mit S3/R9. Shadow-Read-Model (`GeofenceShadowDto`) und Flag-Wiring fehlen (**P1**).

**Produktions-Ist (Audit 1):** 1 Org, 2 Stationen, 6 Fahrzeuge — Daten sauber, aber **keine** station-scoped User. Runtime-Risiken skalieren mit Flottengröße und Rollenmodell.

---

## 2. Readiness-Matrix

| Bereich | Status | Höchste Sev. | Kurz |
|---------|--------|--------------|------|
| Permission-Enforcement | **NOT_READY** | P0 | `PermissionsGuard` fehlt auf Controller |
| Scope-Enforcement | **NOT_READY** | P0 | `StationScopeGuard` unwired; JWT ohne Scope |
| Listen-/KPI-Scope | **NOT_READY** | P0 | Nur `organizationId`-Filter |
| Lifecycle-Invarianten | **PARTIAL** | P1 | `archive()` ok; PATCH bypass |
| Primary-Eindeutigkeit | **PARTIAL** | P1 | App-Tx only, kein DB-Constraint |
| Kein Hard Delete | **NOT_READY** | P0 | `DELETE` hard-deleted unverknüpfte Stationen |
| Archive Preview | **MISSING** | P1 | Kein Impact-Preview API/UI |
| Restore-Fähigkeiten | **PARTIAL** | P1 | API ja; blindes pickup/return; keine UI |
| Home/Current/Expected | **NOT_READY** | P0 | Home koppelt Current; Expected ungenutzt |
| Kein Bulk SET / >500 | **NOT_READY** | P0 | SET aktiv; UI max 100 Fahrzeuge geladen |
| Current Position Source | **MISSING** | P1 | Keine Provenance-Spalten |
| Transfer-Lifecycle | **MISSING** | P1 | Kein `VehicleStationTransfer` |
| Booking Rules | **NOT_READY** | P0 | Nur Exception-Validation |
| Öffnungszeiten | **PARTIAL** | P0 | Persistiert, nicht enforced |
| Feiertage | **PARTIAL** | P1 | `holidayRules` ohne Evaluator |
| Zeitzonen | **PARTIAL** | P1 | KPI „today“ server-lokal |
| After-hours | **PARTIAL** | P1 | Flag gespeichert, nicht geprüft |
| Kapazität | **PARTIAL** | P0 | KPI only; keine Booking-Regel |
| Runtime-State-KPIs | **PARTIAL** | P1 | `overview-stats`; Definitionen drift |
| N+1 entfernt | **NOT_READY** | P0 | HTTP N+1 in `StationsView` |
| Partial Data | **PARTIAL** | P1 | `null` KPIs ohne Degradation-Metadaten |
| UI und Mobile | **PARTIAL** | P0 | Views responsive; kein Flag-Gating |
| Audit Trail | **MISSING** | P0 | Flag ohne Consumer |
| Monitoring | **MISSING** | P1 | Keine `stations_v2_*` Metriken |
| Tests | **PARTIAL** | P1 | Flag-Resolver only; kein E2E |
| Feature Flags | **PARTIAL** | P0 | Backend scaffold; Frontend unwired |
| Geofence ohne operative Wirkung | **OK (Ist)** | P1 | Kein GPS-Writer; Shadow-DTO fehlt |

---

## 3. Befunde nach Prüfbereich

Schweregrad: **P0** = sicherheitskritisch / Datenverlust / Vertragsbruch; **P1** = fachliche Inkonsistenz / Rollout-Risiko; **P2** = UX, Testschuld, Dokumentationsdrift.

### 3.1 Permission- und Scope-Enforcement

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| SEC-01 | `StationsController` nutzt nur `OrgScopingGuard`, `RolesGuard` (no-op ohne `@Roles`), `StationsV2FeatureGuard` — **kein** `PermissionsGuard` / `@RequirePermission('stations', …)` | **P0** | OPEN | `stations.controller.ts:33-35` |
| SEC-02 | Jedes aktive Org-Mitglied kann alle 18 Station-Endpunkte schreiben (create, archive, delete, set-primary, SET vehicles) | **P0** | OPEN | `organization-role.defaults.ts`; Controller |
| SEC-03 | `driver`-Rolle ohne `stations`-Permission kann API dennoch aufrufen | **P1** | OPEN | Templates vs. Controller |
| SEC-04 | Granulare V2-Keys (`stations.read`, `stations.archive`, …) aus `stations-v2-permissions.md` nicht implementiert | **P2** | OPEN | Nur Legacy-Modul `stations` |
| SEC-05 | `StationScopeGuard` existiert, ist **nirgends** registriert | **P0** | OPEN | `station-scope.guard.ts`; kein Import in Controller |
| SEC-06 | JWT/`request.user` enthält kein `stationScope` / `stationIds` — Guard könnte nicht arbeiten | **P0** | OPEN | `auth.guard.ts:91-99`; `schema.prisma` Membership-Felder ungenutzt |
| SEC-07 | Guard prüft `params.stationId`, Routen nutzen `:id` | **P1** | OPEN | `station-scope.guard.ts:26` |
| SEC-08 | `stationsScopeV2Enabled` hat keine Wirkung auf Stations-Routen | **P1** | OPEN | Flag-Resolver vs. unwired Guard |
| SEC-09 | `NotificationStationScopeService` filtert korrekt — Pattern **nicht** in Stations-Modul wiederverwendet | **P2** | OPEN | `notification-station-scope.service.ts` |

### 3.2 Listen-/KPI-Scope

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| KPI-S-01 | `findAll`, `getStationStats`, `getStationOverviewStats` filtern nur `organizationId` | **P0** | OPEN | `stations.service.ts:149-163`, `366-376` |
| KPI-S-02 | `unassignedVehicles` org-weit, nicht scope-gefiltert | **P1** | OPEN | `getStationStats` |
| KPI-S-03 | Spec R7 (scoped User keine org-weiten KPIs) unerfüllt | **P0** | OPEN | `stations-v2.md` §7, §13 |

### 3.3 Lifecycle-Invarianten

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| LIFE-01 | `archive()` setzt ARCHIVED, `archivedAt`, `isPrimary=false`, pickup/return off — **korrekt** | — | OK | `stations.service.ts:283-299` |
| LIFE-02 | `PATCH :id` via `buildWriteData` kann `status: ARCHIVED` ohne vollständige Invarianten | **P1** | OPEN | vs. dediziertes `archive()` |
| LIFE-03 | `PATCH` kann `isPrimary: true` auf archivierten Stationen setzen; `setPrimaryStation` verbietet das | **P1** | OPEN | `setPrimaryStation` vs. `buildWriteData` |
| LIFE-04 | `restore()` setzt blind `ACTIVE`, `pickupEnabled=true`, `returnEnabled=true` | **P1** | OPEN | `stations.service.ts:302-316` (W-12) |
| LIFE-05 | Lifecycle-Routen flag-gated; generisches `PATCH`/`DELETE` nicht | **P1** | OPEN | `stations.controller.ts` |
| LIFE-06 | ARCHIVED blockiert Pickup/Return in `StationValidationService` | — | OK | `station-validation.service.ts` |

### 3.4 Primary-Eindeutigkeit

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| PRIM-01 | `create` / `update` / `setPrimaryStation` / `archive` löschen andere Primaries in Tx | — | OK | `stations.service.ts` |
| PRIM-02 | Kein DB Partial-Unique auf `(organizationId) WHERE is_primary` | **P1** | OPEN | `schema.prisma` Station |
| PRIM-03 | Race: parallele `setPrimary` ohne DB-Constraint | **P2** | OPEN | App-only |
| PRIM-04 | Keine Tests für Primary-Eindeutigkeit | **P2** | OPEN | `stations.service.spec.ts` |

### 3.5 Kein Hard Delete

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| DEL-01 | `delete()`: unverknüpfte Stationen → `prisma.station.delete` | **P0** | OPEN | `stations.service.ts:340-358`; Verstoß S4/R10 |
| DEL-02 | `DELETE :id` exponiert, nicht feature-gated, kein Permission-Guard | **P1** | OPEN | `stations.controller.ts:187-189` |
| DEL-03 | Verknüpfte Stationen werden archiviert (nicht gelöscht) | — | OK | Test `stations.service.spec.ts` |
| DEL-04 | `expectedStationId`-only Links blockieren Hard Delete nicht | **P1** | OPEN | `hasLinks`-Prüfung |

### 3.6 Archive Preview

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| AP-01 | Kein `GET …/archive-preview` (Fahrzeuge, Buchungen, Primary, Capabilities) | **P1** | OPEN | Spec / Migration Plan |
| AP-02 | UI: Ein-Klick-Archive ohne Impact-Dialog | **P2** | OPEN | `StationsView.tsx` |
| AP-03 | Archive erlaubt bei verknüpften Fahrzeugen/Buchungen ohne Warnung | **P1** | OPEN | `archive()` |

### 3.7 Restore-Fähigkeiten

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| RES-01 | `POST …/restore` API vorhanden, flag-gated | — | OK | `stations.controller.ts` |
| RES-02 | Kein `archived_capabilities_snapshot` — Restore kann Capabilities nicht rekonstruieren | **P1** | OPEN | Migration Plan §4 |
| RES-03 | **Keine** Frontend-Call-Site für `api.stations.restore` | **P1** | OPEN | Grep rental/components/stations |
| RES-04 | Restore verliert vorherigen `INACTIVE`-Status | **P2** | OPEN | `restore()` |

### 3.8 Home / Current / Expected-Trennung

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| HCE-01 | `assignVehicleToStation(target: 'home')` setzt **home + current** | **P0** | OPEN | `stations.service.ts:604-606`; S1/R3 |
| HCE-02 | `setStationVehicles` attach/detach koppelt home + current | **P0** | OPEN | `stations.service.ts:743-758` |
| HCE-03 | `registerFromDimo` optional `stationId` → home + current | **P2** | OPEN | `vehicles.service.ts` |
| HCE-04 | Handover schreibt nur `currentStationId` — **korrekt getrennt** | — | OK | `bookings-handover.service.ts` |
| HCE-05 | `expectedStationId` kaum produktiv gesetzt; Booking One-Way setzt Expected nicht | **P1** | OPEN | Bookings / Transfer fehlt |
| HCE-06 | Home-Änderung löscht `expectedStationId` nicht (R5) — **korrekt** bei Detach | — | OK | `setStationVehicles` detach |
| HCE-07 | `POST …/change-home-station` (410-Ersatz) **nicht implementiert** | **P0** | OPEN | 410-Response in Controller |

### 3.9 Kein Bulk SET / Flotten > 500 (bzw. API-Cap)

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| SET-01 | `PUT …/:id/vehicles` SET-Semantik aktiv; partieller Client-Detach (S2) | **P0** | OPEN | `setStationVehicles` |
| SET-02 | UI `StationAssignVehicleModal`: `listByOrg(…, { limit: 500 })` — Backend clamp **100** | **P0** | OPEN | `pagination.ts:18`; Modal Z.41 |
| SET-03 | Org mit > 100 Fahrzeugen: Save detachiert nicht geladene Fahrzeuge **still** | **P0** | OPEN | Invariante S2 |
| SET-04 | Kein `home-fleet/preview` Delta-API | **P1** | OPEN | Deployment Runbook Schritt 5 |
| SET-05 | `assignVehicle` Delta-API existiert, **kein** UI-Consumer | **P2** | OPEN | `api.stations.assignVehicle` unused |
| SET-06 | Legacy-Duplikat in `SettingsView.tsx` (gleiches SET-Muster) | **P2** | OPEN | Settings Stations-Tab |

### 3.10 Current Position Source

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| CPS-01 | Keine Spalten `currentStationSource`, `currentStationConfirmedAt` | **P1** | OPEN | `schema.prisma` Vehicle |
| CPS-02 | Handover schreibt Current ohne Provenance (R4) | **P1** | OPEN | `bookings-handover.service.ts` |
| CPS-03 | `updateVehicleCurrentStation` raw patch, flag-gated | **P1** | OPEN | `stations.service.ts:625+` |

### 3.11 Transfer-Lifecycle

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| TRF-01 | Kein `vehicle_station_transfers` Modell / Service / API | **P1** | OPEN | `schema.prisma`; Migration Plan |
| TRF-02 | `stationTransfersEnabled` Flag ohne Implementation | **P1** | OPEN | Feature-Flags contract |
| TRF-03 | Kein Plan/Arrive/Cancel; kein `CompleteTransfer` | **P1** | OPEN | `stations-v2.md` §10 |
| TRF-04 | `assignVehicle(…, expected)` nur API, kein UI | **P2** | OPEN | Controller only |

### 3.12 Booking Rules

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| BR-01 | Vier-Outcome-Engine (ALLOWED/WARNING/MANUAL/BLOCKED) **fehlt** | **P0** | OPEN | Spec §11 R8; AC-07 |
| BR-02 | `StationValidationService` wirft nur `BadRequestException` (BLOCKED-äquivalent) | **P0** | OPEN | `station-validation.service.ts` |
| BR-03 | `stations-v2-booking-rules-enforcement.util.ts` **nicht** in `BookingsService` verdrahtet | **P0** | OPEN | Kein Caller |
| BR-04 | `shouldSurfaceCapacityWarning` / `stationCapacityWarningsEnabled` ohne Consumer | **P1** | OPEN | Enforcement util |
| BR-05 | Frontend `stationBookingUtils.ts` client-seitige Warnungen — divergiert von Server | **P2** | OPEN | `frontend/src/rental/lib/` |

### 3.13 Öffnungszeiten, Feiertage, Zeitzonen, After-hours

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| CAL-01 | `openingHours` persistiert + `openingHoursIsMissing` in KPI | — | OK | `station.types.ts` |
| CAL-02 | Kein Backend `isOpenAt`; Regeln `OUTSIDE_OPENING_HOURS` / `HOLIDAY_CLOSED` fehlen | **P0** | OPEN | Kein Calendar-Service |
| CAL-03 | `holidayRules` ohne Evaluator | **P1** | OPEN | Schema only |
| CAL-04 | `todayPickups` / `todayReturns` nutzen Server-Midnight, nicht `station.timezone` | **P1** | OPEN | `stations.service.ts:412-415` (W-10) |
| CAL-05 | `afterHoursReturnEnabled` nicht in Booking-Validation | **P1** | OPEN | `station-validation.service.ts` |
| CAL-06 | Frontend `stationUtils.ts` nur Display | **P2** | OPEN | Kein Shared Domain Module |

### 3.14 Kapazität

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| CAP-01 | Keine Booking-Zeit-Regel `CAPACITY_EXCEEDED` | **P0** | OPEN | Spec §11.3 |
| CAP-02 | `capacityUsagePercent` nutzt home∪current, Spec: `vehicleCountHome / capacity` | **P1** | OPEN | `stations.service.ts:407-410` (W-11) |
| CAP-03 | `StationShortageDetector` separate 24h-Heuristik, nicht `Station.capacity` | **P2** | OPEN | `station-shortage.detector.ts` |

### 3.15 Runtime-State-KPIs

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| KPI-01 | `getStationOverviewStats` liefert Runtime-KPIs | — | PARTIAL | `stations.service.ts:398+` |
| KPI-02 | `bookedVehicles` = `RENTED` count, nicht aktive Buchungen | **P1** | OPEN | Spec §13.4 |
| KPI-03 | Listen-`vehicleCount` = home only; Overview `totalVehicles` = home∪current | **P1** | OPEN | Drift W-11 |
| KPI-04 | `openTasks` begrenzt durch `take: 500` Booking-IDs | **P1** | OPEN | `getStationOverviewStats` |
| KPI-05 | Kein `StationReadModelService` / Batch-Summaries (R11) | **P0** | OPEN | Spec §13 |

### 3.16 N+1 entfernt

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| N1-01 | `StationsView`: 1× `overviewStats` pro Station (HTTP N+1) | **P0** | OPEN | `StationsView.tsx:167-168` |
| N1-02 | `getStationOverviewStats`: ~12 DB-Ops pro Request | **P1** | OPEN | `stations.service.ts` |
| N1-03 | `StationShortageDetector`: 2 Queries × Station-Anzahl | **P1** | OPEN | Detector loop |
| N1-04 | `validateBookingStations`: bis 4 sequentielle Station-Fetches | **P1** | OPEN | Validation service |
| N1-05 | `findAll` / `getStationStats` batched mit `_count` | — | OK | `stations.service.ts` |

### 3.17 Partial Data

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| PD-01 | `vehiclesWithHealthWarnings: null` ohne `partialFields` Metadaten | **P1** | OPEN | `getStationOverviewStats` return |
| PD-02 | UI schluckt fehlgeschlagene `overviewStats` (`.catch(() => null)`) | **P1** | OPEN | `StationsView.tsx` |
| PD-03 | Shadow-Runbook referenziert `stations_v2_partial_read_total` — **nicht instrumentiert** | **P2** | OPEN | Runbook vs. Code |

### 3.18 UI und Mobile

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| UI-01 | `StationsView`, `StationDetailView`, Modals — responsive / Mobile Sheets | — | OK | `stations/*.tsx` |
| UI-02 | `stationsUiV2Enabled` **nicht** in `App.tsx` / `Sidebar` geprüft | **P0** | OPEN | Grep rental |
| UI-03 | `useStationsV2FeatureFlags` existiert, **kein** Import in Station-Komponenten | **P1** | OPEN | Hook dead code |
| UI-04 | Frontend-Typen importieren fehlende `stations-v2-feature-flags.contract` | **P1** | OPEN | `frontend/src/lib/stations-v2-feature-flags.ts` |
| UI-05 | Operator-Oberfläche: kein Stations-Admin (nur `StationSelectFields`) | **P2** | OPEN | `frontend/src/operator` |
| UI-06 | Sidebar zeigt Stations immer (unabhängig von Flags) | **P0** | OPEN | `Sidebar.tsx` |

### 3.19 Audit Trail

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| AT-01 | `stationAuditTrailEnabled` ohne Runtime-Consumer | **P0** | OPEN | Feature flags only |
| AT-02 | Generischer `AuditInterceptor` mappt `/stations` → `ActivityEntity.STATION` | — | PARTIAL | HTTP-Level only |
| AT-03 | Keine Domain-Events (HOME_ASSIGNED, PRESENCE_CONFIRMED, RULE_OVERRIDE, …) | **P1** | OPEN | Spec §14 |
| AT-04 | Keine `station_events` Tabelle | **P2** | OPEN | Migration Plan |

### 3.20 Monitoring

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| MON-01 | Keine Prometheus-Metriken `synqdrive_stations_v2_*` | **P1** | OPEN | `observability/` |
| MON-02 | Shadow-/Deployment-Runbooks referenzieren nicht existierende Metriken/Scripts | **P1** | OPEN | `test:stations:v2`, partial_read |
| MON-03 | Kein strukturiertes Logging für `StationsV2FeatureDisabledError` (503) Volumen | **P2** | OPEN | Guard |

### 3.21 Tests

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| TST-01 | Flag-Resolver + Enforcement util + Config-Service Specs | — | OK | `*feature-flags*.spec.ts` |
| TST-02 | `stations.service.spec.ts` — Lifecycle/Scope/Home-Current **nicht** abgedeckt | **P1** | OPEN | ~10 Tests |
| TST-03 | Kein `StationsV2FeatureGuard` Integrationstest | **P2** | OPEN | — |
| TST-04 | Kein E2E für Stations UI / Flag-Gates | **P1** | OPEN | `frontend/e2e/` |
| TST-05 | `npm run test:stations:v2` in Runbook — **Script fehlt** | **P1** | OPEN | `package.json` |
| TST-06 | `stations-v2-diagnose` CLI auf Branch nicht vorhanden (Prompt 73 separat) | **P2** | OPEN | Runbook-Hinweis |

### 3.22 Feature Flags

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| FF-01 | Contract, Resolver, Config, Guard, `GET feature-flags` | — | OK | `stations-v2-feature-flags.*` |
| FF-02 | Guards auf Lifecycle, Summary, Positioning, Delta, Schema | — | PARTIAL | `stations.controller.ts` |
| FF-03 | List, stats, CRUD, SET, bookings, DELETE **ungated** | **P1** | OPEN | Controller |
| FF-04 | Audit, Geofence, Transfers, Capacity, Booking Rules — Flag **ohne** Backend-Feature | **P1** | OPEN | Resolver only |
| FF-05 | Org-Allowlist + Dependency-Closure + Test-Defaults | — | OK | Resolver Specs |
| FF-06 | Frontend konsumiert Flags nicht operativ | **P0** | OPEN | UI-02, UI-03 |

### 3.23 Geofence ohne operative Wirkung

| ID | Befund | Sev | Status | Evidenz |
|----|--------|-----|--------|---------|
| GEO-01 | **Kein** Worker/Webhook schreibt `currentStationId` aus GPS/Geofence | — | OK | R9/S3 erfüllt |
| GEO-02 | Client `HomeAwayBadge` + `isVehicleAtHomeStation` — read-only | — | OK | `geospatial.ts`, `HomeAwayBadge.tsx` |
| GEO-03 | `stationGeofenceShadowEnabled` ohne Server-`GeofenceShadowDto` | **P1** | OPEN | Spec §15.2 |
| GEO-04 | Client-Geofence nicht an Flag gebunden | **P2** | OPEN | Badge always on |
| GEO-05 | Home/Current-Kopplung ist **kein** Geofence-Write, aber operativer Current-Write | **P0** | OPEN | HCE-01 (separat) |

---

## 4. P0-Rollup (Rollout-Blocker)

| ID | Thema | Maßnahme (kurz) |
|----|-------|-----------------|
| SEC-01/02 | RBAC | `PermissionsGuard` + `@RequirePermission` pro Route |
| SEC-05/06 | Scope | JWT-Scope laden; Guard auf Controller; List/KPI filtern |
| KPI-S-01/03 | KPI-Scope | Scope in Read Model |
| DEL-01 | Hard Delete | Immer `archive()`; DELETE deprecaten |
| HCE-01/02/07 | Home/Current | Entkoppeln; Delta-API + UI |
| SET-01/02/03 | Bulk SET | SET abschalten oder Server-Vollständigkeit; Pagination fix |
| BR-01/02/03 | Booking Rules | Rule Engine + Bookings-Integration |
| CAL-02 | Opening Hours | `isOpenAt` + Enforcement-Pfad |
| CAP-01 | Kapazität | Booking-Regel |
| KPI-05 / N1-01 | Read Model | Batch-Summaries; kein HTTP N+1 |
| UI-02/06 / FF-06 | UI Flags | `stationsUiV2Enabled` in Router/Sidebar |
| AT-01 | Audit Flag | Implementieren oder Flag aus Rollout-Docs bis bereit |

**Anzahl P0 (unique):** 22 Funde in 12 Themenclustern.

---

## 5. P1- und P2-Überblick

### P1 (Auswahl — 35+ Funde)

Lifecycle-PATCH-Bypass; Primary ohne DB-Constraint; Restore ohne Snapshot/UI; Expected/Transfer fehlt; Provenance; TZ-KPIs; KPI-Definition-Drift; Partial Data; Monitoring-Lücken; Test-/Runbook-Drift; mehrere unwired Flags.

### P2 (Auswahl)

Granulare V2-Permissions; Primary-Race-Tests; Archive-UX; Legacy Settings-Duplikat; `holidayRules`; Operator-Stations-UI; `station_events`; Geofence-Flag an Badge koppeln.

---

## 6. Abnahme gegen Architektur (Auszug)

| AC-ID | Kriterium | Erfüllt |
|-------|-----------|---------|
| AC-01 | Status nur via Domain Commands | **Nein** (PATCH bypass) |
| AC-02 | ARCHIVED erfüllt R2 | **Teilweise** (archive ja, PATCH nein) |
| AC-03 | Home/Current/Expected isoliert | **Nein** |
| AC-04 | Current mit source + confirmedAt | **Nein** |
| AC-05 | Home löscht expected nicht blind | **Ja** |
| AC-06 | Scoped User KPI/List | **Nein** |
| AC-07 | Vier Booking-Outcomes | **Nein** |
| AC-P05 (Permissions) | KPI ohne ausgeblendete Stationen | **Nein** |

Vollständige AC-Liste: [`stations-v2.md`](../architecture/stations-v2.md) §18.

---

## 7. Empfohlene Reihenfolge (post-audit)

1. **P0 Sicherheit:** Permissions + Scope + List-Filter  
2. **P0 Datenintegrität:** SET absichern / Delta-Home-Fleet; Home/Current entkoppeln  
3. **P0 Hard Delete** entfernen  
4. **Read Model:** Batch-Summaries, KPI-Definitionen vereinheitlichen  
5. **Booking Rules:** Engine + shadow/warning/enforce verdrahten  
6. **Calendar:** TZ + `isOpenAt` + Holidays  
7. **Transfer + Provenance** (Schema-Migration)  
8. **Audit Trail + Monitoring** vor breitem Rollout  
9. **Frontend:** Flag-Gating, Types, E2E  
10. **Shadow Validation** gemäß Runbook — dann Deployment Schritt 7+

---

## 8. Dokumentations- und Tooling-Drift

| Referenz | Problem | Sev |
|----------|---------|-----|
| `stations-v2-deployment.md` → `npm run test:stations:v2` | Script existiert nicht | P1 |
| `stations-v2-deployment.md` → `stations-v2-diagnose` | CLI auf `main`/diesem Branch fehlt (Prompt 73) | P2 |
| `stations-v2-data-remediation.md` | Datei referenziert, nicht im Repo | P2 |
| `ArchitekturView` behauptet UI-Gating via `useStationsV2FeatureFlags` | Nicht im Code verdrahtet | P2 |

---

## 9. Code-Referenzindex

| Bereich | Primäre Pfade |
|---------|----------------|
| API / Guards | `backend/src/modules/stations/stations.controller.ts` |
| Domain / KPI | `backend/src/modules/stations/stations.service.ts` |
| Validation | `backend/src/modules/stations/station-validation.service.ts` |
| Feature Flags | `backend/src/shared/stations/stations-v2-feature-flags.*` |
| Scope Guard | `backend/src/shared/guards/station-scope.guard.ts` |
| Bookings | `backend/src/modules/bookings/bookings.service.ts`, `bookings-handover.service.ts` |
| Frontend UI | `frontend/src/rental/components/stations/` |
| Geofence (read-only) | `frontend/src/lib/geospatial.ts`, `HomeAwayBadge.tsx` |
| Tests | `backend/src/shared/stations/*.spec.ts`, `stations.service.spec.ts` |

---

## 10. Schlussfolgerung

Stations V2 ist **spezifiziert und teilweise vorbereitet**, aber **nicht abnahmereif** für den im Ausführungsvertrag und Deployment-Runbook beschriebenen Voll-Rollout. Die **Geofence-Anforderung „keine operative Wirkung auf Current“** ist im Ist-Code erfüllt (kein GPS-Writer); das **Shadow-Read-Model** und flag-gesteuerte Geofence-Oberfläche fehlen.

**Freigabeempfehlung:**

| Stufe | Freigabe |
|-------|----------|
| Shadow-Pilot (Canary, `enforce=shadow`, Org-Admin) | Nach Behebung SET/Home-Current **P0** und RBAC **P0** |
| `warning` + Capacity | Nach Booking-Rules-Engine + Calendar **P0** |
| `enforce` + UI breit + Legacy-SET aus | Nach Shadow-Validation Gate-Review + alle P0 geschlossen |
| Geofence Auto-Current | **Explizit nicht** — eigener Prompt + Vertrag |

---

*Read-only Audit — keine Repository-Änderungen außer dieser Datei. Kein Deployment, kein Produktionsrestart.*
