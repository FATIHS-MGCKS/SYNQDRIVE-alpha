# Notification Engine — Temporary Source Ownership (P0)

> **Status:** Übergangslösung bis zum Cutover auf die persistente Notification Engine V2.  
> **Scope:** Dashboard ActionQueue / Notification Box — keine Backend-Persistenz, kein UI-Redesign.

## Ziel

Sichtbare Duplikate in der Dashboard Notification Box reduzieren, ohne die geplante Backend-Identität vorwegzunehmen. Fachlich unterschiedliche Sachverhalte bleiben getrennt; identische `semanticKey`-Zustände werden zu genau einer Zeile zusammengeführt.

---

## semanticKey-Schema (temporär, frontend)

Format (org-implicit, stabil innerhalb des Mandanten):

```
{entityType}:{entityId}:{domain}:{conditionCode}
```

Beispiele:

| Meldungstyp | semanticKey |
|-------------|-------------|
| Fahrtbewertungsqualität (DEGRADED) | `vehicle:{vehicleId}:health:driving_assessment_device_quality` |
| Technische Beobachtung (Complaints) | `vehicle:{vehicleId}:health:technical_observation_active` |
| Batterie kritisch | `vehicle:{vehicleId}:health:battery_critical` |
| Reifen kritisch | `vehicle:{vehicleId}:health:tires_critical` |
| Bremsen kritisch | `vehicle:{vehicleId}:health:brakes_critical` |
| DTC / Fehlercodes | `vehicle:{vehicleId}:health:error_codes_active` |
| Service überfällig | `vehicle:{vehicleId}:service_compliance:overdue` |
| Servicefenster | `vehicle:{vehicleId}:service_window:available` |
| Abholung überfällig | `booking:{bookingId}:booking:pickup_overdue` |
| Rückgabe überfällig | `booking:{bookingId}:return:overdue` |
| Station Shortage | `station:{stationId}:station_operations:shortage` |
| Derived Fleet Telemetry | `fleet:operations:derived_fleet_telemetry` |
| Derived Handover Backlog | `fleet:handover:derived_handover_backlog` |

**Verboten im Schlüssel:** sichtbarer Titel, lokalisierte Beschreibung, relative Zeit, `Date.now()`, zufällige UUID pro Render, Listenindex.

Implementierung: `frontend/src/rental/components/dashboard/notificationEngineSemanticKeys.ts`

---

## Source-Ownership-Matrix (temporär)

| Meldungstyp | Kanonischer Owner (ActionQueue) | Unterdrückte redundante Pfade |
|-------------|--------------------------------|------------------------------|
| Fahrtbewertungsqualität (DEGRADED) | `normalizeOperationalIssues` → `dashboard_insight` → `mapOperationalIssueToActionQueueItem` | Legacy `insight-{uuid}`; synthetische `dashboardNotifications`; Runtime `dashboard-insight:DRIVING_ASSESSMENT_DEVICE_QUALITY` (gleicher semanticKey) |
| Fahrtbewertung normalisiert (RECOVERING) | **keine ActionQueue-Zeile** (`dashboardAttention: false`) | Adapter-Feed nur noch `BusinessInsightsBox`; kein `notif-*` in ActionQueue |
| Technische Beobachtung | `normalizeOperationalIssues` (`technical_observation_active`) aus Health-Alert **oder** Runtime `rental-health:complaints` | Generischer `health:review_required`; früher verstecktes `health_review_required` für Complaints-Modul |
| Vehicle Health (Module) | `normalizeOperationalIssues` aus `vehicleHealthAlerts` / Runtime-Reasons | Legacy Insight-Pfad wenn Typ in `NORMALIZED_INSIGHT_TYPES` |
| DTC / Fehlercodes | Normalized `error_codes_active` | Generischer Health-Fallback |
| Batterie / Reifen / Bremsen | Normalized vehicle_health keys | Paralleler Legacy-Insight wenn normalisiert |
| Compliance / Service | `service_compliance:overdue` (gewinnt gegen Service Window) | Service Window als Supporting Source, nicht zweite Karte |
| Station Shortage | Normalized insight / predictive `station:…:shortage` | Legacy Insight wenn nicht normalisiert |
| Überfällige Pickups/Returns | Normalized booking keys **oder** Pickup/Return-Tiles (gleicher semanticKey) | Doppelte Tile wenn normalized Issue bereits existiert |
| Buchungsereignisse (Tiles) | `pickup-{bookingId}` / `return-{bookingId}` mit semanticKey | — |
| Derived Insights | `deriveOperationalInsights` mit `fleet:…` keys | Dedupe gegen normalized wenn gleicher Key |
| Predictive Insights | `derivePredictiveOperationsInsights` mit entity keys | Dedupe wenn normalized/predictive-normalized bereits vorhanden |
| Synthetischer Adapter-Feed | **`BusinessInsightsBox` only** (`buildDashboardNotificationsFromInsights`) | **Nicht** mehr an `buildUnifiedActionQueue` übergeben (`useDashboardViewModel`: `notifications: []`) |

---

## Zentrale Deduplizierung

**Single entry point:** `dedupeActionQueueBySemanticKey` in `notificationEngineDedupe.ts`

Aufrufkette:

1. `buildUnifiedActionQueue` sammelt alle Kandidaten
2. `filterSuppressedQueueSources` entfernt synthetische Driving-Assessment-Feeds
3. `dedupeActionQueueBySemanticKey` merged nach `semanticKey`
4. `normalizeAttentionItems` (title-domination cleanup — legacy, schrittweise obsolet)
5. `prepareActionQueueRenderModel` → `dedupeActionQueueItems` (delegiert an zentrale Funktion)

**Merge-Regel bei gleichem semanticKey:**

| Feld | Regel |
|------|-------|
| Gewinner-Quelle | Tier 1: `issue-*` (normalized) > Tier 2: `insight-*` > Tier 3: pickup/return > Tier 4: predictive > Tier 5: derived > Tier 6: `notif-*` |
| severity | Höchste übernehmen |
| timeSortMs | Neuestes `lastSeenAt` (max) |
| CTA / Entity | Vom strukturreicheren Item; `open-vehicle` vor `open-rental` |
| firstSeenAt | (V2) — aktuell nur via `degradedSince` evidence auf normalized issues |

---

## Renderpfade (aktuell)

```
useDashboardViewModel
├── insights, vehicleHealthAlerts, dashboardRuntime, pickup/return tiles
├── derivedOperationalInsights, predictiveOperationsInsights
├── dashboardNotifications → BusinessInsightsBox ONLY
└── buildUnifiedActionQueue({ notifications: [] })
    ├── normalizeOperationalIssues (canonical)
    ├── legacy insight loop (nur nicht-normalisierte Typen)
    ├── pickup/return tiles
    ├── derived + predictive
    ├── dedupeActionQueueBySemanticKey
    └── ActionQueue.tsx → prepareActionQueueRenderModel
```

---

## WOB L 7503 Regression

| Zustand | Erwartung nach P0 |
|---------|-------------------|
| DEGRADED + Complaints Health Alert | 1× Fahrbewertung + 1× technische Beobachtung |
| RECOVERING | 0× Fahrbewertung-Warning in ActionQueue; Beobachtung bleibt |
| Runtime + Insight parallel | 1× pro semanticKey |
| Generischer „Health prüfen“ | Unterdrückt wenn konkrete Beobachtung existiert |

Tests: `notificationEngine.wob-l7503.test.ts`

---

## Bewusst nicht in P0

- Persistente Backend-Notification-Identität / DB-Tabelle
- Englische UI-Übersetzung der Insight-Titel (deferred V2)
- KPI- / Runtime-Slice-Änderungen
- UI-Redesign der Notification Box
- Entfernen von `normalizeAttentionItems` title-domination (legacy cleanup)

---

## Verwandte Dokumentation

- `docs/notification-engine-current-state.md` — Ist-Analyse
- `docs/notification-engine-test-baseline.md` — Test-Safety-Net
- `architecture/DRIVING_ASSESSMENT_DEVICE_QUALITY_2026-07-10.md` — Fachlicher Kontext
