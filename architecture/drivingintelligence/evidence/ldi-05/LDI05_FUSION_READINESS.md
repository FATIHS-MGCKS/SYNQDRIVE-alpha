# LDI05 — Four-stream fusion readiness

**Primary motion:** GPS-L3 (unchanged). **OBD:** witness only, no fallback (LDI-04).

| Stream | LDI-03 pin | Blocker |
|--------|------------|---------|
| GPS-L3/QC | ~87% trusted | — |
| HF/OBD 1 Hz subset | ~10% sparse | INTERVAL_ONLY |
| Native DrivingEvent | **0** in all 8 windows | See `LDI05_HISTORICAL_EVENT_AUDIT.json` |

**Missing for four-channel fusion:** native `DrivingEvent` rows on the **same** trip/time surface as LDI-03 (GPS-L3 + R1 pin). Org has native data on **other** trips; manifest eight have **provider-zero** harsh windows with ingest **confirmed complete**.

**Recommended pin strategy:** Select a trip where `telemetryEventsInTripWindow > 0` (see `vehicleWide` in audit JSON), then re-run LDI-03 combined export on that trip.

**Not in scope:** harsh threshold tuning, regen from braking.