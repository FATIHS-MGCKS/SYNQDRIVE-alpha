# Inventar — Beschleunigungs-/Bremsereignis-Detektoren (Code-Stand `main` `579ee8b2`, 2026-10-23)

Alle Pfade relativ zu `backend/src/modules/vehicle-intelligence/`. Nur Bestand; keine Änderung.

## 1. Pfade, die Beschleunigungs-/Bremsereignisse erzeugen

| # | Pfad | Eingang | Schwellen | Ausgabe / Konsument | Produktionsstatus |
| --- | --- | --- | --- | --- | --- |
| **A** | `driving-intelligence/core/kinematics/motion-event-detector.ts` → `detectMotionManoeuvreEvents` | C4-Geschwindigkeitsserie `MotionCoreSpeedSample[]` (1 Hz Bucket-Labels, Qualität, Flags) | `MOTION_EVENT_HF_THRESHOLDS_V1` (identisch zu B/C), `MOTION_CORE_EVENT_GUARDS_V0_1_DEV`, K3 `spikeReversionCheck` | `MotionManoeuvreEvent` (kind ACCELERATION/DECELERATION, start/end label, Start-/Endgeschw., Δv ≥ 0 als Betrag, mean/peak1s/peak2s, Dauer, Schritte, Abdeckung, Qualität OK/DEGRADED/LIMITED/ARTEFACT_SUSPECT, Flags). Persistiert in `di_v0_motion_core_shadow_runs_v1.payload_gzip` → `events[]` (reduzierte Zeilen ohne Dauer/Peak, `mapMotionManoeuvreEventToPersisted`), Summary `eventAcceptedCount`/`eventArtefactSuspectCount`; gelesen über `di-v0-motion-core-shadow-trip-map-read.mapper.ts` (`artefactSuspect`) | **Aktiv in Produktion als Shadow** (Motion-Core-Shadow-Worker, Pilot-Allowlist; 21 Läufe seit Deploy `579ee8b2`, siehe `PRODUCTION_RUN_EVIDENCE.md`). Keine Kundenfläche, kein Scoring. |
| **B** | `trips/hf-acceleration.ts` → `detectAccelerationEvents` | `CleanHfPoint[]` (DIMO-HF-Signale nach `hf-preprocessing.ts`: ts, speedKmh/speedMs, rpm, throttle, …), segmentiert durch `splitByGaps` | ENTRY 1,5 / CONTINUE 1,2 m/s²; MIN_SAMPLE_COUNT 2; MIN_DELTA 4,0 km/h; Merge < 2000 ms; Klassen MODERATE 2,5 / HARD 3,5 / EXTREME 5,0 | `AccelerationEvent` (+ Klassifikation, maxThrottle, maxRpm, mergedCount) → `trip-behavior-enrichment.service.ts` (Z. 416) und `reference-capture/reference-capture-rd004-a-segment-a.ts` (Z. 998) | Legacy-Trip-Enrichment (DIMO-HF). **Nicht** von DS4-Geschwindigkeit gespeist; für die vier Referenzfahrten keine gepinnten HF-Eingaben → in dieser Auswertung nur inventarisiert. |
| **C** | `trips/hf-braking.ts` → `detectBrakingEvents` | wie B | ENTRY 1,5 / CONTINUE 1,2 m/s²; MIN_SAMPLE_COUNT 2; MIN_DELTA 3,0 km/h; Merge < 1500 ms; Klassen MODERATE 2,8 / HARD 4,5 / EXTREME 7,0; HIGH_SPEED ≥ 80 km/h | `BrakingEvent` (+ intensity, highSpeedStart, Klassifikation) → wie B; zusätzlich `driving-impact/*` (Belastungskomponenten, Provenienz) | wie B |
| — | `driving-intelligence-v2/driving-intelligence-v2-canonical-design.ts` | — | dokumentiert B/C-Schwellen (Z. 803–820) | Design-Registry, keine Laufzeit | — |

Vorzeichenkonvention A: `deltaKmh = sign · (v_end − v_start)` mit sign = +1 (ACCELERATION) / −1 (DECELERATION),
also **Betrag + Richtung über `kind`** (Legacy-Punkt A der Geschwindigkeitsauswertung: 21/21 gespeicherte Ereignisse
konsistent, keine Rückwirkung auf `speeds[]`/`fsmLabels[]`).

## 2. Verdrahtung von Pfad A im Shadow-Prozessor (`motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts`)

```
kinBuckets = withImplausibleLegEndpointsQuarantined(evidence.buckets)   // nur FSM-Sicht
c4        = computeC4AdaptiveL3(evidence.buckets)                        // Leg-Quarantäne intern (detectImplausibleOneSecondLeg*)
fsmLabels = runMotionFsm(kinBuckets, c4, 'RETROSPECTIVE', motionFsmSparseVehicleSpeedFromR1(…)=null-Pfad, V0_2 params, V0_3 options)
events    = detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', GUARDS_V0_1.usableQualities, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS)
```

- Der Detektor sieht **nur C4** (kein FSM, kein OBD-Speed, keine Positionsrohdaten). Stillstandswissen der FSM fließt
  nicht in Ereignisgrenzen ein.
- `usableQualities` schließt `OUTLIER_REJECTED`, `FROZEN_POSITION` und `null`-Werte aus → Segmentbruch, wenn die
  Lücke > `maxGapS` (2 s). Lücken ≤ 2 s werden **innerhalb** eines Segments überbrückt; der 1-s-Schritt wird dann über
  `dt` (2–3 s) gemittelt.
- `postGapGuardS = 2`: ein Ereignis darf frühestens 2 s nach Segmentbeginn starten. Für das Segment**ende** gibt es
  **keine** symmetrische Sperre — ein Ereignis darf bis zur letzten nutzbaren Sekunde laufen.
- Ereignisqualität: `OK` nur wenn alle Samples `OK`; `JITTER_SUSPECT`/`REPAIRED` → `DEGRADED`; sonst (`SPARSE_SUPPORT`,
  `SPAN_*`) → `LIMITED`. **Keine** Qualität führt zum Ausschluss; nur K3 (`ARTEFACT_SUSPECT`) wird aus
  `eventAcceptedCount` herausgerechnet.
- Keine Plausibilitätsschranke für Δv/Mittel/Peak (ein 5,5 → 100,1 km/h in 4 s wird als `LIMITED` akzeptiert).

## 3. Steuerungs- und Ausführungspfad in Produktion (Pfad A)

| Element | Code | Wirksamer Default |
| --- | --- | --- |
| Flags | `DI_V0_MOTION_CORE_SHADOW_ENABLED`, `DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED` (`di-v0-motion-core-shadow-control-plane.ts`), `…_ENABLED_SINCE` (Pflicht, ISO-8601), `…_BATCH_LIMIT` (Default 10, max 50), Org-/Vehicle-Allowlist (leer → fail-closed) | beide Flags müssen `true` sein |
| Auslöser | `DiV0MotionCoreShadowScheduler.onModuleInit` → `setInterval(tick, 90 000 ms)` **sobald** `service.isConfigured()`; `tick` läuft nur auf dem Scheduler-Leader (`SchedulerLeaderGuardService.shouldRun('di_v0_motion_core_shadow_v1')`) | **Es gibt keine Variable `DI_V0_MOTION_CORE_SHADOW_SCHEDULER_ENABLED` im Code** (`rg` über `backend/` leer). Der Scheduler ist implizit aktiv, wenn Shadow + Worker aktiv und `ENABLED_SINCE` gesetzt sind. „Scheduler unset“ ist daher kein Zustand, der einen Lauf verhindert. |
| Pass | `service.runPass()`: Discovery abgeschlossener S4-Work-Items ≥ `ENABLED_SINCE` innerhalb Allowlist → Outbox-Claim (Lease 5 min) → `processDiV0MotionCoreShadowTrip` → `insertSucceeded` (idempotent über Intent-Key = Bundle-Version | Snapshot-Hash | Combined-Input-Identity) | neue Bundle-Version ⇒ neue Intent-Keys ⇒ Neuberechnung aller zulässigen Trips nach Deploy |

## 4. Was es nicht gibt (Stand `579ee8b2`)

- Keine Ereignisableitung aus FSM-Zuständen, aus Positionsrohdaten oder aus OBD-Speed im DS4-Pfad.
- Keine fahrzeugklassenabhängige Plausibilitätsprüfung; keine Symmetrie zur `postGapGuardS` am Segmentende.
- Keine Verschleiß-/Belastungs-Scores auf Basis von Pfad A (Pfad B/C speisen `driving-impact`, außerhalb dieses Scopes).
