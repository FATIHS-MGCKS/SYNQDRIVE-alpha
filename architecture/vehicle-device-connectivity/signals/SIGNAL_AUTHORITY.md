# Vehicle & Device Connectivity — Signal & Timestamp Authority (Phase 1)

**Epistemic:** CONFIRMED from repository code (2026-09-11 Phase 1 audit)  
**Production validation:** PENDING Phase 2

## Purpose

Canonical matrix of **every timestamp** used to infer vehicle/device connectivity or freshness in current SynqDrive code. This documents repository truth only — not ideal design.

## Source-advance definition (Phase 1 repository truth)

Monotonic guard acceptance **does not** mean new device/source evidence.

| Comparison | Repository behavior | Proves new source/device evidence? |
|------------|---------------------|-----------------------------------|
| `incoming < existing` | Regression / **stale** — VLS telemetry skipped; `providerFetchedAt` still updates | **No** |
| `incoming == existing` | Duplicate source timestamp **accepted** — full VLS upsert proceeds; downstream side effects may run (**VDC-CX-010**) | **No** — equality does not prove advance |
| `incoming > existing` | **Strict source advance** — strongest current proof of a new provider/device observation instant | **Yes** (observation instant moved forward) |
| `incoming` null | Upsert path may accept; missing incoming is **not** stale per guard | **No** — absence is not advance proof |

**Do not equate** “monotonic guard accepted” or “full upsert proceeded” with new source/device data unless `incoming > existing`.

## Timestamp authority matrix

| Timestamp field | Typical storage | Semantic meaning | Writer | Primary readers | Strict source advance proof? | Proves provider poll success? | Can advance while source stale? | Misuse risk |
|-----------------|-----------------|------------------|--------|-----------------|------------------------------|-------------------------------|--------------------------------|-------------|
| `signalsLatest.lastSeen` (DIMO) | VLS `source_timestamp`, `last_seen_at` | Provider-reported latest observation instant for snapshot bundle | `dimo-snapshot.processor` `normalizeSnapshot()` | `telemetry-freshness.resolver`, runtime assembler, ClickHouse `recorded_at` | **Only if** `incoming > existing` after monotonic compare | Indirectly (only if provider returns strictly newer value) | No — `<` blocked; `==` not advance | Treating upsert or poll success as new data when `lastSeen` unchanged (**VDC-CX-010**) |
| Individual signal `.timestamp` | `raw_payload_json` | Per-signal observation time inside bundle | DIMO provider | AI mapper, forensic analysis | Per-signal only; may lag `lastSeen` | No | N/A | Assuming all signals refresh with `lastSeen` (VDC-HYP-004) |
| `sourceTimestamp` (VLS) | `vehicle_latest_states.source_timestamp` | Canonical provider observation time persisted | Snapshot processor upsert | Freshness resolver priority #1 | **Only if** strictly increased on this upsert | No | `providerFetchedAt` can advance alone | Confusing with ingest time; `==` upsert ≠ advance |
| `providerFetchedAt` (VLS) | `vehicle_latest_states.provider_fetched_at` | SynqDrive receipt time after successful provider HTTP fetch | Snapshot processor (always on success path) | Diagnostic state (`connectivity-diagnostic-state.ts`) | **No** | **Yes** | **Yes** — updated even when monotonic skip | Treating as freshness or **FULL_CONNECTIVITY_RECOVERED** evidence |
| `lastSignal` | `dimo_vehicles.last_signal` | DIMO mirror of last signal time | DIMO sync services | Freshness resolver priority #4; operational list | Weak — mirror may lag VLS | No | Can diverge from `sourceTimestamp` | Operational view uses reduced evidence set (VDC-GAP-010) |
| `last_seen_at` / `updatedAt` (VLS) | `vehicle_latest_states` | Normalized observation / row update | Snapshot processor, Prisma `@updatedAt` | Freshness fallback #5 | **No** for `updatedAt` | No | Yes for `updatedAt` | Using row update as device activity |
| `receivedAt` (ingest) | Passed to resolver as `receivedAt` | Ingest/poll completion instant | Snapshot processor | Freshness resolver #3 with 15 min backfill guard | **No** | Yes | Can advance under stale source | Backfill rejuvenation (guarded) |
| Webhook `observed_at` | `dimo_device_connection_events.observed_at` | Provider-claimed event time | Webhook inbox → processing | Episode open/resolve ordering | Event-specific — see recovery vocabulary below | No | N/A | Equating webhook time with telemetry freshness |
| Webhook `received_at` | inbox + event tables | SynqDrive webhook receipt | Inbox intake | Dedup, ordering tie-break | **No** | Yes (delivery) | N/A | |
| Episode `opened_at` / `resolved_at` | `device_connection_episodes` | Unplug episode lifecycle | `DeviceConnectionEpisodeService` | Runtime projection, alerts, UI | Episode boundaries — not strict source advance | No | N/A | `!openEpisode` ≠ no unplug (VDC-CX-007) |
| Poll `started_at` / `finished_at` | `dimo_poll_logs` | Scheduler/worker poll lifecycle | Snapshot processor | Ops attention (6h stale pipeline), forensics | **No** | **Yes** | Always on poll | Poll SUCCESS vs strict source advance (VDC-HYP-003) |
| ClickHouse `recorded_at` | `telemetry_snapshots` | Provider observation = `lastSeenAt` at ingest | `clickhouse-telemetry.service` | Historical queries, forensics | Insert only when ingest proceeds; dedupe on `(vehicle_id, recorded_at)` | No | Duplicate skip on equal `recorded_at` | Equality replay → `skipped_duplicate` (VDC-Q-009, VDC-CX-010) |
| CH `telemetry_state_changes.changed_at` | state change table | Same as snapshot `recorded_at` for edge detection | ClickHouse service | Motion/ignition history | Derived | No | Append-only, no dedup | |
| HM `last_received_at` | `hm_latest_telemetry_states` | MQTT ingest receipt | HM ingestion service | HM health views only | HM path only | Stream delivery | **Not** wired to VDC runtime | HM-only vehicles lack canonical runtime (VDC-GAP-009) |
| `synced_at` (dimo_vehicles) | `dimo_vehicles` | Identity/metadata sync housekeeping | Vehicle sync worker | Admin listings | **No** | Sync success | Yes | |

## Recovery evidence vocabulary (Phase 1 — descriptive only)

Do not use generic **“reconnect”** when evidence proves only one layer:

| Term | What it can indicate in current code | Does not alone prove |
|------|--------------------------------------|----------------------|
| **PHYSICAL_REPLUG** | OBD plug webhook, explicit plug event, snapshot `obdIsPluggedIn=true` with fresh-enough snapshot | LTE/provider telemetry resumed; **FULL_CONNECTIVITY_RECOVERED** |
| **PROVIDER_RECONNECTED** | Provider link returns `ACTIVE`; `connectionStatus` CONNECTED | Fresh `sourceTimestamp`; physical replug |
| **TELEMETRY_RESUMED** | Episode resolution method `TELEMETRY_RESUMED`; sustained telemetry policy | Physical replug; provider link restored |
| **FULL_CONNECTIVITY_RECOVERED** | Composite runtime/alert outcome only when multiple dimensions align | Should not be inferred from plug webhook or poll alone |

## Monotonic guard (VW-F-008)

**File:** `backend/src/modules/dimo/vls-monotonic-merge.util.ts`  
**Contradiction:** [VDC-CX-010](../contradictions/OPEN_CONTRADICTIONS.md)

| Relation | `isIncomingVlsSourceTimestampStale` | VLS telemetry update | `providerFetchedAt` update | Strict source advance? |
|----------|--------------------------------------|----------------------|----------------------------|------------------------|
| `incoming < existing` | `true` | **Skipped** | **Yes** | **No** (regression/stale) |
| `incoming == existing` | `false` | **Applied** (full upsert) | Yes | **No** — duplicate accepted (**VDC-CX-010**) |
| `incoming > existing` | `false` | Applied | Yes | **Yes** |
| `incoming` null | `false` | Applied | Yes | **No** — not advance proof |
| `existing` null | `false` | Applied | Yes | First observation only |

ClickHouse insert separately dedupes on `(vehicle_id, recorded_at)`; VLS equality path may still run downstream episode/trip side effects.

## Evidence classes (current code usage)

See [../lifecycle/EVIDENCE_HIERARCHY.md](../lifecycle/EVIDENCE_HIERARCHY.md).

## Related documents

- [FRESHNESS_SEMANTICS.md](./FRESHNESS_SEMANTICS.md)
- [../operations/POLLING_AND_SCHEDULERS.md](../operations/POLLING_AND_SCHEDULERS.md)
- [../evidence/REPOSITORY_INVENTORY.md](../evidence/REPOSITORY_INVENTORY.md)
