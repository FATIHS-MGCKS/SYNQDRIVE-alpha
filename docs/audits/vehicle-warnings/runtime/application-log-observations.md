# Application Log Observations — Vehicle Warnings Runtime (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-Zeit (UTC)** | 2026-07-25T17:53Z |
| **Quellen** | PM2 `synqdrive-error.log` (+ rotierte Archive 7d), Nginx access (Status-Counts) |
| **PII** | UUIDs/Kennzeichen in Log-Zitaten **ersetzt** |

---

## 1. Executive Summary

| Kategorie | 24h | 7d (rotierte Logs) | Urteil |
|-----------|-----|---------------------|--------|
| Health-related ERROR-Zeilen | ~917 (aktueller Log) | Spike 20.–21.07, sonst abnehmend | **Battery V2 dominiert aktuell** |
| Unhandled Exceptions | **0** (tail 2000) | — | OK |
| DB Connection (`ECONNREFUSED`/timeout) | **0** (tail 2000) | — | OK |
| Notification projection failures | **0** | — | OK |
| Nginx 5xx (heute, Status-Count) | **12× 502** | — | Deploy-Korrelation |

---

## 2. Backend — Fehler & Warnungen (24h)

### 2.1 Aktueller `synqdrive-error.log`

| Metrik | Wert |
|--------|------|
| Zeilen gesamt (Datei) | 12 212 |
| Health-keyword-Treffer (Datei) | 917 |

### 2.2 Dominantes Muster: Battery V2 Processor

Wiederkehrend ca. **alle 5 Minuten** (z. B. :01, :06, :11 … :51 UTC):

```text
[BatteryV2Processor] {"msg":"battery.v2.processor.worker_failed",
  "jobType":"BATTERY_REST_TARGET_EVALUATE",
  "errorCode":"HANDLER_FAILED" | "LOCK_CONTENTION",
  "attempt":1|2,
  "organizationId":"[UUID]","vehicleId":"[UUID]",
  "keyFp":"…","jobIdFp":"…"}
```

| errorCode | Bedeutung (technisch) |
|-----------|----------------------|
| `HANDLER_FAILED` | Handler-Exception / fachlicher Abbruch |
| `LOCK_CONTENTION` | Redis/Distributed-Lock-Konflikt |

**Korrelation:** `bull:battery.v2` **26 failed** Jobs (siehe `queue-observations.md`).

### 2.3 Nicht beobachtet (24h, aktueller error.log)

| Pattern | Count |
|---------|-------|
| `Vehicle health notification projection failed` | 0 |
| `Vehicle health V2 ingest failed` | 0 |
| `Unhandled` | 0 |
| `ECONNREFUSED` / `ETIMEDOUT` | 0 |

### 2.4 Duplicate Warning Creation

Kein Log-Muster für explizite Duplicate-Detection-Fehler. DB zeigt stabile kleine Menge aktiver Health-Notifications (5) — kein Anzeichen für Massen-Duplikation in 24h.

### 2.5 Projection / Notification Failures

| Pfad | Befund |
|------|--------|
| Health → NV2 Sync | Keine ERROR-Zeilen im 24h-Fenster |
| Notification Delivery Outbox | DB: 0 FAILED (7d) |
| Insight Runs | DB: 0 failed (7d) |

---

## 3. 7-Tage-Trend (health-keyword Zeilen pro rotierter error.log)

| Log-Datei (UTC-Rotation) | health_related_lines |
|--------------------------|----------------------|
| 2026-07-20 | 52 101 |
| 2026-07-21 | 25 022 |
| 2026-07-22 | 1 457 |
| 2026-07-23 | 1 256 |
| 2026-07-24 | 56 |
| 2026-07-25 (bis 00:00) | 1 275 |
| aktueller Log (25.07 laufend) | 917 |

**Interpretation:** Massiver Error-Spike 20.–21.07 (vermutlich historisches Incident/Deploy — **nicht** im 24h-Fenster). Aktuell moderates, aber **persistentes** Battery-V2-Rauschen.

---

## 4. Frontend / API (öffentlich, read-only)

| Check | Ergebnis |
|-------|----------|
| `GET /api/v1/health` | HTTP **200**, ~53 ms |
| Rate-Limit Header | `X-RateLimit-Limit-global: 200` |
| Security Headers | `X-Frame-Options`, `X-Content-Type-Options`, etc. |
| Frontend `GET /` | HTTP **200**, `Cache-Control: public, max-age=0` |

### Nginx Access (heute, nur Status-Histogramm)

| Status | Count |
|--------|-------|
| 200 | 241 |
| 301 | 28 |
| **502** | **12** |
| 404 | 11 |
| 401 | 6 |
| 400 | 4 |

502-Stichprobe: `GET /api/v1/health` um **07:51–07:52 UTC** — **Deploy-Fenster** (PM2 created 08:36 UTC; Nginx-502 davor = Backend noch nicht bereit).

---

## 5. PM2 / Process Health

| Metrik | Wert |
|--------|------|
| Kumulativ Restarts | 3161 |
| Aktuelle Uptime | ~9h |
| Unstable Restarts | 0 |
| Speicher | ~472 MB |

**P1-Kontext:** Hohe kumulative Restarts — **aktueller** Prozess stabil seit Deploy.

---

## 6. P0/P1 Runtime-Befunde (Application)

| ID | Prio | Befund |
|----|------|--------|
| RT-APP-P1 | **P1** | Wiederkehrende `BatteryV2Processor` HANDLER_FAILED / LOCK_CONTENTION |
| RT-APP-P2 | **P2** | 12 Nginx 502 heute (Deploy-Window) |
| RT-APP-INFO | Info | Historischer Error-Spike 20.–21.07 — Root-Cause nicht in diesem Audit geklärt |

---

## 7. Verifikation

- `tail`/`grep`/`wc` auf PM2-Logs
- `curl -sS -o /dev/null -w` und `curl -sSI` auf öffentliche Endpoints
- Keine Log-Inhalte mit Roh-PII committed
