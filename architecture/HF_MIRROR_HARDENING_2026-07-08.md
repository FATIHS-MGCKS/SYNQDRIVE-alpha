# Changes & Architektur — HF Mirror Hardening (2026-07-08)

## Changes (V4.9.258)

- `clickhouse-env.util.ts` — shared `HF_MIRROR_ENABLED` flag (default off).
- `HfMirrorService` — ClickHouse availability guard, `bookingId` from `VehicleTrip.assignedBookingId`, skip metrics, full point/event context.
- `TripMetricsService` — `synqdrive_hf_mirror_enabled` gauge, `synqdrive_hf_mirror_skipped_total{reason}` counter.
- Enrichment passes `bookingId` into mirror; nullable when unassigned (no guessing).

## Architektur

### Boundary

- HF mirror = **analytics evidence** in ClickHouse only.
- PostgreSQL (`VehicleTrip`, abuse events, scores) stays canonical.
- Mirror is **fire-and-forget**, never throws into enrichment.

### Context fields (telemetry_hf_points / telemetry_hf_events)

| Field | Source |
|-------|--------|
| `org_id` | `Vehicle.organizationId` |
| `vehicle_id` | `VehicleTrip.vehicleId` |
| `token_id` | `DimoVehicle.tokenId` |
| `trip_id` | `VehicleTrip.id` |
| `booking_id` | `VehicleTrip.assignedBookingId` (nullable) |
| `source` | `'dimo'` (default) |
| `signal_name` / `signal_group` | DIMO HF reading mapping |
| `recorded_at` | reading timestamp |
| `value_*` / `unit` / `quality` | normalized point |

### Idempotency

- **Points**: `hasTripHfPoints(vehicleId, tripId)` before insert (append-only MergeTree).
- **Events**: ReplacingMergeTree `(org, vehicle, event_type, event_start)` — re-insert safe.

### Metrics (low cardinality)

| Metric | Labels |
|--------|--------|
| `synqdrive_hf_mirror_enabled` | none |
| `synqdrive_hf_mirror_skipped_total` | `reason` = disabled \| unavailable \| no_org \| no_readings \| no_points \| error \| points_already_mirrored |
| `synqdrive_clickhouse_hf_points_inserted_total` | none |
| `synqdrive_clickhouse_hf_events_inserted_total` | none |

No vehicle/booking/trip/org labels on HF mirror metrics.
