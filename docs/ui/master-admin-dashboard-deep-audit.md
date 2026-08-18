# Master Admin — Dashboard Deep Audit (Plattform-Übersicht)

**Datum:** 2026-08-18  
**Phase:** UI-4.1 (read-only — keine Implementierung)  
**Scope:** `MasterDashboardView` (`frontend/src/master/components/MasterDashboardView.tsx`) und zugehörige APIs  
**Basis:**
- `docs/ui/master-admin-information-architecture-audit.md`
- `docs/ui/master-admin-canonical-navigation-blueprint.md`
- `docs/ui/master-admin-canonical-page-framework.md`
- `docs/ui/master-admin-page-framework-post-remediation.md`

**Kernfrage:** Kann ein Master Admin innerhalb von **10 Sekunden** den operativen Zustand der Plattform erfassen und wissen, wo er eingreifen muss?

---

## 1. Executive Summary

Die aktuelle **Plattform-Übersicht** ist visuell ein sauberes Overview-Template (UI-3 Page Framework), fachlich jedoch **keine Enterprise Control Plane**. Sie zeigt überwiegend **Vanity-/Growth-KPIs** (Organisationen, Nutzer, MRR, Prospects) und nur einen **schmalen operativen Ausschnitt** (synthetische Alerts, Activity-Feed, Support-Widget).

| Dimension | Ist-Zustand |
|-----------|-------------|
| **Operative Klarheit** | Schwach — 2/10 Kernfragen in ≤10s beantwortbar |
| **Plattformgesundheit** | Nicht auf dem Dashboard — nur auf separater View `Plattformstatus` |
| **Incident-Bewusstsein** | Teilweise — synthetische Alerts, kein Incident-Modell, kein Ack |
| **Billing-/DIMO-/Queue-Signale** | Fehlen fast vollständig auf dem Dashboard |
| **Actionability** | Niedrig — 8 von 9 KPI-Zeilen ohne Drilldown |
| **Datenvertrauen** | Mittel — stille Fehler, irreführende Labels, zweite MRR-Wahrheit |
| **Visuelle Qualität** | Solide Patterns, aber falsche Informationshierarchie und EN-Labels |

**Kritischste Befunde (P0):**

1. **Header „System normal“ kann falsch positiv sein** — Alerts-API-Fehler → leeres Array → grüner Status; nur `critical`-Severity zählt (Warnings ignorieren); kein Readiness-/Health-Check.
2. **„Connected Vehicles“ ist irreführend** — zeigt `prisma.vehicle.count()`, nicht Konnektivität/Telemetrie.
3. **Dashboard-MRR ≠ kanonisches Billing-MRR** — eigene Berechnung in `getDashboardStats()` statt `GET /admin/billing/overview`.
4. **RightSidebar-Inhalt nach UI-3 nicht in Dashboard integriert** — Quick Stats, Live Activity, Platform Status Rail entfallen global.
5. **Keine Backup-/Security-/Queue-Signale** — Recovery-Fähigkeit und operative Security nicht sichtbar.

**Fazit:** Das Dashboard erfüllt das kanonische **Overview-Template** formal (KPI-Strip + Primary/Secondary Cards), aber **nicht** die fachliche Rolle als **operativer Hub** laut Navigation Blueprint (§4.1) und Page Framework (§5.A + §5.E). `Plattformstatus` trägt die echte Health-Last — das Dashboard verlinkt nicht dorthin.

**Empfehlung:** UI-4 Dashboard-Remediation — operatives „Problems First“-Layout mit kanonischen Aggregaten (`/admin/platform-health`, `/admin/billing/overview`), ohne Health-Logik im Frontend neu zu erfinden.

---

## 2. Current Dashboard Inventory

**Primäre Datei:** `frontend/src/master/components/MasterDashboardView.tsx`  
**Container:** `PageContainer variant="wide"` (`App.tsx`)  
**Mount-Requests beim Laden:**

| # | Request | Endpoint | Parallel |
|---|---------|----------|----------|
| 1 | `api.admin.dashboard()` | `GET /admin/dashboard` | Ja (Promise.all) |
| 2 | `api.admin.monitoring.alerts()` | `GET /admin/monitoring/alerts` | Ja (`.catch(() => [])`) |
| 3 | `api.support.newest(6)` | `GET /admin/support/newest?limit=6` | Nein (separater `useEffect` in `NewestSupportWidget`) |

**Nicht aufgerufen (existieren aber):** `GET /admin/platform-health`, `GET /admin/billing/overview`, `GET /admin/monitoring/queues`, `GET /admin/monitoring/summary`, `api.dimo.stats()`, Prometheus/Alertmanager.

---

### 2.1 Vollständiges Element-Inventar

| Element | Typ | Zweck | Datenquelle | API | Refresh | Interaktion | Drilldown | MA-Relevanz | Nutzen |
|---------|-----|-------|-------------|-----|---------|-------------|-----------|-------------|--------|
| **Page Header** | Header | Seitentitel + Gesamtstatus | Lokal abgeleitet | — | Mount only | — | — | Hoch | Mittel |
| StatusChip „System normal“ / „Probleme erkannt“ | Status | Plattform-Gesundheit signalisieren | `alerts.some(severity==='critical')` | `/admin/monitoring/alerts` | Mount only | Keine | Keine | **P0** | **Niedrig** (falsch positiv) |
| **Active Organizations** | KPI (Primary) | Aktive Mandanten zählen | Prisma `organization` ACTIVE | `/admin/dashboard` | Mount only | Keine | Keine | P2 | Mittel (Kontext) |
| **Connected Vehicles** | KPI (Primary) | *Behauptet* Konnektivität | Prisma `vehicle.count()` | `/admin/dashboard` | Mount only | Keine | Keine | P2 | **Irreführend** |
| **Platform Users** | KPI (Primary) | Nutzerbasis | Prisma `user.count()` | `/admin/dashboard` | Mount only | Keine | Keine | P3 | Niedrig (Vanity) |
| **Monthly Recurring Revenue** | KPI (Primary) | Umsatzindikator | Summe letzte Rechnung ACTIVE-Subs | `/admin/dashboard` | Mount only | Keine | Keine | P2 | **Mittel** (nicht kanonisch) |
| **DIMO Vehicles** | KPI (Secondary) | DIMO-Fahrzeugbestand | Prisma `dimoVehicle.count()` | `/admin/dashboard` | Mount only | Keine | Keine | P2 | Niedrig ohne Freshness |
| **Active Subscriptions** | KPI (Secondary) | Abo-Anzahl | ACTIVE + TRIALING | `/admin/dashboard` | Mount only | Keine | Keine | P2 | Mittel |
| **Trial Organizations** | KPI (Secondary) | Trials | Org-Status `PENDING` | `/admin/dashboard` | Mount only | Keine | Keine | P3 | **Irreführend** (≠ Billing Trial) |
| **Total Prospects** | KPI (Secondary) | Sales-Pipeline | Prisma `prospect.count()` | `/admin/dashboard` | Mount only | Keine | Keine | P3 | Niedrig (Vanity) |
| **Open Support Tickets** | KPI (Secondary) | Support-Backlog | Support-Ticket-Count | `/admin/dashboard` | Mount only | Klick | → `support` View | P1 | Hoch |
| **Recent Activity** | DataCard + Liste | Letzte Plattform-Events | ActivityLog (20) | `/admin/dashboard` | Mount only | „View All“ | → `activity-log` | P2 | Mittel |
| Activity-Zeilen | Liste | Event-Detail | Embedded in dashboard | — | — | Hover only | **Keine** | P2 | Niedrig |
| **Platform Alerts** | DataCard + Liste | Handlungsbedarf | Synthetische Alerts | `/admin/monitoring/alerts` | Mount only | Keine | **Keine** | **P0** | Mittel |
| Alert-Zeilen | Liste | Problem + Komponente | `getMonitoringAlerts()` | siehe oben | — | Keine | **Keine** | P0/P1 | Mittel |
| **Newest Support Requests** | DataCard + Liste | Neueste Tickets | Support newest | `/admin/support/newest` | Mount only | Keine | **Keine** | P1 | Mittel |
| Support-Zeilen | Liste | Ticket-Vorschau | Support API | — | — | Keine | **Keine** | P1 | Niedrig |

**Nicht dargestellt, aber in API vorhanden:** `totalOrganizations`, `suspendedOrganizations` (Backend liefert, Frontend ignoriert).

---

### 2.2 Fehlende Kategorien (kein UI-Element)

| Kategorie | Auf Dashboard | Wo stattdessen (falls überhaupt) |
|-----------|---------------|----------------------------------|
| Charts | ❌ | — |
| Tabellen (strukturiert) | ❌ | Plattformstatus, Billing |
| Quick Actions | ❌ | Sidebar Quick Actions entfernt (Blueprint) |
| Backend/Postgres/Redis/CH Health | ❌ | `PlatformHealthView` → readiness |
| BullMQ Queues | ❌ | `PlatformHealthView` |
| Worker/Scheduler | ❌ | `PlatformHealthView`, Settings-Redirect → platform-health |
| Prometheus/Grafana/Alertmanager | ❌ | `PlatformHealthView` (URLs only) |
| Stripe/Billing Health | ❌ | `BillingOverviewTab` |
| DIMO Telemetry Freshness | ❌ | Fleet Connection, Monitoring |
| Backup/DR | ❌ | Nur Ops-Skripte/Docs, **kein API-Status** |
| Security Signals | ❌ | IAM/Team (tenant-scoped), kein MA-Aggregat |
| Incidents (Ack/Duration) | ❌ | — |
| Logs | ❌ | Activity Log (separate View) |
| Integrationen (HM/Stripe/Voice) | ❌ | Jeweilige Views |

---

## 3. 10-Second Test

Bewertung: **Kann der Master Admin die Frage in ≤10 Sekunden auf dem Dashboard beantworten?**

| # | Frage | Ergebnis | Evidenz | Gap |
|---|-------|----------|---------|-----|
| 1 | Ist SynqDrive aktuell gesund? | ❌ **Nein** | Header nur bei `critical` Alerts; kein Readiness; Alerts-Fehler → „System normal“ | `GET /admin/platform-health` nicht genutzt |
| 2 | Gibt es einen akuten Incident? | ⚠️ **Teilweise** | Platform Alerts Card zeigt synthetische Alerts | Kein Incident-Objekt, kein Firing-Prometheus, keine Severity-Hierarchie above-the-fold |
| 3 | Welche Plattformkomponente ist betroffen? | ⚠️ **Teilweise** | `affectedComponent` Chip pro Alert | Nur bei Alerts; keine Komponenten-Matrix; Polling ≠ ganze Plattform |
| 4 | Sind Kundenorganisationen betroffen? | ❌ **Nein** | Activity zeigt `organizationName` optional | Kein „Orgs affected“-Aggregat; Alerts ohne Org-Scope |
| 5 | Gibt es Billing-Probleme? | ❌ **Nein** | Nur MRR + Subscription-Count | Kein Past Due, Drift, Webhook-Fehler, Failed Payments |
| 6 | Gibt es DIMO-/Telemetry-Probleme? | ❌ **Nein** | Nur `totalDimoVehicles` Zahl | Kein Freshness, Disconnect, Auth, Import-Fehler |
| 7 | Gibt es Queue-/Worker-Probleme? | ❌ **Nein** | — | Alerts können Worker erwähnen, aber nicht zuverlässig sichtbar |
| 8 | Funktionieren Backups? | ❌ **Nein** | — | Kein Backup-Status-Endpoint im Backend |
| 9 | Gibt es Security-relevante Auffälligkeiten? | ❌ **Nein** | — | Kein MA-Security-Aggregat |
| 10 | Wo muss jetzt eingegriffen werden? | ⚠️ **Teilweise** | Support-Ticket-KPI klickbar; „View All“ Activity | Alerts/Activity/Tickets ohne Zeilen-Drilldown; kein „Top Actions“-Block |

**Score 10-Second Test: 2/10 vollständig, 3/10 teilweise → FAIL**

---

## 4. Information Priority

### 4.1 Element-Klassifikation

| Element | Priorität | Begründung |
|---------|-----------|------------|
| Header Status (aktuell) | **P3 dekorativ / P0 riskant** | Suggeriert Sicherheit ohne echte Health-Basis |
| Platform Alerts (wenn geladen) | **P0–P1** | Einzige operative Signale — aber versteckt in Secondary Column |
| Open Support Tickets | **P1** | Operatives Backlog — einziger klickbarer KPI |
| Newest Support Widget | **P1** | Relevant, aber ohne Navigation |
| Recent Activity | **P2** | Kontext, kein Incident-Signal |
| Active Organizations | **P2** | Situational awareness |
| MRR / Subscriptions | **P2–P3** | Business, nicht Incident |
| Connected Vehicles (Label) | **P3 irreführend** | Falsche Semantik |
| Trial Organizations (PENDING) | **P3 irreführend** | Verwechslung mit Billing TRIALING |
| Total Prospects | **P3** | Sales, nicht Ops |
| Platform Users | **P3** | Vanity auf Ops-Dashboard |
| DIMO Vehicles (count only) | **P3** | Ohne Health-Kontext wertlos für Incident |

### 4.2 Strukturelle Prioritätsfehler

| Problem | Beschreibung |
|---------|--------------|
| **P0 versteckt** | Alerts unterhalb von 9 KPI-Zeilen; Warnings ändern Header nicht |
| **P3 dominant** | 7 von 9 KPIs sind Growth/Vanity oder irreführend |
| **Dekorative KPIs** | Users, Prospects, DIMO count ohne Trend/Threshold |
| **Redundanz** | Support: KPI + Widget + (früher RightSidebar) — ohne einheitlichen Drilldown |
| **Informationsüberlastung** | 9 KPIs + 3 Cards vor operativer Klarheit |
| **Fehlende P0-Zone** | Kein „Active Problems“-Strip (Framework §5.E Operational Page) |

---

## 5. Platform Health

### 5.1 Erwartete Komponenten vs. Dashboard

| Komponente | Auf Dashboard | Echte Health-Quelle | Fake-Health-Risiko |
|------------|---------------|----------------------|-------------------|
| Backend API | ❌ | `HealthService.checkReadiness()` | Header suggeriert OK ohne Check |
| Frontend | ❌ | — | Nicht geprüft (SPA lädt = „ok“) |
| PostgreSQL | ❌ | readiness.checks.postgres | — |
| ClickHouse | ❌ | readiness.checks.clickhouse | CH `disabled` = ok (korrekt in Health API) |
| Redis | ❌ | readiness.checks.redis | — |
| BullMQ | ❌ | `QueueMonitoringService` | — |
| Worker Runtime | ❌ | readiness.checks.workers | — |
| Scheduler | ❌ | DIMO poll logs / worker stats | — |
| Prometheus | ❌ | observability.prometheusUrl | — |
| Grafana | ❌ | observability.grafanaUrl | — |
| Alertmanager | ❌ | **Nicht angebunden** | Alerts sind synthetisch, nicht AM |
| DIMO | ❌ | integrations.dimo + tokenHealth | Nur Fahrzeuganzahl |
| Stripe | ❌ | billing overview stripeSyncErrors | — |
| Notification Engine | ❌ | failedEmailDeliveries (Billing API) | — |
| AI / Voice | ❌ | Voice Control Plane (separat) | — |
| Backup | ❌ | Ops-Skripte only | — |
| Document Extraction | ❌ | readiness.checks.documentExtraction | — |

### 5.2 Kann „healthy“ falsch positiv sein?

**Ja — mehrfach:**

1. **Alerts `.catch(() => [])`** — Netzwerk/Auth-Fehler → „All Clear“ + „System normal“.
2. **Nur `critical` im Header** — `warning`-Alerts (erhöhte Fehlerrate, stale vehicles) → grüner Header.
3. **Dashboard lädt, Health degraded** — `getDashboardStats()` nutzt nur Prisma-Counts; DB erreichbar ≠ System gesund.
4. **„Connected Vehicles“** — reiner Bestand, kein Online-Status.
5. **Sidebar Badge `platformHealthy`** — `useMasterNavBadges`: `platformHealthy: dashboard != null` (API erreichbar ≠ healthy); `platformCritical: false` **hardcoded**.

### 5.3 Stale Data / Last Signal / Partial Degradation

| Aspekt | Dashboard | Plattformstatus (Kontrast) |
|--------|-----------|----------------------------|
| `generatedAt` Timestamp | ❌ | ✅ |
| Auto-Refresh (60s) | ❌ | ✅ |
| Manual Refresh | Nur Error-Retry | ✅ Button |
| Stale-State-Hinweis | ❌ | ❌ (aber Timestamp vorhanden) |
| Partial Degradation | ❌ | ✅ readiness per dependency |

**Fazit Platform Health Visibility:** Dashboard delegiert faktisch alles an `Plattformstatus`, verlinkt aber nicht dorthin — operativer Einstieg fehlt.

---

## 6. Incidents & Alerts

### 6.1 Ist-Zustand Alerts (`getMonitoringAlerts`)

**Quelle:** `platform-admin.service.ts` — **synthetisch** aus `getMonitoringSummary()` (Default-Fenster **24h** wenn keine Params; Dashboard sendet keine Params).

| Alert-Typ | Severity | Trigger (vereinfacht) |
|-----------|----------|----------------------|
| High/Elevated error rate | critical/warning | Poll error rate >20% / >5% |
| Unhealthy workers | critical/warning | degraded worker count |
| Delayed/stuck jobs | warning | enrichment pending >10 |
| Stale vehicles | info/warning | stale count >0 |
| Recent poll failures | warning | bis 3 Einträge |

**Nicht abgedeckt:** Prometheus firing alerts, Alertmanager, Stripe webhooks, Backup failures, Security events, Billing past due.

### 6.2 Incident-Modell

| Feld | Vorhanden |
|------|-----------|
| Aktive Incidents | ❌ |
| Firing Prometheus Alerts | ❌ |
| Severity im UI | ✅ Chip |
| Beginn / Dauer | ⚠️ nur `firstSeen`/`lastSeen` relativ |
| Betroffene Komponente | ✅ `affectedComponent` |
| Betroffene Organisationen | ❌ |
| Acknowledgement | ❌ |
| Drilldown | ❌ |

### 6.3 Trennung kritisch vs. informational

- **Schwach:** Header ignoriert warnings; 9 KPIs dominieren visuell über Alerts.
- **Platform Alerts** und **Recent Activity** gleichwertig nebeneinander (50/50 Grid) — kein Alert-Banner above-the-fold.
- **Kein** dedizierter Incidents-Einstieg in Sidebar (Blueprint: Badge auf Plattformstatus).

---

## 7. Organizations

### 7.1 Auf dem Dashboard sichtbar

| Metrik | Wert | Operativer Nutzen |
|--------|------|-------------------|
| Active Organizations | ACTIVE count | P2 — Kontext |
| Trial Organizations | **PENDING** org status | **Irreführend** — nicht Billing TRIALING |
| (nicht sichtbar) Suspended | API: `suspendedOrganizations` | Fehlt — relevant für Ops |
| (nicht sichtbar) Total Orgs | API: `totalOrganizations` | Fehlt |
| Connectivity Problems | ❌ | — |
| Orgs mit kritischen Fehlern | ❌ | — |

### 7.2 Kanonische Org-Stats

`GET /admin/stats/organizations` existiert (`active`, `trial`, `suspended`, `churned`, `total`) — **Dashboard nutzt es nicht**, berechnet Teilmengen inline im Dashboard-Endpoint.

**Empfehlung:** Org-Signale auf Dashboard nur als **Problem-Aggregate** (z. B. „3 Orgs mit Billing-Warnung“, „2 suspended“) — keine Vanity-Totals ohne Kontext.

---

## 8. Billing

### 8.1 Dashboard vs. kanonische Billing-States

| Signal | Dashboard | Kanonisch (`GET /admin/billing/overview`) |
|--------|-----------|---------------------------------------------|
| MRR | Eigene Summe (latest invoice, ACTIVE only) | `mrr` + `mrrIncomplete` Flag |
| Active Subscriptions | ACTIVE + TRIALING count | `activeSubscriptions` (ACTIVE only) |
| Trials | Org PENDING ❌ | `trialingSubscriptions` (BillingStatus.TRIALING) |
| Past Due | ❌ | `pastDueSubscriptions` |
| Open Invoices | ❌ | `openInvoices` |
| Failed Payments | ❌ | `failedPayments` |
| Missing Payment Methods | ❌ | `missingPaymentMethods` |
| Reconciliation Drift | ❌ | `reconciliationDrifts` |
| Stripe Webhook Errors | ❌ | `stripeSyncErrors` |
| Failed Email (Outbox DLQ) | ❌ | `failedEmailDeliveries` |

**Verstoß:** Dashboard berechnet **eigenen Billing-Status** (MRR, Trials) — Blueprint verlangt kanonische States aus Billing Control Center.

**Sidebar:** `billingAnomaly: false` hardcoded in `useMasterNavBadges` — Badge nie aktiv.

---

## 9. DIMO & Connected Vehicles

| Signal | Dashboard | Kanonische Quelle |
|--------|-----------|-------------------|
| DIMO Vehicle Count | ✅ `totalDimoVehicles` | Prisma count |
| Connected vs Total | ❌ | `platform-health.integrations.dimo` |
| Telemetry Freshness | ❌ | Monitoring summary `staleVehicles` (nur in Alerts) |
| Import/Sync Errors | ❌ | Poll logs / Fleet Connection |
| Authorization Errors | ❌ | tokenHealth |
| Disconnects | ❌ | `connectionStatus` |
| Platform vs Vehicle vs Standby | ❌ | Fleet Connection canonical states |

**Label-Bug:** „Connected Vehicles“ = `vehicle.count()` (alle registrierten Fahrzeuge), **nicht** DIMO-connected oder telemetry-online.

**Sidebar:** `api.dimo.stats()` für Badges — **nicht** auf Dashboard.

---

## 10. Worker & Queues

### 10.1 Verfügbare Backend-Daten

- `GET /admin/monitoring/queues` — BullMQ counts (waiting, active, delayed, failed, status)
- `GET /admin/monitoring/workers` — DIMO poll worker stats
- `GET /admin/monitoring/summary` — systemHealth, delayedOrStuckJobs, etc.
- Embedded in `GET /admin/platform-health`

### 10.2 Dashboard-Relevanz

| Metrik | Auf Dashboard? | Empfohlene Platzierung |
|--------|----------------|------------------------|
| Failed jobs > threshold | Indirekt via Alerts | Dashboard: P0-Badge; Detail: Plattformstatus |
| Queue critical count | ❌ | Summary-Zahl auf Dashboard, Tabelle in Plattformstatus |
| Waiting/Active/Delayed | ❌ | Nur Drilldown |
| Scheduler health | ❌ | Plattformstatus / Worker-Tab |
| Stalled/Retry/Dead Letter | ❌ | Drilldown |

**Bewertung:** Queue-Daten gehören **nicht** vollständig aufs Dashboard — nur **aggregierte P0/P1-Signale** (z. B. „2 Queues critical, 47 failed jobs“).

---

## 11. Backup & Disaster Recovery

| Signal | Sichtbar auf Dashboard | Backend-API |
|--------|------------------------|-------------|
| Letztes PostgreSQL-Backup | ❌ | Kein Status-Endpoint (nur `backend/scripts/ops/vps-backup-*.sh`) |
| Letztes ClickHouse-Backup | ❌ | — |
| Offsite Status | ❌ | — |
| Backup Failure | ❌ | — |
| Restore Validation | ❌ | — |

**Ops-Reife:** Backup-Orchestrierung dokumentiert (`architecture/MASTER_ADMIN_OFFSITE_BACKUPS_2026-07-26.md`, Changes V4.9.892–894), aber **keine Read-API** für Master Admin UI.

**Recovery-Frage („Ist unsere Recovery-Fähigkeit gesund?“):** **Nicht beantwortbar** vom Dashboard.

---

## 12. Security Signals

| Signal | Dashboard | Anmerkung |
|--------|-----------|-----------|
| Kritische Auth Events | ❌ | `IamTeamService.loadSecurityEvents` — tenant-scoped |
| Privilegierte Zugriffe | ❌ | `MasterAdminPrivilegedAuditInterceptor` — Audit-Log, kein MA-Dashboard |
| MFA / Master-Admin-Probleme | ❌ | `useMasterNavBadges` prüft MFA nur für Sidebar `mfa-required` Badge |
| Security Alerts | ❌ | Kein SIEM-Aggregat |

**Korrekt:** Kein vollständiges SIEM auf Dashboard — aber **mindestens** MFA-Enrollment + failed privileged mutations sollten als **kompakte P1-Chips** erscheinen.

---

## 13. Visual Hierarchy

### 13.1 Blickführung (Above the Fold)

**Aktuelle Reihenfolge:**
1. Titel + StatusChip
2. 4 Primary KPIs (Growth)
3. 5 Secondary KPIs (Growth + Support)
4. Activity | Alerts (50/50)
5. Support Widget (conditional)

**Problem:** Ein Master Admin sieht zuerst **9 Zahlenkarten**, bevor operative Signale erscheinen. Entspricht **nicht** Operational Page Pattern (§5.E: Active Problems → Live Metrics → Work Surface).

### 13.2 Visuelle Bewertung

| Kriterium | Bewertung | Anmerkung |
|-----------|-----------|-----------|
| Card Density | Hoch | 9 KPIs + 3 Cards — überladen für Control Plane |
| Weißraum | OK | `master-card-gap`, konsistent nach UI-3 |
| Typography | OK | Patterns `MetricCard`, `DataCard` |
| Statusfarben | Inkonsistent | KPI `status` dekorativ (info/ai/success), nicht semantisch |
| Alert-Farben | OK | critical/warning Chips |
| Icon-System | OK | Lucide, konsistent |
| Chart Density | 0 | Keine Charts (gut für Overview) |
| Borders / Glass | OK | `border-border`, `bg-muted/30` — kein übermäßiges Glass |
| Sprache | **EN** | Titel DE („Plattform-Übersicht“), Inhalte EN — Blueprint: DE kanonisch |
| Nested Scroll | **Anti-Pattern** | Activity/Alerts `max-h-[280px]` — Framework §5.A: „kein capped scroll“ |

### 13.3 Enterprise Control Plane Test

Wirkt eher wie **generisches Admin-Template** (KPI-Grid + zwei Listen) als **AWS Health Dashboard / Stripe Ops Home**. Fehlende: Problem-Banner, Service-Status-Matrix, Zeitstempel, klare CTAs.

---

## 14. Actionability

| Problem-Typ | Drilldown möglich? | Gap |
|-------------|-------------------|-----|
| Critical Alert | ❌ | Kein Link zu Plattformstatus / Monitoring |
| Warning Alert | ❌ | — |
| Activity Event | ❌ | Kein Link zu Entity/Org |
| Support Ticket (Widget) | ❌ | Kein `onViewChange('support')` + ticketId |
| Support KPI | ✅ | → support View |
| MRR / Billing Issue | ❌ | Kein Link zu Billing |
| DIMO Issue | ❌ | Kein Link zu Fleet Connection |
| Queue Issue | ❌ | — |
| Org Issue | ❌ | — |

**Tote KPI Cards:** 8 von 9 KPI-Zeilen ohne `onClick` — verstoßen gegen „keine toten KPIs ohne nächsten Schritt“.

---

## 15. Data Freshness

| Element | Timestamp | Last Update UI | Stale State | Refresh | „Live“? |
|---------|-----------|----------------|-------------|---------|---------|
| Dashboard Stats | ❌ (API ohne `generatedAt`) | ❌ | ❌ | Mount only | ❌ |
| Alerts | `lastSeen` relativ | ✅ pro Alert | ❌ | Mount only | ❌ |
| Activity | `createdAt` relativ | ✅ pro Zeile | ❌ | Mount only | ❌ |
| Support Widget | relativ | ✅ | ❌ | Mount only | ❌ |
| Header Status | ❌ | ❌ | ❌ | — | ❌ |

**Plattformstatus-Kontrast:** `generatedAt` + 60s Polling + Refresh-Button.

**Regelverstoß:** Kein `MasterStaleDataHint`; kein Polling; „System normal“ impliziert Aktualität ohne Beleg.

---

## 16. Responsive

**Breakpoints (Tailwind):**

| Bereich | Mobile (<640) | Tablet (640–1024) | Desktop (1024+) | Wide |
|---------|---------------|-------------------|-----------------|------|
| Primary KPIs | 1 col | 2 col | 4 col | 4 col in 1600px |
| Secondary KPIs | 2 col | 3 col | 5 col | 5 col |
| Activity/Alerts | Stack | Stack | 2 col | 2 col |
| Support Widget | Full width | Full width | Full width | Full width |

### 16.1 Responsive-Probleme

| Problem | Impact |
|---------|--------|
| **KPI-Reihenfolge fix** | Mobile zeigt zuerst Growth-KPIs, nicht Alerts |
| **Alert Priority** | Alerts erst nach Scroll durch 9 KPIs auf Mobile |
| **Kein Mobile-Pin** | Blueprint: Dashboard = Primary Pin 1 — Inhalt nicht ops-first |
| **Touch Targets** | KPI-Cards ohne Klick OK; Support-KPI klickbar |
| **Tabellen/Charts** | N/A |

**Empfehlung Mobile:** P0 „Active Problems“-Banner + kompakte Health-Strip **vor** KPI-Grid.

---

## 17. Technical Architecture

### 17.1 Frontend

| Aspekt | Ist | Bewertung |
|--------|-----|-----------|
| State | `useState` + `useEffect` | Kein React Query / shared cache |
| Parallel Fetch | dashboard + alerts parallel | ✅ |
| Duplicated Fetch | `useMasterNavBadges` ruft **ebenfalls** `api.admin.dashboard()` | ⚠️ Doppelter Request |
| Support Widget | Separater Effect | ⚠️ 3. Request, nicht parallel zum Rest |
| Polling | Keines | ❌ vs. Plattformstatus 60s |
| Error Handling | alerts: silent `[]`; dashboard: ErrorState | ⚠️ Asymmetrisch, falsch positiv |
| Loading | Skeleton grids | ✅ |
| Business Logic im UI | `hasCritical`, `formatMrr`, severity mapping | ⚠️ Health-Ableitung gehört nicht ins UI |
| Error Boundary | Kein view-spezifisches | Global only |

### 17.2 Backend (`getDashboardStats`)

- Reine Prisma-Aggregationen — **kein** Health-, Billing-, DIMO-Enrichment.
- `trialOrganizations` = `OrganizationStatus.PENDING` — semantisch falsch für „Trial“.
- MRR-Berechnung dupliziert Billing-Logik (vereinfacht).
- `recentActivity`: letzte 20 Logs — OK für Feed.

### 17.3 API-Surface (relevant)

```
GET /admin/dashboard              → Dashboard (counts + activity)
GET /admin/monitoring/alerts      → Synthetische Alerts
GET /admin/platform-health        → Kanonische Health-Aggregation (ungenutzt)
GET /admin/billing/overview       → Kanonische Billing-States (ungenutzt)
GET /admin/support/newest         → Support Widget
```

---

## 18. Duplicate Truth Risks

| Risiko | Quelle A | Quelle B | Konflikt |
|--------|----------|----------|----------|
| **Platform Healthy** | Dashboard Header | `platform-health.overallStatus` | Header nur critical alerts |
| **Platform Healthy** | Sidebar Badge | Dashboard API reachability | `platformCritical: false` hardcoded |
| **MRR** | Dashboard KPI | Billing Overview | Unterschiedliche Berechnung + incomplete flag fehlt |
| **Trial Count** | Dashboard „Trial Orgs“ | Billing `trialingSubscriptions` | PENDING ≠ TRIALING |
| **Connected Vehicles** | Dashboard Label | DIMO connected / billable | vehicle.count ≠ connected |
| **Alerts** | Dashboard | Plattformstatus | Gleiche API, aber Dashboard 24h default, Health 1h window |
| **Activity** | Dashboard feed | Activity Log View | Gleiche Quelle, OK |
| **Support Open** | Dashboard KPI | Support stats / newest | Konsistent, aber dreifach UI |

**Frontend-Regel verletzt:** Dashboard erzeugt **zweite Wahrheiten** für Health und Billing statt kanonische Endpoints zu konsumieren.

---

## 19. Findings P0 / P1 / P2 / P3

### P0 — Immediate Action

| ID | Finding |
|----|---------|
| P0-1 | Header „System normal“ bei Alerts-API-Fehler oder fehlenden critical flags — **falsch positiv** |
| P0-2 | Keine echte Plattform-Health auf dem operativen Einstiegsscreen |
| P0-3 | „Connected Vehicles“ semantisch falsch — irreführend bei Incidents |
| P0-4 | Billing-/Queue-/Backup-Probleme unsichtbar — MA erkennt Commerce-/Ops-Ausfälle nicht |
| P0-5 | Alerts ohne Drilldown — P0-Information ohne Handlungspfad |

### P1 — Operational Attention

| ID | Finding |
|----|---------|
| P1-1 | Synthetische Alerts nicht von Prometheus/Alertmanager — Lücken bei Infra-Alerts |
| P1-2 | Warning-Severity ändert Header nicht — degradierte Zustände wirken „grün“ |
| P1-3 | Support Widget/Tickets nicht klickbar |
| P1-4 | Kein `generatedAt`/Refresh — Datenalter unbekannt |
| P1-5 | RightSidebar-Stats nach UI-3 nicht in Dashboard überführt |
| P1-6 | `useMasterNavBadges` hardcoded `platformCritical: false`, `billingAnomaly: false` |
| P1-7 | Activity-Zeilen nicht verlinkt (Org/Entity) |

### P2 — Situational Awareness

| ID | Finding |
|----|---------|
| P2-1 | MRR ohne `mrrIncomplete`-Hinweis |
| P2-2 | Suspended Orgs in API aber nicht UI |
| P2-3 | EN/DE-Mischung auf Dashboard |
| P2-4 | Nested scroll in Activity/Alerts (Framework-Verstoß) |
| P2-5 | Doppelter `dashboard()`-Fetch (View + Nav Badges) |

### P3 — Informational

| ID | Finding |
|----|---------|
| P3-1 | Total Prospects — Sales-Metrik auf Ops-Dashboard |
| P3-2 | Platform Users — wenig operativer Wert |
| P3-3 | Dekorative KPI `status` colors (info/ai) ohne Threshold-Logik |
| P3-4 | Prospects + Trial Orgs verdrängen ops-relevante Fläche |

---

## 20. Recommended Target State

### 20.1 Ziel-Layout (Overview + Operational Hybrid)

Entspricht `master-admin-canonical-page-framework.md` §5.A + §5.E:

```
MasterPageHeader
  └── Status: overallStatus aus platform-health (kanonisch)
  └── Meta: generatedAt + Refresh
  └── Primary Action: „Plattformstatus“ / „Alle Alerts“

Section 1 — Active Problems (P0/P1)     [above the fold, full width]
  └── Critical/Warning Alerts (max 5) + Billing anomalies + Queue critical + Backup failure
  └── Jede Zeile: Severity | Component | Since | CTA

Section 2 — Platform Health Strip (P1)   [compact, 1 row]
  └── Postgres | Redis | CH | Workers | DIMO | Stripe | Backup
  └── Ampel aus readiness + integrations (keine Frontend-Ableitung)

Section 3 — Operational KPIs (P1/P2)      [max 4–6, alle klickbar]
  └── Open Support | Past Due | Failed Jobs | Stale Vehicles | Orgs w/ Warnings | MRR (kanonisch)

Section 4 — Work Surface (P2)
  └── Split: Recent Activity | Newest Support (beide zeilenklickbar)

Section 5 — Business Context (P3, collapsible)
  └── Prospects, Total Users, etc.
```

### 20.2 Datenvertrag (keine zweite Wahrheit)

| UI-Block | Kanonische API | Frontend-Regel |
|----------|----------------|----------------|
| Gesamtstatus | `GET /admin/platform-health` → `overallStatus` | Nur anzeigen, nicht ableiten |
| Health-Matrix | `platform-health.readiness` + `integrations` | — |
| Billing-Signale | `GET /admin/billing/overview` | Keine lokale MRR-Logik |
| Alerts | `platform-health.alerts` oder dedizierter incidents endpoint | Gleiches Fenster wie Health (1h) |
| Queues | Aggregat aus `platform-health.queues` | Details nur auf Plattformstatus |
| Backup | **Neu:** `GET /admin/ops/backup-status` (empfohlen) | Bis dahin: explizit „unknown“ |
| Security | **Neu:** `GET /admin/security/signals` (aggregiert, klein) | Kein SIEM |
| Timestamps | `generatedAt` pro Aggregat | `MasterStaleDataHint` wenn >5min |

### 20.3 Navigation & Badges (Blueprint-Alignment)

- Dashboard verlinkt prominent zu `Plattformstatus`, `Abrechnung`, `Support`, `Fahrzeug-Konnektivität`.
- Sidebar Badges aus **denselben** kanonischen Signalen speisen (`platform-critical`, `billing-anomaly`).
- Kein separates Alert-System im Dashboard-Frontend.

### 20.4 Technische Zielarchitektur

- React Query (oder bestehender Data Layer) mit `staleTime` + `refetchInterval` 60s für Health/Billing-Summary.
- Ein gebündelter Endpoint optional: `GET /admin/dashboard/operational` — serverseitige Aggregation aus Health + Billing + Support (keine Frontend-Derivation).
- `MasterDashboardView` konsumiert nur DTOs mit `generatedAt`.
- Entfernen der MRR/Trial-Berechnung aus `getDashboardStats()` oder Endpoint auf reine Business-KPIs reduzieren.

### 20.5 Visuell

- DE-Labels (`master.nav.*` / deutsche KPI-Beschriftungen).
- P0-Banner mit `critical`-Border, nicht nur Chip im Header.
- Kein `max-h` Scroll in Overview-Cards — Pagination oder „Alle anzeigen“.
- Mobile: Section 1+2 vor allen Vanity-KPIs.

---

## Scores (0–100)

| Dimension | Score | Kurzbegründung |
|-----------|-------|----------------|
| **Operational Clarity** | **32** | 10s-Test fail; Growth-first Layout |
| **Platform Health Visibility** | **18** | Fast keine Health-Signale auf Dashboard |
| **Incident Awareness** | **35** | Synthetische Alerts, keine Incidents, versteckt |
| **Information Hierarchy** | **42** | Framework-Shell OK, Inhaltspriorität falsch |
| **Actionability** | **28** | Fast keine Drilldowns |
| **Data Trustworthiness** | **38** | Silent failures, falsche Labels, Duplicate MRR |
| **Visual Quality** | **62** | Gute Patterns, falsche Hierarchie, EN-Labels |
| **Responsive UX** | **50** | Grid OK, Priority auf Mobile falsch |
| **Technical Cleanliness** | **45** | useState-Fetch, Duplikate, keine Query-Layer |

**Gesamt (gewichtet, Ops-fokussiert): ~38/100** — visuell tragfähig, operativ unzureichend für Master Admin Control Plane.

---

## Anhang A — Backend-Referenz `getMonitoringAlerts` (Auszug)

Alerts werden in `platform-admin.service.ts` aus Poll-Log-Statistiken konstruiert — **nicht** aus Prometheus Alertmanager. Schwellwerte: error rate 5%/20%, unhealthy workers, delayed jobs >10, stale vehicles, recent poll failures (max 3).

## Anhang B — UI-3 Post-Remediation offene Punkte

Aus `master-admin-page-framework-post-remediation.md`:

| Punkt | Priorität | Bezug |
|-------|-----------|-------|
| Dashboard Activity/Alert `max-h-[280px]` | Niedrig | Dieser Audit: **P2** — Framework-Verstoß |
| RightSidebar-Inhalt nicht integriert | Mittel | Dieser Audit: **P1** |
| TopBar dekorativ | Niedrig | Kein Dashboard-Scope |

## Anhang C — Dateien im Audit-Scope

| Pfad | Rolle |
|------|-------|
| `frontend/src/master/components/MasterDashboardView.tsx` | Dashboard UI |
| `frontend/src/master/App.tsx` | PageContainer wide |
| `frontend/src/master/navigation/useMasterNavBadges.ts` | Sidebar-Badges (duplicate fetch) |
| `frontend/src/master/components/PlatformHealthView.tsx` | Kontrast-Referenz |
| `backend/src/modules/platform-admin/platform-admin.service.ts` | dashboard, alerts, platform-health |
| `backend/src/modules/health/health.service.ts` | Readiness checks |
| `backend/src/modules/billing/billing-admin.service.ts` | Kanonische Billing overview |
| `backend/src/modules/observability/queue-monitoring.service.ts` | BullMQ counts |

---

**Status:** Read-only Audit abgeschlossen — **keine Implementierung** in dieser Phase.  
**Nächster Schritt empfohlen:** UI-4 Dashboard Remediation gemäß §20.
