# ClickHouse Trip Assist — Architektur-Entscheidung & Trip-Ende

**Stand:** 2026-07-08  
**Status:** Bewusste Produktentscheidung (accepted risk)  
**Scope:** Dokumentation — keine Code-Änderung in diesem Schritt

---

## 1. Entscheidung: `CLICKHOUSE_TRIP_ASSIST_ENABLED` default `true`

### Hintergrund

SynqDrive spiegelt DIMO-Snapshots in die **eigene** ClickHouse-Instanz (`telemetry_snapshots`, `telemetry_state_changes`). CH-gestützte Detektoren lesen diese Daten für schnelle Segment-/Activity-Analysen — analog zum Konzept „Telemetrie + analytische Detektoren“, nicht als zweite System-of-Record.

### Entscheidung (2026-07-08)

| Aspekt | Festlegung |
|--------|------------|
| Default | **`true`** (opt-out via `CLICKHOUSE_TRIP_ASSIST_ENABLED=false`) |
| Prod | `true` beibehalten, solange CH healthy und Snapshots/State-Changes befüllt sind |
| Risiko-Klasse | **Accepted** — bewusste Architektur-Ausnahme, kein P0/P1-Must-Fix |
| Canonical truth | PostgreSQL für Trips, Scores, Bookings — unverändert |

### Was Trip Assist beeinflusst

| Bereich | CH-Rolle | Ohne CH |
|---------|----------|---------|
| **Trip-Start-Bestätigung** | `ActivityWindowDetector`, `IgnitionSegmentDetector`, `MotionSegmentDetector` korrelieren mit live DIMO-Telemetrie | DIMO/PG-only Start-Pfad |
| **Aktive Kontinuität** | `ActivityWindowDetector` als **Guard** — kann Trip **offen halten** bei Mehrdeutigkeit | Nur `ContinuityAssessmentDetector` (DIMO core) |
| **Repair fehlender Trips** | Ignition/Motion-Segmente aus `telemetry_state_changes` | DIMO-Segment-Fallback / StartConfirmation |
| **Trip-Ende (live FSM)** | **Kein CH-Beschleuniger** — siehe Abschnitt 2 | — |
| **Scores / Gesamtbewertung** | **Kein Einfluss** | — |

### Code-Referenzen

- Flag: `backend/src/modules/clickhouse/clickhouse-env.util.ts` → `isClickHouseTripAssistEnabled()`
- Gating: `trip-detection-orchestration.service.ts` → `hasClickHouseAnalyticsDetectors()`
- Start-Assist: `trip-evidence.helpers.ts` → `resolveAnalyticsAssistedStartDecision()`
- Repair: `trip-reconciliation.service.ts` → `collectRepairCandidates()` bei `chAssistEnabled`

### Monitoring-Empfehlung

Metrik `synqdrive_trip_evidence_paths_total` beobachten:

- `path=DIMO_ONLY` — reiner DIMO/PG-Pfad
- `path=CLICKHOUSE_ASSISTED` / `CLICKHOUSE_IGNITION` / `CLICKHOUSE_MOTION` — CH-Einfluss
- `path=CLICKHOUSE_GUARD` — CH hielt Trip bei Mehrdeutigkeit offen

### Voraussetzungen für Prod `true`

1. `CLICKHOUSE_URL` gesetzt, CH erreichbar
2. `telemetry_snapshots` + `telemetry_state_changes` werden befüllt (DimoSnapshotProcessor)
3. Mirror-Flags (`HF_MIRROR`, `WAYPOINT_MIRROR`, …) sind **unabhängig** — Trip Assist braucht nur Snapshot/State-Change-Mirror

---

## 2. Trip-Ende — Ist-Zustand (Audit 2026-07-08)

### Kurzantwort

**Trip-Ende läuft primär über die PostgreSQL-FSM + DIMO-Core-Daten + CUSUM — nicht über ClickHouse.**

CH wird beim Live-Ende **nicht** genutzt, um früher zu finalisieren. Im Gegenteil: CH kann ein Ende **verzögern** (Guard).

### FSM-Ablauf (vereinfacht)

```
ACTIVE_TRIP
    │
    ├─ ContinuityAssessmentDetector (DIMO core points, Zeitfenster)
    │     └─ verdict: ACTIVE | IDLE | POSSIBLE_END
    │
    ├─ [optional CH] Bei POSSIBLE_END + niedriger Confidence:
    │     ActivityWindowDetector (CH telemetry_snapshots)
    │     → resolveClickHouseContinuityGuard()
    │     → keepTripOpen=true → zurück zu ACTIVE (Ende verzögert!)
    │
    └─ Bei no core data + Inaktivität ≥ TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS (default 120s):
          → POSSIBLE_END

POSSIBLE_END
    │
    ├─ EndContinuityDetector (DIMO recent core, 90s) — Aktivität wieder da? → ACTIVE
    ├─ Stability + Min-Inactivity Gate (default max(90s, 120s) = 120s)
    ├─ ChangePointEndDetector / CUSUM (DIMO core um possibleEndAt)
    │     └─ bis zu TRIP_END_VALIDATION_MAX_ATTEMPTS (default 3), Retry TRIP_END_VALIDATION_RETRY_MS (60s)
    └─ Hard timeout TRIP_END_TIMEOUT_MS (default 30 min) → erzwungenes Finalize
```

### Detektoren pro Phase (`trip-detection-policy.resolver.ts`)

| Phase | Detektoren | Datenquelle |
|-------|------------|-------------|
| `ACTIVE_TRIP` (confirming start) | StartConfirmation + optional CH-Segment/Activity | DIMO + CH |
| `ACTIVE_TRIP` (ambiguous continuity) | `ActivityWindowDetector` | **CH** (nur Guard) |
| `ACTIVE_TRIP` (default continuity) | `ContinuityAssessmentDetector` | **DIMO** |
| `POSSIBLE_END` | `EndContinuityDetector`, `ChangePointEndDetector` | **DIMO** |
| `REPAIR_MISSING_END` | Policy definiert CH + CUSUM | **Nicht verdrahtet** (siehe unten) |

### Warum Trip-Ende „spät“ wirkt

Typische Verzögerungsketten (Defaults):

| Stufe | Default | Env-Variable |
|-------|---------|--------------|
| Min-Inaktivität vor CUSUM | **120 s** | `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` |
| Stability-Fenster | **90 s** | `TRIP_END_STABILITY_WINDOW_MS` |
| CUSUM-Gate | **max(90s, 120s) = 120s** | — |
| CUSUM-Retries | **3 × 60 s** | `TRIP_END_VALIDATION_MAX_ATTEMPTS`, `TRIP_END_VALIDATION_RETRY_MS` |
| Hard-Timeout | **30 min** | `WORKER_TRIP_END_TIMEOUT_MS` |

Zusätzlich: Wenn CH-Guard bei Mehrdeutigkeit `keepTripOpen=true` liefert, bleibt die FSM länger in `ACTIVE_TRIP`.

### REPAIR_MISSING_END — Policy existiert, Wiring fehlt

`DETECTION_PHASES.REPAIR_MISSING_END` ist in `trip-detection-policy.resolver.ts` definiert (`ChangePointEndDetector` + `IgnitionSegmentDetector` + optional `MotionSegmentDetector`), wird aber in `trip-reconciliation.service.ts` **nicht aufgerufen**.

Aktueller Missing-End-Repair: Kalt-Fallback `lastWaypoint ?? windowEnd` — **ohne CH-Segmente**.

---

## 3. Kann / soll CH für schnelleres Trip-Ende genutzt werden?

### Implementiert (V4.9.270): ClickHouse End Assist — first instance

Live `ACTIVE_TICK` path (`tryApplyClickHouseAssistedEnd`):

1. Gated by `CLICKHOUSE_TRIP_ASSIST_ENABLED` + CH available
2. Requires **stationary live telemetry** + CH segment end (ignition OFF / motion STOP)
3. Post-stop activity window must **not** show resumed movement
4. **HIGH** confidence → `POSSIBLE_END` + immediate `FINALIZE` (skips 120s CUSUM gate)
5. **MEDIUM** → shortened stability (`TRIP_END_CH_ASSIST_STABILITY_MS`, default 30s) then finalize without CUSUM
6. **INCONCLUSIVE** → existing FSM continuity + CUSUM fallback

Reconciliation `REPAIR_MISSING_END`: `resolveChAssistedMissingEndTime()` uses same decision helper.

Env tuning: `TRIP_END_CH_ASSIST_*` in `backend/src/config/worker.config.ts`.

### Architektur-No-Gos (unverändert)

- CH darf **nicht allein** `endTime` in PostgreSQL setzen ohne FSM/Decision-Engine-Pfad
- Kein Score-Neuberechnen aus CH
- Bei CH down: End-Pfad muss DIMO/CUSUM-only weiterlaufen

---

## 4. Ops: Schnelleres Trip-Ende ohne CH-Code (Tuning)

In `backend.env` / Worker-Config (`backend/src/config/worker.config.ts`):

```bash
# Aggressiver (Vorsicht: mehr False-Positive Ends bei kurzen Stopps)
TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS=90000    # 90s statt 120s
TRIP_END_STABILITY_WINDOW_MS=60000               # 60s statt 90s
TRIP_END_VALIDATION_MAX_ATTEMPTS=2
TRIP_END_VALIDATION_RETRY_MS=45000

# Konservativer (langsamer, weniger False Positives) — aktuelle Defaults
# TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS=120000
# TRIP_END_STABILITY_WINDOW_MS=90000
```

**Hinweis:** `CLICKHOUSE_TRIP_ASSIST_ENABLED=true` kann Ends bei Mehrdeutigkeit **verzögern** (CH-Guard). Für schnellere Ends ist Tuning der FSM-Timer oft effektiver als mehr CH.

---

## 5. Verwandte Docs

- `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`
- `backend/docs/clickhouse-local-selfhosted.md`
- `backend/src/config/worker.config.ts` (Trip-End-Parameter)
