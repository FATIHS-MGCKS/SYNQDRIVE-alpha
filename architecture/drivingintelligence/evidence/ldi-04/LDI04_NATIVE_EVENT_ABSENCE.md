# LDI04 — Native event absence

**Pin trip:** `f502a4a0-02d2-421d-bb39-7c9af25ba38e` · **Vehicle:** `19fedd4b-c4e8-4de8-a125-dab293326e7e`

## Observed fact (LDI-03 read-only DB export)

- `DrivingEvent` count in acquisition window: **0** (including `tripId` null + vehicle time filter).
- All **8** frozen-manifest Ruptela candidates scored **0** native events in-window (see `LDI03_TRIP_SELECTION.md`).

## Code path (ingestion → persistence)

1. **Fetch:** `LteR1BehaviorEnrichmentService.enrichTrip` → `DimoSegmentsService.fetchDrivingEvents()` with `driving-events.query.ts` (`behavior.harsh*` names).
2. **Map:** `mapDimoNativeDrivingEvent` → `DrivingEvent` rows (`source = TELEMETRY_EVENTS`).
3. **Persist:** `DimoNativeDrivingEventPersistenceService` (idempotent, org-scoped fingerprint).
4. **Trip link:** `tripId` set when enrichment runs post-trip completion; LDI-03 also searched `tripId: null` in window.

## Skip / zero-event gates (belegbar)

| Gate | Relevance to this pin |
|------|------------------------|
| Trip `endTime` required | Trip completed (pinned work item) — **pass** |
| `MIN_TRIP_DURATION_MS` (60 s) | ~18 min drive — **pass** |
| DIMO token / vehicle | Vehicle in org manifest — **assumed pass** (POSITION/R1 pin succeeded) |
| `assessZeroNativeEventsConduct` | Provider may return **zero** harsh events on calm drives — **plausible** |
| S4 `NATIVE_EVENT` channel | Separate from `DrivingEvent` table; pin can have POSITION+R1 without native channel events in DB |
| Feature flags `DI_V0_S4_NATIVE_ENABLED` | Controls S4 acquisition, not retroactive `DrivingEvent` backfill for this historical pin |

## Most likely explanation (epistemic: INFERRED)

1. **No harsh provider events** on this trip (smooth driving — consistent with zero overlap assessability).
2. **Enrichment not re-run** for this historical trip window before pin — DB simply has no rows (cannot prove without job logs).
3. **Not** evidence of ingestion disabled globally — other LTE_R1 paths exist; this trip lacks rows in-window.

## Explicit non-claims

- No synthetic native events were created.
- No provider API was called for LDI-04.