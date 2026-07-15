# Task Domain V2 — Verbindliche Fach- und Technikspezifikation

**Version:** 2.0 (Spezifikation)  
**Date:** 2026-07-15  
**Status:** Normativ für zukünftige Implementierung — **keine produktive Umsetzung in diesem Dokument**  
**Basis:** `docs/audits/task-management-inventory.md` (Ist-Inventur 2026-07-15), bestehendes `OrgTask` / `TaskEvent` / `ServiceCase`  
**Prinzip:** Eine Task-Engine (`TasksService` + `OrgTask`). Keine parallele Task-Architektur.

---

## Inhaltsverzeichnis

| # | Abschnitt | Inhalt |
|---|-----------|--------|
| 0 | Zweck und Geltungsbereich | Multi-Tenant, Schreibpfad, Lesepfade |
| **1** | **Domänenobjekte** | |
| 1.1 | Task | Zuweisbare menschliche Aktion |
| 1.2 | Workflow-Schritt | Prozessschritt ohne Pflicht-Inbox |
| 1.3 | Alert / Insight | Automatisch erkannter Zustand |
| 1.4 | ServiceCase | Mehrstufiger Wartungs-/Reparaturfall |
| **A** | Task-Hauptstatus | `OPEN` … `CANCELLED` |
| **B** | Abschlussarten | `MANUAL`, `AUTO_RESOLVED`, `SUPERSEDED` |
| **C** | Statusübergänge | Matrix, Terminal, Idempotenz |
| **D** | Zeitsemantik | `createdAt` … `cancelledAt`, `activatesAt` |
| **E** | Checklisten | Pflicht/optional, Blocker, Override |
| **F** | Abschlussnachweise | Policy pro `TaskType` |
| **G** | Verknüpfte Objekte | Fahrzeug, Buchung, … Vendor |
| **H** | Dedup | Technisch, fachlich, Wiederkehr, Zeitfenster |
| **I** | Operator-Buckets | Jetzt erforderlich … Erledigt |
| **J** | Automationsregeln | `ruleId`, Eskalation, Overrides |
| **K** | Audit-Trail | `TaskEvent`-Pflicht |
| 8 | Rückwärtskompatibilität | Bestehende `OrgTask`-Rows |
| 9 | Ist-Widersprüche | Audit-basiert, priorisiert |
| 10 | Ziel-Architektur | Eine Engine (Diagramm) |
| 11 | Akzeptanzkriterien | AC-01 … AC-21 |
| 12 | Referenzen | Code und Dokumente |

---

## 0. Zweck und Geltungsbereich

Dieses Dokument definiert die **Ziel-Domäne** für operative Aufgaben in SynqDrive. Es trennt fachliche Konzepte (Task vs. Workflow-Schritt vs. Alert), legt Status-, Zeit- und Dedup-Semantik fest und beschreibt Operator-Buckets sowie Automationsregeln.

**Geltung:**

- Multi-tenant: alle Operationen sind `organizationId`-scoped.
- Persistenz-Basis bleibt `OrgTask` (ggf. additive Felder/Enums per Migration).
- Schreibpfad bleibt zentral: `TasksService` — keine direkten `prisma.orgTask`-Mutationen außerhalb (Ist-Widerspruch siehe §12).
- Lesepfade: `TasksController` und aggregierende Domain-Services (Booking-Detail, ServiceCase-Detail).

---

## 1. Domänenobjekte

### 1.1 Task

**Definition:** Eine **konkrete, einer Person oder Rolle zuweisbare menschliche Aktion** mit nachvollziehbarer Ursache, betroffenem Objekt, Zeitsemantik, nächstem Schritt, definierter Abschlussbedingung und vollständigem Audit-Trail.

**Technische Abbildung:** `OrgTask` (+ Kindtabellen `TaskChecklistItem`, `TaskComment`, `TaskAttachment`, `TaskEvent`).

| Fachliches Attribut | Pflicht | Persistenz (Ziel) | Ist-Zustand |
|---------------------|---------|-------------------|-------------|
| Ursache (`cause`) | Ja | `source`, `sourceType`, `metadata.ruleId` | `source`/`sourceType` vorhanden; `ruleId` fehlt |
| Betroffenes Objekt | Mindestens eins bei System-Tasks | Link-Spalten (s. §7) | Vorhanden |
| Aktivierungszeitpunkt | Ja | `activatesAt` | **Fehlt** — implizit `createdAt` |
| Fälligkeit | Optional | `dueDate` | Vorhanden |
| Nächster Schritt | Ja (ableitbar) | `metadata.nextStep` oder API-Derivat | Teilweise über Titel/Checkliste |
| Abschlussdefinition | Ja | `TaskType` + Completion-Policy (§6) | Teilweise `RESOLUTION_REQUIRED_TYPES` |
| Zuweisung | Optional | `assignedUserId` | Vorhanden |
| Audit-Trail | Ja | `TaskEvent[]` | Vorhanden, aber lückenhaft bei Auto-Close (§12) |
| Priorität | Ja | `priority` | Vorhanden |
| Idempotenz | Bei System-Tasks | `dedupKey` | Vorhanden |
| Abschlussart | Bei Terminalstatus | `resolutionKind` (§B) | **Fehlt** — nur `status` |

**Task ist NICHT:**

- ein Dashboard-Insight (`DashboardInsight`),
- ein reiner Workflow-Schritt ohne globale Sichtbarkeit (§1.2),
- ein ServiceCase-Container (§1.4),
- eine Notification.

**Nächster Schritt (ableitbar):** API-Feld `metadata.nextStep` oder UI-Derivat aus `TaskType` + offener Checkliste + Link-Kontext (z. B. „Pickup durchführen“, „Rechnung prüfen“). Ist: primär Titel und Template-Checkliste.

**Sichtbarkeit:** Tasks erscheinen in globalen Task-Listen (`TasksView`, Operator Tasks), entity-scoped Listen (`forVehicle`, `forBooking`, …) und aggregierten KPIs (`GET /tasks/summary`).

**Invariante T1:** Ein Task ist immer genau ein `OrgTask`-Datensatz. Es gibt keinen zweiten Task-Typ, keine Shadow-Inbox und keine parallele State Machine außerhalb `TasksService`.

---

### 1.2 Workflow-Schritt

**Definition:** Ein **regulärer, prozessgebundener Schritt** innerhalb von Buchungs-, Pickup-, Return- oder Dokumentenabläufen, der **nicht zwingend** als globaler Task in der Aufgaben-Inbox erscheinen muss.

**Beispiele:** „Kunde identifizieren“ im Pickup-Handover, „Mietvertrag unterschreiben“, „Bundle-Slot BOOKING_INVOICE befüllen“.

**Technische Abbildung (Ziel):**

- Primär: **Prozesszustand** in Booking / Handover / Document-Bundle (bereits vorhanden).
- Optional: **Checklisten-Vorlage** (`task-templates.ts`) als UX-Hilfe innerhalb des Prozess-Screens.
- **Kein eigener Datensatztyp** in V2 — Workflow-Schritte sind kein zweites `OrgTask`-Modell.

**Materialisierung als Task (explizite Regel):**

Ein Workflow-Schritt wird **nur dann** als `OrgTask` materialisiert, wenn mindestens eine Bedingung erfüllt ist:

| # | Bedingung |
|---|-----------|
| W1 | Schritt ist **überfällig** oder blockiert den nächsten Prozessübergang |
| W2 | Schritt erfordert **Zuweisung** an eine bestimmte Rolle/Station außerhalb des Prozess-Screens |
| W3 | Schritt muss in der **globalen Operator-Inbox** sichtbar sein (Mobile Operator, Dashboard) |
| W4 | Org-Override (`automationRules[].materializeAsTask = true`) |

Andernfalls bleibt der Schritt **prozessintern** (Booking-Detail, Handover-Flow, Bundle-Status).

> **⚠ Ist-Widerspruch:** Heute materialisiert `TaskAutomationService.ensureBookingLifecycleTasks` bei `CONFIRMED`/`ACTIVE`/`COMPLETED` **immer** sechs Task-Typen (`BOOKING_PREPARATION`, `VEHICLE_CLEANING`, `DOCUMENT_REVIEW`, `BOOKING_PICKUP`, `BOOKING_RETURN`, `INVOICE_REQUIRED`) als globale `OrgTask`-Zeilen — unabhängig von W1–W4. V2 fordert eine **Umklassifizierung**: reine Prozessschritte → Workflow-Schritt; nur blockierende/überfällige/unzugewiesene → Task.

**Abbildung Workflow-Schritt ↔ bestehende TaskTypes (Übergang):**

| TaskType (heute) | V2-Empfehlung |
|------------------|---------------|
| `BOOKING_PREPARATION` | Workflow-Schritt; Task nur bei W1–W4 |
| `BOOKING_PICKUP` | Workflow-Schritt im Handover; Task bei Überfälligkeit/Unzugewiesen |
| `BOOKING_RETURN` | Workflow-Schritt im Return-Handover; Task bei W1–W4 |
| `DOCUMENT_REVIEW` (bundle) | Task wenn Dokument fehlt **und** blockiert (W1) |
| `VEHICLE_CLEANING` (booking) | Task wenn `blocksVehicleAvailability` oder Pickup < 24h |
| `INVOICE_REQUIRED` | Task wenn Rechnung offen **und** kein Prozess-Screen den Schritt abdeckt |

---

### 1.3 Alert / Insight

**Definition:** Ein **automatisch erkannter operativer Zustand** (Zustand, Risiko, Fälligkeit, Anomalie). Ein Alert **ist nicht** dasselbe Datensatzmodell wie ein Task.

**Technische Abbildung:**

| Konzept | Modell / Service |
|---------|------------------|
| Insight-Kandidat | `InsightCandidate` (Detector-Pipeline) |
| Persistierter Alert | `DashboardInsight` (`dedupeKey`, `isActive`, `severity`, …) |
| Notification | `OrgNotification` (separater Kanal) |

**Beziehung zu Task:**

```
Alert/Insight ──(optional materialize)──► OrgTask
                      │
                      └── alertId auf OrgTask verknüpft
```

| Modus | Verhalten |
|-------|-----------|
| **Hinweis only** | Alert in Dashboard/Notifications; **kein** Task (`suggestionOnly: true` in Metadata) |
| **Materialisiert** | `InsightTaskBridgeService` / manuelles `materializeComplianceTask` → `upsertByDedup` |
| **Aufgelöst** | Insight `isActive=false` → Task `AUTO_RESOLVED` oder `SUPERSEDED` (§B) |

**Regel A1:** `DashboardInsight.id` ≠ `OrgTask.id`. Verknüpfung nur über `OrgTask.alertId` und gemeinsamen `dedupKey`.

**Regel A2:** Severity-Wahrheit liegt beim Detector/Insight — Task-Priority wird **abgeleitet**, nicht unabhängig neu erfunden (`insight-task.mapper.ts`).

> **⚠ Ist-Widerspruch:** Workflow-Executor `execAlertCreate` erzeugt einen `OrgTask` mit `source=WORKFLOW_ALERT` — fachlich ein Task, kein `DashboardInsight`. V2: Workflow-Alerts entweder als Insight persistieren **oder** als `CUSTOM`-Task ohne Alert-Id kennzeichnen (`metadata.workflowAlert=true`).

---

### 1.4 ServiceCase

**Definition:** Ein **mehrstufiger Wartungs-, Diagnose- oder Reparaturfall**, der mehrere ausführbare Arbeitsschritte bündelt.

**Technische Abbildung:** `ServiceCase` (Prisma) mit optional verknüpften `OrgTask` über `OrgTask.serviceCaseId`.

| Ebene | Rolle |
|-------|-------|
| `ServiceCase` | Container: Fahrzeug, Werkstatt, Zeitraum, Gesamtstatus, Kosten, `blocksRental` |
| `OrgTask` | Einzelner ausführbarer Schritt (z. B. `REPAIR`, `BRAKE_CHECK`, `TIRE_CHECK`) |

**Regeln SC1–SC4:**

- SC1: Ein Task **kann** ohne ServiceCase existieren (Legacy, Booking, Invoice).
- SC2: Ein ServiceCase **kann** ohne Tasks existieren (frisch geöffnet).
- SC3: ServiceCase-Status und Task-Status sind **unabhängig** — Case `COMPLETED` erzwingt nicht automatisch Task-Abschluss (Implementierung muss explizit schließen).
- SC4: `blocksRental` auf Case-Ebene und `blocksVehicleAvailability` auf Task-Ebene müssen konsistent dokumentiert werden; Case hat Vorrang in Fleet-Gates.

> **⚠ Ist-Widerspruch:** Service-Center-UI ist task-basiert; `api.serviceCases` ist implementiert aber in der Task-UI ungenutzt. V2 verlangt Case als **Gruppierungs- und Statuscontainer**, Tasks als **Ausführungseinheit**.

---

## A. Task-Hauptstatus

Kanoniche Werte (identisch mit Prisma `TaskStatus`):

| Status | Bedeutung | Aktiv? |
|--------|-----------|--------|
| `OPEN` | Bereit zur Bearbeitung; nicht gestartet | Ja |
| `IN_PROGRESS` | Wird aktiv bearbeitet | Ja |
| `WAITING` | Pausiert; wartet auf Externes (Teile, Kunde, Dokument, Freigabe) | Ja |
| `DONE` | Erfolgreich abgeschlossen | Nein (terminal) |
| `CANCELLED` | Bewusst verworfen / nicht mehr relevant | Nein (terminal) |

**Aktive Statusmenge:** `{ OPEN, IN_PROGRESS, WAITING }` — entspricht `ACTIVE_TASK_STATUSES` in `tasks.service.ts`.

**Abgeleitete Anzeige (nicht persistiert):**

- `OVERDUE` — computed: `dueDate < now ∧ status ∈ ACTIVE` (bereits als `isOverdue` in API).
- `OVERDUE` ist **kein** sechster Hauptstatus.

---

## B. Abschlussarten (`resolutionKind`)

Neues normatives Konzept — bei Terminalstatus `DONE` oder `CANCELLED` **zusätzlich** zur Statusspalte zu persistieren (Ziel: Spalte `resolutionKind` oder verpflichtend in `TaskEvent.metadata`).

| Wert | Bedeutung | Typischer Auslöser |
|------|-----------|-------------------|
| `MANUAL` | Mensch hat abgeschlossen oder storniert | `completeTask`, `cancelTask` |
| `AUTO_RESOLVED` | Auslösende Bedingung ist weg | Rechnung bezahlt, Insight inaktiv, Dokument erzeugt, Fahrzeug als clean markiert |
| `SUPERSEDED` | Durch Prozessfortschritt ersetzt | Booking-Phase gewechselt, neuer Task mit gleichem fachlichen Scope |

**Mapping Ist → Ziel:**

| Ist-Pfad | Ziel-`resolutionKind` |
|----------|----------------------|
| `completeTask` / `cancelTask` | `MANUAL` |
| `closeStaleInsightTasks` | `AUTO_RESOLVED` |
| `closeStaleBookingLifecycleTasks` | `SUPERSEDED` |
| `closeLinkedTasks` (Invoice) | `AUTO_RESOLVED` |
| `completeOpenCleaningTasks` | `AUTO_RESOLVED` (mit Resolution-Note) |

**Regel B1:** `CANCELLED` ist **nur** mit `resolutionKind=MANUAL` erlaubt (kein automatisches Cancel in V2).

**Regel B2:** `SUPERSEDED` setzt `status=DONE`, nicht `CANCELLED`.

> **⚠ Ist-Widerspruch:** Heute gibt es kein `resolutionKind`; alle Auto-Closes setzen `status=DONE` ohne Unterscheidung. Audit-Trail unvollständig.

---

## C. Statusübergänge

### C.1 Übergangsmatrix (normativ)

Zeilen = Von, Spalten = Nach. `✓` = erlaubt, `—` = verboten.

| Von \ Nach | OPEN | IN_PROGRESS | WAITING | DONE | CANCELLED |
|------------|------|-------------|---------|------|-----------|
| **OPEN** | ✓ (idempotent) | ✓ `start` | ✓ `waiting` | ✓ `complete`* | ✓ `cancel` |
| **IN_PROGRESS** | — | ✓ (idempotent) | ✓ `waiting` | ✓ `complete`* | ✓ `cancel` |
| **WAITING** | — | ✓ `start` | ✓ (idempotent) | ✓ `complete`* | ✓ `cancel` |
| **DONE** | — | — | — | ✓ (idempotent) | — |
| **CANCELLED** | — | — | — | — | ✓ (idempotent) |

\* `complete` unterliegt Completion-Policy (§F).

**Terminalstatus:** `DONE`, `CANCELLED` — keine ausgehenden Übergänge (kein Reopen in V2).

### C.1b Verbotene Übergänge (explizit)

| Von | Nach | Grund |
|-----|------|-------|
| `IN_PROGRESS` | `OPEN` | Kein „Zurückstellen“ ohne explizites Reopen-Feature (nicht in V2) |
| `WAITING` | `OPEN` | Wartend ist aktiv; Fortsetzung nur über `IN_PROGRESS` (`start`) |
| `DONE` | `OPEN`, `IN_PROGRESS`, `WAITING`, `CANCELLED` | Terminal |
| `CANCELLED` | `OPEN`, `IN_PROGRESS`, `WAITING`, `DONE` | Terminal |
| Beliebig aktiv | `DONE` / `CANCELLED` | Nur wenn Completion-Policy (§F) bzw. Cancel-Policy erfüllt; `activatesAt > now` blockiert `complete` (CB4) |
| `CANCELLED` (automatisch) | — | **Verboten in V2** — System schließt nur mit `DONE` + `AUTO_RESOLVED` oder `SUPERSEDED` (Regel B1) |

### C.2 API-Operationen → Übergang

| Operation | Übergang | `resolutionKind` |
|-----------|----------|------------------|
| `POST` create / `upsertByDedup` (neu) | → `OPEN` | — |
| `PATCH .../start` | → `IN_PROGRESS` | — |
| `PATCH .../waiting` | → `WAITING` | — |
| `PATCH .../complete` | → `DONE` | `MANUAL` |
| `PATCH .../cancel` | → `CANCELLED` | `MANUAL` |
| System auto-resolve | → `DONE` | `AUTO_RESOLVED` |
| System supersede | → `DONE` | `SUPERSEDED` |

### C.3 Idempotente Requests

| Szenario | Verhalten |
|----------|-----------|
| `start` bei bereits `IN_PROGRESS` | HTTP 200; kein zweites `startedAt`; **kein** zweites `TaskEvent` (Ist: `changeStatus` bricht bei `from === to` ab — korrekt) |
| `waiting` bei bereits `WAITING` | HTTP 200; kein Event |
| `cancel` bei bereits `CANCELLED` | HTTP 200; kein Event |
| `complete` bei bereits `DONE` | HTTP 200; keine Änderung; kein Event |
| `upsertByDedup` bei aktivem Key | Update Felder (Eskalation); Status unverändert |
| `upsertByDedup` bei geschlossenem Key | Neuer Task; alter Key → `{dedupKey}:closed:{taskId}` |
| Wiederholter Auto-Resolve | Kein Effekt wenn bereits `DONE` |

> **⚠ Ist-Widerspruch:** `changeStatus` bricht bei `from === to` ab (idempotent). Auto-Close-Pfade umgehen `changeStatus` teilweise.

### C.4 Automatische Übergänge (System)

| Trigger | Von | Nach | Art |
|---------|-----|------|-----|
| Insight nicht mehr aktiv | ACTIVE | DONE | `AUTO_RESOLVED` |
| Booking-Phase wechselt | ACTIVE (alte Phase) | DONE | `SUPERSEDED` |
| Invoice vollständig bezahlt | ACTIVE | DONE | `AUTO_RESOLVED` |
| Dokument erzeugt / Bundle complete | ACTIVE | DONE | `AUTO_RESOLVED` |
| Booking `CANCELLED` / `NO_SHOW` | ACTIVE (lifecycle, `source=BOOKING`) | DONE | **`SUPERSEDED`** (V2-Norm: Buchung beendet, Schritte obsolet — kein `CANCELLED` durch System) |
| Fahrzeug `cleaningStatus=CLEAN` | ACTIVE (`VEHICLE_CLEANING`) | DONE | `AUTO_RESOLVED` |

---

## D. Zeitsemantik

| Feld | Semantik | Pflicht | Ist |
|------|----------|---------|-----|
| `createdAt` | Technischer Erstellzeitpunkt des Datensatzes | Ja (DB) | ✓ |
| `activatesAt` | Zeitpunkt, ab dem der Task **sichtbar und bearbeitbar** ist | Ja (Ziel) | ✓ — `NOT NULL` + Backfill (`20260715181000`); CB4 enforced in `TasksService` |
| `dueDate` | Frist für fachliche Überfälligkeit | Optional | ✓ |
| `startedAt` | Erster Übergang nach `IN_PROGRESS` | Gesetzt bei `start` | ✓ |
| `completedAt` | Zeitpunkt `DONE` | Gesetzt bei Terminal `DONE` | ✓ |
| `cancelledAt` | Zeitpunkt `CANCELLED` | Gesetzt bei `CANCELLED` | ✓ |

**Regeln D1–D4:**

- D1: `activatesAt > createdAt` erlaubt (geplante Tasks) — bis dahin Status bleibt `OPEN`, Task erscheint nicht in Bucket „Jetzt erforderlich“.
- D2: `isOverdue := dueDate < now ∧ status ∈ ACTIVE ∧ activatesAt ≤ now`.
- D3: `startedAt` wird nur einmal gesetzt (erster Start).
- D4: `completedAt` / `cancelledAt` sind mutually exclusive.

**Backfill:** Bestehende Rows: `activatesAt := createdAt`.

---

## E. Checklisten

Modell: `TaskChecklistItem` mit `title`, `description`, `sortOrder`, `isDone`, `completedAt`, `completedByUserId`.

### E.1 Punkt-Klassen (Ziel-Metadata pro Item)

| Klasse | `metadata.required` | Verhalten |
|--------|---------------------|-----------|
| **Erforderlich** | `true` | Blockiert `complete` wenn offen (wenn Policy es verlangt) |
| **Optional** | `false` | Kein Blocker |

**Ist:** Alle Template-Items sind fachlich required; Unterscheidung **nicht** persistiert. V2: Default `required=true` für Template-Items; optionale Items explizit markieren.

### E.2 Fortschritt

```
progress = doneRequired / totalRequired
```

- Anzeige in UI (`checklistProgress`) und API-Feld `checklistProgress` (Ziel, optional).
- Optionale Items zählen nicht in den Blocker.

### E.3 Abschlussblocker

| Blocker | Bedingung |
|---------|-----------|
| CB1 | Offene **erforderliche** Checklistenpunkte bei `TaskType` mit `requiresChecklistCompletion=true` |
| CB2 | Fehlende `resolutionNote` (§F) |
| CB3 | Fehlender `resolutionCode` (§F) |
| CB4 | Task `activatesAt > now` → `complete` verboten |

### E.4 Manager-Override

Rolle mit Permission `tasks.override_completion` darf:

- `complete` trotz offener Pflicht-Checkliste,
- `complete` ohne `resolutionNote` / `resolutionCode`,

mit verpflichtendem `TaskEvent`:

```json
{
  "type": "COMPLETION_OVERRIDDEN",
  "metadata": {
    "reason": "string",
    "overriddenBlockers": ["CHECKLIST", "RESOLUTION_NOTE"]
  }
}
```

> **⚠ Ist-Widerspruch:** Manager-Override existiert nicht; `ServiceOverviewPanel` umgeht Resolution-Gate nur clientseitig.

---

## F. Abschlussnachweise

### F.1 Policy-Matrix nach `TaskType`

| TaskType | resolutionNote | resolutionCode | Checklist complete | Auto-resolve erlaubt |
|----------|----------------|----------------|--------------------|----------------------|
| `REPAIR` | Pflicht | Empfohlen | Pflicht wenn Items | Nein |
| `BRAKE_CHECK` | Pflicht | Pflicht (`BRAKE_*` Enum) | Pflicht | Nein |
| `TIRE_CHECK` | Pflicht | Pflicht (`TIRE_*`) | Pflicht | Nein |
| `BATTERY_CHECK` | Pflicht | Pflicht (`BATTERY_*`) | Pflicht | Nein |
| `VEHICLE_SERVICE` | Pflicht | Empfohlen | Pflicht | Nein |
| `VEHICLE_INSPECTION` | Pflicht | Empfohlen (`TUV_PASS`, `TUV_FAIL`, …) | Pflicht | Nein |
| `VEHICLE_CLEANING` | Pflicht bei MANUAL | Nein | Empfohlen | **Ja** (`cleaningStatus=CLEAN`) |
| `BOOKING_PREPARATION` | Optional | Nein | Optional | **Ja** (SUPERSEDED bei Phase) |
| `BOOKING_PICKUP` | Optional | Nein | Optional | **Ja** (Handover abgeschlossen) |
| `BOOKING_RETURN` | Optional | Nein | Optional | **Ja** (Return abgeschlossen) |
| `DOCUMENT_REVIEW` | Optional | Nein | Nein | **Ja** (Dokument vorhanden) |
| `INVOICE_REQUIRED` | Optional | Nein | Nein | **Ja** (Invoice PAID) |
| `CUSTOMER_FOLLOWUP` | Optional | Nein | Nein | **Ja** (Fine settled — Ziel; Ist: kein Auto-Close) |
| `CUSTOM` | Optional | Nein | Nein | Nur wenn `metadata.allowAutoResolve=true` (System/Workflow); sonst Nein |

**`resolutionCode` (Ziel-Enum, Auszug):**

`BRAKE_MEASURED_OK`, `BRAKE_PARTS_REPLACED`, `TIRE_REPLACED`, `TIRE_ROTATED`, `BATTERY_REPLACED`, `TUV_SCHEDULED`, `TUV_PASSED`, `INVOICE_PAID`, `DOCUMENT_UPLOADED`, `OTHER`

**Ist:** Nur `resolutionNote` für `RESOLUTION_REQUIRED_TYPES`; kein `resolutionCode`.

### F.2 Auto-resolve vs. Manual

- **AUTO_RESOLVED** darf Completion-Policy **überschreiben** (kein menschlicher Nachweis), muss aber `TaskEvent` mit `metadata.autoResolveRuleId` schreiben.
- **MANUAL** muss Policy vollständig erfüllen (oder Manager-Override).

---

## G. Verknüpfte Objekte

Alle Links sind **optional**, org-scoped, in `TasksService.assertLinksBelongToOrg` validiert.

| Link | Semantik | Kardinalität Task | Pflicht bei |
|------|----------|-------------------|-------------|
| `vehicleId` | Betroffenes Fahrzeug | 0..1 | Vehicle-/Health-Tasks |
| `bookingId` | Zugehörige Buchung | 0..1 | Booking-Lifecycle-Tasks |
| `customerId` | Betroffener Kunde | 0..1 | Follow-up, Fine, WhatsApp |
| `invoiceId` | Offene/zu prüfende Rechnung | 0..1 | `INVOICE_REQUIRED` (System) |
| `documentId` | Fehlendes/zu prüfendes Dokument | 0..1 | `DOCUMENT_REVIEW` |
| `alertId` | Ursprünglicher Dashboard-Insight | 0..1 | Insight-materialisierte Tasks |
| `serviceCaseId` | Übergeordneter Werkstattfall | 0..1 | Workshop-Tasks (empfohlen) |
| `fineId` | Bußgeld | 0..1 | Fine-Tasks |
| `vendorId` | Werkstatt/Partner | 0..1 | `REPAIR`, Vendor-Tasks |

**Konsistenzregeln G1–G5:**

- G1: `bookingId` gesetzt → `vehicleId` und `customerId` müssen zur gleichen Buchung passen.
- G2: `invoiceId` gesetzt → `bookingId` optional; wenn beides, müssen sie konsistent sein.
- G3: `alertId` gesetzt → `dedupKey` sollte mit `DashboardInsight.dedupeKey` übereinstimmen.
- G4: `serviceCaseId` gesetzt → `vehicleId` muss mit Case-Fahrzeug übereinstimmen.
- G5: Maximal **ein primäres** Business-Objekt pro Task bestimmt den Dedup-Namespace (§H).

---

## H. Dedup

### H.1 Technische Idempotenz

- **Scope:** `(organizationId, dedupKey)` unique.
- **Mechanismus:** `TasksService.upsertByDedup`.
- **Aktiver Task:** `status ∈ ACTIVE` mit gleichem Key → Update/Eskalation.
- **Geschlossener Task:** Key wird zu `{dedupKey}:closed:{taskId}` parking; neuer Task erhält Original-Key.

### H.2 Fachliche / semantische Deduplizierung

Ziel: **Ein offener Task pro fachlichem Vorgang** — unabhängig vom technischen Erzeuger.

| Fachlicher Vorgang | Kanonischer `dedupKey` (V2) | Ist (Widersprüche) |
|--------------------|----------------------------|---------------------|
| Fahrzeug muss gereinigt werden | `vehicle:cleaning:{vehicleId}` | **Zwei Keys:** `booking:clean:{bookingId}` **und** `vehicle:cleaning:{vehicleId}` |
| Rechnung offen | `invoice:unpaid:{invoiceId}` | **Zwei Keys:** `booking:invoice:{bookingId}` **und** `invoice:unpaid:{invoiceId}` |
| Booking Pickup | `booking:pickup:{bookingId}` | Konsistent — Regel `booking.lifecycle.confirmed.pickup` |
| Booking Return | `booking:return:{bookingId}` | Konsistent — Regel `booking.lifecycle.active.return` |
| Dokument fehlt (Bundle) | `document:package:{phase}:{bookingId}` | Legacy `booking:document:{bookingId}` nur noch Supersede-Alias |
| Insight Health | `{kind}:{vehicleId}` | Konsistent |

**V2-Norm:** Produzenten müssen den **kanonischen Key** verwenden. Abweichende Legacy-Keys werden per Migrations-/Runtime-Alias aufgelöst.

### H.3 Wiederauftreten nach Abschluss

| Szenario | Verhalten |
|----------|-----------|
| Bedingung kehrt zurück (z. B. erneut `NEEDS_CLEANING`) | Neuer Task mit gleichem kanonischem Key (nach Parking) |
| Flapping Insight (aktiv/inaktiv) | Eskalation in-place solange ACTIVE; bei DONE nur neuer Task wenn Bedingung neu |
| Gleiche Rechnung erneut offen | Unzulässig solange Invoice nicht PAID — Task bleibt oder wird re-opened (Ziel: **kein** zweiter Task) |

### H.4 Zeitfensterbezogene Tasks

- `pickup_overdue:{bookingId}` — Insight only (heute); wenn materialisiert: `dueDate = booking.startDate`, `activatesAt = booking.startDate`.
- `service_before_booking:{vehicleId}:{bookingId}` — zeitgebunden an nächste Buchung.
- Regel: zeitfensterbezogene Tasks tragen `metadata.timeWindow: { from, to, anchorEntity }`.

---

## I. Operator-Buckets

Buckets sind **Filter auf ACTIVE Tasks** mit `activatesAt ≤ now`. Sortierung innerhalb des Buckets: `priority DESC`, `dueDate ASC`, `createdAt ASC`.

| Bucket (DE) | ID | Regel |
|-------------|-----|-------|
| **Jetzt erforderlich** | `now_required` | `priority ∈ {HIGH, CRITICAL}` ∨ `blocksVehicleAvailability=true` ∨ Pickup/Return innerhalb 2h |
| **Heute** | `today` | `dueDate` im lokalen Org-Tagesfenster ∨ Booking Pickup/Return heute |
| **Demnächst** | `soon` | `dueDate` innerhalb 7 Tage, nicht heute |
| **Geplant** | `planned` | `activatesAt > now` ∨ `dueDate > 7d` |
| **Überfällig** | `overdue` | `isOverdue=true` |
| **Unzugewiesen** | `unassigned` | `assignedUserId IS NULL` ∧ ACTIVE |
| **Alle offenen** | `all_open` | `status ∈ ACTIVE` |
| **Erledigt** | `done` | `status ∈ {DONE, CANCELLED}` — nur Historie-Ansicht |

**API-Ziel:** `GET /tasks/summary` und `GET /tasks?bucket=` liefern konsistente Zähler — **keine** rein clientseitige Ableitung in Operator/Rental.

> **⚠ Ist-Widerspruch:** `TasksView` und `OperatorDataContext` leiten Buckets/Overdue teils clientseitig ab; `TasksView` mappt `DONE`+`CANCELLED` → „Completed“.

---

## J. Automationsregeln

### J.1 Regel-Identität

Jede System-Task-Erzeugung referenziert:

```typescript
interface TaskAutomationRef {
  ruleId: string;        // stabil, z. B. "booking.lifecycle.confirmed.prep"
  ruleVersion: number;   // inkrement bei Semantik-Änderung
  ruleScope: 'ORG' | 'PLATFORM';
}
```

Persistenz-Ziel: `OrgTask.metadata.automation = { ruleId, ruleVersion, ... }`.

### J.2 Regel-Katalog (normativ, Auszug)

| ruleId | ruleVersion | Trigger | TaskType | dedupKey | materializeAsTask |
|--------|-------------|---------|----------|----------|-------------------|
| `booking.lifecycle.confirmed.prep` | 1 | Booking `CONFIRMED` | `BOOKING_PREPARATION` | — (Workflow) / optional | false (V2) |
| `booking.lifecycle.confirmed.clean` | 1 | Booking `CONFIRMED` | `VEHICLE_CLEANING` | `vehicle:cleaning:{vehicleId}` | W1–W4 |
| `booking.lifecycle.active.pickup` | 1 | Booking `ACTIVE` | `BOOKING_PICKUP` | `booking:pickup:{id}` | W1–W4 |
| `booking.lifecycle.completed.return` | 1 | Booking `COMPLETED` | `BOOKING_RETURN` | `booking:return:{id}` | W1–W4 |
| `invoice.unpaid` | 1 | Invoice issued/unpaid | `INVOICE_REQUIRED` | `invoice:unpaid:{invoiceId}` | true |
| `document.bundle.missing` | 1 | Bundle sync | `DOCUMENT_REVIEW` | `document:{type}:{bookingId}` | W1 |
| `insight.health.tire_critical` | 1 | Insight run | `TIRE_CHECK` | `tire_critical:{vehicleId}` | true |
| `insight.compliance.tuv_overdue` | 1 | Insight run | `VEHICLE_INSPECTION` | `tuv_overdue:{vehicleId}` | true |
| `vehicle.cleaning.required` | 1 | `cleaningStatus=NEEDS_CLEANING` | `VEHICLE_CLEANING` | `vehicle:cleaning:{vehicleId}` | true |
| `fine.created` | 1 | Fine create | `CUSTOMER_FOLLOWUP` | `fine:{fineId}` | true |
| `booking.lifecycle.cancelled` | 1 | Booking `CANCELLED`/`NO_SHOW` | — | — | `SUPERSEDED` close all ACTIVE `source=BOOKING` for `bookingId` |
| `booking.lifecycle.cancelled.noshow` | 1 | Booking `NO_SHOW` | — | — | gleich wie cancelled |

### J.3 Regel-Verhalten

| Aktion | Beschreibung |
|--------|--------------|
| **Aktivierung** | `upsertByDedup` oder Workflow-only — gemäß `materializeAsTask` |
| **Eskalation** | Priority/DueDate/`blocksVehicleAvailability` nur nach oben |
| **Auto-Resolve** | Bedingung false → `AUTO_RESOLVED` via `TasksService` |
| **Supersede** | Phase/Scope gewechselt → `SUPERSEDED` |
| **Org-Override** | `OrgTaskAutomationOverride` (Ziel-Tabelle oder `OrgSettings`) — `enabled`, `materializeAsTask`, `priorityFloor` |

### J.4 Fehlertoleranz

Automation-Fehler **dürfen** den auslösenden Domain-Write nicht abbrechen (bestehend: `safeUpsert` in `TaskAutomationService`).

---

## K. Audit-Trail

**Jede** nachfolgende Aktion erzeugt ein `TaskEvent` (oder äquivalentes unveränderliches Log):

| Aktion | `TaskEvent.type` | Pflichtfelder |
|--------|------------------|---------------|
| Task erstellt | `CREATED` | `newValue=OPEN`, `metadata.auto`, `metadata.automation` |
| Status geändert | `STATUS_CHANGED` | `oldValue`, `newValue`, `metadata.resolutionKind` |
| Zugewiesen | `ASSIGNED` | `oldValue`, `newValue` (userId) |
| Kommentar | `COMMENT_ADDED` | — |
| Checkliste | `CHECKLIST_ITEM_ADDED` / `CHECKLIST_ITEM_UPDATED` | `metadata.itemId`, `isDone` |
| Anhang | `ATTACHMENT_ADDED` | — |
| Auto-resolve | `STATUS_CHANGED` | `metadata.resolutionKind=AUTO_RESOLVED`, `ruleId` |
| Supersede | `STATUS_CHANGED` | `metadata.resolutionKind=SUPERSEDED`, `supersededBy` |
| Manager-Override | `COMPLETION_OVERRIDDEN` | `reason`, `actorUserId` |
| Verknüpfung geändert | `LINKS_UPDATED` | betroffene IDs |
| Eskalation | `ESCALATED` | alte/neue Priority/DueDate |

**Regel K1:** Direkte `prisma.orgTask.update` für Statusänderungen ist **verboten**.

**Regel K2:** Timeline in UI (`GlobalTaskDetailPanel`, `OperatorTaskDetail`) ist vollständige Projektion von `TaskEvent` — keine lokalen erfundenen Events.

> **⚠ Ist-Widerspruch:** `updateChecklistItem` persistiert Änderungen, erzeugt aber **kein** `CHECKLIST_ITEM_UPDATED`-Event (`tasks.service.ts`). V2 verlangt Event pro relevantem Checklisten-Toggle.

> **⚠ Ist-Widerspruch:** Auto-Close-Pfade (`closeLinkedTasks`, `closeStaleInsightTasks`, `closeStaleBookingLifecycleTasks`) und `createVehicleComplaint` umgehen `TaskEvent` vollständig — siehe Audit Appendix C.

---

## 8. Rückwärtskompatibilität

| Bereich | Strategie |
|---------|-----------|
| Bestehende `OrgTask`-Rows | Keine Pflicht-Migration; neue Felder nullable mit Defaults |
| `activatesAt` | Backfill `= createdAt` |
| `resolutionKind` | Backfill: `DONE` ohne Event → `MANUAL` wenn `completedByUserId`/Event existiert, sonst `AUTO_RESOLVED` (best-effort) |
| `dedupKey`-Namespaces | Alias-Map für Legacy-Keys; Dual-Key-Perioden deduplizieren per Job |
| API `api.tasks.*` | Bestehende Endpoints bleiben; additive Felder in Response |
| `TaskStatus` enum | Unverändert |
| `TaskType` / `TaskSource` | Unverändert; neue Types nur additiv |
| Frontend Buckets | Schrittweise Umstellung auf Server-Buckets; Übergang: Client darf fallback |
| ServiceCase | `serviceCaseId` optional bleibt |

**Kein Breaking Change** in Phase 1 der Implementierung: unbekannte `metadata`-Felder werden ignoriert.

---

## 9. Ist-Widersprüche (explizit)

Quelle: `docs/audits/task-management-inventory.md` — verifizierte Call Sites und Producer-Registry.

| # | Soll (V2) | Ist (belegt) | Priorität | Stand 2026-07-15 |
|---|-----------|--------------|-----------|------------------|
| W1 | Booking-Lifecycle nur als Task wenn W1–W4 (§1.2) | `TaskAutomationService.ensureBookingLifecycleTasks` materialisiert bei `CONFIRMED`/`ACTIVE`/`COMPLETED` immer bis zu 6 Task-Typen | P1 | **behoben** (P1) — Guards + Outbox |
| W2 | Ein kanonischer Cleaning-Key `vehicle:cleaning:{vehicleId}` | Zusätzlich `booking:clean:{bookingId}` — zwei offene `VEHICLE_CLEANING` möglich | P0 | **behoben** (P1) |
| W3 | Ein kanonischer Invoice-Key `invoice:unpaid:{invoiceId}` | Zusätzlich `booking:invoice:{bookingId}` bei `COMPLETED` | P0 | **behoben** (P1) |
| W4 | Alle Statusänderungen via `TasksService` + `TaskEvent` | `invoices.closeLinkedTasks`, `closeStaleInsightTasks`, `closeStaleBookingLifecycleTasks` — direktes `prisma.orgTask.update` ohne Event | P0 | **behoben** (P1) |
| W5 | `completionMode` bei Terminalstatus | Feld in Schema + Events (`completionMode` + Legacy `resolutionKind` in Metadata) | P1 | **behoben** — `AUTO_RESOLVED`/`SUPERSEDED` via `TasksService` |
| W6 | `activatesAt` für geplante Tasks | `NOT NULL` + Backfill-Migration | P2 | **behoben** — `20260715181000` |
| W7 | Booking `cancel` / `NO_SHOW` → lifecycle `SUPERSEDED` | `bookings.service.cancel` / `markNoShow` ohne Task-Hook | P0 | **behoben** (P1) |
| W8 | Payment reconciliation → Invoice-Task `AUTO_RESOLVED` | `payment-reconciliation.service` ohne OrgTask; Test 51 dokumentiert offene Task bei PAID | P0 | **behoben** (P1) |
| W9 | Document-Task auto-close bei Bundle `COMPLETE` | Nur `syncMissingDocumentTasks` (Erzeugung); kein Stale-Close für `source=DOCUMENT` | P1 | **behoben** (P1) |
| W10 | `createVehicleComplaint` via `TasksService` | `vehicles.service.ts` — raw `prisma.orgTask.create`, kein `TaskEvent`/`dedupKey` | P0 | **behoben** (P1) |
| W11 | Server-side Operator-Buckets (§I) | `TasksView`, `task-list.utils`, `OperatorDataContext` leiten teils clientseitig ab | P2 | **teilweise** — Server-Buckets primär; Client-Sort/Fallback dokumentiert |
| W12 | `resolutionCode` strukturiert | Nur `resolutionNote` für `RESOLUTION_REQUIRED_TYPES` | P2 | offen |
| W13 | Manager-Override + `COMPLETION_OVERRIDDEN` | Nicht implementiert; `ServiceOverviewPanel` ruft `complete` ohne Note auf | P2 | offen |
| W14 | Checklisten-Events vollständig | `updateChecklistItem` ohne `TaskEvent` | P1 | **behoben** (P1) |
| W15 | `ensureRepairTask` angebunden | Implementiert, **0 Call Sites** — Schaden/Repair nutzt `api.tasks.create` | P1 | offen |
| W16 | Parallele Create-APIs ohne Dedup | WhatsApp, Observations, Voice, Support — `createManualTask` ohne `dedupKey` | P1 | offen |
| W17 | `TasksView` Pflichtfeld `estimatedDuration` | UI-validiert, nicht in `CreateTaskPayload` | P2 | offen |

---

## 10. Ziel-Architektur (eine Engine)

```
┌─────────────────────────────────────────────────────────────┐
│                     Domain Producers                         │
│  Bookings, Documents, Insights, Invoices, Fines, Vehicles,  │
│  Workflows, WhatsApp, Observations, Compliance UI           │
└──────────────────────────┬──────────────────────────────────┘
                           │ ruleId + dedupKey
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              TasksService (single write path)                │
│  createManualTask │ upsertByDedup │ changeStatus            │
│  resolveAuto │ supersede │ assign │ checklist │ events       │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      OrgTask         TaskEvent      ServiceCase (link)
          │
          ▼
   TasksController / summaries / entity lists
          │
          ▼
   Rental TasksView │ Operator │ Service Center
```

**Nicht Teil dieser Engine:** `DashboardInsight` (eigene Pipeline), Workflow-Prozesszustände (Booking/Handover), Notifications.

---

## 11. Verbindliche Akzeptanzkriterien für die Implementierung

Die folgenden Kriterien müssen für ein Release „Task Domain V2 Phase 1“ erfüllt sein. Jedes Kriterium ist objektiv prüfbar.

### 11.1 Schreibpfad-Integrität

- [ ] **AC-01:** Kein Produktionscode führt `prisma.orgTask.create/update` für Statusänderungen außerhalb `TasksService` aus (inkl. `vehicles.service.createVehicleComplaint`).
- [ ] **AC-02:** Jede Statusänderung zu `DONE`/`CANCELLED` erzeugt genau ein `TaskEvent` mit `metadata.resolutionKind`.
- [ ] **AC-03:** `closeLinkedTasks`, `closeStaleInsightTasks`, `closeStaleBookingLifecycleTasks` sind in `TasksService` konsolidiert und nutzen `changeStatus` oder äquivalente private Methode mit Event-Pflicht.

### 11.2 Dedup und Duplikate

- [ ] **AC-04:** Pro Org existiert höchstens ein ACTIVE Task pro kanonischem `dedupKey`.
- [ ] **AC-05:** Cleaning: `booking:clean` und `vehicle:cleaning` kollidieren nicht — ein kanonischer Key, dokumentierte Alias-Auflösung, Migrations- oder Runtime-Test.
- [ ] **AC-06:** Invoice: `booking:invoice` wird nicht erzeugt, wenn `invoice:unpaid:{invoiceId}` bereits ACTIVE ist (oder Keys sind vereinheitlicht).

### 11.3 Lifecycle und Automation

- [ ] **AC-07:** Booking `cancel` und `NO_SHOW` schließen oder superseden alle ACTIVE `source=BOOKING`-Tasks für `bookingId`.
- [ ] **AC-08:** Vollständige Bezahlung über **alle** Payment-Pfade (inkl. `payment-reconciliation`) löst `AUTO_RESOLVED` für verknüpfte Invoice-Tasks aus.
- [ ] **AC-09:** Fehlende Bundle-Dokumente erzeugen Tasks; Bundle `COMPLETE` auto-resolved DOCUMENT-Tasks mit passendem `document:{type}:{bookingId}`.
- [ ] **AC-10:** Jede System-Task trägt `metadata.automation.ruleId` und `ruleVersion`.

### 11.4 API und UI

- [ ] **AC-11:** `GET /tasks/summary` liefert Bucket-Zähler gemäß §I (mindestens `overdue`, `unassigned`, `dueToday`, `critical`).
- [ ] **AC-12:** `GET /tasks?bucket=` filtert serverseitig; Operator und Rental nutzen dieselben Bucket-IDs.
- [ ] **AC-13:** `isOverdue` kommt ausschließlich vom Server; UI führt keinen parallelen Overdue-Status ein.
- [ ] **AC-14:** Resolution-Policy (§F) wird in allen Complete-Entry-Points durchgesetzt (inkl. `ServiceOverviewPanel`).

### 11.5 Audit und Nachvollziehbarkeit

- [ ] **AC-15:** Task-Detail-Timeline zeigt Auto-Resolve und Supersede mit `ruleId` und Auslöser.
- [ ] **AC-16:** Manager-Override erzeugt `COMPLETION_OVERRIDDEN` Event (wenn Feature aktiviert).

### 11.6 Tests

- [ ] **AC-17:** `tasks.service.spec.ts` deckt `resolutionKind`, idempotente Übergänge und Event-Pflicht ab.
- [ ] **AC-18:** Integrationstests für Booking-cancel, Invoice-reconciliation, Document-bundle-close (mindestens je 1 Szenario).
- [ ] **AC-19:** Playwright E2E für mindestens: Liste → Detail → Start → Complete mit Resolution-Note (analog Invoice E2E V4.9.469).

### 11.7 Rückwärtskompatibilität

- [ ] **AC-20:** Bestehende API-Clients ohne `resolutionKind`/`activatesAt` funktionieren unverändert (Felder optional/nullable).
- [ ] **AC-21:** Keine Pflicht-Backfill-Blocker für Deploy — additive Migration nur.

---

## 12. Referenzen

| Dokument / Modul | Rolle |
|------------------|-------|
| `docs/audits/task-management-inventory.md` | Ist-Analyse |
| `backend/src/modules/tasks/tasks.service.ts` | Aktuelle State Machine |
| `backend/prisma/schema.prisma` | `OrgTask`, `TaskEvent`, `ServiceCase` |
| `backend/src/modules/tasks/task-automation.service.ts` | Booking/Document Automation |
| `backend/src/modules/business-insights/insight-task-bridge.service.ts` | Insight → Task |
| `frontend/src/master/components/ArchitekturView.tsx` | Produkt-Architektur Task Action Layer |

---

**Nächster Schritt (außerhalb dieses Dokuments):** Implementierungsplan in Phasen:

| Phase | Fokus | Widersprüche |
|-------|-------|--------------|
| **1** | Schreibpfad-Integrität, Dedup-Vereinheitlichung, Cancel-Hook, Reconciliation-Close | W2, W3, W4, W7, W8, W10 |
| **2** | `resolutionKind`, `metadata.automation`, Document auto-close, Checklisten-Events | W5, W9, W14, W15 |
| **3** | Workflow-Schritt-Entkopplung (W1–W4), Server-Buckets, `resolutionCode`, Manager-Override, `activatesAt` | W1, W6, W11–W13, W17 |

**Changes / Architektur (SynqDrive Code):** Dieses Dokument ist die normative Spezifikation. `ArchitekturView.tsx` / `ChangesView.tsx` werden erst bei Implementierungsstart aktualisiert — **keine produktiven Dateien in diesem Schritt geändert**.
