# Fleet: Zustand & Service — fachlicher Contract (Vorbereitung)

> **Status:** Audit + Vorbereitung — keine Navigation/Umbau in diesem Schritt.  
> **Ziel:** Health (Zustand) und Maintenance/Service später auf UI-Ebene zu einem Tab **„Zustand & Service“** zusammenführen, ohne die Datenwahrheiten zu vermischen.

---

## 1. Scope & Renderpfad (aktuell, V4.9.185)

| Ebene | Komponente | Rolle |
|-------|-----------|-------|
| App-Router | `App.tsx` (`currentView === 'fleet'`, `fleetTab`, `fleetHealthServiceSubTab`) | Hält Fleet-View + Top-Level-Tab + internen Subtab |
| Fleet Top-Tabs | `FleetHubView.tsx` | **`Status`** \| **`Zustand & Service`** (kein separater Health-/Maintenance-Top-Tab) |
| Tab **Zustand & Service** | `FleetHealthServiceView.tsx` | Interne Subtabs (sq-tab-bar) |
| Subtab **Übersicht** | `FleetHealthServiceOverviewPanel` | Triage-KPIs + priorisierte Liste (Health + Execution, dedupliziert) |
| Subtab **Fahrzeuge** | `FleetConditionView` (`uiLocale=de`, `hideKpiStrip`) | Health/Zustand — keine doppelte KPI-Leiste |
| Subtabs **Aufgaben / Termine / Verlauf** | `FleetHealthService*Panel` → Service-Panels | Nur operative Tasks/Termine/Historie |
| Subtab **Partner** | `VendorManagementView` | Vendor-Verzeichnis |

**Legacy (nicht mehr als Fleet Top-Level gerendert)**

- `ServiceCenterView` — Standalone-Shell; Fleet nutzt `FleetHealthServiceView`
- `ServiceOverviewPanel` — **ohne** Health-Signale (`healthMap`); nur operative Aufgaben

**Deep-Link / Cross-Navigation**

- `openServiceCenter(nav?)` in `App.tsx` → `fleetTab='condition-service'` + `fleetHealthServiceSubTab` aus Nav
- Legacy `health` / `service` Top-Level States werden via `normalizeFleetTab()` auf `condition-service` + Subtab gemappt
- `vendor-management` View → Fleet `condition-service` + Subtab `vendors`
- Health-Detail → Service: `onOpenServiceCenter` Callback-Kette (`FleetConditionView` → `HealthVehicleDetailPanel`)

**Nicht Teil des Fleet-Hub Health-Tabs**

- `HealthErrorsView.tsx` = Vehicle-Detail-Ansicht (`currentView === 'health-errors'`), Modul-Deep-Dives
- `FleetConditionDetailView.tsx` = `@deprecated`, nicht mehr im aktiven App-Routing

---

## 2. Datenwahrheiten — strikt getrennt

### 2.1 Health / Zustand (Diagnose, Risiko, Mietfähigkeit, Datenqualität)

| Artefakt | Quelle | Verwendung |
|----------|--------|------------|
| `healthMap` | `FleetContext` → `useFleetHealthMap` → `GET …/rental-health/fleet` (paginiert, org-gescoped) | O(1) Lookup pro Fahrzeug in Fleet-Surfaces |
| `VehicleHealthResponse` | Frontend-Typ = Rental Health V1 Contract (`api.ts`) | Einzige kanonische Health-Payload-Form |
| `overall_state` | Backend-Aggregat (`good` \| `warning` \| `critical` \| `unknown` \| `n_a`) | Ampel, KPI-Bänder, Sortierung |
| `rental_blocked` | Backend Hard-Gate | Mietfähigkeit — nur explizite Blocker |
| `blocking_reasons[]` | Backend | Konkrete Sperrgründe (TÜV, Safety, …) |
| `modules.*` | Backend pro Modul | `battery`, `tires`, `brakes`, `error_codes`, `service_compliance`, `complaints`, `vehicle_alerts` |
| Display-Schicht | `fleet-health-control-center.ts` | `buildFleetHealthDisplay`, `computeFleetHealthKpis`, Filter/Gruppierung — **keine zweite Bewertung** |

**Regel:** Health beantwortet *„Wie steht das Fahrzeug diagnostisch da — darf es raus?“*  
Health berechnet **keine** Task-Status, Vendor-Zustände oder Abarbeitungs-Fortschritt.

### 2.2 Service / Maintenance (Abarbeitung, Aufgaben, Termine, Partner, Verlauf)

| Artefakt | Quelle | Verwendung |
|----------|--------|------------|
| `tasks` / `allTasks` | `api.tasks.list(orgId)` via `useServiceCenterData` | Vollständige Aufgabenliste |
| `taskSummary` / `summary` | `api.tasks.summary(orgId)` | Aggregierte KPIs (overdue, inProgress, …) |
| `activeTasks` | Client-Filter `isActiveTask` (OPEN, IN_PROGRESS, WAITING) | Board, Schedule, Overview |
| `historyTasks` | Client-Filter DONE \| CANCELLED | Verlauf |
| `vendors` | `api.vendors.list(orgId)` | Partner-Tab, Task-Zuordnung |
| `kpis` / `ServiceKpiSnapshot` | `deriveServiceKpis(summary, activeTasks)` in `service-center.utils.ts` | Maintenance KPI-Leiste |
| Schedules | `groupTasksByDueDate` / `groupTasksByDueWeek` auf `activeTasks` | Planungs-Subtab |
| `serviceCases` | `api.serviceCases` (Backend vorhanden) | **Noch nicht** in Service-Center-UI verdrahtet — UI bleibt task-basiert |

**Regel:** Service beantwortet *„Was muss operativ getan werden — wer macht es — wann ist es fällig?“*  
Tasks sind die Wahrheit für operative Abarbeitung. Vendors sind die Wahrheit für Werkstatt-/Partnerdaten.

---

## 3. Grenzregeln (nicht vermischen)

1. **RentalHealthV1 / `healthMap` ist die einzige Wahrheit** für Zustand, Risiko und Mietfähigkeit (`overall_state`, `rental_blocked`, `blocking_reasons`, Modul-States).
2. **Tasks sind die einzige Wahrheit** für operative Abarbeitung (Status, Fälligkeit, Zuweisung, Vendor, Priorität).
3. **Vendors sind die einzige Wahrheit** für Partner-/Werkstatt-Stammdaten und Vendor-Waiting-Kontext.
4. **Service Center darf keine zweite Health-Bewertung berechnen** — keine eigene Ampel, kein abweichendes `overall_state`, keine Heuristik aus Task-Texten als Health-Ersatz.
5. **UI darf Health-Signale und Service-Aufgaben zusammen anzeigen**, aber mit klarer Quellen-Trennung (Badge/Label: „Zustand“ vs. „Aufgabe“).
6. **Keine doppelte Meldungslogik:** Ein überfälliger TÜV erscheint als `service_compliance` in Health **und** ggf. als `VEHICLE_INSPECTION`-Task in Service — das sind zwei Perspektiven auf dasselbe Thema, keine zweite Health-Berechnung aus Tasks.

### Erlaubte Brücke (bewusst)

- `health-task-bridge.utils.ts` + `HealthServiceActions.tsx`: Health-Modul → Task-Prefill / Duplicate-Check / CTA „Service-Aufgabe anlegen“
- `openServiceCenter` Navigation aus Health-Detail: **Handoff**, keine Datenfusion

### Verboten in zukünftiger Fusion

- Task-`overdue`-Count als Ersatz für `rental_blocked`
- `deriveServiceKpis` oder `actionRequiredScore` als Health-Severity
- Health-`service_compliance.state` erneut in Service-KPIs aggregieren (bereits in Health-Wahrheit enthalten)

---

## 4. Bekannte Redundanzen (Audit V4.9.181 — **V4.9.185 bereinigt**)

| Ort | Was | Status |
|-----|-----|--------|
| ~~`ServiceOverviewPanel` → „Health-Signale“~~ | ~~Liest `healthMap`~~ | **Entfernt** — Health nur in Zustand & Service Übersicht/Fahrzeuge |
| ~~Doppelte Health-KPIs Fahrzeuge-Subtab~~ | ~~`FleetHealthKpiCard` parallel zu Übersicht~~ | **Entfernt** — `hideKpiStrip` im eingebetteten `FleetConditionView` |
| ~~`ServiceCenterView` in Fleet~~ | ~~Embedded Maintenance~~ | **Entfernt** — `FleetHealthServiceView` + dedizierte Panels |
| Beide Tabs: „Action Required“ / „Handlungsbedarf“ | Health-KPI vs. Task-Queue | **Getrennt** — Health in Übersicht/Fahrzeuge; Tasks = operative Queue |
| TÜV/Service overdue | Health vs. Task-Filter | Thematische Überlappung bleibt fachlich getrennt (Health ≠ Task) |
| `HealthServiceActions` | Brücke Health→Task | Akzeptabel |
| `ServiceControlBar` | Nur in standalone `ServiceCenterView` | Nicht im aktiven Fleet-Pfad |

---

## 5. UI-Linien (Ist-Zustand V4.9.185)

| Surface | KPI-Komponente | Sprache | Design-Tokens |
|---------|----------------|---------|---------------|
| Zustand & Service Übersicht | `FleetHealthServiceKpiStrip` | Deutsch | `fleet-health-service-shell`, Dashboard KPI scale |
| Fahrzeuge Subtab | `FleetConditionView` (`hideKpiStrip`, `uiLocale=de`) | Deutsch | `sq-card`, Fleet command rows |
| Aufgaben/Termine/Verlauf | Service-Panels via `FleetHealthService*Panel` | Deutsch | `sc.panel` / `fhs.panel` |
| Standalone Service Center | `ServiceCenterView` (legacy) | i18n | `sc.*` |
| Fleet Top-Tabs | `FleetHubView` | i18n — DE: „Health“ + „Instandhaltung“ | `sq-tab-bar` |

**Mobile/Desktop**

- Health: KPI 2×2 → 4 Spalten; Detail als sticky Side-Panel (lg+) / Drawer (mobile)
- Service: KPI 2×2 → 4 Spalten; Sub-Tabs `flex-wrap`; Overview 1→2 Spalten

---

## 6. Ziel-Navigation (V4.9.182 — Top-Level umgesetzt)

```
Fleet
├── Status
└── Zustand & Service
    ├── Übersicht
    ├── Fahrzeuge      ← ehem. Health
    ├── Aufgaben
    ├── Termine
    ├── Partner
    └── Verlauf        ← ehem. Service Center Subtabs
```

Datenquellen bleiben getrennt — nur Navigation zusammengeführt.

---

## 7. Referenz-Dateien

**Health:** `FleetContext.tsx`, `useVehicleHealth.ts`, `fleet-health-control-center.ts`, `FleetConditionView.tsx`, `health/*`  
**Service:** `useServiceCenterData.ts`, `service-center.utils.ts`, `ServiceCenterView.tsx`, `service-center/*`  
**ViewModel (V4.9.183):** `useFleetHealthServiceViewModel.ts`, `fleet-health-service.view-model.ts` — UI-Ableitung ohne neue Health-Bewertung  
**Brücke:** `health-task-bridge.utils.ts`, `HealthServiceActions.tsx`, `service-center-navigation.ts`  
**Backend (read-only Contract):** `backend/src/modules/rental-health/*`, `backend/src/modules/tasks/*`, `backend/src/modules/vendors/*`
