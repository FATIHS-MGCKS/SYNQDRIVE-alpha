# Vehicle Detail Page — Statusmodell Remediation

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Basis** | Prompt 4/36 — kontrollierte Remediation nach Baseline-Audit |
| **Vorgänger** | [`vehicle-detail-page-baseline-2026-07.md`](./vehicle-detail-page-baseline-2026-07.md), [`vehicle-detail-page-canonical-sources-2026-07.md`](./vehicle-detail-page-canonical-sources-2026-07.md) |
| **Scope** | Status-Mappings Prisma → Backend → Frontend → Vehicle Detail Header / Fleet / Runtime |

---

## Ziel

Ein Fahrzeugstatus wird in allen Vehicle-Detail-Bereichen identisch interpretiert. Keine implizite Umwandlung unbekannter Werte zu „Available“. Keine neue parallele Statuslogik.

### Durchgesetzte Regeln

| Regel | Umsetzung |
|-------|-----------|
| Keine neuen Statuswerte | Bestehende Tokens `AVAILABLE`, `RESERVED`, `ACTIVE_RENTED`, `MAINTENANCE`, `BLOCKED`, `UNKNOWN` |
| Keine DB-Migration | Prisma-Enum `VehicleStatus` unverändert |
| Unbekannt ≠ Available | Fail-closed auf `UNKNOWN` / `Unknown` |
| Available ≠ Ready to Rent | Chip nutzt `resolveFleetVehicleDisplayState` (Rental Readiness getrennt) |
| Maintenance nur bei IN_SERVICE | `OUT_OF_SERVICE` → `Blocked`, nicht `Maintenance` |
| Blocked ≠ Maintenance | Getrennte Mappings FE/BE |
| UI/BE semantisch gleich | Zentrale Normalizer + deriveFleetStatusContext |

---

## Gefundene Fehler (vor Remediation)

### F-01 — `App.tsx` `handleVehicleSelect` (P0)

**Symptom:** `RESERVED`, `ACTIVE_RENTED`, `BLOCKED`, `UNKNOWN` → Dropdown-State `'Available'`.

**Ursache:** Ternary mit Default `'Available'` für alle Nicht-Maintenance-Fälle.

### F-02 — `App.tsx` Fleet-Sync `useEffect` (P0)

**Symptom:** `RESERVED`, `ACTIVE_RENTED`, `UNKNOWN` → Dropdown-State `'Manual Block'`.

**Ursache:** Ternary mit Default `'Manual Block'` für alle Nicht-Available/Maintenance-Fälle.

### F-03 — `VehicleDetailHeader.readinessChipFromDisplay` (P0)

**Symptom:** Chip zeigte „Manual Block“ / „Maintenance“ aus lokalem Dropdown-State statt kanonischem Fleet-Display.

**Ursache:** Override-Logik für `vehicleStatus === 'Manual Block' | 'Maintenance'` vor `resolveFleetVehicleDisplayState`.

### F-04 — `deriveFleetStatusContext` unbekannter DB-Status (P1)

**Symptom:** `RENTAL_STATUS_MAP[status] ?? 'Available'`.

**Ursache:** Fail-open statt fail-closed.

### F-05 — `RENTAL_STATUS_MAP` OUT_OF_SERVICE (P1)

**Symptom:** `OUT_OF_SERVICE` → `'Maintenance'` (kollabiert mit `IN_SERVICE`).

**Ursache:** Historischer Rental-Tab-Bucket; widerspricht `VEHICLE_STATUS_MAP` (Admin: `Blocked`) und FE `BLOCKED`-Token.

### F-06 — `PRISMA_TO_VEHICLE_OPERATIONAL_STATUS` OUT_OF_SERVICE (P1)

**Symptom:** `OUT_OF_SERVICE` → `MAINTENANCE` statt `BLOCKED`.

### F-07 — `FleetOperationalStatusToken` ohne BLOCKED (P2)

**Symptom:** Backend `operationalState.status` konnte `Blocked` nicht als `BLOCKED` tokenisieren.

---

## Geänderte Mapping-Stellen

### Frontend

| Datei | Änderung |
|-------|----------|
| `frontend/src/rental/lib/vehicle-detail-header-status.ts` | **Neu:** `deriveVehicleDetailHeaderEditStatus`, `resolveVehicleDetailHeaderReadinessChip` |
| `frontend/src/rental/lib/vehicle-detail-header-status.test.ts` | **Neu:** Regressionstests F-01, F-02, F-03 |
| `frontend/src/rental/App.tsx` | `setVehicleStatus` via `deriveVehicleDetailHeaderEditStatus` (Select + Fleet-Sync) |
| `frontend/src/rental/components/vehicle-detail/VehicleDetailHeader.tsx` | Chip immer kanonisch via `resolveVehicleDetailHeaderReadinessChip`; Dropdown-State nur für Edit |
| `frontend/src/rental/lib/vehicle-operational-state/normalize.ts` | `OUT_OF_SERVICE` → `BLOCKED` |
| `frontend/src/rental/lib/vehicle-operational-state/vehicle-operational-state.test.ts` | Test für OUT_OF_SERVICE → BLOCKED |
| `frontend/src/rental/lib/vehicle-booking-operator.utils.ts` | `isVehicleOperationallyBlocked` prüft `BLOCKED` explizit |

### Backend

| Datei | Änderung |
|-------|----------|
| `backend/src/modules/vehicles/vehicles.service.ts` | `RENTAL_STATUS_MAP.OUT_OF_SERVICE` → `'Blocked'`; `?? 'Unknown'`; Precedence `Maintenance \| Blocked`; `maintenanceCtx` auch für Blocked |
| `backend/src/modules/vehicles/operational/fleet-operational-state.util.ts` | `BLOCKED` Token + `Blocked` Display-Mapping |
| `backend/src/modules/vehicles/operational/fleet-operational-state.util.spec.ts` | **Neu:** Token/DTO-Tests |
| `backend/src/modules/vehicles/vehicles.service.spec.ts` | OUT_OF_SERVICE → Blocked; Unknown-Status-Test |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.state-engine.spec.ts` | OUT_OF_SERVICE → Blocked |
| `backend/src/modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.util.ts` | `mapRawVehicleStatusToFleetLabel`: OUT_OF_SERVICE → Blocked; default → Unknown |

---

## Kanonische Statuskette (Soll, nach Remediation)

```
Prisma VehicleStatus
  AVAILABLE      → Available      → AVAILABLE
  RESERVED       → Reserved       → RESERVED
  RENTED         → Active Rented  → ACTIVE_RENTED
  IN_SERVICE     → Maintenance    → MAINTENANCE
  OUT_OF_SERVICE → Blocked        → BLOCKED
  (unbekannt)    → Unknown        → UNKNOWN

Booking-Derivation (deriveFleetStatusContext):
  Maintenance | Blocked > Active Rented | Reserved > Available
  Ghost RENTED/RESERVED ohne Booking → Available + Warnung
```

### Vehicle Detail Header

| Schicht | Verantwortung |
|---------|---------------|
| **Chip (Anzeige)** | `resolveVehicleDetailHeaderReadinessChip` → `resolveFleetVehicleDisplayState` |
| **Dropdown (Edit)** | `deriveVehicleDetailHeaderEditStatus` — nur editierbare Baseline |
| **Rental Readiness** | Unverändert über Rental Health / `fleetVehicleDisplay` |

---

## Tests

### Neu

- `frontend/src/rental/lib/vehicle-detail-header-status.test.ts` (6 Tests)
- `backend/src/modules/vehicles/operational/fleet-operational-state.util.spec.ts` (4 Tests)

### Aktualisiert

- `vehicles.service.spec.ts` — Blocked + Unknown
- `vehicle-operational-state-v2.state-engine.spec.ts` — OUT_OF_SERVICE → Blocked
- `vehicle-operational-state.test.ts` — OUT_OF_SERVICE → BLOCKED

### Ergebnis (Remediation-Lauf)

| Suite | Ergebnis |
|-------|----------|
| `vehicle-detail-header-status.test.ts` | 6/6 PASS |
| `vehicle-operational-state.test.ts` | 10/10 PASS |
| `vehicle-detail-baseline.test.ts` | 14/14 PASS |
| `fleetVehicleDisplay.test.ts` + verwandte | 74/74 PASS |
| `vehicles.service.spec.ts` | PASS |
| `fleet-operational-state.util.spec.ts` | 4/4 PASS |
| `vehicle-operational-state-v2.state-engine.spec.ts` | PASS |
| Frontend `npm run build` | PASS |
| Backend `npm run build` | PASS |

---

## Bewusst nicht geändert

- **Header-Dropdown persistiert nicht** — bekannt aus Prompt 1/2 (C-01); separates Remediation-Thema
- **FLEET_STATUSES ohne BLOCKED** — Tab-Bucket „Maintenance“ fasst BLOCKED weiterhin per `vehicleOperationalStatusMatchesTab`
- **RENTAL_STATUS_MAP Kommentar-Historie** — Rental-Tabs zeigen Blocked-Fahrzeuge im Maintenance-Tab, semantisch aber als `Blocked`/`BLOCKED`
- **Telemetry null→0 (C-03)** — außerhalb Status-Scope

---

## SynqDrive Code → Changes / Architektur

**Nicht aktualisiert** — externes Workspace außerhalb dieses Repos (siehe `architecture/CLOUD_AGENTS_2026-06-30.md`). Dieses Audit-Dokument dient als in-repo Remediation-Nachweis.

---

## Prompt 5/36 — Konsolidierung (2026-07-24)

### Ziel

Verstreute Status-Mappings auf die vorhandene kanonische Runtime-/Domain-Logik konsolidieren — **ohne** neue zweite Source of Truth.

### Wiederverwendete zentrale Datei

| Schicht | Datei | Rolle |
|---------|-------|-------|
| Domain | `vehicle-operational-state/normalize.ts` | Rohstatus → kanonischer Token |
| Domain | `vehicle-operational-state/selectors.ts` | `selectOperationalStatus` — einzige Status-Leselogik |
| Präsentation | `vehicle-operational-state/display.ts` | **Erweitert:** Labels, Tones, Icons, Edit-Token-Mapping |
| Badge | `vehicle-operational-booking-display.ts` | `resolveOperationalStatusBadge` — nutzt jetzt `operationalStatusToneFor` aus display |
| Fleet composite | `fleetVehicleDisplay.ts` | `resolveFleetVehicleDisplayState` — primaryLabel/Tone delegieren an display |
| Detail facade | `vehicle-detail-header-status.ts` | Dünner Facade über display + fleetVehicleDisplay |

### Zielstruktur (nach Konsolidierung)

```
API-Rohstatus
  → normalizeVehicleOperationalStatus / normalizeVehicleOperationalStateDto
  → selectOperationalStatus (kanonischer Runtime-State)
  → resolveOperationalStatusBadge / resolveFleetVehicleDisplayState (präsentational)
  → UI (Header, Fleet, Overview-Badges)
```

### Neue zentrale Präsentations-API (`display.ts`)

| Export | Zweck |
|--------|-------|
| `ALL_VEHICLE_OPERATIONAL_STATUSES` | Matrix-Tests / Iteration |
| `operationalStatusToneFor` | Einheitliche StatusChip-Töne |
| `operationalStatusIconName` | Einheitliche Icons |
| `mapCanonicalOperationalStatusToEditStatus` | Header-Dropdown-Baseline |
| `formatVehicleOperationalEditStatusLabel` | Dropdown-Labels (UI-Copy unverändert) |
| `VEHICLE_OPERATIONAL_EDIT_STATUSES` | Dropdown-Optionen |

### Entfernte Doppelimplementierungen

| Datei | Entfernt / ersetzt |
|-------|-------------------|
| `vehicle-operational-booking-display.ts` | Lokale `operationalToneForStatus` → `operationalStatusToneFor` |
| `VehicleDetailHeader.tsx` | Lokale `readinessChipIcon` Switch → `operationalStatusIconName` |
| `VehicleDetailHeader.tsx` | Hardcodierte Dropdown-Buttons → `VEHICLE_OPERATIONAL_EDIT_STATUSES` + zentrale Labels/Icons |
| `vehicle-detail-header-status.ts` | Inline Edit-Mapping → `mapCanonicalOperationalStatusToEditStatus` |
| `fleetVehicleDisplay.ts` | `primaryLabelFor` / `primaryToneFor` Duplikat-Labels/Tones für ready/blocked/maintenance/reserved/unknown |
| `vehicle-booking-operator.utils.ts` | Lokale DE-Labels für blocked/active/rented → `formatVehicleOperationalStatusLabel` + `operationalStatusToneFor` |
| `VehiclePickerStep.tsx` | Hardcodierte Tab-Labels (außer `Vermietet`-Kurzform) → zentrale Labels |

### Geänderte Dateien (Prompt 5)

- `frontend/src/rental/lib/vehicle-operational-state/display.ts`
- `frontend/src/rental/lib/vehicle-operational-state/index.ts`
- `frontend/src/rental/lib/vehicle-operational-booking-display.ts`
- `frontend/src/rental/lib/vehicle-detail-header-status.ts`
- `frontend/src/rental/lib/vehicle-detail-header-status.test.ts`
- `frontend/src/rental/lib/vehicle-operational-display.consolidation.test.ts` (**neu**)
- `frontend/src/rental/components/vehicle-detail/VehicleDetailHeader.tsx`
- `frontend/src/rental/lib/fleetVehicleDisplay.ts`
- `frontend/src/rental/lib/vehicle-booking-operator.utils.ts`
- `frontend/src/rental/components/new-booking/VehiclePickerStep.tsx`

### Tests (Prompt 5)

| Suite | Ergebnis |
|-------|----------|
| `vehicle-operational-display.consolidation.test.ts` | 24/24 PASS (alle 6 Status + invalid/unknown + edit round-trip) |
| `vehicle-detail-header-status.test.ts` | 6/6 PASS |
| `vehicle-operational-booking-display.test.ts` | 13/13 PASS |
| `fleetVehicleDisplay.test.ts` | 24/24 PASS |
| `vehicle-operational-state.test.ts` | 10/10 PASS |
| Frontend `npm run build` | PASS |

### Bewusste Ausnahmen (unverändert)

| Ausnahme | Begründung |
|----------|------------|
| `VehiclePickerStep` Tab „Vermietet“ | Produkt-Kurzform ≠ zentrales „Aktiv vermietet“ — UI unverändert |
| `vehicle-booking-operator.utils` „Frei“ | Operator-Kontext-Kurzlabel für verfügbaren Idle-Zustand |
| `fleetVehicleDisplay` `primaryLabelFor('active')` → „Aktiv“ | Kürzeres Fleet-Row-Label, nicht vollständiger Operational-Status |
| `fleetVehicleDisplay` composite `critical` / `warning` | Health/Overdue-Overlays — keine 1:1-Operational-Mappings |
| `vehicle-overview-ui.ts` readiness labels | Separates Rental-Readiness-Domain (`ready`/`attention`/`blocked`) |
| `fleetVisualState.ts` Map-Legende | Telemetry-spezifische Labels (`Offline`, `Soft Offline`) |
| `i18n/translations/*.ts` status.* keys | Parallel zu display.ts — keine Massenmigration i18n in diesem Prompt |
| Header-Dropdown persistiert nicht | C-01 — separates Thema |

---

## Prompt 6/36 — Serverseitige Status-Persistierung (2026-07-24)

### Problem (C-01)

Der Vehicle-Detail-Header änderte den operativen Status nur im lokalen React-State (`setVehicleStatus`). Reinigungsstatus (`cleaningStatus`) nutzte bereits den Backend-PATCH — operativer Status nicht.

### Verwendete API (bestehend — kein neuer Endpunkt)

| Feld | Wert |
|------|------|
| **Methode / Pfad** | `PATCH /api/v1/organizations/:orgId/vehicles/:vehicleId/status` |
| **Frontend-Client** | `api.vehicles.updateOperationalStatus(orgId, vehicleId, { status })` |
| **Backend-Handler** | `VehiclesController.updateVehicleStatus` |
| **Permission** | `@RequirePermission('fleet', 'write')` + `OrgScopingGuard` |
| **Tenant-Isolation** | `vehiclesService.update(vehicleId, data, orgId)` — `findFirst` mit Org-Scope |
| **Zulässige Schreibwerte** | `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` |
| **Abgelehnt** | `RENTED`, `RESERVED` (400 Bad Request) |

### Edit-Token → Prisma-Mapping (Frontend)

| Dropdown (Edit) | Prisma `VehicleStatus` | Kanonisch |
|-----------------|------------------------|-----------|
| Available | `AVAILABLE` | `AVAILABLE` |
| Maintenance | `IN_SERVICE` | `MAINTENANCE` |
| Manual Block | `OUT_OF_SERVICE` | `BLOCKED` |

Implementiert in `mapVehicleOperationalEditStatusToPrismaStatus()` (`display.ts`).

### Frontend-Implementierung

| Datei | Änderung |
|-------|----------|
| `vehicle-operational-status-mutation.ts` | **Neu:** API-Aufruf, Fehlerklassifikation, Warn-Logik |
| `vehicle-operational-status-mutation.test.ts` | **Neu:** 7 Tests (Erfolg, Fehler, Doppelklick, Invalidierung) |
| `App.tsx` | `persistVehicleOperationalStatus` — kein optimistischer Erfolg; Rollback bei Fehler; `vehicleStatusBusy` |
| `VehicleDetailHeader.tsx` | Dropdown disabled während Mutation / ohne `fleet:write` |
| `display.ts` | `mapVehicleOperationalEditStatusToPrismaStatus` |

### Mutation-Ablauf

1. Permission-Check (`hasPermission('fleet', 'write')`)
2. No-op wenn Edit-Status unverändert
3. Warn-Modal bei Available → Maintenance/Manual Block
4. `PATCH` mit korrekter `orgId` + `vehicleId`
5. Bei Erfolg: `invalidateVehicleOperationalState` → `refreshFleetVehicles` → State aus Fleet-Snapshot
6. Bei Fehler: Rollback auf `deriveVehicleDetailHeaderEditStatus(selectedVehicle)` + Toast

### Invalidierte Query Keys (`reason: 'vehicle-status-patch'`)

| Key | Handler |
|-----|---------|
| `['vehicle-operational', orgId, 'fleet-map']` | FleetContext → `fetchFleetMap` |
| `['vehicle-operational', orgId, 'fleet-health']` | FleetContext → `reloadHealth` |
| `['vehicle-operational', orgId, 'vehicle', vehicleId]` | Vehicle Overview Summary |
| `['vehicle-operational', orgId, 'dashboard-runtime']` | Dashboard Runtime Slice |

Zusätzlich: `vehiclesService.invalidateFleetMapCache(orgId)` im Backend.

### Backend-Ergänzung: Audit Logging

| Feld | Wert |
|------|------|
| **Service** | `ActivityLogService` (bestehend) |
| **Trigger** | Status-Änderung via PATCH (`previousStatus !== nextStatus`) |
| **metaJson.auditAction** | `VEHICLE_OPERATIONAL_STATUS_UPDATE` |
| **Keine Rohdaten** | Nur Enum-Werte `previousStatus` / `nextStatus` |

### Tests (Prompt 6)

| Suite | Ergebnis |
|-------|----------|
| `vehicle-operational-status-mutation.test.ts` | 7/7 PASS |
| `vehicles.controller.status-patch.spec.ts` | 7/7 PASS (inkl. Activity Log) |
| Frontend `npm run build` | PASS |

### Bewusste Ausnahmen

| Ausnahme | Begründung |
|----------|------------|
| Parallele Browser-Tabs | Kein WebSocket — Fleet-Refresh bei Invalidierung + periodischer Fleet-Poll decken Konvergenz ab |
| Booking-derived Status | RESERVED/ACTIVE_RENTED nicht per Dropdown schreibbar (Backend lehnt ab) |
| `healthStatus` im selben PATCH | Endpoint unterstützt es; Header nutzt nur `status` |

---

## Prompt 7/36 — Reinigungsstatus technisch vereinheitlicht (2026-07-24)

### Ziel

Reinigungsstatus-Mutation strukturell an das korrigierte Fahrzeugstatus-Pattern angleichen — ohne fachliche Nebenwirkungen zu entfernen und ohne neue Reinigungslogik.

### Bewusste Unterschiede zum operativen Fahrzeugstatus

| Aspekt | Operativer Status | Reinigungsstatus |
|--------|-------------------|------------------|
| **Fachliche Domäne** | Verfügbarkeit / Block / Wartung | Reinigung / Task-Workflow |
| **Rental Readiness** | Chip nutzt `resolveFleetVehicleDisplayState` | Reinigung beeinflusst Readiness nur indirekt über Fleet-Snapshot nach Serverantwort |
| **Warn-Modal** | Available → Maintenance/Manual Block | Nur bei Wechsel zu „Needs Cleaning“ |
| **Backend-Nebenwirkungen** | Keine Task-Erzeugung | `ensureCleaningTask` / `completeOpenCleaningTasks` |
| **Automatische Freigabe** | — | **Keine** — „Clean“ setzt nicht automatisch operational Available |
| **Audit-Action** | `VEHICLE_OPERATIONAL_STATUS_UPDATE` | `VEHICLE_CLEANING_STATUS_UPDATE` |

### Verwendete API (bestehend — kein neuer Endpunkt)

| Feld | Wert |
|------|------|
| **Methode / Pfad** | `PATCH /api/v1/organizations/:orgId/vehicles/:vehicleId/status` |
| **Body-Feld** | `{ cleaningStatus: 'CLEAN' \| 'NEEDS_CLEANING' }` |
| **Frontend-Client** | `api.vehicles.updateOperationalStatus(orgId, vehicleId, { cleaningStatus })` |
| **Permission** | `@RequirePermission('fleet', 'write')` + `OrgScopingGuard` |
| **Tenant-Isolation** | `vehiclesService.update(vehicleId, data, orgId)` |

### UI-Label → Prisma-Mapping

| Dropdown (UI) | Prisma `CleaningStatus` |
|---------------|-------------------------|
| Clean | `CLEAN` |
| Needs Cleaning | `NEEDS_CLEANING` |

Implementiert in `mapCleaningUiStatusToPrisma()` / `deriveVehicleDetailHeaderCleaningStatus()`.

### Frontend-Implementierung

| Datei | Änderung |
|-------|----------|
| `vehicle-status-patch-mutation-shared.ts` | **Neu:** gemeinsame Fehlerklassifikation für operational + cleaning |
| `vehicle-cleaning-status-mutation.ts` | **Neu:** API-Aufruf, Mapping, Task-Side-Effects, Warn-Logik |
| `vehicle-cleaning-status-mutation.test.ts` | **Neu:** 7 Tests |
| `vehicle-operational-status-mutation.ts` | Refactor: nutzt shared error classifier |
| `App.tsx` | `persistCleaningStatus` spiegelt `persistVehicleOperationalStatus` |
| `VehicleDetailHeader.tsx` | `cleaningStatusBusy`, `canEditCleaningStatus`, Dropdown-Guard |

### Mutation-Ablauf (Reinigung)

1. Permission-Check (`hasPermission('fleet', 'write')`)
2. No-op wenn UI-Status unverändert (`deriveVehicleDetailHeaderCleaningStatus`)
3. Warn-Modal bei Wechsel zu „Needs Cleaning“
4. `PATCH` mit `cleaningStatus` — kein optimistischer Erfolg
5. Bei Erfolg: `invalidateVehicleOperationalState` → `refreshFleetVehicles` → State aus Fleet-Snapshot
6. Task-Side-Effects (Toast, Navigation zu vehicle-tasks) nur nach Serverantwort
7. Bei Fehler: Rollback auf `deriveVehicleDetailHeaderCleaningStatus(selectedVehicle)`
8. Fleet-Sync überschreibt `cleaningStatus` nicht während `cleaningStatusBusy`

### Invalidierte Query Keys

Identisch zu Prompt 6 (`reason: 'vehicle-status-patch'`).

### Backend-Ergänzung: Audit Logging (Cleaning)

| Feld | Wert |
|------|------|
| **Trigger** | `cleaningStatus`-Änderung (`previousCleaningStatus !== nextCleaningStatus`) |
| **metaJson.auditAction** | `VEHICLE_CLEANING_STATUS_UPDATE` |
| **metaJson** | `previousCleaningStatus`, `nextCleaningStatus` |

### Tests (Prompt 7)

| Suite | Abdeckung |
|-------|-----------|
| `vehicle-cleaning-status-mutation.test.ts` | Clean, Needs Cleaning, Mapping, Permission-Fehler, Doppelklick, Side-Effects |
| `vehicles.controller.status-patch.spec.ts` | +1 Test Cleaning-Audit-Log |

### Bewusste Ausnahmen (Cleaning)

| Ausnahme | Begründung |
|----------|------------|
| Task-Navigation nach „Needs Cleaning“ | Bestehendes Produktverhalten — keine Rental-Freigabe |
| Englische UI-Labels „Clean“ / „Needs Cleaning“ | Unverändert — keine visuelle Linie geändert |
| `cleaningStatus` im selben PATCH wie `status` | Endpoint erlaubt beides; Header sendet getrennte Mutationen |
