# Fleet: Zustand & Service — fachlicher Contract (Vorbereitung)

> **Status:** Audit + Vorbereitung — keine Navigation/Umbau in diesem Schritt.  
> **Ziel:** Health (Zustand) und Maintenance/Service später auf UI-Ebene zu einem Tab **„Zustand & Service“** zusammenführen, ohne die Datenwahrheiten zu vermischen.

---

## 1. Scope & Renderpfad (aktuell)

| Ebene | Komponente | Rolle |
|-------|-----------|-------|
| App-Router | `App.tsx` (`currentView === 'fleet'`, `fleetTab`) | Hält Fleet-View + aktiven Top-Level-Tab |
| Fleet Top-Tabs | `FleetHubView.tsx` | Rendert Tab-Bar (`status` \| `health` \| `service`) und conditional Content |
| Tab **Status** | `FleetView.tsx` (embedded) | Operative Flottenliste; nutzt `healthMap` nur für Badges/Blocking |
| Tab **Health** | `FleetConditionView.tsx` (embedded) | Fleet-weites Health Control Center |
| Tab **Instandhaltung** | `ServiceCenterView.tsx` (`hideHeader`) | Operatives Service Center mit Sub-Tabs |

**Deep-Link / Cross-Navigation**

- `openServiceCenter(nav?)` in `App.tsx` → `setFleetTab('service')` + optional `ServiceCenterNavState`
- `handleViewChange('fleet-condition')` → Fleet + Health-Tab
- Health-Detail → Service: `onOpenServiceCenter` Callback-Kette (`FleetConditionView` → `HealthVehicleDetailPanel`)

**Nicht Teil des Fleet-Hub Health-Tabs**

- `HealthErrorsView.tsx` = Vehicle-Detail-Ansicht (`currentView === 'health-errors'`), Modul-Deep-Dives
- `FleetConditionDetailView.tsx` = `@deprecated`, nicht mehr im aktiven App-Routing

---

## 2. Datenwahrheiten — strikt getrennt

### 2.1 Health / Zustand (Diagnose, Risiko, Mietfähigkeit, Datenqualität)

| Artefakt | Quelle | Verwendung |
|----------|--------|------------|
| `healthMap` | `FleetContext` → `useFleetHealthMap` → `GET …/rental-health?vehicleIds=` | O(1) Lookup pro Fahrzeug in Fleet-Surfaces |
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

## 4. Bekannte Redundanzen (Audit V4.9.181 — dokumentiert, noch nicht entfernt)

| Ort | Was | Bewertung |
|-----|-----|-----------|
| `ServiceOverviewPanel` → „Health-Signale“ | Liest `healthMap`, filtert `service_compliance` + `rental_blocked` | **UI-Redundanz** — Health-Signale im Maintenance-Tab |
| Beide Tabs: „Action Required“ | Health-KPI vs. Task-Queue-Sektion | **Label-Kollision** — gleicher Begriff, andere Wahrheit |
| TÜV/Service overdue | Health `modules.service_compliance` vs. Task-Filter `tuv` / `overdue` | **Thematische Überlappung** — getrennte Quellen, gemeinsame UX-Risiko |
| `HealthServiceActions` | Zeigt Health-Modul-State-Chip neben Task-CTAs | Akzeptabel als Brücke, aber visuell Health-dominiert |
| `ServiceControlBar` KPI „Kritisch / Blockiert“ | `blocksVehicleAvailability` auf Tasks | Task-Wahrheit, nicht `rental_blocked` — kann divergieren |

---

## 5. UI-Linien (Ist-Zustand)

| Surface | KPI-Komponente | Sprache | Design-Tokens |
|---------|----------------|---------|---------------|
| Health Tab | `FleetHealthKpiCard` | Englisch hardcoded | `fleet-health-kpi-tile`, Status-Tone-Tokens |
| Maintenance Tab | `ServiceControlBar` | Deutsch hardcoded | `sc.kpiTile`, `sc.controlBar` |
| Service Sub-Tabs | `ServiceCenterView` | i18n (`serviceCenter.tab.*`) | `sc.subTabBar` |
| Fleet Top-Tabs | `FleetHubView` | i18n — DE: „Health“ + „Instandhaltung“ | `sq-tab-bar` |

**Mobile/Desktop**

- Health: KPI 2×2 → 4 Spalten; Detail als sticky Side-Panel (lg+) / Drawer (mobile)
- Service: KPI 2×2 → 4 Spalten; Sub-Tabs `flex-wrap`; Overview 1→2 Spalten

---

## 6. Ziel-Navigation (später, nicht jetzt)

```
Fleet
└── Zustand & Service          ← neuer kombinierter Top-Tab
    ├── Zustand (ehem. Health)   → healthMap, FleetConditionView-Inhalt
    └── Service (ehem. Maintenance) → tasks, vendors, schedules, history
```

Bis zur Umsetzung: **beide Tabs und alle Pfade unverändert lassen**.

---

## 7. Referenz-Dateien

**Health:** `FleetContext.tsx`, `useVehicleHealth.ts`, `fleet-health-control-center.ts`, `FleetConditionView.tsx`, `health/*`  
**Service:** `useServiceCenterData.ts`, `service-center.utils.ts`, `ServiceCenterView.tsx`, `service-center/*`  
**Brücke:** `health-task-bridge.utils.ts`, `HealthServiceActions.tsx`, `service-center-navigation.ts`  
**Backend (read-only Contract):** `backend/src/modules/rental-health/*`, `backend/src/modules/tasks/*`, `backend/src/modules/vendors/*`
