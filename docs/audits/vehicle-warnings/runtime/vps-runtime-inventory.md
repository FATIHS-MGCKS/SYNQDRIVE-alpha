# VPS Runtime Inventory — Vehicle Warnings Audit (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **23 von 26** — Read-only Runtime-Audit |
| **Erstellt (UTC)** | 2026-07-25T17:53Z |
| **Beobachtungsfenster** | 24h: 2026-07-24T17:53Z – 2026-07-25T17:53Z · 7d ergänzend |
| **Modus** | **Read-only** — keine Produktionsänderung |
| **Hostname (anonymisiert)** | `VPS-PROD-01` |

---

## 1. Host

| Attribut | Wert |
|----------|------|
| Kernel | Linux 6.8.0-134-generic |
| Zeitzone | `Etc/UTC` (UTC, +0000) |
| Lokale Zeit (Audit) | 2026-07-25 17:52:53 UTC |
| NTP | **active**, System clock **synchronized: yes** |
| Orchestrierung | **PM2** (fork), **kein** Kubernetes |
| Container | Docker (Monitoring + ClickHouse only) |

---

## 2. Deployment-Layout

| Pfad / Artefakt | Wert |
|-----------------|------|
| Deploy-Root | `/opt/synqdrive` |
| Current-Symlink | `releases/RELEASE-20260725-0831` (anonymisiert) |
| Shared Config | `/opt/synqdrive/shared/` (env-Dateien **nicht** inventarisiert) |
| Backend Entry | `/opt/synqdrive/current/backend/dist/src/main.js` |
| Frontend Static | `/opt/synqdrive/current/frontend/dist/` |

---

## 3. Laufende Komponenten

### 3.1 PM2

| Name | Status | PID | Uptime (Audit) | Restarts (kumulativ) | Modus |
|------|--------|-----|----------------|----------------------|-------|
| `synqdrive` | online | vorhanden | ~9h | **3161** | fork |
| `pm2-logrotate` | online | vorhanden | lang | 0 | module |

**Hinweis:** Worker (BullMQ Consumer, Scheduler) laufen **im selben** PM2-Prozess (`fork_mode`), nicht als separate PM2-Apps.

### 3.2 Docker

| Container | Status |
|-----------|--------|
| `synqdrive-grafana` | Up ~9h |
| `synqdrive-prometheus` | Up ~9 days |
| `synqdrive-clickhouse` | Up ~8 days (healthy) |

### 3.3 Systemd / Reverse Proxy

| Dienst | Status |
|--------|--------|
| `nginx` | **active** |
| `redis-server` | localhost:6379 |
| `postgresql` | localhost:5432 |

---

## 4. Versionen / Commits

| Komponente | Wert |
|------------|------|
| Backend `package.json` | `0.1.0` |
| Git Commit (Release) | `6080dbd2` |
| Letzter Commit-Datum | 2026-07-24 09:01:25 UTC |
| PM2 Process `created at` | 2026-07-25T08:36:42Z (Deploy-Fenster) |
| Node.js | 22.23.1 |
| Nginx (öffentlich) | 1.24.0 (Ubuntu) |

Frontend: statisches `dist/` vorhanden; Asset-Hash aus `index.html` nicht als Deploy-Identifier extrahiert (nur Build-Artefakt bestätigt).

---

## 5. Datenstores

| Store | Bindung | Rolle Vehicle-Warnings |
|-------|---------|------------------------|
| PostgreSQL `synqdrive` | 127.0.0.1:5432 | Notifications, Insights, DTC, Tire/Brake Alerts, DIMO Poll Logs |
| Redis | 127.0.0.1:6379 | BullMQ, Caches, Rate-Limits |
| ClickHouse | Docker | Telemetrie-Spiegel / Waypoints (TTL separat) |

Weitere DBs auf Host (nicht produktiv für Warnings geprüft): `postgres`, `synqdrive_staging_brake`.

---

## 6. Monitoring

| System | Erreichbarkeit (Audit) |
|--------|------------------------|
| Prometheus | `127.0.0.1:9090` — `up{job="synqdrive-backend"}=1` |
| Grafana | Container aktiv |
| Öffentlicher Health | `GET https://app.synqdrive.eu/api/v1/health` → **200** (~53ms) |

---

## 7. Logpfade (nur Pfade, keine Inhalte)

| Quelle | Pfad |
|--------|------|
| PM2 stdout | `/root/.pm2/logs/synqdrive-out.log` (+ tägliche Rotation) |
| PM2 stderr | `/root/.pm2/logs/synqdrive-error.log` (+ Rotation) |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` (+ rotierte Archive) |

---

## 8. BullMQ Queue-Namen (19 registriert)

Vehicle-Warnings-relevant hervorgehoben:

| Queue | Redis-Prefix |
|-------|----------------|
| DIMO Snapshot Poll | `bull:dimo.snapshot.poll` |
| DTC Poll | `bull:dimo.dtc.poll` |
| Tire Recalculation | `bull:dimo.tire.recalculation` |
| Brake Recalculation | `bull:dimo.brake.recalculation` |
| Battery V2 | `bull:battery.v2` |
| Notification Evaluation | `bull:notification.evaluation` |
| Notification Delivery | `bull:notification.delivery` |
| Task Automation | `bull:task.automation` |
| Trip Tracking | `bull:dimo.trip-tracking` |

Weitere Queues (nicht warnings-kritisch): `dimo.vehicle.sync`, `payment.email`, `document.extraction`, `booking.document.generation`, `voice.webhook.process`, `connectivity.webhook.process`, `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs`, `dtc.knowledge.enrichment`.

---

## 9. Audit-Metadaten

- **Secrets:** nicht gelesen, nicht dokumentiert
- **`.env`:** nicht geöffnet
- **Änderungen an Produktion:** keine
