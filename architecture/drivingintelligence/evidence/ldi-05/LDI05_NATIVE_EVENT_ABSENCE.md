# LDI05 — Native event absence (8 manifest Ruptela trips)

**Audit:** `LDI05_HISTORICAL_EVENT_AUDIT.json` (Production DB read-only, 2026-10-16).

## Question

Why did LDI-03 find **zero** `DrivingEvent` rows (`source = TELEMETRY_EVENTS`) for all eight frozen-manifest Ruptela trips?

## Answer (belegbar)

| Finding | Evidence |
|---------|----------|
| Pipeline **did run** | Every manifest trip has `behaviorEnrichedAt` set; `DRIVING_NATIVE_EVENTS_INGEST` jobs **COMPLETED** (e.g. `f502a4a0` ×3 jobs); `NATIVE_EVENTS` analysis stages **COMPLETED** |
| Provider returned **no samples** for those windows | `dimoBrakingIntakeRows = 0` per trip; `telemetryEventsInTripWindow = 0`; trip harsh counters = 0 |
| **Not** a tripId filter artifact alone | Same zero with `tripId` match **and** `recordedAt` within `VehicleTrip.startTime`–`endTime` |
| Fleet **does** persist native events elsewhere | **960** `TELEMETRY_EVENTS` on Ruptela vehicles org-wide; **820** on `19fedd4b…`, **140** on `8c850ff1…`, **0** on `c10351f8…` (Tiguan #2) |
| Manifest trips are **not** the trips that carry events | All 960 rows have `tripId` **outside** the eight manifest IDs (`eventsNotOnManifestTripIds` = total per vehicle) |
| Latest native event before several manifest drives | e.g. `19fedd4b` latest `recordedAt` **2026-10-10T18:51:49Z** on trip `3a45e2d5…`; manifest `f502a4a0` starts **2026-10-14** |

## Epistemic classification

- **CONFIRMED:** Ingestion orchestration executed; zero provider events ingested for these eight trip time windows.
- **CONFIRMED:** Persistence layer works for other trips on the same org/vehicles.
- **INFERRED:** Calm driving / no `behavior.harsh*` triggers on these eight segments (consistent with zero intake).
- **UNKNOWN without provider call:** DIMO `dataSummary` event counts for each exact window (explicitly not queried in LDI-05).

## Ruled out (for these eight pins)

- Missing LTE_R1 enrichment code path — **refuted** (jobs completed).
- S4 `NATIVE_EVENT` channel disabled — explains S4 pin only; does not block `DrivingEvent` table when ingest runs.
- Trip assignment dropping rows — **no rows to assign** in-window.

## LDI-03 acquisition window note

LDI-03 combined pin used S4 acquisition end **19:22:10Z**; DB `VehicleTrip.endTime` for `f502a4a0` is **19:31:00Z**. Widening to full DB trip bounds still yields **0** events — absence is not a narrow LDI-03 filter alone.
