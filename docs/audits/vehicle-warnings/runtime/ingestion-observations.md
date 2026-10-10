# Ingestion Observations — Vehicle Warnings Runtime (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-Zeit (UTC)** | 2026-07-25T17:53Z |
| **Fenster 24h** | 2026-07-24T17:53Z – 2026-07-25T17:53Z |
| **Fenster 7d** | 2026-07-18 – 2026-07-25 |
| **Quelle** | PostgreSQL `dimo_poll_logs`, PM2-Logs (aggregiert), Read-only |

---

## 1. Executive Summary

| Thema | 24h | 7d | Urteil |
|-------|-----|-----|--------|
| Empfangene Poll-Events | 19 131 SUCCESS | 191 927 total | **Stabil** |
| Provider-Fehler (DB `error_message`) | 3 | nicht vollständig aggregiert | **Niedrig** |
| Retries (`retry_count > 0`) | 0 | — | **Keine Retries** |
| Durchschnittliche Poll-Dauer | ~547 ms | — | Normal |
| Health-Notification-Projection-Failures (Log) | 0 Treffer (aktueller error.log) | — | **Kein akuter Fehler** |
| Battery V2 Ingestion-Fehler | Wiederkehrend (siehe Application-Log) | — | **P1** |

---

## 2. DIMO / Telemetrie-Ingestion (`dimo_poll_logs`)

### 2.1 Volumen

| Metrik | 24h | 7d |
|--------|-----|-----|
| Zeilen gesamt | 19 125–19 131 | 191 927 |
| Status SUCCESS | 19 131 (100% der gruppierten Status) | — |
| `error_message` gesetzt | **3** | — |
| `retry_count > 0` | **0** | — |
| Ø `duration_ms` | **547** | — |

### 2.2 Job-Typen (24h)

| `job_type` | Count |
|------------|-------|
| SNAPSHOT | 16 950 |
| TRIP_TRACKING | 2 180 |
| VEHICLE_SYNC | 1 |

**Interpretation:** Snapshot-Polling dominiert — primärer Telemetrie-Eingang für Health-Bewertung.

### 2.3 Verzögerung / Ausfälle / Out-of-order

| Prüfpunkt | Befund |
|-----------|--------|
| Verzögerung | Ø 547 ms Poll-Dauer; keine Queue-Backlog (`wait=0` auf Snapshot-Queue) |
| Ausfälle | 3 Logs mit `error_message` bei SUCCESS-Status-Verteilung — Einzelfälle |
| Retries | 0 |
| Duplicates | Nicht direkt messbar; `retry_count=0` deutet auf kein Retry-Sturm hin |
| Out-of-order | Kein dedizierter Runtime-Indikator; keine Anomalie in Poll-Metriken |

### 2.4 Providerfehler (Logs)

Im aktuellen `synqdrive-error.log` (24h): **keine** Treffer für `Vehicle health notification projection failed` oder `Vehicle health V2 ingest failed`.

Dominantes Ingestion-Problem im Log: **Battery V2 `BATTERY_REST_TARGET_EVALUATE`** — siehe `application-log-observations.md` (Downstream-Warning-Pipeline, nicht DIMO-Poll).

---

## 3. Downstream Warning-Materialisierung (DB-Snapshot Audit-Zeitpunkt)

| Metrik | Wert |
|--------|------|
| Aktive Health-Notifications (OPEN/ACK/SNOOZE) | **5** (2× BATTERY_CRITICAL, 2× TIRE_CRITICAL, 1× ACTIVE_DTC) |
| Health-Notifications erstellt (24h) | **0** |
| Health-Notifications resolved (24h) | **0** |
| Betroffene Orgs (aktive Health-NV2) | **1** |
| Offene Tire Health Alerts | **4** |
| Offene Brake Health Alerts | **25** |
| Aktive DTC Events | **1** |
| Aktive Health Dashboard Insights | **0** |
| Insight-Runs (24h) | **224** |
| Insight-Runs failed (7d) | **0** |

**Interpretation:** Ingestion/Telemetrie läuft; Warning-Zustand persistiert über Alerts/Notifications ohne sichtbare 24h-Fluktuation in NV2-Erstellung.

---

## 4. Insight / Notification Eval Pipeline

| Metrik | Wert |
|--------|------|
| `notification.evaluation` completed (Redis) | 8 |
| `notification.evaluation` failed (Redis) | 0 |
| `notification.evaluation` wait/active | 0 |
| Notification Delivery Outbox PENDING | 0 |
| Notification Delivery FAILED (7d) | 0 |

---

## 5. Risiken

| ID | Schwere | Befund |
|----|---------|--------|
| RT-ING-P1 | **P1** | Battery V2 REST-Reconcile-Jobs schlagen wiederholt fehl → kann Battery-Warnings verzögern/verfälschen |
| RT-ING-P2 | **P2** | 3 DIMO-Poll-Zeilen mit `error_message` — Monitoring, kein Trend |

---

## 6. Verifikation

- Read-only SQL auf `dimo_poll_logs`, `notifications`, `dashboard_insight_runs`, Alert-Tabellen
- Log-Grep (letzte 500–2000 Zeilen, UUID/Plate anonymisiert)
- **Keine** Schreiboperationen
