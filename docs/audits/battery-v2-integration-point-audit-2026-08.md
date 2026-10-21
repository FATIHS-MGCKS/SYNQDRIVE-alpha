# Battery V2 — Integration Point Audit (Read-only)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-08-26T19:00:00Z |
| **Methode** | Read-only Code-Trace + Production-Kontext aus [`lv-rest-window-production-root-cause-2026-08.md`](./lv-rest-window-production-root-cause-2026-08.md) |
| **Constraints** | Keine Trip-Detection-Änderungen, keine Code-/Flag-/DB-/Deploy-Änderungen |
| **Repo-Basis** | `main` lineage, deployed SHA `fb2f48e8d` |

---

## 1. Trip Event Architecture

### 1.1 Wo wird Trip-Ende final bestätigt?

Trip-Ende wird in **Trip Detection V2** finalisiert, nicht über einen globalen Domain-Event-Bus:

| Schritt | Datei | Methode | Persistenz |
|---------|-------|---------|------------|
| End-Validation Tick | `trip-tracking.processor.ts` | `processEndValidation` → orchestration | `vehicle_trip_detection_states` |
| Finalize Tick | `trip-tracking.processor.ts` | `processFinalize` → orchestration | `vehicle_trips.endTime`, Status COMPLETED |
| Decision | `trip-decision-engine` (via orchestration) | `finalizeTrip` / `discardTrip` | `vehicle_trips` |
| Post-RESTING | `trip-detection-orchestration.service.ts` | `transitionState(RESTING, { lastActivityAt })` | `vehicle_trip_detection_states` |

**Trigger-Kette:** `DimoSnapshotProcessor` → `evaluateSnapshotForTripStart` → BullMQ `trip-tracking` Jobs (`POSSIBLE_END_CHECK` → `END_VALIDATION` → `FINALIZE`).

**Anchor für Battery Legacy:** In `processFinalize` wird explizit `restWindowAnchorAt = endTime` gesetzt und als `lastActivityAt` in RESTING persistiert (Kommentar: „rest-window anchor for Battery V2“).

### 1.2 Gibt es ein kanonisches TRIP_ENDED Domain Event?

**Nein.** Im SynqDrive-Trip-Stack existiert **kein** publiziertes `TRIP_ENDED` / `trip.ended` Domain Event auf:

- NestJS `EventEmitter` — nicht für Trip-Ende
- Workflow `WorkflowEventService` — nur Booking/Notification-Pfade (kein Trip-Ende)
- Outbox — nicht für Trip-Lifecycle
- Redis Pub/Sub — nicht für Trip-Ende

`LvRestWindowEventType.TRIP_ENDED` ist ein **Battery-interner FSM-Event-Typ**, nicht ein Trip-Detection-Transport-Event.

### 1.3 Producer für Trip-End-/State-Signale

| Event/Signal | Producer | Transport | Consumers | Persistence |
|--------------|----------|-----------|-----------|-------------|
| **Trip finalized (COMPLETED)** | `TripDetectionOrchestrationService.processFinalize` | **Direkter Service-Aufruf** (awaited) | `TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion` | `vehicle_trips` |
| **Trip finalized (legacy enrichment)** | `processFinalize` | **Fire-and-forget** `.catch()` | `TripEnrichmentOrchestrator.enqueueBehaviorEnrichment` → BullMQ `trip-behavior-enrichment` | `vehicle_trips.behaviorEnrichmentStatus` |
| **Rental driving recompute** | `TripPostFinalizeAnalysisProducer` | **Fire-and-forget** void | `RentalDrivingAnalysisRecomputeTriggerService.enqueueForTrip` | Recompute jobs |
| **RESTING + lastActivityAt** | `processFinalize` / andere RESTING-Transitions | **DB state update** | Lesende Consumer (Battery Legacy `onSnapshot`, potenzieller FSM-Bridge) | `vehicle_trip_detection_states` |
| **Trip START (Battery)** | `processPossibleStart` (ACTIVE_TRIP confirm) | **Direkter Aufruf** | `BatteryV2TripStartProducer.enqueueStartProxy` → BullMQ `battery.v2` | Queue job |
| **Trip tracking phases** | `TripDetectionOrchestrationService.enqueueTripTrackingJob` | BullMQ `trip-tracking` | `TripTrackingProcessor` | Poll logs |
| **DIMO snapshot** | `DimoSnapshotScheduler` | BullMQ `dimo.snapshot.poll` | `DimoSnapshotProcessor` | `vehicle_latest_states` |

**Muster:** Downstream-Module werden über **(a) direkte Orchestration-Injection**, **(b) dedizierte Producer-Services**, oder **(c) BullMQ-Enqueue** angebunden — nicht über einen zentralen Trip-Event-Bus.

---

## 2. Existing Consumers

### 2.1 Wie reagieren Module auf Trip-Ende ohne Trip-Detection zu ändern?

| Modul | Integration | Trip-Detection-Änderung? | Pattern |
|-------|-------------|-------------------------|---------|
| **Driving analysis init** | `TripPostFinalizeAnalysisProducer` ← awaited in `processFinalize` | Bereits verdrahtet (historisch) | Dedicated producer + service call |
| **Behavior enrichment** | `TripEnrichmentOrchestrator.enqueueBehaviorEnrichment` ← fire-and-forget in `processFinalize` | Bereits verdrahtet | BullMQ dedup jobId `hf-enrich-{tripId}` |
| **Rental driving analysis** | Via `TripPostFinalizeAnalysisProducer` → recompute trigger | Bereits verdrahtet | Async enqueue |
| **Tire trip usage** | `TireTripUsageService` — liest **COMPLETED** `vehicle_trips` (API/Reconciliation) | Keine Live-Hook | **DB polling / reconciliation**, kein Trip-End-Event |
| **Driving impact** | Trip-basierte Aggregation über `vehicle_trips` | Keine Live-Hook | DB reads |
| **Misuse cases** | Reconcile über completed trips | Keine Live-Hook | Scheduler/reconcile |
| **Battery V2 start proxy** | `BatteryV2TripStartProducer` auf **Trip START** | Bereits verdrahtet | Direkter Orchestration-Call (Option C für Start) |
| **Battery V2 rest (Legacy)** | `BatteryV2Service.onSnapshot` liest `vehicle_trip_detection_states` | **Keine** Trip-Änderung | **Read-only DB** + observation job |
| **Workflows** | `WorkflowEventService` — **kein** Trip-Ende | — | Booking/handover Events |

**Bevorzugtes Muster für neue Battery-Anbindung ohne Trip-Änderung:** wie Legacy Rest — **Battery-interner Consumer** der bei `BATTERY_OBSERVATION_CLASSIFY` **nur liest** (`vehicle_trip_detection_states`, `vehicle_latest_states`), analog zu `buildSignalFromLatestState()`.

**Nicht bevorzugt (ohne Trip-Änderung unmöglich):** neuer Hook in `processFinalize` (würde Trip-Orchestration ändern).

---

## 3. Battery V2 Call Sites

### 3.1 `LvRestWindowStateMachineService.processEvent()`

| Kontext | Call-Sites |
|---------|------------|
| **Production** | **0** |
| Definition | `lv-rest-window.service.ts:44` |
| DI | `vehicle-intelligence.module.ts` |
| Tests | `lv-rest-window.state-machine.spec.ts` (indirekt via `reduceLvRestWindow`) |

### 3.2 `buildSignalFromLatestState()`

| Kontext | Call-Sites |
|---------|------------|
| **Production** | **0** |
| Zweck | Baut `LvRestWindowSignalContext` aus `vehicle_latest_states` + `vehicle_trip_detection_states` |

**Architektur-Intention:** Signal-Builder und FSM sind implementiert; Wiring in Ingestion fehlt.

### 3.3 Verwandte Battery-Produzenten (live)

| Komponente | Call-Site | Event-Typ |
|------------|-----------|-----------|
| `BatteryV2TripStartProducer.enqueueStartProxy` | `trip-detection-orchestration.service.ts` (~933) | Trip **START** only |
| `BatteryV2Service.onSnapshot` | `battery-v2-snapshot-ingestion.service.ts:76` | Legacy rest (kein FSM) |
| `BatteryV2RestTargetProducer` | `lv-rest-window.service.ts` `scheduleRestTargets` | Nur wenn FSM RESTING |

### 3.4 Tests, die Wiring voraussetzen

- `lv-rest-window.state-machine.spec.ts` — synthetische `TRIP_ENDED` / `REST_SNAPSHOT` Events
- `battery-rest-target-evaluate.handler.spec.ts` — Sessions mit `lvRestWindowState: RESTING`
- `battery-v2-reconciliation.spec.ts` — LV Sessions für Legacy-Bridge

### 3.5 Minimal invasive vorgesehene Stelle (Code-Struktur)

**Primär:** `BatteryV2SnapshotIngestionService.ingestObservationClassify()`  
— bereits zentraler Battery-Consumer nach DIMO-Snapshot-Klassifikation; ruft heute `onSnapshot` auf.

**Alternativ:** dedizierter Bridge-Service (`LvRestWindowIngestionBridge`) vom selben Handler aufgerufen — gleiche Grenze, bessere Trennung.

**Nicht in Trip-Detection:** kein weiterer `processFinalize`-Hook nötig, wenn FSM-`TRIP_ENDED` aus **gelesenem** Det-State synthetisiert wird.

---

## 4. REST Snapshot Path

### 4.1 Trace (live)

```
DIMO poll
  → DimoSnapshotProcessor.process()
  → BatteryV2SnapshotObservationProducer.classifyAndEnqueue()
       Input: lvBatteryVoltage, HV fields, batteryMap, receivedAt
       Policy: evaluateBatteryProviderObservation (LV), evaluateHvSnapshotObservation (HV)
       Output: BullMQ BATTERY_OBSERVATION_CLASSIFY (wenn neue idempotencyKey)

  → BatteryObservationClassifyHandler.handle()
  → BatteryV2SnapshotIngestionService.ingestObservationClassify()
       → BatteryV2Service.onSnapshot()     [LEGACY — battery_features]
       → HvBatteryHealthService.recordSnapshot() [HV path]
       → (kein LvRestWindowStateMachineService)
```

### 4.2 Verfügbare Signale im Observation-Pfad

| Signal | Quelle im classify payload | Für FSM nutzbar? |
|--------|---------------------------|------------------|
| LV voltage | `snapshotContext.lvBatteryVoltage` | ✅ `lvVoltage` |
| LV observedAt | `snapshotContext.lvBatteryObservedAt` | ✅ `observedAt`, `providerObservedAt` |
| Speed / ignition | Indirekt via `buildSignalFromLatestState` (VLS) | ✅ |
| HV charging | `snapshotContext.tractionBatteryIsCharging` | ✅ `isHvCharging` |
| Trip RESTING / lastActivityAt | DB read (`vehicle_trip_detection_states`) | ✅ Anchor |
| activeTripId | DB read | ✅ `hasActiveTrip`, invalidate on NEW_TRIP |
| Provider freshness | `providerFetchedAt`, `sourceTimestamp` | ✅ Policy gates |

### 4.3 Kann Battery V2 vollständig aus Snapshot/Observation laufen?

**Teilweise — mit read-only Trip-State, ohne Trip-Events.**

| FSM Event | Aus Observation allein? | Zusätzlich benötigt |
|-----------|-------------------------|-------------------|
| `REST_SNAPSHOT` | ✅ Voltage + VLS + Policy | Offenes Session (CANDIDATE/RESTING) |
| `TRIP_ENDED` (CANDIDATE open) | ⚠️ Nicht aus Voltage allein | `lastActivityAt` + `tripEndAt` konsistent (≤120s), RESTING, kein active trip — aus **Det-State DB** |
| `NEW_TRIP_STARTED` / `WAKE_DETECTED` | ✅ Aus VLS + Det-State | — |
| `CHARGING_DETECTED` | ✅ Aus HV/LV charging heuristics | — |

**Kritischer FSM-Ablauf:** `REST_SNAPSHOT` allein **öffnet kein Fenster** (`reason: no_open_rest_window`). Es muss zuerst ein CANDIDATE via `TRIP_ENDED` (oder äquivalent) existieren.

**Fazit:** Vollständiger kanonischer Pfad braucht **internes** `TRIP_ENDED` — aber das kann aus **gelesenem** `vehicle_trip_detection_states` bei RESTING synthetisiert werden, nicht aus einem Trip-Domain-Event.

---

## 5. Need for TRIP_ENDED

### 5.1 Bewertung

| Option | Bewertung | Evidence |
|--------|-----------|----------|
| **A — zwingend erforderlich** | **Ja (FSM-intern)** | `reduceLvRestWindow`: `REST_SNAPSHOT` ohne offenes Fenster → `no_open_rest_window`; CANDIDATE nur via `TRIP_ENDED` case |
| **B — hilfreicher Accelerator** | Für **Trip-Domain-Event** | Kein externes Event existiert; Accelerator wäre nur „früherer CANDIDATE“ |
| **C — redundant** | Nur wenn CANDIDATE anders geöffnet wird | Kein alternativer „open candidate“ Event im Code |

### 5.2 Trip-Ende konsumieren vs. synthetisieren

| Frage | Antwort |
|-------|---------|
| Muss Battery **Trip-End-Domain-Events** konsumieren? | **Nein** — existieren nicht |
| Muss Battery **TRIP_ENDED FSM-Event** erzeugen? | **Ja** — für CANDIDATE |
| Kann das ohne Trip-Module-Änderung? | **Ja** — Det-State lesen bei `ingestObservationClassify`, `canOpenRestWindowCandidate` prüfen, `processEvent(TRIP_ENDED)` |

**Evidence:** Legacy `onSnapshot` nutzt bereits `vehicleTripDetectionState.state === RESTING` ohne Trip-End-Hook.

**Timing:** Synthetisches `TRIP_ENDED` erfolgt beim **ersten qualifying observation nach RESTING** — nicht synchron mit `processFinalize`. Das ist konsistent mit Legacy (opportunistische Rest-Capture).

---

## 6. Coupling Analysis

### Option A — Battery-only snapshot wiring

`ingestObservationClassify` → read Det-State + VLS → `processEvent(TRIP_ENDED|REST_SNAPSHOT|…)`

| Kriterium | Bewertung |
|-----------|-----------|
| Coupling | **Niedrig** — nur Battery-Module + read-only Prisma |
| Failure isolation | Hoch — FSM-Fehler isolierbar im `battery.v2` Handler |
| Idempotency | FSM `windowId` + Session `idempotencyKey` |
| Replayability | Observation jobs replayable; FSM dedup |
| Testability | Hoch — bestehende FSM specs + ingestion integration |
| Risk to Trip Detection | **Null** — keine Trip-Code-Änderung |
| Observability | Battery metrics (`recordBatteryRestWindow`) bereits vorgesehen |

### Option B — Subscribe to existing canonical trip event

**Nicht verfügbar** — kein Trip-End-Event-Bus.  
Surrogate: neuer Call in `processFinalize` wie `TripPostFinalizeAnalysisProducer` → **würde Trip-Orchestration ändern** (verboten in diesem Audit-Mandat).

### Option C — Direct `TripDetectionOrchestrationService` → Battery call

**Existiert nur für Trip START** (`batteryTripStartProducer.enqueueStartProxy`).  
Erweiterung auf Trip-End wäre synchrones Coupling + Trip-Datei-Änderung — **nicht empfohlen**.

### Vergleich

| | A Battery-only | B Event subscribe | C Direct call |
|--|----------------|-----------------|---------------|
| Trip-Detection-Risiko | Keins | Hook-Änderung nötig | Hook-Änderung nötig |
| Existierende Architektur | Passt zu Legacy read pattern | Kein Event vorhanden | Start-Proxy existiert |
| Empfehlung | **✅ Primär** | ❌ | ❌ |

---

## 7. LIVE_VOLTAGE Separation

### 7.1 Unabhängig vom FSM Wiring?

**Ja — weitgehend unabhängig.**

| Problem | Layer | FSM Wiring? |
|---------|-------|-------------|
| 0 `LIVE_VOLTAGE` in `battery_measurements` | **Kein Production-Writer** für `BatteryMeasurementType.LIVE_VOLTAGE` | Unabhängig |
| Capability `LIVE_VOLTAGE` = `QUERY_ERROR` | `BatteryCapabilityPreflightService` → DIMO GraphQL `fetchBatteryCapabilityPreflightSnapshot` | Unabhängig |
| `battery_health_snapshots` vorhanden | Legacy `onSnapshot` → `BatteryHealthService.recordSnapshot` | Legacy-Pfad, nicht `battery_measurements` |
| REST eval liest `LIVE_VOLTAGE` | `BatteryRestTargetEvaluationService.listLvVoltageCandidates` | **Downstream** — braucht Writer |

### 7.2 Trace Capability QUERY_ERROR

```
BatteryCapabilityRefreshService.enqueue → HV_CAPABILITY_REFRESH job
  → HvCapabilityRefreshHandler
  → BatteryCapabilityPreflightService.runForVehicle
  → DimoTelemetryService.fetchBatteryCapabilityPreflightSnapshot
  → on failure: status QUERY_ERROR in vehicle_battery_capabilities
```

Production: alle 6 LV-Fahrzeuge `LIVE_VOLTAGE` + `QUERY_ERROR` — DIMO Preflight-Query scheitert, nicht FSM.

### 7.3 Zwei getrennte Fixes

1. **FSM wiring** — `processEvent` aus Observation + Det-State read  
2. **Voltage evidence ingestion** — `LIVE_VOLTAGE` in `battery_measurements` bei NEW_OBSERVATION persistieren (oder REST eval auf `battery_health_snapshots` / inline snapshot — Architektur-Entscheidung)

**Nicht vermischen** in einem Deploy-Schritt, aber **beide** nötig für End-to-End REST target evaluation Qualität.

---

## 8. Recommended Integration Contract

### 8.1 `BatteryLvRestFsmIngress` (vorgeschlagener Name)

Battery-interner Contract — **kein** globaler Trip-Bus.

```typescript
// Conceptual — aligns with existing LvRestWindowEvent + LvRestWindowSignalContext
interface BatteryLvRestIngressInput {
  organizationId: string;
  vehicleId: string;
  observationAt: Date;           // classify receivedAt or LV observedAt
  snapshotContext: BatteryObservationSnapshotContext;
}

// Emitted internally to LvRestWindowStateMachineService.processEvent()
type BatteryLvRestFsmEvent = LvRestWindowEvent; // existing domain types
```

### 8.2 Event Types (bestehend, nicht neu erfinden)

| Type | Wann (Battery-intern) | Signal-Quelle |
|------|----------------------|---------------|
| `TRIP_ENDED` | Erstes qualifying sample nach RESTING-Anchor | Det-State read + `canOpenRestWindowCandidate` |
| `REST_SNAPSHOT` | Jede plausible LV observation während offenem Fenster | snapshotContext + VLS |
| `NEW_TRIP_STARTED` | `activeTripId` gesetzt / POSSIBLE_START | Det-State |
| `WAKE_DETECTED` | Wake voltage threshold | VLS |
| `CHARGING_DETECTED` | HV/LV charging context | snapshotContext + VLS |
| `PROVIDER_ERROR` | Missing/stale provider timestamp | Policy |

### 8.3 Transport

| Layer | Mechanism |
|-------|-----------|
| Ingress | Synchron innerhalb `BATTERY_OBSERVATION_CLASSIFY` handler (nach Legacy `onSnapshot` oder parallel) |
| FSM | `LvRestWindowStateMachineService.processEvent()` |
| REST scheduling | `BatteryV2RestTargetProducer` (shadow flag) |
| **Kein** neuer BullMQ-Trip-Event |

### 8.4 Idempotency & Timestamps

| Feld | Semantik |
|------|----------|
| Session key | `lv-rest:{vehicleId}:{lastActivityAtMs}` (`buildLvRestWindowIdempotencyKey`) |
| `event.at` | Observation `receivedAt` oder LV `observedAt` |
| `anchorAt` | `lastActivityAt` aus Det-State (TRIP_ENDED) |
| Dedup | FSM `duplicate_trip_end_event`, Session `createIdempotent` |

### 8.5 Error handling

- FSM-Fehler: im `battery.v2` Job retryable/non-retryable wie andere Handler
- Det-State read failure: skip FSM, Legacy unberührt
- Policy gate fail: `changed: false` — kein Session-Write

### 8.6 LIVE_VOLTAGE side contract (separat)

Bei `lvDecision.shouldPersist`: zusätzlich `BatteryMeasurementService.create` mit `type=LIVE_VOLTAGE` — **neuer Writer**, unabhängig von FSM-Transition.

---

## 9. No-Regression Boundary

**Unverändert (Trip Detection):**

- Trip start detection (`evaluateSnapshotForTripStart`, POSSIBLE_START, ACTIVE_TRIP)
- Trip end detection (POSSIBLE_END, END_VALIDATION, finalize heuristics)
- Trip Detection FSM / `TripDetectionState` transitions
- Thresholds, CUSUM, quality checks, cooldowns
- `TripDecisionEngine.finalizeTrip` / `discardTrip`
- Trip reconciliation segmentation
- `vehicle_trip_detection_states` write semantics
- Bestehende Consumer-Hooks (`TripPostFinalizeAnalysisProducer`, enrichment enqueue, `BatteryV2TripStartProducer`)

**Battery V2 darf:**

- `vehicle_trip_detection_states` **lesen**
- `vehicle_latest_states` **lesen**
- `vehicle_trips` **lesen** (completed trips)

**Battery V2 darf nicht:**

- Trip-Transitions aufrufen oder überschreiben
- Trip finalize timing ändern
- Trip tracking jobs modifizieren

---

## 10. Final Recommendation

### **BATTERY-ONLY WIRING RECOMMENDED**

Mit expliziter Klärung:

- **Kein** externes Trip-End-Event existiert zum Subscriben.
- FSM-`TRIP_ENDED` wird **battery-intern synthetisiert** aus read-only `vehicle_trip_detection_states` + Observation-Signalen — **ohne Trip-Detection-Code-Änderung**.
- `REST_SNAPSHOT` + invalidate Events laufen vollständig im Observation-Pfad.
- **Separater Fix** für `LIVE_VOLTAGE` persistence + Capability QUERY_ERROR.

**Nicht empfohlen:**

- Option B (kein Event-Bus)
- Option C für Trip-End (würde Trip-Orchestration ändern; nur Start existiert heute)

**Minimal invasiver Integration Point:**

`BatteryV2SnapshotIngestionService.ingestObservationClassify()` — neue Bridge nach LV-Block, nutzt `LvRestWindowStateMachineService.buildSignalFromLatestState()` + `processEvent()`.

---

## Verwandte Dokumente

- [`lv-rest-window-production-root-cause-2026-08.md`](./lv-rest-window-production-root-cause-2026-08.md)
- [`battery-v2-job-callsite-matrix.md`](./battery-v2-job-callsite-matrix.md)
- [`architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`](../../architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md)

## Changes / Architektur

| Dokument | Updated |
|----------|---------|
| Synqdrive Code → Changes | **Yes** (Phase 1 implementation) |
| Synqdrive Code → Architektur | **Yes** (Phase 1 implementation) |

---

## Appendix A — Phase 1 Implementation (2026-08-26)

### Wiring point

`BatteryV2SnapshotIngestionService.ingestObservationClassify()` invokes `LvRestWindowIngestionBridgeService.processObservationCycle()` **before** legacy `BatteryV2Service.onSnapshot()`.

Bridge implementation: `lv-rest-window/lv-rest-window-ingestion-bridge.service.ts`.

### Event sequence (per observation classify cycle)

When `BATTERY_V2_REST_SHADOW_ENABLED=true`:

1. `buildSignalFromLatestState(vehicleId, snapshot overrides)` — read-only `vehicle_latest_states` + `vehicle_trip_detection_states`
2. Invalidate events (only if open window exists): `NEW_TRIP_STARTED` → `CHARGING_DETECTED` → `WAKE_DETECTED`
3. Internal `TRIP_ENDED` when `vehicle_trip_detection_states.state === RESTING`, `activeTripId` null, anchors from `lastActivityAt`
4. `REST_SNAPSHOT` when plausible LV voltage (9–16 V) in snapshot context

`TRIP_ENDED` always precedes `REST_SNAPSHOT` in the same cycle.

### Internal TRIP_ENDED derivation

Not from Trip Detection events. Synthesized when persisted det state is `RESTING` with `lastActivityAt` anchor; `tripEndAt` and `lastActivityAt` set to that anchor; `hasActiveTrip=false`. FSM gate `canOpenRestWindowCandidate()` applies unchanged.

### Idempotency

- FSM: `duplicate_trip_end_event` when same `windowId` (`lv-rest:{vehicleId}:{anchorMs}`)
- Session persistence: `BatteryMeasurementSessionRepository.createIdempotent` on `idempotencyKey`
- Repeated observation cycles may re-invoke `processEvent(TRIP_ENDED)`; duplicate sessions are not created

### Feature flags

| Flag | Behavior |
|------|----------|
| `BATTERY_V2_REST_SHADOW_ENABLED=false` | Bridge returns immediately — no FSM calls |
| `BATTERY_V2_REST_SHADOW_ENABLED=true` | Canonical FSM runs; REST target scheduling inside FSM still gated by same flag |
| `BATTERY_V2_PUBLICATION_ENABLED` | Unchanged — not enabled by this PR |
| `BATTERY_V2_READINESS_ENABLED` | Unchanged |
| `BATTERY_V2_RECONCILIATION_ENABLED` | Unchanged |

### Legacy coexistence

- **Legacy:** `BatteryV2Service.onSnapshot()` → `battery_features` (rest capture after 60m/6h thresholds)
- **Canonical:** FSM → `battery_measurement_sessions` (`LV_REST_WINDOW`)
- **No double-write** on same table; parallel paths until legacy removal phase
- Legacy `onSnapshot` continues unchanged after bridge call

### Trip Detection boundary

Bridge uses **read-only** `vehicleTripDetectionState.findUnique`. No Trip Detection files modified.

### Tests executed

```bash
npm test -- --testPathPattern="lv-rest-window|battery-v2-snapshot-ingestion|battery-rest-target"
```

Result: **11 suites, 83 tests passed**

### Files changed

| File | Change |
|------|--------|
| `lv-rest-window/lv-rest-window-ingestion-bridge.service.ts` | New bridge |
| `lv-rest-window/lv-rest-window-ingestion-bridge.service.spec.ts` | Bridge unit tests |
| `lv-rest-window/lv-rest-window-ingestion-bridge.fsm.spec.ts` | FSM integration tests |
| `jobs/battery-v2-snapshot-ingestion.service.ts` | Wire bridge |
| `jobs/battery-v2-snapshot-ingestion.service.spec.ts` | Legacy + bridge tests |
| `vehicle-intelligence.module.ts` | Register/export bridge |
| `architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md` | Ingestion wiring note |
| `docs/audits/battery-v2-integration-point-audit-2026-08.md` | This appendix |

### Deferred (Phase 2)

- `LIVE_VOLTAGE` capability QUERY_ERROR
- DIMO GraphQL preflight / canonical `battery_measurements` writer
- Legacy rest removal / historical job replay / backfill
