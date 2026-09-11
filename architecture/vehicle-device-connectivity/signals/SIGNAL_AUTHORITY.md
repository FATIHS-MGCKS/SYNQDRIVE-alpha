# Vehicle & Device Connectivity — Signal & Timestamp Authority (Phase 1)

**Epistemic:** CONFIRMED from repository code (2026-09-11 Phase 1 audit)  
**Production validation:** PENDING Phase 2

## Purpose

Canonical matrix of **every timestamp** used to infer vehicle/device connectivity or freshness in current SynqDrive code. This documents repository truth only — not ideal design.

## Timestamp authority matrix

| Timestamp field | Typical storage | Semantic meaning | Writer | Primary readers | Proves new device data? | Proves provider poll success? | Can advance while source stale? | Misuse risk |
|-----------------|-----------------|------------------|--------|-----------------|-------------------------|-------------------------------|--------------------------------|-------------|
| `signalsLatest.lastSeen` (DIMO) | VLS `source_timestamp`, `last_seen_at` | Provider-reported latest observation instant for snapshot bundle | `dimo-snapshot.processor` `normalizeSnapshot()` | `telemetry-freshness.resolver`, runtime assembler, ClickHouse `recorded_at` | **Yes** (when monotonic guard accepts) | Indirectly (only if provider returns newer value) | No — monotonic guard blocks regression | Treating poll success as new data when `lastSeen` unchanged |
| Individual signal `.timestamp` | `raw_payload_json` | Per-signal observation time inside bundle | DIMO provider | AI mapper, forensic analysis | Partial — signal may lag `lastSeen` | No | N/A | Assuming all signals refresh with `lastSeen` (see VDC-HYP-004) |
| `sourceTimestamp` (VLS) | `vehicle_latest_states.source_timestamp` | Canonical provider observation time persisted | Snapshot processor upsert | Freshness resolver priority #1 | **Yes** when updated | No | `providerFetchedAt` can advance alone | Confusing with ingest time |
| `providerFetchedAt` (VLS) | `vehicle_latest_states.provider_fetched_at` | SynqDrive receipt time after successful provider HTTP fetch | Snapshot processor (always on success path) | Diagnostic state (`connectivity-diagnostic-state.ts`) | **No** | **Yes** | **Yes** — updated even when monotonic skip | Treating as freshness / reconnect evidence |
| `lastSignal` | `dimo_vehicles.last_signal` | DIMO mirror of last signal time | DIMO sync services | Freshness resolver priority #4; operational list | Weak — mirror may lag VLS | No | Can diverge from `sourceTimestamp` | Operational view uses reduced evidence set (VDC-GAP-010) |
| `last_seen_at` / `updatedAt` (VLS) | `vehicle_latest_states` | Normalized observation / row update | Snapshot processor, Prisma `@updatedAt` | Freshness fallback #5 | Low trust for `updatedAt` | No | Yes for `updatedAt` | Using row update as device activity |
| `receivedAt` (ingest) | Passed to resolver as `receivedAt` | Ingest/poll completion instant | Snapshot processor | Freshness resolver #3 with 15 min backfill guard | No | Yes | Can advance under stale source | Backfill rejuvenation (guarded) |
| Webhook `observed_at` | `dimo_device_connection_events.observed_at` | Provider-claimed event time | Webhook inbox → processing | Episode open/resolve ordering | Event-specific (plug/unplug) | No | N/A | Equating webhook time with telemetry freshness |
| Webhook `received_at` | inbox + event tables | SynqDrive webhook receipt | Inbox intake | Dedup, ordering tie-break | No | Yes (delivery) | N/A | |
| Episode `opened_at` / `resolved_at` | `device_connection_episodes` | Unplug episode lifecycle | `DeviceConnectionEpisodeService` | Runtime projection, alerts, UI | Disconnect/reconnect episodes | No | N/A | `!openEpisode` ≠ no unplug (VDC-CX-007) |
| Poll `started_at` / `finished_at` | `dimo_poll_logs` | Scheduler/worker poll lifecycle | Snapshot processor | Ops attention (6h stale pipeline), forensics | No | **Yes** | Always on poll | 839 successful polls vs 3 new source timestamps pattern (VDC-HYP-003) |
| ClickHouse `recorded_at` | `telemetry_snapshots` | Provider observation = `lastSeenAt` at ingest | `clickhouse-telemetry.service` | Historical queries, forensics | At insert time | No | Duplicate skip on `(vehicle_id, recorded_at)` | Equality allows re-insert attempts → `skipped_duplicate` |
| CH `telemetry_state_changes.changed_at` | state change table | Same as snapshot `recorded_at` for edge detection | ClickHouse service | Motion/ignition history | Derived | No | Append-only, no dedup | |
| HM `last_received_at` | `hm_latest_telemetry_states` | MQTT ingest receipt | HM ingestion service | HM health views only | HM path only | Stream delivery | **Not** wired to VDC runtime | HM-only vehicles lack canonical runtime (VDC-GAP-009) |
| `synced_at` (dimo_vehicles) | `dimo_vehicles` | Identity/metadata sync housekeeping | Vehicle sync worker | Admin listings | No | Sync success | Yes | |

## Monotonic guard (VW-F-008)

**File:** `backend/src/modules/dimo/vls-monotonic-merge.util.ts`

| Relation | `isIncomingVlsSourceTimestampStale` | VLS telemetry update | `providerFetchedAt` update |
|----------|--------------------------------------|----------------------|----------------------------|
| `incoming < existing` | `true` | **Skipped** | **Yes** |
| `incoming == existing` | `false` | **Applied** (full upsert) | Yes |
| `incoming > existing` | `false` | Applied | Yes |
| `incoming` null | `false` | Applied | Yes |
| `existing` null | `false` | Applied | Yes |

**Defect candidate (documented, not fixed):** equality (`==`) is **not** treated as duplicate/stale — repeated provider responses with identical `lastSeen` still run full VLS upsert and downstream episode/trip side effects. ClickHouse insert separately dedupes on `(vehicle_id, recorded_at)`.

## Evidence classes (current code usage)

See [../lifecycle/EVIDENCE_HIERARCHY.md](../lifecycle/EVIDENCE_HIERARCHY.md).

## Related documents

- [FRESHNESS_SEMANTICS.md](./FRESHNESS_SEMANTICS.md)
- [../operations/POLLING_AND_SCHEDULERS.md](../operations/POLLING_AND_SCHEDULERS.md)
- [../evidence/REPOSITORY_INVENTORY.md](../evidence/REPOSITORY_INVENTORY.md)
