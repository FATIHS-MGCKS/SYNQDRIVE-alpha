# HF Windows Producer + Signal Quality Read Service (2026-07-08)

## Scope (V4.9.261)

Activates `telemetry_hf_windows` as a post-trip HF mirror producer and exposes a
read-only `SignalQualityReadService` for diagnostics. No canonical trip scores
are written to ClickHouse.

## Window definition

- **Bucket size:** 60 seconds (`HF_WINDOW_SIZE_MS`)
  - Post-trip HF is ~1 Hz → ~60 samples/window
  - Halves row volume vs 30s; aligns with snapshot-tier granularity
  - Gap detection threshold: 3s on speed stream
- **One row per** `(org_id, vehicle_id, window_start, signal_group)`
- **ReplacingMergeTree(computed_at)** — re-enrichment replaces prior rows (no duplicate flood)
- **Migration 005:** additive `trip_id`, `booking_id`, `coverage`, `stats_json`

### Per-window aggregates

| Field | Source |
|-------|--------|
| `point_count` | HF points in group/window |
| `max_speed_kmh`, accel min/max | speed group |
| `max/min_traction_kw` | powertrain/battery |
| `soc_delta_pct`, `socCount` in stats_json | battery group |
| `gps_point_count` | gps group |
| `missing_gap_count`, `largest_gap_ms` | speed cadence gaps >3s |
| `coverage` | good / medium / weak / unavailable |
| `stats_json` | per-signal counts + rpm/throttle/load min/max/avg |

## Producer hook

`HfMirrorService.mirrorTripHf()` → `buildHfWindowSummaries()` → `insertHfWindows()`
- Gated by `HF_MIRROR_ENABLED` (same as points/events)
- Windows rebuilt even when points already mirrored (idempotent replace)
- Built from in-memory HF points — no extra CH scan

## Signal quality (read-only)

`SignalQualityReadService.getTripSignalQuality()`:

| Output | Rule |
|--------|------|
| `overallQuality` | good / medium / weak / unavailable from speed-window coverage |
| `hfAvailability` | hf_available / sparse / missing / unknown |
| `signalCoverage` | aggregated point/window counts per group |
| `missingKeySignals` | rpm/throttle/coolant/load when ICE profile expects them |
| `detectorFeasibilityHints` | `assessDetectorFeasibility()` from hf-abuse (read-only) |
| `reasons` | human-readable evidence list |

**Not stored** — returned on demand only. Data Analyse shows latest completed trip
under internal debug (read-only, degraded when CH down).

## Endpoints (internal debug)

- `GET .../data-analyse/vehicles/:vehicleId/signal-quality/latest`
- `GET .../data-analyse/vehicles/:vehicleId/trips/:tripId/signal-quality`
