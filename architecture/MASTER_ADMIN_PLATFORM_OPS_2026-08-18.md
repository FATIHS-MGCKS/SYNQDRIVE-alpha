# Master Admin — Platform Operations Hub (UI-8.3)

**Datum:** 2026-08-18

## Zusammenfassung

Kanonischer Hub **Plattform & Betrieb** (`?view=platform-ops`) ersetzt `platform-health` als operative Control Plane.

## Backend

- `PlatformOpsService` aggregiert Health, Incidents, Services, Queues, Workers, Schedulers, Infrastructure (Prometheus), Alerts (Alertmanager), Resilience, Tools
- Endpoints unter `GET /admin/ops/*`
- Unit-Tests: `platform-ops.service.spec.ts`

## Frontend

- `frontend/src/master/platform-ops/PlatformOpsHub.tsx` — 7 Primärtabs
- `SystemMonitoringView` embedded in Diagnostik (Poll Logs, Token Health)
- Navigation: Sidebar `platform-ops`, Legacy-Redirects

## Signalfluss

```
PlatformAdminService / QueueMonitoring / ResilienceStatus / Alertmanager / Prometheus
  → PlatformOpsService
  → GET /admin/ops/*
  → PlatformOpsHub (keine zweite Health-Wahrheit im Client)
```

## Docs

- Blueprint: `docs/ui/master-admin-canonical-platform-operations-blueprint.md`
- Acceptance: `docs/ui/master-admin-platform-operations-post-remediation.md`
