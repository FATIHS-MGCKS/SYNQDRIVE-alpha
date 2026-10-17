# Time & Version Observations — Vehicle Warnings Runtime (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-Zeit (UTC)** | 2026-07-25T17:53Z |
| **Modus** | Read-only |

---

## 1. Serverzeit

| Quelle | UTC | Anmerkung |
|--------|-----|-----------|
| Host `timedatectl` | 2026-07-25 17:52:53 | Referenz |
| Zeitzone | **Etc/UTC** | Keine lokale Offset-Drift |
| NTP Service | **active** | |
| System clock synchronized | **yes** | |
| Prometheus `up` query timestamp | ~1785002027 (Unix) | Konsistent mit Host |

### Containerzeit

| Container | Abgleich |
|-----------|----------|
| `synqdrive-clickhouse` | `date -u` Unix-Sekunden **≈ Host** (Abweichung <2s beim Audit) |

**Urteil:** **Keine relevante Clock Drift** zwischen Host und ClickHouse.

---

## 2. Deploy- & Versionskorrelation

| Ereignis | Zeit (UTC) | Evidenz |
|----------|------------|---------|
| Release-Verzeichnis | `20260725-0831` | `/opt/synqdrive/releases/` |
| PM2 Process `created at` | **2026-07-25T08:36:42Z** | `pm2 describe synqdrive` |
| Nginx 502 auf `/api/v1/health` | **~07:51–07:52** | access.log Stichprobe |
| Health API OK (Audit) | **17:53** | HTTP 200, 53ms |

**Timeline:**

```text
07:51 UTC  — Nginx 502 (Backend noch nicht erreichbar)
08:36 UTC  — PM2 synqdrive neu gestartet (Deploy)
17:53 UTC  — Health 200, Queues idle, DIMO SUCCESS
```

---

## 3. Backend / Frontend Version

| Komponente | Identifikator |
|------------|---------------|
| Backend Git | `6080dbd2` |
| Backend npm | `0.1.0` |
| Node.js | 22.23.1 |
| Nginx | 1.24.0 |
| Frontend | Static `dist/` am Release-Pfad (kein separater Commit-Stamp geprüft) |

**Repo-Audit-Basis-Commit** (lokaler Audit-Branch): `1d0f2cae…` — **Production läuft neueren Commit** `6080dbd2` (erwartbar nach Deploy).

---

## 4. Worker / Runtime-Einheit

| Aspekt | Wert |
|--------|------|
| PM2 Apps | 1× `synqdrive` (+ logrotate module) |
| BullMQ Consumer | **Im selben Node-Prozess** |
| Docker App-Container | **Keiner** — Backend nativ via PM2 |

---

## 5. Monitoring-Zeitbasis

- Prometheus scrape `synqdrive-backend` @ `127.0.0.1:3001` — **UP**
- Evaluations-/Notification-Metriken über internes Monitoring (siehe `vps-runtime-inventory.md`)

---

## 6. Risiken (Zeit/Version)

| ID | Prio | Befund |
|----|------|--------|
| RT-T-P2 | **P2** | Deploy-Fenster 502 — erwartbar, aber Health-Checks vor PM2-ready dokumentieren |
| RT-T-INFO | Info | Prod-Commit ≠ Audit-Charter-Commit — Runtime-Audit bezieht sich auf **live** Stand |

---

## 7. Bestätigung Read-only

Siehe Abschluss im Audit-Report (User-facing Summary): ausschließlich `timedatectl`, `date`, `pm2 describe`, `git rev-parse`, `curl`, `docker exec date`, Log-Tails — **keine** Zeit-/Version-Änderungen vorgenommen.
