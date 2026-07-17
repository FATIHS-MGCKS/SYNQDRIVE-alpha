# Stations V2 — Domänen-Glossar

**Version:** 1.0  
**Date:** 2026-07-17  
**Status:** **Normativ** — verbindliche Begriffsdefinitionen für Prompts 5–78  
**Repository-Git-Commit (Erstellung):** wird beim Abschluss von Prompt 4/78 dokumentiert  
**Basis:**

- [`stations-v2.md`](./stations-v2.md) (Architekturvertrag Prompt 3/78)
- [`stations-v2-execution-contract.md`](./stations-v2-execution-contract.md) (Ausführungsvertrag Prompt 1/78)
- [`../audits/stations-v2-implementation-inventory.md`](../audits/stations-v2-implementation-inventory.md) (Ist-Inventur Prompt 2/78)

**Zweck:** Eindeutige fachliche Sprache für Produkt, API, UI (DE/EN), Tests und Dokumentation. Bei Widersprüchen zwischen Code und Glossar gilt dieses Dokument zusammen mit [`stations-v2.md`](./stations-v2.md).

**Leseregel pro Eintrag:**

| Spalte | Bedeutung |
|--------|-----------|
| **Fachlich** | Was der Begriff in SynqDrive bedeutet |
| **Datenfeld** | Persistenz oder Read-Model-Projektion |
| **Writer** | Erlaubte Domain Commands / Services |
| **Verboten** | Unzulässige Nebenwirkungen |
| **UI DE / EN** | Empfohlene Oberflächenbezeichnung |
| **Abgrenzung** | Unterschied zu ähnlichen Begriffen |

---

## Verbindliche Benennungsregel (KPI)

> **`bookedVehicles` darf nicht** als Bezeichnung oder KPI-Name für Fahrzeuge mit `Vehicle.status = RENTED` verwendet werden.

| Veraltet / falsch | Korrekt (V2) | Definition |
|-------------------|--------------|------------|
| `bookedVehicles` (= `RENTED` count) | **`vehiclesWithActiveBookingAtStation`** | Anzahl Fahrzeuge mit mindestens einer **aktiven Buchung** (`CONFIRMED` \| `ACTIVE` \| `PENDING`), die diese Station als Pickup- **oder** Return-Station referenzieren |
| — | **`vehiclesRentedOperational`** (optional, separat) | Anzahl Fahrzeuge mit `status = RENTED` — **nur** wenn explizit Fahrzeugstatus gemeint ist; **nicht** „gebucht“ nennen |

UI DE für `vehiclesWithActiveBookingAtStation`: **„Mit aktiver Buchung“** · EN: **„With active booking“**

---

## 1. Heimatstation

| | |
|---|---|
| **Fachlich** | Organisatorische **Stamm-Station** eines Fahrzeugs — wo es der Flotte zugeordnet ist, unabhängig vom physischen Standort. |
| **Datenfeld** | `Vehicle.homeStationId` → `Station.id` (Relation `VehicleHomeStation`) |
| **Writer** | `AssignHomeStation`, `DetachHomeStation`, `BulkSetHomeFleet`; `registerFromDimo` nur mit explizitem Flag (Ziel: home-only) |
| **Verboten** | Gleichzeitiges Setzen von `currentStationId` oder `expectedStationId`; Löschen von `expectedStationId` bei Home-Änderung |
| **UI DE / EN** | **Heimatstation** / **Home station** |
| **Abgrenzung** | ≠ **aktueller Standort** (physisch bestätigt); ≠ **erwartete Station** (Planung). Ein Fahrzeug kann Heimat A, Standort B haben. |

---

## 2. Aktueller Standort

| | |
|---|---|
| **Fachlich** | **Bestätigter physischer Aufenthaltsort** des Fahrzeugs — durch Handover oder explizite Bestätigung belegt, nicht vermutet. |
| **Datenfeld** | `Vehicle.currentStationId`; Ziel-V2: `currentStationSource`, `currentStationConfirmedAt` |
| **Writer** | `ConfirmPhysicalPresence`, `ClearPhysicalPresence`; indirekt via Handover → `ConfirmPhysicalPresence` (nicht direktes `vehicle.update`) |
| **Verboten** | Setzen ohne `source` + `confirmedAt` (R4); Geofence-Auto-Write ohne Rollout-Flag; Kopplung mit Home in einem Command |
| **UI DE / EN** | **Aktueller Standort** / **Current location** |
| **Abgrenzung** | ≠ **Heimatstation**; ≠ **erwartete Station**; ≠ Geofence-SHADOW-Badge (nur Anzeige, kein Current). |

---

## 3. Erwartete Station

| | |
|---|---|
| **Fachlich** | Station, **an der das Fahrzeug voraussichtlich als Nächstes** sein soll — aus Transfer, One-Way-Buchung oder Logistikplanung. |
| **Datenfeld** | `Vehicle.expectedStationId` → `Station.id` (Relation `VehicleExpectedStation`) |
| **Writer** | `SetExpectedPosition`, `ClearExpectedPosition`, `CompleteTransfer` (Clear nach Ankunft) |
| **Verboten** | Blindes Löschen bei `AssignHomeStation` / `DetachHomeStation`; Setzen als Ersatz für Current ohne `ConfirmPhysicalPresence` |
| **UI DE / EN** | **Erwartete Station** / **Expected station** |
| **Abgrenzung** | ≠ **aktueller Standort** (Ist vs. Soll); ≠ **Return Station** der Buchung (Buchungsfeld, nicht Fahrzeugfeld). |

---

## 4. Heimatflotte

| | |
|---|---|
| **Fachlich** | Menge aller Fahrzeuge, deren **Heimatstation** eine bestimmte Station ist — Planungs- und KPI-Größe für Engpass-Erkennung. |
| **Datenfeld** | Read-Model: `COUNT(vehicles WHERE homeStationId = :stationId)`; API: `StationListItemDto.vehicleCountHome` |
| **Writer** | Nur über **Heimatstation**-Commands pro Fahrzeug (`AssignHomeStation`, `DetachHomeStation`, `BulkSetHomeFleet`) |
| **Verboten** | Ableitung aus paginierter Client-Liste; Verwechslung mit „alle Fahrzeuge vor Ort“ |
| **UI DE / EN** | **Heimatflotte** / **Home fleet** |
| **Abgrenzung** | ≠ **aktuell vor Ort** (current); ⊃ nur Heimat, nicht Fremdfahrzeuge. |

---

## 5. Aktuell vor Ort

| | |
|---|---|
| **Fachlich** | Fahrzeug, dessen **bestätigter aktueller Standort** diese Station ist — physisch (laut Current), unabhängig von der Heimat. |
| **Datenfeld** | Read-Model: `vehicles WHERE currentStationId = :stationId`; KPI: `vehicleCountPresent` |
| **Writer** | Nur via **aktueller Standort** (`ConfirmPhysicalPresence` / Handover) |
| **Verboten** | Inferenz nur aus Geofence-SHADOW; Inferenz aus `homeStationId` allein |
| **UI DE / EN** | **Aktuell vor Ort** / **Currently on site** |
| **Abgrenzung** | ⊃ Heimatfahrzeuge vor Ort **und** **Fremdfahrzeuge vor Ort**; ≠ **erwartete Ankunft**. |

---

## 6. Fremdfahrzeug vor Ort

| | |
|---|---|
| **Fachlich** | Fahrzeug, das **aktuell vor Ort** ist, aber **nicht** zur Heimatflotte dieser Station gehört (`homeStationId` ≠ diese Station oder null). |
| **Datenfeld** | Read-Model: `currentStationId = :stationId AND (homeStationId IS NULL OR homeStationId <> :stationId)` |
| **Writer** | Kein eigener Writer — **abgeleitete Projektion** aus Current + Home |
| **Verboten** | Als Heimatfahrzeug zählen; automatische Home-Umstellung bei Handover ohne expliziten Command |
| **UI DE / EN** | **Fremdfahrzeug vor Ort** / **Foreign vehicle on site** |
| **Abgrenzung** | Teilmenge von **aktuell vor Ort**; Gegenstück zu Heimatfahrzeug mit `home = current = station`. |

---

## 7. Aktuell vermietet

| | |
|---|---|
| **Fachlich** | Fahrzeug, das **im Kontext dieser Station** einer **laufenden Miete** zugeordnet ist — über aktive Buchung mit Bezug zur Station, nicht über bloßen Fahrzeugstatus. |
| **Datenfeld** | Read-Model: Fahrzeuge mit `Booking.status IN (CONFIRMED, ACTIVE, PENDING)` und (`pickupStationId` oder `returnStationId` oder `actual*` = Station); **nicht** `Vehicle.status = RENTED` allein |
| **Writer** | Buchungs-Lifecycle (`BookingsService`, Handover) — **nicht** Stations-KPI-Writer |
| **Verboten** | KPI-Label „gebucht“ / `bookedVehicles` für `RENTED`-Count; Zählen ohne Buchungsbezug zur Station |
| **UI DE / EN** | **Aktuell vermietet** (stationsbezogen) / **Currently on rental** (station context) |
| **Abgrenzung** | ≠ `RENTED` ohne Buchungskontext; ≠ **mit aktiver Buchung** wenn nur zukünftige Reservation; siehe **`vehiclesWithActiveBookingAtStation`**. |

---

## 8. Erwartete Ankunft

| | |
|---|---|
| **Fachlich** | Fahrzeug, das **noch nicht** am bestätigten Standort ist, aber **erwartet wird** an dieser Station (`expectedStationId`). |
| **Datenfeld** | Read-Model: `vehicles WHERE expectedStationId = :stationId AND (currentStationId IS NULL OR currentStationId <> :stationId)` |
| **Writer** | `SetExpectedPosition`, `ClearExpectedPosition`, `CompleteTransfer` |
| **Verboten** | Anzeige als „bereits vor Ort“; Löschen bei Home-Detach ohne expliziten Grund |
| **UI DE / EN** | **Erwartete Ankunft** / **Expected arrival** |
| **Abgrenzung** | ≠ **aktuell vor Ort**; ≠ geplante Buchungs-Pickups ohne `expectedStationId` am Fahrzeug. |

---

## 9. Transfer

| | |
|---|---|
| **Fachlich** | **Logistische Bewegung** eines Fahrzeugs zwischen Stationen — von Ursprung zu Ziel; setzt typischerweise **erwartete Station** und schließt mit **bestätigtem Standort** ab. |
| **Datenfeld** | Phase 1: `Vehicle.expectedStationId` + Audit-Events; Ziel Phase 2: `TransferPlan` / `TransferEvent` (noch nicht im Schema) |
| **Writer** | `SetExpectedPosition` (Start), `ConfirmPhysicalPresence` + `ClearExpectedPosition` / `CompleteTransfer` (Abschluss) |
| **Verboten** | Transfer nur durch Home-Änderung simulieren; Current aus Geofence ohne Bestätigung |
| **UI DE / EN** | **Transfer** / **Transfer** |
| **Abgrenzung** | ≠ One-Way-**Buchung** allein (Buchung plant Stationen; Transfer ist Fahrzeugbewegung); ≠ **BulkSetHomeFleet**. |

---

## 10. Pickup Station

| | |
|---|---|
| **Fachlich** | **Geplante Abhol-Station** einer Buchung — wo der Kunde das Fahrzeug laut Vertrag abholt. |
| **Datenfeld** | `Booking.pickupStationId` → `Station.id` |
| **Writer** | `BookingsService` (create/update) nach `StationRuleEngine`; nicht Stations-Modul direkt |
| **Verboten** | Archivierte oder pickup-deaktivierte Station ohne Regel-Outcome; stillschweigendes Überschreiben bei Handover |
| **UI DE / EN** | **Abholstation** / **Pickup station** |
| **Abgrenzung** | ≠ **Actual Pickup Station**; ≠ **Heimatstation** des Fahrzeugs (kann abweichen). |

---

## 11. Return Station

| | |
|---|---|
| **Fachlich** | **Geplante Rückgabe-Station** einer Buchung — wo das Fahrzeug laut Vertrag zurückgegeben wird. |
| **Datenfeld** | `Booking.returnStationId` → `Station.id` |
| **Writer** | `BookingsService` (create/update) nach `StationRuleEngine` |
| **Verboten** | Return an archivierte/return-deaktivierte Station ohne Regel-Outcome |
| **UI DE / EN** | **Rückgabestation** / **Return station** |
| **Abgrenzung** | ≠ **Actual Return Station**; bei One-Way: `pickupStationId <> returnStationId`. |

---

## 12. Actual Pickup Station

| | |
|---|---|
| **Fachlich** | **Tatsächliche** Abhol-Station nach durchgeführtem Pickup-Handover. |
| **Datenfeld** | `Booking.actualPickupStationId`; Handover setzt zusätzlich `Vehicle.currentStationId` |
| **Writer** | `BookingsHandoverService` (PICKUP finalize) → Booking actual + `ConfirmPhysicalPresence` |
| **Verboten** | Setzen ohne abgeschlossenes Handover; Current setzen ohne Source/Timestamp |
| **UI DE / EN** | **Tatsächliche Abholstation** / **Actual pickup station** |
| **Abgrenzung** | ≠ **Pickup Station** (Plan); kann bei Abweichung vom Plan abweichen. |

---

## 13. Actual Return Station

| | |
|---|---|
| **Fachlich** | **Tatsächliche** Rückgabe-Station nach durchgeführtem Return-Handover. |
| **Datenfeld** | `Booking.actualReturnStationId`; Handover kann `Vehicle.currentStationId` setzen |
| **Writer** | `BookingsHandoverService` (RETURN finalize) |
| **Verboten** | Fahrzeug auf AVAILABLE setzen und Current ignorieren wenn `actualStationId` gesetzt |
| **UI DE / EN** | **Tatsächliche Rückgabestation** / **Actual return station** |
| **Abgrenzung** | ≠ **Return Station** (Plan); ≠ **erwartete Station** am Fahrzeug. |

---

## 14. Operative Kapazität

| | |
|---|---|
| **Fachlich** | **Maximale Anzahl Fahrzeuge**, die eine Station operativ aufnehmen soll (Stellplätze / Planungsgrenze) — nicht automatisch gleich Heimatflottengröße. |
| **Datenfeld** | `Station.capacity` (nullable Integer); Read-Model: `capacityUsagePercent` = f(Heimatflotte, capacity) |
| **Writer** | `UpdateStationCapabilities` |
| **Verboten** | Hard-Block ohne Regel-Outcome (bis Schicht 8); negative Werte; Verwechslung mit „Fahrzeuge vor Ort“ |
| **UI DE / EN** | **Operative Kapazität** / **Operational capacity** |
| **Abgrenzung** | ≠ Anzahl **aktuell vor Ort**; ≠ **Öffnungszeit**-Limit; Regel `CAPACITY_EXCEEDED` → WARNING/MANUAL/BLOCKED. |

---

## 15. Öffnungszeit

| | |
|---|---|
| **Fachlich** | Zeitfenster, in denen eine Station **regulär erreichbar** ist (Wochenplan + Ausnahmen), ausgewertet in **Station-Zeitzone**. |
| **Datenfeld** | `Station.openingHours` (JSON), `Station.holidayRules` (JSON), `Station.timezone` (IANA) |
| **Writer** | `UpdateOpeningCalendar` |
| **Verboten** | KPI „heute“ in Server-TZ statt `station.timezone`; Öffnungszeit als Ersatz für `pickupEnabled`/`returnEnabled` |
| **UI DE / EN** | **Öffnungszeiten** / **Opening hours** |
| **Abgrenzung** | ≠ **After-hours Return** (Sonderregel); ≠ 24/7-Annahme wenn keine Hours gepflegt (`hasMissingOpeningHours`). |

---

## 16. After-hours Return

| | |
|---|---|
| **Fachlich** | Erlaubnis, Fahrzeuge **außerhalb der Öffnungszeiten** an dieser Station zurückzugeben (z. B. Schlüsselbox). |
| **Datenfeld** | `Station.afterHoursReturnEnabled` (Boolean) |
| **Writer** | `UpdateStationCapabilities` |
| **Verboten** | Automatisch true bei `RestoreStation`; Return ohne Regelprüfung `OUTSIDE_OPENING_HOURS` |
| **UI DE / EN** | **Rückgabe außerhalb der Öffnungszeiten** / **After-hours return** |
| **Abgrenzung** | ≠ `returnEnabled` (generell); erfordert bei Return außerhalb Hours → `MANUAL_CONFIRMATION_REQUIRED` oder `BLOCKED` wenn false. |

---

## 17. Hauptstation

| | |
|---|---|
| **Fachlich** | **Organisatorischer Hauptstandort** der Tenant-Org — Default für Buchungen ohne Angabe, branding-relevant, max. einer pro Org. |
| **Datenfeld** | `Station.isPrimary` (Boolean); implizit `status = ACTIVE` wenn primary |
| **Writer** | `SetPrimaryStation`, `CreateStation` (optional), `ArchiveStation` (setzt primary false) |
| **Verboten** | Primary auf ARCHIVED; mehrere Primary ohne Tx; Primary ohne ACTIVE |
| **UI DE / EN** | **Hauptstation** / **Primary station** |
| **Abgrenzung** | ≠ **Heimatstation** (Fahrzeugbezug); ≠ `Station.type = MAIN` (Typ vs. Primary-Flag). |

---

## 18. Aktive, inaktive und archivierte Station

### 18.1 Aktive Station

| | |
|---|---|
| **Fachlich** | Station im Regelbetrieb — wählbar für Zuweisungen (Home/Current), Primary, und Buchungen (vorbehaltlich Flags). |
| **Datenfeld** | `Station.status = 'ACTIVE'` |
| **Writer** | `CreateStation`, `RestoreStation`, `SetPrimaryStation`; nicht direktes PATCH ohne Command |
| **Verboten** | ARCHIVED-Verhalten bei ACTIVE; primary + pickup/return false ohne explizite Capability-Änderung |
| **UI DE / EN** | **Aktive Station** / **Active station** |
| **Abgrenzung** | ∈ `SELECTABLE_STATION_STATUSES` für Home/Current; ≠ INACTIVE. |

### 18.2 Inaktive Station

| | |
|---|---|
| **Fachlich** | Station **besteht**, ist aber **temporär nicht** für neue Zuweisungen/Buchungen vorgesehen (Stammdaten bleiben). |
| **Datenfeld** | `Station.status = 'INACTIVE'` |
| **Writer** | Lifecycle-Command `UpdateStationCapabilities` / dedizierter Status-Command (Ziel) |
| **Verboten** | Als pickup/return-fähig in neuen Buchungen ohne WARNING/BLOCKED |
| **UI DE / EN** | **Inaktive Station** / **Inactive station** |
| **Abgrenzung** | ≠ ARCHIVED (wiederherstellbar ohne Archiv-Timestamp); nicht in `SELECTABLE_STATION_STATUSES` für Home. |

### 18.3 Archivierte Station

| | |
|---|---|
| **Fachlich** | Station **aus dem operativen Betrieb genommen** — keine Primary, kein Pickup/Return; historische Buchungs-FKs bleiben. |
| **Datenfeld** | `Station.status = 'ARCHIVED'`, `archivedAt` gesetzt; R2: `isPrimary=false`, `pickupEnabled=false`, `returnEnabled=false` |
| **Writer** | `ArchiveStation`; `delete()` deprecated → leitet auf Archive um |
| **Verboten** | Hard Delete als Produktflow; Restore mit blindem Re-Enable aller Flags ohne Snapshot |
| **UI DE / EN** | **Archivierte Station** / **Archived station** |
| **Abgrenzung** | ≠ gelöscht; ≠ INACTIVE (stärkere Sperre); Expected-Zuweisung kann Ausnahme sein (Policy). |

---

## 19. Stationsscope

| | |
|---|---|
| **Fachlich** | **Sichtbarkeits- und Schreibgrenze** für Benutzer mit Rolle SUB_ADMIN/WORKER: welche Stationen und abgeleiteten Entitäten sie sehen/dürfen. |
| **Datenfeld** | `OrganizationMembership.stationScope` (String, z. B. `ALL` oder Station-UUID); `OrganizationMembership.stationIds` (JSON-Array, Ziel: Mehrfach-Scope) |
| **Writer** | `UsersService`, Invite-Flow, Role-Templates (`stationScopeDefault`) — **nicht** Stations-Modul |
| **Verboten** | Nur clientseitiges Filtern; JWT ohne Scope bei scoped Membership; KPIs org-weit für scoped User |
| **UI DE / EN** | **Stationsscope** / **Station scope** |
| **Abgrenzung** | ≠ Permission-Modul `stations` (read/write); ≠ **Heimatstation** eines Fahrzeugs. `ALL` = gesamte Org. |

---

## 20. Stationsverantwortlicher

| | |
|---|---|
| **Fachlich** | **Benannte Kontaktperson** vor Ort (Name), nicht automatisch SynqDrive-Benutzer oder Rollen-Membership. |
| **Datenfeld** | `Station.managerName` (String, nullable); DTO-Alias `contactPerson` |
| **Writer** | `UpdateStationMasterData` / `CreateStation` |
| **Verboten** | Verwechslung mit eingeloggtem User; automatische RBAC-Zuweisung aus `managerName`; Schreiben von Scope/Permissions |
| **UI DE / EN** | **Stationsverantwortlicher** / **Station manager** (Kontakt), Label im Formular: **Ansprechpartner** / **Contact person** |
| **Abgrenzung** | ≠ Rolle **`station_manager`** (Org-Rolle mit `stations:write`); ≠ `Organization.managerName` (Firmen-Admin). |

---

## Anhang A — Begriffsindex (Kurz)

| Deutsch | English | Kernfeld / Projektion |
|---------|---------|------------------------|
| Heimatstation | Home station | `Vehicle.homeStationId` |
| Aktueller Standort | Current location | `Vehicle.currentStationId` (+ source/at) |
| Erwartete Station | Expected station | `Vehicle.expectedStationId` |
| Heimatflotte | Home fleet | `COUNT(home = station)` |
| Aktuell vor Ort | Currently on site | `currentStationId = station` |
| Fremdfahrzeug vor Ort | Foreign vehicle on site | current = station ∧ home ≠ station |
| Aktuell vermietet | Currently on rental | Aktive Buchung + Stationsbezug |
| Erwartete Ankunft | Expected arrival | `expectedStationId = station` ∧ nicht vor Ort |
| Transfer | Transfer | expected → current Flow |
| Abholstation | Pickup station | `Booking.pickupStationId` |
| Rückgabestation | Return station | `Booking.returnStationId` |
| Tatsächliche Abholstation | Actual pickup station | `Booking.actualPickupStationId` |
| Tatsächliche Rückgabestation | Actual return station | `Booking.actualReturnStationId` |
| Operative Kapazität | Operational capacity | `Station.capacity` |
| Öffnungszeiten | Opening hours | `openingHours` + `timezone` |
| Rückgabe außerhalb der Öffnungszeiten | After-hours return | `afterHoursReturnEnabled` |
| Hauptstation | Primary station | `Station.isPrimary` |
| Aktiv / Inaktiv / Archiviert | Active / Inactive / Archived | `Station.status` |
| Stationsscope | Station scope | `Membership.stationScope` |
| Stationsverantwortlicher | Station contact | `Station.managerName` |

---

## Anhang B — KPI- und API-Namen (Migration von Ist)

| Ist-Name | Problem | V2-Name | UI DE |
|----------|---------|---------|-------|
| `bookedVehicles` | Zählt `Vehicle.status = RENTED` | `vehiclesWithActiveBookingAtStation` | Mit aktiver Buchung |
| `vehicleCount` (Liste) | Nur home | `vehicleCountHome` | Fahrzeuge (Heimat) |
| `totalVehicles` (Overview) | home ∪ current | `totalVehiclesAtStation` | Fahrzeuge gesamt (Station) |
| `stationId` (Fleet Map) | Oft = home | `homeStationId` explizit | Heimatstation |

---

## Referenzen

| Dokument | Rolle |
|----------|-------|
| [`stations-v2.md`](./stations-v2.md) | Architektur-Schichten und Commands |
| [`stations-v2-execution-contract.md`](./stations-v2-execution-contract.md) | Invarianten S1–S4, R1–R11 |
| [`stations-v2-implementation-inventory.md`](../audits/stations-v2-implementation-inventory.md) | Ist-Call-Sites |

---

**Ende des Domänen-Glossars Stations V2.**
