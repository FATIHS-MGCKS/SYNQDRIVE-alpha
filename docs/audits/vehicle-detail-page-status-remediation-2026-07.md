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
