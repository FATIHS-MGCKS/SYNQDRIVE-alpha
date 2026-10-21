# High Mobility — Bounded Connectivity Repository Audit (Phase 1)

**Status:** `NOT_STARTED` registry module — this document captures **existing code** only.

## What exists today

| Layer | Path / model | Role |
|-------|--------------|------|
| Vehicle registry | `high_mobility_vehicles` | Clearance, streaming state |
| Stream ingest | `high-mobility-telemetry-ingestion.service.ts` | MQTT → `high_mobility_stream_sync_logs` |
| Latest telemetry | `hm_latest_telemetry_states` | `last_received_at` (ingest time) |
| Latest health | `hm_latest_health_states` | Per VIN + container |
| Signal freshness | `high-mobility-signal-usage.service.ts` | Per-group windows (e.g. SERVICE 24h/72h, TIRE 6h/24h) |
| Routing | `high-mobility-telemetry-routing.service.ts` | **Phase 2 stubs** — no VLS/ClickHouse/runtime |
| Health polling | `hm-health-polling.scheduler.ts` | 5 min check |

## Structural differences vs DIMO

| Dimension | DIMO | High Mobility (current) |
|-----------|------|-------------------------|
| Transport | Poll + webhooks | MQTT stream |
| Canonical row | `vehicle_latest_states` | `hm_latest_telemetry_states` |
| Historical mirror | ClickHouse `telemetry_snapshots` | **None** |
| Device episodes | Full stack | **None** |
| Runtime projection | `VehicleConnectivityRuntimeStateBuilder` | **Not integrated** — assembler `sourceType: DIMO \| NONE` only |
| Freshness | Unified 15m/24h/48h | Per-signal-group HM windows |
| Connectivity alerts | `connectivity-alert` service | Health summary strings only |
| Trip boundaries | DIMO Segments | Separate architecture (not audited here) |

## VDC implications

- Phase 1 canonical connectivity runtime is **DIMO-centric** (VDC-GAP-009).
- HM-only vehicles lack `connectivityRuntime` with HM telemetry timestamps.
- Future HM provider profile must not assume DIMO episode/webhook model.

## Retention

- Stream sync logs: 14d
- Health sync logs: 30d (`retention.config.ts`)

## Phase 2 questions

- Does HM expose provider connection status equivalent to `connectionStatus`?
- Can HM `last_received_at` map to `providerFetchedAt` vs `sourceTimestamp` split?
- Production HM fleet connectivity UX expectations?
