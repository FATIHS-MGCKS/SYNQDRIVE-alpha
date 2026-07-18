# Fleet Tab „Zustand & Service“ — Production Reality Audit (1/2)

| Feld | Wert |
|------|------|
| **Audit-Typ** | Read-only Production-Reality-Audit (Audit 1 von 2) |
| **Audit-Zeitpunkt (UTC)** | 2026-07-18T08:50–09:00 |
| **Repository-Baseline-Commit** | `ffcb3e0cdbcfbba903739d7ca4ed3ff1be7c48b4` (`main`) |
| **Deployter VPS-Commit** | `ac856881300f9f44f0f5e2eb12a117145f76d70c` |
| **Release-Pfad VPS** | `/opt/synqdrive/releases/20260718004214_v4994` |
| **Abweichung Repo ↔ Deployment** | **3 Commits** auf lokalem `main` ahead of deployed (`docs(voice)`, weitere) — **CODE_VERIFIED** |
| **Produktions-URL** | `https://app.synqdrive.eu` |
| **Analysierte Fahrzeuge (gesamt)** | **7** (**PRODUCTION_DATA_VERIFIED**) |
| **Organisationen mit Fahrzeugen** | **2** (**PRODUCTION_DATA_VERIFIED**) |

---

## 1. Executive Summary

Der Fleet-Tab **„Zustand & Service“** ist architektonisch korrekt als **Zwei-Schichten-Modell** aufgebaut: **Rental Health V1** liefert diagnostische Wahrheit und Mietblockade; **Tasks/Vendors** liefern operative Abarbeitung. Die UI trennt Health- und Service-KPIs in Übersicht und Fahrzeuge sauber und vermeidet eine zweite Health-Bewertung aus Tasks — **CODE_VERIFIED**.

**Produktionsrealität (kleine Flotte, 7 Fahrzeuge):** Health-Module sind **teilweise befüllt** (Reifen 6/7, Bremsen 1/7, Batterie-Publikationen 0/7). Es gibt **5 offene Tasks**, alle **nicht health-gebunden** (Dokument/Invoice-Automation). **0 Service Cases** in der Datenbank; das Backend ist vorhanden, die Fleet-UI ist **task-basiert** und bindet Service Cases **nicht** ein — **PRODUCTION_DATA_VERIFIED**, **CODE_VERIFIED**.

**Kritische Lücken für Production-Readiness:**

| Prio | Finding | Evidenz |
|------|---------|---------|
| **P0** | Service Cases vollständig fehlend in „Zustand & Service“-UI (kein Subtab, kein `useServiceCenterData`-Fetch) | **CODE_VERIFIED** |
| **P0** | Batterie-V2-Job-Enqueue schlägt in Produktion wiederholt fehl (`Custom Id cannot contain :`) → Battery-Modul in Rental Health potenziell unvollständig | **LOG_VERIFIED** |
| **P1** | Task-Liste ohne Pagination (`findMany` ohne `take`) — Fleet lädt alle Tasks pro Org | **CODE_VERIFIED** |
| **P1** | Rental-Health-Fleet-Fan-out: bis zu 7 Module × N Fahrzeuge, Batch 10 — bei 500+ Fahrzeugen P99-Risiko | **CODE_VERIFIED** |
| **P1** | Vendor-Fehler werden still zu `[]` — KPI „Wartet Partner“ kann 0 zeigen bei API-Ausfall | **CODE_VERIFIED** |
| **P1** | Tasks/Service-Cases-Controller: `OrgScopingGuard` + `RolesGuard`, **kein** `PermissionsGuard` / `fleet` / `tasks`-Permission | **CODE_VERIFIED** |
| **P2** | PM2-Prozess `synqdrive`: **787 Restarts** (aktuell 5h uptime) — Stabilitätsrisiko | **LOG_VERIFIED** |
| **P2** | Kein dediziertes Grafana-Dashboard für Fleet Health / Rental Health / Zustand & Service | **CODE_VERIFIED** |
| **P2** | Priorisierte Übersicht: max. **eine Health-Zeile pro Fahrzeug** — parallele Findings werden aggregiert | **CODE_VERIFIED** |

**Gesamturteil:** **CONDITIONALLY_READY** — für kleine Flotten mit aktivem Health-Backfill nutzbar; für vollständige „Zustand & Service“-Verdrahtung (Service Cases, Termine, Historie, Skalierung, Monitoring) sind Nacharbeiten erforderlich.

---

## 2. Auditzeitpunkt, Repository-Commit und deployter Commit

| Quelle | Commit / Stand |
|--------|----------------|
| Lokales Repo (`git rev-parse HEAD`) | `ffcb3e0cdbcfbba903739d7ca4ed3ff1be7c48b4` |
| VPS (`git -C /opt/synqdrive/current rev-parse HEAD`) | `ac856881300f9f44f0f5e2eb12a117145f76d70c` |
| VPS-Release | `20260718004214_v4994` |
| Health-Check öffentlich | `GET /api/v1/health` → **200** (**API_VERIFIED**) |

**Abweichung:** Deployment liegt **3 Commits** hinter lokalem `main`. Fleet-Health-Service-Code auf VPS entspricht dem Stand von `ac856881` (merge document-intake). Audit-Code-Referenzen beziehen sich auf Repository-Baseline `ffcb3e0`; funktionale Fleet-Health-Pfade sind zwischen den Commits nicht material verändert (**SAMPLE_INFERENCE** aus Commit-Messages).

---

## 3. Runtime-Topologie

### 3.1 PM2 / API

| Prozess | Status | Restarts | Uptime (Audit) | Rolle |
|---------|--------|----------|----------------|-------|
| `synqdrive` | online | **787** | ~5h | API + eingebettete Worker/Scheduler (NestJS monolith) |
| `pm2-logrotate` | online | 0 | lang | Log-Rotation |

**CODE_VERIFIED:** Worker laufen im selben Node-Prozess (`backend/dist/src/main.js`), nicht als separate PM2-Instanzen.

### 3.2 Health-relevante BullMQ-Queues (Redis DB 0)

| Queue | wait | active | failed | delayed | Scheduler |
|-------|------|--------|--------|---------|-----------|
| `dimo.dtc.poll` | 0 | 0 | 0 | 1 | repeat alle 3h (**CODE_VERIFIED**) |
| `dimo.tire.recalculation` | 0 | 0 | 0 | 0 | hourly (**CODE_VERIFIED**) |
| `dimo.brake.recalculation` | 0 | 0 | 0 | 0 | hourly (**CODE_VERIFIED**) |
| `battery.v2` | 0 | 0 | 0 | 0 | reconciliation/retention (**CODE_VERIFIED**) |
| `task.automation` | 0 | 0 | 0 | 0 | outbox-driven (**CODE_VERIFIED**) |
| `notification.evaluation` | 0 | 0 | 0 | 0 | org-scheduled (**CODE_VERIFIED**) |
| `dimo.snapshot.poll` | 0 | 0 | **6** | 0 | per-vehicle (**PRODUCTION_DATA_VERIFIED**) |

**Concurrency (Code):** tire/brake/battery-v2 = 2; task-automation = 4; notification = 2/4 (**CODE_VERIFIED**).

### 3.3 Prometheus / Grafana

| Artefakt | Status |
|----------|--------|
| `GET /api/v1/metrics` (localhost:3001) | **401 Unauthorized** ohne Auth (**API_VERIFIED**) |
| Grafana-Dashboards im Repo | `synqdrive-ops.json`, `synqdrive-battery-v2.json`, `synqdrive-driving-intelligence-v2.json`, `synqdrive-document-intake-v2.json` |
| Fleet-Health-/Rental-Health-Dashboard | **nicht vorhanden** (**CODE_VERIFIED**) |
| Metrik-Präfixe (Code) | `synqdrive_tire_*`, `synqdrive_brake_*`, `synqdrive_battery_*` — keine `synqdrive_rental_*` Fleet-Aggregat-Metrik (**CODE_VERIFIED**) |

### 3.4 Produktions-Logs (Auszug)

Wiederkehrende Fehler (**LOG_VERIFIED**):

```
[BatteryV2JobProducerService] Battery V2 enqueue failed ... Custom Id cannot contain :
[Scheduler] Error: Custom Id cannot contain :
```

Keine Rental-Health- oder Task-Domain-Fehler in den letzten 200 Error-Log-Zeilen zum Audit-Zeitpunkt (**LOG_VERIFIED**).

---

## 4. Architektur und Callsite-Inventur

### 4.1 Datenfluss (kanonisch)

```mermaid
flowchart TB
  subgraph Sources["Health-Quellen (Vehicle Intelligence)"]
    BAT[CanonicalBatteryHealthService]
    TIR[TireHealthService + HM Tire Pressure]
    BRK[BrakeHealthService]
    DTC[DtcService]
    SC[ServiceComplianceService]
    CMP[VehicleComplaint / Technical Observations]
    HM[HM AI Health Care Signals]
    DWL[Dashboard Warning Lights]
  end

  subgraph Agg["Aggregation (read-only)"]
    RH[RentalHealthService]
  end

  subgraph API["REST"]
    RHA["GET /organizations/:orgId/rental-health"]
    RHV["GET .../vehicles/:id/rental-health"]
    TSK["GET .../tasks, .../tasks/summary"]
    VND["GET .../vendors"]
    SCC["GET .../service-cases — nicht in FHS-UI"]
  end

  subgraph FE["Frontend Zustand & Service"]
    FC[FleetContext / useFleetHealthMap]
    VM[useFleetHealthServiceViewModel]
    FHS[FleetHealthServiceView + 6 Subtabs]
    FCV[FleetConditionView]
    HTB[health-task-bridge.utils]
  end

  BAT & TIR & BRK & DTC & SC & CMP & HM --> RH
  RH --> RHA & RHV
  RHA --> FC --> VM --> FHS
  TSK & VND --> useServiceCenterData --> VM
  HTB --> HealthServiceActions / ViewModel match
  FCV --> HealthVehicleDetailPanel
```

### 4.2 Health-Quellen (7 Module)

| Modul | Backend-Service | Writer | Rental-Health-Reader |
|-------|-----------------|--------|----------------------|
| Battery | `canonical-battery-health.service.ts` | `battery.v2` queue, snapshots | `RentalHealthService` (**CODE_VERIFIED**) |
| Tires | `tire-health.service.ts` | `dimo.tire.recalculation` | `RentalHealthService` + tire policy (**CODE_VERIFIED**) |
| Brakes | `brake-health.service.ts` | `dimo.brake.recalculation` | `RentalHealthService` + brake policy (**CODE_VERIFIED**) |
| DTC | `dtc.service.ts` | `dimo.dtc.poll` | `RentalHealthService` (**CODE_VERIFIED**) |
| Service/Compliance | `service-compliance.service.ts` | vehicle dates, service events | `RentalHealthService` (**CODE_VERIFIED**) |
| Complaints | `technical-observations.service.ts` | `VehicleComplaint` CRUD | `RentalHealthService` (**CODE_VERIFIED**) |
| OEM / Alerts | HM `getAiHealthCareSignals` + DWL | HM polling scheduler | Rental health (limp/oil); DWL für Detail-UI (**CODE_VERIFIED**) |

### 4.3 Aggregation, Status-Writer, Blocker

| Funktion | Ort | Verhalten |
|----------|-----|-----------|
| `overall_state` | `rental-health.types.ts` → `computeOverallState` | Max-Severity über Module; `unknown` ≠ `good` (**CODE_VERIFIED**) |
| `rental_blocked` | `collectBlockingReasons` → `blocking_reasons.length > 0` | **Unabhängig** von `overall_state` (**CODE_VERIFIED**) |
| Rental-Gate Buchung | `bookings.service.ts` → `enforceRentalHealthGate` | `VEHICLE_RENTAL_BLOCKED` / `VEHICLE_HEALTH_GATE_UNAVAILABLE` (**CODE_VERIFIED**) |
| Task-Blockade | `OrgTask.blocksVehicleAvailability` | Operativ, **nicht** in RentalHealthService (**CODE_VERIFIED**) |
| ServiceCase.blocksRental | Prisma `ServiceCase` | **Nicht** in RentalHealthService konsumiert (**CODE_VERIFIED**) |

### 4.4 Frontend Callsites (Zustand & Service)

| Komponente | Datenquelle | Zweite Bewertung? |
|------------|-------------|-------------------|
| `FleetHealthServiceKpiStrip` | `computeFleetHealthKpis` + execution KPIs | Nein (**CODE_VERIFIED**) |
| `FleetConditionView` | `healthMap` via `FleetContext` | Nein — `fleet-health-control-center.ts` (**CODE_VERIFIED**) |
| `FleetHealthServiceOverviewPanel` | ViewModel `prioritizedOverviewRows` | Dedup, keine Re-Score (**CODE_VERIFIED**) |
| `ServiceHistoryPanel` / `ServiceSchedulePanel` | `tasks` only | Explizit task-basiert (**CODE_VERIFIED**) |
| `HealthVehicleDetailPanel` | `useHealthVehicleDetailData` lazy per tab | Modul-APIs, partial `.catch` (**CODE_VERIFIED**) |

### 4.5 Refresh / Cache / Invalidierung

| Daten | Trigger | Intervall |
|-------|---------|-----------|
| Fleet Map (`useFleetMapStore`) | mount, 30s poll, operational invalidation | 30s (**CODE_VERIFIED**) |
| Rental Health (`useFleetHealthMap`) | mount, `vehicleIds` change, manual refresh, `fleetHealth` invalidation | **Kein** Auto-Poll (**CODE_VERIFIED**) |
| Tasks (`useServiceCenterData`) | mount, task mutation invalidation | Event-driven (**CODE_VERIFIED**) |
| Header „Aktualisieren“ | `FleetHubView` → `reloadHealth()` | Nur Subtabs `overview` / `vehicles` (**CODE_VERIFIED**) |
| Freshness-Label | `latestHealthGeneratedAt(healthMap)` | Neuester Modul-`last_updated_at` über Flotte (**CODE_VERIFIED**) |

### 4.6 Verwechslungsrisiken „technisch unauffällig“ vs. vermietungsbereit

| Stelle | Risiko | Bewertung |
|--------|--------|-----------|
| `healthSeverityBand` | `rental_blocked` → Band `blocked` getrennt von `good` | Korrekt (**CODE_VERIFIED**) |
| `vehicles.healthStatus` DB-Feld | Legacy `GOOD` für alle 7 Fahrzeuge — **nicht** Rental Health | Irreführend wenn direkt gelesen (**PRODUCTION_DATA_VERIFIED**) |
| Runtime `deriveIsReadyForRenting` | Kombiniert operational + cleaning + telemetry + `blockLevel` | Getrennte Schicht (**CODE_VERIFIED**) |
| Fleet „Status“-Tab vs. „Zustand & Service“ | Operational vs. Health | Navigation getrennt (**CODE_VERIFIED**) |
| KPI „Gesund“ in FHS | Nur `overall_state === good` && !blocked | Korrekt (**CODE_VERIFIED**) |

---

## 5. Produktionsfunnel 30/90 Tage

Zeitraum: `NOW() - 30/90 days` auf VPS-PostgreSQL (**PRODUCTION_DATA_VERIFIED**).

| Metrik | 30 Tage | 90 Tage | Anmerkung |
|--------|---------|---------|-----------|
| Aktive Fahrzeuge (gesamt) | 7 | 7 | Kein `deleted_at` auf `vehicles` |
| Fahrzeuge touched (created/updated) | 6 | 7 | |
| Mit Tire-Health-Snapshot | 6 | 6 | 86% Coverage |
| Mit Brake-Health-Current | 1 | 1 | 14% Coverage |
| Mit Battery-Publication | 0 | 0 | 0% Coverage |
| Mit VehicleLatestState | 6 | 6 | |
| Mit aktivem DTC-Event | 1 | 1 | |
| Offene Complaints | 0 | 0 | |
| Overdue TÜV/BOKraft (DB-Daten) | 0 | 0 | |
| Offene Tasks | 5 | 5 | |
| Überfällige offene Tasks | 0 | 0 | |
| IN_PROGRESS | 0 | 0 | |
| WAITING | 0 | 0 | |
| Blockierende Tasks | 0 | 0 | |
| Tasks erstellt | 37 | 37 | |
| Service Cases gesamt | 0 | 0 | |
| Vendors gesamt | 1 | 1 | |

### Statusverteilung Rental Health (`overall_state`)

**NOT_VERIFIABLE** per Live-API (kein JWT im Audit). Nest-Bootstrap von `RentalHealthModule` auf VPS scheiterte an DI (`ConfigService` in ObservabilityModule).

**SAMPLE_INFERENCE** aus Modul-Coverage + Policies:

| Zustand | Geschätzte Fahrzeuge | Begründung |
|---------|---------------------|------------|
| `good` | 4–6 | Keine Compliance-Overdues, keine blocking complaints |
| `warning` | 0–2 | Tire alerts: 2× warning, 2× info (**PRODUCTION_DATA_VERIFIED**) |
| `critical` | 0–1 | Abhängig von aktivem DTC-Severity |
| `unknown` | 1 | 1 Fahrzeug ohne Tire-Snapshot (**PRODUCTION_DATA_VERIFIED**) |
| `rental_blocked` | 0–? | Keine DB-Blocker; Hard-Block nur bei Policy-Triggern (**NOT_VERIFIABLE** ohne API) |

### Org-Aufschlüsselung (anonymisiert)

| Org-Kürzel | Fahrzeuge | Offene Tasks |
|------------|-----------|--------------|
| `org_faa7…` | 6 | 5 |
| `org_org-…` | 1 | 0 |

---

## 6. Health-Modulrealität

| Modul | Fahrzeuge mit Evidence | Alerts (offen) | Datenalter | Audit |
|-------|------------------------|----------------|------------|-------|
| **Tires** | 6/7 (86%) | 2 warning, 2 info | Alle 6 Snapshots `<7d` | **PRODUCTION_DATA_VERIFIED** |
| **Brakes** | 1/7 (14%) | 19 info | 1 `brake_health_current` row | **PRODUCTION_DATA_VERIFIED** |
| **Battery** | 0/7 (Publikationen) | — | Pipeline-Fehler in Logs | **LOG_VERIFIED**, **PRODUCTION_DATA_VERIFIED** |
| **DTC** | 1/7 aktiv | — | Poll-Queue healthy | **PRODUCTION_DATA_VERIFIED** |
| **Service/Compliance** | 7/7 (Fahrzeugdaten) | 0 overdue TÜV/BOKraft | Statische Felder | **PRODUCTION_DATA_VERIFIED** |
| **Complaints** | 0/7 offen | 0 blocking | — | **PRODUCTION_DATA_VERIFIED** |
| **OEM/Alerts** | HM-abhängig | — | **NOT_VERIFIABLE** ohne Signal-DB-Query | |

### Prüfpunkte Modul-Logik (**CODE_VERIFIED**)

| Prüfung | Ergebnis |
|---------|----------|
| `overall_state` aus Modulen abgeleitet | Ja — `computeOverallState` |
| `rental_blocked` unabhängig | Ja — eigene `collectBlockingReasons` |
| Warning blockiert nicht allein | Korrekt — nur Hard-Block-Policies (Tire/Brake/Battery/DTC safety) |
| Critical ≠ automatisch Maintenance | Korrekt — kein `isMaintenance` in Rental Health |
| Unknown → nicht `good` | Korrekt — Frontend `healthSeverityBand` → `limited` |
| Modulfehler verdrängt andere | Nein — `Promise.allSettled` pro Modul |
| Quellen/Zeitpunkte | `last_updated_at`, `data_stale` pro Modul im Contract |

---

## 7. Health versus Runtime Readiness

| Dimension | Rental Health | Runtime / Operational | Fleet Z&S UI |
|-----------|---------------|----------------------|--------------|
| Technische Diagnose | `overall_state`, Module | — | Fahrzeuge-Subtab (**CODE_VERIFIED**) |
| Mietblockade (technisch) | `rental_blocked` | — | Badge „Mietblockade“ (**CODE_VERIFIED**) |
| Buchungs-/Reinigungs-Readiness | Nicht enthalten | `deriveIsReadyForRenting` | Status-Tab, nicht Z&S (**CODE_VERIFIED**) |
| `vehicles.status` | Nicht verwendet | AVAILABLE 5, RENTED 2 | Fleet Map (**PRODUCTION_DATA_VERIFIED**) |
| `vehicles.healthStatus` | **Legacy** — alle GOOD | Irreführend | Rental Health überschreibt in UI (**PRODUCTION_DATA_VERIFIED**) |

**Produktions-Fälle (anonymisiert):**

| Fahrzeug-Kürzel | DB `healthStatus` | Tire Evidence | Vermutung |
|-----------------|-------------------|---------------|-----------|
| `…no-tire` | GOOD | fehlt | UI sollte `limited/unknown` zeigen, DB-Feld widerspricht |
| 6 weitere | GOOD | vorhanden | Konsistent mit möglichem `good`/`warning` |

**UI-Aussage-Bewertung:** Für Health/Mietblockade **korrekt bis vorsichtig**; Vermietungsbereitschaft im Sinne von „sofort vermietbar“ wird im Z&S-Tab **nicht** behauptet — nur `rental_blocked` (**CODE_VERIFIED**).

---

## 8. Fehler, Partial Data und Staleness

### 8.1 Source-State-Matrix (Frontend)

| Quelle | Error State | Silent Empty | Datei |
|--------|-------------|--------------|-------|
| Health (`healthMap`) | `healthError` + `ErrorState` in `FleetConditionView` | Nein bei Totalausfall | `useVehicleHealth.ts`, `FleetConditionView.tsx` |
| Tasks/Summary | `serviceError` Deutsch | Bei Totalausfall leere Arrays | `useServiceCenterData.ts` |
| Vendors | **Kein** separater Error | `.catch(() => [])` | `useServiceCenterData.ts` |
| Service Cases | Nicht geladen in FHS | N/A | — |
| Health Detail Tabs | pro Tab `null`/`[]` | `.catch(() => null/[])` | `useHealthVehicleDetailData.ts` |

### 8.2 Risiko: Nullwerte bei API-Fehler

| Szenario | UI-Anzeige | Risiko |
|----------|------------|--------|
| `tasks.summary` OK, `tasks.list` FAIL | Gesamter Service-Layer leer + Error | Mittel — Error sichtbar (**CODE_VERIFIED**) |
| `vendors.list` FAIL | `vendorWaitingTasks` = 0, Partner leer | **Hoch** — still (**CODE_VERIFIED**) |
| Einzelnes Health-Detail-Modul FAIL | Tab leer, kein globales Health-Fail | Akzeptabel (**CODE_VERIFIED**) |
| Fleet rental-health per-vehicle error | Stub `unknown`, `rental_blocked: false` | **Mittel** — könnte Blockade verbergen | `rental-health.controller.ts` (**CODE_VERIFIED**) |

### 8.3 Produktion

- Keine dokumentierten Health-API-Fehler im Error-Log zum Audit-Zeitpunkt (**LOG_VERIFIED**)
- 6 failed `dimo.snapshot.poll` Jobs (**PRODUCTION_DATA_VERIFIED**) → potenzielle Telemetry-Staleness
- Battery-V2-Enqueue-Fehler → Battery-Modul partial (**LOG_VERIFIED**)

---

## 9. Refresh-Realität

| Aktion | Aktualisiert Health? | Tasks? | Vendors? | Service Cases? |
|--------|---------------------|--------|----------|----------------|
| Tab öffnen Z&S | Ja (wenn vehicleIds gesetzt) | Ja | Ja | Nein |
| Header-Refresh-Button | Ja (overview/vehicles) | **Nein** | **Nein** | Nein |
| Task Create/Complete | Invalidation → Tasks | Ja | Nein | Nein |
| Window Focus Refetch | Nein | Nein | Nein | Nein |
| Fleet Map 30s Poll | Nein (nur Map) | Nein | Nein | Nein |
| Operational Invalidation Event | Ja (`fleetHealth` key) | Nein | Nein | Nein |

**Freshness-Semantik:** Header zeigt **neuesten** Modul-Zeitstempel in `healthMap`, nicht ältesten — ein frisches Fahrzeug kann die Flotte „frisch“ wirken lassen (**CODE_VERIFIED**).

---

## 10. Health-to-Task-Matching

### 10.1 Code-Pfad

1. `findDuplicateHealthTask` — `metadata.healthModule`, Task-Typ-Matrix (**CODE_VERIFIED**)
2. `matchOpenTaskForHealthSignal` — zusätzlich `blocksVehicleAvailability` + `sourceType === 'HEALTH'` bei `rental_blocked` (**CODE_VERIFIED**)
3. `HealthServiceActions` — lädt `api.tasks.forVehicle` + Vendor-Prefill (**CODE_VERIFIED**)

### 10.2 Produktionszahlen (**PRODUCTION_DATA_VERIFIED**)

| Metrik | Wert |
|--------|------|
| Tasks mit `healthModule` metadata (alle Status) | **0** |
| Offene HEALTH-`source_type` Tasks | **0** |
| Wahrscheinlich falsche Matches | **0** |
| Health-Findings ohne passende Arbeit | **NOT_VERIFIABLE** (ohne Live-Health-Payload) |
| Offene Tasks gesamt | **5** (Typen: `DOCUMENT_REVIEW`×2, `INVOICE_REQUIRED`×3) |
| Fahrzeuge mit >1 offenem Task | **1** |

### 10.3 False-Match-Risiken (Code, nicht in Prod beobachtet)

| Risiko | Mechanismus | Schwere |
|--------|-------------|---------|
| Bremsen-Finding → generischer `REPAIR` | `MODULE_TASK_TYPES.brakes` enthält `REPAIR` | P1 (**CODE_VERIFIED**) |
| DTC → beliebiger `CUSTOM`/`REPAIR` | Typ-Match ohne Code-Gleichheit | P1 (**CODE_VERIFIED**) |
| `rental_blocked` → irgendein blockierender Task | Heuristik in `matchOpenTaskForHealthSignal` | P2 (**CODE_VERIFIED**) |

---

## 11. Mehrere Vorgänge je Fahrzeug

**Priorisierte Übersicht (`buildPrioritizedOverviewRows`):**

- **Eine Health-Zeile pro Fahrzeug** mit `recommendedAction !== 'no_action'` (**CODE_VERIFIED**)
- Execution-Tasks nur wenn Fahrzeug nicht schon durch Health-Zeile „covered“ (**CODE_VERIFIED**)
- Parallele Health-Module am selben Fahrzeug → nur **primäres** Modul (`buildFleetHealthDisplay.primaryModuleKey`)

**Produktion:** 1 Fahrzeug mit 2+ offenen Tasks; Übersicht zeigt max. 1 Task-Zeile wenn Health nicht covered (**SAMPLE_INFERENCE**).

**Anonymisiertes Beispiel:** Fahrzeug `…faa7` könnte gleichzeitig `INVOICE_REQUIRED`-Task und Tire-Warning haben — UI zeigt entweder Health- oder Task-Zeile, nicht beides (**CODE_VERIFIED**).

---

## 12. Task-Domain

### 12.1 Produktions-Lifecycle (**PRODUCTION_DATA_VERIFIED**)

| Status | Anzahl |
|--------|--------|
| CANCELLED | 28 |
| OPEN | 5 |
| DONE | 4 |
| IN_PROGRESS | 0 |
| WAITING | 0 |

### 12.2 Integritätsprüfung

| Prüfung | Ergebnis |
|---------|----------|
| Offene Tasks ohne Fahrzeug | 0 |
| Offene Tasks ohne Assignee | **5** (100%) |
| Offene Tasks ohne Fälligkeit | 2 |
| WAITING ohne Vendor | 0 |
| Blockierende offene Tasks | 0 |
| Service-Case-Link | 0 (keine Cases) |

**Task-Domain-Audit (Repo):** Task Domain V2 als **READY** bewertet (`docs/audits/task-domain-v2-final-audit.md`) — **CODE_VERIFIED**. Z&S konsumiert `list` + `summary` ohne Pagination.

---

## 13. Service Cases

| Metrik | Produktion | UI Z&S |
|--------|------------|--------|
| Service Cases gesamt | **0** | Nicht angebunden |
| API vorhanden | `api.serviceCases.*` | Nur in `TasksNewTaskDialog` / `TasksView` Lookup (**CODE_VERIFIED**) |
| `useServiceCenterData` | — | **Kein** `serviceCases.list` (**CODE_VERIFIED**) |
| `FLEET_HEALTH_SERVICE_CONTRACT.md` | — | Explizit: „Noch nicht verdrahtet“ (**CODE_VERIFIED**) |

**Urteil:** Tasks werden fälschlich als **einzige** operative Servicewahrheit im Tab genutzt; Service Cases sind **SHADOW_ONLY** (Backend ohne UI).

---

## 14. Termine und Fälligkeiten

| Datenquelle | Backend | API | UI „Termine“-Subtab |
|-------------|---------|-----|---------------------|
| `OrgTask.dueDate` | Ja | Ja | Ja — `ServiceSchedulePanel` (**CODE_VERIFIED**) |
| `ServiceCase.scheduledAt` | Ja | Ja | **Nein** |
| `ServiceCase.expectedReadyAt` | Ja | Ja | **Nein** |
| Partner-Terminbestätigung | Case-Felder | Ja | **Nein** |

**Fachliche Bewertung:** Subtab heißt „Termine“, zeigt faktisch **Fälligkeitsplan offener Tasks** — im UI-Text korrekt erklärt („kein separater Werkstatt-Kalender“) (**CODE_VERIFIED**).

---

## 15. Verlauf und Historie

**`ServiceHistoryPanel`:** Nur erledigte/stornierte **Tasks** bestimmter Typen; expliziter Hinweis: keine Service-Case-Historie (**CODE_VERIFIED**).

**Nicht im Verlauf (Backend vorhanden, UI fehlend):**

- Service Cases / Service Events
- Dokumente / Rechnungen als Timeline
- TÜV/BOKraft-Änderungen
- Reifen-/Bremsen-/Batterie-Service-Events
- Kilometerstände, Kosten-Aggregate
- Technische Beobachtungen (außer indirekt über Tasks)

---

## 16. RBAC und Permissions

### 16.1 Route-Matrix (Auszug)

| Endpoint | Org Guard | Roles Guard | Permissions Guard | Permission | Durchsetzung |
|----------|-----------|-------------|-------------------|------------|--------------|
| `GET .../rental-health` | Ja | Ja | Ja | `fleet.read` | **ENFORCED** |
| `POST .../tire|brake-rental-health/review-override` | Ja | Ja | Ja | `fleet.write` | **ENFORCED** |
| `GET/POST/PATCH .../tasks/*` | Ja | Ja* | **Nein** | — | **PARTIAL** |
| `GET/POST .../service-cases/*` | Ja | Ja* | **Nein** | — | **PARTIAL** |
| `GET/POST .../vendors/*` | Ja | — | Ja | `vendor-management` | **ENFORCED** |
| `GET .../vehicles/:id/*` (health detail) | — | Ja | — | VehicleOwnership | **ENFORCED** (org via JWT) |
| Task costs (complete/update) | Ja | Ja | **Nein** | — | **PARTIAL** |

\* `RolesGuard` ohne `@Roles()` → **pass-through** (keine Rolle erforderlich) (**CODE_VERIFIED**)

### 16.2 Rollen-Bewertung

| Rolle | Fleet Health lesen | Tasks mutieren | Service Cases | Vendor Admin |
|-------|-------------------|----------------|---------------|--------------|
| Master Admin | Ja (bypass) | Ja | Ja | Ja |
| Org Admin | Mit `fleet.read` | **Jede Org-Mitgliedschaft** | Ja | Mit Permission |
| Worker/Driver/Read-only | Permission-abhängig | **Nicht fein granular** | **PARTIAL** | Permission-abhängig |

**RBAC-Urteil gesamt:** **PARTIAL** — Rental Health gut; Task/Service-Case-Oberfläche verlässt sich auf Org-Scoping ohne `tasks`-Permission-Keys.

**Cross-Tenant:** `OrgScopingGuard` + Service-Validierung — **ENFORCED** (**CODE_VERIFIED**).

---

## 17. Performance und Skalierung

### 17.1 Backend

| Pfad | Verhalten | 10 | 100 | 500 | 1000 | 5000 |
|------|-----------|-----|-----|-----|------|------|
| `GET /rental-health?vehicleIds=` | 7 Module × N, Batch 10 | OK | ~10 Batches | ~50 Batches | Risiko P99 | **NOT_READY** |
| Querystring-Länge | UUID×N | OK | Grenzwert | Problematisch | Split nötig | **NOT_READY** |
| `GET /tasks` | Kein `take` | OK | Marginal | **Hoch** | **Hoch** | **NOT_READY** |
| `GET /service-cases` | Kein Pagination in Service | OK | OK | Marginal | Marginal | **CONDITIONALLY_READY** |
| Fleet Map | Hard cap 500 (separater Audit) | OK | OK | Cap | Cap | Cap |

### 17.2 Frontend Request-Fan-out

- 1× rental-health (alle IDs)
- 1× tasks.summary + 1× tasks.list (volle Liste)
- 1× vendors.list
- **Kein** service-cases call

**Skalierungsurteil:** **CONDITIONALLY_READY** bis ~100 Fahrzeuge; ab ~500 **NOT_READY** ohne Pagination/Caching.

---

## 18. API- und UI-Realität

### 18.1 Navigation (**CODE_VERIFIED**)

```
Fleet
├── Status
├── Zustand & Service
│   ├── Übersicht      (KPI + priorisierte Liste)
│   ├── Fahrzeuge      (FleetConditionView)
│   ├── Aufgaben
│   ├── Termine        (Task-Fälligkeiten)
│   ├── Partner
│   └── Verlauf
└── Konnektivität
```

- Deep-Link: `openServiceCenter(nav)` → `condition-service` + Subtab (**CODE_VERIFIED**)
- Legacy `health`/`service` Tabs → normalisiert (**CODE_VERIFIED**)
- Mobile: Health-Detail als Drawer; KPI 2×2 (**CODE_VERIFIED**)

### 18.2 UI-Qualität

| Aspekt | Status |
|--------|--------|
| Health/Service-Trennung | Gut (**CODE_VERIFIED**) |
| Deutsch in FHS-Kern | Ja; Top-Tabs i18n (**CODE_VERIFIED**) |
| „Triage“-Label in Übersicht | Vorhanden (Fachjargon) (**CODE_VERIFIED**) |
| Error States Health | Ja in Fahrzeuge (**CODE_VERIFIED**) |
| Error States Service Tasks | Ja (**CODE_VERIFIED**) |
| Glass/Design-Tokens | `fleet-health-service-shell`, `sq-card` (**CODE_VERIFIED**) |
| Service Cases sichtbar | **Nein** |

---

## 19. Testabdeckung

| Bereich | Status | Dateien |
|---------|--------|---------|
| Rental Health Aggregation | Vollständig (Unit) | `rental-health.service.spec.ts`, policies |
| Module Failure / Blocking | Teilweise | tire/brake policy specs |
| Runtime State vs Health | Teilweise | `dashboardRuntime.test.ts` |
| Health→Task Matching | Teilweise | `fleet-health-service.view-model.test.ts` |
| Task Lifecycle | Vollständig (Domain-Audit) | task-domain-v2-final-audit |
| Service Cases in FHS | **Nicht abgedeckt** | — |
| Permissions FHS | **Nicht abgedeckt** | — |
| Partial Failure (vendors) | **Nicht abgedeckt** | — |
| Refresh/Freshness | **Nicht abgedeckt** | — |
| Große Flotten | **Nicht abgedeckt** | — |
| FleetConditionView / FHS E2E | **Nicht abgedeckt** | — |
| UI Filter/Mobile FHS | **Nicht abgedeckt** | — |

---

## 20. P0-/P1-/P2-Findings

### P0

| ID | Finding | Evidenz |
|----|---------|---------|
| P0-1 | Service Cases nicht in Z&S verdrahtet — Lücke zwischen Backend und Audit-Ziel „vollständige Verdrahtung“ | CODE_VERIFIED |
| P0-2 | Battery-V2-Enqueue-Fehler in Produktion (`Custom Id cannot contain :`) — Battery-Health unzuverlässig | LOG_VERIFIED |

### P1

| ID | Finding | Evidenz |
|----|---------|---------|
| P1-1 | `tasks.list` ohne Pagination — Speicher/Latenz bei großen Orgs | CODE_VERIFIED |
| P1-2 | Rental-Health-Fleet-Fan-out skaliert linear mit Fahrzeugzahl × 7 Modulen | CODE_VERIFIED |
| P1-3 | Vendor-API-Fehler → leere Liste, KPI „Wartet Partner“ irreführend | CODE_VERIFIED |
| P1-4 | Tasks/Service-Cases ohne `PermissionsGuard` — nur Org-Scoping | CODE_VERIFIED |
| P1-5 | Per-vehicle Health-Fehler degradieren zu `rental_blocked: false` | CODE_VERIFIED |
| P1-6 | Health→Task-Match erlaubt zu breite Task-Typen (`REPAIR` für Brake/DTC) | CODE_VERIFIED |
| P1-7 | Legacy `vehicles.healthStatus` = GOOD für alle — widerspricht Modul-Coverage | PRODUCTION_DATA_VERIFIED |

### P2

| ID | Finding | Evidenz |
|----|---------|---------|
| P2-1 | PM2 787 Restarts — Stabilität unklar | LOG_VERIFIED |
| P2-2 | 6 failed `dimo.snapshot.poll` Jobs | PRODUCTION_DATA_VERIFIED |
| P2-3 | Kein Fleet-Health-Grafana-Dashboard | CODE_VERIFIED |
| P2-4 | Priorisierte Liste: eine Zeile/Fahrzeug — parallele Findings aggregiert | CODE_VERIFIED |
| P2-5 | Refresh-Button aktualisiert nicht Tasks/Vendors | CODE_VERIFIED |
| P2-6 | Brake-Coverage 1/7 in Produktion | PRODUCTION_DATA_VERIFIED |
| P2-7 | Englische Resttexte in Health-Hooks (`Failed to load rental health`) | CODE_VERIFIED |

---

## 21. Production-Readiness-Matrix

| Bereich | Status | Evidenz |
|---------|--------|---------|
| Rental Health Aggregation | **CONDITIONALLY_READY** | CODE_VERIFIED |
| Module Coverage | **CONDITIONALLY_READY** | PRODUCTION_DATA_VERIFIED |
| Health Data Quality | **CONDITIONALLY_READY** | PRODUCTION_DATA_VERIFIED |
| Technical Blocking | **READY** (Code) / **NOT_VERIFIABLE** (Live) | CODE_VERIFIED |
| Runtime-State-Abgrenzung | **READY** | CODE_VERIFIED |
| Partial Failure Handling | **CONDITIONALLY_READY** | CODE_VERIFIED |
| Freshness | **CONDITIONALLY_READY** | CODE_VERIFIED |
| Health→Task Matching | **CONDITIONALLY_READY** | CODE + PRODUCTION_DATA |
| Task Domain | **READY** | task-domain-v2 audit |
| Service Cases | **NOT_READY** (UI) / **SHADOW_ONLY** | CODE + PRODUCTION_DATA |
| Partners | **CONDITIONALLY_READY** | PRODUCTION_DATA (1 vendor) |
| Scheduling | **CONDITIONALLY_READY** (nur Tasks) | CODE_VERIFIED |
| History | **CONDITIONALLY_READY** (Task-only) | CODE_VERIFIED |
| RBAC | **PARTIAL** | CODE_VERIFIED |
| Tenant Isolation | **READY** | CODE_VERIFIED |
| API Scalability | **CONDITIONALLY_READY** (≤100) / **NOT_READY** (500+) | CODE_VERIFIED |
| UI/UX | **CONDITIONALLY_READY** | CODE_VERIFIED |
| Monitoring | **NOT_READY** | CODE + LOG_VERIFIED |
| Tests | **PARTIAL** | CODE_VERIFIED |

---

## 22. Empfohlene Umsetzungsreihenfolge

1. **P0-2** Battery-V2 Job-ID-Sanitisierung — Produktionsfehler beheben, Battery-Coverage wiederherstellen.
2. **P0-1** Service Cases in `useServiceCenterData` + dedizierter Subtab oder Integration in Aufgaben/Termine/Verlauf.
3. **P1-4** `PermissionsGuard` auf Tasks/Service-Cases (`tasks.read` / `tasks.write`).
4. **P1-1** Task-Listen-Pagination + Frontend-Anpassung in Z&S.
5. **P1-3** Vendor-Fehler als `vendorsError` im ViewModel, KPI als „unbekannt“ statt 0.
6. **P1-5** Per-vehicle Degradation: `rental_blocked` nicht default `false` bei Pipeline-Error.
7. **P1-6** Health-Task-Match enger (DTC-Code, Brake-spezifische Typen only).
8. **P2-3** Grafana-Dashboard: rental_block_total, module unknown/stale, fleet-health latency.
9. **P2-4** Mehrzeilen-Übersicht pro Fahrzeug bei multiplen unabhängigen Findings.
10. Audit 2: E2E + belastete Flotte + authentifizierte Live-API-Samples.

---

## 23. Verwendete read-only Queries und Befehle

### Git (lokal)

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin && git pull --ff-only origin main
```

### VPS

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
ssh root@srv1374778.hstgr.cloud 'git -C /opt/synqdrive/current rev-parse HEAD'
ssh root@srv1374778.hstgr.cloud 'pm2 jlist / pm2 describe synqdrive'
curl -sS https://app.synqdrive.eu/api/v1/health
curl -sS http://127.0.0.1:3001/api/v1/health
redis-cli -n 0 KEYS "bull:*"  # queue inspection
redis-cli LLEN bull:<queue>:wait  # per-queue counts
tail /root/.pm2/logs/synqdrive-error.log
```

### PostgreSQL (via Prisma `$queryRawUnsafe` auf VPS, read-only)

```sql
SELECT COUNT(*) FROM vehicles;
SELECT status, COUNT(*) FROM org_tasks GROUP BY status;
SELECT COUNT(*) FROM org_tasks WHERE status IN ('OPEN','IN_PROGRESS','WAITING');
SELECT COUNT(*) FROM org_tasks WHERE status IN ('OPEN','IN_PROGRESS','WAITING')
  AND due_date IS NOT NULL AND due_date < NOW();
SELECT COUNT(*) FROM service_cases;
SELECT COUNT(DISTINCT vehicle_id) FROM tire_health_snapshots;
SELECT COUNT(DISTINCT vehicle_id) FROM brake_health_current;
SELECT COUNT(DISTINCT vehicle_id) FROM battery_publications;
SELECT COUNT(*) FROM vehicle_complaints WHERE blocks_rental = true AND status IN ('ACTIVE','OPEN','IN_REVIEW','CONFIRMED','NEW');
SELECT COUNT(*) FROM org_tasks WHERE metadata::text LIKE '%healthModule%' OR source_type = 'HEALTH';
```

---

## 24. Fehlende Zugriffe und Unsicherheiten

| Zugriff | Grund | Auswirkung |
|---------|-------|------------|
| Authentifizierte `GET /rental-health` API-Calls | Kein JWT/Impersonation im Audit | `overall_state`-Verteilung, `rental_blocked` live **NOT_VERIFIABLE** |
| Nest `RentalHealthService` Bootstrap auf VPS | DI-Fehler ObservabilityModule | Keine serverseitige Health-Eval im Audit-Skript |
| Prometheus-Metriken | Endpoint 401 | Keine P50/P95 Latenz **NOT_VERIFIABLE** |
| Grafana Live | Nicht auf VPS inspiziert | Dashboard-Nutzung **NOT_VERIFIABLE** |
| HM/OEM-Signal-DB | Nicht abgefragt | vehicle_alerts-Modul **NOT_VERIFIABLE** |
| Rollen-Matrix Live-Tests | Keine Account-Impersonation | RBAC **PARTIAL** (nur Code) |
| 30/90-Tage Rental-Health-Historie | Keine Historien-Tabelle | Nur Punkt-in-Time + Task-Created-Counts |

---

## Audit-Kennzahlen (Abschluss)

| Kennzahl | Wert |
|----------|------|
| Analysierte Fahrzeuge | **7** |
| Health-Coverage (Tire Snapshots) | **6/7 (86%)** |
| Technisch blockierte Fahrzeuge (live) | **NOT_VERIFIABLE** (DB-Blocker: 0) |
| Partial-/Error-Fahrzeuge (Modul-Coverage) | **≥2** (1 ohne Tire, 0 Battery-Pubs, Battery-Log-Fehler) |
| Offene Tasks | **5** |
| Überfällige Tasks | **0** |
| Service Cases | **0** |
| Wahrscheinlich falsche Health-Task-Matches | **0** |
| Health-Findings ohne passende Arbeit | **NOT_VERIFIABLE** |
| RBAC-Urteil | **PARTIAL** |
| Refresh-/Freshness-Urteil | **CONDITIONALLY_READY** (Health manuell/event; Tasks bei Mutation; kein Focus-Refetch) |
| Skalierungsurteil | **CONDITIONALLY_READY** (kleine Flotte) / **NOT_READY** (500+) |
| **Gesamturteil** | **CONDITIONALLY_READY** |

---

*Audit 1/2 — Nur lesend. Keine produktiven Daten verändert. Keine PII (Kennzeichen, Namen, E-Mails) dokumentiert.*
