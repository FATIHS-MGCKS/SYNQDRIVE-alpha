# Stations V2 — Final Fixes (Prompt 77/78)

| Feld | Wert |
|------|------|
| **Datum (UTC)** | 2026-07-18 |
| **Branch** | `cursor/station-v2-final-fixes-c2c2` |
| **Basis-Audit** | [`stations-v2-final-audit.md`](./stations-v2-final-audit.md) |
| **Scope** | P0- und P1-Funde aus Abschnitt 3 + P0-Rollup (Abschnitt 4) |

Keine Produktionsdatenänderung, kein Deployment, keine Geofence-Auto-Aktivierung, keine Trip-Erkennungslogik geändert.

---

## Zusammenfassung

| Cluster | Findings | Status |
|---------|----------|--------|
| RBAC / Scope | SEC-01…08, KPI-S-01…03 | Behoben |
| Hard Delete / Lifecycle | DEL-01…04, LIFE-02…05, RES-02…03 | Behoben |
| Home / Current / SET | HCE-01/02/07, SET-01…04 | Behoben |
| Booking Rules / Calendar | BR-01…04, CAL-02…05, CAP-01/02 | Behoben |
| Read Model / N+1 | KPI-05, N1-01…04, PD-01 | Behoben |
| UI / Flags | UI-02…04/06, FF-06 | Behoben |
| Audit / Monitoring | AT-01, MON-01/02 | Behoben |
| Transfer / Provenance / Geofence | TRF-01…03, CPS-01/02, GEO-03, AP-01/03 | Behoben |
| Tests / Runbook | TST-02/04/05 | Teilweise (kein E2E) |

---

## P0-Fixes

### SEC-01 / SEC-02 — PermissionsGuard fehlte

| | |
|---|---|
| **Ursache** | Controller nutzte nur `OrgScopingGuard`; jedes Org-Mitglied konnte schreiben. |
| **Dateien** | `backend/src/modules/stations/stations.controller.ts` |
| **Lösung** | `@UseGuards(PermissionsGuard)` + `@RequirePermission('stations', read/write/manage)` auf allen Routen. |
| **Tests** | Integration via Controller-Spec-Pattern in `stations-v2-final-fixes.spec.ts` (Service-Layer); manuell: Guard-Wiring im Controller. |
| **Risiko** | Rollen ohne `stations`-Permission verlieren API-Zugriff (gewollt). |

### SEC-05 / SEC-06 / SEC-08 — StationScopeGuard unwired

| | |
|---|---|
| **Ursache** | Guard existierte, war nicht registriert; JWT ohne `stationScope`. |
| **Dateien** | `backend/src/shared/guards/station-scope.guard.ts`, `backend/src/shared/stations/station-access.service.ts`, `backend/src/shared/auth/shared-guards.module.ts`, `stations.controller.ts` |
| **Lösung** | Guard auf Controller; Scope aus `OrganizationMembership.stationIds` / `stationScope` (DB-Lookup, kein JWT-Change); Flag `stationsScopeV2Enabled` steuert Aktivierung. |
| **Tests** | `backend/src/shared/stations/station-access.service.spec.ts` |
| **Risiko** | JWT-embedded Scope (Audit SEC-06) bewusst nicht umgesetzt — DB-Membership ist Source of Truth. |

### KPI-S-01 / KPI-S-03 — Listen/KPI ohne Scope

| | |
|---|---|
| **Ursache** | `findAll`, `getStationStats`, Overview nur `organizationId`. |
| **Dateien** | `stations.service.ts`, `station-read-model.service.ts`, `stations.controller.ts` |
| **Lösung** | `StationAccessContext` in List/Stats/Summaries; `buildStationWhere` / `assertStationReadable`. |
| **Tests** | `station-access.service.spec.ts` |
| **Risiko** | Scoped User mit leerer `stationIds`-Liste sieht leere Listen. |

### DEL-01 — Hard Delete

| | |
|---|---|
| **Ursache** | `delete()` rief `prisma.station.delete` für unverknüpfte Stationen. |
| **Dateien** | `stations.service.ts` |
| **Lösung** | `delete()` delegiert immer an `archive()`. |
| **Tests** | `stations-v2-final-fixes.spec.ts` |
| **Risiko** | API-Response von DELETE ändert Semantik (archived statt removed). |

### HCE-01 / HCE-02 / HCE-07 — Home/Current gekoppelt

| | |
|---|---|
| **Ursache** | `assignVehicle` / `setStationVehicles` setzten home+current; Delta-API fehlte. |
| **Dateien** | `stations.service.ts`, `stations.controller.ts`, `dto/stations-v2-ops.dto.ts` |
| **Lösung** | Home-Updates nur `homeStationId`; `POST …/vehicles/change-home-station`; SET detach/attach nur home. |
| **Tests** | `stations-v2-final-fixes.spec.ts` |
| **Risiko** | Legacy-Clients mit SET müssen Pagination + Vollständigkeit sicherstellen. |

### SET-01 / SET-02 / SET-03 — Partieller SET-Detach

| | |
|---|---|
| **Ursache** | SET-Semantik + UI `limit:500` vs Backend clamp 100. |
| **Dateien** | `stations.service.ts`, `StationAssignVehicleModal.tsx` |
| **Lösung** | Server lehnt partiellen SET ab (`STATION_PARTIAL_SET_REJECTED`); UI paginiert alle Fahrzeuge (`page`/`limit:100`). |
| **Tests** | `stations-v2-final-fixes.spec.ts` |
| **Risiko** | SET bleibt verfügbar bis `legacySetVehiclesEndpointDisabled`. |

### BR-01 / BR-02 / BR-03 — Booking Rules Engine

| | |
|---|---|
| **Ursache** | Nur `StationValidationService` Exception-Pfad; Enforcement util unverdrahtet. |
| **Dateien** | `booking-rules/station-rule-engine.service.ts`, `station-validation.service.ts`, `bookings.service.ts` |
| **Lösung** | Vier-Outcome-Engine + `assertBookingPersistenceAllowed`; `pickupAt`/`returnAt` aus Bookings durchgereicht. |
| **Tests** | `station-rule-engine.service.spec.ts`, `station-validation.service.spec.ts` |
| **Risiko** | `enforce` blockiert nur bei Flag + Enforcement-Mode; Shadow/Warning non-blocking. |

### CAL-02 — `isOpenAt` fehlte

| | |
|---|---|
| **Ursache** | Öffnungszeiten persistiert, nicht enforced. |
| **Dateien** | `booking-rules/station-opening-calendar.util.ts`, `station-rule-engine.service.ts` |
| **Lösung** | `isOpenAt`, `isHolidayClosed`, TZ-`stationDayBounds` in Rule Engine. |
| **Tests** | Indirekt via `station-rule-engine.service.spec.ts` |
| **Risiko** | Komplexe `holidayRules`-Formate nur teilweise abgedeckt. |

### CAP-01 — Kapazitäts-Booking-Regel

| | |
|---|---|
| **Ursache** | Kapazität nur in KPIs. |
| **Dateien** | `station-rule-engine.service.ts` |
| **Lösung** | `CAPACITY_EXCEEDED` → `MANUAL_CONFIRMATION_REQUIRED` bei `stationCapacityWarningsEnabled`. |
| **Tests** | `station-rule-engine.service.spec.ts` |
| **Risiko** | Kein hartes BLOCKED bei Kapazität (Spec: Manual). |

### KPI-05 / N1-01 — Read Model / HTTP N+1

| | |
|---|---|
| **Ursache** | `StationsView` rief pro Station `overview-stats`. |
| **Dateien** | `read-model/station-read-model.service.ts`, `stations.controller.ts`, `StationsView.tsx`, `api.ts` |
| **Lösung** | `GET …/stations/summaries?stationIds=…`; Frontend Batch-Load. |
| **Tests** | Read-Model via Service-Integration; Frontend manuell. |
| **Risiko** | Sehr große Station-Listen → Query-String-Länge beachten. |

### UI-02 / UI-06 / FF-06 — UI-Flag-Gating

| | |
|---|---|
| **Ursache** | `stationsUiV2Enabled` nicht in Router/Sidebar. |
| **Dateien** | `App.tsx`, `Sidebar.tsx`, `useStationsV2FeatureFlags.ts`, `stations-v2-feature-flags.contract.ts` |
| **Lösung** | Sidebar + View nur bei `stationsUiV2Enabled`; Empty-State sonst. |
| **Tests** | `frontend/src/lib/stations-v2-feature-flags.test.ts` (bestehend) |
| **Risiko** | Deep-Link auf `stations` zeigt Empty-State wenn Flag aus. |

### AT-01 — Audit Trail Flag ohne Consumer

| | |
|---|---|
| **Ursache** | `stationAuditTrailEnabled` ohne Runtime. |
| **Dateien** | `audit/station-domain-audit.service.ts`, `stations.service.ts`, `station-transfer.service.ts` |
| **Lösung** | Domain-Audit bei Archive/Restore/Home/Transfer wenn Flag an. |
| **Tests** | Service-Mock in `stations-v2-final-fixes.spec.ts` |
| **Risiko** | Nutzt generisches `AuditService`, keine dedizierte `station_events`-Tabelle (AT-04 P2). |

---

## P1-Fixes

### SEC-07 — Guard `params.stationId` vs `:id`

**Lösung:** Guard prüft `params.id` zuerst. **Tests:** Guard-Unit implizit via Access-Service.

### KPI-S-02 — `unassignedVehicles` scope-blind

**Lösung:** Scoped User erhält `0` (keine org-weiten Unassigned-KPIs). **Risiko:** KPI für Worker ohne ALL-Scope nicht aussagekräftig.

### LIFE-02 / LIFE-03 — PATCH bypass

**Lösung:** `buildWriteData` wirft bei `status` / `isPrimary`. **Tests:** `stations-v2-final-fixes.spec.ts`.

### LIFE-04 / RES-02 — Restore blind

**Lösung:** `archivedCapabilitiesSnapshot` bei Archive; Restore aus Snapshot. **Migration:** `20260718120000_stations_v2_final_fixes`.

### PRIM-02 — Primary ohne DB-Constraint

**Lösung:** Partial unique index `stations_one_primary_per_org_idx`. **Risiko:** Bestehende Duplikate blockieren Migration.

### DEL-02 / DEL-04 — DELETE exponiert

**Lösung:** DELETE archiviert; Permission `manage`; expected-only Links zählen in Archive-Preview.

### AP-01 / AP-03 — Archive Preview

**Lösung:** `GET …/:id/archive-preview`. **UI:** weiterhin Ein-Klick-Archive (AP-02 P2 offen).

### RES-03 — Restore UI fehlte

**Lösung:** Restore-Button in `StationDetailView` für `ARCHIVED`. **i18n:** `stations.action.restore`, `stations.restored`.

### HCE-05 — Expected ungenutzt

**Lösung:** Transfer-Lifecycle setzt bei Arrive home+current; Expected unverändert (R5). **TRF** separat.

### SET-04 — home-fleet/preview

**Lösung:** `POST …/home-fleet/preview`.

### CPS-01 / CPS-02 — Provenance

**Lösung:** Schema `currentStationSource`, `currentStationConfirmedAt`; Handover + Manual + Transfer schreiben Provenance.

### TRF-01 / TRF-02 / TRF-03 — Transfer-Lifecycle

**Lösung:** `VehicleStationTransfer` Modell; `StationTransferService`; API `GET/POST …/transfers`, `POST …/transfers/:id/status` (PLANNED→IN_TRANSIT→ARRIVED/CANCELLED).

### BR-04 — Capacity warning consumer

**Lösung:** `evaluateCapacity` in Rule Engine bei Flag.

### CAL-03 / CAL-04 / CAL-05 — Holidays, TZ, After-hours

**Lösung:** `isHolidayClosed`; `stationDayBounds` für KPI today; `afterHoursReturnEnabled` in `isOpenAt`.

### CAP-02 / KPI-02 / KPI-03 — KPI-Definitionen

**Lösung:** Read Model: `vehicleCountHome`, `bookedVehicles` aus aktiven Buchungen, `capacityUsagePercent` home-only.

### N1-02 / N1-03 / N1-04 — DB N+1

**Lösung:** Batch Read Model; `StationShortageDetector` groupBy; `loadStationsMap` in Validation.

### PD-01 / PD-02 — Partial Data

**Lösung:** `partialFields` im Overview DTO; Batch-Load ohne silent per-station swallow (ein Request).

### UI-03 / UI-04 — Hook / Contract

**Lösung:** `stations-v2-feature-flags.contract.ts` im Frontend; Hook in Sidebar/App verdrahtet.

### FF-03 / FF-04 — Ungated / unwired Flags

**Lösung:** Permissions auf allen Routen; Transfers/Audit/Geofence/Booking Rules flag-gesteuert.

### GEO-03 — Geofence Shadow DTO

**Lösung:** `evaluateGeofenceShadow` in Fleet-Response wenn `stationGeofenceShadowEnabled` (read-only).

### MON-01 / MON-02 — Metriken / Script

**Lösung:** `synqdrive_stations_v2_*` Prometheus; `npm run test:stations:v2`.

### TST-02 / TST-05 — Tests / Runbook-Script

**Lösung:** `stations-v2-final-fixes.spec.ts`, `station-access`, `station-rule-engine`, `station-validation`, `station-geofence-shadow`; Script in `package.json`.

### TST-04 — E2E

**Status:** Nicht umgesetzt (P1, explizit außerhalb Prompt-Scope für vollständige E2E-Infrastruktur). **Risiko:** UI-Regressionen nur via Unit/Build abgesichert.

---

## Schema-Migration

`backend/prisma/migrations/20260718120000_stations_v2_final_fixes/migration.sql`

- Additiv: Vehicle provenance, Station snapshot, Transfer-Tabelle, Partial-Unique Primary.

---

## Verbleibende Risiken (bewusst)

| Thema | Risiko |
|-------|--------|
| E2E UI (TST-04) | Kein automatisierter Browser-Test für Flag-Gates |
| JWT stationScope (SEC-06) | DB-Membership-Lookup statt Token-Claim |
| Geofence operativ (GEO-01) | Kein Auto-Write — korrekt per Auftrag |
| SET Legacy (SET-01) | Endpoint aktiv bis `STATIONS_V2_SET_VEHICLES_DISABLED` |
| Primary Race (PRIM-03) | DB-Index verhindert Duplikate; Tx-Race selten |
| AP-02 Archive UX | Kein Impact-Dialog in UI |

---

*Prompt 77/78 — Implementierungsnachweis zu Audit-Fund 76.*
