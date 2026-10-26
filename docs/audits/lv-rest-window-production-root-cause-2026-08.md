# LV Rest Window — Production Root Cause Audit (Read-only)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-08-26T18:30:00Z |
| **Methode** | Read-only — Code-Trace, VPS SSH, PostgreSQL, Redis, PM2-Logs |
| **Produktion** | `app.synqdrive.eu` / VPS `srv1374778.hstgr.cloud` |
| **Release** | `20260826173048_v4994` (deploy ~2026-08-26T17:35:56Z) |
| **Git SHA (deployed)** | `fb2f48e8d44d423c2f4b7c7b2a4d10f94944f409` (PR #1319 merged) |
| **Vorgänger-Kontext** | PR #1319 stoppt malformed `battery.v2` Failure-Loop; 0 neue `missing restWindowId` seit Deploy |
| **Constraints** | Keine DB-Mutationen, keine Flag-Änderungen, keine Deploys, keine Code-Fixes |

---

## 1. Executive Summary

**Production hat 0 `LV_REST_WINDOW` Sessions, weil der kanonische LV-Rest-FSM-Pfad implementiert ist, aber nicht verdrahtet ist.**

`LvRestWindowStateMachineService.processEvent()` — die einzige Methode, die `BatteryMeasurementSession` mit `type = LV_REST_WINDOW` anlegt — hat **keine Production-Call-Sites**. Der live-Pfad schreibt nur Legacy-Flags in `battery_features` via `BatteryV2Service.onSnapshot()` nach `BATTERY_OBSERVATION_CLASSIFY`.

| Befund | Production |
|--------|------------|
| `LV_REST_WINDOW` Sessions (total) | **0** |
| `battery_measurement_sessions` (alle Typen) | **0** |
| `LvRestWindowStateMachineService.processEvent()` live | **nicht aufgerufen** |
| Legacy `battery_features.restWindowStartedAt` | **5** Fahrzeuge |
| Fällige Legacy-Candidates (60m/6h nicht captured, Zeit fällig) | **3** |
| Legacy→LV Session Match | **0 %** (0/3) |
| FSM-Events in Logs (7d) | **0** |
| `LIVE_VOLTAGE` in `battery_measurements` | **0** |
| `REST_60M` in `battery_measurements` | **91** (Backfill Jun–Jul 2026, `session_id` = NULL) |
| `battery.v2` failed (Redis) | **68** (`REST target job missing restWindowId`) |

**Final Verdict:** `ROOT CAUSE CONFIRMED — CANONICAL LV REST PATH NOT WIRED`

Sekundär (nicht primär für 0 Sessions, aber relevant für Remediation): Legacy-Pfad aktiv; Capability-Preflight `LIVE_VOLTAGE` = `QUERY_ERROR` auf allen LV-Fahrzeugen; kein Production-Writer für `LIVE_VOLTAGE`-Measurements.

---

## 2. Intended Architecture (Canonical LV Rest Pipeline)

### 2.1 Text Flow-Diagramm

```
[DIMO Telemetry Poll]
  DimoSnapshotScheduler @Interval(30s)
    → BullMQ dimo.snapshot.poll
    → DimoSnapshotProcessor.process()
        │
        ├─ vehicleLatestState.upsert (lvBatteryVoltage, speed, ignition, …)
        │
        ├─ BatteryV2SnapshotObservationProducer.classifyAndEnqueue()
        │     File: battery-v2-snapshot-observation.producer.ts
        │     Input: normalized LV/HV fields, batteryMap, receivedAt
        │     Output: BATTERY_OBSERVATION_CLASSIFY job (if new observation idempotencyKey)
        │     Trigger: plausible LV voltage or HV SOC delta
        │     Flag: none (always classifies when signals present)
        │
        ├─ TripDetectionOrchestrationService.evaluateSnapshotForTripStart()
        │     File: trip-detection-orchestration.service.ts
        │     Output: vehicleTripDetectionState (RESTING / ACTIVE / …)
        │     Trigger: speed/ignition/HV power transitions
        │
        └─ (ClickHouse mirror — fire-and-forget)

[BATTERY_OBSERVATION_CLASSIFY consumer]
  BatteryV2SnapshotIngestionService.ingestObservationClassify()
    File: battery-v2-snapshot-ingestion.service.ts
    Input: BatteryObservationClassifyPayload + snapshotContext
    │
    ├─ [LEGACY — LIVE TODAY] BatteryV2Service.onSnapshot()
    │     File: battery-v2.service.ts :: onSnapshot()
    │     Gate: tripDetectionState == RESTING + lastActivityAt + restDuration >= 60m
    │     Output: battery_features.restWindowStartedAt / rest60m/rest6h / vOff*
    │     Flag: none (always when LV in snapshotContext)
    │     Persistenz: battery_features (NOT BatteryMeasurementSession)
    │
    └─ [CANONICAL — NOT WIRED] LvRestWindowStateMachineService.processEvent()
          File: lv-rest-window.service.ts :: processEvent()
          Expected events: TRIP_ENDED → CANDIDATE; REST_SNAPSHOT → RESTING; …
          Output: BatteryMeasurementSession type=LV_REST_WINDOW
          IdempotencyKey: lv-rest:{vehicleId}:{anchorAtMs}
          On candidate_promoted_to_resting:
            scheduleRestTargets() → BatteryV2RestTargetProducer
            Flag: BATTERY_V2_REST_SHADOW_ENABLED (required for job enqueue)
          Persistenz: battery_measurement_sessions + metadata.scheduledTargets

[BATTERY_REST_TARGET_EVALUATE consumer]
  BatteryRestTargetEvaluateHandler
    Requires: restWindowId + LV_REST_WINDOW session
    BatteryRestTargetEvaluationService
      Reads LIVE_VOLTAGE candidates from battery_measurements
      Writes REST_60M / REST_6H measurements (shadow quality)
    Persistenz: battery_measurements (session-linked)

[Reconciliation — every 5 min default]
  BatteryV2ReconciliationScheduler
    reconcileLvRestWindowTargets() — sessions → schedule missing REST jobs
    reconcileLegacyRestTargets() — bridge battery_features ONLY if LV session exists
    Flag: BATTERY_V2_RECONCILIATION_ENABLED (default true)
          BATTERY_V2_REST_SHADOW_ENABLED (required for legacy bridge enqueue)
```

### 2.2 Schritt-Tabelle (Canonical Pfad)

| Schritt | Datei | Service / Methode | Input | Output | Trigger | Feature Flag | Scheduler / Hook | Persistenz |
|---------|-------|-------------------|-------|--------|---------|--------------|------------------|------------|
| 1 Telemetry | `dimo-snapshot.processor.ts` | `DimoSnapshotProcessor.process` | DIMO API snapshot | `vehicleLatestState` | `DimoSnapshotScheduler` 30s | — | BullMQ worker | `vehicle_latest_states` |
| 2 Observation classify enqueue | `battery-v2-snapshot-observation.producer.ts` | `classifyAndEnqueue` | normalized LV/HV | `BATTERY_OBSERVATION_CLASSIFY` job | after VLS upsert | — | inline in snapshot processor | BullMQ `battery.v2` |
| 3 Observation consume | `battery-v2-snapshot-ingestion.service.ts` | `ingestObservationClassify` | job payload | calls `onSnapshot` | battery.v2 worker | — | queue consumer | — |
| 4 **Legacy rest detect** | `battery-v2.service.ts` | `onSnapshot` | LV V, observedAt | `battery_features` updates | RESTING + duration | — | via step 3 | `battery_features` |
| 5 **FSM event (missing)** | `lv-rest-window.service.ts` | `processEvent` | `LvRestWindowEvent` | session + REST jobs | **none wired** | shadow for REST schedule | **not called** | `battery_measurement_sessions` |
| 6 REST target eval | `battery-rest-target-evaluate.handler.ts` | `handle` | restWindowId, sessionId | REST_60M/6H measurement | delayed job | `BATTERY_V2_REST_SHADOW_ENABLED` | BullMQ delayed | `battery_measurements` |
| 7 Reconciliation | `battery-v2-reconciliation.service.ts` | `reconcileAll` | DB state | re-enqueue gaps | `@Interval` 5min | reconciliation default on | `BatteryV2ReconciliationScheduler` | queue metadata |

---

## 3. Production Wiring

### 3.1 Ist `processEvent()` live aufgerufen?

**Nein.** Statische Code-Analyse (Repo `fb2f48e8d`):

| Symbol | Call-Sites außer Definition |
|--------|---------------------------|
| `LvRestWindowStateMachineService` | Nur `vehicle-intelligence.module.ts` (DI registration) |
| `LvRestWindowStateMachineService.processEvent` | **0** Production-Call-Sites |
| `buildSignalFromLatestState` | **0** Production-Call-Sites |

Andere `processEvent()`-Treffer (Workflow Engine, Voice Webhook) sind **nicht** LV-Rest.

### 3.2 Was läuft stattdessen live?

| Pfad | Status | Erzeugt `LV_REST_WINDOW`? |
|------|--------|---------------------------|
| `BatteryV2Service.onSnapshot` via `ingestObservationClassify` | **aktiv** | **Nein** — nur `battery_features` |
| `LvRestWindowStateMachineService.processEvent` | **nicht verdrahtet** | Ja (wenn aufgerufen) |
| `reconcileLegacyRestTargets` | aktiv, aber `if (!session) continue` | Braucht existierende Session |
| `reconcileLvRestWindowTargets` | aktiv, findet 0 Sessions | — |

### 3.3 Provider-/Signalfilter

- `BatteryV2SnapshotObservationProducer`: LV nur bei plausiblem Voltage (9.0–16.0 V).
- `BatteryV2Service.onSnapshot`: skip bei stale/future sample, non-RESTING state.
- **Kein** Filter, der `processEvent` blockiert — die Methode wird nie aufgerufen.

### 3.4 Worker / Scheduler

| Komponente | Production |
|------------|------------|
| PM2 Prozess | `synqdrive` (monolith, workers embedded) |
| `DimoSnapshotScheduler` | aktiv (VLS updates, snapshots in DB) |
| `BatteryV2ReconciliationScheduler` | aktiv (default `BATTERY_V2_RECONCILIATION_ENABLED=true`) |
| `battery.v2` queue | 68 failed, 0 waiting/active/delayed |

Log-Hinweis: `Battery V2 reconciliation tick failed` am 2026-08-22 (historisch); seit PR #1319 kein neuer Failure-Loop.

### 3.5 FSM nur implementiert, nicht verdrahtet?

**Ja — bestätigt.** FSM + State-Machine + Session-Repository + REST-Target-Producer + Handler + Reconciliation sind implementiert und per DI registriert, aber **kein Producer** emittiert `TRIP_ENDED` / `REST_SNAPSHOT` Events an `processEvent()`.

Intended Hook-Punkte (nicht implementiert):

- `TripDetectionOrchestrationService.transitionState(RESTING)` → `TRIP_ENDED`
- `BatteryV2SnapshotIngestionService` nach LV observation → `REST_SNAPSHOT`
- Trip start / wake / charging → invalidate events

---

## 4. Feature Flags / Config

| Flag | Code Default | Production | Required For |
|------|--------------|------------|--------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | `false` | **`true`** | `scheduleRestTargets`, `reconcileLegacyRestTargets` enqueue |
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` | **`false`** | LV customer publication |
| `BATTERY_V2_READINESS_ENABLED` | `false` | **`false`** | Rental readiness policy |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` | **unset → `true`** | Reconciliation scheduler ticks |
| `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED` | `false` | unset → `false` | Legacy crank scoring |
| `BATTERY_V2_START_PROXY_ENABLED` | `false` | unset → `false` | ICE start proxy collection |
| `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` | `false` | unset → `false` | HV recharge sessions |
| `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` | `false` | unset → `false` | HV fallback charge |
| `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | `false` | unset → `false` | HV capacity shadow |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | `false` | unset → `false` | HV SOH publication |
| `BATTERY_V2_DLQ_REPLAY_ENABLED` | — | unset | DLQ replay on reconcile tick |
| `BATTERY_REST_60M_MS` | 3600000 | unset → 1h | REST_60M delay |
| `BATTERY_REST_6H_MS` | 21600000 | unset → 6h | REST_6H delay |
| `BATTERY_REST_TARGET_RETRY_GRACE_MS` | 1800000 | unset → 30m | Quality window grace |

**Hinweis:** `BATTERY_V2_REST_SHADOW_ENABLED=true` in Production würde REST-Jobs schedulen **wenn** Sessions existieren. Da `processEvent()` nie läuft, bleibt der Schatten-Pfad ohne Session-Anker leer.

---

## 5. Signal Availability

### 5.1 Fleet (vehicle_latest_states)

| Metrik | Wert |
|--------|------|
| Fahrzeuge mit VLS-Eintrag | 6 |
| Mit `lv_battery_voltage` | 5 |
| LV fresh (source_timestamp ≥ 7d) | 3 |
| `vehicle_trip_detection_states` RESTING | 4 |

### 5.2 Capability Preflight (`vehicle_battery_capabilities`)

| measurement_type | status | count |
|------------------|--------|-------|
| `LIVE_VOLTAGE` | **QUERY_ERROR** | 6 |
| (alle anderen LV-relevanten Typen) | QUERY_ERROR | 6 each |

`signal_key = lowVoltageBatteryCurrentVoltage` mit AVAILABLE/DEGRADED: **0**

Capability-Errors blockieren **nicht** direkt `onSnapshot` (kein Capability-Gate im Legacy-Pfad), aber sie signalisieren DIMO-Query-Probleme im Preflight-Worker.

### 5.3 Pro Fahrzeug (3 fällige Legacy-Candidates, maskiert)

| Vehicle | LV Signal | Last LV Timestamp | Other Signals | Freshness |
|---------|-----------|-------------------|---------------|-----------|
| `c103...d359` | 13.612 V | 2026-08-26T09:10:38Z | ignition off, speed 0, RESTING | Provider fetch 2026-08-26T18:28:33Z |
| `8c85...ca48` | 13.101 V | 2026-08-25T16:42:08Z | ignition off, speed 0, RESTING | Provider fetch 2026-08-26T18:28:33Z |
| `c43c...5588` | 13.04 V | 2026-07-18T13:42:28Z | speed 22, POSSIBLE_START | LV signal **stale ~39d** |

**FSM könnte Ruhe erkennen** für `c103` und `8c85` (RESTING + plausible LV). `c43c` hat veraltetes LV-Signal und kein RESTING — canonical REST_SNAPSHOT würde hier voraussichtlich scheitern oder invalidieren.

---

## 6. Observation Pipeline

### 6.1 Klassifikation

| Kategorie | Evidence | Bewertung |
|-----------|----------|-----------|
| A — keine Eingangsdaten | 5/6 Fahrzeuge haben LV in VLS | **nicht A** |
| B — Eingang, keine Observation | `battery_health_snapshots` total **219**, last **2026-08-26T11:35:00Z** | Snapshots persistiert |
| C — Observation, FSM nicht getriggert | Legacy `onSnapshot` läuft; **0** FSM | **C für canonical** |
| D — FSM getriggert, Session nicht persistiert | FSM nie getriggert | **nicht D** |

### 6.2 Counts

| Entity | Total | Last 24h | Last 7d | Last 30d |
|--------|-------|----------|---------|----------|
| `battery_health_snapshots` | 219 | (last created 2026-08-26) | — | — |
| `battery_measurements` LIVE_VOLTAGE | **0** | 0 | 0 | 0 |
| `battery_measurements` REST_60M | 91 | 0 | 0 | 0 (last Jul 16) |
| `battery_measurement_sessions` (all types) | **0** | 0 | 0 | 0 |

`REST_60M` rows: first 2026-06-09, last 2026-07-16, **0** mit `session_id` — historischer Backfill (`backfill-battery-snapshot-rest-measurements.ts`), nicht live canonical handler.

### 6.3 Legacy observation path

PM2 rotated logs (Aug 13–26): **~30** Zeilen `Battery 60m rest captured` — Legacy-Pfad hat REST-Spannungen in `battery_features` geschrieben (nicht Sessions).

Beispiele:

- 2026-08-25: captures für `c103`, `8c85`, `a60c`
- 2026-08-26: captures in `battery_features` (2 Fahrzeuge mit 60m/6h per DB)

---

## 7. FSM Events (Logs)

| Cluster | Count 24h | Count 7d (rotated logs) |
|---------|-----------|-------------------------|
| `processEvent` / `LvRestWindow` | 0 | 0 |
| `candidate_promoted` / `opened_candidate` | 0 | 0 |
| `candidate` / `RESTING` FSM metadata | 0 | 0 |
| `invalidated` / `expired` (FSM) | 0 | 0 |
| `Battery 60m rest captured` (legacy) | 0 in current buffer | ~30 in rotated |
| `lv-rest-shadow-summary` route map | 2 (PM2 restarts) | — |
| Session persistence errors | 0 | 0 |

**0 FSM Events** → upstream: kein Event-Producer verdrahtet (nicht Signal-Gap allein).

---

## 8. Session Persistence

### 8.1 `battery_measurement_sessions` by type

| type | total | created 24h | 7d | 30d |
|------|-------|-------------|-----|-----|
| **LV_REST_WINDOW** | **0** | 0 | 0 | 0 |
| **alle Typen** | **0** | 0 | 0 | 0 |

Die Tabelle ist in Production **komplett leer** — nicht nur LV Rest. ICE_START_PROXY / andere Session-Typen wurden auch nie live erzeugt (Start-Proxy-Pfad separat flag-gated).

### 8.2 Write-Failures

- Keine Prisma/constraint/enum Errors in Error-Logs für `battery_measurement_sessions`.
- Keine Session-Write-Versuche sichtbar → konsistent mit unwired FSM.

---

## 9. Legacy vs Canonical Comparison

### 9.1 Wie Legacy `restWindowStartedAt` entsteht

`BatteryV2Service.onSnapshot()`:

1. `vehicleTripDetectionState.state === RESTING` und `lastActivityAt` gesetzt
2. `restDurationMs >= 60m` seit `lastActivityAt`
3. Wenn `|storedWindowMs - lastActivityMs| > tolerance` → **neues Fenster**: `battery_features.restWindowStartedAt = lastActivityAt`, captures cleared
4. Sonst bei Threshold: `rest60mCapturedAt` / `rest6hCapturedAt` + Voltages

**Quelle:** Trip-Detection `RESTING` + DIMO LV voltage im `BATTERY_OBSERVATION_CLASSIFY` Pfad — **nicht** FSM.

### 9.2 Pro Legacy Candidate

| Candidate | Legacy Rest Detection Source | Canonical Input Present | FSM Event Present | Session Present | Break Point |
|-----------|------------------------------|-------------------------|-------------------|-----------------|-------------|
| `c103...d359` | `onSnapshot` + RESTING; window anchor 2026-08-26T06:13:38Z | LV 13.61V, RESTING, ignition off | **No** | **No** | **FSM not wired** (`processEvent` never called). Anchor ≠ `last_activity_at` (09:11:59Z) — Legacy window stale vs trip state |
| `8c85...ca48` | `onSnapshot`; anchor 2026-08-25T12:47:19Z; had 60m capture Aug 25 12:36 then new window | LV 13.10V, RESTING | **No** | **No** | **FSM not wired**. New window after prior capture without 60m fill |
| `c43c...5588` | anchor 2026-07-16 (very old) | LV stale Jul 18; POSSIBLE_START | **No** | **No** | **FSM not wired** + stale LV + non-RESTING state |

**Gemeinsames Muster:** Legacy erkannte Ruhefenster in `battery_features`, aber **kein** kanonischer Session-Write, weil `processEvent()` nie aufgerufen wird. Reconciliation überspringt Legacy-Bridge bei `if (!session) continue` (korrekt nach PR #1319).

---

## 10. Code Reachability

| Check | Result |
|-------|--------|
| DI registration `LvRestWindowStateMachineService` | ✅ `vehicle-intelligence.module.ts` |
| Module imports | ✅ |
| `processEvent` production call sites | ❌ **0** |
| `buildSignalFromLatestState` call sites | ❌ **0** |
| Session create in `processEvent` | ✅ erreichbar wenn aufgerufen |
| `scheduleRestTargets` gate | `isBatteryV2RestShadowEnabled()` — **true** in prod |
| Reconciliation scheduler | ✅ registered in `workers.module.ts` |
| Legacy bridge | ✅ but requires session |
| Dead code? | FSM service **live code, unreachable** in production |

---

## 11. Root Causes

| ID | Kategorie | Beschreibung | Confidence |
|----|-----------|--------------|------------|
| **LV-RC-01** | **Missing wiring** | `LvRestWindowStateMachineService.processEvent()` hat keine Production-Call-Sites; einziger Session-Create-Pfad | **Confirmed** |
| **LV-RC-02** | **Legacy-only path still active** | `BatteryV2Service.onSnapshot` schreibt `battery_features`, nicht Sessions | **Confirmed** |
| **LV-RC-03** | **Missing wiring** | Kein Event-Bridge von Trip-Detection (`RESTING`/`TRIP_ENDED`) zum FSM | **Confirmed** |
| **LV-RC-04** | **Missing wiring** | Kein Event-Bridge von `ingestObservationClassify` (`REST_SNAPSHOT`) zum FSM | **Confirmed** |
| **LV-RC-05** | **Production deploy/config mismatch** | `BATTERY_V2_REST_SHADOW_ENABLED=true` erwartet Sessions; Reconciliation/Legacy-Bridge können ohne Sessions nicht enqueue | **High** |
| **LV-RC-06** | **Input/signal gap (secondary)** | `LIVE_VOLTAGE` measurements = 0; canonical REST eval liest LIVE_VOLTAGE, nicht `battery_features` | **High** |
| **LV-RC-07** | **Input/signal gap (secondary)** | Capability preflight `LIVE_VOLTAGE` = QUERY_ERROR (6 vehicles) | **Medium** |
| **LV-RC-08** | **Legacy-only path** | 68 failed `battery.v2` jobs (pre-#1319) ohne `restWindowId` — historisch, Loop gestoppt | **Confirmed** |
| **LV-RC-09** | **FSM predicate / anchor drift (legacy)** | Due candidates: `rest_window_started_at` ≠ `last_activity_at` → Legacy 60m capture stalled | **High** (legacy only) |

**Primär:** LV-RC-01 through LV-RC-04 (canonical path not wired).

---

## 12. Recommended Remediation (nicht umgesetzt)

### Option A — Canonical FSM verdrahten (empfohlen)

Wire `processEvent()` at:

1. Trip detection → `TRIP_ENDED` when entering RESTING (with `lastActivityAt` anchor)
2. `ingestObservationClassify` → `REST_SNAPSHOT` when LV observation + RESTING predicates pass
3. Trip start / wake / HV charging → invalidate events

| | |
|--|--|
| **Vorteile** | Ein kanonischer Pfad; Sessions + `restWindowId`; REST handler contract erfüllt |
| **Risiken** | Doppel-Detection wenn Legacy parallel bleibt |
| **Datenintegrität** | Idempotency keys `lv-rest:{vehicleId}:{ms}` |
| **Idempotenz** | `createIdempotent` auf Session-Repo |
| **Production-Risiko** | Mittel — shadow mode already on |
| **Tests** | Vorhandene FSM specs + integration mit ingestion |
| **Rollback** | Flag `BATTERY_V2_REST_SHADOW_ENABLED=false` stoppt REST enqueue; Legacy weiter |

### Option B — Legacy → canonical migration/backfill

One-time: für jedes `battery_features.restWindowStartedAt` → `processEvent(TRIP_ENDED)` + optional `REST_SNAPSHOT` replay.

| | |
|--|--|
| **Vorteile** | Repariert historische 5 Fenster / 3 due candidates |
| **Risiken** | Anchor-Timestamps müssen korrekt sein; stale anchors (c43c) invalidieren |
| **Datenintegrität** | Nur mit validierten Anchors |
| **Tests** | Dry-run per vehicle |
| **Rollback** | Delete erroneously created sessions (controlled) |

### Option C — Transitional compatibility bridge

Temporary: bei Legacy `restWindowStartedAt` write auch `processEvent` open candidate (ohne Legacy REST captures parallel).

| | |
|--|--|
| **Vorteile** | Schnelle Session-Erzeugung |
| **Risiken** | **Zwei parallele Rest-Detection-Systeme** — nur als kurze Brücke |
| **Empfehlung** | Nur wenn A nicht sofort deploybar; mit Exit-Plan Legacy deprecaten |

### Option D — Signal normalization fix

Persist `LIVE_VOLTAGE` measurements on each classified LV observation; fix capability QUERY_ERROR.

| | |
|--|--|
| **Vorteile** | REST target evaluation kann canonical measurements lesen |
| **Risiken** | Ohne A weiterhin 0 Sessions |
| **Abhängigkeit** | Ergänzt A, nicht substituiert |

**Kein empfohlener dauerhafter Legacy-Fallback** — würde LV-RC-02 perpetuieren.

### Legacy Backfill notwendig?

**Ja, für historische 3 due candidates und 68 failed jobs**, sobald canonical wiring live ist:

- Sessions für gültige Anchors erzeugen (Option B)
- Reconciliation scheduliert REST jobs mit `restWindowId`
- 68 failed jobs: **nicht retry** (invalid payload); neue canonical jobs ersetzen Intent

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Parallel Legacy + FSM double-writes | High | Deprecate `onSnapshot` rest capture after FSM wiring |
| Stale anchors (c43c) create invalid sessions | Medium | FSM invalidate + skip backfill |
| LIVE_VOLTAGE gap blocks REST measurement quality | Medium | Option D + FSM |
| 68 failed jobs confuse ops | Low | Document as historical; no retry |
| Capability QUERY_ERROR | Medium | Separate DIMO query fix |

---

## 14. Production Evidence

| Evidence | Source | Timestamp |
|----------|--------|-----------|
| `LV_REST_WINDOW` count = 0 | PostgreSQL `battery_measurement_sessions` | 2026-08-26T18:28Z |
| All session types = 0 | PostgreSQL | 2026-08-26T18:28Z |
| `battery_features` with rest window = 5, due = 3 | PostgreSQL | 2026-08-26T18:28Z |
| `LIVE_VOLTAGE` measurements = 0 | PostgreSQL | 2026-08-26T18:28Z |
| `REST_60M` = 91, session_id null | PostgreSQL | 2026-08-26T18:28Z |
| Redis `battery.v2` failed = 68 | Redis `bull:battery.v2:failed` | 2026-08-26T18:29Z |
| Last failed reason | `REST target job missing restWindowId` | Redis |
| Flags REST_SHADOW=true | `/opt/synqdrive/shared/backend.env` | 2026-08-26 |
| 0 FSM log lines | PM2 rotated logs Aug 13–26 | 2026-08-26 |
| ~30 legacy capture log lines | PM2 `Battery 60m rest captured` | Aug 13–26 |
| Release path | `/opt/synqdrive/releases/20260826173048_v4994` | deploy ~17:35Z |

---

## Changes / Architektur

| Dokument | Updated |
|----------|---------|
| Synqdrive Code → Changes | **No** (read-only audit) |
| Synqdrive Code → Architektur | **No** (read-only audit) |

---

## Appendix — Verwandte Dokumente

- [`battery-v2-production-failure-remediation-2026-08.md`](./battery-v2-production-failure-remediation-2026-08.md)
- [`architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`](../../architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md)
- [`battery-rest-window-reality.md`](./battery-rest-window-reality.md)
- [`battery-v2-job-callsite-matrix.md`](./battery-v2-job-callsite-matrix.md)
