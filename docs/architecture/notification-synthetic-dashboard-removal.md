# Notification Engine — Synthetic Dashboard Notification Removal (Prompt 15)

**Datum:** 2026-07-26  
**Branch:** `remediation/notification-engine-production-readiness-2026-07`

## Ziel

DashboardInsights und clientseitig synthetische `dashboardNotifications` dürfen keine konkurrierende operative Notification-Quelle mehr sein. Analytische Insights bleiben als Auswertungsdaten erhalten.

## Entfernte / deaktivierte Pfade

| Pfad | Maßnahme |
|------|----------|
| `buildDashboardNotificationsFromInsights` | Gelöscht — kein synthetischer Device-Quality-Feed |
| `dashboardNotifications` in `useDashboardViewModel` | Entfernt |
| `actionQueueBuilder` `input.notifications` Loop (`notif-${title}-${time}`) | Entfernt |
| Canonical Insights → `normalizeOperationalIssues` / V1 Queue | Unterdrückt wenn `VITE_NOTIFICATIONS_V2=on` |
| V2 supplemental bridges (derived, health, overdue handover) | Standard **aus**; opt-in `VITE_NOTIFICATIONS_V2_BRIDGES=on` |
| Parallele Tab-Count-Aufsummierung | API-only wenn Bridges aus |

## Erhaltene Analytics-Funktionen

| Funktion | Zweck |
|----------|--------|
| `GET /dashboard-insights` + BI-Detektoren | Analytische / strategische Insights |
| `BusinessInsightsService` publish (gefiltert) | KPI, Pulse, Drilldowns — nicht Inbox |
| `deriveOperationalInsights` / predictive | Fleet-Ops-Analyse (nicht Inbox wenn V2 strict) |
| Rental-Health `healthMap` | Health-Pills, Fleet-Board — nicht Meldungen-Panel |
| Shadow compare (`VITE_NOTIFICATIONS_V2=shadow`) | V1/V2 Diagnostik |

## Feature Flags

| Flag | Werte | Bedeutung |
|------|-------|-----------|
| `NOTIFICATIONS_V2` (backend) | `true`/`false` | Kanonische Producer + API |
| `VITE_NOTIFICATIONS_V2` | `off` / `shadow` / `on` | Frontend Cutover |
| `VITE_NOTIFICATIONS_V2_BRIDGES` | `off` (default) / `on` | Transitional supplemental merges |

**Prod-Ziel:** `NOTIFICATIONS_V2=true`, `VITE_NOTIFICATIONS_V2=on`, `VITE_NOTIFICATIONS_V2_BRIDGES=off`

## Backend

`V2_CANONICAL_INSIGHT_TYPES` erweitert um `STATION_SHORTAGE`, `LOW_UTILIZATION` — BI publish gefiltert wenn `NOTIFICATIONS_V2=true`.

## Tests

- `notifications-v2-cutover.test.ts` — flags, insight suppression, single-source counts
- `notificationEngine.characterization.test.ts` — keine `notif-*` title/time IDs
- Bestehende producer/merge tests unverändert grün
