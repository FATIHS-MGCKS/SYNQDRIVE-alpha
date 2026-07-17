# Vehicle Station Positioning V2 — Verbindlicher Architekturvertrag

**Version:** 1.0  
**Date:** 2026-07-18  
**Status:** **Normativ** für Prompts 32–78 (Vehicle-Station-Positionierung)  
**Prompt:** 32/78 — Stations V2 Ausführungsvertrag  
**Geltungsbereich:** `Vehicle` ↔ `Station` — die drei getrennten Positionierungsbeziehungen `homeStationId`, `currentStationId`, `expectedStationId`

**Basis:**

- [`stations-v2-execution-contract.md`](./stations-v2-execution-contract.md) (Ausführungsvertrag — §5 Schutzregeln)
- [`stations-v2.md`](./stations-v2.md) (Stations-Architektur — Schichten 5–7)
- [`stations-v2-domain-glossary.md`](./stations-v2-domain-glossary.md) (Domänen-Glossar)
- [`stations-v2-prisma-migration-rollout-plan.md`](./stations-v2-prisma-migration-rollout-plan.md) (additive Schema-Ziele)

**Prinzip:** **Home**, **Current** und **Expected** sind drei unabhängige Wahrheitsebenen. Kein Writer darf still eine andere Ebene mitändern. Jede Schreiboperation ist ein expliziter Domain Command mit dokumentierter Semantik und Audit-Pflicht.

**Normativität:** Dieses Dokument übersteuert Legacy-Code und implizite Annahmen (z. B. gekoppeltes Setzen von Home + Current), sofern Audits Widersprüche belegen.

---

## Inhaltsverzeichnis

| # | Abschnitt |
|---|-----------|
| 0 | Zweck und Geltungsbereich |
| 1 | Drei-Ebenen-Modell |
| 2 | Felddefinitionen (verbindlich) |
| 3 | Writer-Katalog |
| 4 | Verbotene Nebenwirkungen |
| 5 | Provenance und Quellen |
| 6 | Lesepfad vs. Schreibpfad |
| 7 | Ist-Widersprüche (Audit-basiert) |
| 8 | Abnahmekriterien |
| 9 | Referenzen |

---

## 0. Zweck und Geltungsbereich

SynqDrive modelliert die Position eines Fahrzeugs relativ zu Stationen **nicht** als ein einziges „Standort“-Feld, sondern als **drei getrennte Beziehungen** mit unterschiedlicher fachlicher Bedeutung:

| Ebene | Persistenz | Kurzfrage |
|-------|------------|-----------|
| **Home** | `Vehicle.homeStationId` | Wo gehört das Fahrzeug organisatorisch hin? |
| **Current** | `Vehicle.currentStationId` (+ Source/At) | Wo ist es **bestätigt** physisch? |
| **Expected** | `Vehicle.expectedStationId` (+ Source/Transfer) | Wo wird es **als Nächstes erwartet**? |

**Geltung:**

- Multi-tenant: alle Commands sind `organizationId`-scoped.
- Keine hardcodierten `organizationId`, `stationId`, `vehicleId`.
- Schreibpfad nur über **Domain Commands** — kein generisches `vehicle.update` für diese Felder außerhalb des Stations-Schreibpfads.
- Lesepfad über **Operational Read Model** / kanonische DTOs — keine Frontend-Ableitung als Systemwahrheit.

**Nicht Gegenstand:**

- Implementierung der Commands in diesem Prompt (reine Spezifikation).
- Automatische Geofence-gesteuerte Current-Updates in Produktion (bis expliziter Rollout-Prompt, vgl. [`stations-v2.md` §15](./stations-v2.md)).
- Vollständiges Transfer-Aggregat (`TransferPlan` / `TransferEvent`) — Phase 2; V2 Phase 1 nutzt `expectedStationId` als einfaches Erwartungsfeld.

---

## 1. Drei-Ebenen-Modell

```mermaid
flowchart LR
  subgraph home["Schicht 5 — Home Fleet"]
    H[homeStationId]
  end

  subgraph current["Schicht 6 — Physical Presence"]
    C[currentStationId]
    CS[currentStationSource]
    CA[currentStationConfirmedAt]
  end

  subgraph expected["Schicht 7 — Expected Position"]
    E[expectedStationId]
    ES[expectedStationSource]
    ET[Transfer / Booking context]
  end

  H -.->|"darf ≠ sein"| C
  C -.->|"darf ≠ sein"| E
  H -.->|"darf ≠ sein"| E

  CMD_HOME[Home Assignment Command] --> H
  CMD_CURRENT[Manual Current Correction\nPickup / Return Completion] --> C
  CMD_CURRENT --> CS
  CMD_CURRENT --> CA
  CMD_EXPECTED[Transfer Lifecycle\nOne-Way / Planned Return] --> E
  CMD_EXPECTED --> ES
  CMD_EXPECTED --> ET
  CMD_GEOFENCE[Geofence Confirmation\n(späterer Rollout)] -.->|"nur mit Flag"| C
```

| ID | Regel | Bedeutung |
|----|-------|-----------|
| **P1** | Home ≠ Current ≠ Expected | Jede Ebene kann einen anderen Stationswert haben oder `null` sein. |
| **P2** | Ein Command — eine Ebene | Pro Request höchstens **ein** Positionierungstyp (Home, Current oder Expected). |
| **P3** | Current = bestätigte Wahrheit | Current ist nie reine Schätzung, nie Geofence-SHADOW, nie Home-Default. |
| **P4** | Expected = Planung | Expected ist Soll-Zustand; wird nicht durch bloße Home-Änderung gesetzt oder gelöscht. |
| **P5** | Tenant-Isolation | Station und Vehicle müssen derselben `organizationId` angehören. |

---

## 2. Felddefinitionen (verbindlich)

### 2.1 `homeStationId` — Organisatorische Zuständigkeit

| Aspekt | Verbindliche Definition |
|--------|-------------------------|
| **Fachlich** | Organisatorische **Heimat- und Zuständigkeitszuordnung** des Fahrzeugs innerhalb der Flotte. |
| **Bedeutet** | Planungsanker, KPI-Heimatflotte, Standard-Pickup-Default bei Buchungen, Stations-Shortage-Detector, Dispo-„Zuständigkeit“. |
| **Bedeutet nicht** | Physischer Aufenthaltsort; bestätigte Anwesenheit; geplanter Transfer-Zielort. |
| **Persistenz** | `Vehicle.homeStationId` → `Station.id` (`VehicleHomeStation`, `onDelete: SetNull`) |
| **Nullable** | Ja — Fahrzeug ohne Heimatstation ist zulässig (`unassignedVehicles`). |
| **Zielstation** | Muss `ACTIVE` sein; `ARCHIVED` ist für Home-Zuweisung **verboten**. |
| **UI DE / EN** | **Heimatstation** / **Home station** |

**Leseregel:** `vehicleCountHome` / Heimatflotte-KPIs zählen **ausschließlich** `homeStationId = :stationId` — nicht Current, nicht Expected.

---

### 2.2 `currentStationId` — Bestätigter physischer Standort

| Aspekt | Verbindliche Definition |
|--------|-------------------------|
| **Fachlich** | **Bestätigter physischer Aufenthaltsort** — wo das Fahrzeug nachweislich ist, nicht vermutet. |
| **Bedeutet** | Operative Realität für Kapazität (physische Präsenz), Fleet-Sicht „aktuell vor Ort“, Handover-Nachweis. |
| **Bedeutet nicht** | Organisatorische Heimat; geplanter Zielort; Geofence-Hinweis (HOME/AWAY-Badge); GPS-Schätzung ohne Bestätigung. |
| **Persistenz** | `Vehicle.currentStationId` → `Station.id` (`VehicleCurrentStation`) |
| **Provenance (Ziel-V2)** | Jeder Write **muss** `currentStationSource` und `currentStationConfirmedAt` setzen (R4). |
| **Nullable** | Ja — „physischer Standort unbekannt / nicht bestätigt“ ist ein gültiger Zustand. |
| **UI DE / EN** | **Aktueller Standort** / **Current location** |

**Leseregel:** `vehicleCountPresent` / Kapazitäts-Policy zählen `currentStationId = :stationId` (mit dokumentierten Ausnahmen, z. B. vermietete Heimatfahrzeuge in Capacity Policy).

**Abgrenzung Geofence:** Geofence-SHADOW (`HOME` / `AWAY` / `UNKNOWN`) ist **Anzeige-Evidence**, kein Current-Write — bis expliziter Produktions-Rollout (vgl. §3.6).

---

### 2.3 `expectedStationId` — Erwartetes Ziel

| Aspekt | Verbindliche Definition |
|--------|-------------------------|
| **Fachlich** | **Erwarteter zukünftiger Standort** aus Transfer-, One-Way-Buchungs- oder geplanter Rückgabe-Logistik. |
| **Bedeutet** | Soll-Position vor physischer Ankunft; Planung für Transfers, erwartete Ankunft, Kapazitätsprojektion. |
| **Bedeutet nicht** | Bestätigter Ist-Standort; Buchungs-`returnStationId` allein (Buchungsfeld ≠ Fahrzeugfeld); Heimatstation. |
| **Persistenz** | `Vehicle.expectedStationId` → `Station.id` (`VehicleExpectedStation`) |
| **Provenance (Ziel-V2)** | Jeder Write **muss** `expectedStationSource` und Kontext tragen (Transfer-ID, Booking-ID, Reason-Code). |
| **Nullable** | Ja — kein erwartetes Ziel ist der Normalzustand ohne laufenden Transfer/Plan. |
| **UI DE / EN** | **Erwartete Station** / **Expected station** |

**Typische Auslöser (nicht abschließend):**

| Kontext | Setzt Expected auf |
|---------|-------------------|
| **Transfer Lifecycle** | Zielstation des Transfers |
| **One-Way-Rental** | `returnStationId` der Buchung (nach Bestätigung/Policy) |
| **Geplante Rückgabe** | Return-Station aus aktiver Buchung, wenn Business-Regel es verlangt |

**Leseregel:** „Erwartete Ankunft“ = `expectedStationId = :stationId` **und** `currentStationId IS DISTINCT FROM :stationId`.

---

## 3. Writer-Katalog

Jeder Writer ist ein **Domain Command** (oder ein klar benannter Application-Service-Einstieg), der **genau eine** Positionierungsebene verändert. Indirekte Writer (z. B. Handover) delegieren an die kanonischen Commands.

### 3.1 Home Assignment Command

| Command | Ebene | Wirkung | Erlaubte Felder |
|---------|-------|---------|-----------------|
| `AssignHomeStation` | Home | Setzt organisatorische Heimat | nur `homeStationId` |
| `DetachHomeStation` | Home | Entfernt Heimat-Zuordnung | nur `homeStationId → null` |
| `BulkSetHomeFleet` | Home | Server-validierte Gesamtheimatflotte einer Station | nur `homeStationId` pro Fahrzeug |

**Auslöser:** Stations-UI Flottenzuweisung, Admin-Stammdaten, DIMO-Registrierung nur mit explizitem `homeOnly`-Flag.

**Invarianten:**

- Ändert **nicht** `currentStationId`.
- Ändert **nicht** `expectedStationId`.
- Zielstation muss tenant-scoped und `ACTIVE` sein.

---

### 3.2 Manual Current Location Correction

| Command | Ebene | Wirkung | Provenance |
|---------|-------|---------|------------|
| `ConfirmPhysicalPresence` | Current | Setzt bestätigten Standort | `currentStationSource = MANUAL_CONFIRMATION` (oder `ADMIN_ASSIGNMENT`) |
| `ClearPhysicalPresence` | Current | Entfernt bestätigten Standort | `currentStationId → null` + Audit-Grund |

**Auslöser:** Operator korrigiert Standort manuell; Admin-Zuweisung „current only“; API `PATCH …/vehicles/current-station` (Ziel: Command-Wrapper).

**Invarianten:**

- Ändert **nicht** `homeStationId`.
- Ändert **nicht** `expectedStationId` (außer separater `ClearExpectedPosition` / `CompleteTransfer`).
- **R4:** Kein Write ohne `currentStationSource` + `currentStationConfirmedAt`.

---

### 3.3 Pickup Completion

| Command-Kette | Ebene | Wirkung | Provenance |
|---------------|-------|---------|------------|
| Handover Pickup abgeschlossen → `ConfirmPhysicalPresence` | Current | Fahrzeug am Abholort bestätigt | `currentStationSource = HANDOVER_PICKUP` |

**Auslöser:** `BookingsHandoverService` nach erfolgreichem Pickup-Handover mit `actualPickupStationId`.

**Invarianten:**

- Setzt Booking `actualPickupStationId` — **getrennt** vom Fahrzeug-Current-Command, aber konsistent.
- Ändert **nicht** `homeStationId`.
- Setzt `expectedStationId` **nur**, wenn ein separater Transfer-/One-Way-Command dies explizit anordnet (nicht implizit beim Pickup).

---

### 3.4 Return Completion

| Command-Kette | Ebene | Wirkung | Provenance |
|---------------|-------|---------|------------|
| Handover Return abgeschlossen → `ConfirmPhysicalPresence` | Current | Fahrzeug am Rückgabeort bestätigt | `currentStationSource = HANDOVER_RETURN` |

**Auslöser:** `BookingsHandoverService` nach erfolgreichem Return-Handover mit `actualReturnStationId`.

**Invarianten:**

- Ändert **nicht** `homeStationId`.
- Darf `ClearExpectedPosition` auslösen, wenn Expected auf dieselbe Station zeigte und Transfer/Buchung abgeschlossen ist — **nur** via expliziten `CompleteTransfer` / `ClearExpectedPosition`, nicht als blindes Nebenprodukt.

---

### 3.5 Transfer Lifecycle

| Command | Ebene | Wirkung | Kontextpflicht |
|---------|-------|---------|----------------|
| `SetExpectedPosition` | Expected | Setzt erwartetes Ziel | `expectedStationSource` + Transfer- oder Booking-Referenz |
| `ClearExpectedPosition` | Expected | Entfernt Erwartung | expliziter `reason` (z. B. `TRANSFER_COMPLETED`, `BOOKING_CANCELLED`, `MANUAL_OVERRIDE`) |
| `CompleteTransfer` | Expected → Current | Ankunft bestätigen | `ConfirmPhysicalPresence` + `ClearExpectedPosition` in einer Tx |

**Auslöser:** Transfer-Workflow, One-Way-Buchungsbestätigung, geplante Rückgabe-Logistik, Stations-UI „Transfer planen“ (Ziel).

**Invarianten:**

- `SetExpectedPosition` ändert **nicht** `currentStationId` allein — Ankunft erfordert `ConfirmPhysicalPresence`.
- `CompleteTransfer` ist die **einzige** kombinierte Operation Expected→Current und muss als solche im Audit erscheinen (nicht versteckte Doppelwrites).
- Expected-Writes ohne Source oder ohne Transfer-/Booking-Kontext sind **verboten**.

**Ziel Phase 2 (optional):** `VehicleStationTransfer`-Aggregate mit Status `PLANNED | IN_TRANSIT | COMPLETED | CANCELLED` — `expectedStationId` bleibt Projektion.

---

### 3.6 Spätere Geofence Confirmation

| Command | Ebene | Status | Bedingung |
|---------|-------|--------|-----------|
| `ConfirmPhysicalPresenceFromGeofence` (Arbeitsname) | Current | **Zukünftig** — nicht in Phase 1 | Nur nach dediziertem Rollout-Prompt + Feature-Flag |

| Aspekt | Regel |
|--------|-------|
| SHADOW-Modus | Geofence liefert `GeofenceShadowDto` (`HOME` / `AWAY` / `UNKNOWN`) — **kein** Current-Write |
| Produktions-Rollout | `currentStationSource = GEOFENCE_CONFIRMED` (Ziel-Enum) nur mit Operator-Bestätigung oder explizitem Auto-Policy-Flag |
| Verboten bis Rollout | Hintergrund-Job / Webhook, der `currentStationId` aus GPS setzt (R9, Invariante S3) |

**Referenz:** [`stations-v2.md` §15](./stations-v2.md), Geofence Capability Status (`CONFIGURED_ONLY` / `SHADOW_VALIDATION` / `PRODUCTION_ACTIVE`).

---

### 3.7 Writer-Übersicht (Matrix)

| Writer | `homeStationId` | `currentStationId` | `expectedStationId` |
|--------|-----------------|--------------------|-----------------------|
| Home Assignment Command | **Write** | — | — |
| Manual Current Location Correction | — | **Write** | — |
| Pickup Completion | — | **Write** | — |
| Return Completion | — | **Write** | — (Clear nur via expliziten Expected-Command) |
| Transfer Lifecycle | — | — (Current nur via `CompleteTransfer`) | **Write** |
| Geofence Confirmation (später) | — | **Write** (mit Flag) | — |

**Legende:** **Write** = darf dieses Feld setzen/ändern; **—** = darf dieses Feld **nicht** als Nebenwirkung ändern.

---

## 4. Verbotene Nebenwirkungen

Die folgenden Regeln sind **nicht verhandelbar** (vgl. Ausführungsvertrag §5.1, Invariante S1).

### 4.1 Verbindliche Verbote (Normativ)

| ID | Verbot | Gilt für |
|----|--------|----------|
| **V1** | **Home-Änderung setzt nicht Current.** | `AssignHomeStation`, `DetachHomeStation`, `BulkSetHomeFleet` |
| **V2** | **Home-Entfernung löscht nicht Current.** | `DetachHomeStation`, `BulkSetHomeFleet` (Detach-Teil) |
| **V3** | **Home-Änderung löscht nicht blind Expected.** | Alle Home-Commands (R5) |
| **V4** | **Current-Änderung ändert nicht Home.** | `ConfirmPhysicalPresence`, `ClearPhysicalPresence`, Handover, Geofence (später) |
| **V5** | **Expected benötigt Source bzw. Transferkontext.** | `SetExpectedPosition` — ohne `expectedStationSource` + Referenz/Reason verboten |

### 4.2 Erweiterte Verbote (aus Architekturvertrag)

| ID | Verbot | Referenz |
|----|--------|----------|
| **V6** | Kein Current-Write ohne `currentStationSource` + `currentStationConfirmedAt` | R4 |
| **V7** | Kein Expected-Clear ohne expliziten `reason` | R5 |
| **V8** | Kein Geofence-Auto-Write auf Current ohne Rollout-Flag | R9, S3 |
| **V9** | Kein SET aus partieller UI-Liste für Home-Flotte | S2 |
| **V10** | Expected nicht als Ersatz für Current ohne `ConfirmPhysicalPresence` | P3 |

### 4.3 Verbots-Matrix (Command × Feld)

| Command ↓ / Feld → | `homeStationId` | `currentStationId` | `expectedStationId` |
|--------------------|-----------------|--------------------|-----------------------|
| Home Assignment | ✅ erlaubt | ❌ **verboten** (V1) | ❌ **verboten** (V3) |
| Detach Home | ✅ → null | ❌ **verboten** (V2) | ❌ **verboten** (V3) |
| Confirm/Clear Current | ❌ **verboten** (V4) | ✅ erlaubt | ❌ **verboten** |
| Set/Clear Expected | ❌ **verboten** | ❌ **verboten** | ✅ erlaubt (V5) |
| CompleteTransfer | ❌ **verboten** | ✅ via Confirm | ✅ via Clear |
| Pickup/Return Handover | ❌ **verboten** | ✅ erlaubt | ❌ **verboten** (ohne separaten Expected-Command) |

### 4.4 Zulässige Kombinationen im Fahrzeug-Zustand

Ein Fahrzeug **darf** gleichzeitig folgende Zustände haben (Beispiele):

| homeStationId | currentStationId | expectedStationId | Szenario |
|---------------|------------------|-------------------|----------|
| A | A | `null` | Zu Hause, physisch bestätigt da |
| A | B | `null` | Ausgeliehen / vor Ort an anderer Station |
| A | B | C | Transfer von B nach C geplant |
| A | `null` | C | Standort unbekannt, Ankunft in C erwartet |
| `null` | B | `null` | Ohne Heimat, physisch in B bestätigt |

**Nicht zulässig als Schreib-Nebenwirkung:** Jede Zeile, die durch einen einzelnen Command **mehr als eine Spalte** ohne explizite Multi-Command-Tx (`CompleteTransfer`) verändert.

---

## 5. Provenance und Quellen

### 5.1 `currentStationSource` (Ziel-Enum)

| Wert | Writer |
|------|--------|
| `HANDOVER_PICKUP` | Pickup Completion |
| `HANDOVER_RETURN` | Return Completion |
| `MANUAL_CONFIRMATION` | Manual Current Location Correction |
| `ADMIN_ASSIGNMENT` | Admin current-only |
| `GEOFENCE_CONFIRMED` | Geofence Confirmation (**später**, mit Rollout) |
| `GEOFENCE_SHADOW` | **Nur Evidence** — schreibt **nicht** Current bis Rollout |
| `SYSTEM_MIGRATION` | Einmalige Backfill-Migration |

### 5.2 `expectedStationSource` (Ziel-Enum)

| Wert | Writer |
|------|--------|
| `TRANSFER_PLANNED` | Transfer Lifecycle — `SetExpectedPosition` |
| `ONE_WAY_BOOKING` | One-Way-Buchung bestätigt |
| `PLANNED_RETURN` | Geplante Rückgabe aus aktiver Buchung |
| `MANUAL_PLANNING` | Operator setzt Erwartung manuell |
| `SYSTEM_MIGRATION` | Einmalige Backfill-Migration |

**Pflicht:** Jeder `SetExpectedPosition`-Aufruf liefert mindestens `source` **und** einen von: `transferId`, `bookingId`, `reasonCode` (V5).

---

## 6. Lesepfad vs. Schreibpfad

| Aspekt | Schreibpfad | Lesepfad |
|--------|-------------|----------|
| **API** | Domain Commands (`AssignHomeStation`, …) | `StationFleetVehicleDto`, `StationOperationsDto`, KPI-Read-Model |
| **UI** | Sendet Commands — leitet keine eigene Positionierungswahrheit ab | Zeigt Server-DTOs (R11) |
| **Geofence-Badge** | Kein Writer (CONFIG_ONLY / SHADOW) | `GeofenceShadowDto` optional — **nicht** Current |
| **Kapazität** | — | `currentStationId` (physische Präsenz) |
| **Heimatflotte-KPI** | — | `homeStationId` |

**Verboten im Lesepfad:**

- `homeStationId` als Proxy für „aktuell vor Ort“.
- Geofence-SHADOW als bestätigter Current.
- Frontend-Neuberechnung von Home/Current/Expected-Kombinationen, die vom Server abweicht.

---

## 7. Ist-Widersprüche (Audit-basiert)

| ID | Ist (Legacy) | Soll (V2) | Prompt-Ziel |
|----|--------------|-----------|-------------|
| W-P1 | `assignVehicle(target: home)` setzt home **und** current | Nur `homeStationId` (V1) | Entkopplungs-Prompt |
| W-P2 | `setStationVehicles` Detach setzt `homeStationId` + `currentStationId` null | Detach Home nur home; Current separat (V2) | Fleet-SET-Refactor |
| W-P3 | `setStationVehicles` lässt `expectedStationId` bei Detach | Expliziter `ClearExpectedPosition` mit Reason | Expected-Cleanup-Prompt |
| W-P4 | `currentStationId` ohne source/at | R4 Provenance | Prisma-Migration |
| W-P5 | `expectedStationId` ohne source | V5 Transferkontext | Prisma-Migration |
| W-P6 | Geofence nur Frontend (`HomeAwayBadge`) | SHADOW im Read Model; kein Current-Write | Geofence Capability + späterer Rollout |

**Referenz:** [`../audits/stations-v2-implementation-inventory.md`](../audits/stations-v2-implementation-inventory.md), [`../audits/stations-production-reality.md`](../audits/stations-production-reality.md).

---

## 8. Abnahmekriterien

| ID | Kriterium |
|----|-----------|
| AC-P1 | Jeder dokumentierte Writer ändert nur die erlaubten Felder (§3.7). |
| AC-P2 | V1–V5 sind in Code-Tests als Command-Invarianten abgedeckt. |
| AC-P3 | Kein produktiver Pfad setzt Current aus Geofence ohne Rollout-Flag. |
| AC-P4 | Handover delegiert an `ConfirmPhysicalPresence` — kein direktes `vehicle.update` für Current. |
| AC-P5 | `SetExpectedPosition` lehnt Requests ohne Source/Kontext ab. |
| AC-P6 | Read-Model-DTOs exponieren Home, Current, Expected getrennt mit Labels. |
| AC-P7 | Audit-Trail protokolliert Command-Typ, Felder, Source, Actor, Timestamp. |

---

## 9. Referenzen

| Dokument | Inhalt |
|----------|--------|
| [`stations-v2.md`](./stations-v2.md) | Schichten 5–7, Commands, R3–R5, R9 |
| [`stations-v2-domain-glossary.md`](./stations-v2-domain-glossary.md) | UI-Begriffe DE/EN, KPI-Regeln |
| [`stations-v2-execution-contract.md`](./stations-v2-execution-contract.md) | Ausführungsregeln Prompts 2–78 |
| [`stations-v2-prisma-migration-rollout-plan.md`](./stations-v2-prisma-migration-rollout-plan.md) | Additive Schema-Felder source/at |
| [`stations-v2-permissions.md`](./stations-v2-permissions.md) | Scope über home/current/expected |

**Änderungshistorie:**

| Version | Datum | Prompt | Änderung |
|---------|-------|--------|----------|
| 1.0 | 2026-07-18 | 32/78 | Erstversion — Vehicle Station Positioning V2 |
