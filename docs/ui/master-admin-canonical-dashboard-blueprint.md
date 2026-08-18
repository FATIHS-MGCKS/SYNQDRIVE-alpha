# Master Admin — Kanonisches Dashboard Blueprint (Plattform-Übersicht)

**Datum:** 2026-08-18  
**Phase:** UI-4.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-dashboard-deep-audit.md` (UI-4.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-page-framework-post-remediation.md` (UI-3)
- `docs/ui/master-admin-canonical-navigation-blueprint.md` (UI-1.3)
- Technische Master-Admin-Remediation (Observability, Backups, Page Framework, Navigation Shell)

**Leitfrage:** *Was ist gerade wichtig und wo muss ich hin?*

**Grundsatz:** Das Dashboard ist eine **Control Plane Overview** — kein vollständiges Monitoring-, Billing-, Org-, Queue- oder Security-Center. Es aggregiert **kanonische Signale** und leitet zu den fachlichen Deep-Dive-Views weiter.

---

## 0. Produktrolle & Abgrenzung

| Das Dashboard **ist** | Das Dashboard **ist nicht** |
|------------------------|----------------------------|
| Operativer Einstieg nach Login | Ersatz für Grafana/Prometheus |
| Priorisierte Problemübersicht (P0/P1) | Vollständige BullMQ-Konsole |
| Kompakte Health- & Domain-Signale | Billing Control Center |
| Handlungsführung (Drilldowns) | Fleet Connection Detail-Tabelle |
| Ruhiger Healthy State bei OK | Vanity-Growth-Dashboard |
| Zeitstempel + Vertrauenshinweise | Security/SIEM-Oberfläche |

**10-Sekunden-Ziel (nach Umsetzung):** Master Admin sieht im ersten Viewport Plattformzustand, aktive Probleme, betroffene Domänen und mindestens einen klaren nächsten Schritt.

---

## 1. Above the Fold — Status Hero

### 1.1 Zweck

Der erste Viewport beantwortet **ohne Scroll** (Desktop ≥1280px, Mobile ohne KPI-Flut):

1. **Plattformzustand** — Healthy / Degraded / Critical  
2. **Aktive Probleme** — Anzahl + höchste Severity  
3. **Betroffene Organisationen** — falls vorhanden (Aggregat)  
4. **Kritische operative Domänen** — Billing · DIMO · Runtime · Worker · Backup · Support  

Keine großen Vanity-KPIs (Users, Prospects, Gesamt-MRR) above the fold.

### 1.2 Komponente: `MasterDashboardStatusHero`

Platziert **direkt unter** `MasterPageHeader`, volle Content-Breite.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [●] Plattform: Degradiert          Stand: 18.08.2026, 14:32  [↻]      │
│                                                                         │
│ 3 aktive Probleme · Höchste Priorität: Kritisch                        │
│ 2 Organisationen betroffen                                              │
│                                                                         │
│ Domänen:  [Runtime ●] [Worker ●] [DIMO ○] [Billing ○] [Backup ?] [Support ●] │
└─────────────────────────────────────────────────────────────────────────┘
```

| Zone | Inhalt | Visuell |
|------|--------|---------|
| **Status-Zeile** | `overallStatus` (kanonisch) + DE-Label | `StatusChip` mit Dot — `success` / `warning` / `critical` |
| **Meta** | `generatedAt` + Refresh | `MasterPageHeader.meta` / `MasterStaleDataHint` |
| **Problem-Zeile** | Count P0+P1 Incidents | Nur sichtbar wenn count > 0 |
| **Org-Impact** | `affectedOrganizationCount` | Nur wenn > 0 |
| **Domain-Chips** | 6 Domänen-Ampeln | Kompakt, klickbar → Section oder Drilldown |

**Healthy State (keine P0/P1):** Ruhige Zeile „Plattform betriebsbereit“ + grüner Dot — **kein** großer Success-Banner, keine Confetti-Fläche.

### 1.3 Domain-Chip-Logik (nur Anzeige kanonischer Signale)

| Domäne | Critical | Warning | OK | Unbekannt |
|--------|----------|---------|-----|-----------|
| **Runtime** | `readiness.status === 'degraded'` | Einzel-Check `error` in postgres/redis/workers/documentExtraction | Alle hard checks `ok` | Health-API Fehler |
| **Worker** | `monitoring.systemHealth === 'critical'` oder `queueCritical > 0` | `unhealthyWorkers > 0` oder `queueWarning > 0` | Sonst | — |
| **DIMO** | `tokenHealth` critical / DIMO auth error | `disconnected > 0` bei `total > 0` oder poll error rate > Schwellwert | Connected OK, keine P1-Alerts | Kein DIMO-Fleet |
| **Billing** | `failedPayments > 0` oder `reconciliationDrifts > 0` | `pastDue > 0` oder `stripeSyncErrors > 0` oder `missingPaymentMethods > 0` | Alle Null | Billing-API Fehler |
| **Backup** | `lastBackupStatus === 'failed'` | `offsiteStatus === 'stale'` oder Validation overdue | Letztes Backup OK + offsite OK | **Kein API** → `?` + Tooltip „Status nicht gemeldet“ |
| **Support** | — | `openTickets > 5` (Schwellwert konfigurierbar) | `openTickets === 0` | Support-API Fehler |

**Regel:** Chips werden **serverseitig** in einem Aggregat-DTO berechnet (siehe §13) — Frontend mappt nur auf Farbe/Label.

### 1.4 Page Header (kanonisch)

```tsx
MasterPageHeader
  variant="page"
  title="Plattform-Übersicht"
  description="Operativer Überblick — Was ist wichtig und wohin als Nächstes?"
  meta={generatedAt + staleHint}
  actions={
    Primary: "Plattformstatus öffnen" → view=platform-health
    Secondary: Refresh
  }
```

Kein separater Header-StatusChip — Status lebt im **Status Hero** (vermeidet Doppel-Signal aus Audit P0-1).

---

## 2. Section Order (Gesamtstruktur)

Fixe Reihenfolge — Desktop und Mobile (Mobile: gleiche Reihenfolge, siehe §14).

| # | Section | Sichtbarkeit | Priorität |
|---|---------|--------------|-----------|
| 0 | `MasterPageHeader` | Immer | — |
| 1 | **Status Hero** | Immer | P0 |
| 2 | **Active Incidents** | Immer (Empty = ruhiger OK) | P0 |
| 3 | **Platform Status** (kompakt) | Immer | P1 |
| 4 | **Organizations Requiring Attention** | Wenn Liste nicht leer | P1 |
| 5 | **Domain Summaries** (2×2 Grid) | Immer — kompakt | P1/P2 |
| 5a | └ Billing Health | | |
| 5b | └ Connected Vehicle Health | | |
| 5c | └ Jobs & Queues | | |
| 5d | └ Backup / Resilience | | |
| 6 | **Open Support** (kompakt) | Wenn `openTickets > 0` | P1 |
| 7 | **Recent Platform Activity** | Immer — max 8 Einträge | P2 |
| 8 | **Business Context** (collapsible) | Default collapsed | P3 |
| 9 | **Quick Actions** | Footer der Seite oder Header Secondary | P2 |

**Entfernt gegenüber Ist:** 9-KPI-Grid (Active Orgs, Users, MRR, Prospects, …) aus dem Hauptfluss.

---

## 3. Platform Status — Kompakte System-Health

### 3.1 Komponente: `MasterDashboardPlatformStatus`

**Progressive Disclosure:** Kompakte **eine Zeile pro Gruppe** — Expand/Chevron öffnet Detail-Liste (max 6 Zeilen), kein Grid aus 20 gleich großen Cards.

```
▼ Core Platform          [●●●○]  3/4 OK
▼ Processing             [●●○]   Queues: 1 Warnung
▼ External Services      [●●●]   DIMO · Stripe · Notifications
▼ Resilience             [?]     Backup: nicht gemeldet
```

### 3.2 Gruppen & Signale

#### Core Platform

| Signal | Source of Truth | Anzeige |
|--------|-----------------|---------|
| API / Readiness | `platform-health.readiness.status` | Aggregat-Icon |
| PostgreSQL | `readiness.checks.postgres.status` | ok / error + `responseMs` |
| Redis | `readiness.checks.redis.status` | ok / error |
| ClickHouse | `readiness.checks.clickhouse` | `details.status`: available / disabled / degraded — **disabled ≠ Fehler** |

#### Processing

| Signal | Source of Truth | Anzeige |
|--------|-----------------|---------|
| Queues (aggregiert) | `platform-health.queues` | „X critical · Y failed jobs“ |
| Worker Runtime | `readiness.checks.workers` | ok / error (`workers_disabled_at_bootstrap`) |
| Scheduler / Poll Health | `platform-health.monitoring` | `errorRatePercent`, `unhealthyWorkers` |

#### External Services

| Signal | Source of Truth | Anzeige |
|--------|-----------------|---------|
| DIMO | `platform-health.integrations.dimo` + `tokenHealth` | connected/total, Token-Status |
| Stripe | `billing/overview.stripeSyncErrors` | Fehleranzahl oder OK |
| Notifications | `billing/overview.failedEmailDeliveries` | Outbox DLQ Count |
| AI / Voice | **Optional P2** — nur wenn produktiv relevant | `GET /admin/voice-assistant/overview` Aggregat `orgsWithWarnings` — **nicht Phase 1** |

#### Resilience

| Signal | Source of Truth | Anzeige |
|--------|-----------------|---------|
| Backup | `GET /admin/ops/resilience-status` (**neu**, siehe §8) | Letztes OK / Fehler |
| Monitoring | `platform-health.observability.metricsConfigured` | konfiguriert / fehlt |
| Alerting | Synthetische Alerts + später Alertmanager | „X aktive Alerts“ |

**Drilldown:** Gruppen-Zeile oder „Details“ → `view=platform-health` (ggf. `opsTab=workers`).

### 3.3 Visuell

- Eine `DataCard` mit 4 Gruppen-Zeilen (`MasterPageSection` + `SectionHeader` optional)
- Status als kleine Dots (`sq-dot-success` / `watch` / `critical` / `nodata`)
- Keine pro-Komponente `MetricCard` im collapsed state

---

## 4. Active Incidents

### 4.1 Komponente: `MasterDashboardIncidentList`

**Prominenz:** Volle Breite, direkt unter Status Hero. Bei Incidents: dezenter `border-l-4 border-[--status-critical]` oder `warning` am Section-Container — nicht übertrieben.

### 4.2 Incident-Zeile (Schema)

| Feld | Pflicht | Quelle |
|------|---------|--------|
| **Severity** | Ja | `critical` \| `warning` \| `info` (info nur wenn keine höheren) |
| **Problem** | Ja | `title` / `summary` |
| **Komponente** | Ja | `affectedComponent` / domain |
| **Beginn** | Ja | `firstSeen` ISO |
| **Dauer** | Ja | berechnet aus `firstSeen` → now (Anzeige: „seit 2h 14m“) |
| **Impact** | Ja | Kurztext: „Polling“, „47 Fahrzeuge“, „3 Orgs“ |
| **Betroffene Orgs** | Wenn bekannt | Org-Namen (max 2) + „+N“ |
| **Drilldown** | Ja | Link/Button rechts |

**Max sichtbar:** 5 Zeilen + „Alle anzeigen (N)“ → `platform-health` oder domänenspezifisch.

### 4.3 Incident-Quellen (kanonisch, keine Frontend-Fusion neuer Logik)

| Priorität | Quelle | Mapping |
|-----------|--------|---------|
| 1 | `platform-health.alerts` | severity ≥ warning |
| 2 | Billing-Anomalien | `pastDueSubscriptions > 0`, `reconciliationDrifts > 0`, `failedPayments > 0`, `stripeSyncErrors > 0` — je eigene Zeile wenn Schwellwert |
| 3 | Queue critical | `queues.filter(status==='critical')` — eine aggregierte Zeile |
| 4 | Backup failure | `resilience-status.overall === 'failed'` |
| 5 | DIMO Token | `integrations.dimo.tokenHealth` critical |

**Hinweis:** Bis ein dediziertes `GET /admin/incidents` existiert, liefert **`GET /admin/dashboard/operational`** (siehe §13) ein normalisiertes `incidents[]`-Array — serverseitige Zusammenführung, **nicht** im Frontend.

### 4.4 Empty State (keine P0/P1)

```
Keine aktiven Vorfälle.
Letzte Prüfung: vor 42 Sekunden.
```

Klein, neutral — **kein** großer grüner Banner. Optional einzeiliges Häkchen-Icon.

---

## 5. Organizations Requiring Attention

### 5.1 Komponente: `MasterDashboardOrgAttentionList`

**Nur Organisationen mit klarem Grund** — keine „letzten Organisationen“.

| Reason-Kategorie | Kanonische Quelle | Beispiel-Label |
|------------------|-------------------|----------------|
| Billing | `GET /admin/billing/organizations` → `warnings[]` | „Überfällig“, „Keine Zahlungsmethode“ |
| Connectivity | Aggregat aus Connectivity-Summary (**neu**, §6) | „12 Fahrzeuge offline“ |
| Integration | Org-level DIMO disconnect / sync | Aus Billing oder Connectivity |
| Subscription | `subscription.status` PAST_DUE, CANCEL_AT_PERIOD_END | Kanonisch Billing |
| Datenverarbeitung | `monitoring` org-scoped — **Phase 2** | — |

**Zeilen-Schema:**

| Spalte | Inhalt |
|--------|--------|
| Organisation | `companyName` |
| Reason | Primärer `warningLabel(code)` |
| Severity | critical / warning |
| CTA | „Öffnen“ → `view=organizations&orgId=` oder Billing Org Drawer |

**Max:** 8 Zeilen + „Alle (N)“ → Billing Tab „Unternehmen & Verträge“ mit Filter attention.

**Empty:** Section **ausblenden** (nicht „Keine Organisationen“ anzeigen).

---

## 6. Connected Vehicle Health

### 6.1 Abgrenzung

| Typ | Dashboard | Deep Dive |
|-----|-----------|-----------|
| Plattform-DIMO-Fehler (Token, API, Poll-Rate) | Domain Chip + Incidents | `platform-health`, `fleet-connection` |
| Fahrzeug-Telemetrie-Verteilung | Kompakte Summary | `fleet-connection` |
| Einzelfahrzeug | **Nie** auf Dashboard | Fleet Connection |

### 6.2 Kanonische Telemetry States

Verbindlich — **keine neue Logik im Dashboard:**

| State | DE Label | Operative Bedeutung auf Dashboard |
|-------|----------|--------------------------------|
| `live` | Live | Normal — nicht hervorheben |
| `standby` | Standby | Normal — **kein** Warning |
| `signal_delayed` | Soft Offline | Zählen, P2-Hinweis |
| `offline` | Offline | Zählen, P1 wenn Anteil hoch |
| `no_signal` | Unbekannt | Zählen separat |

Backend-Resolver: `telemetry-freshness.resolver.ts` / `vehicle-state-interpreter.ts` — identisch zu Rental `telemetryFreshness.ts`.

**Nicht verwenden:** `GET /admin/dimo/fleet-connectivity` **summary** für Dashboard-Aggregate — der Admin-Controller nutzt abweichende 5-Min-Schwelle; Full-Payload ist zu schwer.

### 6.3 Komponente: `MasterDashboardConnectivitySummary`

Kompakte Zeile + optional Mini-Bars:

```
Fahrzeug-Konnektivität (DIMO)     Live 142 · Standby 89 · Soft Offline 4 · Offline 2 · Unbekannt 1
Plattform: Token OK · Poll-Erfolg 98% (24h)
```

| Feld | Source of Truth |
|------|----------------|
| Freshness-Histogram | **`GET /admin/connectivity/platform-summary`** (**neu**, Backend-Aggregat via `resolveTelemetryFreshness`) |
| Plattform-Poll | `platform-health.monitoring` oder `AdminFleetConnectivityResponse.pollHealth` **nur** pollHealth-Teil |
| DIMO connected | `platform-health.integrations.dimo` |

**Phase 1 (ohne neues Histogram-API):** Nur Plattformzeile (Token, connected/total, `staleVehicles` aus monitoring) + Link „Details“ — **keine** Fahrzeug-Balken erfinden.

**Drilldown:** `view=fleet-connection` (Filter vorausgewählt: offline / signal_delayed).

---

## 7. Billing Health

### 7.1 Komponente: `MasterDashboardBillingSummary`

Kompakte `DataCard` — **nur kanonische Felder** aus `AdminBillingOverviewDto`:

| Anzeige | Feld | Severity |
|---------|------|----------|
| Aktive Verträge | `activeSubscriptions` | neutral |
| Trials | `trialingSubscriptions` | neutral |
| Past Due | `pastDueSubscriptions` | warning wenn >0 |
| Abgleich | `reconciliationDrifts` | critical wenn >0 |
| Webhook-Fehler | `stripeSyncErrors` | warning wenn >0 |
| Fehlzahlungen | `failedPayments` | critical wenn >0 |
| Ohne Zahlungsmethode | `missingPaymentMethods` | warning wenn >0 |

**MRR:** Nur in **Business Context** (§9), mit `mrrIncomplete`-Hinweis — **nicht** above the fold.

**Keine** lokale Berechnung. `GET /admin/dashboard` MRR-Feld wird **deprecated** für Dashboard.

**Drilldown:** `view=billing` → Übersicht; bei Anomalie → Section „System & Sync“ oder Org-Liste.

---

## 8. Jobs & Queues

### 8.1 Komponente: `MasterDashboardQueueSummary`

**Keine** BullMQ-Tabelle auf dem Dashboard.

| Signal | Anzeige | Schwelle |
|--------|---------|----------|
| Failed jobs (gesamt) | Summe `queues[].failed` | warning >0, critical >10 (QueueMonitoringService) |
| Critical queues | Count `status==='critical'` | critical |
| Abnormal backlog | Summe `waiting` | warning wenn queue `status==='warning'` |
| Scheduler failure | `monitoring.unhealthyWorkers > 0` | warning/critical |
| Stalled | **Nicht direkt in QueueCounts** — via `monitoring.delayedOrStuckJobs` | warning >10 |

**Normal laufend:** Eine Zeile „Worker betriebsbereit · X Jobs aktiv“ in dezentem Text — nur wenn keine Warnung.

**Drilldown:** `view=platform-health` + `opsTab=workers` (URL-Ziel laut Navigation Blueprint).

---

## 9. Backup / Resilience Health

### 9.1 Backend-Prerequisite

Aktuell **kein** Read-API. Blueprint definiert:

```
GET /admin/ops/resilience-status
```

| Feld | Beschreibung |
|------|--------------|
| `postgres.lastSuccessAt` | Letztes erfolgreiches PG-Backup |
| `clickhouse.lastSuccessAt` | Letztes CH-Backup |
| `offsite.lastSyncAt` | Offsite-Sync |
| `offsite.status` | `ok` \| `stale` \| `failed` \| `unknown` |
| `restoreValidation.lastRunAt` | Restore-Drill |
| `restoreValidation.status` | `passed` \| `failed` \| `overdue` \| `unknown` |
| `overall` | `healthy` \| `warning` \| `critical` \| `unknown` |
| `generatedAt` | ISO |

Quelle: Ops-Artefakte / Cron-Status-Dateien auf VPS (siehe `architecture/MASTER_ADMIN_OFFSITE_BACKUPS_2026-07-26.md`) — **nicht** im Frontend schätzen.

### 9.2 Komponente: `MasterDashboardResilienceSummary`

| Zustand | UI |
|---------|-----|
| `healthy` | Eine Zeile: „Backups aktuell · Offsite OK · Letzte Prüfung: …“ |
| Abweichung | Prominent in Incidents + Domain Chip Backup |
| `unknown` | „Backup-Status nicht gemeldet“ + Link Ops-Doku — **kein** grünes OK |

**Drilldown:** Architektur/Changes-Eintrag oder externe Runbook-URL — kein Fake-Detail-Screen.

---

## 10. Recent Platform Activity

### 10.1 Bewertung

**Ja — kompakt sinnvoll**, aber **gefiltert**. Nicht der rohe 20er-Feed aus `getDashboardStats()`.

### 10.2 Komponente: `MasterDashboardActivityStream`

| Regel | Wert |
|-------|------|
| Max Einträge | 8 |
| Scroll-Cap | **Verboten** — „Alle anzeigen“ Link |
| Zeilen klickbar | Ja → Entity-Drilldown |

**Erlaubte Events (Whitelist):**

| Entity | Actions |
|--------|---------|
| `ORGANIZATION` | CREATE, SUSPEND, … |
| `SUBSCRIPTION` | CREATE, UPDATE, CANCEL, … |
| `INTEGRATION` / DIMO-relevant | DISCONNECT, TOKEN_ERROR, … |
| `SETTINGS` | Master-relevante Änderungen |
| `ROLE` / IAM | Privilegierte MA-Aktionen |
| Custom | `INCIDENT_RESOLVED` (wenn eingeführt) |

**Quelle:** `GET /admin/activity-log?limit=8&importance=high` — **neuer Query-Parameter** oder dediziertes `GET /admin/dashboard/activity-highlights`.

**Bis API existiert:** `recentActivity` aus Dashboard filtern clientseitig nach Entity-Whitelist — **temporär**, mit Hinweis in Implementierung.

**Drilldown:** Activity Log mit vorausgefülltem Filter; Org-Events → Org-Detail.

---

## 11. Open Support (kompakt)

### 11.1 Platzierung

Nicht als riesiges Widget. Wenn `openTickets > 0`:

- Incident-Zeile oder eigene Section mit max **3** neuesten Tickets
- Zeile klickbar → `view=support&ticketId=`

**Quellen:**

| Daten | API |
|-------|-----|
| Count | `GET /admin/support/stats` oder `operational.support.openTickets` |
| Neueste | `GET /admin/support/newest?limit=3` |

**Merge:** `NewestSupportWidget` + Support-KPI → eine Section.

---

## 12. Business Context (collapsible)

### 12.1 Komponente: `MasterDashboardBusinessContext`

`MasterPageSection` mit `defaultCollapsed: true`, Titel „Geschäftskontext“.

| KPI | Quelle | Priorität |
|-----|--------|-----------|
| Aktive Organisationen | `GET /admin/stats/organizations` → `active` | P3 |
| Gesamt-Nutzer | Optional — niedrige Priorität | P3 |
| MRR | `billing/overview.mrr` + incomplete flag | P3 |
| Interessenten | `prospect.count` — nur hier | P3 |

**Alle KPIs klickbar** mit Drilldown (Organizations, Billing, Prospects).

---

## 13. Quick Actions

Max **3** globale Aktionen — im `MasterPageHeader.actions` oder kompakte Button-Zeile am Seitenende.

| Aktion | Typ | Ziel |
|--------|-----|------|
| **Organisation erstellen** | Primary (wenn keine P0) / Secondary (bei Incident) | `view=organizations` + Create-Wizard öffnen |
| **Plattformstatus öffnen** | Secondary | `view=platform-health` |
| **Support-Inbox** | Secondary — nur wenn `openTickets > 0` | `view=support` |

**Nicht:** Invite User, Activity, Export, Monitoring-Settings (entfernt/redirect).

---

## 14. Visual System

### 14.1 Page Framework Mapping

| Element | Komponente | Token |
|---------|------------|-------|
| Page | `PageContainer variant="wide"` | `--master-shell-max-wide` |
| Stack | `.master-page-stack` | 20px |
| Sections | `MasterPageSection` | `--master-section-gap` 24px |
| Status Hero | Custom innerhalb Section | `surface-premium`, kein Glass |
| Incidents | `DataCard` + Liste | `border-l-4` bei active |
| Domain Summaries | `DataCard` compact | `master-card-gap` |
| KPIs (Business) | `MetricCard` `valueSize="compact"` | max 4 pro Row |
| Listen | `DataTable` light oder styled rows | keine verschachtelte Card |
| Empty | `MasterEmptyState` / `EmptyState compact` | — |
| Error | `MasterErrorState` | Retry |
| Stale | `MasterStaleDataHint` | >5 min ohne Refresh |

### 14.2 Alert Hierarchy

| Level | Visuell |
|-------|---------|
| P0 critical | `StatusChip critical`, linke Border, oben in Incident-Liste |
| P1 warning | `StatusChip warning` |
| P2 info | Nur in erweiterten Sections, nicht im Hero |
| OK | Dot green, kurzer Text — kein Banner |

### 14.3 KPI Density

- **Above the fold:** 0 große MetricCards
- **Domain Summaries:** Max 4 kompakte Cards im 2×2 Grid (lg), 1 col (mobile)
- **Business Context:** Max 4 MetricCards, collapsed default

### 14.4 Verboten

- Card-in-Card (Liste in doppelt gerahmter Box)
- `max-h-[280px]` Scroll in Overview-Listen
- Dekorative Donut/Line Charts (siehe §15)
- Gradient-Primary-Buttons
- EN-Labels auf DE-Blueprint-Seite

### 14.5 Typography

- Section-Titel: `text-[15px] font-semibold` (SectionHeader)
- Incident-Titel: `text-sm font-medium`
- Meta/Zeit: `text-xs text-muted-foreground`
- Domain-Chips: `text-[11px] font-semibold`

---

## 15. Chart Policy

**Default: Keine Charts auf dem Dashboard.**

| Visualisierung | Erlaubt? | Begründung |
|----------------|----------|------------|
| Domain-Chip-Ampeln | ✅ | Schneller Scan besser als Zahl |
| Incident-Liste | ✅ | Actionability > Trend |
| Freshness-Zahlen (Text) | ✅ | 5 States als Zahlen reichen; Donut wäre dekorativ |
| Queue Failed Sparkline | ❌ | Trend gehört Grafana; Dashboard braucht Schwellwert |
| MRR Trend | ❌ | Billing Analytics, nicht Ops Overview |
| Org-Wachstum | ❌ | Vanity — Zahl in collapsed Context reicht |
| Error-Rate 24h Chart | ❌ | `platform-health` + Grafana Deep-Dive |

**Regel:** Chart nur wenn **Trend-Entscheidung** in <10s nötig — auf dem MA-Dashboard nie der Fall.

---

## 16. Data Contract

### 16.1 Primärer Aggregat-Endpoint (Ziel)

```
GET /admin/dashboard/operational
```

Serverseitige Zusammenführung — **eine** `generatedAt`, konsistente Severity. Reduziert N+1 und Duplicate-Fetch mit `useMasterNavBadges`.

**Bis verfügbar:** Parallel-Fetch der unten genannten Kanon-APIs mit gemeinsamem `refetchInterval: 60_000`.

### 16.2 Modul-Verträge

| Modul | Data Source | Endpoint | Source of Truth | Refresh | Stale Threshold | Error Behavior | Drilldown |
|-------|-------------|----------|-----------------|---------|-----------------|----------------|-----------|
| **Status Hero** | Platform Health | `GET /admin/platform-health` | `overallStatus`, `generatedAt` | 60s + manual | 5 min → `MasterStaleDataHint` | Section Error + Retry; **kein** „OK“ | `platform-health` |
| **Domain Chips** | Operational DTO | `operational.domainStatus` oder abgeleitet serverseitig | Server-Berechnung aus Health + Billing + Resilience + Support | 60s | 5 min | Chip `?` + Tooltip | Je Domäne |
| **Incidents** | Operational DTO | `operational.incidents[]` oder `platform-health.alerts` + Billing | Server-Merge | 60s | 5 min | Leer + Error-Banner | `platform-health` / `billing` |
| **Platform Status** | Platform Health | `GET /admin/platform-health` | `readiness`, `monitoring`, `queues`, `integrations`, `observability` | 60s | 5 min | Partial render checks | `platform-health` |
| **Org Attention** | Billing Orgs | `GET /admin/billing/organizations` | `warnings[]` per row | 120s | 10 min | Section hidden on error | `billing` + orgId |
| **Billing Summary** | Billing Overview | `GET /admin/billing/overview` | `AdminBillingOverviewDto` | 120s | 10 min | Card Error | `billing` |
| **Connectivity Summary** | Platform Summary | `GET /admin/connectivity/platform-summary` (**neu**) | `telemetry-freshness.resolver` | 120s | 10 min | Phase 1: nur platform-health subset | `fleet-connection` |
| **Queue Summary** | Platform Health | `platform-health.queues` + `monitoring` | `QueueMonitoringService` | 60s | 5 min | „Queues nicht verfügbar“ | `platform-health?opsTab=workers` |
| **Resilience** | Ops Status | `GET /admin/ops/resilience-status` (**neu**) | VPS backup scripts status | 300s | 30 min | `unknown` — nie green | Architektur / Runbook |
| **Support** | Support API | `stats` + `newest` | Support service | 60s | 5 min | Hidden | `support` |
| **Activity** | Activity Log | `activity-log?importance=high` | ActivityLog DB | 120s | 10 min | Empty | `activity-log` |
| **Business Context** | Mixed | `org/stats`, `billing/overview`, dashboard counts | Jeweilige Domain-APIs | 300s | 30 min | Collapsed section error | Jeweilige Views |
| **Nav Badges** | **Gleiche** operational DTO | Shared React Query key | **Identisch** zu Dashboard | 60s | — | Badge degraded | — |

### 16.3 Deprecation

| Legacy | Aktion |
|--------|--------|
| `GET /admin/dashboard` KPI-Felder (MRR, trial orgs, vehicle count as „connected“) | **Nicht** im neuen Dashboard verwenden |
| `GET /admin/monitoring/alerts` direkt im Dashboard | Über `platform-health` oder `operational` |
| Frontend `hasCritical` Ableitung | Entfernen |
| `useMasterNavBadges` hardcoded `platformCritical: false` | An `operational` koppeln |

### 16.4 Shared Data Layer

- React Query (oder äquivalent) mit Keys: `['master','dashboard','operational']`
- `useMasterNavBadges` **consumiert denselben Cache** — kein zweiter `dashboard()`-Fetch
- `staleTime: 30_000`, `refetchInterval: 60_000` für Ops-Module

---

## 17. Responsive Priority

### 17.1 Mobile (<640px)

**Zwingende Reihenfolge** (keine Grid-Kompression von Desktop):

1. Page Header (kompakt, Primary Action als Icon)
2. Status Hero (volle Breite, Domain-Chips wrap 2 pro Zeile)
3. Active Incidents
4. Critical Attention (Orgs + Support wenn P0/P1)
5. Platform Status (alle Gruppen collapsed default)
6. Domain Summaries (1 col Stack)
7. Activity
8. Business Context (collapsed)
9. Quick Actions (sticky bottom optional — **nicht** Phase 1)

### 17.2 Tablet (640–1024px)

Gleiche Reihenfolge wie Mobile. Domain Summaries 2 col.

### 17.3 Desktop / Wide

- Status Hero + Incidents side-by-side **nur** wenn Incidents ≤2 und Hero kurz — **Default: gestapelt** (Incidents volle Breite)
- Domain Summaries 2×2 Grid
- Business Context rechts **nicht** — bleibt unten collapsed

---

## 18. Loading / Error / Stale States

| State | Verhalten |
|-------|-----------|
| **Initial Load** | Skeleton: Hero-Balken + 3 Incident-Zeilen + Platform Status 4 Zeilen — **kein** KPI-Grid-Skeleton |
| **Partial Failure** | Hero aus Health OK; fehlgeschlagene Section zeigt `MasterErrorState` inline — Rest bleibt |
| **Total Failure** | Full-page `MasterErrorState` mit Retry |
| **Stale** | `MasterStaleDataHint` in Header meta wenn `now - generatedAt > 5min` |
| **Empty Incidents** | Ruhiger OK-Text (§4.4) |
| **Unknown Backup** | Explizit `unknown` — nie silent OK |

---

## 19. Remove / Keep / Merge / Add Matrix

| Ist-Element | Aktion | Ziel |
|-------------|--------|------|
| Header StatusChip (alerts-derived) | **Remove** | Status Hero mit `platform-health.overallStatus` |
| KPI: Active Organizations | **Move** | Business Context |
| KPI: Connected Vehicles (irreführend) | **Remove** | Ersetzt durch Connectivity Summary |
| KPI: Platform Users | **Move** | Business Context (optional) |
| KPI: MRR (dashboard-berechnet) | **Remove** | Billing Overview in Business Context |
| KPI: DIMO Vehicles count | **Remove** | Connectivity Summary |
| KPI: Active Subscriptions | **Merge** | Billing Summary |
| KPI: Trial Organizations (PENDING) | **Remove** | Billing `trialingSubscriptions` |
| KPI: Total Prospects | **Move** | Business Context |
| KPI: Open Support Tickets | **Merge** | Support Section + Incident wenn kritisch |
| Platform Alerts Card | **Merge** | Active Incidents (prominent) |
| Recent Activity Card | **Keep** | Gefiltert + klickbar |
| Newest Support Widget | **Merge** | Open Support Section |
| `api.admin.dashboard()` | **Deprecate** für UI | Ersetzt durch `operational` + domain APIs |
| RightSidebar Stats (entfernt UI-3) | **Add** | Status Hero + Business Context |
| Platform Health View | **Keep** (separat) | Drilldown — nicht duplizieren |
| Billing Control Center | **Keep** (separat) | Drilldown |
| Fleet Connection | **Keep** (separat) | Drilldown |

### Neue Komponenten (Implementierungsphase)

| Komponente | Pfad (Ziel) |
|------------|-------------|
| `MasterDashboardStatusHero` | `frontend/src/master/dashboard/` |
| `MasterDashboardIncidentList` | … |
| `MasterDashboardPlatformStatus` | … |
| `MasterDashboardOrgAttentionList` | … |
| `MasterDashboardBillingSummary` | … |
| `MasterDashboardConnectivitySummary` | … |
| `MasterDashboardQueueSummary` | … |
| `MasterDashboardResilienceSummary` | … |
| `MasterDashboardActivityStream` | … |
| `MasterDashboardBusinessContext` | … |
| `useMasterDashboardOperational` | Hook / React Query |

---

## 20. Struktur-Matrix (verbindlich)

| Section | Information | Source of Truth | Priority | Action | Drilldown |
|---------|-------------|-----------------|----------|--------|-----------|
| **Header** | Titel, Beschreibung, Refresh, Stand | `platform-health.generatedAt` | — | Refresh, Plattformstatus öffnen | `view=platform-health` |
| **Status Hero** | `overallStatus` DE | `platform-health.overallStatus` | P0 | — | `platform-health` |
| **Status Hero** | Aktive Probleme (count, max severity) | `operational.incidentSummary` | P0 | Scroll to Incidents | — |
| **Status Hero** | Betroffene Organisationen (count) | `operational.affectedOrgCount` | P0 | Scroll to Org Attention | `billing` filtered |
| **Status Hero** | Domain-Chips (6) | `operational.domainStatus` | P0 | Jump to Section | Domain-View |
| **Incidents** | Severity | `incident.severity` | P0 | — | — |
| **Incidents** | Problem | `incident.summary` | P0 | — | — |
| **Incidents** | Komponente | `incident.affectedComponent` | P0 | — | — |
| **Incidents** | Beginn / Dauer | `incident.firstSeen` | P0 | — | — |
| **Incidents** | Impact | `incident.impact` | P0 | — | — |
| **Incidents** | Betroffene Orgs | `incident.organizationIds[]` | P0 | Org öffnen | `organizations&orgId=` |
| **Incidents** | CTA | — | P0 | „Untersuchen“ | kontextabhängig |
| **Platform Status** | Core Platform Ampel | `readiness.checks` | P1 | Expand | `platform-health` |
| **Platform Status** | Processing Ampel | `queues`, `monitoring`, `readiness.workers` | P1 | Expand | `platform-health?opsTab=workers` |
| **Platform Status** | External Services | `integrations.dimo`, `billing/overview` | P1 | Expand | `fleet-connection` / `billing` |
| **Platform Status** | Resilience | `ops/resilience-status`, `observability` | P1 | Expand | Runbook / `platform-health` |
| **Org Attention** | Org + Reason | `billing/organizations.warnings` | P1 | Zeile klicken | `billing` org / `organizations` |
| **Billing Summary** | Active / Trial / Past Due / Drift / Webhooks / Failed | `billing/overview` | P1/P2 | Card klicken | `view=billing` |
| **Connectivity** | Freshness-Counts | `connectivity/platform-summary` (**neu**) | P1 | — | `fleet-connection` |
| **Connectivity** | DIMO Plattform (Token, Poll) | `platform-health.integrations` + `monitoring` | P1 | — | `fleet-connection` |
| **Queues** | Failed / Critical / Backlog | `platform-health.queues`, `monitoring` | P1 | — | `platform-health?opsTab=workers` |
| **Resilience** | Backup / Offsite / Restore | `ops/resilience-status` (**neu**) | P1 | — | Architektur-Doc |
| **Support** | Offene Tickets + 3 neueste | `support/stats`, `support/newest` | P1 | Ticket öffnen | `view=support` |
| **Activity** | High-value Events (max 8) | `activity-log` filtered | P2 | Zeile klicken | `activity-log` / Entity |
| **Business Context** | Orgs, Users, MRR, Prospects | `stats/organizations`, `billing/overview` | P3 | KPI klicken | Jeweilige View |
| **Quick Actions** | Org erstellen | — | P2 | Wizard | `organizations` |
| **Quick Actions** | Plattformstatus | — | P2 | Navigate | `platform-health` |
| **Quick Actions** | Support | `support/stats` | P2 | Navigate | `support` |

---

## 21. Backend-Prerequisites (vor UI-4 Implementierung)

| # | Endpoint / Änderung | Blockiert |
|---|---------------------|-----------|
| 1 | `GET /admin/dashboard/operational` — aggregiert Hero, Incidents, domainStatus, affectedOrgCount | Saubere Data Layer, Nav Badges |
| 2 | `GET /admin/ops/resilience-status` — Backup/Offsite/Restore | Resilience Section + Backup Chip |
| 3 | `GET /admin/connectivity/platform-summary` — kanonisches Freshness-Histogram | Vehicle Summary (voll) |
| 4 | `activity-log?importance=high` oder `dashboard/activity-highlights` | Gefilterter Activity Stream |
| 5 | Deprecate irreführende Felder in `GET /admin/dashboard` | Duplicate Truth |
| 6 | `useMasterNavBadges` an operational DTO | Sidebar Badge-Wahrheit |

**Phase 1 UI** kann mit (1) teilweise entfallend starten, wenn parallel `platform-health` + `billing/overview` + `support/stats` gebündelt werden — **Resilience** und **Freshness-Histogram** bleiben bis (2)/(3) im `unknown`/reduziert-Modus.

---

## 22. Abnahmekriterien (10-Sekunden-Test)

Nach Implementierung muss der Master Admin auf dem Dashboard ohne Scroll (Desktop) beantworten können:

| # | Frage | Akzeptanz |
|---|-------|-----------|
| 1 | Ist SynqDrive gesund? | Status Hero `overallStatus` |
| 2 | Akuter Incident? | Incident count > 0 sichtbar |
| 3 | Betroffene Komponente? | Incident-Zeile `affectedComponent` |
| 4 | Orgs betroffen? | Hero-Zeile oder Incident-Org-Chips |
| 5 | Billing-Probleme? | Billing Chip + Summary |
| 6 | DIMO/Telemetry? | Connectivity + DIMO Chip |
| 7 | Queue/Worker? | Queue Summary + Worker Chip |
| 8 | Backups? | Resilience Zeile (oder explicit unknown) |
| 9 | Security? | **Out of scope** Dashboard — MFA nur Sidebar Badge |
| 10 | Wo eingreifen? | Jede Incident-Zeile hat CTA |

---

## 23. Referenzen

| Dokument / Code | Relevanz |
|-----------------|----------|
| `docs/ui/master-admin-dashboard-deep-audit.md` | Ist-Analyse, Scores |
| `docs/ui/master-admin-canonical-page-framework.md` | Overview + Operational Templates |
| `frontend/src/rental/lib/telemetryFreshness.ts` | Kanonische Freshness-States (Frontend) |
| `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` | Kanonische Freshness (Backend) |
| `backend/src/modules/platform-admin/platform-admin.service.ts` | `getPlatformHealth`, Alerts |
| `backend/src/modules/billing/billing-admin.service.ts` | `getOverview`, Org warnings |
| `architecture/MASTER_ADMIN_OBSERVABILITY_ARCHITECTURE_2026-07-26.md` | Alertmanager-Gap |
| `architecture/MASTER_ADMIN_OFFSITE_BACKUPS_2026-07-26.md` | Resilience-Quelle |

---

**Status:** Spezifikation abgeschlossen — **keine Implementierung** in dieser Phase.  
**Nächster Schritt:** UI-4.3 Backend-Prerequisites + UI-4.4 Dashboard-Implementierung gemäß diesem Blueprint.
