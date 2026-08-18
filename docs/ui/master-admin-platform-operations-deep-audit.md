# Master Admin — Platform Operations & System Health Deep Audit

**Datum:** 2026-08-18  
**Phase:** UI-8.1 (Read-only Audit — keine Implementierung)  
**Basis:**
- `docs/remediation/observability-architecture.md` (Phase 2F.1)
- `docs/remediation/alertmanager.md` (Phase 2F.2)
- `docs/remediation/redis-backup.md`, `offsite-backups.md`, `disaster-recovery-production-readiness.md`
- `docs/remediation/clickhouse-*.md` (Pipeline, Backup, Performance, Tenant, DR)
- `architecture/MASTER_ADMIN_OBSERVABILITY_ARCHITECTURE_2026-07-26.md`
- `architecture/MASTER_ADMIN_ALERTMANAGER_2026-07-26.md`
- `architecture/MASTER_ADMIN_DASHBOARD_BLUEPRINT_2026-08-18.md` (UI-4.2)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- Ergebnisse UI-1 (Navigation/Shell) bis UI-7 (Connected Vehicles/DIMO)

**Leitfrage:** *Kann ein Master Admin aus SynqDrive heraus den Plattformzustand verstehen, priorisierte Vorfälle erkennen, und gezielt in die richtige Diagnose handeln — ohne einen zweiten Monitoring-Stack im Frontend?*

**Grundsatz:** SynqDrive Master Admin ist **Control Plane**, nicht Ersatz für Grafana/Prometheus/Alertmanager. Operative Entscheidungen ja — komplette Observability-Produkte nein.

---

## 1. Executive Summary

SynqDrive besitzt eine **reife Backend-Observability-Schicht** (~302 Prometheus-Metriken, 100+ Alert-Regeln, 7 Grafana-Dashboards, Alertmanager auf VPS) und eine **teilweise konsolidierte Master-Admin-Control-Plane** (operatives Dashboard UI-4, Platform Health, Billing Ops UI-6, Connected Vehicles UI-7).

Die **UI-Fragmentierung** ist das Hauptproblem:

| Befund | Schwere |
|--------|---------|
| `SystemMonitoringView` (reichste Worker/Poll/Token-UI) ist **verwaist** — nicht in `App.tsx` geroutet | P0 |
| Platform Health → „API & Worker Monitoring“ → Settings/monitoring → **Redirect-Loop** zurück | P0 |
| **Keine Alertmanager-Integration** in MA — Alerts sind backend-abgeleitete Regeln auf `dimo_poll_log`, nicht firing AM-State | P1 |
| **Kein Host/PM2/Nginx/Docker-UI** — nur Grafana-URL-Text | P1 |
| Incidents ohne Ack/Owner/Timeline/Runbook — nur derived DTOs | P1 |
| Backup/DR nur als Dashboard-Card + Architektur-Docs, kein dedizierter Ops-Bereich | P1 |
| Scheduler/Cron **nicht** als kanonische Ops-Liste sichtbar | P2 |
| `opsTab=workers` URL-Parameter wird von Platform Health **ignoriert** | P2 |

**Gesamtbewertung Production Readiness (Ops/Health UI): ~47/100**

Ein Master Admin kann **groben Plattformstatus** und **Queue-Überblick** sehen, aber nicht zuverlässig: Alert-Zustellung, Silences, Host-Ressourcen, Scheduler-Misses, oder vollständige Incident-Lifecycle-Führung.

---

## 2. Page Inventory

### 2.1 Kanonische Routen (in `App.tsx` gemountet)

| View ID | URL | Datei | Zweck | Permission |
|---------|-----|-------|-------|------------|
| `dashboard` | `?view=dashboard` | `MasterDashboardView.tsx` | **Platform Operations Control Plane** — Status Hero, Incidents, Domain Cards | MASTER_ADMIN |
| `platform-health` | `?view=platform-health` | `PlatformHealthView.tsx` | Infrastruktur-Snapshot, Queues, derived Alerts, Grafana-Hinweis | MASTER_ADMIN + MFA |
| `vehicles` | `?view=vehicles&cvSection=…` | `connected-vehicles/*` | DIMO/Connectivity Governance (UI-7) | MASTER_ADMIN |
| `billing` | `?view=billing&masterBilling=…` | `BillingControlCenter.tsx` | Stripe/Webhooks/Reconciliation Ops | MASTER_ADMIN / billing role |
| `high-mobility` | `?view=high-mobility&hmTab=…` | `HighMobilityDataView.tsx` | HM OEM Streaming/Health | MASTER_ADMIN |
| `voice-assistant` | `?view=voice-assistant` | `VoiceAssistantAdminView.tsx` | Voice AI Control Plane | MASTER_ADMIN |
| `vehicle-logbook` | `?view=vehicle-logbook` | `VehicleLogbookView.tsx` | Per-Vehicle Debug (Workers-Tab) | MASTER_ADMIN |
| `activity-log` | `?view=activity-log` | `ActivityLogView.tsx` | Admin Audit Trail | MASTER_ADMIN |
| `support` | `?view=support` | `SupportView.tsx` | Support-Ticket Ops | MASTER_ADMIN |
| `architektur` | `?view=architektur` | `ArchitekturView.tsx` | **Dokumentation** (kein Live-Monitoring) | MASTER_ADMIN |
| `changes` | `?view=changes` | `ChangesView.tsx` | Changelog | MASTER_ADMIN |
| `parts-accessories` | `?view=parts-accessories` | `PartsAccessoriesAdminView.tsx` | Partner Health Tab | MASTER_ADMIN |
| `insurances` | `?view=insurances` | `InsurancesAdminView.tsx` | Partner Health Tab | MASTER_ADMIN |
| `settings` | `?view=settings` | `PlatformSettingsView.tsx` | General/Email/Integrations — **kein Monitoring** | MASTER_ADMIN + MFA |

**Redirects:** `settingsTab=monitoring` → `platform-health`; `fleet-connection` → `vehicles` + `cvSection=overview`.

### 2.2 Verwaiste / nicht geroutete Komponenten

| Komponente | Datei | APIs | Status |
|------------|-------|------|--------|
| System Monitoring (Detail) | `SystemMonitoringView.tsx` | `/admin/monitoring/summary`, `/workers`, `/alerts`, `/poll-logs`, `/token-health` | **ORPHAN** — reichste Ops-UI |
| Fleet Connection | `FleetConnectionView.tsx` | `/admin/dimo/fleet-connectivity`, GraphQL console | **ORPHAN** — ersetzt durch Connected Vehicles |
| Health Tracking | `HealthTrackingView.tsx` | — | **ORPHAN** — Vehicle-Health-Docs |

### 2.3 Dashboard (`MasterDashboardView`) — Element-Inventar

| Element | Zweck | Source of Truth | Endpoint | Refresh | Drilldown |
|---------|-------|-----------------|----------|---------|-----------|
| Status Hero | Global `overallStatus`, Incident count, Domain chips | `buildDashboardIncidents` + `computeDomainStatus` | `GET /admin/dashboard/operational` | 60s + manual | Per domain chip |
| Active Incidents (max 5) | Priorisierte Vorfälle | Derived incidents DTO | embedded in operational | 60s | `platform-health`, `billing`, `support`, `architektur` |
| Platform Status (compact) | Core/Processing/External/Resilience accordions | `platformHealth` snapshot | embedded | 60s | Accordions expand inline |
| Domain: Billing | MRR, failed payments, drifts | `BillingAdminService.getOverview` | embedded | 60s | `billing` |
| Domain: Connectivity | DIMO freshness histogram | `PlatformConnectivitySummaryService` | embedded | 60s | `vehicles` / legacy `fleet-connection` |
| Domain: Worker & Queues | Failed/waiting sums, queue status | `platformHealth.queues` | embedded | 60s | `platform-health?opsTab=workers` (**broken target**) |
| Domain: Backup & Recovery | Resilience overall | `PlatformResilienceStatusService` | embedded | 60s | `architektur` (docs only) |
| Support snapshot | Open tickets | `SupportService` | embedded | 60s | `support` |
| Org attention | Tenant governance | `OrganizationsOperationalService` sample | embedded | 60s | `organizations` |
| Business context | MRR, org/user counts | Prisma aggregates | embedded | 60s | — |

**Permission:** `MASTER_ADMIN`; MFA nicht auf Dashboard-Ebene (nur Platform Admin Controller MFA für `/admin/*` generell).

### 2.4 Platform Health (`PlatformHealthView`) — Element-Inventar

| Element | Zweck | Source of Truth | Endpoint | Refresh | Interaktion |
|---------|-------|-----------------|----------|---------|-------------|
| Header KPI: System (1h) | `monitoring.systemHealth` | `getMonitoringSummary` (poll logs 1h) | `GET /admin/platform-health` | 60s auto | — |
| Header KPI: Readiness | `readiness.status` | `HealthService.checkReadiness` | same | 60s | — |
| Header KPI: Fehlerrate Polls | `errorRatePercent` | dimo_poll_log aggregation | same | 60s | Local threshold >5% warning, >10% critical |
| Header KPI: Enrichment pending | `delayedOrStuckJobs` | vehicle_enrichment_job | same | 60s | Local threshold >50 warning |
| Infrastruktur card | postgres, redis, clickhouse, workers, documentExtraction | Readiness checks | same | 60s | — |
| DIMO card | connected/total counts | Prisma dimo_vehicle | same | 60s | Links (one broken) |
| BullMQ Queues table | waiting/active/delayed/failed per queue | `QueueMonitoringService` live Redis | same | 60s | — |
| Alerts (1h) | Rule-derived alert list | `getMonitoringAlerts` | same | 60s | Display only |
| Observability card | Grafana/Prometheus URLs, metrics token flag, SSH hint | env config | same | 60s | **Text only — no links** |

**Actions:** Refresh only. No ack, silence, retry, incident create.

### 2.5 System Monitoring (`SystemMonitoringView`) — ORPHAN Inventar

| Section | APIs | Unique value vs Platform Health |
|---------|------|--------------------------------|
| Date range + auto-refresh 1m | — | Historical window control |
| 12 Summary KPIs | `/admin/monitoring/summary` | vehiclesPolled, staleVehicles, enrichment stats |
| Alerts & anomalies | `/admin/monitoring/alerts` | Same rules, wider window |
| DIMO polling by job type | summary.workers | Per-job-type breakdown |
| Workers table | `/admin/monitoring/workers` | lastSuccessAt, failureRatio, avgDuration |
| Token & Auth Health | `/admin/monitoring/token-health` | DIMO JWT lifecycle, TTL, consecutive failures |
| API requests (poll logs) | `/admin/monitoring/poll-logs` | Paginated, filterable raw poll log |

**Status:** Unreachable — represents **significant sunk cost** and **capability gap**.

### 2.6 Weitere Ops-relevante Surfaces

| Surface | Ops-Relevanz | Key APIs |
|---------|--------------|----------|
| Billing → Reconciliation / Stripe | Stripe webhooks, sync errors, drifts | `/admin/billing/stripe-status`, `/webhook-events`, reconciliation run |
| Connected Vehicles Overview | DIMO platform degraded banner | `/admin/vehicles/operational/overview` |
| High Mobility → MQTT Diagnostics | Stream consumer health | `/admin/high-mobility/stream/*` |
| Voice Assistant | Provider status, webhook backlog, DLQ, queue counts, activeIncidents | `voiceAssistant.admin.controlPlane.platformStatus()` |
| Vehicle Logbook → Workers tab | Per-vehicle BullMQ timeline | `/admin/vehicle-logbook/*` |
| Sidebar footer + badges | `platform-critical`, `integration-outage`, `billing-anomaly` | `/admin/dashboard/operational` via `useMasterNavBadges` |

### 2.7 Externe Links

| Tool | In UI | Klickbar | Zugriff |
|------|-------|----------|---------|
| Grafana | Platform Health Observability card | **Nein** (nur Text) | SSH tunnel localhost:3000 |
| Prometheus | Platform Health Observability card | **Nein** | SSH tunnel localhost:9090 |
| Alertmanager | **Nicht referenziert** | — | SSH tunnel localhost:9093 (VPS) |
| Loki / Log stack | **Nicht referenziert** | — | — |

---

## 3. Control Plane vs Monitoring Tool

### 3.1 Gehört in SynqDrive Master Admin

| Information | Begründung |
|-------------|------------|
| Overall platform status (healthy/degraded/critical) | Entscheidungs-Einstieg |
| Active incidents mit Drilldown zu betroffener Domäne | Handlungsführung |
| Readiness der Kernabhängigkeiten (PG, Redis, Workers) | Sofortige Verfügbarkeitsfrage |
| BullMQ Queue Health (failed/waiting) | Direkte Ops-Aktion (Billing, DIMO, Notifications) |
| Integration Health (DIMO token, Stripe webhooks, Voice providers) | SynqDrive-spezifische Integrationspfade |
| Backup/DR Summary (last success, restore validation status) | Business continuity Entscheidung |
| Tenant-impact (orgs affected) | Multi-tenant Governance |
| Deep links zu Grafana/Prometheus/Runbooks | Gezielter Diagnose-Sprung, nicht Vollbild-Duplikat |

### 3.2 Gehört in Grafana/Prometheus/Infrastructure Tooling

| Information | Begründung |
|-------------|------------|
| Historische Zeitreihen (CPU 7d, latency percentiles) | Grafana-Stärke |
| 100+ Alert-Regel-Details, recording rules | Prometheus |
| Alert routing, silences, inhibition, delivery receipts | Alertmanager |
| Node exporter host metrics (CPU/RAM/disk per core) | node_exporter + Grafana |
| Blackbox SSL probe history | infra alerts |
| Raw metric cardinality exploration | Prometheus UI |
| Log correlation / Loki queries | externes Log-Tool |

### 3.3 Redundanzen / Fehlplatzierungen identifiziert

| Issue | Typ |
|-------|-----|
| `SystemMonitoringView` dupliziert Platform Health + mehr — aber verwaist | Redundanz + Gap |
| Dashboard + Platform Health zeigen beide Queue/Alert-Informationen | Partielle Redundanz |
| Architektur-View als Backup-Drilldown-Ziel | **Dokumentation ≠ Live-State** |
| Platform Health Fehlerrate + Dashboard Worker Domain | Gleiche Quelle, unterschiedliche Darstellung |
| Vehicle Logbook Workers tab | Debug, nicht Fleet-wide Ops |
| EN labels in `SystemMonitoringView` („High error rate“) vs DE Dashboard | Inkonsistenz |

### 3.4 Fehlende operative Zusammenfassungen

- Kein **Scheduler Health Board** (letzter Lauf, nächster erwarteter Lauf, missed execution)
- Kein **Host Resource Summary** (nur „healthy“ wenn AM nicht in UI)
- Kein **Notification Engine Ops** dediziert (nur Billing `failedEmailDeliveries` Proxy)
- Kein **ClickHouse Pipeline Health** jenseits Readiness-Check-Details
- Kein **Restore Verification** Status in UI (nur Resilience DTO Feld, nicht gerendert)

---

## 4. Platform State

### 4.1 Aktuelle Zustandsmodelle (mehrere Wahrheiten)

| Ebene | States | Quelle |
|-------|--------|--------|
| Dashboard `overallStatus` | healthy, warning, critical, unknown | `getOperationalDashboard()` — incidents + resilience + billing |
| Platform Health `overallStatus` | healthy, warning, critical | `getPlatformHealth()` — readiness + monitoring + queues + alerts |
| Readiness | ok, degraded | `HealthService.checkReadiness()` |
| Monitoring `systemHealth` | healthy, warning, critical | Poll log aggregation 1h |
| Domain chips | ok, warning, critical, unknown | `computeDomainStatus()` per domain |
| Queue row `status` | healthy, warning, critical, idle | `QueueMonitoringService` thresholds |
| Resilience `overall` | healthy, warning, critical, unknown | JSON file or Prometheus textfile |

### 4.2 Aggregationslogik — Validierung

**Platform Health critical wenn:**
- `readiness.status === 'degraded'` **OR**
- `monitoring.systemHealth === 'critical'` **OR**
- `queueCritical > 0`

**Platform Health warning wenn:**
- `monitoring.systemHealth === 'warning'` **OR**
- `queueWarning > 0` **OR**
- any alert severity warning/critical

**Bewertung:**
- ✅ Ein echter Readiness-Ausfall (Postgres/Redis/Workers) eskaliert zu critical — korrekt
- ⚠️ `readiness.degraded` setzt **gesamten** Platform Health auf critical, auch wenn nur documentExtraction soft-fails
- ⚠️ ClickHouse `disabled` zählt als readiness `ok` — korrekt per Architektur, aber UI zeigt CH-Zeile ohne klare „optional“ Semantik
- ⚠️ Dashboard `overallStatus` kann von Platform Health abweichen (billing incidents, support tickets)
- ❌ Kein expliziter **Unknown/Stale** State wenn APIs timeout — Frontend zeigt ErrorState, aber kein „stale last good“

### 4.3 Partial Failure

- `getOperationalDashboard()` nutzt `moduleErrors` partial — einzelne Submodule können fehlen, Dashboard rendert trotzdem
- Platform Health: atomarer Fail → kompletter ErrorState (kein partial)
- ✅ Dashboard Connectivity kann laden während Billing null ist

### 4.4 Stale Data

- Dashboard: `MasterStaleDataHint` wenn `generatedAt` > Schwellwert
- Platform Health: `generatedAt` in meta, aber **kein Stale-Banner**
- Poll-basierte Metriken: 1h Fenster — „healthy“ kann 59min alte Daten reflektieren

---

## 5. Incidents

### 5.1 Aktuelles Incident-Modell

Incidents sind **keine persistenten Incident-Records** — sie werden zur Laufzeit in `buildDashboardIncidents()` aus Alerts, Billing, Queues, Resilience, Support konstruiert.

**DTO Felder (`DashboardIncidentDto`):**
- id (synthetic `inc-${n}`)
- severity, summary, affectedComponent, impact
- firstSeen, lastSeen
- organizationIds, organizationNames (meist leer)
- drilldownView, drilldownParams

### 5.2 Was fehlt (vs. Anforderung)

| Feld | Status |
|------|--------|
| Active persistence | ❌ Neu berechnet pro Request |
| Duration | ❌ Nur firstSeen/lastSeen, nicht „seit 3h“ prominent |
| Acknowledgement | ❌ |
| Owner | ❌ |
| Resolution / resolvedAt | ❌ |
| Timeline | ❌ |
| Runbook link | ❌ |
| Related alerts grouping | ⚠️ Teilweise — mehrere Alerts → mehrere Incidents |
| Affected organizations | ⚠️ Feld existiert, selten befüllt |

### 5.3 Alerts vs Incidents

| Aspekt | Verhalten |
|--------|-----------|
| Platform Health „Alerts“ | Rule-derived, 1h window, max 10 |
| Dashboard Incidents | Kopiert non-info Alerts + Billing + Queues + Backup + Support |
| Alertmanager firing alerts | **Nicht in UI** |
| Duplikation | Gleicher Queue-Fail kann Alert UND Incident sein |
| Alert storms | `recentFailures.slice(0,3)` cap in alerts — Incidents können trotzdem wachsen |

### 5.4 Voice Assistant Incidents

`VoiceAssistantAdminView` zeigt `activeIncidents` aus Voice Control Plane — **separates Incident-Modell**, nicht in Dashboard integriert.

---

## 6. Prometheus / Alertmanager

### 6.1 Was existiert (VPS/Infrastruktur)

Per `docs/remediation/alertmanager.md` und `observability-architecture.md`:
- Prometheus scrapes backend `/api/v1/metrics` + node_exporter + blackbox SSL
- 100 app alerts + infra alerts (`alerts-infra.yml`)
- Alertmanager mit severity routing, grouping, inhibition, maintenance windows
- Grafana 7 dashboards

### 6.2 Was Master Admin zeigt

| AM-Konzept | In MA UI |
|------------|----------|
| Firing alerts | ❌ — nur derived rules auf poll logs |
| Pending alerts | ❌ |
| Silenced alerts | ❌ |
| Inhibited alerts | ❌ |
| Routing/delivery status | ❌ |
| Acknowledgement | ❌ |

**Derived alert rules** (`getMonitoringAlerts`):
- errorRate > 5% warning, > 20% critical
- unhealthyWorkers > 0
- delayedOrStuckJobs > 10
- staleVehicles
- recentFailures (max 3 einzelne Poll-Failure Cards)

### 6.3 Bewertung

Master Admin erfüllt **nicht** die Anforderung „gibt es einen Alert? wurde er zugestellt? wurde er acknowledged?“. Es zeigt eine **vereinfachte SynqDrive-spezifische Subset-Warnliste**, die mit Prometheus/AM **nicht korreliert** ist.

**Empfehlung (Target State):** AM Summary API (firing count by severity, silenced count, last notification) als Backend-Aggregat — nicht Prometheus UI embedden.

---

## 7. Core Services

| Service | Primary View | Health Signal | Last Check | Latency/Errors | Drilldown |
|---------|--------------|---------------|------------|----------------|-----------|
| Backend API | Readiness „workers“ | ok/error | implicit in readiness call | ❌ | Platform Health only |
| PostgreSQL | Readiness check | ok/error + responseMs | on each platform-health | ❌ in UI | ❌ |
| Redis | Readiness check | ok/error + responseMs | on each platform-health | ❌ | ❌ |
| ClickHouse | Readiness + details blob | available/disabled/degraded | lastPingAt in details (nicht prominent) | ingestion probe in details | ❌ |
| Nginx | **Nicht in UI** | blackbox SSL alert nur AM | — | — | Grafana |
| PM2 / App processes | Readiness „workers“ | RuntimeStatusRegistry | ❌ | ❌ | SystemMonitoringView orphan |

**Gap:** Keine dedizierte Service-Detail-Seite mit Latency/Error-Rate Trends — nur Snapshot.

---

## 8. Host Infrastructure

| Metrik | In MA UI | In Grafana/AM |
|--------|----------|---------------|
| CPU | ❌ | node_exporter |
| RAM | ❌ | node_exporter |
| Disk | ❌ | node_exporter + backup textfile |
| Load | ❌ | node_exporter |
| Filesystem | ❌ | node_exporter |
| Network | ❌ | node_exporter |
| Container health | ❌ | Docker (local dev only) |
| Host uptime | ❌ | node_exporter |

**Bewertung:** Host-Metriken sind **bewusst ausgelagert** — korrekt für Control-Plane-Philosophie, aber Dashboard zeigt **keinen** kompakten Host-Summary-Chip (z.B. „Disk 78% — warning“) aus AM/Prometheus-Aggregat.

---

## 9. PostgreSQL

| Aspekt | UI |
|--------|-----|
| Availability | Readiness row „postgres“ ok/error |
| Connections | ❌ |
| Disk | ❌ (nur via node_exporter extern) |
| Query problems | ❌ |
| Locks | ❌ |
| Backup | Resilience `postgres.lastSuccessAt` — **nur im Dashboard DTO, nicht in Platform Health UI** |
| Replication | ❌ |

Rohdaten korrekt nicht in Primary View — aber **Backup-Status** sollte in Ops-Übersicht sichtbar sein.

---

## 10. ClickHouse

| Aspekt | UI | Backend |
|--------|-----|---------|
| Availability | Readiness check | `ClickHouseService.getStatus()` — disabled ≠ fault |
| Disk | ❌ UI | `getStorageStats()` in readiness details |
| Insert pipeline | ❌ UI | `summarizeRecentIngestion` in readiness |
| Query failures | ❌ | — |
| Background merges | ❌ | — |
| Backup | Resilience DTO field | `clickhouse.lastSuccessAt` in JSON |
| Data freshness | ❌ | ingestion timestamps in readiness details |
| Schema drift | ❌ UI | `schemaDrift`, `pendingMigrationCount` in details |

**Positiv:** Kanonische CH-Architektur respektiert — `disabled` blockiert nicht readiness.  
**Negativ:** CH-Details in Platform Health nur als kleiner Text unter readiness — **nicht handlungsorientiert**.

---

## 11. Redis / BullMQ

### Redis

| Aspekt | UI |
|--------|-----|
| Health | Readiness „redis“ ok/error |
| Memory | ❌ |
| Persistence | ❌ (docs: `redis-backup.md`, scripts) |

### BullMQ (Platform Health)

| Feld | Overview | Detail |
|------|----------|--------|
| waiting/active/delayed/failed | ✅ Queue table | — |
| completed/paused | Backend hat Daten, **UI zeigt nicht** | — |
| stalled | ❌ | — |
| retry/dead letter | ❌ per-queue | — |
| status chip | healthy/warning/critical/idle | Thresholds: failed>10 OR delayed>50 → critical |

**QueueMonitoringService thresholds:**
- critical: `failed > 10 || delayed > 50`
- warning: `failed > 0 || delayed > 10 || waiting > 100`

**Bewertung:** Overview-level ausreichend für „gibt es ein Queue-Problem?“ — Detail (job inspect, DLQ) fehlt in MA, gehört ggf. in Admin-Tooling mit Step-up.

---

## 12. Worker

### Inventar (produktiv, aus Architektur + Code)

| Worker/Job-Typ | In MA UI | Health Signal |
|----------------|----------|---------------|
| DIMO Snapshot (30s) | Poll logs / worker table (orphan) | failureRatio in workers API |
| DIMO Vehicle Sync | same | same |
| DTC Poll | same | same |
| Trip Tracking V2 | same | same |
| Trip Behavior Enrichment | enrichment pending KPI | delayedOrStuckJobs |
| Tire Recalculation | worker table | same |
| Notification evaluation | ❌ | metrics only (Grafana) |
| Document intake | ❌ | Grafana dashboard |
| Voice webhooks | Voice Assistant tab | queue failed/waiting |
| Battery V2 | ❌ | Prometheus |
| ClickHouse mirror | ❌ | CH readiness ingestion |

### Worker-Darstellung

`getMonitoringWorkers()` leitet Status aus **Poll-Log-Erfolgsrate** ab — nicht aus BullMQ process heartbeat.

**Kritisch:** „Process running“ ≠ „fachlich healthy“ — teilweise adressiert durch failureRatio, aber **kein** letzter erfolgreicher Job pro Queue in Platform Health, nur in orphan SystemMonitoringView.

---

## 13. Scheduler / Cron

| Scheduler (Beispiele) | UI-Sichtbarkeit |
|-----------------------|-----------------|
| DimoSnapshotScheduler (30s) | Indirekt via poll logs |
| TireRecalculationScheduler (1h) | ❌ |
| BrakeRecalculationScheduler (1h) | ❌ |
| TripTrackingRecoveryScheduler (5m) | ❌ |
| Notification evaluation scheduler | ❌ |
| Document retention (04:30) | ❌ |
| Invoice overdue | ❌ |
| Battery retention (04:00) | ❌ |
| Data retention (03:30) | ❌ |

**Bewertung:** Kein kanonisches **Scheduler Ops Board**. Der historische Scheduler-Fehler wäre in UI **nicht** als „missed execution“ sichtbar gewesen.

**Target:** Backend Scheduler Registry → MA „Processing“ Section mit lastRun/nextRun/status.

---

## 14. Backup & Disaster Recovery

### Backend (`PlatformResilienceStatusService`)

| Quelle | Felder |
|--------|--------|
| `SYNQDRIVE_RESILIENCE_STATUS_JSON` | postgres, clickhouse, offsite, restoreValidation |
| Prometheus textfile `synqdrive_backup.prom` | postgres last success timestamp |
| Fallback | all `unknown` |

Thresholds: ok ≤26h, stale ≤72h, failed >72h since last backup.

### UI-Darstellung

| Element | Wo |
|---------|-----|
| Dashboard Backup domain chip | ok/warning/critical/unknown |
| Backup incident | Bei resilience critical/warning |
| Drilldown | `architektur` — **Dokumentation, kein Live Backup Panel** |
| Platform Health | **Kein Backup-Abschnitt** |
| Restore validation | DTO existiert, **nicht gerendert** |
| Offsite copy status | DTO existiert, **nicht gerendert** |
| RPO/RTO context | Nur in remediation docs |

**Kritisch:** Existierendes Backup ≠ gesunder DR-State — Restore Verification wird nicht in UI kommuniziert.

---

## 15. External Platform Integrations

| Integration | UI Surface | Provider vs Integration vs Tenant |
|-------------|------------|-----------------------------------|
| DIMO | Platform Health, Connected Vehicles, Dashboard connectivity | ⚠️ Token health in orphan view; platform degraded banner in CV UI-7 |
| Stripe | Billing Reconciliation, Dashboard billing domain | ✅ Webhook errors als Stripe component |
| Notifications/Resend | Dashboard `failedEmailDeliveries` proxy | ❌ Kein dedicated notification ops |
| Twilio | Voice Assistant platform status | ✅ Provider label |
| ElevenLabs | Voice Assistant | ✅ Provider label |
| High Mobility | HM Data View streaming tab | ✅ Separate integration domain |
| Parts/Insurances partners | Health tabs | ✅ Partner-level, not platform |

**Tenant-spezifische Probleme** gehören in Org/Vehicle Hubs — größtenteils korrekt getrennt (UI-5, UI-7).

---

## 16. Logs & Diagnostics

| Capability | Status |
|------------|--------|
| Poll log viewer | SystemMonitoringView orphan — paginated, filterable |
| Activity log | `activity-log` view — admin actions, not infra |
| Correlation IDs in MA | ❌ |
| Request ID drilldown | ❌ |
| Grafana/Loki links | ❌ |
| Vehicle Logbook raw | Debug per vehicle |

**Bewertung:** Kein Full Log Viewer in MA — korrekt. Aber **kein** „Open in Grafana Explore“ Deep Link mit vorgefülltem Query.

---

## 17. Alert Fatigue

| Pattern | Risiko |
|---------|--------|
| Poll failure → individual alert cards (max 3) + error rate alert | Mittel |
| Queue critical + Worker incident + Platform alert | **Hoch** — gleiche Ursache, mehrfach |
| Billing failed payment + reconciliation drift + stripe webhook | Mittel — fachlich unterschiedlich, aber korreliert |
| staleVehicles info/warning | Niedrig |
| Dashboard zeigt max 5 incidents, Platform Health max 10 alerts | Caps helfen |
| Alertmanager grouping | **Nicht in UI** — AM dedupiert, MA nicht |

**Low-value Alerts:** `staleVehicles` info bei 1-5 Fahrzeugen — geringer Entscheidungswert auf Plattformebene (gehört in Connected Vehicles Attention).

---

## 18. Actionability

| Problem-Typ | Kann MA heute… |
|-------------|----------------|
| Queue failed jobs | Sehen — **nicht** retry/requeue in UI |
| DIMO token expired | Nur in orphan Token Health view |
| Backup stale | Incident → Architektur docs |
| Stripe webhook fail | Drilldown → Billing reconciliation ✅ |
| Support critical | Drilldown → Support ✅ |
| Org billing issue | Drilldown → Billing ✅ |
| Vehicle connectivity | Drilldown → Connected Vehicles ✅ |
| Grafana trend | Manuell SSH tunnel — **kein Link** |
| Runbook | ❌ |
| Acknowledge incident | ❌ |

**Positiv:** Dashboard Drilldowns zu fachlichen Hubs (UI-4 Blueprint teilweise umgesetzt).  
**Negativ:** Infrastruktur-Probleme enden in Docs oder Dead Links.

---

## 19. Privileged Operations Actions

| Action | Existiert | Permission | Step-up | Audit | Risk |
|--------|-----------|------------|---------|-------|------|
| Refresh snapshot | Platform Health button | MASTER_ADMIN | ❌ | ❌ | Low |
| Billing reconciliation run | Billing tab | MASTER_ADMIN | ❌ | ? | Medium |
| Voice: replay webhook, suspend org | Voice Assistant | MASTER_ADMIN | partial | ? | High |
| Vehicle deregister | Connected Vehicles | MASTER_ADMIN | ❌ | activity log | High |
| Prune master data | API only `POST /admin/prune` | MASTER_ADMIN | **StepUpGuard** | audit | Critical |
| Retry queue job | ❌ | — | — | — | — |
| Silence alert | ❌ | — | — | — | — |
| Acknowledge incident | ❌ | — | — | — | — |
| Trigger backup | ❌ (scripts only) | — | — | — | — |
| Restart worker | ❌ | — | — | — | — |

**Positiv:** Destructive prune hat Step-up.  
**Negativ:** Keine sicheren, auditierbaren Retry-Aktionen für Queues — korrekt kein „Restart everything“, aber auch kein geführter Safe Retry.

---

## 20. Data Freshness

| Surface | Last Update | Interval | Stale Handling |
|---------|-------------|----------|----------------|
| Dashboard operational | `generatedAt` | 60s poll | `MasterStaleDataHint` |
| Platform Health | `generatedAt` in meta | 60s poll | ❌ no stale banner |
| Nav badges | operational cache | shared hook | — |
| Queue counts | live on each request | per platform-health | — |
| Resilience status | file mtime implicit | on request | unknown if file stale |
| Billing overview | embedded timestamp | 60s | partial |
| Readiness checks | per platform-health call | 60s | — |

**Risiko:** 60s auto-refresh ohne Stale-UX auf Platform Health; Resilience JSON kann veraltet sein ohne Indikator.

---

## 21. Visual Hierarchy

### Dashboard (UI-4)
- ✅ Critical first: Status Hero border, incident list top
- ✅ Domain chips als sekundäre Navigation
- ✅ Gesundes System visuell ruhig (grüner/neutraler Hero)
- ⚠️ Viele Domain Cards — auf Mobile lang

### Platform Health
- ⚠️ Flache KPI-Grid — alle gleich gewichtet
- ⚠️ Queues und Alerts gleiche visuelle Ebene
- ⚠️ Observability card am Ende — korrekt priorisiert als Referenz
- ❌ Keine Incident-Sektion — Alerts ohne Kontext

### SystemMonitoringView (orphan)
- ✅ Bessere Informationsdichte für Power Users
- ❌ EN labels, nicht Page Framework konform

---

## 22. Responsive

| Surface | Smartphone | Tablet | Desktop | Issues |
|---------|------------|--------|---------|--------|
| Dashboard Hero + Incidents | ✅ stacks | ✅ | ✅ | Domain chips wrap |
| Platform Health KPIs | 1-col | 2-col | 4-col | Queue table horizontal scroll |
| Platform Health Alerts | ✅ | ✅ | ✅ | — |
| SystemMonitoringView | designed responsive | ✅ | ✅ | unreachable |
| Voice Assistant metrics | grid collapses | ✅ | ✅ | — |
| HM Streaming diagnostics | ✅ | ✅ | ✅ | — |

**Mobile Fokus:** Incidents im Dashboard oben — gut. Platform Health zeigt Rohmetriken vor Handlungsempfehlung — **mittel**.

---

## 23. Accessibility

| Check | Dashboard | Platform Health |
|-------|-----------|-----------------|
| Severity not color-only | ✅ StatusChip + text | ✅ |
| sr-only hero title | ✅ | ❌ |
| aria-label refresh | ✅ | ❌ (button without aria-label) |
| Keyboard nav domain chips | ✅ buttons | — |
| Live regions | Stale hint `aria-live` | ❌ |
| Tables | DataTable patterns | ✅ |
| Charts | Minimal charts | N/A |

**Score driver:** Platform Health Refresh-Button ohne `aria-label`; keine `aria-live` für Alert-Updates.

---

## 24. Technical Architecture

### Data Fetching

```
MasterDashboardView
  └─ useMasterDashboardOperational (60s)
       └─ GET /admin/dashboard/operational
            ├─ getPlatformHealth()
            ├─ billing overview
            ├─ connectivity summary
            ├─ resilience status (sync file read)
            └─ support stats

PlatformHealthView
  └─ GET /admin/platform-health (60s)
       ├─ HealthService.checkReadiness()
       ├─ getMonitoringSummary(1h)
       ├─ getMonitoringAlerts(1h)
       ├─ QueueMonitoringService (live Redis)
       └─ Prisma dimo counts

SystemMonitoringView (ORPHAN)
  └─ Multiple parallel calls to /admin/monitoring/*
```

### Duplicated Fetching

- `getPlatformHealth()` called inside operational dashboard **and** standalone Platform Health page — **duplicate** when both mounted (nicht gleichzeitig, aber gleiche Last bei Navigation)
- Alerts computed twice if user hits dashboard then platform-health

### Frontend Health Derivation

| Location | Derivation |
|----------|------------|
| `PlatformHealthView` | `overallTone()`, error rate thresholds, enrichment >50 |
| `MasterDashboardView` | `overallStatusTone`, `domainLevelTone` |
| `useMasterNavBadges` | `operationalToNavBadgeState` |
| `SystemMonitoringView` | `timeAgo()` lokal — **anti-pattern** |

**Kein** paralleler Prometheus-Stack im Frontend — ✅

### Security

- Platform Admin Controller: `@Roles('MASTER_ADMIN')` + `MasterAdminMfaGuard`
- Metrics bearer token: nur Flag „konfiguriert“, nicht exponiert
- Grafana/Prometheus URLs: localhost — kein Token-Leak
- SSH hint enthält Hostname — akzeptabel für MA

---

## 25. Duplicate Truth Risks

| Domäne | Quelle A | Quelle B | Risiko |
|--------|----------|----------|--------|
| Overall status | Dashboard operational | Platform Health | Medium — unterschiedliche Logik |
| Alerts | Platform Health alerts | Dashboard incidents | Medium — Überlappung |
| DIMO health | Platform Health dimo counts | Connected Vehicles overview | Low — UI-7 kanonisiert |
| Worker health | Queue table status | Poll log worker API | Medium — verschiedene Metriken |
| Backup | Resilience DTO | Prometheus textfile | Low — gleiche Quelle |
| Stripe | Billing operational | Dashboard billing card | Low — gleiche Pipeline |
| Voice incidents | Voice platform status | Dashboard | High — nicht integriert |
| AM firing | Alertmanager | MA derived alerts | **High** — keine Korrelation |

---

## 26. Findings P0–P3

### P0 — Blocker für trustworthy Ops

| ID | Finding |
|----|---------|
| P0-1 | `SystemMonitoringView` nicht geroutet — Worker/Poll/Token Detail UI verloren |
| P0-2 | Platform Health → Settings/monitoring → Redirect-Loop (Dead Link) |
| P0-3 | Alertmanager-State nicht in MA — Ops sieht nicht was wirklich feuert/gestillt wurde |
| P0-4 | Backup/DR Drilldown zeigt auf Architektur-Docs statt Live Resilience Panel |

### P1 — Major gaps

| ID | Finding |
|----|---------|
| P1-1 | Kein persistentes Incident-Modell (Ack/Owner/Resolution/Timeline) |
| P1-2 | `opsTab=workers` URL wird nicht von Platform Health konsumiert |
| P1-3 | Host/PM2/Nginx/Docker nicht als Summary in Control Plane |
| P1-4 | Scheduler/Cron Health komplett unsichtbar |
| P1-5 | ClickHouse/Backup/Restore Details in DTO aber nicht in Primary UI |
| P1-6 | Notification Engine Ops fehlt — nur Billing Email-Fail Proxy |
| P1-7 | Grafana/Prometheus URLs nicht klickbar — erschwert Actionability |
| P1-8 | EN/DE Mix in orphan SystemMonitoringView |

### P2 — Should fix

| ID | Finding |
|----|---------|
| P2-1 | Dashboard vs Platform Health overallStatus Divergenz |
| P2-2 | Alert fatigue — Queue+Worker+Alert Redundanz |
| P2-3 | Platform Health ohne Stale-Data-Hint |
| P2-4 | Voice incidents nicht in Dashboard Incident Feed |
| P2-5 | Resilience `source: none` → silent unknown — sollte prominent sein |
| P2-6 | Queue table fehlt completed/paused/stalled Spalten |
| P2-7 | Readiness degraded → full critical may over-escalate soft deps |

### P3 — Polish / scale

| ID | Finding |
|----|---------|
| P3-1 | Platform Health Refresh ohne aria-label |
| P3-2 | staleVehicles alerts low value on platform page |
| P3-3 | Vehicle Logbook Workers tab verwechselbar mit Fleet Worker Ops |
| P3-4 | Architektur/Changes als Ops-Ziele — falsche Erwartung |
| P3-5 | Duplicate getPlatformHealth fetch on navigation |

---

## 27. Recommended Target State

### 27.1 Information Architecture (UI-8.2 Blueprint)

**Ein Hub: „Plattform & Betrieb“** (oder Erweiterung Platform Health + Dashboard Merge)

```
Plattform & Betrieb (?view=platform-ops)
├── Übersicht          — Status Hero, Incidents, Domain KPIs (aus operational DTO)
├── Dienste            — Core readiness + CH/PG/Redis summary
├── Verarbeitung       — Queues + Worker + Scheduler Board
├── Integrationen      — DIMO, Stripe, Voice, Notifications (Links zu bestehenden Hubs)
├── Resilienz          — Backup/DR/Restore/Offsite live panel
├── Vorfälle           — Incident inbox (persistent, ack, owner)
└── Diagnostik         — Poll logs, Token health, Links Grafana/AM (MERGE SystemMonitoringView)
```

**Entfernen/Konsolidieren:**
- `SystemMonitoringView` → in Diagnostik-Tab mergen (nicht löschen)
- Settings monitoring redirect → direkt zu Diagnostik
- Architektur als Backup-Drilldown → durch Resilienz-Tab ersetzen

### 27.2 Backend Contracts (kanonisch)

| API | Zweck |
|-----|-------|
| `GET /admin/ops/overview` | overallStatus, domains, generatedAt, stale |
| `GET /admin/ops/incidents` | persistent incidents + ack state |
| `GET /admin/ops/services` | readiness + lastCheck + latency |
| `GET /admin/ops/queues` | BullMQ live |
| `GET /admin/ops/workers` | worker registry + last success |
| `GET /admin/ops/schedulers` | cron registry |
| `GET /admin/ops/resilience` | backup/DR (exists, surface in UI) |
| `GET /admin/ops/alertmanager-summary` | firing/silenced/pending counts — **read-only AM API** |
| `GET /admin/monitoring/*` | keep for diagnostics drilldown |

### 27.3 Control Plane vs Tooling (final)

| In SynqDrive | In Grafana/AM |
|--------------|---------------|
| Status, Incidents, Queue summary, Integration health, Backup summary, Drilldown links | Time series, host metrics, alert rule tuning, silences, log exploration |

### 27.4 Incident Model Target

- Alerts (AM) → gruppiert → Incidents (persistent)
- Ack, owner, resolvedAt, runbookUrl
- Tenant impact wo relevant
- Kein Alert-Storm in UI — AM grouping + MA inbox caps

### 27.5 Phase Roadmap

| Phase | Deliverable |
|-------|-------------|
| UI-8.2 | Canonical Platform Ops Blueprint |
| UI-8.3 | Merge SystemMonitoringView + fix dead links + Resilience panel |
| UI-8.4 | AM summary integration + Scheduler board |
| UI-8.5 | Persistent incidents + ack |

---

## Scores (0–100)

| Kriterium | Score | Kurzbegründung |
|-----------|-------|----------------|
| Operational Clarity | **52** | Dashboard gut, aber fragmentiert + tote Pfade |
| Incident Visibility | **45** | Synthetische Incidents, kein Lifecycle |
| Service Health Clarity | **58** | Readiness solide, wenig Tiefe |
| Queue/Worker Clarity | **50** | Queues sichtbar, Worker-Detail verwaist |
| Backup/DR Visibility | **38** | DTO vorhanden, UI fast absent |
| Alert Quality | **42** | Derived ≠ AM, fatigue risk |
| Actionability | **48** | Billing/CV drilldowns gut, Infra schwach |
| Data Trustworthiness | **50** | Stale gaps, dual overall status |
| Visual Hierarchy | **55** | Dashboard UI-4 gut, PH flach |
| Responsive UX | **54** | Grundsolide, Mobile Incidents ok |
| Accessibility | **50** | Inkonsistent zwischen Views |
| Technical Cleanliness | **44** | Orphan views, redirect loops, duplicate fetches |

**Gesamt Production Readiness (Platform Operations UI): 47/100**

---

## Appendix: Key File References

| Bereich | Pfad |
|---------|------|
| Dashboard | `frontend/src/master/components/MasterDashboardView.tsx` |
| Platform Health | `frontend/src/master/components/PlatformHealthView.tsx` |
| System Monitoring (orphan) | `frontend/src/master/components/SystemMonitoringView.tsx` |
| Operational API | `backend/src/modules/platform-admin/platform-dashboard.service.ts` |
| Platform Health API | `backend/src/modules/platform-admin/platform-admin.service.ts` |
| Readiness | `backend/src/modules/health/health.service.ts` |
| Resilience | `PlatformResilienceStatusService` in platform-dashboard.service.ts |
| Queue monitoring | `backend/src/modules/observability/queue-monitoring.service.ts` |
| Observability docs | `docs/remediation/observability-architecture.md` |
| Alertmanager docs | `docs/remediation/alertmanager.md` |

---

**Changes:** nicht aktualisiert (read-only audit)  
**Architektur:** nicht aktualisiert (read-only audit)
