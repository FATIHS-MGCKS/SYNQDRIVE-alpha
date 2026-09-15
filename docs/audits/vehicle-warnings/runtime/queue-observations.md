# Queue Observations — Vehicle Warnings Runtime (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-Zeit (UTC)** | 2026-07-25T17:53Z |
| **Broker** | Redis 127.0.0.1:6379 (BullMQ) |
| **Modus** | Read-only (`LLEN`, `ZCARD`) |

---

## 1. Vehicle-Warnings-relevante Queues (Snapshot)

| Queue | wait | active | delayed | failed | completed |
|-------|------|--------|---------|--------|-----------|
| `dimo.snapshot.poll` | 0 | 0 | 0 | 0 | 0 |
| `dimo.dtc.poll` | 0 | 0 | 1 | 0 | 56 |
| `dimo.tire.recalculation` | 0 | 0 | 0 | 0 | 78 |
| `dimo.brake.recalculation` | 0 | 0 | 0 | 0 | 13 |
| `battery.v2` | 0 | 0 | 0 | **26** | 1000 |
| `notification.evaluation` | 0 | 0 | 0 | 0 | 8 |
| `notification.delivery` | 0 | 0 | 0 | 0 | 0 |
| `task.automation` | 0 | 0 | 0 | 0 | 0 |
| `dimo.trip-tracking` | 0 | 0 | 0 | **2** | 0 |

---

## 2. Interpretation

### 2.1 Backlog / Stalled

| Prüfpunkt | Befund |
|-----------|--------|
| Waiting > 0 | **Nein** auf allen geprüften Queues |
| Active > 0 | **Nein** (kein Stuck-Worker-Indikator) |
| Delayed | 1 Job auf `dimo.dtc.poll` — geplant, kein Backlog |
| Stalled | Nicht direkt aus Redis-Metriken; **kein** wait/active-Stau |

**Urteil:** Queues sind **nicht überlastet**; Verarbeitung hält mit Ingress Schritt.

### 2.2 Failed Jobs

| Queue | Failed | Schwere |
|-------|--------|---------|
| `battery.v2` | **26** | **P1** — wiederkehrende Worker-Fehler (korreliert mit Logs) |
| `dimo.trip-tracking` | **2** | **P2** — geringes Volumen |
| Alle anderen (warnings) | 0 | OK |

Ältester sichtbarer Failed-Eintrag `battery.v2`: Job-ID-Fingerprint vorhanden; Score-Timestamp entspricht ca. **2026-07-21** (nicht 24h-frisch, aber nicht bereinigt).

### 2.3 Retry Counts

- BullMQ speichert Retries in Job-Payload; aggregiert nicht per `ZCARD`.
- Log-Stichprobe Battery V2: `attempt` 1–2, `errorCode` **`HANDLER_FAILED`** und **`LOCK_CONTENTION`**.

### 2.4 Worker-Restarts

| Komponente | Befund |
|------------|--------|
| PM2 `synqdrive` | Kumulativ **3161** Restarts; aktuelle Instanz **~9h** uptime, `unstable restarts: 0` |
| Dedizierte Queue-Worker-PM2 | **Keine** — Consumer im Hauptprozess |

**Interpretation:** Historische Restart-Häufigkeit hoch; **aktuelle** Laufzeit seit Deploy 08:36 UTC stabil. 502-Fehler in Nginx um **07:51 UTC** korrelieren mit Deploy-Fenster (siehe `time-and-version-observations.md`).

### 2.5 Completed Counts

Hohe `completed` auf `battery.v2` (1000) bei gleichzeitig 26 `failed` → Pipeline aktiv, aber mit **fehlerhafter Teilmenge**.

---

## 3. Gesamturteil

| Aspekt | Status |
|--------|--------|
| Queue-Backlog | **Grün** |
| Warning-relevante Failed Jobs | **Gelb/Rot** (`battery.v2`) |
| Notification/Automation | **Grün** |
| Worker-Verfügbarkeit (aktuell) | **Grün** |

---

## 4. P0/P1 Runtime-Befunde (Queues)

| ID | Prio | Befund |
|----|------|--------|
| RT-Q-P1 | **P1** | 26 failed Jobs in `battery.v2` — Battery-Warning-Pipeline |
| RT-Q-P2 | **P2** | 2 failed `dimo.trip-tracking` |
| RT-Q-INFO | Info | Kumulativ 3161 PM2-Restarts — Trend/Historie klären |
