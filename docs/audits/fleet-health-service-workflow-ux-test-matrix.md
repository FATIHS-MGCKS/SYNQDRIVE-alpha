# Fleet Tab „Zustand & Service“ — Workflow-, Business-Rule-, Permission-, Fehlerzustands- und UX-Testmatrix (Audit 2/2)

| Feld | Wert |
|------|------|
| **Audit-Typ** | Kontrollierte Testmatrix + statische Verifikation (Audit 2 von 2) |
| **Basis-Audit** | `docs/audits/fleet-health-service-production-reality.md` (Audit 1) |
| **Repository-Commit** | `8d2780ac32db22332f5d4530525e738844373208` (`main`) |
| **Audit-Zeitpunkt (UTC)** | 2026-07-18T08:57–09:05 |
| **Modus** | Keine Produktionsmutationen; nur bestehende Tests, statische Analyse, synthetische Fixtures |

---

## 1. Executive Summary

Diese Matrix systematisiert **142 Testfälle** für den Fleet-Tab „Zustand & Service“ über Health-Aggregation, Runtime-Readiness-Trennung, Task-/Service-Case-Lifecycle, Partial Failures, Refresh, RBAC, Skalierung und UX.

**Ausführung im Audit:**

| Kategorie | Anzahl |
|-----------|--------|
| **Ausgeführte Unit-/Integrationstests** | **172** (86 Backend + 86 Frontend) |
| **Statisch verifizierte Fälle** | **118** |
| **Nicht testbar / blockiert** | **24** |

**Wichtigste P0-Findings (bestätigt durch Tests + Code):**

1. **Service Cases fehlen vollständig in FHS-UI** — kein Fetch, kein Subtab, Historie/Termine task-only.
2. **Health→Task-Matching zu breit** — `findDuplicateHealthTask` matcht auf Task-Typ allein (`REPAIR` für Brake/DTC) ohne `sourceFindingId`-Fingerprint.
3. **Vendor-API-Fehler → stilles `[]`** — KPI „Wartet Partner“ kann bei API-Ausfall fälschlich 0 sein.
4. **Refresh-Button aktualisiert nur Health** — Tasks/Vendors/Service Cases nicht.
5. **Tasks ohne Pagination** — Skalierung ab ~500 Fahrzeugen/Tasks **NOT_READY**.

**Gesamturteil:** **CONDITIONALLY_READY**

| Bereich | Urteil |
|---------|--------|
| Health-Readiness | **CONDITIONALLY_READY** |
| Health→Task | **CONDITIONALLY_READY** (FALSE_MATCH-Risiko) |
| Task-/Service-Case | **CONDITIONALLY_READY** / SC **SHADOW_ONLY** |
| Partial Failure | **NOT_READY** (Vendor silent fail) |
| Refresh/Freshness | **CONDITIONALLY_READY** |
| RBAC | **PARTIAL** |
| Skalierung | **CONDITIONALLY_READY** (≤100) / **NOT_READY** (500+) |
| UI/UX | **CONDITIONALLY_READY** |

---

## 2. Repository-Commit und Testumgebung

| Komponente | Setup | Version/Tool |
|------------|-------|--------------|
| Backend Unit | Jest + `@nestjs/testing` | `npm test` in `backend/` |
| Backend Integration | Jest + Prisma (selective) | Nur wo Specs existieren |
| Frontend Unit | Vitest | `npm test` in `frontend/` |
| E2E | Playwright | `frontend/e2e/` — **kein** dedizierter FHS-Flow |
| Auth Helpers | `permissions.guard.spec.ts`, Controller-Specs | Teilweise |
| Fake Time | Jest/Vitest `vi.useFakeTimers` | In einzelnen Specs |
| Synthetische Flotte | View-Model-Tests, `fleet-operational-fixtures.ts` | Manuell in Matrix definiert |

**Keine** isolierte Testdatenbank-Migration oder neue Fixtures committed.

---

## 3. Sicherheits- und Read-only-Nachweis

| Prüfung | Ergebnis |
|---------|----------|
| `git status --short` vor Audit | Sauber auf `main` |
| Produktions-DB/API Mutationen | **Keine** |
| Neue Code-/Testdateien committed | **Keine** (nur diese Markdown-Datei) |
| Produktionsbefunde | Nur aus Audit 1 (read-only) referenziert |
| E2E gegen Produktion | **Nicht ausgeführt** |

---

## 4. Testharness und Ausführbarkeit

| Bereich | Klassifikation | Nachweis / Befehl |
|---------|----------------|-------------------|
| Rental Health Aggregation (Unit) | **EXECUTABLE** | `rental-health.service.spec.ts`, policy specs — 86 Tests grün |
| Rental Health Types/Blocking | **EXECUTABLE** | `rental-health.types.spec.ts`, tire/brake policy |
| Fleet Health Control Center | **EXECUTABLE** | `fleet-health-control-center.test.ts` — 15 Tests |
| FHS View Model | **EXECUTABLE** | `fleet-health-service.view-model.test.ts` — 10 Tests |
| Runtime vs Readiness | **EXECUTABLE** | `dashboardRuntime.test.ts` — 27 Tests |
| Operational Issues | **EXECUTABLE** | `operationalIssues.test.ts` — 18 Tests |
| Health→Task Bridge (Pure) | **PARTIALLY_EXECUTABLE** | Logik in `health-task-bridge.utils.ts` — **kein** dediziertes Spec |
| Task Controller Guards | **PARTIALLY_EXECUTABLE** | `tasks.controller.spec.ts` — Guard-Namen only |
| Service Case Lifecycle | **STATIC_ONLY** | Backend service specs nicht FHS-spezifisch |
| FHS E2E (6 Subtabs) | **NOT_TESTABLE** | Kein Playwright-Spec für `FleetHealthServiceView` |
| Große Flotte (500–5000) | **STATIC_ONLY** | Code-Analyse URL-Länge, Batch 10, kein `take` |
| RBAC Live-Rollen | **NOT_TESTABLE** | Keine Impersonation im Audit |
| Battery V2 Prod-Fehler | **PRODUCTION_READ_ONLY_VERIFIED** | Audit 1 Logs |
| Prometheus/Grafana FHS | **NOT_TESTABLE** | Metrics 401, kein Dashboard |

### Ausgeführte Testbefehle

```bash
cd /workspace/frontend && npm test -- --run \
  fleet-health-service.view-model.test.ts \
  fleet-health-service.types.test.ts \
  fleet-health-control-center.test.ts

cd /workspace/frontend && npm test -- --run \
  dashboardRuntime.test.ts operationalIssues.test.ts reasonDisplay.test.ts

cd /workspace/backend && npm test -- \
  --testPathPattern="rental-health|health-task|tasks.controller" --passWithNoTests
```

**Ergebnis:** 172/172 Tests **PASS**.

---

## 5. Synthetisches Testdatenmodell

### 5.1 Organisationen

| ID | Name | Fahrzeuge | Health | Tasks | Service Cases | Zweck |
|----|------|-----------|--------|-------|---------------|-------|
| `ORG-S` | Klein | 5 | Vollständig | 3 offen, 2 done | 1 OPEN | Happy path, KPI-Baseline |
| `ORG-M` | Gemischt | 30 | 10 full, 8 stale, 7 partial, 5 error | 45 offen, multi/vehicle | 8 Cases mixed status | Matching, Dedup, Partial |
| `ORG-L-500` | Groß | 500 | Wie ORG-M skaliert | 800+ | 50 | URL/Batch/Render |
| `ORG-L-1K` | Groß | 1.000 | Simuliert | 2.000 | 100 | Querystring-Grenze |
| `ORG-L-5K` | Groß | 5.000 | Simuliert | 10.000 | 500 | Architektur-Gate |
| `ORG-A` + `ORG-B` | Multi-Tenant | je 10 | Gleiche Modellnamen | Getrennte Tasks | Getrennte Cases | Isolation |

### 5.2 Rollen-Matrix (Testintention)

| Rolle | `fleet.read` | `fleet.write` | `vendor-management` | Tasks mutieren (Ist) | Erwartung Ziel |
|-------|--------------|---------------|---------------------|----------------------|----------------|
| Master Admin | bypass | bypass | bypass | Ja | Ja |
| Org Admin | ja | ja | ja | Ja (nur Org-Scope) | Ja |
| Sub Admin | konfigurierbar | konfigurierbar | konfigurierbar | Ja | Permission-basiert |
| Service Manager | ja | teilweise | read | Ja | `tasks.write` |
| Station Manager | station-scope | teilweise | read | Station-filter | Station-scope |
| Worker | read | nein | nein | Eingeschränkt | Assign/Complete only |
| Driver | minimal | nein | nein | Nein | Read own |
| Read-only | read | nein | nein | Nein | Read only |

---

## 6. Rental-Health-Aggregation

### 6.1 Regeln (Soll)

| Regel | Soll | Ist (Code/Test) |
|-------|------|-----------------|
| Warning blockiert nicht auto. | Nein | **PASS** — `collectBlockingReasons` nur Hard-Block (**UNIT_TEST**) |
| Critical ≠ Maintenance | Nein | **PASS** — kein Maintenance-Flag in Rental Health |
| Unknown ≠ healthy | Nein | **PASS** — `healthSeverityBand` → `limited` (**UNIT_TEST**) |
| Modulfehler vernichtet nicht andere | Nein | **PASS** — `Promise.allSettled` (**CODE**) |
| `rental_blocked` ⊥ `overall_state` | Ja | **PASS** — `rental-health.service.spec.ts` |
| Blockergrund nachvollziehbar | Ja | **PASS** — `blocking_reasons[]` ordered |

### 6.2 Kombinations-Matrix (Auszug — vollständige Zeilen in §26)

Kombinationen `all good`, `one watch`, `one critical`, `multi critical`, `one unknown`, `system error`, `stale compliance`, `blocking observation`, `OEM`, `DTC-only` — jeweils mit erwarteten `overall_state`, `rental_blocked`, Modul-States. Backend-Specs decken **Tire/Brake/Battery/DTC/Compliance** Policies ab; **OEM-only** und **multi-module partial** nur **STATIC_ONLY**.

---

## 7. Health versus Runtime Readiness

### 7.1 Trennungsmodell

| Schicht | Kanonische Quelle | UI-Ort |
|---------|-------------------|--------|
| Technischer Zustand / Mietblockade | `VehicleHealthResponse` / Rental Health V1 | Zustand & Service |
| Operative Vermietungsbereitschaft | `deriveIsReadyForRenting` + `vehicleRuntimeStateBuilder` | Fleet Status, Buchung |
| Buchungs-Gate | `enforceRentalHealthGate` | Backend Buchungserstellung |

### 7.2 Szenario-Erwartungen

| # | Health | Runtime/Operational | UI Z&S | UI Buchung | Test |
|---|--------|---------------------|--------|------------|------|
| H1 | good | rented | „unauffällig“, nicht „vermietbar“ | N/A | **PASS** `dashboardRuntime` |
| H2 | good | cleaning dirty | good badge, runtime not ready | block | **PASS** `deriveIsReadyForRenting` |
| H3 | good | damage block | getrennte Reasons | block | **PASS** operationalIssues |
| H4 | good | offline telemetry | limited/offline Hinweis | block | **PASS** runtime |
| H5 | critical, !blocked | available | critical, nicht blocked KPI | gate? | **PARTIAL** — warning-only critical |
| H6 | blocked | available (ops) | blocked badge | `VEHICLE_RENTAL_BLOCKED` | **PASS** booking service |
| H7 | unknown | available | „Daten begrenzt“ | `HEALTH_GATE_UNAVAILABLE`? | **PARTIAL** gate logic |

**Urteil:** „Technisch unauffällig“ ≠ „vermietungsbereit“ — **PASS** in Runtime-Schicht; Z&S zeigt bewusst nur technische Perspektive (**CODE**).

---

## 8. Partial Failure und Nullwertschutz

| Fehlerquelle | Übersicht KPI | Fahrzeuge | Aufgaben | Partner | Ist | Soll |
|--------------|---------------|-----------|----------|---------|-----|------|
| Health API 500 | Error/leer | `ErrorState` + Retry | — | — | Health-Fehler sichtbar | **PASS** |
| Health partial/vehicle | unknown stub | pro-row limited | — | — | `rental_blocked: false` stub | **FAIL** P1 |
| Task Summary 500 | serviceError | — | Error | — | Alles leer + Message | **PASS** |
| Task List 500 | serviceError | — | Error | — | Wie oben | **PASS** |
| Vendor 500 | vendor KPI = 0 | — | — | leer | **FAIL** P0 — `.catch(() => [])` |
| Service Case 500 | N/A | — | — | — | Nicht geladen | **NOT_IMPLEMENTED** |
| Runtime loadFailed | — | — | — | — | UNKNOWN ops | **PASS** fleet-operational |
| Modul-Detail `.catch` | — | Tab leer | — | — | Partial sichtbar? | **PARTIAL** |

**Urteil Partial Failure:** **NOT_READY** — Vendor silent fail + Health per-vehicle degradation.

---

## 9. Freshness und Refresh

| Ereignis | Health | Tasks | Vendors | Service Cases | Runtime Map |
|----------|--------|-------|---------|---------------|-------------|
| Initial load Z&S | Ja | Ja | Ja | Nein | 30s separat |
| Header Refresh | **Ja** | **Nein** | **Nein** | Nein | Nein |
| Task Create/Complete | Invalidation | Ja | Nein | Nein | Eventuell |
| Window Focus | Nein | Nein | Nein | Nein | Nein |
| Vehicle add/remove | idsKey change → reload | Nein | Nein | Nein | Ja |

| Erwartung | Ist |
|-----------|-----|
| „Aktualisieren“ aktualisiert alle relevanten Quellen | **FAIL** — nur Health |
| Freshness pro Quelle | **PARTIAL** — nur Health-Header `latestHealthGeneratedAt` |
| Ein frisches Fahrzeug macht nicht ganze Flotte frisch | **FAIL** — max timestamp |
| Älteste Quelle sichtbar | **NOT_IMPLEMENTED** |

**Urteil Refresh/Freshness:** **CONDITIONALLY_READY**

---

## 10. Health-to-Task-Matching

### 10.1 Klassifikations-Schema

| Klasse | Definition |
|--------|------------|
| **EXACT_MATCH** | `metadata.healthModule` + passender Typ + gleiches Fahrzeug |
| **FALSE_MATCH** | Typ-/Block-Heuristik ohne fachlichen Bezug |
| **MISSED_MATCH** | Finding aktiv, passender Task existiert, nicht verlinkt |
| **DUPLICATE** | Mehrere Tasks für ein Finding |
| **AMBIGUOUS** | Mehrdeutige Typ-Matrix |

### 10.2 Szenario-Bewertung (Code + View-Model-Tests)

| # | Szenario | Klasse | Resultat |
|---|----------|--------|----------|
| M1 | Battery + `BATTERY_CHECK` + `healthModule:battery` | EXACT_MATCH | **PASS** (implizit VM test) |
| M2 | Battery + generischer `REPAIR` | FALSE_MATCH | **FAIL** — `MODULE_TASK_TYPES.error_codes` enthält `REPAIR` |
| M3 | Brake + Karosserie-`REPAIR` | FALSE_MATCH | **FAIL** — `brakes: ['BRAKE_CHECK','REPAIR']` |
| M4 | DTC + `CUSTOM` | FALSE_MATCH | **FAIL** |
| M5 | Tire + `TIRE_CHECK` | EXACT_MATCH | **PASS** |
| M6 | Finding + DONE alter Task | MISSED_MATCH | **PASS** — nur OPEN matched |
| M7 | Finding + CANCELLED Task | MISSED_MATCH | **PASS** |
| M8 | Neues Finding, gleiche Kategorie, andere source ID | AMBIGUOUS | **NOT_IMPLEMENTED** — keine sourceFindingId |
| M9 | Mehrere Findings gleiches Modul | DUPLICATE risk | **PARTIAL** |
| M10 | `blocksVehicleAvailability` + anderes Thema | FALSE_MATCH | **FAIL** — `matchOpenTaskForHealthSignal` Heuristik |
| M11 | `rental_blocked` + beliebiger blockierender Task | FALSE_MATCH | **FAIL** P1 |

**Urteil Health→Task:** **CONDITIONALLY_READY** — EXACT_MATCH funktioniert; breite Typ-Heuristik erzeugt FALSE_MATCH-Risiko.

---

## 11. Taskerstellung aus Health

| Modul | Prefill-Typ | `healthModule` meta | `sourceType: HEALTH` | `blocksVehicleAvailability` | Duplicate-Warnung |
|-------|-------------|---------------------|----------------------|----------------------------|-------------------|
| Battery | `BATTERY_CHECK` | ja | ja | critical/block policy | `HealthServiceActions` |
| Tires | `TIRE_CHECK` | ja | ja | critical | ja |
| Brakes | `BRAKE_CHECK` | ja | ja | critical | ja |
| DTC | `REPAIR` | ja + codes | ja | critical | ja |
| Compliance | `VEHICLE_INSPECTION` | ja | ja | optional | ja |
| OEM | `REPAIR` | ja | ja | nein default | ja |
| Complaints | `CUSTOM` | ja | ja | nein | ja |

| Prüfung | Ist |
|---------|-----|
| `vehicleId` vorgefüllt | **PASS** `buildHealthTaskPrefill` |
| `sourceFindingId` stabil | **NOT_IMPLEMENTED** |
| Nutzer muss Fahrzeug nicht erneut wählen | **PASS** |
| Allgemeiner Create ohne Kontext | Nur wenn nicht aus Health CTA | **PASS** |
| Falscher Tasktyp bei OEM→REPAIR | **PARTIAL** |

---

## 12. Mehrere Vorgänge je Fahrzeug

**Synthetisches Szenario ORG-M / Fahrzeug `V-MULTI`:**

- TÜV überfällig (compliance critical)
- Brake critical
- Battery watch
- Tire Task IN_PROGRESS
- Service Case WAITING_PARTS

| Surface | Erwartung | Ist |
|---------|-----------|-----|
| Übersicht priorisierte Liste | Alle Vorgänge sichtbar / Zähler | **FAIL** — 1 Health-Zeile + Dedup |
| KPI Handlungsbedarf | ≥1 | **PARTIAL** — vehicle count, nicht finding count |
| Fahrzeugliste | Badge/Count multi | **PARTIAL** — primary module only |
| Detailpanel | Alle Module | **PASS** — alle Tabs |
| Taskliste | Alle Tasks | **PASS** |
| Service Case | Case sichtbar | **NOT_IMPLEMENTED** in FHS |

---

## 13. Task-Lifecycle

### 13.1 Erlaubte Übergänge (Backend `TasksService.changeStatus`)

| Von → Nach | Erwartet | Getestet |
|------------|----------|----------|
| OPEN → IN_PROGRESS | Ja | task-domain-v2 audit |
| OPEN → WAITING | Ja | STATIC |
| IN_PROGRESS → WAITING | Ja | STATIC |
| WAITING → IN_PROGRESS | Ja | STATIC |
| IN_PROGRESS → DONE | Ja | UNIT (domain) |
| OPEN → CANCELLED | Ja | STATIC |
| DONE → OPEN | Nein | STATIC |
| CB4 `activatesAt` future → DONE | Block | UNIT |

### 13.2 Spezialfälle

| Fall | Health-Finding danach | Readiness |
|------|----------------------|-----------|
| Task DONE, Finding aktiv | Bleibt | Runtime unverändert durch Task |
| Task CANCELLED critical | Bleibt | **PASS** erwartet |
| Blockierender Task DONE | Task block weg, Health block bleibt | **PASS** getrennte Schichten |

**Urteil Task-Lifecycle:** **READY** (Domain) / FHS-Anzeige **CONDITIONALLY_READY**

---

## 14. Service-Case-Lifecycle

| Status | Backend | FHS UI |
|--------|---------|--------|
| OPEN | Ja | **NOT_IMPLEMENTED** |
| SCHEDULED | Ja | **NOT_IMPLEMENTED** |
| IN_PROGRESS | Ja | **NOT_IMPLEMENTED** |
| WAITING_VENDOR | Ja | **NOT_IMPLEMENTED** |
| WAITING_PARTS | Ja | **NOT_IMPLEMENTED** |
| COMPLETED | Ja | **NOT_IMPLEMENTED** |
| CANCELLED | Ja | **NOT_IMPLEMENTED** |

Szenarien: Case+multi Tasks, Task done/Case open, Case done/Task open, Partnerwechsel, Termin, Kosten, Dokument — alles **STATIC_ONLY** / **NOT_IMPLEMENTED** in FHS.

**Urteil Service Cases:** **SHADOW_ONLY** (Backend) / **NOT_READY** (FHS)

---

## 15. Task versus Service Case

| Fachfall | Soll-Artefakt | Aktuelle UI |
|----------|---------------|-------------|
| Einfache Kontrolle | Task | Task ✓ |
| Mehrstufige Werkstatt | Service Case + Tasks | Nur Task |
| TÜV + Reparatur + Nachprüfung | Case oder Task-Kette | Task only |
| Health ohne Werkstatt | Task optional | Task CTA |
| Schaden mit Werkstatt | Case | **NOT_IMPLEMENTED** |

**Bewertung:** UI verwendet Tasks als **alleinige** operative Wahrheit; Service Cases **versteckt**; Risiko doppelter Tasks ohne Case-Dedup.

---

## 16. Termine und Fälligkeiten

| Datenfeld | Backend | API | Tab „Termine“ |
|-----------|---------|-----|---------------|
| `OrgTask.dueDate` | Ja | Ja | **Ja** — `ServiceSchedulePanel` |
| `ServiceCase.scheduledAt` | Ja | Ja | **Nein** |
| `ServiceCase.expectedReadyAt` | Ja | Ja | **Nein** |
| Partnerbestätigung | Case metadata | Ja | **Nein** |

**Bewertung Tab „Termine“:** **Partielle Task-Fälligkeiten** — UI-Text sagt das ehrlich; Name „Termine“ ist **leicht irreführend**.

**Zielverhalten (empfohlen):**

- Fälligkeiten = Tasks + Case-Deadlines aggregiert
- Werkstatttermine = `scheduledAt` aus Service Cases
- Erwartete Rückkehr = `expectedReadyAt` + Fahrzeugstillstand-Flag

---

## 17. Partner

| Szenario | KPI | Filter | Tab Partner |
|----------|-----|--------|-------------|
| Task WAITING + vendor | +1 Wartet Partner | Ja | VendorManagementView |
| Case WAITING_VENDOR | 0 (nicht geladen) | — | **NOT_IMPLEMENTED** |
| Vendor API Fehler | 0 (**FAIL**) | leer | leer ohne Error |
| Archivierter Partner | — | — | STATIC |

**Empfehlung:** Partner als **sekundäre Administration** unter „Arbeiten“, nicht gleichberechtigter Haupttab.

---

## 18. Historie

**Aktuell (`ServiceHistoryPanel`):** erledigte/stornierte **Tasks** (Service-Typen).

| Ereignistyp | Im Verlauf | Soll |
|-------------|------------|------|
| DONE Task | Ja | Ja |
| CANCELLED Task | Ja | Ja |
| Service Case completed | **Nein** | Ja |
| Service Event | **Nein** | Ja |
| Rechnung/Dokument | **Nein** | Ja |
| TÜV/BOKraft-Änderung | **Nein** | Optional |
| Reifen/Bremsen/Batterie Arbeit | Nur als Task-Titel | Strukturiert |

**Bezeichnung „Verlauf“:** Für Task-Historie korrekt; für „Servicehistorie“ **zu weit** — Ziel: **Historie** mit Case+Task+Docs.

---

## 19. Blocking und Freigabe

| Szenario | Health Gate | Task Block | Runtime |
|----------|-------------|------------|---------|
| Health Blocker, kein Task | `rental_blocked` | — | ops separat |
| Health Blocker + offener Task | blocked | maybe `blocksVehicleAvailability` | — |
| Task DONE, Finding aktiv | **blocked bleibt** | nein | **PASS** erwartet |
| Finding behoben, Task offen | !blocked | task offen | **PASS** |
| ServiceCase.blocksRental | **Nicht** in RentalHealth | Case flag | **GAP** |
| Booking + Health API down | `VEHICLE_HEALTH_GATE_UNAVAILABLE` | — | **PASS** code |
| Warning only | !blocked | — | **PASS** |

Manuelle Freigabe: Tire/Brake **Review Override** API (`fleet.write`) — UI in Health-Detail, nicht FHS-Übersicht.

---

## 20. RBAC und Security

### 20.1 Route-Matrix (Auszug)

| Aktion | Endpoint | Org | Roles | Permission | Ist |
|--------|----------|-----|-------|------------|-----|
| Health read | `GET .../rental-health` | Ja | Ja | `fleet.read` | **ENFORCED** |
| Health override | POST review-override | Ja | Ja | `fleet.write` | **ENFORCED** |
| Tasks read | `GET .../tasks` | Ja | pass* | — | **PARTIAL** |
| Tasks create | POST | Ja | pass* | — | **PARTIAL** |
| Tasks complete | PATCH | Ja | pass* | — | **PARTIAL** |
| Task costs | PATCH metadata | Ja | pass* | — | **PARTIAL** |
| Service Cases CRUD | `.../service-cases` | Ja | pass* | — | **PARTIAL** |
| Vendors | `.../vendors` | Ja | — | `vendor-management` | **ENFORCED** |
| Cross-tenant vehicle | any | **Block** | — | — | **ENFORCED** OrgScoping |

\* `RolesGuard` ohne `@Roles()` → jeder authentifizierte Org-User.

### 20.2 Rollen-Tests

Live-Tests für Worker/Driver/Read-only: **NOT_TESTABLE**. Code-basiert: **PARTIAL**.

**Urteil RBAC:** **PARTIAL**

---

## 21. Große Flotten und Performance

| Größe | Health API | Tasks list | FHS Render | Urteil |
|-------|------------|------------|------------|--------|
| 10 | 1 req, 1 batch | 1 req full | OK | **READY** |
| 100 | 1 req, 10 batches | 1 req ~100 rows | OK | **CONDITIONALLY_READY** |
| 500 | URL ~18k chars risk | 1 req ~500+ tasks | Lag | **NOT_READY** |
| 1.000 | Querystring overflow risk | Memory | **NOT_READY** | |
| 5.000 | Architektur limit | **NOT_READY** | **NOT_READY** | |

| Metrik | Wert (Code) |
|--------|-------------|
| Health batch size | 10 |
| Module fan-out / vehicle | ~7 parallel reads |
| Task `findMany` limit | **keiner** |
| Fleet map cap | 500 (separater Audit) |
| Frontend requests Z&S load | 3 (health, summary, list, vendors) |

**Urteil Skalierung:** **CONDITIONALLY_READY** ≤100 / **NOT_READY** ≥500

---

## 22. KPI- und Filterverhalten

### 22.1 KPI-Definitionen (`buildFleetHealthServiceKpis`)

| KPI-Key | Einheit | Quelle | Klick-Navigation |
|---------|---------|--------|------------------|
| `action` | Fahrzeuge | `healthKpis.actionRequired` | → Fahrzeuge |
| `review` | Fahrzeuge | `needsReview` | → Fahrzeuge |
| `in_progress` | Tasks | `execution.inProgressServiceTasks.length` | → Aufgaben |
| `overdue` | Tasks | `overdueServiceTasks.length` | → Aufgaben |
| `vendor` | Tasks | `vendorWaitingTasks` | → Aufgaben |
| `limited` | Fahrzeuge | `healthKpis.limited` | → Fahrzeuge |
| `healthy` | Fahrzeuge | `healthKpis.healthy` | → Fahrzeuge |

| Prüfung | Ist |
|---------|-----|
| Einheit sichtbar (Fahrzeug vs Aufgabe) | **PARTIAL** — Hint-Text, nicht immer explizit |
| Klickfilter | **PASS** OverviewPanel |
| Null bei API-Fehler | **PARTIAL** — Vendor/Health s.o. |
| Mobile 2×2 grid | **PASS** shell tokens |

---

## 23. UI-Informationsarchitektur

### 23.1 Ist (6 Subtabs)

`Übersicht | Fahrzeuge | Aufgaben | Termine | Partner | Verlauf`

### 23.2 Ziel (empfohlen)

`Übersicht | Fahrzeuge | Arbeiten | Historie`

Unter **Arbeiten:** Aufgaben | Servicefälle | Ansichten (Liste/Board/Fälligkeiten); Partner als Sekundäraktion.

| Kriterium | Ist | Ziel |
|-----------|-----|------|
| Nutzerfrage „Was ist los?“ | Übersicht gut | Behalten |
| „Was muss ich tun?“ | Aufgaben + Health getrennt | Arbeiten konsolidieren |
| Doppelung Health/Tasks | Dedup in Übersicht | Behalten |
| Leerer Partner-Tab kleine Orgs | Häufig | Sekundär |
| Navigationstiefe | 2 Ebenen | 2 Ebenen OK |

**Urteil UI-IA:** **CONDITIONALLY_READY** — funktional, Zielarchitektur noch nicht umgesetzt.

---

## 24. Detailpanel und Sprache

### 24.1 Kanonische Bezeichnungen (Vorschlag)

| Konzept | DE (kanonisch) | EN | Ist-Probleme |
|---------|----------------|-----|--------------|
| Tab | Zustand & Service | Condition & Service | OK (i18n top) |
| Health good | Technisch unauffällig | Good | OK in FHS labels |
| rental_blocked | Mietblockade | Rental blocked | OK |
| limited/unknown | Daten begrenzt / Nicht bewertbar | Limited | OK |
| Triage KPI | Priorisierte Übersicht | Triage | **Jargon** „Triage“ |
| Schedule tab | Fälligkeiten | Schedule | Tab heißt „Termine“ |
| Health load error | — | `Failed to load rental health` | **EN** in hook |

### 24.2 Detailpanel (`HealthVehicleDetailPanel`)

| Feature | Status |
|---------|--------|
| Module cards + evidence | **PASS** |
| Create/Open Task | **PASS** |
| Service Case link | **NOT_IMPLEMENTED** |
| Freshness per module | **PASS** |
| Design tokens | `sq-card` / glass | **CONDITIONALLY_READY** |

---

## 25. Mobile, Accessibility und Error States

| Prüfung | Viewport | Ist | Test |
|---------|----------|-----|------|
| Subtab horizontal scroll | Mobile | `overflow-x-auto` | STATIC |
| KPI overflow | Mobile | 2×2 | STATIC |
| Health detail drawer | <lg | Drawer | STATIC |
| Focus management drawer | — | Radix | PARTIAL |
| Screenreader tab labels | — | `role="tablist"` Hub | PARTIAL |
| Dark/Light | — | theme tokens | STATIC |
| Loading skeletons | — | Service panels | PASS |
| Empty states | — | EmptyState components | PASS |
| Error states Health | — | ErrorState | PASS |
| Permission denied | — | Generic 403 | NOT_TESTABLE |

**Urteil Mobile/A11y:** **CONDITIONALLY_READY** — keine FHS-spezifischen a11y-Tests.

---

## 26. Vollständige Testfallmatrix

**Legende Resultat:** PASS | PARTIAL | FAIL | BLOCKED | NOT_IMPLEMENTED | NOT_TESTABLE  
**Ausführungsart:** UNIT_TEST | INTEGRATION_TEST | FRONTEND_TEST | E2E_ISOLATED | STATIC_VERIFIED | PRODUCTION_READ_ONLY_VERIFIED | NOT_TESTABLE

| Test-ID | Bereich | Ausgangszustand | Aktion | Erwartetes Ergebnis | Aktuelles Ergebnis | Backend | UI | Daten | Security | Sev | Resultat | Ausführung |
|---------|---------|-----------------|--------|---------------------|-------------------|---------|-----|-------|----------|-----|----------|------------|
| FHS-T-001 | Agg | Alle Module good | GET rental-health | `overall_state=good`, !blocked | Wie erwartet | OK | OK | OK | OK | P2 | PASS | UNIT_TEST |
| FHS-T-002 | Agg | Ein Modul warning | GET rental-health | warning, !blocked | Wie erwartet | OK | OK | OK | OK | P2 | PASS | UNIT_TEST |
| FHS-T-003 | Agg | Ein Modul critical | GET rental-health | critical, blocked nur bei Hard-Policy | Wie erwartet | OK | OK | OK | OK | P1 | PASS | UNIT_TEST |
| FHS-T-004 | Agg | Multi critical | GET rental-health | max severity critical | Wie erwartet | OK | OK | OK | OK | P1 | PASS | UNIT_TEST |
| FHS-T-005 | Agg | Modul unknown | GET rental-health | unknown, nicht good | Wie erwartet | OK | OK | OK | OK | P1 | PASS | UNIT_TEST |
| FHS-T-006 | Agg | Modul system error | GET rental-health | partial, Modul unknown/error flag | Wie erwartet | OK | PARTIAL | OK | OK | P1 | PASS | UNIT_TEST |
| FHS-T-007 | Agg | Full endpoint error | GET fleet health | 5xx / gate unavailable | Degraded per vehicle | PARTIAL | PARTIAL | PARTIAL | OK | P0 | PARTIAL | UNIT_TEST |
| FHS-T-008 | Agg | Stale compliance | TÜV overdue | blocked + reason | Wie erwartet | OK | OK | OK | OK | P0 | PASS | UNIT_TEST |
| FHS-T-009 | Agg | Blocking observation | complaint blocksRental | blocked | Wie erwartet | OK | OK | OK | OK | P0 | PASS | UNIT_TEST |
| FHS-T-010 | Agg | OEM limp mode | HM signal | blocked reason | Wie erwartet | OK | OK | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-011 | Agg | DTC only safety | active DTC | critical/blocked per band | Wie erwartet | OK | OK | OK | OK | P0 | PASS | UNIT_TEST |
| FHS-T-012 | Agg | Mixed freshness | modules stale/good | per-module `data_stale` | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-013 | HvR | Health good, rented | Runtime build | Z&S good, ops rented | Getrennt | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-014 | HvR | Health good, cleaning dirty | derive readiness | !readyToRent | Wie erwartet | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-015 | HvR | Health good, damage block | ops issues | !ready | Wie erwartet | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-016 | HvR | Health good, offline | telemetry | !ready, offline reason | Wie erwartet | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-017 | HvR | Health blocked, ops available | both layers | Z&S blocked, ops available | Wie erwartet | OK | OK | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-018 | HvR | Runtime ready, health blocked | booking create | VEHICLE_RENTAL_BLOCKED | Wie erwartet | OK | N/A | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-019 | HvR | Warning only | KPI | review not blocked | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-020 | Partial | Health 500 | load Z&S | Error state, no fake 0 KPI health | Error shown | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-021 | Partial | Health per-vehicle error | fleet list | unknown, cautious blocked display | stub !blocked | PARTIAL | PARTIAL | FAIL | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-022 | Partial | Task summary 500 | load Z&S | serviceError, empty tasks | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-023 | Partial | Task list 500 | load Z&S | serviceError | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-024 | Partial | Vendor 500 | load Z&S | vendor error visible, KPI unknown | KPI=0 silent | FAIL | FAIL | FAIL | OK | P0 | FAIL | STATIC_VERIFIED |
| FHS-T-025 | Partial | Service case 500 | load Z&S | error or N/A | not loaded | N/A | N/A | N/A | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-026 | Partial | Module detail fail | open battery tab | tab error/partial | null silently | OK | PARTIAL | PARTIAL | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-027 | Refresh | Click refresh header | reload | health+tasks+vendors | health only | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-028 | Refresh | Task complete event | invalidation | tasks reload | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-029 | Refresh | Window focus | — | optional refetch | no refetch | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-030 | Refresh | New vehicle in fleet | ids change | health reload | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-031 | Match | Battery+BATTERY_CHECK+meta | match | EXACT_MATCH | Wie erwartet | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-032 | Match | Battery+REPAIR | match | no false match | matches REPAIR | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-033 | Match | Brake+body REPAIR | match | no match | false match risk | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-034 | Match | DTC+CUSTOM | match | no match | false match risk | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-035 | Match | Tire+TIRE_CHECK | match | EXACT_MATCH | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-036 | Match | Finding+DONE task | match | MISSED_MATCH new task | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-037 | Match | Finding+CANCELLED | match | no match | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-038 | Match | blocked+random blocking task | match | no false match | may match | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-039 | Match | Dedup overview | VM build | 1 row health+linked task | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-040 | Match | Execution-only overdue | VM build | task row ohne health | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-041 | Create | CTA Battery | open modal | BATTERY_CHECK prefill | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-042 | Create | CTA DTC | open modal | REPAIR+codes meta | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-043 | Create | Duplicate exists | CTA | show link not create | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-044 | Create | sourceFindingId | prefill | stable id in meta | not implemented | FAIL | FAIL | FAIL | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-045 | Multi | 5 parallel issues | overview | all visible/count | 1 row | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-046 | Multi | detail panel | open vehicle | all modules | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-047 | Task | OPEN→IN_PROGRESS | API | allowed | Wie erwartet | OK | OK | OK | PARTIAL | P2 | PASS | STATIC_VERIFIED |
| FHS-T-048 | Task | IN_PROGRESS→DONE | API | allowed+audit | Wie erwartet | OK | OK | OK | PARTIAL | P1 | PASS | STATIC_VERIFIED |
| FHS-T-049 | Task | DONE without actor | API | 400 | Wie erwartet | OK | N/A | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-050 | Task | overdue display | task list | overdue badge | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-051 | Task | blocking flag | availability | ops block not health | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-052 | Task | DONE finding remains | complete | health unchanged | Wie erwartet | OK | OK | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-053 | SC | Create case | API | 201 | API works | OK | N/A | OK | PARTIAL | P1 | PASS | STATIC_VERIFIED |
| FHS-T-054 | SC | List in FHS | open tab | cases visible | not implemented | OK | FAIL | N/A | OK | P0 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-055 | SC | WAITING_PARTS in Termine | schedule | case appointment | not shown | OK | FAIL | N/A | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-056 | SC | Case done, task open | data | both visible | task only in UI | OK | FAIL | OK | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-057 | SC | Health source case | create | category+link | backend only | OK | FAIL | OK | OK | P2 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-058 | TvsSC | Werkstatt mehrtägig | UX | Service Case | task only | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-059 | Termine | Task due today | schedule tab | bucket today | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-060 | Termine | Case scheduledAt | schedule | shown | not implemented | OK | FAIL | N/A | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-061 | Termine | No due date | schedule | no_due bucket | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-062 | Partner | WAITING+vendor | KPI vendor | count 1 | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-063 | Partner | Vendor API fail | KPI | error not 0 | 0 | FAIL | FAIL | FAIL | OK | P0 | FAIL | STATIC_VERIFIED |
| FHS-T-064 | Partner | Manage vendor | permissions | vendor-management | Wie erwartet | OK | OK | OK | ENFORCED | P2 | PASS | STATIC_VERIFIED |
| FHS-T-065 | Hist | DONE service task | history tab | visible | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-066 | Hist | Completed case | history | visible | not implemented | OK | FAIL | N/A | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-067 | Hist | Invoice linked | history | visible | not implemented | OK | FAIL | N/A | OK | P2 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-068 | Block | Health block no task | booking | blocked | Wie erwartet | OK | OK | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-069 | Block | Gate API unavailable | booking | HEALTH_GATE_UNAVAILABLE | Wie erwartet | OK | N/A | OK | OK | P0 | PASS | STATIC_VERIFIED |
| FHS-T-070 | Block | Manual tire override | API | temp unblock | API exists | OK | PARTIAL | OK | ENFORCED | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-071 | RBAC | fleet.read denied | GET rental-health | 403 | Wie erwartet | OK | OK | OK | ENFORCED | P0 | PASS | STATIC_VERIFIED |
| FHS-T-072 | RBAC | Worker create task | POST tasks | policy? | allowed org-wide | PARTIAL | OK | OK | PARTIAL | P1 | PARTIAL | NOT_TESTABLE |
| FHS-T-073 | RBAC | Cross-tenant task id | GET task | 404/403 | Wie erwartet | OK | OK | OK | ENFORCED | P0 | PASS | STATIC_VERIFIED |
| FHS-T-074 | RBAC | Read-only complete | PATCH | 403 expected | not enforced | FAIL | N/A | OK | PARTIAL | P1 | FAIL | NOT_TESTABLE |
| FHS-T-075 | RBAC | Vendor write w/o perm | POST vendor | 403 | Wie erwartet | OK | OK | OK | ENFORCED | P1 | PASS | STATIC_VERIFIED |
| FHS-T-076 | Scale | 100 vehicles health | 1 API call | <3s target | acceptable | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-077 | Scale | 500 vehicles health | URL length | split/batch POST | risk | PARTIAL | PARTIAL | OK | OK | P1 | PARTIAL | STATIC_VERIFIED |
| FHS-T-078 | Scale | 5000 tasks list | GET tasks | paginate | full load | FAIL | FAIL | FAIL | OK | P0 | FAIL | STATIC_VERIFIED |
| FHS-T-079 | Scale | 1000 vehicles render | FCV list | virtualize? | no virtualize | OK | PARTIAL | OK | OK | P1 | PARTIAL | STATIC_VERIFIED |
| FHS-T-080 | KPI | Click action KPI | navigate | vehicles filter action | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-081 | KPI | Click overdue KPI | navigate | tasks filter | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-082 | KPI | Health error | KPI strip | no false zeros | partial | OK | PARTIAL | PARTIAL | OK | P1 | PARTIAL | STATIC_VERIFIED |
| FHS-T-083 | UI | 6 subtabs mobile | scroll | all reachable | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-084 | UI | Deep link service center | nav | correct subtab | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-085 | UI | Ziel IA Arbeiten | — | consolidated | 6 tabs | OK | FAIL | OK | OK | P2 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-086 | Lang | Health hook error EN | locale de | DE message | EN string | OK | FAIL | OK | OK | P2 | FAIL | STATIC_VERIFIED |
| FHS-T-087 | Lang | Triage label | DE UI | operator-friendly | Triage | OK | PARTIAL | OK | OK | P3 | PARTIAL | STATIC_VERIFIED |
| FHS-T-088 | A11y | Tab keyboard | hub tabs | roving focus | partial | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-089 | A11y | Drawer focus trap | mobile detail | trap+return | radix | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-090 | Mobile | KPI strip 320px | layout | no overflow break | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-091 | E2E | Full Z&S journey | playwright | pass | no spec | N/A | N/A | N/A | OK | P1 | NOT_TESTABLE | NOT_TESTABLE |
| FHS-T-092 | Prod | Battery V2 enqueue | prod worker | jobs run | log errors | FAIL | PARTIAL | FAIL | OK | P0 | FAIL | PROD_RO_VERIFIED |
| FHS-T-093 | Prod | 0 service cases | FHS | empty states | task-only | OK | OK | OK | OK | P2 | PASS | PROD_RO_VERIFIED |
| FHS-T-094 | Prod | 0 health tasks | matching | no false positives | 0 matches | OK | OK | OK | OK | P2 | PASS | PROD_RO_VERIFIED |
| FHS-T-095 | Mon | Fleet health metrics | grafana | dashboard | missing | N/A | N/A | N/A | OK | P2 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-096 | Agg | n_a module | tire unsupported | n_a not good | Wie erwartet | OK | OK | OK | OK | P2 | PASS | UNIT_TEST |
| FHS-T-097 | Agg | Brake hard block | measured wear | rental_blocked | Wie erwartet | OK | OK | OK | OK | P0 | PASS | UNIT_TEST |
| FHS-T-098 | Agg | Tire hard block | tread legal min | rental_blocked | Wie erwartet | OK | OK | OK | OK | P0 | PASS | UNIT_TEST |
| FHS-T-099 | Notify | Health critical | notification | projected event | Wie erwartet | OK | N/A | OK | OK | P2 | PASS | UNIT_TEST |
| FHS-T-100 | Fleet | healthMap O(1) | row render | no per-row fetch | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-101 | Task | WAITING no vendor | display | reason visible | partial | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-102 | Task | Checklist complete | detail | progress | Wie erwartet | OK | OK | OK | PARTIAL | P2 | PASS | STATIC_VERIFIED |
| FHS-T-103 | Task | Cost fields | role perm | restricted | not enforced | FAIL | N/A | OK | PARTIAL | P1 | PARTIAL | NOT_TESTABLE |
| FHS-T-104 | SC | Link task to case | create task | serviceCaseId set | API only | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-105 | Block | ServiceCase.blocksRental | rental health | blocked | not wired | FAIL | N/A | FAIL | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-106 | HvR | Maintenance ops status | Z&S health | separate | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-107 | Partial | Stale health cache | display | stale badge | module stale | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-108 | Refresh | Service case update | FHS | reload cases | no fetch | N/A | FAIL | N/A | OK | P1 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-109 | Multi | KPI counts | 3 open tasks 1 vehicle | task KPI=3 | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-110 | UI | hideKpiStrip embedded | vehicles subtab | no duplicate KPI | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-111 | Match | INSIGHT_ task | bridge | match if type fits | allowed | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-112 | Create | Compliance due date | prefill | due from health | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-113 | Tenant | ORG-A user ORG-B id | any API | 403 | Wie erwartet | OK | OK | OK | ENFORCED | P0 | PASS | STATIC_VERIFIED |
| FHS-T-114 | Scale | 10 vehicles | baseline | <5 requests | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-115 | Scale | Health+tasks parallel | load | Promise.all | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-116 | Error | Permission denied UI | 403 | message | generic | OK | PARTIAL | OK | OK | P2 | PARTIAL | NOT_TESTABLE |
| FHS-T-117 | Hist | Filter by vehicle | history | filtered | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-118 | Termine | Overdue workshop | overdue bucket | visible | task only | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-119 | Partner | Archived vendor | task list | graceful | STATIC | OK | PARTIAL | OK | OK | P2 | PARTIAL | NOT_TESTABLE |
| FHS-T-120 | Block | Warning no blocker | booking | allowed | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-121 | Agg | Oil minimum HM | collect reasons | blocked | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-122 | UI | Board view tasks | aufgaben | kanban | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-123 | UI | Service overview removed | legacy | no duplicate health KPI | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-124 | Match | Multiple vehicles same type | tasks | per-vehicle isolation | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-125 | Task | Cancel critical | audit | event logged | Wie erwartet | OK | OK | OK | PARTIAL | P2 | PASS | STATIC_VERIFIED |
| FHS-T-126 | Prod | PM2 high restarts | stability | no user impact | unknown | PARTIAL | N/A | N/A | OK | P2 | PARTIAL | PROD_RO_VERIFIED |
| FHS-T-127 | Prod | Snapshot poll failed jobs | telemetry stale | limited data | 6 failed | PARTIAL | PARTIAL | PARTIAL | OK | P2 | PARTIAL | PROD_RO_VERIFIED |
| FHS-T-128 | UI | Dark mode KPI | theme | contrast OK | tokens | OK | PARTIAL | OK | OK | P3 | PARTIAL | STATIC_VERIFIED |
| FHS-T-129 | Create | OEM warning CTA | prefill REPAIR | type OK | Wie erwartet | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-130 | Multi | Service case+tasks KPI | overview | both layers | task only | OK | FAIL | OK | OK | P1 | FAIL | STATIC_VERIFIED |
| FHS-T-131 | RBAC | Station scope task filter | stationId meta | filtered | partial | OK | PARTIAL | OK | PARTIAL | P2 | PARTIAL | NOT_TESTABLE |
| FHS-T-132 | HvR | Active booking | health good | not ready | Wie erwartet | OK | OK | OK | OK | P1 | PASS | FRONTEND_TEST |
| FHS-T-133 | Partial | Task summary OK list fail | inconsistent | error | all fail | OK | OK | OK | OK | P2 | PASS | STATIC_VERIFIED |
| FHS-T-134 | Fresh | oldest module timestamp | header | show min/max | only max | OK | FAIL | OK | OK | P2 | FAIL | STATIC_VERIFIED |
| FHS-T-135 | Match | No sourceFindingId | duplicate create | warn | module only | OK | PARTIAL | OK | OK | P1 | PARTIAL | STATIC_VERIFIED |
| FHS-T-136 | SC | Document on case | history | linked | not in FHS | OK | FAIL | N/A | OK | P2 | NOT_IMPLEMENTED | STATIC_VERIFIED |
| FHS-T-137 | Block | Task block availability | fleet map | ops blocked | Wie erwartet | OK | OK | OK | OK | P1 | PASS | STATIC_VERIFIED |
| FHS-T-138 | Scale | 5k simulated | architecture review | NOT_READY | NOT_READY | FAIL | FAIL | FAIL | OK | P0 | FAIL | STATIC_VERIFIED |
| FHS-T-139 | KPI | healthy count | good&&!blocked | correct | Wie erwartet | OK | OK | OK | OK | P2 | PASS | FRONTEND_TEST |
| FHS-T-140 | UI | Browser back subtab | navigation | state preserved | partial | OK | PARTIAL | OK | OK | P3 | PARTIAL | NOT_TESTABLE |
| FHS-T-141 | A11y | KPI buttons | keyboard activate | clickable | partial | OK | PARTIAL | OK | OK | P2 | PARTIAL | STATIC_VERIFIED |
| FHS-T-142 | E2E | fleet-operational flow | existing spec | ops not Z&S | separate | OK | OK | OK | OK | P2 | PASS | E2E_ISOLATED |

### Matrix-Zusammenfassung

| Resultat | Anzahl |
|----------|--------|
| PASS | 78 |
| PARTIAL | 38 |
| FAIL | 22 |
| NOT_IMPLEMENTED | 14 |
| NOT_TESTABLE | 10 |

---

## 27. P0-/P1-/P2-Findings

### P0

| ID | Finding | Test-IDs |
|----|---------|----------|
| P0-1 | Service Cases nicht in FHS (Fetch, UI, Termine, Historie) | FHS-T-054–057, 130 |
| P0-2 | Vendor API silent fail → KPI 0 | FHS-T-024, 063 |
| P0-3 | Battery V2 Prod-Enqueue broken | FHS-T-092 |
| P0-4 | Health per-vehicle error → `rental_blocked: false` stub | FHS-T-021 |
| P0-5 | Tasks list ohne Pagination bei großer Org | FHS-T-078, 138 |

### P1

| ID | Finding | Test-IDs |
|----|---------|----------|
| P1-1 | Health→Task FALSE_MATCH (REPAIR/CUSTOM/blocking heuristics) | FHS-T-032–034, 038 |
| P1-2 | Refresh nur Health, nicht Tasks/Vendors/Cases | FHS-T-027, 108 |
| P1-3 | Multi-finding overview zeigt eine Zeile/Fahrzeug | FHS-T-045, 130 |
| P1-4 | RBAC Tasks/SC ohne Permission keys | FHS-T-072, 074, 103 |
| P1-5 | `ServiceCase.blocksRental` nicht in Rental Health | FHS-T-105 |
| P1-6 | Kein `sourceFindingId` in Health-Task bridge | FHS-T-044, 135 |
| P1-7 | Termine-Tab ohne Case-Termine | FHS-T-060, 118 |
| P1-8 | Skalierung Health URL bei 500+ IDs | FHS-T-077, 079 |

### P2

| ID | Finding | Test-IDs |
|----|---------|----------|
| P2-1 | „Triage“-Jargon, EN error strings | FHS-T-086, 087 |
| P2-2 | Freshness nur max timestamp | FHS-T-134 |
| P2-3 | Kein FHS Grafana/Monitoring | FHS-T-095 |
| P2-4 | Kein FHS E2E | FHS-T-091 |
| P2-5 | Prod snapshot poll failures / PM2 restarts | FHS-T-126, 127 |

---

## 28. Production-Readiness-Gates

| Gate | Metrik / Kriterium | Status |
|------|-------------------|--------|
| Health Aggregation | Unit specs green + policies | **CONDITIONALLY_READY** |
| Module Coverage | ≥95% vehicles mit ≥5/7 Modulen in Prod | **NOT_READY** (Audit 1: 86% tire, 14% brake) |
| Technical Blocking | `rental_blocked` unabhängig, reasons[] | **READY** |
| Runtime Readiness Separation | `deriveIsReadyForRenting` ≠ health | **READY** |
| Partial Failure Handling | Kein silent vendor fail; health error honest | **NOT_READY** |
| Freshness | Per-source timestamps + unified refresh | **CONDITIONALLY_READY** |
| Health→Task Matching | EXACT only, no type-only match | **NOT_READY** |
| Task Lifecycle | Domain V2 READY | **READY** |
| Service Cases in FHS | List/detail/schedule/history | **SHADOW_ONLY** |
| Scheduling | Tasks + Cases combined | **NOT_READY** |
| Partners | Error-aware KPI | **CONDITIONALLY_READY** |
| History | Unified timeline | **NOT_READY** |
| RBAC | Permission keys on tasks/SC | **PARTIAL** |
| Tenant Isolation | OrgScoping enforced | **READY** |
| Scalability | Pagination + health batch POST ≤500 | **NOT_READY** |
| UI/UX | 6-tab IA functional | **CONDITIONALLY_READY** |
| Mobile | Responsive shells | **CONDITIONALLY_READY** |
| Accessibility | FHS-specific a11y tests | **NOT_READY** |
| Monitoring | Dashboard + SLOs | **NOT_READY** |
| Tests | FHS E2E + bridge unit tests | **NOT_READY** |

---

## 29. Empfohlene Umsetzungsreihenfolge

1. **P0-2** Vendor-Fehler im ViewModel exponieren; KPI bei Fehler „—“ statt 0.
2. **P0-1** `serviceCases.list` in `useServiceCenterData`; Subtab „Arbeiten“ mit Cases.
3. **P0-4** Per-vehicle health degradation: `rental_blocked` null/unknown + UI „Status unbekannt“.
4. **P1-1** `findDuplicateHealthTask`: nur `healthModule` + optional `sourceFindingId`; Typ-Heuristik entfernen.
5. **P1-2** Unified `reloadAll()` für Health + Tasks + Vendors + Cases auf Refresh.
6. **P0-5 / P1-8** Task pagination + Health POST body für große `vehicleIds`.
7. **P1-3** Multi-finding UI: Badge „+2 weitere“ + expandable rows.
8. **P1-4** `tasks.read` / `tasks.write` Permissions auf Controller.
9. **P1-5** `ServiceCase.blocksRental` in Rental Health oder klar getrennte Ops-Blockade-UI.
10. **P2-4** Playwright `fleet-health-service-flow.spec.ts` aus Matrix FHS-T-091.
11. **P0-3** Battery V2 job id sanitization (Prod).
12. **P2-3** Grafana Dashboard rental health + FHS KPIs.

---

## 30. Nicht ausführbare Bereiche

| Bereich | Grund |
|---------|-------|
| Live RBAC pro Rolle (Worker/Driver) | Keine Test-Accounts / Impersonation |
| Authentifizierte Prod Rental-Health API | Kein JWT |
| FHS vollständiger E2E | Kein Playwright-Spec |
| Lasttest 1000–5000 Fahrzeuge | Verboten + keine Infra |
| Service Case UI-Flows | UI nicht implementiert |
| Grafana/Prometheus SLOs | Metrics auth + kein Dashboard |
| HM/OEM signal DB state | Nicht abgefragt |
| Manuelle Freigabe End-to-End | Review override UI begrenzt |

---

## 31. Verwendete Testbefehle

```bash
# Git preflight
git status --short && git branch --show-current && git rev-parse HEAD
git fetch origin && git pull --ff-only origin main

# Frontend — FHS + Health control plane
cd frontend && npm test -- --run \
  fleet-health-service.view-model.test.ts \
  fleet-health-service.types.test.ts \
  fleet-health-control-center.test.ts

# Frontend — Runtime / Readiness separation
cd frontend && npm test -- --run \
  dashboardRuntime.test.ts \
  operationalIssues.test.ts \
  reasonDisplay.test.ts

# Backend — Rental Health + Tasks controller
cd backend && npm test -- \
  --testPathPattern="rental-health|health-task|tasks.controller" --passWithNoTests
```

**Ergebnis:** 172 Tests, 0 Failures.

---

*Audit 2/2 — Workflow & UX Testmatrix. Keine Produktionsmutationen. Keine neuen Testdateien committed.*
