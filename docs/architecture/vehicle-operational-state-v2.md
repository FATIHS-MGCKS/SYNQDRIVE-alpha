# Vehicle Operational State V2 — Verbindliche Fach- und Technikspezifikation

**Version:** 2.0 (Spezifikation)  
**Date:** 2026-07-15  
**Status:** Normativ für zukünftige Implementierung — **keine produktive Umsetzung in diesem Dokument**  
**Basis:**  
- `docs/audits/vehicle-operational-status-inventory.md` (Prompt 1/43)  
- `docs/audits/vehicle-status-ks-fh-660e-trace.md` (Prompt 2/43)  
- `docs/audits/vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf`  

**Prinzip:** Eine kanonische Ableitungsschicht (`VehicleOperationalStateService` o. ä.) — keine parallelen Fleet-Status-Wahrheiten in UI, Org-Stats und Booking-Gates.

---

## 0. Zweck und Geltungsbereich

Dieses Dokument trennt **sieben fachlich unabhängige Konzepte**, die im Ist-System (V1) vermischt werden. Es definiert kanonische **operative Zustände**, deutsche UI-Labels, maschinenlesbare **Reason-Codes** und Ableitungsregeln.

**Geltung:**

- Multi-tenant: alle Operationen sind `organizationId`-scoped.
- Buchungs-Lifecycle bleibt: `PENDING` → `CONFIRMED` → `ACTIVE` → `COMPLETED`; Handover-Protokolle sind Source-of-Truth für physische Übergabe.
- Overlap-Gate (`BLOCKING_BOOKING_STATUSES`) bleibt zentral in `booking-conflict.util.ts` — wird fachlich unter §5 eingeordnet, nicht dupliziert.
- Rental Health V1 bleibt separater Gate für Buchungserstellung; V2 ordnet es unter §6/§7 ein.

**Nicht Gegenstand dieses Dokuments:** konkrete Prisma-Migration, API-DTO-Namen, Frontend-Komponenten — folgen in späteren Prompts.

---

## 1. Die sieben Konzepte (strikte Trennung)

Die folgenden Konzepte **dürfen nicht** in einem einzelnen Enum oder UI-Badge zusammengefasst werden.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Persistierter Fahrzeug-Rohstatus (administrativ, DB)         │
├─────────────────────────────────────────────────────────────────┤
│ 2. Aktueller operativer Zustand (jetzt, abgeleitet, kanonisch)  │
├─────────────────────────────────────────────────────────────────┤
│ 3. Aktuelle Buchungsbelegung (active rental / pickup window)    │
├─────────────────────────────────────────────────────────────────┤
│ 4. Zukünftige Belegung (next + weitere future bookings)         │
├─────────────────────────────────────────────────────────────────┤
│ 5. Zeitraumbezogene Buchbarkeit (Konfliktprüfung Intervalle)    │
├─────────────────────────────────────────────────────────────────┤
│ 6. Rental Readiness (Ready / Not Ready — unabhängig von §2)       │
├─────────────────────────────────────────────────────────────────┤
│ 7. Maintenance & Blocking (Hard/Soft-Ausschluss)                │
└─────────────────────────────────────────────────────────────────┘
```

| # | Konzept | Frage | Persistiert? | Beispiel KS FH 660E (1.8.–6.8., CONFIRMED, 15.7.) |
|---|---------|-------|--------------|-----------------------------------------------------|
| **1** | Persistierter Rohstatus | Welchen **administrativen** Grundzustand hat der Datensatz? | Ja (`vehicles.status`) | Typisch `AVAILABLE` |
| **2** | Operativer Zustand | Wie ist das Fahrzeug **jetzt** operationell einzuordnen? | Nein (Read-Model) | V2: **`AVAILABLE`** (Fenster noch nicht offen) — V1 fälschlich `Reserved` |
| **3** | Aktuelle Belegung | Gibt es **jetzt** aktive Vermietung oder Pickup-Reservierungsfenster? | Nein (aus Bookings) | V2: kein Fenster → `none`; V1: `reserved` |
| **4** | Zukünftige Belegung | Welche **zukünftigen** Buchungen existieren? | Ja (`bookings`) | Eine CONFIRMED 1.8.–6.8. |
| **5** | Zeitraum-Buchbarkeit | Ist Intervall `[from, to)` buchbar? | Nein (Query) | 1.8.–6.8. **blockiert** |
| **6** | Rental Readiness | Darf vermietet werden (Qualität/Gesundheit)? | Nein (Health-Read-Model) | z. B. `READY` oder `NOT_READY` |
| **7** | Maintenance & Blocking | Technischer/fachlicher Ausschluss? | Teilweise (DB + Health) | z. B. `none` |

**Regel:** UI-Tabs, KPI-Counts und Fleet-Map-Töne lesen **§2** (operativer Zustand). Kalender und `POST /bookings` lesen **§5**. Dashboard „Ready for Renting“ liest **§6** (und optional §2). Wartungsplanung liest **§7**.

---

## 2. Persistierter Fahrzeug-Rohstatus (Konzept 1)

### 2.1 Definition

Der **persistierte Rohstatus** ist ein **administrativer, domänenspezifischer Grundzustand** am `Vehicle`-Datensatz. Er beschreibt **nicht** allein den operativen Moment (keine Buchungsableitung) und **nicht** Rental Readiness.

### 2.2 Erlaubte persistierte Werte (V2-Ziel)

| Persistierter Wert | Semantik | Wer darf schreiben |
|--------------------|----------|-------------------|
| `AVAILABLE` | Fahrzeug ist betrieblich freigegeben; keine administrative Sperre | Operator-Status-PATCH, Handover RETURN (bedingt), Cancel/No-Show (bedingt) |
| `IN_SERVICE` | Geplante / laufende Wartung, Werkstatt, interne Nutzung | Operator-Status-PATCH, Workflow |
| `OUT_OF_SERVICE` | Harte Betriebssperre (Defekt, Stilllegung, Compliance) | Operator-Status-PATCH, Workflow |

### 2.3 Explizit **nicht** mehr dauerhaft persistieren (V2-Ziel)

| Ist-Enum | V2-Entscheidung | Begründung |
|----------|-----------------|------------|
| `RENTED` | **Entfernen aus Schreibpfaden**; nur noch abgeleitet als `ACTIVE_RENTED` | Ghost States, Drift zu `Booking.status` |
| `RESERVED` | **Entfernen aus Schreibpfaden**; nur noch abgeleitet als `RESERVED` | Wurde praktisch nie konsistent geschrieben; Fleet leitete aus Bookings ab |

**Übergang:** Bestehende Zeilen `RENTED`/`RESERVED` werden per Migration auf `AVAILABLE` normalisiert, sofern keine widersprüchliche `ACTIVE`-Buchung existiert (sonst `UNKNOWN` + manuelle Ops-Review).

### 2.4 Schreibregeln (normativ)

| Ereignis | Erlaubte Änderung an Rohstatus |
|----------|-------------------------------|
| Pickup-Handover | **Keine** Änderung auf `RENTED` (V2) |
| Return-Handover | `AVAILABLE`, wenn keine admin-Sperre (`IN_SERVICE`/`OUT_OF_SERVICE`) |
| Booking Cancel / No-Show | `AVAILABLE`, wenn keine admin-Sperre |
| Workflow `vehicle.status.update` | Nur `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` |
| Generischer Vehicle-PATCH | **Gleiche Guardrails** wie dedizierter Status-PATCH |

Rohstatus **darf nie** aus einer zukünftigen Buchung allein gesetzt werden.

---

## 3. Aktueller operativer Zustand (Konzept 2)

### 3.1 Definition

Der **aktuelle operative Zustand** ist der **kanonische, zeitpunktbezogene** Zustand des Fahrzeugs **jetzt** (`evaluationAt`). Er wird **zur Lesezeit abgeleitet**, tenant-sicher, und ist die **einzige** Wahrheit für Fleet-Tabs, Fleet-Map-Operational-Layer und operatives KPI-Bucketing.

### 3.2 Kanonische operative Zustände

| Code | Deutsche UI-Bezeichnung | Kurzbeschreibung |
|------|-------------------------|------------------|
| `AVAILABLE` | Verfügbar | Jetzt frei; kein Reservierungsfenster; keine Hard-Blockade |
| `RESERVED` | Reserviert | Im Pickup-Reservierungsfenster; Pickup noch nicht abgeschlossen |
| `ACTIVE_RENTED` | Aktiv vermietet | Physisch übergeben; Buchung aktiv; Return offen |
| `MAINTENANCE` | In Wartung | Administrative Wartung (`IN_SERVICE`) |
| `BLOCKED` | Gesperrt | Harte Betriebssperre (`OUT_OF_SERVICE` oder äquivalente Hard-Blockade) |
| `UNKNOWN` | Unbekannt | Zustand nicht sicher bestimmbar |

**Maschinenlesbarer Typ:** `VehicleOperationalState = 'AVAILABLE' | 'RESERVED' | 'ACTIVE_RENTED' | 'MAINTENANCE' | 'BLOCKED' | 'UNKNOWN'`

### 3.3 Verbindliche Semantik pro Zustand

#### `AVAILABLE`

Alle Bedingungen müssen gleichzeitig gelten:

1. **Keine aktive Vermietung** — kein `Booking` mit `status = ACTIVE` für dieses Fahrzeug.
2. **Noch kein Reservierungsfenster** — kein qualifizierendes `PENDING`/`CONFIRMED` im Pickup-Reservierungsfenster (§3.4).
3. **Keine Maintenance-/Hard-Blockade** — persistierter Rohstatus ∉ `{IN_SERVICE, OUT_OF_SERVICE}` und keine aktive Hard-Blockade aus §7.
4. **Datenlage belastbar** — Ableitung konnte ohne Fail-Closed-Fehler durchgeführt werden (§3.6).

Zukünftige Buchungen **außerhalb** des Reservierungsfensters ändern §2 **nicht** → Fahrzeug bleibt `AVAILABLE`.

#### `RESERVED`

Alle Bedingungen müssen gleichzeitig gelten:

1. Eine **verbindliche Buchung** (`PENDING` oder `CONFIRMED`) befindet sich im **Pickup-Reservierungsfenster** (§3.4).
2. **Pickup noch nicht abgeschlossen** — kein `BookingHandoverProtocol` mit `kind = PICKUP` für diese Buchung (oder äquivalent: `Booking.status` noch nicht `ACTIVE` durch Handover).
3. Kein überlagernder Zustand `ACTIVE_RENTED`, `MAINTENANCE`, `BLOCKED`, `UNKNOWN`.

**Nicht:** „irgendeine zukünftige CONFIRMED-Buchung existiert“ (das ist §4, nicht §2).

#### `ACTIVE_RENTED`

Alle Bedingungen müssen gleichzeitig gelten:

1. Fahrzeug **tatsächlich übergeben** — `Booking.status = ACTIVE` **und** Pickup-Handover-Protokoll vorhanden (oder synchroner Übergang durch denselben Transaktionspfad).
2. **Return noch nicht abgeschlossen** — kein abgeschlossener Return-Handover / `Booking.status` ∉ `{COMPLETED, CANCELLED, NO_SHOW}`.

#### `MAINTENANCE`

- Persistierter Rohstatus `IN_SERVICE`, **oder**
- explizite Maintenance-Policy aus §7 mit `blockLevel = maintenance` (weiche Wartung ohne harte Sperre bleibt Readiness-Thema, nicht zwingend `MAINTENANCE` — siehe §7.3).

#### `BLOCKED`

- Persistierter Rohstatus `OUT_OF_SERVICE`, **oder**
- aktive Hard-Blockade aus Rental Health / Compliance gemäß §7.2.

#### `UNKNOWN`

- Zustand kann **nicht sicher** bestimmt werden.

**Verbindliche Regeln:**

- `UNKNOWN` **darf niemals** als `AVAILABLE` behandelt werden (weder in UI, noch in Counts, noch in Buchungs-Gates als „frei“).
- `UNKNOWN` **darf niemals** still in `AVAILABLE` demoted werden (V1-Ghost-Guard ist zu permissiv).
- Bei `UNKNOWN` muss mindestens ein `reasonCode` aus §9 gesetzt sein.

### 3.4 Pickup-Reservierungsfenster (normativ)

Das **Pickup-Reservierungsfenster** ist ein halboffenes Zeitintervall pro Buchung:

```
reservationWindowStart = startOfCalendarDay(booking.startDate, organizationTimezone)
reservationWindowEnd   = pickupHandoverCompletedAt  OR  booking.endDate  (whichever comes first)
```

**Aktiv jetzt** gilt:

```
evaluationAt ∈ [reservationWindowStart, reservationWindowEnd)
AND booking.status IN (PENDING, CONFIRMED)
AND NOT exists(PICKUP protocol)
```

| Parameter | Wert |
|-----------|------|
| `organizationTimezone` | Org-Einstellung, Default `Europe/Berlin` (wie `findTodaysPickups`) |
| `startOfCalendarDay` | 00:00:00 in Org-TZ, als UTC instant |
| Vor Start des Fensters | Operativer Zustand bleibt **`AVAILABLE`** (sofern sonst keine Blockade) |

**Beispiel KS FH 660E:** Buchung 1.8.2026 10:00, Org-TZ Europe/Berlin, Stichtag 15.7.2026 → Fenster beginnt **1.8.2026 00:00 CEST** → am 15.7. ist operativer Zustand **`AVAILABLE`**, nicht `RESERVED`.

### 3.5 Ableitungspräzedenz (operativer Zustand)

Strikt in dieser Reihenfolge; erste zutreffende Regel gewinnt:

```
1. UNKNOWN          (Ableitungsfehler / widersprüchliche Daten)
2. BLOCKED          (Hard-Blockade)
3. MAINTENANCE      (IN_SERVICE)
4. ACTIVE_RENTED    (ACTIVE + Pickup abgeschlossen)
5. RESERVED         (im Reservierungsfenster, Pickup offen)
6. AVAILABLE        (Default bei belastbarer Datenlage)
```

### 3.6 Fail-Closed zu UNKNOWN

| Bedingung | Ergebnis |
|-----------|----------|
| Booking-Query für Ableitung fehlgeschlagen | `UNKNOWN` + `DERIVATION_BOOKING_QUERY_FAILED` |
| Mehrere `ACTIVE` Bookings ohne Auflösungsregel | `UNKNOWN` + `DERIVATION_MULTIPLE_ACTIVE_BOOKINGS` |
| `ACTIVE` Booking ohne Pickup-Protokoll und ohne synchronen Handover-Pfad | `UNKNOWN` + `DERIVATION_ACTIVE_WITHOUT_PICKUP` |
| Rohstatus `RENTED`/`RESERVED` mit widersprüchlicher Buchungslage | `UNKNOWN` (nicht `AVAILABLE`) + passender Reason |

---

## 4. Aktuelle Buchungsbelegung (Konzept 3)

### 4.1 Definition

Beschreibt **nur die jetzt relevante** Belegung — nicht die gesamte Buchungshistorie.

### 4.2 Struktur (Read-Model)

```typescript
interface CurrentVehicleOccupancy {
  kind: 'none' | 'pickup_reservation' | 'active_rental';
  bookingId: string | null;
  bookingStatus: BookingStatus | null;
  windowStart: string | null;   // ISO — Reservierungsfenster oder Rental-Start
  windowEnd: string | null;     // ISO — geplantes Ende / Return
  pickupOverdue: boolean;
  returnOverdue: boolean;
  customerDisplayName: string | null;
  pickupStationName: string | null;
  returnStationName: string | null;
}
```

### 4.3 Mapping zu operativem Zustand

| `kind` | Operativer Zustand (typisch) |
|--------|------------------------------|
| `none` | `AVAILABLE` (wenn nicht BLOCKED/MAINTENANCE) |
| `pickup_reservation` | `RESERVED` |
| `active_rental` | `ACTIVE_RENTED` |

**Höchstens eine** aktuelle Belegung pro Fahrzeug. Bei Konflikt → `UNKNOWN`.

---

## 5. Zukünftige Belegung (Konzept 4)

### 5.1 Definition

Alle **zukünftigen** Buchungen mit blockierendem Status, deren geplanter Zeitraum **nach** `evaluationAt` beginnt oder **über** `evaluationAt` hinausreicht — unabhängig vom operativen Zustand §2.

### 5.2 Struktur

```typescript
interface FutureVehicleOccupancy {
  nextBooking: FutureBookingRef | null;
  furtherBookings: FutureBookingRef[];  // chronologisch sortiert, ohne next
}

interface FutureBookingRef {
  bookingId: string;
  bookingRef: string;           // BK-XXXXXX
  status: BookingStatus;
  startDate: string;
  endDate: string;
  reservationWindowStart: string;
}
```

### 5.3 Verbindliche Regel (Operator-Anforderung)

> **Zukünftige Buchung ändert den aktuellen operativen Zustand vor Beginn des Reservierungsfensters nicht.**

- CONFIRMED 1.8.–6.8. am 15.7. → §2 = `AVAILABLE`, §4 enthält `nextBooking`.
- Ab 1.8. 00:00 Org-TZ → §2 wechselt zu `RESERVED` (wenn Pickup offen).

### 5.4 Abgrenzung zu §5 (Buchbarkeit)

§4 ist **informationsorientiert** (Anzeige, Tasks, „nächste Buchung“). §5 ist **entscheidungsorientiert** (darf ein neues Intervall gebucht werden?).

---

## 6. Zeitraumbezogene Buchbarkeit (Konzept 5)

### 6.1 Definition

Prüfung, ob ein Fahrzeug für ein **konkretes halboffenes Intervall** `[requestedStart, requestedEnd)` buchbar ist.

### 6.2 Normative Regel

Unabhängig von §2:

| Prüfung | Blockierend wenn |
|---------|------------------|
| Overlap | ∃ Booking mit `status ∈ {PENDING, CONFIRMED, ACTIVE}` und Intervallüberschneidung (bestehende `buildOverlapWhere`-Semantik) |
| Hard-Block §7 | `OUT_OF_SERVICE` oder Hard-Blockade aktiv |
| Rental Health Gate | `rental_blocked = true` beim **Create** (bestehendes Gate) |

**Zukünftige Buchung blockiert den geplanten Zeitraum** auch dann, wenn §2 vor Fensterbeginn `AVAILABLE` ist.

### 6.3 API-Ergebnis (Ziel)

```typescript
interface IntervalAvailabilityResult {
  available: boolean;
  blockingBookingId: string | null;
  reasonCode: IntervalAvailabilityReasonCode | null;
}
```

| `reasonCode` | Bedeutung |
|--------------|-----------|
| `INTERVAL_FREE` | Kein Konflikt |
| `INTERVAL_BOOKING_OVERLAP` | Überlappende Buchung |
| `INTERVAL_VEHICLE_BLOCKED` | Hard-Block / OUT_OF_SERVICE |
| `INTERVAL_RENTAL_HEALTH_BLOCKED` | Health-Gate |
| `INTERVAL_UNKNOWN` | Prüfung nicht durchführbar |

---

## 7. Rental Readiness (Konzept 6)

### 7.1 Definition

**Rental Readiness** beantwortet: „Ist das Fahrzeug **qualitativ** bereit, **jetzt** an einen Kunden vermietet zu werden?“ — unabhängig davon, ob es operative **`AVAILABLE`** ist oder bereits **`RESERVED`**.

### 7.2 Kanonische Werte

| Code | Deutsche UI | Semantik |
|------|-------------|----------|
| `READY` | Vermietungsbereit | Keine blockierenden Readiness-Gründe |
| `NOT_READY` | Nicht vermietungsbereit | Mindestens ein nicht-blockierender Hindernisgrund (Cleaning, Warning, Telemetry stale für Policy, …) |
| `BLOCKED` | Vermietung blockiert | Hard-Blockade (identisch zu §7.3 Hard) |
| `UNKNOWN` | Unbekannt | Health/Readiness-Query fehlgeschlagen |

### 7.3 Abgrenzung operativer Zustand ↔ Readiness

| Operativ | Readiness | Bedeutung |
|----------|-----------|-----------|
| `AVAILABLE` | `READY` | KPI „Ready for Renting“ |
| `AVAILABLE` | `NOT_READY` | Verfügbar, aber z. B. Reinigung / Warning |
| `RESERVED` | `NOT_READY` | Pickup steht an, Fahrzeug noch nicht bereit |
| `ACTIVE_RENTED` | — | Readiness für Neuvermietung irrelevant |
| `UNKNOWN` | `UNKNOWN` | Beide fail-closed |

**Regel:** Readiness-Gründe **drehen nie** den operativen Zustand auf `AVAILABLE` oder umgekehrt.

---

## 8. Maintenance und Blocking (Konzept 7)

### 8.1 Definition

Technischer oder fachlicher **Ausschluss** von Vermietung — teilweise unabhängig von Buchungsbelegung.

### 8.2 Block-Level (normativ)

| Level | Code | Auslöser | Wirkung auf §2 | Wirkung auf §5 |
|-------|------|---------|----------------|----------------|
| Hard | `hard` | `OUT_OF_SERVICE`, kritische Compliance (TÜV/BOKraft overdue per Policy), `rental_blocked` mit legalen Gründen | `BLOCKED` | blockiert |
| Maintenance | `maintenance` | `IN_SERVICE` | `MAINTENANCE` | blockiert |
| Soft | `soft` | Service-Warnung, Cleaning, Telemetry — ohne Hard-Policy | **kein** Einfluss auf §2 | blockiert **nicht** allein |
| None | `none` | — | — | — |

### 8.3 Quellen (Ist → Soll)

| Quelle | V2-Einordnung |
|--------|---------------|
| `Vehicle.status = IN_SERVICE` | `MAINTENANCE` |
| `Vehicle.status = OUT_OF_SERVICE` | `BLOCKED` |
| `RentalHealthService.isRentalBlocked` | Hard oder Soft je nach `blocking_reasons` |
| `cleaningStatus = NEEDS_CLEANING` | Soft → Readiness `NOT_READY` |
| Dashboard Runtime `reasonBlocksRenting` | Ableitung aus obigen — keine Parallelwahrheit |

---

## 9. Reason-Codes (maschinenlesbar)

Jeder abgeleitete Zustand **kann** einen oder mehrere Reason-Codes tragen (für UI-Chips, Action Queue, Logs).

### 9.1 Operative Zustands-Codes (`op:*`)

| Code | DE-Label (UI) | Bedeutung |
|------|---------------|-----------|
| `op:available:idle` | Verfügbar | Keine aktuelle Belegung, keine Blockade |
| `op:reserved:pickup_window` | Reserviert — Pickup-Fenster | Im Reservierungsfenster, Pickup ausstehend |
| `op:reserved:pickup_overdue` | Reserviert — Pickup überfällig | Fenster aktiv, `startDate` überschritten, kein Pickup |
| `op:active_rented:in_contract` | Aktiv vermietet | ACTIVE + Pickup abgeschlossen |
| `op:active_rented:return_overdue` | Aktiv vermietet — Rückgabe überfällig | ACTIVE, `endDate` überschritten |
| `op:maintenance:scheduled` | In Wartung | IN_SERVICE |
| `op:blocked:operational` | Gesperrt — Betrieb | OUT_OF_SERVICE |
| `op:blocked:compliance` | Gesperrt — Compliance | TÜV/BOKraft/Health Hard-Block |
| `op:unknown:derivation_failed` | Unbekannt — Ableitung fehlgeschlagen | Query/Logik-Fehler |
| `op:unknown:data_conflict` | Unbekannt — Datenkonflikt | Widersprüchliche Booking/Handover-Daten |

### 9.2 Belegungs-Codes (`occ:*`)

| Code | DE-Label | Bedeutung |
|------|----------|-----------|
| `occ:none` | Keine aktuelle Belegung | §3 kind = none |
| `occ:pickup_reservation` | Pickup-Reservierung aktiv | §3 kind = pickup_reservation |
| `occ:active_rental` | Aktive Vermietung | §3 kind = active_rental |
| `occ:future:next` | Nächste Buchung geplant | §4 nextBooking gesetzt |
| `occ:future:further` | Weitere Buchungen geplant | §4 furtherBookings non-empty |

### 9.3 Readiness-Codes (`ready:*`)

| Code | DE-Label | Bedeutung |
|------|----------|-----------|
| `ready:ok` | Vermietungsbereit | READY |
| `ready:cleaning` | Reinigung ausstehend | NOT_READY |
| `ready:health_warning` | Gesundheit — Warnung | NOT_READY |
| `ready:health_critical` | Gesundheit — kritisch | NOT_READY oder BLOCKED |
| `ready:telemetry_offline` | Telemetrie — offline | NOT_READY (Policy) |
| `ready:blocked` | Vermietung blockiert | BLOCKED |
| `ready:unknown` | Unbekannt | UNKNOWN |

### 9.4 Intervall-Codes (`interval:*`)

Siehe §6.3.

---

## 10. Ziel-Read-Model (aggregiert)

Ein kanonischer Service liefert pro Fahrzeug:

```typescript
interface VehicleOperationalSnapshot {
  vehicleId: string;
  organizationId: string;
  evaluationAt: string;              // ISO

  persistedRawStatus: 'AVAILABLE' | 'IN_SERVICE' | 'OUT_OF_SERVICE';

  operationalState: VehicleOperationalState;
  operationalReasonCodes: string[];

  currentOccupancy: CurrentVehicleOccupancy;
  futureOccupancy: FutureVehicleOccupancy;

  rentalReadiness: 'READY' | 'NOT_READY' | 'BLOCKED' | 'UNKNOWN';
  readinessReasonCodes: string[];

  maintenanceBlock: { level: 'none' | 'soft' | 'maintenance' | 'hard'; codes: string[] };
}
```

**Alle** Fleet-/Dashboard-Endpunkte konsumieren dieses Snapshot-Objekt (oder eine Projektion davon). Keine zweite Ableitung in `fleetVisualState` für operative Wahrheit.

---

## 11. UI-Bezeichnungen (Deutsch, verbindlich)

| `operationalState` | Tab-/Badge-Label | Tab-Slug (Fleet Command) |
|--------------------|------------------|--------------------------|
| `AVAILABLE` | Verfügbar | `available` |
| `RESERVED` | Reserviert | `reserved` |
| `ACTIVE_RENTED` | Aktiv vermietet | `active` |
| `MAINTENANCE` | In Wartung | `maintenance` |
| `BLOCKED` | Gesperrt | `blocked` |
| `UNKNOWN` | Unbekannt | `unknown` |

**Englische UI** (optional, i18n): `Available`, `Reserved`, `Active Rented`, `Maintenance`, `Blocked`, `Unknown`.

**Legacy-Mapping (Übergang):**

| V1 API-String | V2 `operationalState` |
|---------------|------------------------|
| `Available` | `AVAILABLE` |
| `Reserved` | `RESERVED` |
| `Active Rented` | `ACTIVE_RENTED` |
| `Maintenance` | `MAINTENANCE` |
| `Blocked` / `Unavailable` | `BLOCKED` oder `MAINTENANCE` (explizite Mapping-Tabelle in Implementierung) |

---

## 12. Ist-Widersprüche (V1 → V2)

| # | Ist (V1) | Soll (V2) | Referenz |
|---|----------|-----------|----------|
| I1 | CONFIRMED future booking → sofort `Reserved` | Vor Fenster `AVAILABLE`, Fenster `RESERVED` | KS FH 660E Audit |
| I2 | `Vehicle.status` RENTED/RESERVED persistiert | Nur `AVAILABLE`/`IN_SERVICE`/`OUT_OF_SERVICE` | Inventory §2 |
| I3 | Ghost demotion → `Available` | Widerspruch → `UNKNOWN` | Inventory P0-3 |
| I4 | Org-Stats zählen raw DB | Stats aus `operationalState` oder klar getrennte Metriken | Inventory P0-2 |
| I5 | `normalizeStatus` unknown → Available | unknown → `UNKNOWN` | Inventory P1-1 |
| I6 | Maintenance in Available-Tab | Eigener Tab oder `MAINTENANCE` | Inventory P1-2 |
| I7 | Readiness vermischt mit Tab-Status | Strikt §6 vs §2 | Runtime builder |

---

## 13. Akzeptanzkriterien (für Implementierungsprompts)

| ID | Kriterium |
|----|-----------|
| AC-1 | CONFIRMED Buchung 1.8.–6.8., Stichtag 15.7. → `operationalState = AVAILABLE`, `futureOccupancy.nextBooking` gesetzt |
| AC-2 | Gleiche Buchung, Stichtag 1.8. 08:00 Org-TZ → `operationalState = RESERVED` |
| AC-3 | Nach Pickup-Handover → `ACTIVE_RENTED`; persistierter Rohstatus bleibt `AVAILABLE` oder unverändert admin |
| AC-4 | Intervall 1.8.–6.8. ist in §5 blockiert, auch wenn AC-1 `AVAILABLE` zeigt |
| AC-5 | Ableitungsfehler → `UNKNOWN`, niemals `AVAILABLE` |
| AC-6 | Fleet-Map, `/vehicles`, Detail liefern identischen `operationalState` |
| AC-7 | Master-Admin zeigt `persistedRawStatus` getrennt von `operationalState` |
| AC-8 | Jeder nicht-`AVAILABLE`/`ACTIVE_RENTED`-Zustand hat ≥1 Reason-Code |

---

## 14. Implementierungsreihenfolge (Vorschlag für Prompts 4+)

1. `VehicleOperationalStateService` + Unit-Tests (reine Ableitung)  
2. Fleet-API DTO + Ersetzung `deriveFleetStatusContext`  
3. Frontend: Store ohne `normalizeStatus`-Fallback; Tabs aus `operationalState`  
4. Dashboard Runtime: Readiness entkoppeln  
5. Org-Stats / Insights Migration  
6. Prisma: Deprecation `RENTED`/`RESERVED` Schreibpfade + Datenbereinigung  

---

## Änderungshistorie

| Version | Datum | Änderung |
|---------|-------|----------|
| 2.0 | 2026-07-15 | Erstfassung Spezifikation (Prompt 3/43) |

---

*Ende der Spezifikation — keine produktive Implementierung in diesem Schritt.*
