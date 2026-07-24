# Vehicle Detail Page — Kanonische Sources of Truth

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Basis** | Prompt 1/36 — [`vehicle-detail-page-dependency-map-2026-07.md`](./vehicle-detail-page-dependency-map-2026-07.md) |
| **Scope** | Prompt 2/36 — **nur Analyse, kein Produktivcode** |
| **Methode** | Code-Inspektion aller Ableitungspfade in Header, Overview, Fleet, Dashboard, Runtime Builder, Map, Stores, Mapper, Backend, Provider |

---

## Scope

Für jedes sichtbare und fachlich relevante Datenfeld der Rental Vehicle Detail Page wird festgelegt:

1. **Aktuelle Quelle(n)** — wo der Wert heute herkommt
2. **Aktuelle Ableitung(en)** — welche Frontend-/Backend-Logik ihn transformiert
3. **Konflikt** — ob verschiedene Oberflächen divergieren
4. **Kanonische Quelle (Soll)** — welche Schicht Source of Truth sein muss
5. **Zulässiger Fallback** — wann und wie abgewichen werden darf
6. **UI-Darstellung** — wie der Wert dem Operator gezeigt werden soll

### Vereinbarte Runtime-State-Logik (Telemetrie)

| Zustand | Bedingung | Code-Äquivalent |
|---------|-----------|-----------------|
| **unknown** | Kein verwertbarer Zeitstempel | `no_signal` |
| **live** | Tatsächlich frisch | `< 15 min` seit kanonischem `observedAt` |
| **standby** | Unter 24h, aber nicht live | `15 min … 24 h` |
| **soft-offline** | 24–48 Stunden | `signal_delayed` |
| **offline** | Ab 48 Stunden | `offline` |

Implementiert in:
- Backend: `vehicle-state-interpreter.ts`, `telemetry-freshness.resolver.ts`
- Frontend: `telemetryFreshness.ts`, `vehicleRuntimeStateBuilder.deriveTelemetryState`

### Produktregeln (bindend für Soll-Zustand)

- **Available ≠ Ready to Rent** — operative Verfügbarkeit und Rental Readiness sind getrennte Domänen
- **Warnungen blockieren nicht automatisch** — `overall_state: warning` allein blockiert nicht
- **Critical ≠ Maintenance** — Health-Critical erzwingt keinen Wartungsstatus
- **Fehlender Messwert ≠ 0** — `null`/`undefined` müssen als „keine Daten“ dargestellt werden
- **Cache-Position ≠ live** — Fleet-Map-Koordinaten und Live-GPS sind getrennt zu labeln
- **Provider-Messzeit ≠ Empfangszeit** — `providerObservedAt` / `sourceTimestamp` vs. `receivedAt` / DB-`updatedAt`

---

## Architektur-Schichten (Soll-Hierarchie)

```
┌─────────────────────────────────────────────────────────────┐
│  UI (Header, Overview, Tabs) — nur Darstellung, kein Truth  │
├─────────────────────────────────────────────────────────────┤
│  Display Layer — resolveFleetVehicleDisplayState,           │
│  vehicleRuntimeStateBuilder, overview-map-position          │
├─────────────────────────────────────────────────────────────┤
│  Frontend Read Models — VehicleData, useVehicleLiveMapStore │
├─────────────────────────────────────────────────────────────┤
│  API Mapper — mapFleetMapVehicleResponse, useLiveVehicleTelemetry │
├─────────────────────────────────────────────────────────────┤
│  Backend Services — VehiclesService, RentalHealthService,   │
│  interpretVehicleState, telemetry-freshness.resolver        │
├─────────────────────────────────────────────────────────────┤
│  DB / Provider — Vehicle, VehicleLatestState, DimoVehicle,  │
│  DIMO live signals, RentalHealth projection                 │
└─────────────────────────────────────────────────────────────┘
```

**Wiederverwendbare kanonische Module (nicht neu erfinden):**

| Modul | Pfad | Rolle |
|-------|------|-------|
| Operative Status Engine | `backend/.../deriveFleetStatusContext` + `frontend/.../vehicle-operational-state/` | Booking-abgeleiteter Fleet-Status |
| Telemetry Freshness | `telemetry-freshness.resolver.ts` + `telemetryFreshness.ts` | 5-State Freshness |
| Fleet Display | `fleetVehicleDisplay.ts` | Trennung Operational / Health / Rental / Telemetry |
| Runtime Builder | `vehicleRuntimeStateBuilder.ts` | Dashboard-Aggregation |
| Rental Health V1 | `RentalHealthService` + `VehicleHealthResponse` | Readiness, Blocking, Module Severity |
| Live Telemetry Hook | `useLiveVehicleTelemetry` + `useVehicleLiveMapStore` | Detail-seitiges Polling |
| Map Position | `overview-map-position.ts` | Live vs. Cache vs. Static |

---

## Feld-Matrix

| Feld | Aktuelle Quellen | Aktuelle Ableitungen | Konflikt | Kanonische Quelle (Soll) | Zulässiger Fallback | UI-Darstellung |
|------|------------------|----------------------|----------|--------------------------|----------------------|----------------|
| **Fahrzeug-ID** | `Vehicle.id` (UUID) aus Fleet-Map; `selectedVehicle.id` in App.tsx | Keine Transformation | Nein | `Vehicle.id` (PostgreSQL PK), org-scoped via API | — | Intern; nicht prominent im Header |
| **Organisation** | `RentalContext.orgId` aus JWT | Alle API-Calls prefix `organizations/:orgId/` | Nein | JWT `organizationId` + `OrgScopingGuard` | — | Nicht auf Vehicle Detail sichtbar |
| **Kennzeichen** | Fleet-Map `licensePlate` → `mapFleetMapVehicleResponse.license` | — | Nein | `Vehicle.licensePlate` via Fleet-Map | `GET .../vehicles/:id` bei Einzelfetch | Header Meta-Zeile |
| **Marke** | Fleet-Map `make` | — | Nein | `Vehicle.make` | — | Header-Titel (mit Modell/Jahr) |
| **Modell** | Fleet-Map `model` | Fallback `make \|\| licensePlate` im Mapper | Gering | `Vehicle.model` | `make` nur als Anzeige-Fallback | Header-Titel |
| **Baujahr** | Fleet-Map `year` | `year ?? 0` im Mapper | Gering (0 bei fehlend) | `Vehicle.year` | `null` → „—“ | Header-Titel |
| **Station** | Fleet-Map `stationName` → `VehicleData.station`; `homeStationId`, `currentStationId` | String-Name für Filter/Legacy | Gering | `Vehicle.homeStation` (Name + ID); `currentStationId` für Ist-Standort | Leerstring wenn unassigned | Header Meta (Name); ID intern |
| **Operativer Fahrzeugstatus** | Fleet-Map `operationalState.status` via `deriveFleetStatusContext` | `selectOperationalStatus`; Header mischt mit lokalem `vehicleStatus` | **Ja** — Header-Dropdown nutzt lokalen State, nicht API | `operationalState.status` aus Fleet-Map (`AVAILABLE`/`RESERVED`/`ACTIVE_RENTED`/`MAINTENANCE`/`BLOCKED`/`UNKNOWN`) | `UNKNOWN` bei Booking-Load-Failure | Status-Chip via `resolveOperationalStatusBadge` — nie aus lokalem Dropdown |
| **Manuelle Blockierung** | DB `Vehicle.status = OUT_OF_SERVICE` oder `BLOCKED`; `maintenanceReasonCode = OPERATIONAL_BLOCK` | `deriveFleetStatusContext` → `MAINTENANCE` oder `BLOCKED` | **Ja** — Header „Manual Block“ ist lokaler UI-State ohne API | `PATCH .../status` mit `OUT_OF_SERVICE` + `maintenanceReasonCode: OPERATIONAL_BLOCK` → abgeleiteter `operationalState` | — | „Blockiert“ / „Manual Block“ nur wenn Backend `BLOCKED` oder `MAINTENANCE`+`OPERATIONAL_BLOCK` |
| **Wartungsstatus** | DB `IN_SERVICE`; `maintenanceReasonCode: SCHEDULED_SERVICE` | `operationalState.status === MAINTENANCE` | **Ja** — Header „Maintenance“ lokal, nicht persistiert | `operationalState.status === MAINTENANCE` aus Fleet-Map | Raw DB status nur intern | „Wartung“-Chip; Critical Health darf **nicht** Maintenance implizieren |
| **Reinigungsstatus** | DB `Vehicle.cleaningStatus`; Fleet-Map gespiegelt | `normalizeCleaningStatus`; PATCH via `updateOperationalStatus` | Nein (PATCH korrekt) | `Vehicle.cleaningStatus` (`CLEAN`/`NEEDS_CLEANING`) | — | Header Cleaning-Dropdown; triggert `VehicleCleaningTaskService` |
| **Rental Readiness** | `GET .../rental-health` → `VehicleHealthResponse` | `useFleetHealthMap` / `useEffectiveHealth`; `resolveRentalDisplay`; `deriveIsReadyForRenting` | Gering — Overview-Readiness nutzt nur `rental_blocked`, Fleet Display trennt | `RentalHealthService` pro Fahrzeug: `availability`, `rental_blocked`, `overall_state` | `null` rental_blocked = unbekannt, nicht „bereit“ | Separates „Ready/Not Ready“-Badge — **nie** aus operativem Available ableiten |
| **Blocking Reasons** | `VehicleHealthResponse.blocking_reasons[]` | `fleetVehicleDisplay.buildReasonBadge`; `fleetVisualState`; Overview `collectBlockedReasons` | Gering — manche Surfaces filtern Service-Gründe | `rental-health.blocking_reasons` (backend-normalisiert) | Leeres Array = kein Blocker | Konkrete Chips, keine generischen Health-Phrasen |
| **Critical Reasons** | `rental-health.modules.*.state === 'critical'`; `blocking_reasons`; `overall_state === 'critical'` | `pickModuleReason`, `isHealthCritical`, Runtime `RuntimeReason` | Mittel — Fleet Display filtert Service-only Critical | Modul-spezifische `reason` aus `RentalHealthModule` + bestätigte `blocking_reasons` | Health-Tab Detail-Endpoints für Tiefe | „Kritisch“-Chip + konkreter Modulgrund (Bremsen, DTC, …) |
| **Health Severity** | `rental-health.overall_state` (good/warning/critical/unknown) | `resolveHealthDisplay`; `vehicle-health-box.mapper`; Legacy `vehicle.healthStatus` | **Ja** — Legacy `healthStatus` auf Fleet-Map noch vorhanden | `rental-health.overall_state` | Legacy `healthStatus` nur wenn rental-health fehlt | `VehicleHealthChip`: Gut/Warnung/Kritisch/Unbekannt |
| **Compliance Severity** | `rental-health.modules.service_compliance`; TÜV/BOKraft in Health Tab | `deriveComplianceSeverity` (Runtime Builder); `buildTuvComplianceDisplay` | Mittel — nur Dashboard Runtime explizit; Overview/Header nicht | `rental-health.modules.service_compliance.state` + Service-Compliance-Service | Health-Tab `service-info-status` für Detail | Compliance als Health-Modul, nicht als operativer Status |
| **Booking State** | `operationalState` + `bookingContext` aus Fleet-Map | `selectBookingContext`; `deriveBookingState` (Runtime); flache Legacy-Felder (`activeBookingId`, …) | Gering — Legacy-Felder sind Projektion | `bookingContext` (active/reserved/next) aus `deriveFleetStatusContext` | Legacy flat fields read-only | Booking-Supplement-Zeile im Header; nie aus lokalem State |
| **Telemetry State** | Fleet-Map: `telemetryFreshness`, `signalAgeMs`, `lastSeenAt`; Detail: `useVehicleLiveMapStore` | `resolveTelemetryFreshness` (FE); `deriveTelemetryState` (Runtime); `interpretVehicleState` (BE) | Mittel — Detail-Store kann von Fleet-Map abweichen während Poll | Backend `telemetryFreshness` aus `telemetry-freshness.resolver` (Fleet-Map + `/telemetry`) | Frontend `resolveTelemetryFreshness` nur wenn Backend-Feld fehlt | 5-State: Live/Standby/Verzögert/Offline/Kein Signal |
| **Data Quality State** | `operationalState.dataQualityState`, `isReliable`, `dataQualityReasons` | `selectIsStatusReliable`; Runtime `payloadInconsistent` | Gering | `operationalState.dataQualityState` aus Fleet-Map API | `UNKNOWN` wenn Booking-Kontext nicht ladbar | `VehicleOperationalStatusCallout` bei unreliable |
| **Device Connection** | `GET .../device-connection`; `connectivityRuntime` auf Fleet-Map | `VehicleDeviceConnectionCard`; `FleetConnectivityTab` (separat) | Gering — Overview-Card vs. Fleet Connectivity Tab | `DeviceConnectionQueryService` → Episode + Events | Online-Badge allein reicht nicht | Overview: Episode-Summary; Header: Online/Offline aus Telemetrie |
| **GPS-Position (Detail Map)** | Live: `GET .../live-gps` (DIMO); Cache: `VehicleLatestState`; Static: Fleet-Map `lat/lng` | `useLiveVehicleTelemetry` → Store; `deriveOverviewMapPosition` | **Ja** — `hasLiveGps` prüft `gpsSource==='dimo'\|\|isFresh` — Cache kann als live gelten | Live: DIMO `live-gps`; Anzeige: Store `targetPosition` nur bei `source:'dimo'` oder frischem Live-Track | `lastConfirmedPosition` → „Last known“; Fleet-Map lat/lng → „Static“ | Map-Badge: Live / Last known / No tracking |
| **Positionsquelle** | `live-gps` Response `source: 'dimo'\|'cache'`; Store `gpsSource` | `OverviewLiveMapCard` tracking badge | Gering | API `source` Feld | `'cache'` → nie als „Live“ labeln | Badge + Hint-Text |
| **Provider-Messzeitpunkt** | DIMO signal `timestamp` / `lastSeen`; `VehicleLatestState.sourceTimestamp` | `resolveCanonicalTelemetryObservedAtMs` (Priorität 1) | Mittel — nicht überall bis UI exponiert | `providerObservedAt` / DIMO signal timestamp | `lastValidTelemetryAt` | Tooltip „Gemessen: …“ (wenn verfügbar) |
| **Empfangszeitpunkt** | DB `VehicleLatestState.updatedAt`; Ingest `receivedAt` | Backfill-Guard: receivedAt darf observedAt nicht verjüngen | Gering | `receivedAt` separat halten; **nicht** für Freshness | — | „Empfangen: …“ nur in Debug/Data-Analyse |
| **Geschwindigkeit** | Detail: `/telemetry` + `/live-gps`; Fleet-Map: oft `0` (nicht befüllt) | `useLiveVehicleTelemetry` → `speedKmh`; `displaySpeed` vom Backend | **Ja** — Fleet-Map setzt `speed: 0` im Mapper | Detail: `useVehicleLiveMapStore.speedKmh` aus `/telemetry` oder live-gps | `null` wenn unbekannt | Overview Map HUD; nie `0` als Default anzeigen |
| **Kilometerstand** | `VehicleLatestState.odometerKm`; Fleet-Map `odometerKm` | Mapper: `odometer: odometerKm ?? 0` (Legacy) | **Ja** — Legacy `odometer: 0` bei fehlend | `odometerKm` nullable | — | „—“ wenn null; formatiert mit Tausendertrennzeichen |
| **Tankstand** | `VehicleLatestState` fuel fields; Fleet-Map `fuelPercent` | `canonicalEnergyPercent` in fleetVehicleDisplay | Gering | `fuelPercent` nullable (ICE) | — | Prozent oder „—“; Tone nur bei echtem Wert |
| **Ladezustand (EV SoC)** | `VehicleLatestState.evSoc`; Fleet-Map `evSoc` | `canonicalEnergyPercent` bevorzugt `evSoc` bei EV | Gering | `evSoc` nullable | `fuelPercent` bei PHEV als Sekundär | Prozent oder „—“ |
| **Reichweite** | HV-Battery Detail (`rangeKm`); nicht in Fleet-Map/Overview | `battery-hv-view-model.ts` | Ja — nicht auf Vehicle Detail Overview | `hv-battery-status` / canonical battery DTO `rangeKm` | — | Nur Health/Battery-Bereich; Overview nicht ohne Daten |
| **12-V-Spannung** | `/telemetry` → `lvBatteryVoltage`; Health Box via Store | `useVehicleHealthBoxData` + Live Store Bridge | Nein auf Overview | `/telemetry` snapshot → `useVehicleLiveMapStore.snapshot.lvBatteryVoltage` | Health-Tab Battery Detail | Health Box; `null` → „—“ |
| **Temperaturen** | `/telemetry` → `coolant`, `displayCoolant`; Battery ambient separat | `interpretVehicleState.displayCoolant` | Gering — nicht alle Surfaces | `VehicleLatestState.coolantTempC` via `/telemetry` | — | Health/Telemetry Popup; null → „—“ |
| **Motorlast** | `/telemetry` → `engineLoad`, `displayEngineLoad` | `interpretVehicleState` | Gering | `VehicleLatestState.engineLoad` | — | Telemetry Detail; null → „—“ |
| **Letzte Aktualisierung** | Fleet-Map `lastSeenAt`; `/telemetry` `lastSignal`; Store `lastSignal` | `resolveTelemetryFreshness` Age-Labels; Header Badge „Xm ago“ | Mittel — Fleet vs. Detail Poll-Zeitpunkt | Kanonisches `observedAtIso` aus `telemetry-freshness.resolver` | `lastSeenAt` von Fleet-Map zwischen Polls | Relative Zeit + Freshness-State; getrennt von Health-`generated_at` |

---

## Querschnitt: Ableitungspfade pro Oberfläche

### Vehicle Detail Header

| Feldgruppe | Aktueller Pfad | Konflikt |
|------------|----------------|----------|
| Identität (Kennzeichen, Marke, Modell, Station) | `selectedVehicle` aus Fleet-Map | Nein |
| Operativer Status-Chip | `resolveFleetVehicleDisplayState` + **lokaler** `vehicleStatus` für Dropdown-Logik | **Ja** — Dropdown schreibt nicht, Chip liest Fleet |
| Cleaning | PATCH + lokaler State | Nein |
| Connection Badge | `useVehicleLiveMapStore` + `resolveTelemetryFreshness` | Kann von Fleet-Map divergieren (30s Poll) |
| Health Chip | `useEffectiveHealth` → rental-health | Nein |
| Rental Readiness | Indirekt über `readinessChipFromDisplay` → Fleet Display | Available-Chip ≠ Ready |

### Vehicle Overview

| Feldgruppe | Aktueller Pfad | Konflikt |
|------------|----------------|----------|
| Map Position | `useVehicleLiveMapStore` + `deriveOverviewMapPosition` + static `selectedVehicle.lat/lng` | Cache-as-live Risiko |
| Health Box | `rental-health` + `useVehicleHealthBoxData` + Live Store LV voltage | Nein |
| Device Connection | `api.vehicles.deviceConnection` (einmalig) | Nicht mit Header-Badge synchron |
| Freshness Hint | `useVehicleOverviewSummary` → Aggregat-Load-States | Nicht identisch mit Telemetry Freshness |
| Readiness | `deriveVehicleOverviewReadiness` — nur `rental_blocked` | Korrekt per Design |

### Fleet Page

| Feldgruppe | Aktueller Pfad | Konflikt |
|------------|----------------|----------|
| Alle Status-Felder | `useFleetMapStore` → `mapFleetMapVehicleResponse` | SoT für operative Daten |
| Display | `resolveFleetVehicleDisplayState` / `deriveFleetVisualState` | Zwei Display-Layer (teilweise redundant) |
| Map Marker | `fleetVisualState` + GeoJSON Builder | — |

### Dashboard

| Feldgruppe | Aktueller Pfad | Konflikt |
|------------|----------------|----------|
| Runtime State | `vehicleRuntimeStateBuilder.buildVehicleRuntimeStates` | Reichste Ableitung — soll Referenz für Aggregation sein |
| Telemetry | `deriveTelemetryState` (eigene Schwellen, kompatibel mit 5-State) | `hasFreshLiveHint` kann live erweitern — dokumentiert |
| Rental Readiness | `deriveIsReadyForRenting` | Trennt Blocking-Kategorien korrekt |

### Runtime State Builder

Kanonische Aggregations-Schicht für Dashboard — **soll** für künftige Vehicle-Detail-Aggregation wiederverwendet werden, nicht parallel neu gebaut.

Schlüssel-Exports:
- `resolveVehicleRuntimeOperationalBlock`
- `deriveTelemetryState`
- `deriveIsReadyForRenting`
- `deriveComplianceSeverity`

### Map (Overview + Trips)

| Kontext | Positions-SoT | Label |
|---------|---------------|-------|
| Overview Live | `useVehicleLiveMapStore.targetPosition` wenn `gpsSource==='dimo'` oder live tracking | „Live“ |
| Overview Last Known | Store `lastConfirmedPosition` | „Last known“ |
| Overview Static | Fleet-Map `lat/lng` | „Last known“ / „No tracking“ |
| Trips Route | `GET .../trips/:id/route` (Waypoints/CH) | Trip-scoped, nicht Vehicle-scoped |

### Telemetrie-Store (`useVehicleLiveMapStore`)

- Gebundener Scope: `bindToVehicle(vehicleId, orgId)` — nur Detail-Tabs
- Aktualisiert durch `useLiveVehicleTelemetry` (5s GPS, 30s Dashboard)
- **Nicht** Fleet-weite SoT — nur Detail-Session-Cache
- `patchIfBound` verhindert Cross-Vehicle-Leaks

### API-Mapper

| Mapper | Rolle |
|--------|-------|
| `mapFleetMapVehicleResponse` | Fleet-Map DTO → `VehicleData`; setzt Legacy-Defaults (`speed:0`, `odometer:0`) — **Konfliktquelle** |
| `useLiveVehicleTelemetry` | `/telemetry` + `/live-gps` → Store |
| `vehicle-health-box.mapper` | Rental-Health + Health-Tab APIs → Box ViewModel |

### Backend-Service

| Service | Felder |
|---------|--------|
| `VehiclesService.deriveFleetStatusContext` | Operativer Status, Booking Context, Maintenance Reason |
| `VehiclesService.getVehicleWithTelemetry` | Detail-Telemetrie-Snapshot |
| `VehiclesService.getLiveGps` | Live GPS + Data-Auth-Enforcement |
| `interpretVehicleState` | displayState, onlineStatus, isLiveTracking |
| `telemetry-freshness.resolver` | Kanonisches observedAt + 5-State |
| `RentalHealthService` | Readiness, Blocking, Module States |

### Provider-Adapter

| Provider | Felder |
|----------|--------|
| DIMO | GPS, Speed, Telemetrie-Signale, Segments, Device Connection Events |
| Mapbox | Karten-Rendering only — keine Daten-SoT |
| High Mobility | Optional parallel zu DIMO für HM-Fahrzeuge |

---

## Konflikt-Register (priorisiert)

| ID | Feld / Bereich | Beschreibung | Schwere |
|----|----------------|--------------|---------|
| C-01 | Operativer Status (Header) | `vehicleStatus` useState vs. `operationalState` API | **P0** |
| C-02 | Manuelle Blockierung / Wartung | UI-Dropdown ohne `PATCH .../status` | **P0** |
| C-03 | Legacy Null → 0 | `mapFleetMapVehicleResponse` setzt `odometer:0`, `speed:0`, `fuel:0` | **P1** |
| C-04 | GPS Live vs. Cache | `isFresh` kann Cache-Position als live werten | **P1** |
| C-05 | Health Severity | Legacy `healthStatus` auf Fleet-Map vs. `rental-health.overall_state` | **P1** |
| C-06 | Zwei Display-Layer | `deriveFleetVisualState` vs. `resolveFleetVehicleDisplayState` | **P2** |
| C-07 | Fleet vs. Detail Telemetry | Fleet-Map 30s Refresh vs. Detail 5s GPS — erwartbar, aber UI muss labeln | **P2** |
| C-08 | Reichweite | Nur HV-Battery-Pfad, nicht Overview — dokumentiert, kein Bug | **P3** |
| C-09 | Device Connection | Overview-Card vs. Header Online-Badge — verschiedene APIs | **P2** |

---

## Soll-Zustand: Kanonische Quelle je Feld

| Domäne | Kanonische Quelle | API / Modul |
|--------|-------------------|-------------|
| Identität & Stammdaten | `Vehicle` + Fleet-Map Projection | `GET .../fleet-map`, `GET .../vehicles/:id` |
| Organisation | JWT + Org Scope | `OrgScopingGuard` |
| Operativer Status | `deriveFleetStatusContext` | `GET .../fleet-map` → `operationalState` |
| Manuelle Blockierung / Wartung | DB `Vehicle.status` + PATCH | `PATCH .../status` → Fleet-Map Refresh |
| Reinigungsstatus | DB `cleaningStatus` | `PATCH .../status` |
| Rental Readiness & Blocking | `RentalHealthService` | `GET .../rental-health` |
| Health / Compliance Severity | `rental-health.modules` + `overall_state` | `GET .../rental-health` |
| Booking State | `bookingContext` in Fleet-Map | `deriveFleetStatusContext` |
| Telemetry Freshness | `telemetry-freshness.resolver` | Fleet-Map + `/telemetry` |
| Data Quality | `operationalState.dataQualityState` | Fleet-Map |
| Device Connection | `DeviceConnectionQueryService` | `GET .../device-connection` |
| Live GPS | DIMO via `getLiveGps` | `GET .../live-gps` |
| Cached Position | `VehicleLatestState` | Fleet-Map `lat/lng` |
| Messwerte (Speed, Odo, Fuel, SoC, LV, Temp) | `VehicleLatestState` via `/telemetry` | `GET .../telemetry` |
| Provider-Messzeit | DIMO `sourceTimestamp` / signal timestamp | `telemetry-freshness.resolver` |
| Empfangszeit | Ingest `receivedAt` / DB `updatedAt` | Separat, nicht für Freshness |
| Letzte Aktualisierung (UI) | `observedAtIso` aus Freshness Resolver | Relative Anzeige via `resolveTelemetryFreshness` |

---

## Lokale Ableitungen — entfernen oder ersetzen (Soll)

| # | Aktuelle lokale Ableitung | Aktion |
|---|-------------------------|--------|
| 1 | `App.tsx` `vehicleStatus` useState für Header-Dropdown | **Entfernen** — lesen/schreiben nur via `PATCH .../status` + Fleet-Map Refresh |
| 2 | `App.tsx` manuelles Mapping Available/Maintenance bei `handleVehicleSelect` | **Ersetzen** durch `selectOperationalStatus` / Display Layer |
| 3 | `mapFleetMapVehicleResponse` Null→0 für `odometer`, `fuel`, `battery`, `speed` | **Ersetzen** — nullable Felder durchreichen; Legacy-Felder deprecaten |
| 4 | `vehicle.healthStatus` auf Fleet-Map als Health-Anzeige | **Ersetzen** durch `rental-health.overall_state` überall |
| 5 | Header Readiness-Chip aus lokalem `vehicleStatus` | **Ersetzen** — nur `resolveFleetVehicleDisplayState.statusBadge` |
| 6 | `deriveFleetVisualState` parallel zu `resolveFleetVehicleDisplayState` | **Konsolidieren** — ein Display-Layer für Fleet + Detail Header |
| 7 | `overview-map-position` `isFresh` als Live-GPS-Heuristik | **Verschärfen** — Live nur bei `gpsSource==='dimo'` |
| 8 | Overview `deriveVehicleOverviewReadiness` eigene Attention-Logik | **Beibehalten** für Attention; Blocking nur aus `rental_blocked` (bereits korrekt) |

---

## Regressionsgefährdete Bereiche (vor Änderungen)

| Priorität | Bereich | Risiko |
|-----------|---------|--------|
| **Hoch** | `App.tsx` Status/Cleaning Handler | Cleaning-PATCH + Task-Automation; Status-Dropdown-Entfernung betrifft UX |
| **Hoch** | `mapFleetMapVehicleResponse` Null→0 | Fleet CSV/Export, Legacy-Komponenten die `odometer`/`fuel` numerisch erwarten |
| **Hoch** | `fleetVehicleDisplay.ts` | Dashboard, Fleet, Header, Operator — zentrale Display-Logik |
| **Hoch** | `vehicleRuntimeStateBuilder.ts` | Dashboard-Slices, Attention-Queue, Ready-for-Renting |
| **Mittel** | `useLiveVehicleTelemetry` + Store | Map-Animation, Connection-Badge, Health Box LV Voltage |
| **Mittel** | `overview-map-position.ts` | Live/Last-known Badge-Regression |
| **Mittel** | `vehicle-operational-query` Invalidierung | Status-PATCH, Handover, Booking — Cache-Kohärenz |
| **Mittel** | `HealthErrorsView` | Eigene Health-Fetches; nicht automatisch mit Display-Layer synchron |
| **Niedrig** | `VehicleRequirementsTab` | Separates Rental-Rules-Modul |
| **Niedrig** | `HealthVehicleDetailDrawer` | Parallele Fleet-Health-UI |

---

## Wiederverwendbare Modelle / Services (nicht neu bauen)

1. **`vehicle-operational-state/`** — Selectors für operativen Status, Booking Context, Reliability
2. **`telemetryFreshness.ts`** + **`telemetry-freshness.resolver.ts`** — 5-State Freshness (FE/BE aligned)
3. **`resolveFleetVehicleDisplayState`** — Operational / Health / Rental / Telemetry Trennung
4. **`vehicleRuntimeStateBuilder`** — Dashboard-Aggregation; Referenz für Readiness-Reasons
5. **`RentalHealthService` / `VehicleHealthResponse`** — Readiness, Blocking, Module Severity
6. **`deriveFleetStatusContext`** — Operative Wahrheit inkl. Booking-Ableitung
7. **`useLiveVehicleTelemetry` + `useVehicleLiveMapStore`** — Detail-Telemetrie-Session
8. **`deriveOverviewMapPosition`** — Map-Position-Modi
9. **`DeviceConnectionQueryService`** — Device Connection Episodes
10. **`invalidateVehicleOperationalState`** — Cache-Invalidierung nach Mutationen

---

## Offene Klärungsfragen

1. Soll `VehicleDetailHeader` Status-Dropdown entfernt oder an `PATCH .../status` angebunden werden?
2. Soll `BLOCKED` vs. `MAINTENANCE`+`OPERATIONAL_BLOCK` im UI unterschieden werden?
3. Sollen `providerObservedAt` und `receivedAt` im Vehicle Detail UI sichtbar werden?
4. Soll Reichweite (`rangeKm`) in Overview erscheinen, wenn HV-Daten vorhanden?
5. Welche Display-Schicht wird kanonisch: `fleetVehicleDisplay` oder `fleetVisualState`?

---

## Änderungshistorie

| Datum | Autor | Änderung |
|-------|-------|----------|
| 2026-07-24 | Cloud Agent Prompt 2/36 | Initiale kanonische Sources-of-Truth-Matrix |
