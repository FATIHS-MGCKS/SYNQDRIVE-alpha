# Vehicle Operational State V2 — Verbindliche Fach- und Technikspezifikation

**Version:** 2.2 (Spezifikation)  
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

Strikt in dieser Reihenfolge; erste zutreffende Regel gewinnt den **Hauptstatus** (`operationalState`). Details, parallele Signale und Übergänge: **§15**.

```
1. UNKNOWN          (Statusdaten nicht belastbar)
2. MAINTENANCE      (IN_SERVICE / Maintenance-Policy)
3. BLOCKED          (Hard-Blockade)
4. ACTIVE_RENTED    (ACTIVE + Pickup abgeschlossen)
5. RESERVED         (verbindliche Buchung im Reservierungsfenster)
6. AVAILABLE        (Sonstfall bei belastbarer Datenlage)
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

### 9.5 Kanonische Ableitungs-Codes (`OperationalReasonCode`)

Für API/DTO/Frontend-Verträge (§16) gelten **zusätzlich** zu den UI-Chips (`op:*`) die folgenden **stabilen Enum-Codes** als primärer `operationalState.reason`:

| `OperationalReasonCode` | Typischer `operationalState.status` | `op:*`-Äquivalent |
|-----------------------|-------------------------------------|-------------------|
| `NO_ACTIVE_OR_UPCOMING_WINDOW` | `AVAILABLE` | `op:available:idle` |
| `ACTIVE_BOOKING` | `ACTIVE_RENTED` | `op:active_rented:in_contract` / `op:active_rented:return_overdue` |
| `PICKUP_WINDOW_ACTIVE` | `RESERVED` | `op:reserved:pickup_window` / `op:reserved:pickup_overdue` |
| `MAINTENANCE_ACTIVE` | `MAINTENANCE` | `op:maintenance:scheduled` |
| `HARD_BLOCK_ACTIVE` | `BLOCKED` | `op:blocked:operational` / `op:blocked:compliance` |
| `BOOKING_DATA_UNAVAILABLE` | `UNKNOWN` | `op:unknown:derivation_failed` |
| `BOOKING_STATE_INCONSISTENT` | `UNKNOWN` | `op:unknown:data_conflict` |
| `HANDOVER_STATE_INCONSISTENT` | `UNKNOWN` | `op:unknown:data_conflict` |
| `RAW_STATUS_INCONSISTENT` | `UNKNOWN` | `op:unknown:data_conflict` |
| `UNKNOWN_STATUS_VALUE` | `UNKNOWN` | `op:unknown:data_conflict` |

**Regel:** `operationalState.reason` trägt **genau einen** `OperationalReasonCode` (Primärgrund). Zusätzliche `op:*`/`occ:*`/`ready:*`-Codes erscheinen in separaten Arrays (`supplementalReasonCodes`, `readinessReasonCodes`).

---

## 10. Ziel-Read-Model (aggregiert)

Ein kanonischer Service liefert pro Fahrzeug ein **`VehicleOperationalSnapshot`** (vollständiger Vertrag: **§16**).

```typescript
/** Vollständige Typdefinition und Consumer-Projektionen: §16 */
interface VehicleOperationalSnapshot {
  vehicleId: string;
  organizationId: string;
  evaluationAt: string;              // ISO — Request-/Berechnungszeitpunkt

  /** Nur diagnostisch — niemals operative UI-Wahrheit (§16.6) */
  rawVehicleStatus: RawVehicleStatusDiagnostic;

  /** Kanonischer operativer Block — einzige Wahrheit für Anzeige (§16.3) */
  operationalState: OperationalStateBlock;

  /** Strukturierte Buchungskontext-Referenzen (§16.4) */
  bookingContext: BookingContextBlock;

  /** Legacy-kompatible Belegungsdetails — abgeleitet aus bookingContext (§16.2) */
  currentOccupancy: CurrentVehicleOccupancy;
  futureOccupancy: FutureVehicleOccupancy;

  rentalReadiness: 'READY' | 'NOT_READY' | 'BLOCKED' | 'UNKNOWN';
  readinessReasonCodes: string[];

  maintenanceBlock: { level: 'none' | 'soft' | 'maintenance' | 'hard'; codes: string[] };
  parallelSignals: ParallelSignalsBlock;   // §15.2
}
```

**Alle** Fleet-/Dashboard-Endpunkte konsumieren dieses Snapshot-Objekt (oder eine **explizite Projektion** gemäß §16.9). Keine zweite Ableitung in `fleetVisualState` oder `deriveFleetStatusContext` für operative Wahrheit.

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
| AC-7 | Master-Admin zeigt `rawVehicleStatus` getrennt von `operationalState.status` (§16.6) |
| AC-8 | Jeder nicht-`AVAILABLE`/`ACTIVE_RENTED`-Zustand hat ≥1 Reason-Code |
| AC-9 | Jeder Consumer (§16.9) erhält `operationalState` mit `status`, `reason`, `isReliable` — kein Consumer leitet operativen Status aus `rawVehicleStatus` ab |
| AC-10 | `bookingContext.activeBooking` gesetzt ⇔ `operationalState.status = ACTIVE_RENTED` **oder** parallele Belegung (§15.3) |
| AC-11 | `bookingContext.reservedBooking` gesetzt ⇔ Pickup-Fenster aktiv und kein Pickup |
| AC-12 | Zukünftige Buchung → `bookingContext.nextBooking` + `futureBookingCount ≥ 1`; `operationalState.status` bleibt `AVAILABLE` vor Fenster |
| AC-13 | `dataQualityState = UNAVAILABLE` ⇒ `operationalState.status = UNKNOWN`, `isReliable = false`, `reason = BOOKING_DATA_UNAVAILABLE` |
| AC-14 | Fleet-Liste, Fleet-Map und Vehicle-Detail liefern **identischen** `operationalState.status` und `reason` pro Fahrzeug zum selben `evaluationAt` (± Cache-TTL) |
| AC-15 | Mobile-Projektion (§16.9.5) verliert keine Pflichtfelder gegenüber Desktop-Fleet-Map |
| AC-16 | Legacy-Feld `status` (V1-String) ist rein kompatibel und spiegelt `operationalState.status` — wird nicht separat abgeleitet |

---

## 14. Implementierungsreihenfolge (Vorschlag für Prompts 6+)

1. `VehicleOperationalStateService` + Unit-Tests (reine Ableitung gemäß §15, Output gemäß §16)  
2. Fleet-API DTO (`VehicleOperationalSnapshot` / Projektionen) + Ersetzung `deriveFleetStatusContext`  
3. Frontend: Store ohne `normalizeStatus`-Fallback; Tabs aus `operationalState.status`  
4. Dashboard Runtime: Readiness entkoppeln; Input aus `operationalState` + `bookingContext`  
5. Org-Stats / Insights Migration  
6. Prisma: Deprecation `RENTED`/`RESERVED` Schreibpfade + Datenbereinigung  

---

## 15. Prioritäts- und Übergangsmatrix (verbindlich)

Dieses Kapitel ist die **normative Ableitungs- und Zustandsmaschine** für `operationalState`. Es präzisiert §3.5 und definiert, wie parallele Signale (Belegung + Blockade) transportiert werden.

### 15.1 Kanonische Prioritätskette (Hauptstatus)

Die Ableitung läuft **top-down**; die erste zutreffende Zeile bestimmt `operationalState`:

| Prio | Bedingung (alle tenant-scoped, `evaluationAt`) | `operationalState` | Primärer `op:*`-Reason |
|------|-----------------------------------------------|--------------------|-------------------------|
| **1** | Statusdaten **nicht belastbar** (§3.6, §15.6) | `UNKNOWN` | `op:unknown:*` |
| **2** | Maintenance aktiv (`persistedRawStatus = IN_SERVICE` oder `maintenanceBlock.level = maintenance`) | `MAINTENANCE` | `op:maintenance:scheduled` |
| **3** | Hard-Block aktiv (`persistedRawStatus = OUT_OF_SERVICE` oder `maintenanceBlock.level = hard`) | `BLOCKED` | `op:blocked:*` |
| **4** | Aktive Vermietung (`Booking.status = ACTIVE` + Pickup-Protokoll + Return offen) | `ACTIVE_RENTED` | `op:active_rented:*` |
| **5** | Verbindliche Buchung im **Pickup-Reservierungsfenster** (`PENDING`/`CONFIRMED`, Fenster aktiv, kein Pickup) | `RESERVED` | `op:reserved:*` |
| **6** | Sonst (belastbare Datenlage, keine höherwertige Regel) | `AVAILABLE` | `op:available:idle` |

**Entscheidungsbaum (kompakt):**

```
evaluate(vehicle, evaluationAt):
  if !dataReliable           → UNKNOWN
  else if maintenanceActive  → MAINTENANCE
  else if hardBlockActive    → BLOCKED
  else if activeRental       → ACTIVE_RENTED
  else if inReservationWindow→ RESERVED
  else                       → AVAILABLE
```

### 15.2 Hauptstatus vs. Zusatz-Reasons vs. parallele Signale

#### 15.2.1 Begriffe

| Begriff | Feld | Regel |
|---------|------|-------|
| **Hauptstatus** | `operationalState` | Genau **ein** Wert aus der Prioritätskette §15.1 — steuert Fleet-Tabs, operative KPI-Buckets, Map-Operational-Tone |
| **Primärer Reason** | erstes Element in `operationalReasonCodes` | Begründet den Hauptstatus (`op:*`) |
| **Zusatz-Reasons** | weitere Einträge in `operationalReasonCodes`, `readinessReasonCodes`, `occ:*` | Parallele Signale; **ändern den Hauptstatus nicht** |
| **Parallele Belegung** | `currentOccupancy` | Kann von Hauptstatus **abweichen**, wenn Prio 2/3 über Prio 4/5 siegen (s. §15.3) |
| **Parallele Blockade** | `maintenanceBlock` | Wird **immer** vollständig befüllt, auch wenn nicht Hauptstatus |

#### 15.2.2 Transport im Snapshot

Erweiterung des Ziel-Modells (§10) — **additive** Felder:

```typescript
interface VehicleOperationalSnapshot {
  // … bestehende Felder …

  /** Signale, die fachlich parallel zum Hauptstatus bestehen. */
  parallelSignals: {
    /** true, wenn unabhängig vom Hauptstatus eine aktive/active-nahe Belegung existiert */
    hasActiveOrReservedOccupancy: boolean;
    /** Roh-Belegung — auch bei Hauptstatus MAINTENANCE/BLOCKED */
    occupancyKind: 'none' | 'pickup_reservation' | 'active_rental';
    occupancyBookingId: string | null;
    /** Hard/Maintenance-Block unabhängig vom Hauptstatus (für Badges) */
    blockLevel: 'none' | 'soft' | 'maintenance' | 'hard';
  };
}
```

**UI-Regel:** Ein Badge zeigt **immer** den Hauptstatus. Zusätzliche Chips zeigen Zusatz-Reasons (max. 2 sichtbar + Tooltip für Rest). Parallele Belegung bei `MAINTENANCE`/`BLOCKED` wird als **sekundärer Chip** dargestellt (z. B. „Aktive Vermietung läuft“), nicht als Tab-Wechsel.

### 15.3 Maintenance während aktiver Vermietung

**Szenario:** `Booking.status = ACTIVE`, Pickup abgeschlossen; Operator setzt `persistedRawStatus = IN_SERVICE` während der Miete.

| Dimension | Wert | Begründung |
|-----------|------|------------|
| **Hauptstatus (Anzeige)** | `MAINTENANCE` | Prio **2** schlägt Prio **4** (`ACTIVE_RENTED`) |
| **Primärer Reason** | `op:maintenance:scheduled` | |
| **Zusatz-Reason** | `op:active_rented:in_contract` + `occ:active_rental` | Aktive Vermietung bleibt fachlich bestehen |
| **`currentOccupancy.kind`** | `active_rental` | Belegung wird **nicht** gelöscht |
| **`currentOccupancy.bookingId`** | `<active booking id>` | |
| **Rental Readiness** | `NOT_READY` oder `BLOCKED` (je nach Policy) | Readiness folgt **eigener** Kette §15.5 |
| **Neue Buchung (§5)** | **blockiert** | Maintenance blockiert Intervalle |
| **Pickup an laufender ACTIVE-Buchung** | **verboten** (bereits aktiv) | |
| **Workflow `vehicle.status.update` → IN_SERVICE** | erlaubt | Hauptstatus wechselt bei nächster Ableitung zu `MAINTENANCE` |

**Gleiches Muster für Hard-Block während ACTIVE:**

| Dimension | Wert |
|-----------|------|
| **Hauptstatus** | `BLOCKED` (Prio 3 > 4) |
| **Zusatz-Reason** | `op:active_rented:in_contract` |
| **`currentOccupancy`** | bleibt `active_rental` |

**Wichtig:** Der Kunde hat das Fahrzeug weiterhin; die UI kommuniziert „In Wartung / Gesperrt **bei laufender Vermietung**“, nicht „Verfügbar“.

### 15.4 Blockade und aktive Vermietung gleichzeitig

| Signal | Transport | Beeinflusst Hauptstatus? |
|--------|-----------|-------------------------|
| Aktive Vermietung (ACTIVE + Pickup) | `currentOccupancy.kind = active_rental`, `occ:active_rental`, ggf. `op:active_rented:*` als Zusatz-Reason | Nur wenn Prio 4 **höchste** ist |
| Hard-Block | `maintenanceBlock.level = hard`, `op:blocked:*` | Ja → `BLOCKED`, wenn Prio 3 höchste |
| Maintenance | `maintenanceBlock.level = maintenance`, `op:maintenance:*` | Ja → `MAINTENANCE`, wenn Prio 2 höchste |
| Soft-Block (Cleaning, Warning) | `readinessReasonCodes`, `maintenanceBlock.level = soft` | **Nein** für Hauptstatus; Readiness §15.5 |

**Konkurrenz-Matrix (Hauptstatus bei gleichzeitigem Vorliegen):**

| Maintenance | Hard-Block | Active Rental | Reservation Window | **Hauptstatus** |
|-------------|------------|---------------|-------------------|-----------------|
| ja | — | ja | — | `MAINTENANCE` |
| — | ja | ja | — | `BLOCKED` |
| ja | ja | ja | — | `MAINTENANCE` (Prio 2 > 3) |
| — | — | ja | ja | `ACTIVE_RENTED` (Prio 4 > 5) |
| — | — | — | ja | `RESERVED` |
| — | — | — | — | `AVAILABLE` |

### 15.5 Priorität für Anzeige, Rental Readiness und Workflow

Drei **getrennte** Ableitungsketten — dürfen nicht vermischt werden:

| Domäne | Primäre Quelle | Prioritätslogik | Fail-Closed |
|--------|----------------|-----------------|-------------|
| **Anzeige** (Tabs, Map-Tone, operative KPIs) | `operationalState` §15.1 | Streng 1→6 | `UNKNOWN` eigener Tab/Style; **nie** als `AVAILABLE` zählen |
| **Rental Readiness** | §7 + Health/Cleaning/Telemetry | 1) `UNKNOWN` wenn Health-Query fail; 2) `BLOCKED` bei Hard-Block; 3) `NOT_READY` bei Soft-Gründen; 4) `READY` | `UNKNOWN` ≠ `READY` |
| **Workflow / Automation** | Snapshot gesamt | **Hard-Block** und **UNKNOWN** stoppen vermietungsauslösende Actions; Maintenance stoppt **neue** Buchungen, nicht zwingend laufende ACTIVE-Prozesse; ACTIVE_RENTED erlaubt Return-Workflow | Keine Silent-Fallbacks |

**Readiness bei parallelen Signalen:**

| `operationalState` | Typische `rentalReadiness` | Anzeige-Kopplung |
|--------------------|----------------------------|------------------|
| `AVAILABLE` | `READY` / `NOT_READY` | KPI „Ready for Renting“ nur bei beiden |
| `RESERVED` | `NOT_READY` (default Policy) | Pickup-KPI separat |
| `ACTIVE_RENTED` | n/a (nicht „ready“) | Today's Operations |
| `MAINTENANCE` | `BLOCKED` oder `NOT_READY` | Wartungs-KPI |
| `BLOCKED` | `BLOCKED` | Sperr-KPI |
| `UNKNOWN` | `UNKNOWN` | Warn-KPI |

**Workflow-Beispiele:**

| Trigger | Reagiert auf | Aktion |
|---------|--------------|--------|
| `vehicle.status.update` → `IN_SERVICE` | `persistedRawStatus` | Nächste Ableitung → `MAINTENANCE`; laufende ACTIVE bleibt in `currentOccupancy` |
| Handover Pickup | Buchung + Protokoll | → `ACTIVE_RENTED` (wenn nicht Prio 2/3) |
| Handover Return | Buchung COMPLETED | → `AVAILABLE` (wenn keine weiteren Signale) |
| Booking Cancel im Fenster | Buchung terminal | → `AVAILABLE` |
| Booking-Query error | `dataReliable = false` | → `UNKNOWN`; Workflow **pausiert** Auto-Zuweisungen |

### 15.6 Verbotene Annahmen (normativ)

Die folgenden Implikationen sind **unzulässig** in Ableitung, UI-Fallbacks, Tests und Migrationsskripten:

| # | Verbotene Annahme | Korrekte V2-Regel |
|---|-------------------|-------------------|
| V1 | Keine Booking-Daten ⇒ `AVAILABLE` | Keine Daten ⇒ `UNKNOWN` (`op:unknown:derivation_failed`) oder expliziter leerer Satz **nach erfolgreicher** Query |
| V2 | Unbekannter Status-String ⇒ `AVAILABLE` | Unbekannter String ⇒ `UNKNOWN` (`op:unknown:data_conflict`) |
| V3 | Zukünftige CONFIRMED-Buchung ⇒ sofort `RESERVED` | Nur im Reservierungsfenster ⇒ `RESERVED`; sonst `AVAILABLE` + `occ:future:next` |
| V4 | `persistedRawStatus = RESERVED` ⇒ kanonisch `RESERVED` | Rohstatus ignorieren für §2; aus Fenster + Buchung ableiten; Widerspruch ⇒ `UNKNOWN` |
| V5 | `persistedRawStatus = RENTED` ⇒ kanonisch `ACTIVE_RENTED` | Nur bei ACTIVE + Pickup-Protokoll; sonst `UNKNOWN` (`op:unknown:data_conflict`) |
| V6 | `UNKNOWN` in Counts/UI wie `AVAILABLE` behandeln | Eigene Kategorie; Intervalle §5 ⇒ `INTERVAL_UNKNOWN` |
| V7 | Ghost-Demotion V1: RENTED ohne Booking ⇒ Available | ⇒ `UNKNOWN` mit Reason |

### 15.7 Übergangsmatrix (Zustandsautomat)

Notation: **E** = Ereignis, **B** = Bedingung, **H** = Hauptstatus nach Ableitung.

#### 15.7.1 Erlaubte Übergänge (Hauptstatus)

| Von | Nach | Auslöser (E) | Bedingungen (B) |
|-----|------|--------------|-----------------|
| `AVAILABLE` | `RESERVED` | Kalender: Reservierungsfenster beginnt | CONFIRMED/PENDING im Fenster, kein Pickup, Prio 2/3/1 nicht aktiv |
| `AVAILABLE` | `MAINTENANCE` | Admin/Workflow: `IN_SERVICE` | `dataReliable` |
| `AVAILABLE` | `BLOCKED` | Admin/Workflow: `OUT_OF_SERVICE` oder Hard-Block | `dataReliable` |
| `AVAILABLE` | `UNKNOWN` | Ableitungsfehler / Datenkonflikt | §3.6 |
| `RESERVED` | `ACTIVE_RENTED` | Pickup-Handover abgeschlossen | `Booking → ACTIVE`, Pickup-Protokoll, Prio 2/3 nicht aktiv |
| `RESERVED` | `AVAILABLE` | **Stornierung** / No-Show / Fenster endet ohne Pickup | Kein anderes Fenster aktiv; keine Prio 2/3 |
| `RESERVED` | `UNKNOWN` | Inkonsistente Daten | z. B. CONFIRMED + Pickup-Protokoll ohne ACTIVE |
| `ACTIVE_RENTED` | `AVAILABLE` | Return-Handover / COMPLETED | Keine ACTIVE-Buchung, keine Prio 2/3 |
| `ACTIVE_RENTED` | `MAINTENANCE` | `IN_SERVICE` während ACTIVE | Prio 2 > 4; Belegung parallel |
| `ACTIVE_RENTED` | `BLOCKED` | `OUT_OF_SERVICE` / Hard-Block während ACTIVE | Prio 3 > 4; Belegung parallel |
| `ACTIVE_RENTED` | `UNKNOWN` | Widersprüchliche Booking-/Handover-Daten | z. B. ACTIVE ohne Pickup-Protokoll |
| `MAINTENANCE` | `AVAILABLE` | `IN_SERVICE` aufgehoben + erfolgreiche Neu-Ableitung | Keine höherwertige Regel |
| `BLOCKED` | `AVAILABLE` | Sperre aufgehoben + erfolgreiche Neu-Ableitung | Keine höherwertige Regel |
| `UNKNOWN` | *jeder* | Daten repariert / Query OK + konsistente Inputs | Nach **erfolgreicher** erneuter Ableitung §15.1 |

#### 15.7.2 Verbotene Übergänge (ohne Zwischenereignis)

| Von | Nach | Warum verboten |
|-----|------|----------------|
| `AVAILABLE` | `ACTIVE_RENTED` | Pickup-Handover Pflicht — kein direkter Sprung |
| `RESERVED` | `AVAILABLE` (still) | Nur durch Cancel/Fenster-Ende/Neu-Ableitung — nie durch fehlende Query |
| `ACTIVE_RENTED` | `RESERVED` | Rückwärts unmöglich ohne Datenkorruption |
| `UNKNOWN` | `AVAILABLE` | Nur nach expliziter erfolgreicher Ableitung, nicht als Default-Fallback |
| *jeder* | `AVAILABLE` | Wenn `dataReliable = false` |

#### 15.7.3 Übergang bei Stornierung (explizit)

**`RESERVED` → `AVAILABLE` bei Stornierung:**

1. `Booking.status` → `CANCELLED` oder `NO_SHOW`
2. Kein anderes Buchungsfenster aktiv für `evaluationAt`
3. Neu-Ableitung: Prio 1–3 negativ → Prio 5 negativ → **`AVAILABLE`**
4. `futureOccupancy` aktualisiert (nextBooking entfernt oder nachfolger)
5. `persistedRawStatus` bleibt unverändert außer Cancel-Handler (nur `AVAILABLE` wenn nicht IN_SERVICE/OUT_OF_SERVICE)

### 15.8 Beispieltabellen (konkret)

Annahmen für alle Tabellen: Org-TZ `Europe/Berlin`; `evaluationAt` wie angegeben; `dataReliable = true` außer letzte Zeile.

#### Tabelle A — Buchung in zwei Wochen

| Feld | Wert |
|------|------|
| Kontext | CONFIRMED 1.8. 10:00 – 6.8. 18:00, erstellt am 15.7. |
| `evaluationAt` | 15.7.2026 12:00 |
| `persistedRawStatus` | `AVAILABLE` |
| **Hauptstatus** | **`AVAILABLE`** |
| Primärer Reason | `op:available:idle` |
| Zusatz-Reasons | `occ:future:next` |
| `currentOccupancy.kind` | `none` |
| `futureOccupancy.nextBooking` | gesetzt (1.8.–6.8.) |
| Intervall 1.8.–6.8. (§5) | **blockiert** (`INTERVAL_BOOKING_OVERLAP`) |
| Rental Readiness | `READY` (wenn Health OK) |
| Fleet-Tab | Verfügbar |

#### Tabelle B — Pickup heute (im Fenster, vor Handover)

| Feld | Wert |
|------|------|
| Kontext | CONFIRMED, `startDate` = heute 10:00, kein Pickup-Protokoll |
| `evaluationAt` | heute 08:00 |
| **Hauptstatus** | **`RESERVED`** |
| Primärer Reason | `op:reserved:pickup_window` |
| `currentOccupancy.kind` | `pickup_reservation` |
| `futureOccupancy.nextBooking` | `null` (ist aktuelles Fenster) |
| Rental Readiness | `NOT_READY` (Policy: Pickup vorbereiten) |
| Fleet-Tab | Reserviert |

#### Tabelle C — Aktiver Mietvertrag

| Feld | Wert |
|------|------|
| Kontext | ACTIVE, Pickup-Protokoll vorhanden, Return offen |
| `persistedRawStatus` | `AVAILABLE` (V2: kein RENTED in DB) |
| **Hauptstatus** | **`ACTIVE_RENTED`** |
| Primärer Reason | `op:active_rented:in_contract` |
| `currentOccupancy.kind` | `active_rental` |
| Rental Readiness | n/a |
| Fleet-Tab | Aktiv vermietet |

#### Tabelle D — Abgeschlossener Return

| Feld | Wert |
|------|------|
| Kontext | Booking `COMPLETED`, Return-Protokoll vorhanden |
| `evaluationAt` | nach Return |
| **Hauptstatus** | **`AVAILABLE`** |
| Primärer Reason | `op:available:idle` |
| `currentOccupancy.kind` | `none` |
| Vorheriger Zustand | `ACTIVE_RENTED` → `AVAILABLE` (§15.7.1) |

#### Tabelle E — Stornierung

| Feld | Wert |
|------|------|
| Kontext | RESERVED (im Fenster), dann `CANCELLED` |
| `evaluationAt` | nach Cancel |
| **Hauptstatus** | **`AVAILABLE`** |
| Primärer Reason | `op:available:idle` |
| `currentOccupancy.kind` | `none` |
| Zusatz-Reasons | keine `occ:future:next`, sofern keine weitere Buchung |
| Übergang | `RESERVED` → `AVAILABLE` (§15.7.3) |

#### Tabelle F — Maintenance

| Feld | Wert |
|------|------|
| Kontext | `IN_SERVICE`, keine ACTIVE-Buchung |
| **Hauptstatus** | **`MAINTENANCE`** |
| Primärer Reason | `op:maintenance:scheduled` |
| `maintenanceBlock.level` | `maintenance` |
| Intervall neu (§5) | blockiert |
| Rental Readiness | `BLOCKED` oder `NOT_READY` (Policy) |
| Fleet-Tab | In Wartung |

#### Tabelle F2 — Maintenance **während** ACTIVE (parallele Signale)

| Feld | Wert |
|------|------|
| Kontext | ACTIVE + Pickup OK; Admin setzt `IN_SERVICE` |
| **Hauptstatus** | **`MAINTENANCE`** |
| Primärer Reason | `op:maintenance:scheduled` |
| Zusatz-Reasons | `op:active_rented:in_contract`, `occ:active_rental` |
| `currentOccupancy.kind` | `active_rental` (parallel) |
| UI | Tab „In Wartung“ + Chip „Aktive Vermietung“ |

#### Tabelle G — Booking-Abfragefehler

| Feld | Wert |
|------|------|
| Kontext | DB/Query für Bookings schlägt fehl |
| `dataReliable` | `false` |
| **Hauptstatus** | **`UNKNOWN`** |
| Primärer Reason | `op:unknown:derivation_failed` |
| `currentOccupancy` | **nicht** `none` als Fallback — `kind` unset / null |
| Rental Readiness | `UNKNOWN` |
| Intervall §5 | `INTERVAL_UNKNOWN` |
| Verbotene Annahme | ~~AVAILABLE~~ (V1) |

### 15.9 Konsistenz mit Akzeptanzkriterien

| AC | §15-Bezug |
|----|-----------|
| AC-1 | Tabelle A |
| AC-2 | Tabelle B |
| AC-3 | Tabelle C |
| AC-4 | Tabelle A (Intervall blockiert, Hauptstatus AVAILABLE) |
| AC-5 | Tabelle G |
| AC-8 | Jede Zeile mit nicht-trivialem Zustand hat `op:*` |

---

## 16. Backend- und Frontend-Datenvertrag (verbindlich)

Dieses Kapitel definiert den **kanonischen JSON-/TypeScript-Vertrag** zwischen `VehicleOperationalStateService` (Backend) und allen Frontend-Konsumenten. Es ist die normative Grundlage für DTOs, API-Responses, Store-Typen und Runtime-Builder — **ohne** in diesem Schritt produktiven Code zu ändern.

### 16.1 Benennungsregeln (Raw vs. Operational)

| Begriff | Feldname (API) | Semantik | UI sichtbar? |
|---------|----------------|----------|--------------|
| **Operativer Status** | `operationalState.status` | Kanonisch abgeleitet (`VehicleOperationalState`, §3.2) | **Ja** — Tabs, Badges, Map-Tone, KPIs |
| **Operativer Grund** | `operationalState.reason` | Primärer `OperationalReasonCode` (§9.5) | **Ja** — Tooltip, Chips |
| **Rohstatus (DB)** | `rawVehicleStatus.value` | Persistierte Spalte `Vehicle.status` | **Nein** als operativer Status — nur Master-Admin-Diagnose |
| **Legacy V1** | `status` (deprecated) | Spiegelung von `operationalState.status` als V1-String | Übergang; nicht separat ableiten |

**Verbindliche Regeln:**

1. **`rawVehicleStatus` darf niemals** Fleet-Tabs, Map-Marker-Farbe, Dashboard-Slices oder Buchungs-Gates steuern.
2. Frontend-Code **darf nicht** `rawVehicleStatus.value` mit `operationalState.status` vergleichen, um operative Entscheidungen zu treffen — nur zur Diagnose/Warnung.
3. Das Legacy-Feld `status` (`"Available"` / `"Reserved"` / …) existiert nur für ältere Consumer; neue Codepfade lesen **`operationalState.status`**.
4. Feldpräfixe trennen klar: `raw*` = DB-Diagnose, `operational*` = abgeleitete Wahrheit, `bookingContext.*` = strukturierte Buchungsreferenzen.

### 16.2 Kanonischer Snapshot (vollständig)

```typescript
/** Maschinenlesbarer operativer Zustand — §3.2 */
type VehicleOperationalState =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTED'
  | 'MAINTENANCE'
  | 'BLOCKED'
  | 'UNKNOWN';

/** Primärer Ableitungsgrund — §9.5 */
type OperationalReasonCode =
  | 'NO_ACTIVE_OR_UPCOMING_WINDOW'
  | 'ACTIVE_BOOKING'
  | 'PICKUP_WINDOW_ACTIVE'
  | 'MAINTENANCE_ACTIVE'
  | 'HARD_BLOCK_ACTIVE'
  | 'BOOKING_DATA_UNAVAILABLE'
  | 'BOOKING_STATE_INCONSISTENT'
  | 'HANDOVER_STATE_INCONSISTENT'
  | 'RAW_STATUS_INCONSISTENT'
  | 'UNKNOWN_STATUS_VALUE';

/** Datenqualität der Ableitung */
type DataQualityState = 'RELIABLE' | 'DEGRADED' | 'UNAVAILABLE';

/** Woher der operative Grund stammt */
type OperationalStateSource =
  | 'DERIVATION_ENGINE'     // Reguläre Ableitung §15.1
  | 'ADMIN_PERSISTED'       // IN_SERVICE / OUT_OF_SERVICE dominiert
  | 'BOOKING_LIFECYCLE'     // ACTIVE / Fenster / Handover
  | 'RENTAL_HEALTH'         // Hard-Block aus Health/Compliance
  | 'FAIL_CLOSED';          // Query/Konflikt → UNKNOWN

/** Buchungsphase relativ zu evaluationAt */
type BookingPhase =
  | 'future'          // Geplant, außerhalb Pickup-Fenster
  | 'pickup_window'   // Im Reservierungsfenster, Pickup offen
  | 'active_rental'   // ACTIVE + Pickup abgeschlossen
  | 'terminal';       // COMPLETED / CANCELLED / NO_SHOW — nicht in aktiven Refs

interface VehicleOperationalSnapshot {
  vehicleId: string;
  organizationId: string;
  evaluationAt: string;                    // ISO-8601 UTC

  rawVehicleStatus: RawVehicleStatusDiagnostic;
  operationalState: OperationalStateBlock;
  bookingContext: BookingContextBlock;

  /** Abgeleitet — Kompatibilität zu §4/§5 */
  currentOccupancy: CurrentVehicleOccupancy;
  futureOccupancy: FutureVehicleOccupancy;

  rentalReadiness: 'READY' | 'NOT_READY' | 'BLOCKED' | 'UNKNOWN';
  readinessReasonCodes: string[];

  maintenanceBlock: {
    level: 'none' | 'soft' | 'maintenance' | 'hard';
    codes: string[];
  };

  parallelSignals: ParallelSignalsBlock;

  /** Zusätzliche UI-/Log-Codes neben operationalState.reason */
  supplementalReasonCodes: string[];       // op:*, occ:*

  /** Legacy-Kompatibilität — spiegelt operationalState.status */
  legacyStatusLabel: 'Available' | 'Reserved' | 'Active Rented' | 'Maintenance' | 'Blocked' | 'Unknown';
}

interface ParallelSignalsBlock {
  hasActiveOrReservedOccupancy: boolean;
  occupancyKind: 'none' | 'pickup_reservation' | 'active_rental';
  occupancyBookingId: string | null;
  blockLevel: 'none' | 'soft' | 'maintenance' | 'hard';
}
```

### 16.3 Block `operationalState`

```typescript
interface OperationalStateBlock {
  /** Kanonischer Hauptstatus — einzige operative Wahrheit */
  status: VehicleOperationalState;

  /** Primärer Ableitungsgrund (genau einer, §9.5) */
  reason: OperationalReasonCode;

  /** Dominante Signalquelle für reason/status */
  source: OperationalStateSource;

  /**
   * Ab wann der aktuelle status fachlich gilt.
   * Beispiele: Fensterstart (RESERVED), Pickup-Zeitpunkt (ACTIVE_RENTED),
   * Admin-Setzung (MAINTENANCE/BLOCKED). null = nicht bestimmbar.
   */
  effectiveFrom: string | null;

  /**
   * Bis wann der status fachlich gilt (exklusiv), sofern bekannt.
   * Beispiele: geplantes Return-Datum, Fensterende. null = offen/unbekannt.
   */
  effectiveUntil: string | null;

  /** Zeitpunkt der letzten Ableitung (identisch oder ≤ evaluationAt) */
  derivedAt: string;

  /** Aggregierte Qualität der Eingangsdaten */
  dataQualityState: DataQualityState;

  /** Detailgründe bei DEGRADED/UNAVAILABLE (maschinenlesbar) */
  dataQualityReasons: DataQualityReasonCode[];

  /**
   * Kurzflag: true ⇔ dataQualityState === 'RELIABLE'.
   * Convenience für UI-Gates und Mobile — kein Ersatz für dataQualityState.
   */
  isReliable: boolean;
}

type DataQualityReasonCode =
  | 'BOOKING_QUERY_FAILED'
  | 'BOOKING_PARTIAL_RESULT'
  | 'HANDOVER_QUERY_FAILED'
  | 'MULTIPLE_ACTIVE_BOOKINGS'
  | 'ACTIVE_WITHOUT_PICKUP_PROTOCOL'
  | 'RAW_STATUS_LEGACY_RENTED'
  | 'RAW_STATUS_LEGACY_RESERVED'
  | 'UNKNOWN_RAW_STATUS_ENUM'
  | 'TELEMETRY_STALE_FOR_POLICY';   // optional: DEGRADED, blockiert Ableitung nicht
```

#### 16.3.1 Mapping `reason` ↔ `status` (normativ)

| `operationalState.status` | Erlaubte `reason`-Werte |
|---------------------------|-------------------------|
| `AVAILABLE` | `NO_ACTIVE_OR_UPCOMING_WINDOW` |
| `RESERVED` | `PICKUP_WINDOW_ACTIVE` |
| `ACTIVE_RENTED` | `ACTIVE_BOOKING` |
| `MAINTENANCE` | `MAINTENANCE_ACTIVE` |
| `BLOCKED` | `HARD_BLOCK_ACTIVE` |
| `UNKNOWN` | `BOOKING_DATA_UNAVAILABLE`, `BOOKING_STATE_INCONSISTENT`, `HANDOVER_STATE_INCONSISTENT`, `RAW_STATUS_INCONSISTENT`, `UNKNOWN_STATUS_VALUE` |

#### 16.3.2 `effectiveFrom` / `effectiveUntil` pro Status

| `status` | `effectiveFrom` | `effectiveUntil` |
|----------|-----------------|------------------|
| `AVAILABLE` | `null` oder letztes Return/Cancel-Event | `null` oder Start nächstes Fenster |
| `RESERVED` | `reservationWindowStart` | Pickup abgeschlossen **oder** `booking.endDate` |
| `ACTIVE_RENTED` | Pickup-Protokoll-Zeitstempel (Fallback: `booking.startDate`) | Return abgeschlossen **oder** `booking.endDate` |
| `MAINTENANCE` | Zeitpunkt `IN_SERVICE`-Setzung (falls bekannt) | `null` bis Aufhebung |
| `BLOCKED` | Zeitpunkt Sperre (falls bekannt) | `null` bis Aufhebung |
| `UNKNOWN` | `null` | `null` |

### 16.4 Block `bookingContext`

```typescript
interface BookingContextBlock {
  /** ACTIVE-Buchung mit abgeschlossenem Pickup — höchstens eine */
  activeBooking: BookingReference | null;

  /** Buchung im aktiven Pickup-Reservierungsfenster — höchstens eine */
  reservedBooking: BookingReference | null;

  /**
   * Nächste zukünftige blockierende Buchung außerhalb aktueller Fenster/ACTIVE.
   * Gesetzt auch wenn operationalState.status = AVAILABLE (§5.3).
   */
  nextBooking: BookingReference | null;

  /** Anzahl weiterer zukünftiger blockierender Buchungen nach nextBooking */
  futureBookingCount: number;
}
```

**Invarianten:**

| Regel | Beschreibung |
|-------|--------------|
| BC-1 | `activeBooking` und `reservedBooking` sind **nie gleichzeitig** gesetzt |
| BC-2 | `activeBooking` gesetzt ⇒ `phase = 'active_rental'`, `status = ACTIVE` |
| BC-3 | `reservedBooking` gesetzt ⇒ `phase = 'pickup_window'`, `status ∈ {PENDING, CONFIRMED}` |
| BC-4 | `nextBooking` hat immer `phase = 'future'` |
| BC-5 | `futureBookingCount` zählt nur `PENDING`/`CONFIRMED`/`ACTIVE`-Overlap-Bookings mit `startDate > evaluationAt` bzw. außerhalb aktuellem Fenster, **ohne** `nextBooking` |
| BC-6 | Bei `dataQualityState = UNAVAILABLE` sind alle Refs `null`, `futureBookingCount = 0` |

### 16.5 `BookingReference` (pro Buchungsreferenz)

```typescript
interface BookingReference {
  id: string;                          // Booking UUID
  bookingNumber: string;               // Anzeigeref, z. B. BK-000142
  status: BookingStatus;               // Prisma-Enum: PENDING | CONFIRMED | ACTIVE | …
  pickupAt: string;                    // ISO — booking.startDate (geplanter Pickup)
  returnAt: string;                    // ISO — booking.endDate (geplantes Return)
  customerLabel?: string | null;       // Optional — Anzeigename Kunde/Firma
  vehicleId: string;                   // Redundant — Tenant-Integritätsprüfung
  phase: BookingPhase;                 // future | pickup_window | active_rental
}
```

**Feldsemantik:**

| Feld | Quelle | Hinweis |
|------|--------|---------|
| `bookingNumber` | `Booking.bookingRef` oder generierte Anzeigenummer | Pflicht in API; UI-Links zur Buchung |
| `pickupAt` | `Booking.startDate` | **Nicht** Pickup-Protokoll-Zeitstempel |
| `returnAt` | `Booking.endDate` | Geplantes Ende; Überfälligkeit über separates Flag in `currentOccupancy` |
| `customerLabel` | Kunde/Firma aus Booking-Relation | Optional — DSGVO: nur Operator-sichtbar |
| `phase` | Ableitung aus Fenster + Handover + `evaluationAt` | Steuert keinen `operationalState` allein |

### 16.6 `rawVehicleStatus` (nur diagnostisch)

```typescript
interface RawVehicleStatusDiagnostic {
  /** Exakter DB-Wert der Spalte vehicles.status */
  value: 'AVAILABLE' | 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'RENTED' | 'RESERVED' | string;

  /** ISO — letzte Änderung am DB-Feld (updatedAt oder Status-Audit) */
  persistedAt: string | null;

  /**
   * true, wenn value ∉ {AVAILABLE, IN_SERVICE, OUT_OF_SERVICE}
   * oder value widerspricht abgeleitetem operationalState.
   */
  isLegacyOrInconsistent: boolean;

  /** Maschinenlesbare Diagnose — erscheint in dataQualityReasons, nicht als operativer Reason */
  diagnosticCodes: Array<
    | 'LEGACY_RENTED_PERSISTED'
    | 'LEGACY_RESERVED_PERSISTED'
    | 'CONFLICTS_WITH_ACTIVE_BOOKING'
    | 'CONFLICTS_WITH_OPERATIONAL_STATE'
    | 'UNKNOWN_ENUM_VALUE'
  >;
}
```

**UI-Platzierung:** Nur in Master-Admin / Vehicle-Detail-Debug-Panel („Persistierter Rohstatus“). Fleet-Tabs, Map-Legende und Dashboard-KPIs **ignorieren** dieses Objekt.

**Ableitungsregel bei Inkonsistenz:** Widerspruch zwischen `rawVehicleStatus` und belastbarer Buchungslage ⇒ `operationalState.status = UNKNOWN`, `reason = RAW_STATUS_INCONSISTENT`, `dataQualityState = DEGRADED` (wenn Buchungen lesbar) oder `UNAVAILABLE`.

### 16.7 Data Quality (verbindlich)

| `dataQualityState` | `isReliable` | Bedeutung | Operative Ableitung |
|--------------------|--------------|-----------|---------------------|
| `RELIABLE` | `true` | Alle Pflichtqueries erfolgreich, keine unaufgelösten Konflikte | Normal §15.1 |
| `DEGRADED` | `false` | Teilweise Inputs fehlen oder Legacy-Rohstatus widerspricht; Kern-Buchungslage lesbar | Ableitung möglich; `dataQualityReasons` gesetzt; UI-Warnhinweis |
| `UNAVAILABLE` | `false` | Booking-/Handover-Query fehlgeschlagen oder nicht auflösbarer Konflikt | **Pflicht:** `status = UNKNOWN`, `reason = BOOKING_DATA_UNAVAILABLE` oder passender UNKNOWN-Reason |

**Fail-Closed:** `UNAVAILABLE` ⇒ niemals `AVAILABLE` als operativer Status.

### 16.8 API-Endpunkte und Transport

| Endpunkt | Response-Typ | Snapshot-Form |
|----------|--------------|---------------|
| `GET /organizations/:orgId/fleet-map` | `FleetMapVehicleDtoV2[]` | `FleetMapProjection` (§16.9.2) |
| `GET /organizations/:orgId/vehicles` | `FleetVehicleDtoV2[]` | `FleetListProjection` (§16.9.1) |
| `GET /organizations/:orgId/vehicles/:id` | `FleetVehicleDetailDtoV2` | Vollständiger Snapshot (§16.9.3) |
| Dashboard (intern) | `VehicleRuntimeInput` | `DashboardRuntimeProjection` (§16.9.4) |

**Cache:** Fleet-Map-TTL (5 s) darf `derivedAt` veralten lassen; `evaluationAt` muss bei Cache-Miss aktuell sein. Consumer zeigen `derivedAt` in Debug, nicht in Operator-UI.

**Legacy-Kompatibilität:** Responses enthalten parallel:

```typescript
{
  operationalState: OperationalStateBlock;
  bookingContext: BookingContextBlock;
  status: string;  // deprecated — === legacyStatusLabel
  // … flache V1-Felder reservedBookingId etc. als deprecated aliases
}
```

Flache V1-Felder (`reservedBookingId`, `activeBookingId`, …) werden aus `bookingContext` **projiziert**, nicht separat abgeleitet.

### 16.9 Consumer-Projektionen (Pflichtfelder)

#### 16.9.1 Fleet-Liste (`FleetListProjection`)

| Feldgruppe | Pflichtfelder |
|------------|---------------|
| Identität | `vehicleId`, `licensePlate`, `displayName`, `make`, `model`, `year`, `imageUrl` |
| Operativ | `operationalState.status`, `operationalState.reason`, `operationalState.isReliable`, `operationalState.dataQualityState` |
| Buchung | `bookingContext.activeBooking`, `bookingContext.reservedBooking`, `bookingContext.nextBooking`, `bookingContext.futureBookingCount` |
| Station | `stationId`, `stationName` |
| Readiness | `rentalReadiness` (Kurzform) |
| Telemetrie (Zellen) | `odometerKm`, `fuelPercent`, `evSoc`, `isElectric` (nullable) |
| Parallel | `parallelSignals.hasActiveOrReservedOccupancy`, `parallelSignals.blockLevel` |
| Legacy | `legacyStatusLabel` / deprecated `status` |

**Nicht benötigt:** volle `rawVehicleStatus`-Historie, `supplementalReasonCodes` (optional).

#### 16.9.2 Fleet Map (`FleetMapProjection`)

Alles aus §16.9.1, plus:

| Feldgruppe | Pflichtfelder |
|------------|---------------|
| Geo | `latitude`, `longitude`, `heading`, `lastSeenAt` |
| Telemetrie-Frische | `signalAgeMs`, `isFresh`, `onlineStatus`, `telemetryFreshness`, `displayState`, `displayIgnition`, `isLiveTracking` |
| Map-Darstellung | `operationalState.status` → `mapOperationalTone` (Client oder Server); **nicht** aus `rawVehicleStatus` |
| Station-Geo | `homeStationId`, `currentStationId`, `expectedStationId` |
| Buchung (Tooltip) | `bookingContext.*` vollständig wie Liste |
| Überfälligkeit | aus `currentOccupancy.pickupOverdue` / `returnOverdue` |

#### 16.9.3 Vehicle Detail (`FleetVehicleDetailDtoV2`)

| Feldgruppe | Pflichtfelder |
|------------|---------------|
| Vollständig | Gesamter `VehicleOperationalSnapshot` §16.2 |
| Diagnose | `rawVehicleStatus` (Admin-Bereich) |
| Readiness | `rentalReadiness`, `readinessReasonCodes`, `maintenanceBlock` |
| Belegung | `currentOccupancy`, `futureOccupancy` |
| Meta | `evaluationAt`, `operationalState.derivedAt`, `operationalState.effectiveFrom/Until` |

#### 16.9.4 Dashboard Runtime State (`DashboardRuntimeProjection`)

Input für `vehicleRuntimeStateBuilder` — **keine zweite operative Ableitung**:

| Feldgruppe | Pflichtfelder |
|------------|---------------|
| Operativ | `operationalState` (vollständiger Block) |
| Buchung | `bookingContext.activeBooking`, `bookingContext.reservedBooking`, `bookingContext.nextBooking` |
| Readiness | `rentalReadiness`, `readinessReasonCodes` |
| Block | `maintenanceBlock`, `parallelSignals` |
| Identität | `vehicleId`, `licensePlate`, `displayName`, `stationId` |

**Explizit nicht als operative Quelle:** Legacy `status`, `rawVehicleStatus`, `healthStatus` allein.

#### 16.9.5 Mobile (Pflicht-Erhalt)

Mobile Fleet-/Map-Ansichten **dürfen folgende Informationen nicht verlieren** (auch bei reduziertem Layout):

| Information | Quelle | Mindest-Darstellung |
|-------------|--------|---------------------|
| Operativer Hauptstatus | `operationalState.status` | Badge / Tab-Zuordnung |
| Unzuverlässige Daten | `operationalState.isReliable`, `dataQualityState` | Warn-Icon bei `!isReliable` |
| Primärgrund | `operationalState.reason` | Tooltip oder Detail-Zeile |
| Aktive Vermietung | `bookingContext.activeBooking` | Kunde + Return-Zeit |
| Pickup heute / Fenster | `bookingContext.reservedBooking` | Pickup-Zeit + Überfälligkeit |
| Nächste Buchung | `bookingContext.nextBooking` | Datum + `futureBookingCount` |
| Parallele Vermietung bei Wartung | `parallelSignals` + Zusatz-Chip | „Aktive Vermietung“ bei `MAINTENANCE`/`BLOCKED` |
| Readiness | `rentalReadiness` | Icon bei `NOT_READY`/`BLOCKED` |
| Geo-Position | `latitude`, `longitude` | Map-Marker |
| Telemetrie-Frische | `telemetryFreshness` / `onlineStatus` | Frische-Indikator |

### 16.10 Mapping V1-flache Felder → V2 (Übergang)

| V1-Feld (Ist) | V2-Quelle |
|---------------|-----------|
| `status` | `legacyStatusLabel` ← `operationalState.status` |
| `reservedBookingId` | `bookingContext.reservedBooking?.id` |
| `reservedCustomerName` | `bookingContext.reservedBooking?.customerLabel` |
| `reservedPickupAt` | `bookingContext.reservedBooking?.pickupAt` |
| `reservedReturnAt` | `bookingContext.reservedBooking?.returnAt` |
| `activeBookingId` | `bookingContext.activeBooking?.id` |
| `activeCustomerName` | `bookingContext.activeBooking?.customerLabel` |
| `activeStartAt` | `bookingContext.activeBooking?.pickupAt` |
| `activeReturnAt` | `bookingContext.activeBooking?.returnAt` |
| `maintenanceReasonCode` | `maintenanceBlock.codes[0]` |

V1-Mapper im Frontend **lesen V2-Blöcke** und projizieren in flache Felder — nicht umgekehrt.

### 16.11 Akzeptanzkriterien Datenvertrag

| ID | Kriterium |
|----|-----------|
| DC-1 | Jede API-Response mit operativem Fahrzeugstatus enthält `operationalState` gemäß §16.3 |
| DC-2 | Jede API-Response enthält `bookingContext` gemäß §16.4 |
| DC-3 | `rawVehicleStatus` ist in Fleet-Liste und Fleet-Map **abwesend**; nur in Vehicle-Detail / Master-Admin |
| DC-4 | `operationalState.reason` ist immer gesetzt und ∈ §9.5 |
| DC-5 | `isReliable === (dataQualityState === 'RELIABLE')` — immer konsistent |
| DC-6 | `BOOKING_DATA_UNAVAILABLE` ⇔ `dataQualityState = UNAVAILABLE` |
| DC-7 | `bookingContext.activeBooking.phase` ist immer `active_rental` wenn nicht null |
| DC-8 | `bookingContext.reservedBooking.phase` ist immer `pickup_window` wenn nicht null |
| DC-9 | `bookingContext.nextBooking.phase` ist immer `future` wenn nicht null |
| DC-10 | Fleet-Liste, Fleet-Map, Detail liefern identische `operationalState`-Blöcke (modulo Cache-TTL) |
| DC-11 | Mobile-Client kann §16.9.5 vollständig aus `FleetMapProjection` bedienen |
| DC-12 | Kein Consumer verwendet `rawVehicleStatus.value` für Tab-Filter oder KPI-Count |
| DC-13 | Legacy `status`-String weicht nicht von `operationalState.status` ab |
| DC-14 | TypeScript-Typen in Backend-DTO und `FleetMapVehicleResponse` sind strukturell identisch zu §16.2/§16.9 |

### 16.12 Beispiel-Payload (KS FH 660E, 15.7.2026)

```json
{
  "vehicleId": "68868291-5478-42cd-b0c4-cc77b2a78e21",
  "organizationId": "faa710c9-6d91-4079-a7d5-91fdccdec14a",
  "evaluationAt": "2026-07-15T12:00:00.000Z",
  "rawVehicleStatus": {
    "value": "AVAILABLE",
    "persistedAt": "2026-07-01T08:00:00.000Z",
    "isLegacyOrInconsistent": false,
    "diagnosticCodes": []
  },
  "operationalState": {
    "status": "AVAILABLE",
    "reason": "NO_ACTIVE_OR_UPCOMING_WINDOW",
    "source": "BOOKING_LIFECYCLE",
    "effectiveFrom": null,
    "effectiveUntil": "2026-08-01T00:00:00.000+02:00",
    "derivedAt": "2026-07-15T12:00:00.000Z",
    "dataQualityState": "RELIABLE",
    "dataQualityReasons": [],
    "isReliable": true
  },
  "bookingContext": {
    "activeBooking": null,
    "reservedBooking": null,
    "nextBooking": {
      "id": "…",
      "bookingNumber": "BK-000142",
      "status": "CONFIRMED",
      "pickupAt": "2026-08-01T10:00:00.000+02:00",
      "returnAt": "2026-08-06T18:00:00.000+02:00",
      "customerLabel": "Muster GmbH",
      "vehicleId": "68868291-5478-42cd-b0c4-cc77b2a78e21",
      "phase": "future"
    },
    "futureBookingCount": 0
  },
  "legacyStatusLabel": "Available",
  "supplementalReasonCodes": ["occ:future:next"]
}
```

---

## 17. Domänen-Verantwortlichkeit und Schreibgrenzen (implementiert Prompt 19/43)

Operative Fahrzeugzustände dürfen **nur** über definierte Domänenpfade geschrieben werden. Alle legitimen Rohstatus-Änderungen laufen zentral durch `VehicleRawStatusWriteService` — keine parallele zweite Engine, keine direkten `prisma.vehicle.update({ data: { status } })` in Feature-Modulen.

### 17.1 Domänen-Zuordnung (verbindlich)

| Domäne | Verantwortung | Persistierte Rohstatus-Werte | Kanonischer operativer Zustand |
|--------|---------------|------------------------------|--------------------------------|
| **Booking / Handover** | Pickup erfolgreich (`Booking → ACTIVE`), Return abgeschlossen, Cancel/No-Show-Freigabe | Pickup: **`RENTED`** (Kompatibilitätshinweis), Return/Cancel/No-Show: **`AVAILABLE`** (wenn nicht IN_SERVICE/OUT_OF_SERVICE) | **`ACTIVE_RENTED`** wird **ausschließlich** aus ACTIVE-Buchung + Pickup-Protokoll abgeleitet — nicht aus Roh-`RENTED` allein |
| **Vehicle Operational State Engine** | Einzige kanonische Ableitung von `AVAILABLE`, `RESERVED`, `ACTIVE_RENTED`, `UNKNOWN` | **Schreibt nicht** | Read-Model für Fleet/UI |
| **Maintenance / Service** | `IN_SERVICE`, `OUT_OF_SERVICE` (admin + Workflow) | `IN_SERVICE`, `OUT_OF_SERVICE` | `MAINTENANCE`, `BLOCKED` |
| **Blocking / Readiness** | Hard Blocks, Rental Readiness | Kein direkter `Vehicle.status`-Write | Readiness/Block-Level separat |
| **Manuelle Vehicle-Verwaltung** | Grundzustände freigeben/sperren | Nur `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` | Nie `RESERVED` / `ACTIVE_RENTED` direkt |

### 17.2 `VehicleRawStatusWriteService` — Methoden

| Methode | Domäne | Erlaubte Werte |
|---------|--------|----------------|
| `applyHandoverPickup` | `BOOKING_HANDOVER` | `RENTED` (+ Station) |
| `applyHandoverReturn` | `BOOKING_HANDOVER` | `AVAILABLE` (bedingt) |
| `applyBookingLifecycleRelease` | `BOOKING_LIFECYCLE` | `AVAILABLE` (bedingt) |
| `applyAdminOperationalStatus` | `ADMIN_MANUAL` | `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` |
| `applyWorkflowMaintenanceStatus` | `WORKFLOW_MAINTENANCE` | `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` |

Jede Statusänderung erzeugt einen **ActivityLog**-Eintrag (`AuditService`) mit `domain`, `previousStatus`, `nextStatus`.

### 17.3 RESERVED — nur abgeleitet

- **`RESERVED` wird in keinem Domänenpfad persistiert.**
- Bestehende DB-Zeilen mit `RESERVED` sind **diagnostisch** (`rawVehicleStatus.isLegacyOrInconsistent`).
- Kanonisches `RESERVED` entsteht ausschließlich im Pickup-Reservierungsfenster via Operational State Engine.

### 17.4 RENTED — Kompatibilität vs. Kanon

**Ist (Übergang):** Pickup-Handover schreibt weiterhin Roh-`RENTED` als Legacy-Kompatibilitätshinweis für Leser, die noch die DB-Spalte prüfen.

**Kanon:** `operationalState.status = ACTIVE_RENTED` folgt **immer** aus `Booking.status = ACTIVE` + Pickup-Protokoll. Roh-`RENTED` ohne passende Buchung → `UNKNOWN` (Ghost-Guard, §15.6 V5).

**Ziel (später):** Roh-`RENTED` vollständig aus Schreibpfaden entfernen, sobald alle Consumer nur noch `operationalState` lesen (§2.3).

### 17.5 Verbotene Schreibpfade

| Pfad | Status |
|------|--------|
| Generischer Vehicle-PATCH `status` | Blockiert (Prompt 18) |
| Admin-PATCH `RESERVED` / `RENTED` | Blockiert |
| Workflow `vehicle.status.update` → `RENTED`/`RESERVED` | Blockiert |
| `VehiclesService.update({ status })` | Blockiert — nur Write-Service |
| Beliebige Feature-Module | Verboten — nur Write-Service |

---

## Änderungshistorie

| Version | Datum | Änderung |
|---------|-------|----------|
| 2.0 | 2026-07-15 | Erstfassung Spezifikation (Prompt 3/43) |
| 2.1 | 2026-07-15 | §15 Prioritäts- und Übergangsmatrix; §3.5 Prio-Reihenfolge MAINTENANCE vor BLOCKED (Prompt 4/43) |
| 2.2 | 2026-07-15 | §16 Backend-/Frontend-Datenvertrag; §9.5 OperationalReasonCode; AC-9–AC-16, DC-1–DC-14 (Prompt 5/43) |
| 2.3 | 2026-07-15 | §17 Domänen-Verantwortlichkeit + `VehicleRawStatusWriteService` (Prompt 19/43) |
| 2.4 | 2026-07-15 | §16 API-Transport: `operationalState`-Serializer in Fleet-Read-Models (Prompt 20/43) |

---

*Spezifikation §1–§16 normativ; §17 Schreibgrenzen (Prompt 19); Fleet-API liefert `operationalState` via `vehicle-operational-state.serializer.ts` (Prompt 20).*
