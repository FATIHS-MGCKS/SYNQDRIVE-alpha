# Vehicle Operational State V2 — Backend Test Coverage

Stand: 2026-07-16  
Scope: Backend-Tests für Vehicle Operational State V2 (keine neuen Produktfunktionen — nur Testpaket).

## Ausführung

```bash
cd backend

# V2-Paket isoliert (53 Tests in 10 Suites)
npm test -- --testPathPattern="vehicle-operational-state-v2|vehicles.controller.status-patch|bookings.service.overlap"

# Erweitert inkl. bestehender Fleet-/VBH-/Interpreter-Suites
npm test -- --testPathPattern="vehicles/operational|vehicles.service.spec|vehicle-booking-handover|vehicles.controller.status-patch|bookings.service.overlap|vehicle-state-interpreter"

# TypeScript + Build (gesamtes Backend)
npx tsc --noEmit
npm run build
```

**Letzter Lauf (V2-Paket):** 53/53 Tests grün (10 Suites).

**Hinweis Build:** `billing.module.ts` enthält auf dem aktuellen Stack-Branch vorbestehende TS-Fehler (`TenantBilling*Service` fehlen) — unabhängig vom V2-Testpaket. Die neuen Spec-Dateien kompilieren und laufen via Jest fehlerfrei.

---

## Abdeckungsmatrix A–J

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **A. State Engine** | ✅ Voll | `vehicle-operational-state-v2.state-engine.spec.ts`, `vehicles.service.spec.ts` |
| **B. Zukunftsbelegung** | ✅ Weitgehend | `vehicle-operational-state-v2.future-booking.spec.ts`, `vehicle-booking-handover-diagnostic.util.spec.ts` |
| **C. Reservierungsfenster** | ✅ Voll | `vehicle-operational-state-v2.reservation-window.spec.ts`, `vehicle-booking-handover-diagnostic.util.spec.ts` |
| **D. Active Rental** | ✅ Voll | `vehicle-operational-state-v2.active-rental.spec.ts`, `vehicle-booking-handover-diagnostic.service.spec.ts` |
| **E. Data Quality** | ✅ Weitgehend | `vehicle-operational-state-v2.data-quality.spec.ts`, `vehicle-state-interpreter.spec.ts` |
| **F. Raw Status** | ✅ Voll | `vehicle-operational-state-v2.raw-status.spec.ts`, `vehicles.service.spec.ts` |
| **G. API-Konsistenz** | ✅ Voll | `vehicle-operational-state-v2.api-consistency.spec.ts` |
| **H. Schreibschutz** | ✅ Voll | `vehicles.controller.status-patch.spec.ts` |
| **I. Booking-Konflikte** | ✅ Voll | `bookings.service.overlap.spec.ts`, `booking-conflict.util.spec.ts` |
| **J. Cache** | ⚠️ Teilweise | `vehicle-operational-state-v2.fleet-map-cache.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise (bekannte Architektur-Lücke) · ❌ Lücke

---

## A. State Engine

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Available | ✅ | `state-engine.spec.ts` |
| Reserved | ✅ | `state-engine.spec.ts` |
| Active Rented | ✅ | `state-engine.spec.ts` |
| Maintenance (IN_SERVICE / OUT_OF_SERVICE) | ✅ | `state-engine.spec.ts` |
| Blocked (Master vs. Rental-Collapse) | ✅ | `state-engine.spec.ts` (`mapRawVehicleStatusToFleetLabel`) |
| Unknown (fail-closed, kein Backend-Enum) | ✅ | Ghost-Demotion → Available, nicht irreführendes Active Rented |

**Kanonische Engine:** `VehiclesService.deriveFleetStatusContext` — gemeinsam für `/fleet-map`, `/vehicles`, `/vehicles/:id`.

---

## B. Zukunftsbelegung

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Buchung in zwei Wochen — kanonisch nicht Reserved | ✅ | `future-booking.spec.ts` (`wouldCanonicalLogicReserveBooking`) |
| Legacy `buildBookingContextMap` reserviert noch | ✅ dokumentiert | `future-booking.spec.ts` |
| `nextBooking` korrekt | ✅ Test-Contract | `future-booking.spec.ts` (`buildFutureBookingSupplement` in test-helpers) |
| `futureBookingCount` korrekt | ✅ Test-Contract | `future-booking.spec.ts` |

**Lücke:** Backend emittiert `bookingContext.nextBooking` / `futureBookingCount` noch nicht auf API-Responses — Frontend normalisiert lokal. Test-Contract in `vehicle-operational-state-v2.test-helpers.ts` dokumentiert Soll-Verhalten bis Backend-DTO folgt.

---

## C. Reservierungsfenster

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Pickup-Tag in `Organization.timezone` | ✅ | `reservation-window.spec.ts` |
| Kurz vor Mitternacht | ✅ | `reservation-window.spec.ts` |
| DST (Frühling) | ✅ | `reservation-window.spec.ts` |
| Stornierung (kein CANCELLED in Map) | ✅ | `reservation-window.spec.ts` |
| No-show (`reservedIsOverdue`) | ✅ | `reservation-window.spec.ts` |
| Mehrere Buchungen (früheste gewinnt) | ✅ | `reservation-window.spec.ts` |

---

## D. Active Rental

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Konsistenter Pickup (ACTIVE + Odo-Delta) | ✅ | `active-rental.spec.ts` |
| ACTIVE ohne Raw RENTED | ✅ | `active-rental.spec.ts` |
| Raw RENTED ohne ACTIVE | ✅ | `active-rental.spec.ts` |
| Return abgeschlossen (COMPLETED nicht in Map) | ✅ | `active-rental.spec.ts` |
| Mehrere ACTIVE (früheste) | ✅ | `active-rental.spec.ts` |

---

## E. Data Quality

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Query-Fehler / Timeout | ✅ | `data-quality.spec.ts` (booking `.catch → []`) |
| DEGRADED (`signal_delayed`) | ✅ | `data-quality.spec.ts`, `vehicle-state-interpreter.spec.ts` |
| UNAVAILABLE (`no_signal` / offline) | ✅ | `data-quality.spec.ts` |
| Niemals Available als Fehlerfallback bei Ghost | ✅ | `data-quality.spec.ts`, `raw-status.spec.ts` |
| Redis read failure | ✅ | `data-quality.spec.ts` |

**UNKNOWN-UX:** Vollständige `operationalState` + `dataQualityState`-Emission ist Frontend V4.9.500; Backend liefert Telemetry-Freshness-Felder für die Normalisierung.

---

## F. Raw Status

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| RESERVED ohne Kontext → Available | ✅ | `raw-status.spec.ts` |
| RENTED ohne Kontext → Available | ✅ | `raw-status.spec.ts` |
| AVAILABLE mit ACTIVE → Active Rented | ✅ | `raw-status.spec.ts` |

---

## G. API-Konsistenz

| Endpunkt / Surface | Abdeckung | Datei |
|--------------------|-----------|-------|
| Fleet Map (`getFleetMapData`) | ✅ | `api-consistency.spec.ts` |
| Fleet List (`findByOrganization` → `mapToVehicleData`) | ✅ | `api-consistency.spec.ts` |
| Vehicle Detail (`findOne`) | ✅ | `api-consistency.spec.ts` |
| Dashboard-Datenquelle (gleiche Derivation) | ✅ | implizit — selbe `deriveFleetStatusContext`-Pipeline |
| Tenant-Scope | ✅ | `api-consistency.spec.ts` |

---

## H. Schreibschutz

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Generischer PATCH blockiert RENTED/RESERVED | ✅ | `vehicles.controller.status-patch.spec.ts` |
| Erlaubt AVAILABLE / IN_SERVICE / OUT_OF_SERVICE | ✅ | `vehicles.controller.status-patch.spec.ts` |
| Rollen (`RolesGuard` auf Controller) | ✅ | `vehicles.controller.status-patch.spec.ts` |
| Tenant-Trennung (`OrgScopingGuard` + `update(..., orgId)`) | ✅ | `vehicles.controller.status-patch.spec.ts` |

**Dedizierte Statuspfade:** Handover (`BookingsHandoverService`) — indirekt via VBH-Repair/Diagnostic-Suites abgedeckt; separates Handover-Integrationstest optional.

---

## I. Booking-Konflikte

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Overlap unverändert funktional | ✅ | `bookings.service.overlap.spec.ts` |
| Zukünftiger Zeitraum blockiert trotz Available-Status | ✅ | `bookings.service.overlap.spec.ts` |
| `excludeBookingId` bei Update | ✅ | `bookings.service.overlap.spec.ts` |
| `buildOverlapWhere` / Fenster-Validierung | ✅ | `booking-conflict.util.spec.ts` |

---

## J. Cache

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Redis read-through Hit | ✅ | `fleet-map-cache.spec.ts` |
| Miss → DB → Write TTL 5s | ✅ | `fleet-map-cache.spec.ts` |
| Org-scoped Keys | ✅ | `fleet-map-cache.spec.ts` |
| Invalidierung nach Pickup/Return/Storno/Verschiebung/Fahrzeugwechsel | ⚠️ | **Nicht implementiert** — TTL-only; Frontend `invalidateVehicleOperationalState` kompensiert |

**Bekannte Lücke:** `FleetOperationalReadModelCacheService` (Prompt 24) noch nicht im Backend — explizite Mutation-Bust folgt separatem Prompt.

---

## Datei-Inventar (neu V4.9.504)

| Datei | Tests |
|-------|-------|
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.test-helpers.ts` | Shared Fixtures |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.state-engine.spec.ts` | 6 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.future-booking.spec.ts` | 7 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.reservation-window.spec.ts` | 6 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.active-rental.spec.ts` | 5 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.data-quality.spec.ts` | 5 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.raw-status.spec.ts` | 4 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.api-consistency.spec.ts` | 3 |
| `backend/src/modules/vehicles/operational/vehicle-operational-state-v2.fleet-map-cache.spec.ts` | 4 |
| `backend/src/modules/vehicles/vehicles.controller.status-patch.spec.ts` | 6 |
| `backend/src/modules/bookings/bookings.service.overlap.spec.ts` | 4 |

**Bestehende ergänzende Suites:** `vehicles.service.spec.ts` (19), `vehicle-booking-handover-diagnostic.*.spec.ts` (16), `vehicle-booking-handover-repair.*.spec.ts` (11), `vehicle-state-interpreter.spec.ts`, `booking-conflict.util.spec.ts`.

---

## Architektur-Referenz

```text
buildBookingContextMap ──┐
fetchPickupOdometerMap ──┼──► deriveFleetStatusContext ──► mapToVehicleData / getFleetMapData
Vehicle.status (raw)  ───┘         ▲
                                   └── ghost guard (V4.6.90)
```

Frontend V2 (`operationalState`, `bookingContext`, UNKNOWN-UX) normalisiert API-Responses bis Backend-DTO-Emission folgt.
