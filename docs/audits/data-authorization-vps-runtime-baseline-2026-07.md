# Data Authorization — VPS Runtime Baseline (Read-only)

**Prompt:** 3 von 44  
**Datum:** 2026-07-23 (UTC)  
**VPS:** `srv1374778.hstgr.cloud` (`app.synqdrive.eu`)  
**Methode:** SSH Read-only — keine Schreiboperationen, keine Secrets  
**Referenzen:**  
- `docs/audits/data-authorization-remediation-baseline-2026-07.md`  
- `docs/architecture/data-authorization-dataflow-and-enforcement-map-2026-07.md`  
**Wiederholbares Skript:** `.cursor/scripts/data-authorization-vps-runtime-readonly.sh`

---

## Executive Summary

**VPS geprüft: ja** (SSH Path A, `root@srv1374778.hstgr.cloud`)

Zum Prüfzeitpunkt ist die **Produktions-API nicht erreichbar**: PM2-Prozess `synqdrive` befindet sich in einem **Crash-Loop** (~2548 Restarts), Port **3001** lauscht nicht, öffentlicher Health-Check liefert **HTTP 502**. Alle BullMQ-Worker laufen **embedded im NestJS-Monolithen** — bei App-Ausfall sind **sämtliche Telemetrie-Ingestion- und Enforcement-Pfade faktisch offline**.

Gleichzeitig lief ein **paralleler Deploy** (`20260723220652_v4994`, Commit `c2d0851`, Build unvollständig), während `current` auf einen **fehlerhaften Release** (`ba9eaa3`) zeigt.

**Data Authorization auf VPS:** Keine dedizierten Environment-Variablen für Enforcement gefunden. Consent-Daten in PostgreSQL vorhanden (1 aktive `DIMO_TELEMETRY`-Auth, 3 aktive DIMO-Provider-Consents), aber **Runtime-Enforcement ist wegen App-Ausfall nicht wirksam**.

**Geänderte Produktionsdaten: keine** (ausschließlich Read-only-Queries).

---

## 1. Runtime-Architektur (Ist)

```mermaid
flowchart TB
  subgraph Internet
    CF[DNS app.synqdrive.eu]
    DIMO_WH[DIMO Webhooks]
    HM_WH[HM Webhooks]
  end

  subgraph VPS["srv1374778 (Ubuntu 24.04)"]
    NGX[nginx :80/:443]
    PM2[PM2 synqdrive\nNestJS monolith\nCRASH LOOP @ observation]
    PG[(PostgreSQL 16 native\n127.0.0.1:5432)]
    REDIS[(Redis 7 native\n127.0.0.1:6379)]
    DOCKER[Docker Compose]
    CH[synqdrive-clickhouse\n127.0.0.1:8123/9000]
    PROM[synqdrive-prometheus\n127.0.0.1:9090]
    GRAF[synqdrive-grafana\n127.0.0.1:3000]
    SHARED[/opt/synqdrive/shared\nbackend.env uploads storage/]
    REL[/opt/synqdrive/releases/*\ncurrent symlink]
  end

  CF --> NGX
  NGX -->|proxy_pass :3001| PM2
  PM2 --> PG
  PM2 --> REDIS
  PM2 --> CH
  DIMO_WH --> NGX
  HM_WH --> NGX
  PM2 -.->|BullMQ workers embedded| REDIS
  REL --> PM2
  SHARED --> PM2
```

### 1.1 Komponenten-Matrix

| Komponente | Laufzeitform | Status (2026-07-23 ~22:07 UTC) | Hinweis |
|------------|--------------|----------------------------------|---------|
| **Backend API + Worker** | PM2 fork, 1 Prozess | **CRASH LOOP** — Port 3001 down | `dist/src/main.js` |
| **PostgreSQL 16** | Native systemd | **active** | DB `synqdrive`, localhost only |
| **Redis 7.0.15** | Native systemd | **active** (PONG) | BullMQ backing store |
| **ClickHouse 25.8** | **Docker** `synqdrive-clickhouse` | **healthy** (6d uptime) | **Nicht nativ** — nur localhost gebunden |
| **Prometheus 2.54** | Docker | Up 7d | `127.0.0.1:9090` |
| **Grafana 11.2** | Docker | Up 6h | `127.0.0.1:3000` |
| **nginx** | Native systemd | **active** | Reverse proxy → `:3001` |
| **Cloudflare Tunnel** | — | **nicht aktiv** | Kein `cloudflared`-Prozess |
| **systemd synqdrive** | — | **nicht verwendet** | PM2-only |
| **Cron (synqdrive)** | — | **keine Einträge** | Retention via `@nestjs/schedule` in App |

### 1.2 Deploy-Layout

| Pfad | Rolle |
|------|-------|
| `/opt/synqdrive/current` → `releases/20260723215759_v4994` | Aktiver Symlink |
| `/opt/synqdrive/shared/backend.env` | Produktions-Env (nicht ausgegeben) |
| `/opt/synqdrive/shared/frontend.env` | Frontend Build-Env |
| `/opt/synqdrive/shared/uploads` | User uploads |
| `/opt/synqdrive/shared/storage/documents` | Dokument-Storage (symlinked) |
| `/opt/synqdrive/shared/backups` | DB-Backups |
| `/opt/synqdrive/releases/` | **140 Release-Verzeichnisse** |

---

## 2. Laufende Prozesse

### 2.1 PM2

| Prozess | PID (snapshot) | Script | Status | Restarts | Uptime |
|---------|----------------|--------|--------|----------|--------|
| `synqdrive` | wechselnd | `/opt/synqdrive/current/backend/dist/src/main.js` | online (crash-loop) | **~2548** | **~0s** |
| `pm2-logrotate` | 1182 | PM2 module | online | 0 | stabil |

**Startup-Fehler (redacted tail):** NestJS `UnknownDependenciesException` in `BookingsModule` — Dependency Injection schlägt beim Boot fehl → Prozess beendet sich sofort → PM2 restart.

### 2.2 Weitere relevante Prozesse

| Prozess | Rolle |
|---------|-------|
| `postgres` (16-main) | Primärdatenbank |
| `redis-server` | Queues/Cache |
| `clickhouse-server` (in Docker) | Analytics mirror |
| `prometheus` (in Docker) | Metrics |
| `grafana` (in Docker) | Dashboards |
| `nginx` | TLS/Reverse Proxy |
| `prisma generate` (temporär) | Paralleler Deploy-Build in `20260723220652_v4994` |

**Kein separater Worker-Prozess** — DIMO Snapshot, DTC, Trips, Notifications etc. laufen alle im NestJS-Prozess via BullMQ-Consumer + `@nestjs/schedule`.

---

## 3. Commit- und Versionsabweichungen

| Artefakt | Commit / Version |
|----------|------------------|
| **`current` symlink** | `ba9eaa31e469d725c826218f79cea644b094a243` (`ba9eaa3`) |
| **current log** | `fix(frontend): add rentalEligibility to invoiceRelations mapper test fixture` |
| **Neuester Release-Ordner** | `20260723220652_v4994` → `c2d0851` (**nicht gebaut**, kein `main.js`) |
| **Vorheriger stabiler Kandidat** | `20260723215334_v4994` → `546c4cb` (gebaut) |
| **Älterer Release** | `20260723162248_v4994` → `36ffe51` (gebaut) |
| **ClickHouse** | 25.8.24.21 (Docker) |
| **PostgreSQL** | 16 (Ubuntu native) |
| **Redis** | 7.0.15 |

### 3.1 Abweichungen

| Befund | Schwere |
|--------|---------|
| `current` zeigt auf **fehlerhaften** Release `ba9eaa3` (Boot-Crash) | **P0** |
| **Paralleler Deploy** baut `c2d0851` während `current` auf altem/fehlerhaftem Stand | **P0** |
| **140 Releases** auf Disk, viele ohne erfolgreichen Build | **P1** (Disk 89 %) |
| Öffentlicher Health **502** bei lokalem Health **DOWN** | **P0** |

---

## 4. Worker- und Queue-Topologie

### 4.1 Architektur

- **Ein PM2-Prozess** hostet API + alle BullMQ-Worker + `@nestjs/schedule`-Jobs
- **Redis** als Queue-Backend (`bull:*` Keys: **1239** Prefix-Einträge)
- Bei App-Crash: **keine aktiven Consumer**, Jobs stauen sich nicht (wait=0), aber **keine neue Verarbeitung**

### 4.2 Queue-Snapshot (Read-only)

| Queue | wait | active | delayed | failed | Enforcement-relevant |
|-------|------|--------|---------|--------|----------------------|
| `dimo.snapshot.poll` | 0 | 0 | 0 | 0 | **Ja** — Telemetrie-Ingestion |
| `dimo.dtc.poll` | 0 | 0 | 1 | 0 | **Ja** — DTC |
| `dimo.trip-tracking` | 0 | 0 | 0 | **2** | **Ja** — Trips |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 | **Ja** — Driving behavior |
| `notification.evaluation` | 0 | 0 | 0 | 0 | **Ja** — Alerts |
| `notification.delivery` | 0 | 0 | 0 | 0 | Alerts delivery |
| `connectivity.webhook.process` | 0 | 0 | 0 | 0 | DIMO webhooks |
| `document.extraction` | 0 | 0 | 0 | 0 | Documents |
| `driving.intelligence.jobs` | 0 | 0 | 0 | 0 | Misuse/behavior |
| `battery.v2` | 0 | 0 | 0 | **21** | Health |
| `dimo.vehicle.sync` | 0 | 0 | 1 | **1** | DIMO catalog |
| `voice.webhook.process` | 0 | 0 | 0 | 0 | Voice AI |
| `task.automation.outbox` | 0 | 0 | 0 | 0 | Automation |

### 4.3 Failed-Job-Stichproben (ohne Payload-Secrets)

| Queue | Fehlerursache (Auszug) |
|-------|------------------------|
| `battery.v2` | `REST target job missing restWindowId` |
| `dimo.trip-tracking` | `Foreign key constraint violated: dimo_poll_logs_vehicle_id_fkey` |
| `dimo.vehicle.sync` | `DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set` (historisch, Deploy-Kontext) |

**Keine Dead-Letter-Queues über BullMQ-Standard hinaus.** Failed-Jobs verbleiben in `bull:*:failed` ZSETs.

---

## 5. Tatsächliche Provider-Prozesse

| Provider | Intake auf VPS | Laufzeit (Ist) | Consent-Daten PG |
|----------|----------------|----------------|------------------|
| **DIMO Snapshot** | Scheduler 30s → `dimo.snapshot.poll` | **Offline** (App crash) | 6 DIMO-linked vehicles |
| **DIMO DTC** | Scheduler 3h → `dimo.dtc.poll` | **Offline** | DTC tables |
| **DIMO Webhooks** | `POST /webhooks/dimo` via nginx | **502** (kein Backend) | Episodes/events |
| **DIMO Vehicle Sync** | Scheduler 24h | **Offline**; 1 failed job | `dimo_vehicles` |
| **HM Health MQTT** | `HM_HEALTH_APP_MQTT_ENABLED=true` | **Offline** (embedded consumer) | 0 HM VPC active |
| **HM Telemetry MQTT** | `HM_TELEMETRY_APP_MQTT_ENABLED=false` | **Deaktiviert** | `hm_latest_telemetry_states` |
| **HM Webhooks** | `/integrations/high-mobility/webhook/*` | **502** | HM status history |

**Fahrzeugbestand:** 7 vehicles, 6 DIMO-linked (aggregiert, keine PII).

---

## 6. Enforcement-relevante Legacy-Prozesse & Konfiguration

### 6.1 Data Authorization — keine Runtime-Config

| Prüfung | Ergebnis |
|---------|----------|
| Env-Keys `DATA_AUTH*`, `CONSENT_ENFORCE*`, `AUTHORIZATION_ENFORCE*` | **Nicht vorhanden** |
| Feature-Flag für `assertDataAuthorization` Shadow-Mode | **Nicht vorhanden** |
| Separater Enforcement-Worker | **Nicht vorhanden** |
| Redis-Cache für Consent-Entscheidungen | **Nicht vorhanden** |

Enforcement ist **rein code-basiert** (`DataAuthorizationEnforcementService`) und nur wirksam wenn die App läuft — aktuell **nicht**.

### 6.2 Consent-Ledger in PostgreSQL (Counts only)

| Tabelle | Count | Status |
|---------|-------|--------|
| `org_data_authorizations` | 1 | ACTIVE=1, REVOKED=0, PENDING=0 |
| `DIMO_TELEMETRY` system_key | 1 | ACTIVE |
| `vehicle_provider_consents` ACTIVE | 3 | DIMO=3, HM=0 |

**Hinweis:** 6 DIMO-linked vehicles vs. 3 ACTIVE provider consents — **Consent-Ledger-Lücke** (bekannt aus Fleet-Connectivity-Audit FC-P1-03).

### 6.3 Enforcement-relevante Feature Flags (Boolean, Werte aus Env)

| Flag | Wert | Relevanz |
|------|------|----------|
| `DATA_RETENTION_ENABLED` | `true` | Consent-Audit in `activity_logs` potenziell löschbar |
| `HF_MIRROR_ENABLED` | `true` | DIMO HF → ClickHouse |
| `WAYPOINT_MIRROR_ENABLED` | `true` | Trip waypoints → ClickHouse |
| `NOTIFICATIONS_V2` | `true` | Alert-Pipeline |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` | **Delivery aus** |
| `VOICE_MCP_GATEWAY` | `true` | MCP aktiv wenn App läuft |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | `false` | Voice webhooks aus |
| `HM_HEALTH_APP_MQTT_ENABLED` | `true` | HM Health consumer |
| `HM_TELEMETRY_APP_MQTT_ENABLED` | `false` | HM Telemetry consumer aus |
| `DOCUMENT_EXTRACTION_QUEUE_ENABLED` | `true` | Document worker |
| `CLICKHOUSE_TRIP_ASSIST_ENABLED` | `true` | CH trip assist |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` | Segment validation shadow off |

**Kein Flag steuert OrgDataAuthorization-Enforcement.**

### 6.4 Legacy / Shadow-Prozesse

| Legacy-Element | Befund |
|--------------|--------|
| 140 Release-Verzeichnisse | Viele unvollständige Builds, Disk-Druck |
| `backend.env.bak-*` (20+ Backups) | Env-Historie in shared/ |
| `public_backup_202606241346_dashboard_truth` | Alter Public-Backup-Ordner |
| `staging-verification/` in shared | Staging-Artefakte auf Prod-VPS |
| Shadow-Detector-Flags (`DRIVING_V2_*_SHADOW_ENABLED`) | In Env vorhanden, Werte nicht alle geprüft |
| `WORKER_LIVEMAP_*` Env-Keys | Legacy-Naming; Livemap über Snapshot/VLS |

---

## 7. Infrastruktur-Details

### 7.1 Betriebssystem & Ressourcen

| Metrik | Wert |
|--------|------|
| OS | Ubuntu 24.04.4 LTS, Kernel 6.8.0-134 |
| RAM | 15 Gi total, ~5.6 Gi used, ~10 Gi available |
| Swap | **0 B** (kein Swap) |
| Disk `/` | **193G total, 171G used (89 %)** — **kritisch** |
| CPU | 4 cores |
| Uptime | ~1 week 6 hours |

### 7.2 ClickHouse (verifiziert: Docker, nicht nativ)

- Container: `synqdrive-clickhouse` (`clickhouse/clickhouse-server:25.8`)
- Ports: `127.0.0.1:8123` (HTTP), `127.0.0.1:9000` (native)
- Version: `25.8.24.21`
- `SHOW TABLES` lieferte zum Prüfzeitpunkt leer (DB/Schema-Kontext prüfen in Staging)

### 7.3 Reverse Proxy

- **nginx** aktiv, Site `synqdrive` → `proxy_pass http://127.0.0.1:3001`
- Kein Cloudflare Tunnel auf dem Host
- Öffentlich: `https://app.synqdrive.eu/api/v1/health` → **502**

### 7.4 Logpfade

| Log | Pfad |
|-----|------|
| PM2 stdout | `/root/.pm2/logs/synqdrive-out.log` |
| PM2 stderr | `/root/.pm2/logs/synqdrive-error.log` |
| PM2 logrotate | `/root/.pm2/logs/pm2-logrotate-*.log` |

### 7.5 Object Storage / Dokumentpfade

- **Kein S3/FUSE-Mount** erkannt
- Dokumente: `/opt/synqdrive/shared/storage/documents` (lokal)
- Uploads: `/opt/synqdrive/shared/uploads` (symlinked in releases)

---

## 8. Risiken

| ID | Risiko | Schwere | Auswirkung auf Data Authorization |
|----|--------|---------|-----------------------------------|
| VPS-R01 | **Backend Crash-Loop** — API + Worker down | **P0** | Kein `assertDataAuthorization`, keine Ingestion, kein Audit |
| VPS-R02 | **Öffentlicher 502** | **P0** | Gesamte Plattform offline |
| VPS-R03 | **Disk 89 %**, 140 Releases | **P0** | Deploy-Instabilität, Backup-Risiko |
| VPS-R04 | **Kein Enforcement-Env/Flag** | **P1** | Rollout nur via Code-Deploy steuerbar |
| VPS-R05 | **Monolith = Single Point of Failure** | **P1** | Worker sterben mit API |
| VPS-R06 | **Consent-Ledger-Lücke** 6 DIMO / 3 VPC | **P1** | Inkonsistente Consent-Wahrheit |
| VPS-R07 | **21 failed battery.v2 jobs** | **P2** | Health-Pipeline degraded |
| VPS-R08 | **NOTIFICATIONS_DELIVERY_ENABLED=false** | **P2** | Alerts werden nicht zugestellt |
| VPS-R09 | **HM Telemetry MQTT disabled** | **P2** | HM GPS nicht operational |
| VPS-R10 | **Paralleler Deploy während Crash** | **P0** | Versionsdrift, unklarer Prod-Zustand |

---

## 9. Notwendige spätere Staging-Prüfungen

Nach Wiederherstellung der App (separater Deploy-Prompt, **nicht** Teil von Prompt 3):

1. **Health-Endpunkte** — lokal `:3001` und öffentlich `app.synqdrive.eu` → 200
2. **Live-GPS Enforcement** — `GET .../live-gps` mit widerrufener Org → 403 `DATA_AUTHORIZATION_DENIED`
3. **Telemetry Bypass** — `GET .../telemetry` ohne Consent → dokumentierter Ist-Zustand (sollte nach Remediation ebenfalls 403)
4. **Worker-Aktivität** — `dimo.snapshot.poll` active/wait nach 60s Beobachtung
5. **HM MQTT Consumer** — Logs auf Connect/Subscribe (ohne Credentials auszugeben)
6. **ClickHouse Mirror** — Row counts in `telemetry_snapshots`, `telemetry_hf_points`
7. **Failed-Job-Drain** — `battery.v2`, `dimo.trip-tracking` failed counts vor/nach Fix
8. **Consent Counts** — `org_data_authorizations` / `vehicle_provider_consents` vs. Fleet-Größe
9. **PM2 Restarts** — stabil < 5 über 15 Minuten
10. **Disk Cleanup** — Release-Rotation, Backup-Retention

**Staging-Skript:** `.cursor/scripts/data-authorization-vps-runtime-readonly.sh` erneut ausführen und mit diesem Baseline-Bericht diffen.

---

## 10. Ausgeführte Read-only-Kommandos (Auszug)

Alle via `ssh -o BatchMode=yes root@srv1374778.hstgr.cloud`:

| Kategorie | Kommandos |
|-----------|-----------|
| OS/Ressourcen | `hostname`, `uname -a`, `free -h`, `df -hT`, `nproc`, `uptime` |
| systemd | `systemctl list-units`, `systemctl list-timers` |
| Docker | `docker ps -a` |
| PM2 | `pm2 list`, `pm2 describe synqdrive`, `pm2 jlist` |
| Deploy | `readlink -f /opt/synqdrive/current`, `git rev-parse HEAD`, Release-Listing |
| Prozesse/Ports | `ps aux`, `ss -tlnp` |
| Health | `curl http://127.0.0.1:3001/api/v1/health`, `curl https://app.synqdrive.eu/api/v1/health` |
| Proxy | `systemctl is-active nginx`, `pgrep cloudflared` |
| PostgreSQL | `psql -Atqc` COUNT queries auf Consent-/Fleet-Tabellen |
| Redis | `redis-cli PING`, `LLEN`/`ZCARD` auf BullMQ-Queues, `ZRANGE failed` |
| ClickHouse | `docker exec synqdrive-clickhouse clickhouse-client --query` |
| Env | `grep` Key-Namen + Boolean-Werte (Secrets redacted) |
| Logs | `tail synqdrive-error.log` (redacted) |

**Nicht ausgeführt:** `pm2 restart`, `docker compose up/down`, `prisma migrate`, `redis-cli DEL`, Schreib-SQL, Env-Änderungen, Deploy-Skripte.

---

## 11. Zusammenfassung für Prompt-Serie

| Frage | Antwort |
|-------|---------|
| VPS geprüft? | **Ja** |
| Geänderte Produktionsdaten? | **Keine** |
| Runtime-Enforcement aktiv? | **Nein** (App down) |
| Data-Auth Env-Config? | **Nein** |
| ClickHouse Laufzeitform? | **Docker** (localhost-bound) |
| Worker-Topologie? | **Embedded Monolith** in PM2 |
| Kritischster Befund? | **Crash-Loop + 502 + paralleler Deploy** |

---

## Anhang — Changes / Architektur

**Changes:** nicht aktualisiert (Read-only Audit)  
**Architektur:** nicht aktualisiert (Read-only Audit)
