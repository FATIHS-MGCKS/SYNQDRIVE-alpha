# Master Admin — Kanonisches Platform Operations Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-8.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-platform-operations-deep-audit.md` (UI-8.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-dashboard-blueprint.md` (UI-4.2)
- `docs/remediation/observability-architecture.md` (Phase 2F.1)
- `docs/remediation/alertmanager.md` (Phase 2F.2)
- `docs/remediation/redis-backup.md`, `offsite-backups.md`, `disaster-recovery-production-readiness.md`
- `docs/remediation/clickhouse-*.md`
- `architecture/MASTER_ADMIN_OBSERVABILITY_ARCHITECTURE_2026-07-26.md`
- `architecture/MASTER_ADMIN_ALERTMANAGER_2026-07-26.md`

**Leitfrage:** *Was ist kaputt, wie groß ist der Impact, und wo muss ich hin?*

**Grundsatz:** SynqDrive baut **keine** zweite Grafana-, Prometheus- oder Server-Admin-Oberfläche. Die Master-Admin-Control-Plane aggregiert **kanonische Signale** aus Backend und Observability-Stack und leitet zu fachlichen Deep-Dives oder externen Tools weiter.

---

## 0. Produktrolle & Abgrenzung

| Plattform & Betrieb **ist** | Plattform & Betrieb **ist nicht** |
|-----------------------------|-----------------------------------|
| Operative Control Plane für Plattformzustand | Grafana-Dashboard-Klon |
| Incident-Inbox und Service-Übersicht | Prometheus Rule Explorer |
| Queue-/Worker-/Scheduler-Ops-Summary | Vollständige BullMQ-Konsole |
| Backup/DR-Status und Resilience-Signale | Alertmanager Silence-UI |
| Gezielte Diagnose-Drilldowns + externe Links | Host-SSH-Shell oder PM2-Konsole |
| Tenant-Impact auf Plattformebene | Tenant-Lifecycle (→ Organisationen) |

| Verwandte Hubs — **bleiben eigenständig** | Rolle |
|-------------------------------------------|-------|
| Plattform-Übersicht (`dashboard`) | Cross-Domain-Einstieg — „Was ist wichtig?“ |
| Master-Abrechnung (`billing`) | Stripe/Webhooks/Reconciliation |
| Verbundene Fahrzeuge (`vehicles`) | DIMO/Connectivity Governance |
| Voice Assistant (`voice-assistant`) | Voice AI Control Plane |
| High Mobility (`high-mobility`) | HM Streaming/OEM |
| Support (`support`) | Ticket-Ops |
| Architektur (`architektur`) | **Dokumentation** — kein Live-Monitoring |

**10-Sekunden-Ziel (nach Umsetzung):** Master Admin sieht im ersten Viewport: globaler Plattformzustand, aktive Vorfälle, degradierte Dienste — ohne Rohmetrik-Flut.

---

## 1. Information Architecture

### 1.1 Entscheidung: Ein Hub, sieben Primärbereiche

Nach fachlicher Prüfung (nicht 1:1 Ist-Navigation übernommen):

| # | Bereich | Behalten? | Begründung |
|---|---------|-----------|------------|
| 1 | **Übersicht** | **Ja** | Ops-Einstieg — Global State, kritische Signale, Domain-Chips |
| 2 | **Vorfälle** | **Ja** | Incident Inbox — getrennt von Alert-Rohliste |
| 3 | **Dienste** | **Ja** | Core/Processing/Edge/External gruppiert — kein DBA-Klon |
| 4 | **Verarbeitung** | **Ja** | Queues, Worker, Scheduler — operative Verarbeitungsschicht |
| 5 | **Infrastruktur** | **Ja** | Host-Kapazitätsrisiko — kompakt, nicht 20 Mini-Charts |
| 6 | **Resilienz** | **Ja** | Backup/DR/Restore — eigene fachliche Domäne |
| 7 | **Diagnostik** | **Ja** | Progressive Disclosure — Poll Logs, Token, AM-Summary, Tool-Links |
| — | Separates „Monitoring"-Settings-Tab | **Nein** | → Diagnostik |
| — | `SystemMonitoringView` als Root | **Nein** | → Diagnostik mergen |
| — | `platform-health` als parallele Root | **Nein** | → Hub `platform-ops` |
| — | Architektur als Backup-Drilldown | **Nein** | → Resilienz |
| — | Dashboard als Ops-Ersatz | **Nein** | Dashboard bleibt Cross-Domain; Ops-Detail hier |

**Keine Mikro-Pages:** Service Detail und Incident Detail sind **Drawer oder Full-Page unter dem Hub** — keine eigenen Sidebar-Roots.

### 1.2 Ziel-Navigationsbaum

```
Plattform & Betrieb  (?view=platform-ops)
├── Übersicht                    platformOps=overview
├── Vorfälle                     platformOps=incidents
│   └── Detail                   &incidentId={id}
├── Dienste                      platformOps=services
│   └── Detail                   &serviceId={id}
├── Verarbeitung                 platformOps=processing
│   └── Unter-Tabs               platformOpsTab=queues|workers|schedulers
├── Infrastruktur                platformOps=infrastructure
├── Resilienz                    platformOps=resilience
└── Diagnostik                   platformOps=diagnostics
    └── Unter-Tabs               platformOpsTab=alerts|poll-logs|token-health|tools
```

**Sidebar:** Ein Eintrag unter Gruppe „Plattformbetrieb":
- **Label:** „Plattform & Betrieb"
- **View ID:** `platform-ops` (ersetzt `platform-health`)
- **Badge:** `platform-critical` (bestehend)
- **Permission:** `MASTER_ADMIN` + MFA (bestehend)

**Redirects (verbindlich):**

| Alt | Neu |
|-----|-----|
| `?view=platform-health` | `?view=platform-ops&platformOps=overview` |
| `?view=settings&settingsTab=monitoring` | `?view=platform-ops&platformOps=diagnostics` |
| `?view=platform-health&opsTab=workers` | `?view=platform-ops&platformOps=processing&platformOpsTab=workers` |
| Dashboard Drilldown Backup | `platformOps=resilience` (nicht `architektur`) |
| Dashboard Drilldown Worker | `platformOps=processing&platformOpsTab=queues` |

### 1.3 Cross-Links (verbindlich)

| Von | Nach | Trigger |
|-----|------|---------|
| Dashboard Status Hero Domain-Chip | Passender `platformOps` Tab | Chip-Klick |
| Dashboard Incident-Zeile | Vorfälle Detail | `incidentId` |
| Dienste → DIMO | Verbundene Fahrzeuge Übersicht | „Fahrzeug-Governance öffnen" |
| Dienste → Stripe | Billing → Abgleich | „Abrechnungs-Abgleich öffnen" |
| Dienste → Voice | Voice Assistant | „Voice Control Plane öffnen" |
| Dienste → Notifications | Diagnostik oder Billing KPI | Kontextabhängig |
| Vorfälle → betroffene Org | Organisationen Detail | Org-Link wenn `organizationIds` |
| Resilienz → Runbook | Externe Doku-URL | Runbook-Link aus DTO |
| Diagnostik → Grafana | SSH-Hinweis + Panel-Deep-Link | „In Grafana öffnen" (wenn Tunnel aktiv) |
| Nav Badge `platform-critical` | `platformOps=incidents` gefiltert critical | Badge-Klick |

### 1.4 Page Shell (UI-2)

```
MasterAdminShell
└── PageContainer variant="wide"
    ├── MasterPageHeader
    │   variant="context"
    │   title: „Plattform & Betrieb"
    │   description: „Plattformzustand, Vorfälle, Dienste und Resilienz"
    │   status: globalPlatformState Chip
    │   meta: generatedAt + staleHint
    │   actions: Daten neu laden | Externe Tools (Overflow)
    ├── MasterPageTabs (7 Primärbereiche — URL-gebunden)
    └── Page Content (eine Scroll-Achse)
```

---

## 2. Operations Overview (Tab: Übersicht)

### 2.1 Zweck

Beantwortet in **< 15 Sekunden** (erster Viewport, Desktop ≥1280px):

| Frage | UI-Element |
|-------|------------|
| Ist die Plattform betriebsbereit? | **Global Platform State** Chip |
| Gibt es aktive Vorfälle? | **Active Incidents** (max 5, Link zu Vorfälle) |
| Welche Dienste sind degradiert? | **Degraded Services** Liste (nur ≠ healthy) |
| Welche Signale sind kritisch? | **Critical Operational Signals** (max 6) |
| Wann zuletzt aktualisiert? | `generatedAt` + `MasterStaleDataHint` |

**Kein** vollständiges Service-Grid, keine Queue-Tabelle, keine Host-Charts auf Übersicht.

### 2.2 Layout (Above the Fold)

```
┌─ Global Platform State ─────────────────────────────────────────────┐
│ [●] Plattform: Degradiert          Stand: …  [↻]                    │
│ 2 aktive Vorfälle · 1 Organisation betroffen                        │
│ Domain-Chips: [Kern ●] [Verarbeitung ●] [Edge ○] [Extern ●] [Resilienz ○] │
└─────────────────────────────────────────────────────────────────────┘

┌─ Aktive Vorfälle (max 5) ───────────────────────────────────────────┐
│ Severity | Titel | Komponente | Seit | → Detail                       │
│ „Alle Vorfälle" → platformOps=incidents                              │
└─────────────────────────────────────────────────────────────────────┘

┌─ Degradierte Dienste (nur wenn vorhanden) ──────────────────────────┐
│ Service | Zustand | Letzter Check | Signal | → Service Detail        │
└─────────────────────────────────────────────────────────────────────┘

┌─ Kritische operative Signale (nur wenn vorhanden) ──────────────────┐
│ Kurztext-Signale: Queue-Failures, Backup stale, AM firing, …        │
│ Max 6 — rest in jeweiligem Tab                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Healthy State

Wenn `globalPlatformState === healthy` und keine aktiven Vorfälle:

- Ruhige Zeile: „Plattform betriebsbereit"
- **Kein** Success-Banner, keine MetricCard-Flut
- Domain-Chips alle grün/neutral
- Sektionen „Degradierte Dienste" und „Kritische Signale" **ausgeblendet** (nicht leere Boxen)

### 2.4 Domain-Chips (5 — nicht 6)

Vereinfacht gegenüber Dashboard (6) — Ops-fokussiert:

| Chip | Critical | Degraded | Healthy | Unknown/Stale |
|------|----------|----------|---------|---------------|
| **Kern** | postgres/redis/api down | readiness soft-fail, latency high | alle hard checks ok | API error / stale |
| **Verarbeitung** | queue critical, scheduler missed | queue warning, worker unhealthy | queues idle/ok | — |
| **Edge** | nginx/ssl blackbox fail | cert expiry warning | ok | — |
| **Extern** | integration critical (DIMO auth, Stripe webhook) | degraded integration | ok | — |
| **Resilienz** | backup failed, restore validation failed | backup stale, offsite stale | all tiers ok | `source: none` |

**Berechnung:** Serverseitig in `GET /admin/ops/overview` — Frontend mappt nur.

### 2.5 Unterschied zu Dashboard

| Dashboard (`view=dashboard`) | Ops Übersicht (`platformOps=overview`) |
|-----------------------------|----------------------------------------|
| Cross-Domain (Billing, Support, Orgs) | **Nur Plattform-Ops** |
| Business Context (MRR, Prospects) | **Nicht** |
| Org Attention | Nur wenn Plattform-Incident Org-Impact |
| Breitere Domain Summaries | Fokus auf Kern/Verarbeitung/Resilienz |

Dashboard verweist per CTA und Chips hierher — **keine Duplikation** der Incident-Liste auf beiden Seiten mit unterschiedlicher Logik. Dashboard zeigt max 3 Incident-Zeilen als Teaser; kanonische Liste lebt in Vorfälle.

---

## 3. Platform Health Model

### 3.1 Kanonische UI-Zustände

| UI-State | DE Label | Bedingung (Backend liefert) | Visuell |
|----------|----------|------------------------------|---------|
| `healthy` | Betriebsbereit | Kein critical/degraded Signal in Scope | `StatusChip success` |
| `degraded` | Eingeschränkt | Warning-level — Service teilweise betroffen | `StatusChip warning` |
| `critical` | Kritisch | Hard failure oder Business-continuity risk | `StatusChip critical` |
| `unknown` | Unbekannt | Quelle fehlt, `source: none`, API partial fail | `StatusChip neutral` + Tooltip |
| `stale` | Veraltet | `generatedAt` > staleThreshold — **Meta-Overlay** | `MasterStaleDataHint` + gedämpfter Chip |

**Regel:** UI **berechnet keinen** eigenen Gesundheitszustand aus Rohmetriken. Mapping nur:

```
backend.overallStatus → UI-State
  'warning' → 'degraded'   // einheitliche DE-Terminologie
  'ok' → 'healthy'         // readiness
  'degraded' → 'degraded' // readiness soft
  'error' → 'critical'
```

`stale` ist **kein** Ersatz für `healthy` — bei Stale: Chip zeigt letzten bekannten Zustand + Stale-Banner.

### 3.2 Aggregationshierarchie (serverseitig)

```
globalPlatformState = f(
  activeIncidents[].severity,
  services[].state,
  resilience.overall,
  alertmanagerSummary.firingCritical,
  dataFreshness.stale
)
```

**Eskalationsregeln (Backend — nicht Frontend):**

| Regel | Verhalten |
|-------|-----------|
| Ein critical Kernservice (PG, Redis, API) | `globalPlatformState = critical` |
| Nur soft dependency degraded (documentExtraction) | `degraded` — **nicht** full critical |
| ClickHouse `disabled` | `healthy` für Kern — optional badge „deaktiviert" |
| Ein warning Queue | `degraded` — nicht critical |
| Resilience backup > 72h | `critical` auf Resilienz-Chip; global mindestens `degraded` |
| Alle Quellen unknown | `unknown` — nie `healthy` |
| Stale > threshold | Meta `stale` + letzter bekannter State |

### 3.3 Orthogonale Dimensionen (nicht fusionieren)

| Dimension | Beispiel | Darstellung |
|-----------|----------|-------------|
| **Availability** | Postgres erreichbar | Service Detail |
| **Processing health** | Queue failed > 0 | Verarbeitung Tab |
| **Integration health** | DIMO token expired | Dienste → Extern |
| **Resilience** | Backup age | Resilienz Tab |
| **Provider vs Integration** | DIMO API down vs SynqDrive token | getrennte Zeilen (§12) |

---

## 4. Incident Center

### 4.1 Alerts ≠ Incidents

| Konzept | Definition | UI-Ort |
|---------|------------|--------|
| **Alert** | Einzelnes firing/pending Signal (AM oder derived rule) | Diagnostik → Alerts (gruppiert) |
| **Incident** | Aggregiertes operatives Problem mit Impact | Vorfälle (Inbox) |

**Fluss (Ziel):** Alerts (AM grouping) → Incident (persistent oder derived mit stable ID) → Ack/Resolve.

**Phase 1 (bestehend):** Incidents derived aus `buildDashboardIncidents()` — UI behandelt sie wie Inbox, Backend liefert stable `id` pro Berechnungsfenster.  
**Phase 2 (ADD):** Persistente Incidents mit Ack/Owner.

### 4.2 Incident List (`platformOps=incidents`)

**Default-Sort:** `severity DESC`, `startedAt ASC` (ältestes critical zuerst innerhalb Severity).

| Spalte | Inhalt | Mobile Prio |
|--------|--------|---------------|
| **Schweregrad** | critical / warning / info | 1 |
| **Titel** | `summary` | 2 |
| **Komponente** | `affectedComponent` | 4 |
| **Impact** | Kurztext + Org-Count wenn > 0 | 3 |
| **Gestartet** | `firstSeen` relativ | 5 |
| **Dauer** | `now - firstSeen` | 6 |
| **Status** | open / acknowledged / resolved | 3 |
| **Owner** | Name oder „—" | — (Desktop) |

**Filter:** Severity, Component, State (open/ack/resolved), Zeitraum.

**Caps:** Kein hartes List-Limit — paginiert (25/50). Overview-Teaser max 5.

**Alert-Storm-Schutz:** Gleiche Ursache → **eine** Incident-Zeile mit `affectedResourceCount` (§15).

### 4.3 Incident Detail (`&incidentId=`)

**Surface:** Full-page unter Vorfälle (Desktop); Mobile full-page stack.

```
MasterPageHeader (detail, back → Vorfälle)
├── Status row: Severity + State + Duration
├── Section: Zusammenfassung (summary, impact)
├── Section: Timeline (ADD — mindestens created/updated/ack/resolved)
├── Section: Verwandte Alerts (gruppiert, max 10 + „in Alertmanager")
├── Section: Betroffene Dienste (Links → serviceId)
├── Section: Betroffene Organisationen (max 5 + „alle anzeigen")
├── Section: Diagnostik (correlationId, lastError, metric snapshot)
├── Section: Runbook (Link — nicht eingebettet)
└── Actions: Safe actions only (§14)
```

| Feld | Phase 1 | Phase 2 (ADD) |
|------|---------|---------------|
| Acknowledgement | — | `POST /admin/ops/incidents/:id/ack` |
| Owner | — | DTO + Zuweisung |
| Resolution | — | `resolvedAt`, `resolutionNote` |
| Timeline | firstSeen/lastSeen only | Vollständige Event-Timeline |
| Runbook | Static URL per component | `runbookUrl` in DTO |

### 4.4 Incident vs Dashboard

Dashboard Incident-Teaser **referenziert** dieselben IDs wie Vorfälle-Liste — keine zweite Berechnung im Frontend.

---

## 5. Services (Tab: Dienste)

### 5.1 Service-Gruppierung (an reale Architektur angepasst)

```
Dienste
├── Kern
│   ├── API (NestJS / PM2)
│   ├── PostgreSQL
│   ├── Redis
│   └── ClickHouse
├── Verarbeitung (Summary — Detail in Tab Verarbeitung)
│   ├── BullMQ (aggregiert)
│   └── Worker Runtime (aggregiert)
├── Edge
│   ├── Nginx / TLS (blackbox)
│   └── Host (Kapazität — Link zu Infrastruktur)
└── Extern (Integration — nicht Provider-Klon)
    ├── DIMO → Drilldown Connected Vehicles
    ├── Stripe → Drilldown Billing Abgleich
    ├── Benachrichtigungen (Resend/Notification Engine)
    ├── Voice (Twilio/ElevenLabs) → Drilldown Voice Assistant
    └── High Mobility → Drilldown HM View
```

**Regel:** Externe Hubs bleiben **fachliche Control Planes** — Dienste-Tab zeigt **Integration Health Summary** + Link, nicht die volle Fahrzeug-/Billing-Tabelle.

### 5.2 Services Overview Layout

```
┌─ Kern ──────────────────────────────────────────────────────────────┐
│ Kompakte Tabelle: Dienst | Zustand | Letzter Check | Schlüsselsignal │
│ Nur Zeilen mit state ≠ healthy ODER user expanded „Alle anzeigen"      │
└─────────────────────────────────────────────────────────────────────┘
┌─ Verarbeitung (Kurz) ───────────────────────────────────────────────┐
│ Failed Jobs (summe) | Unhealthy Workers | Scheduler Misses → Tab     │
└─────────────────────────────────────────────────────────────────────┘
┌─ Edge ──────────────────────────────────────────────────────────────┐
│ Nginx/TLS | Host risk summary                                        │
└─────────────────────────────────────────────────────────────────────┘
┌─ Extern ────────────────────────────────────────────────────────────┐
│ Integration | Provider OK? | SynqDrive OK? | Tenant Impact | Link    │
└─────────────────────────────────────────────────────────────────────┘
```

**Default:** Nur **nicht-healthy** Services sichtbar. Toggle „Alle Dienste anzeigen" für vollständige Liste.

### 5.3 Service IDs (kanonisch)

| serviceId | Gruppe | SoT |
|-----------|--------|-----|
| `api` | kern | readiness.workers + `synqdrive_dependency_up{dependency="api"}` |
| `postgres` | kern | readiness.postgres |
| `redis` | kern | readiness.redis |
| `clickhouse` | kern | readiness.clickhouse + CH status service |
| `bullmq` | verarbeitung | QueueMonitoringService aggregate |
| `workers` | verarbeitung | getMonitoringWorkers summary |
| `nginx` | edge | blackbox SSL probe / AM alert |
| `host` | edge | node_exporter summary (ADD) |
| `dimo` | extern | platform connectivity + token health |
| `stripe` | extern | billing stripe-status |
| `notifications` | extern | notification metrics / failed deliveries |
| `voice` | extern | voice control plane platformStatus |
| `high-mobility` | extern | HM stream health |

---

## 6. Service Detail (gemeinsames Muster)

**URL:** `?view=platform-ops&platformOps=services&serviceId={id}`

### 6.1 Informationshierarchie (alle Services)

| # | Section | Inhalt |
|---|---------|--------|
| 1 | **Header** | Name, Gruppe, `StatusChip`, letzter Check |
| 2 | **Aktueller Zustand** | 1–3 Sätze DE — serverseitig `stateSummary` |
| 3 | **Schlüsselsignale** | Max 4 KPIs — service-spezifisch (s. u.) |
| 4 | **Aktive Alerts** | Gruppiert, Link zu Diagnostik |
| 5 | **Letzte Vorfälle** | Max 3 mit Link zu incidentId |
| 6 | **Diagnostik** | correlationId, lastError, timestamp |
| 7 | **Externes Monitoring** | Grafana panel link / AM alert link |
| 8 | **Fachlicher Hub** | Nur bei extern — CTA zu vehicles/billing/voice |

**Verboten:** Rohmetrik-Tabelle mit 20+ Zeilen, Zeitreihen-Charts im Primary View.

### 6.2 Schlüsselsignale pro Service (Primary — max 4)

| Service | Signale |
|---------|---------|
| **API** | Availability, Readiness responseMs, Error rate (1h), Active requests |
| **PostgreSQL** | Available, Connection latency, Backup status (link Resilienz), Active incident |
| **Redis** | Available, Memory pressure (ADD summary), Persistence mode, Queue dependency |
| **ClickHouse** | Available/disabled, Ingestion freshness, Disk risk (summary), Schema pending |
| **BullMQ** | Failed total, Worst queue, Stalled (ADD), Delayed abnormal |
| **Workers** | Unhealthy count, Worst failureRatio, Last success (worst worker) |
| **Nginx/TLS** | Cert expiry days, Probe success, Last check |
| **Host** | Disk %, RAM %, CPU %, Load — **threshold only** |
| **DIMO** | Platform degraded, Token TTL, Poll error rate, Disconnected count |
| **Stripe** | Webhook backlog, Last success, Sync errors, Failed payments (platform) |
| **Notifications** | Failed deliveries 24h, Queue depth, Last success |
| **Voice** | Provider status, Webhook backlog, DLQ count, Active incidents |
| **HM** | Stream consumer state, Last message |

### 6.3 Detail-Drilldown (Secondary — expand oder Tab-in-Place)

| Service | Detail-Inhalt | Tool-Link |
|---------|---------------|-----------|
| PostgreSQL | Connections, locks — **nur wenn AM alert** | Grafana Postgres panels |
| ClickHouse | Ingestion stats, schema drift | Grafana CH panels / readiness details blob |
| DIMO | Token health table | Diagnostik → token-health |
| Alle | Historische Trends | Grafana — nie inline 7d chart |

---

## 7. Jobs & Queues (Tab: Verarbeitung)

### 7.1 Unter-Tabs

| Tab | URL | Zweck |
|-----|-----|-------|
| **Queues** | `platformOpsTab=queues` | BullMQ operative Übersicht |
| **Worker** | `platformOpsTab=workers` | Poll-log-basierte Worker |
| **Scheduler** | `platformOpsTab=schedulers` | Cron/Scheduler Board (ADD) |

### 7.2 Queues Overview

**Default-Ansicht:** Nur **abnormale** Queues (`status !== healthy && status !== idle`).

| Spalte | Overview | Detail (Row expand) |
|--------|----------|---------------------|
| Queue | ✅ | ✅ |
| Failed | ✅ | ✅ |
| Stalled | ✅ (ADD) | ✅ |
| Waiting | Nur wenn > Schwellwert | ✅ |
| Active | — | ✅ |
| Delayed | Nur wenn abnormal | ✅ |
| Status | ✅ | ✅ |
| Retry/DLQ | Badge wenn > 0 | ✅ |

**Healthy/idle Queues:** Hinter „X gesunde Queues eingeklappt" — nicht als volle Tabelle.

**Schwellwerte:** Bestehend `QueueMonitoringService` — nicht im Frontend duplizieren.

### 7.3 Queue Row Actions

| Action | Kategorie | Phase |
|--------|-----------|-------|
| In Diagnostik öffnen | Safe | 1 |
| Grafana Queue panel | Safe | 1 |
| Job retry / requeue | Controlled | 2 — nur wenn Backend existiert |

---

## 8. Worker & Scheduler

### 8.1 Worker (`platformOpsTab=workers`)

Merge aus `getMonitoringWorkers()` + orphan `SystemMonitoringView` workers table.

| Spalte | Inhalt |
|--------|--------|
| **Worker / Job-Typ** | Kanonischer Name |
| **Zweck** | Kurzbeschreibung (statisch mapping) |
| **Zustand** | healthy / degraded / critical |
| **Letzter Erfolg** | `lastSuccessAt` relativ |
| **Fehlerrate** | `failureRatio` % |
| **Durchsatz** | jobs/h (wenn verfügbar) |
| **Letzter Fehler** | Kurztext + timestamp |

**Sort:** `state` critical first, dann `failureRatio DESC`.

**Regel:** `Process running` ≠ healthy — UI zeigt immer `lastSuccessAt` + `failureRatio`.

**Produktive Worker (Inventar — Anzeige):**

| Worker | Gruppe |
|--------|--------|
| DIMO Snapshot / Vehicle Sync / DTC / Trip Tracking | DIMO polling |
| Trip Behavior Enrichment | Enrichment |
| Tire / Brake Recalculation | Health recalc |
| Notification evaluation | Notifications |
| Document intake | Documents |
| Voice webhooks | Voice |
| ClickHouse mirror | Analytics |
| Battery V2 | Health |

### 8.2 Scheduler (`platformOpsTab=schedulers`) — ADD

| Spalte | Inhalt |
|--------|--------|
| **Name** | Scheduler ID |
| **Erwarteter Takt** | Cron expression → DE (z. B. „alle 30 Sek.") |
| **Letzter Lauf** | `lastRunAt` |
| **Letzter Erfolg** | `lastSuccessAt` |
| **Nächster Lauf** | `nextExpectedAt` (computed) |
| **Status** | ok / missed / failed |
| **Letzter Fehler** | message wenn failed |

**Missed Execution:** `now > nextExpectedAt + grace` → Status `missed` — **prominent** (historischer Scheduler-Fehler muss sichtbar sein).

**Quelle (ADD):** `SchedulerRegistryService` — Backend aggregiert alle `@Cron` Jobs mit letztem Lauf aus Metrics/Logs/DB.

---

## 9. Infrastructure (Tab: Infrastruktur)

### 9.1 Zweck

Nur **handlungsrelevante** Host-Signale — Kapazitätsrisiko, nicht Dashboard-Klon.

### 9.2 Primary View

| Signal | Darstellung | Critical wenn |
|--------|-------------|---------------|
| **Disk** | % used + Trend-Pfeil (ohne Chart) | ≥ 85% oder AM `HostDiskSpaceLow` |
| **RAM** | % used | AM `HostMemoryPressure` |
| **CPU** | % + Dauer-Hinweis | AM `HostCpuHigh` sustained |
| **Load** | 1m/5m/15m kompakt | Load > cores × 2 |
| **Uptime** | Tage | Info only |
| **Container** | synqdrive-clickhouse, redis — **nur wenn down** | Probe fail |

**Quelle (ADD):** `GET /admin/ops/infrastructure-summary` — aggregiert aus Prometheus/node_exporter via Backend (nicht Frontend → Prometheus).

### 9.3 Detail (optional expand)

- Mini sparkline **nur** wenn Trend für Entscheidung nötig (z. B. Disk 7d) — sonst Link „Grafana Node Exporter"
- Network: nur wenn AM alert aktiv

**Verboten:** 20 Mini-Charts, per-core CPU breakdown in Primary View.

---

## 10. Database Health (within Services — nicht eigene Page)

PostgreSQL und ClickHouse **keine** DBA-Konsole.

### 10.1 Primary (Service Detail / Dienste-Kurzzeile)

| Frage | PostgreSQL | ClickHouse |
|-------|------------|------------|
| Verfügbar? | readiness | readiness + disabled semantics |
| Ressourcen-Risiko? | — (Host Tab) | disk summary in details |
| Backup gesund? | resilience.postgres | resilience.clickhouse |
| Verarbeitung gesund? | — | ingestion freshness |
| Aktiver Vorfall? | incident link | incident link |

### 10.2 Detail (expand)

| | PostgreSQL | ClickHouse |
|---|------------|------------|
| Kanonische Metriken | connections (wenn alert), backup age | ingestion, schemaDrift, pendingMigrationCount |
| Grafana | SynqDrive Ops → PG panels | SynqDrive Ops → CH panels |
| Architektur | `disabled` ≠ fault — Badge „Optional deaktiviert" | |

**Keine zweite CH Health Engine im Frontend** — nur `HealthService.checkReadiness()` + `ClickHouseService.getStatus()`.

---

## 11. Backup & Recovery (Tab: Resilienz)

### 11.1 Global Resilience State

**Header-Chip:** `resilience.overall` aus `PlatformResilienceStatusService` — kanonisch.

| State | Bedingung |
|-------|-----------|
| healthy | Alle Tier ≤ 26h + offsite ok + restore validation ok |
| degraded | stale ≤ 72h oder offsite stale |
| critical | > 72h oder last failure |
| unknown | `source: none` — **prominent**, nie als healthy |

### 11.2 Tier-Tabelle (kritische Datenquellen)

| Tier | Spalten |
|------|---------|
| **PostgreSQL** | Letztes Backup, Alter, Offsite, Restore-Validation, Status |
| **ClickHouse** | Letztes Backup, Alter, Offsite, Restore-Validation, Status |
| **Redis** | Letzter Snapshot, Persistenz-Modus, Status |
| **Env Snapshot** | Alter, Offsite |
| **Offsite Copy** | Letzter Sync, Fehler, Retention |

**Regel:** Existierendes Backup ≠ gesunder DR-State — **Restore Validation** eigene Spalte, eigener Chip.

### 11.3 RPO/RTO Kontext

Statischer Hilfetext (nicht live berechnet) + Link zu `docs/remediation/disaster-recovery-production-readiness.md` — **nicht** als Drilldown-Ersatz für Live-State.

### 11.4 Failure-Darstellung

| Situation | UI |
|-----------|-----|
| Backup failed | Tier row critical + Incident auto |
| Offsite sync failed | `last-failure.json` message (ADD API) |
| Restore validation overdue | warning chip + „Validation ausstehend" |
| `source: none` | unknown banner „Resilience-Status nicht gemeldet — VPS prüfen" |

---

## 12. External Providers

### 12.1 Drei-Ebenen-Modell

Jede externe Integration zeigt **bis zu drei** orthogonale Zeilen:

| Ebene | Frage | Beispiel DIMO |
|-------|-------|---------------|
| **Provider Health** | Ist der externe Dienst gestört? | DIMO API outage (AM / platform banner) |
| **SynqDrive Integration** | Ist unsere Anbindung defekt? | Token expired, worker failureRatio high |
| **Tenant Impact** | Wen betrifft es? | 3 Orgs, 142 Fahrzeuge — Link zu CV Attention |

### 12.2 Darstellung in Dienste → Extern

```
┌ DIMO ────────────────────────────────────────────────────────────────┐
│ Provider:     Betriebsbereit | Gestört (AM)                           │
│ Integration:  Degradiert — Token läuft in 2h ab                     │
│ Tenant:       12 Fahrzeuge mit Ingestion-Fehler → Connected Vehicles  │
│ [Fahrzeug-Governance öffnen]                                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 12.3 Abgrenzung zu Fach-Hubs

| Integration | Summary hier | Detail dort |
|-------------|--------------|-------------|
| DIMO | Platform + token summary | Connected Vehicles |
| Stripe | Webhook/sync summary | Billing → Abgleich |
| Voice | Provider + backlog | Voice Assistant |
| HM | Stream status | High Mobility |
| Notifications | Failed delivery count | Diagnostik / künftig Notification Ops |
| Parts/Insurances | Partner health | jeweilige Admin Views |

**Tenant-spezifische** Probleme erscheinen hier nur als **Impact-Count** — Detail in Org/Vehicle Hubs.

---

## 13. Diagnostics (Tab: Diagnostik)

### 13.1 Progressive Disclosure

| Ebene | Inhalt |
|-------|--------|
| **Primary (andere Tabs)** | Ursache + Impact in Klartext |
| **Diagnostik** | Technische Evidenz für Post-Mortem |

### 13.2 Unter-Tabs

| Tab | Inhalt | Quelle |
|-----|--------|--------|
| **Alerts** | AM Summary + grouped derived alerts | ADD `alertmanager-summary` + `getMonitoringAlerts` |
| **Poll-Protokoll** | Paginierte poll logs, filterbar | `/admin/monitoring/poll-logs` |
| **Token & Auth** | DIMO JWT health | `/admin/monitoring/token-health` |
| **Tools** | Grafana, Prometheus, Alertmanager Zugang | env URLs + SSH hint |

### 13.3 Alerts-Unter-Tab

**Nicht** Prometheus UI. Zeigt:

| Element | Inhalt |
|---------|--------|
| AM Summary | firing critical/warning, silenced count, pending |
| Gruppierte Alerts | alertname, count, affected resources, first/last seen |
| Delivery hint | „Zuletzt benachrichtigt: …" (ADD aus AM API) |

### 13.4 Diagnostik-Payload (in Incident/Service Detail)

| Feld | Regel |
|------|-------|
| correlationId | Wenn vorhanden — kopierbar |
| requestId | Wenn vorhanden |
| lastError | Max 200 Zeichen — kein Stacktrace-Wall |
| service | serviceId |
| timestamp | ISO + relativ |
| relevantMetric | Name + Wert — nicht 50 Metriken |
| Grafana link | Panel URL template — **kein Token** |
| Log link | Wenn Loki/existiert — sonst „Logs via Grafana Explore" |

**Keine Secrets** — kein METRICS_BEARER_TOKEN, keine API-Keys.

---

## 14. Action Model

### 14.1 Kategorien

| Kategorie | Aktionen | Anforderungen |
|-----------|----------|---------------|
| **Safe** | Daten neu laden; Vorfall öffnen; Logs/Runbook/Grafana link; Hub öffnen | `MASTER_ADMIN` |
| **Controlled** | Job retry; Requeue; Reconciliation run (Billing) | Permission + Confirm + Audit |
| **High Risk** | Restart Worker; Trigger Backup; Silence Critical Alert | Step-up MFA + Reason + Confirm + Audit |

### 14.2 Action-Inventar (nur existierende + geplante sichere Pfade)

| Aktion | Kategorie | Existiert | Phase |
|--------|-----------|-----------|-------|
| Snapshot neu laden | Safe | ✅ | 1 |
| Grafana/AM öffnen (Link) | Safe | Teilweise | 1 |
| Runbook öffnen | Safe | Static URLs | 1 |
| Hub öffnen (CV, Billing, Voice) | Safe | ✅ | 1 |
| Billing reconciliation run | Controlled | ✅ (Billing Hub) | — |
| Voice replay webhook | Controlled | ✅ (Voice) | — |
| Incident acknowledge | Controlled | ❌ ADD | 2 |
| Queue job retry | Controlled | ❌ ADD | 3 |
| Prune master data | High Risk | ✅ API Step-up | — |
| Restart worker | High Risk | ❌ nicht in UI | — |
| Silence AM alert | High Risk | ❌ nur AM UI | — |
| Trigger backup | High Risk | ❌ nur Scripts | — |

**Verboten:** „Restart everything", SSH-Shell, rohe PM2-Buttons in normaler UI.

### 14.3 High-Risk Pattern (verbindlich)

```
VoiceSecureActionDialog-Pattern erweitern:
  1. Reason (Pflicht, min 10 Zeichen)
  2. Impact-Hinweis
  3. Confirm checkbox
  4. Step-up MFA wenn konfiguriert
  5. Idempotency-Key
  6. Audit log entry
```

---

## 15. Alert Deduplication UX

### 15.1 Gruppierungsregeln

| Regel | Verhalten |
|-------|-----------|
| Gleicher `alertname` + `component` | Eine Zeile, `count` Badge |
| Platform DIMO outage | Ein Incident „DIMO-Plattform gestört", nicht N Poll-Failure-Cards |
| Queue critical + Worker unhealthy + gleiche queue | Ein Incident, verwandte Alerts gruppiert |
| AM `group_by` | Backend respektiert AM-Gruppierung in Summary API |

### 15.2 Gruppen-Zeile (Alerts & Incidents)

| Feld | Inhalt |
|------|--------|
| Titel | alertname / incident summary |
| Count | Anzahl betroffener Ressourcen |
| Betroffene Ressourcen | „3 Queues", „142 Fahrzeuge" — nicht 142 Zeilen |
| First seen | ältestes |
| Last seen | neuestes |
| Severity | höchste in Gruppe |
| Expand | max 5 Einzelnachweise, dann „+N in Diagnostik" |

### 15.3 Caps

| Ort | Cap |
|-----|-----|
| Übersicht Incidents | 5 |
| Übersicht Signale | 6 |
| Vorfälle Liste | paginiert |
| Alerts Diagnostik | 25 pro Seite |
| Poll failure cards | 3 Einzel + Gruppe |

---

## 16. Monitoring Drilldowns

### 16.1 Kanonische externe Tools

| Tool | Wann verlinken | Link-Typ |
|------|----------------|----------|
| **Grafana** | Trend, historische Analyse, Node/CH/PG panels | Panel-URL mit `var-` params — localhost nach SSH |
| **Prometheus** | Alert rule investigation | Expression link — selten, nur Diagnostik Tools |
| **Alertmanager** | Silences, firing details, delivery | Summary in MA; Detail → AM UI |
| **Logs** | Error investigation | Grafana Explore — wenn konfiguriert |

### 16.2 SSH-Tunnel-Hinweis (einheitlich)

```
Diagnostik → Tools:
  „Metriken sind auf dem VPS nur via localhost erreichbar.
   SSH-Tunnel: ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 …"
```

**Keine Zugangsdaten** im Frontend. `metricsConfigured: true` nur als Boolean.

### 16.3 Deep-Link-Matrix

| Kontext | Grafana Ziel |
|---------|--------------|
| Service: Host | Node Exporter Full |
| Service: PostgreSQL | Ops Dashboard → dependency |
| Service: ClickHouse | Ops Dashboard → CH row |
| Queue abnormal | Ops Dashboard → BullMQ row |
| DIMO | Ops Dashboard → DIMO section |
| Billing/Stripe | Billing dashboard (wenn vorhanden) oder Billing Hub |

---

## 17. Data Freshness

### 17.1 Modul-Registry

| Modul | Source | Refresh | Stale Threshold | Last Update UI | Error Behavior |
|-------|--------|---------|-----------------|----------------|----------------|
| Ops Overview | `GET /admin/ops/overview` | 60s poll + manual | 5 min | Header meta + `MasterStaleDataHint` | Partial: `moduleErrors[]`, rest rendern |
| Vorfälle | `GET /admin/ops/incidents` | 60s + manual | 5 min | List header | Empty + ErrorState |
| Dienste | `GET /admin/ops/services` | 60s + manual | 5 min | Tab meta | Per-service unknown |
| Queues | `GET /admin/ops/queues` | 60s + manual | 2 min | Tab badge | Row „unbekannt" |
| Worker | `GET /admin/monitoring/workers` | 60s + manual | 5 min | — | Section ErrorState |
| Scheduler | `GET /admin/ops/schedulers` | 60s + manual | 2× cadence | — | missed wenn stale |
| Infrastruktur | `GET /admin/ops/infrastructure-summary` | 120s + manual | 10 min | Chip stale | unknown — nicht healthy |
| Resilienz | `GET /admin/ops/resilience-status` | 120s + manual | 30 min | Tier timestamps | `source: none` → unknown banner |
| AM Summary | `GET /admin/ops/alertmanager-summary` | 60s + manual | 5 min | Diagnostik header | Hide delivery, show firing only |
| Poll logs | on-demand | on filter/page | — | Table footer | Pagination error |
| Dashboard teaser | shared `operational-cache` | 60s | 5 min | Dashboard stale hint | Same IDs as incidents |

**Regel:** Stale Data **niemals** als aktueller Healthy State ohne Hinweis.

---

## 18. Mobile

### 18.1 Priorität (strikt)

1. **Global State** — Hero Chip + Domain-Chips (wrap)
2. **Incidents** — Cards, critical first
3. **Critical Services** — nur degradierte
4. **Failed Jobs** — Summe + worst queue → Verarbeitung
5. **Backup Problems** — Resilienz Chip + worst tier
6. **Übrige Details** — hinter Tabs / expand

### 18.2 Mobile Patterns

| Surface | Pattern |
|---------|---------|
| Ops Overview | Stacked Hero → Incident Cards → Service Cards |
| Vorfälle | `IncidentCardList` — kein wide table |
| Dienste | Grouped accordion — Kern/Extern |
| Verarbeitung Queues | Card pro abnormal queue |
| Resilienz | Card pro Tier |
| Diagnostik | Unter-Tabs bleiben; Poll logs card list |
| Service Detail | Full-page stack — Key Signals vertical |

### 18.3 Breakpoints

| BP | Verhalten |
|----|-----------|
| `< sm` | Cards only; Domain-Chips horizontal scroll |
| `sm–lg` | Reduced columns (4) |
| `≥ lg` | Full DataTable |

**Rohmetriken** (waiting/active/delayed) nur in Detail expand — nicht Mobile Overview.

---

## 19. Section → Information → Source of Truth → Priority → Drilldown → Action

### 19.1 Übersicht

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Global State | `globalPlatformState` | `GET /admin/ops/overview` | P0 | — | Refresh |
| Domain Chips | 5 domain states | overview.domains | P0 | jeweiliger Tab | — |
| Active Incidents | top 5 incidents | overview.incidents | P0 | `incidentId` | Open |
| Degraded Services | non-healthy services | overview.degradedServices | P0 | `serviceId` | Open |
| Critical Signals | compact alerts | overview.signals | P1 | diagnostics/alerts | Open |

### 19.2 Vorfälle

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| List row | severity, title, component, impact, duration, state | `GET /admin/ops/incidents` | P0 | `incidentId` | Open |
| Detail summary | summary, impact | incident DTO | P0 | — | — |
| Timeline | events | incident.timeline (ADD) | P1 | — | — |
| Related alerts | grouped alerts | incident.relatedAlerts | P1 | diagnostics | AM link |
| Affected services | serviceIds | incident.services | P1 | `serviceId` | Open |
| Affected orgs | orgIds/names | incident.organizations | P1 | organizations | Open |
| Diagnostics | correlation, lastError | incident.diagnostics | P2 | diagnostics | Copy |
| Runbook | URL | incident.runbookUrl | P1 | external | Open |
| Ack | owner, state | incident.ack (ADD) | P1 | — | Ack (Controlled) |

### 19.3 Dienste

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Service row | name, state, lastCheck, keySignal | `GET /admin/ops/services` | P0 | `serviceId` | Open |
| Detail state | stateSummary | service DTO | P0 | — | — |
| Key signals | max 4 KPIs | service.signals | P1 | grafana | Open Grafana |
| Active alerts | grouped | service.alerts | P1 | diagnostics | — |
| Recent incidents | max 3 | service.incidents | P1 | `incidentId` | Open |
| External hub CTA | — | static routing | P1 | vehicles/billing/voice | Open Hub |

### 19.4 Verarbeitung — Queues

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Abnormal queue row | name, failed, stalled, status | `QueueMonitoringService` | P0 | row expand | — |
| Healthy summary | count idle | queues aggregate | P3 | expand | — |
| Detail metrics | waiting, active, delayed, retry | queue detail | P2 | grafana | Grafana |

### 19.5 Verarbeitung — Worker

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Worker row | name, state, lastSuccess, failureRatio | `getMonitoringWorkers` | P0 | poll-logs filter | Diagnostik |
| Throughput | jobs/h | worker DTO | P2 | grafana | — |

### 19.6 Verarbeitung — Scheduler

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Scheduler row | cadence, lastRun, lastSuccess, next, status | `GET /admin/ops/schedulers` (ADD) | P0 | — | — |
| Missed | missed flag | scheduler DTO | P0 | diagnostics | — |

### 19.7 Infrastruktur

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Disk/RAM/CPU | % + threshold risk | `infrastructure-summary` (ADD) | P1 | grafana node | Grafana |
| Container health | up/down | probe / AM | P1 | — | — |
| Uptime | days | node_exporter | P3 | — | — |

### 19.8 Resilienz

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Overall chip | resilience.overall | `PlatformResilienceStatusService` | P0 | — | — |
| Tier row | lastSuccess, age, offsite, restoreValidation | resilience DTO | P0 | runbook | Docs link |
| Failure | lastFailure message | resilience + offsite state (ADD) | P0 | incident | — |
| unknown source | source:none | resilience | P0 | diagnostics/tools | VPS hint |

### 19.9 Diagnostik

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| AM summary | firing, silenced, pending | `alertmanager-summary` (ADD) | P0 | AM UI | SSH link |
| Grouped alerts | alert groups | AM + derived | P1 | AM / grafana | — |
| Poll logs | paginated rows | `/admin/monitoring/poll-logs` | P2 | — | Filter |
| Token health | JWT TTL, failures | `/admin/monitoring/token-health` | P1 | — | — |
| Tools | URLs, SSH hint | env config | P2 | external | — |

### 19.10 Externe Integrationen (in Dienste)

| Section | Information | Source of Truth | Priority | Drilldown | Action |
|---------|-------------|-----------------|----------|-----------|--------|
| Provider health | AM / platform | alertmanager + provider probe | P1 | AM | — |
| Integration health | token, webhooks, workers | platform-health + domain APIs | P0 | service detail | Hub |
| Tenant impact | counts | operational + domain summaries | P1 | org/vehicle | Open Hub |

---

## 20. CHANGE MATRIX

### KEEP

| Element | Anmerkung |
|---------|------------|
| `MasterDashboardView` als Cross-Domain-Einstieg | Drilldowns zu `platform-ops` |
| `GET /admin/dashboard/operational` | Shared mit Dashboard + Nav badges |
| `GET /admin/platform-health` | Backend aggregiert — UI migriert zu ops/overview |
| `GET /admin/ops/resilience-status` | Resilienz Tab |
| `GET /admin/monitoring/*` | Diagnostik Tab |
| `QueueMonitoringService` | Kanonische Queue-Schwellen |
| `HealthService.checkReadiness()` | Kern-Dienste — keine Frontend-Derivation |
| `PlatformResilienceStatusService` | Backup/DR SoT |
| `buildDashboardIncidents()` | Phase 1 Incident-Quelle |
| `useMasterNavBadges` + `operational-cache` | Badge aus operational |
| `MasterPageHeader` + `MasterPageTabs` | UI-2 Shell |
| `MasterStaleDataHint` | Freshness — auf alle Ops-Tabs ausweiten |
| `StatusChip` + tone mappers | Einheitliche Severity |
| Voice/Billing/CV/Hubs als Fach-Deep-Dives | Nicht in Ops duplizieren |
| Alertmanager VPS stack | Extern — Summary in MA |
| Grafana/Prometheus localhost | Extern — Links nur Diagnostik |
| `VoiceSecureActionDialog` Pattern | Vorlage für Controlled/High-Risk |

### REMOVE

| Element | Grund |
|---------|-------|
| `PlatformHealthView` als separate Root-Implementierung | → `platform-ops` Hub |
| `SystemMonitoringView` als orphan Root | → Diagnostik merge |
| Link „API & Worker Monitoring → settings/monitoring" | Redirect-Loop |
| Link „Fleet Connection öffnen" (ohne CV) | → Connected Vehicles CTA |
| Architektur als Backup-Drilldown | Dokumentation ≠ Live-State |
| Dashboard Backup drilldown → architektur | → resilience |
| `opsTab` URL ohne Consumer | → `platformOpsTab` |
| Frontend `overallTone()` Schwellen für enrichment | Backend liefert state |
| Flache KPI-Grid alle gleich gewichtet (PH) | Hierarchie §2 |
| Volle Queue-Tabelle für healthy queues | Collapse default |
| EN labels in SystemMonitoringView | DE Copy |
| Prometheus text URLs ohne Aktion | Klickbare Links mit Hinweis |
| Duplicate incident Berechnung Frontend | Server-only |
| `settingsTab=monitoring` Settings-Embed | Redirect zu diagnostics |

### MOVE

| Von | Nach | Grund |
|-----|------|-------|
| Sidebar `platform-health` | `platform-ops` | Kanonischer Hub |
| `SystemMonitoringView` sections | `platformOps=diagnostics` | Erreichbar machen |
| Worker table (orphan) | `processing/workers` | Fachlicher Ort |
| Queue table (PH) | `processing/queues` | Entlastung Übersicht |
| Alerts list (PH) | `diagnostics/alerts` + Vorfälle | Trennung Alert/Incident |
| Observability card (PH) | `diagnostics/tools` | Progressive disclosure |
| Backup card (Dashboard only) | `resilience` Tab | Live panel |
| Resilience DTO fields (hidden) | Resilienz UI | restoreValidation, offsite |
| Token health (orphan) | `diagnostics` sub-tab | DIMO Diagnose |
| Poll logs (orphan) | `diagnostics` sub-tab | Standard diagnostic |
| Dashboard „Plattformstatus öffnen" | `platform-ops/overview` | Klarere Benennung |
| Settings monitoring redirect | `platform-ops/diagnostics` | Kein Loop |

### MERGE

| Quellen | Ziel | Ergebnis |
|---------|------|----------|
| `PlatformHealthView` + `SystemMonitoringView` | `platform-ops` Hub | Eine Ops-Control-Plane |
| Dashboard incidents + PH alerts | `ops/incidents` + grouped alerts | Ein Incident-Modell |
| `getPlatformHealth` + operational domains | `ops/overview` | Ein Global State |
| Queue + Worker dashboard domains | `processing` tab | Verarbeitung |
| AM firing + derived alerts | `diagnostics/alerts` grouped | Alert Dedup UX |
| Backup chip + resilience DTO | `resilience` tab | DR Sichtbarkeit |
| Grafana + Prometheus + AM hints | `diagnostics/tools` | Ein Tooling-Einstieg |

### RENAME

| Alt | Neu |
|-----|-----|
| `view=platform-health` | `view=platform-ops` |
| Nav „Platform Health" / „Plattformstatus" | „Plattform & Betrieb" |
| `warning` (UI label) | „Eingeschränkt" (`degraded`) |
| `healthy` (mixed) | „Betriebsbereit" |
| `settingsTab=monitoring` | `platformOps=diagnostics` |
| `opsTab=workers` | `platformOps=processing&platformOpsTab=workers` |
| „Alerts (letzte Stunde)" | „Aktive Warnsignale" (in Diagnostik) |
| „BullMQ Queues (live)" | „Warteschlangen" (nur abnormal default) |
| „Observability (Grafana / Prometheus)" | „Externe Werkzeuge" |
| „API & Worker Monitoring (Detail)" | „Erweiterte Diagnostik" → diagnostics |

### ADD

| Element | Typ | Beschreibung |
|---------|-----|--------------|
| `GET /admin/ops/overview` | API | globalPlatformState, domains, incidents teaser, degradedServices, signals, generatedAt, stale |
| `GET /admin/ops/incidents` | API | paginated incidents — Phase 1 wrapper over buildDashboardIncidents |
| `GET /admin/ops/services` | API | grouped service list + state |
| `GET /admin/ops/services/:id` | API | service detail DTO |
| `GET /admin/ops/schedulers` | API | SchedulerRegistry mit lastRun/missed |
| `GET /admin/ops/infrastructure-summary` | API | Host threshold summary aus Prometheus |
| `GET /admin/ops/alertmanager-summary` | API | firing/silenced/pending counts — read-only AM |
| `PlatformOpsHub` | UI | Root component mit 7 Tabs |
| `SchedulerBoard` | UI | Verarbeitung sub-tab |
| `ResiliencePanel` | UI | Live backup/restore/offsite |
| `IncidentDetailView` | UI | Full detail mit Timeline (Phase 2) |
| `ServiceDetailView` | UI | Shared detail pattern |
| `AlertGroupList` | UI | Dedup grouped alerts |
| `InfrastructureSummary` | UI | Host risk cards |
| `POST /admin/ops/incidents/:id/ack` | API | Phase 2 acknowledge |
| Persistent Incident store | Backend | Phase 2 — PG table |
| Grafana deep link builder | Backend | Panel URLs ohne secrets |
| i18n `master.platformOps.*` | i18n | DE kanonisch |
| URL redirects | Routing | platform-health → platform-ops |
| Architecture record | Docs | `architecture/MASTER_ADMIN_PLATFORM_OPS_BLUEPRINT_2026-08-18.md` |

---

## 21. Implementierungsreihenfolge (Vorschlag — nicht Teil dieser Spec)

| Phase | Deliverable |
|-------|-------------|
| UI-8.3 | Hub scaffold + redirects + Resilience panel + fix dead links |
| UI-8.4 | Merge SystemMonitoringView → Diagnostik; processing tabs |
| UI-8.5 | `ops/overview` + `ops/services` + infrastructure summary |
| UI-8.6 | AM summary integration + alert grouping |
| UI-8.7 | Scheduler board + `ops/schedulers` |
| UI-8.8 | Persistent incidents + ack |

---

## 22. Akzeptanz (Ziel für UI-8.3+)

| Kriterium | Messung |
|-----------|---------|
| 10-Sekunden-Test Ops Overview | Global state + incidents + degraded services ohne Scroll |
| Kein Redirect-Loop | „Erweiterte Diagnostik" erreichbar |
| SystemMonitoringView erreichbar | Diagnostik enthält alle ehemaligen Sections |
| Backup live sichtbar | Resilienz zeigt restoreValidation + offsite |
| Alert/Incident Trennung | Vorfälle ≠ Diagnostik-Alerts |
| Kein Frontend Health Engine | Code review: nur mapping, keine thresholds |
| Mobile | Incidents + global state ohne horizontal scroll |
| AM Korrelation | firing critical spiegelt AM (wenn erreichbar) |
| Stale UX | Alle Tabs mit stale hint |
| Production Readiness Ziel | ≥ 75/100 (von 47) nach UI-8.8 |

---

**Changes / Architektur:** Nicht aktualisiert (Spezifikation — keine Implementierung).

**Nächster Schritt:** UI-8.3 Implementierung gemäß diesem Blueprint und CHANGE MATRIX.
