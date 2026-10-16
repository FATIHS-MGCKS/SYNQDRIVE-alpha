# LDI05 — Pipeline trace

**HEAD:** `c1013265bc10af7ac5fe7e86ff372772373acd36` · **READ_ONLY**

## End-to-end path

| Step | Component | Evidence |
|------|-----------|----------|
| 1 Source | `backend/src/modules/dimo/queries/driving-events.query.ts` | `behavior.harshBraking`, `harshAcceleration`, `harshCornering`, `extremeBraking` |
| 2 Fetch | `DimoBrakingEventIntakeService.fetchDrivingEventsPaginated` | Called from `LteR1BehaviorEnrichmentService.enrichTrip` |
| 3 Capability gate | `assessDimoBrakingCapability` + `fetchEventDataSummary` | Skip entire enrich if `!capability.allowed` |
| 4 Intake ledger | `ingestBrakingBatch` → `dimo_braking_event_intake` | Separate from `DrivingEvent` |
| 5 Normalize | `mapDimoNativeDrivingEvent` / `mapToNormalizedEvents` | `dimo-native-driving-event-mapper.ts` |
| 6 Persist | `DimoNativeDrivingEventPersistenceService.upsertNativeEvents` | Fingerprint upsert, `source=TELEMETRY_EVENTS` |
| 7 Trip link | `reconcileUnassignedEvents` + trip-scoped upsert | `tripId` on `DrivingEvent` |
| 8 Orchestration A | `TripBehaviorEnrichmentService.enrichTripLteR1` → `lteR1.enrichTrip` | Post-trip HF queue path |
| 9 Orchestration B | `DRIVING_NATIVE_EVENTS_INGEST` job → `DrivingNativeEventsIngestJobHandler` | Stage `NATIVE_EVENTS` after `SEGMENT_VALIDATE` |
| 10 Read API | `unified-behavior-read-model.ts` / trip analytics | Maps `DrivingEvent` rows |

## Gates (skip / zero)

- Missing `endTime`, `<60s` trip, missing DIMO token → `enrichTrip` returns null
- Braking capability not allowed → null (no provider fetch for events)
- Zero provider samples → persist empty batch; `assessZeroNativeEventsConduct` → `supported_but_zero_events`

## S4 native channel (separate)

`DI_V0_S4_NATIVE_ENABLED` controls S4 evidence pin — **not** the same table as `DrivingEvent` (LDI-03 pin used POSITION+R1).