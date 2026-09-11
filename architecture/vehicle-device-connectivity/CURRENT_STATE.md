# Vehicle & Device Connectivity — Current State

| Field | Value |
|-------|-------|
| **Authority status** | `AUDIT_IN_PROGRESS` — **not** `AUTHORITY_ACTIVE` |
| **Phase 1 completed** | 2026-09-11 (repository current-state audit) |
| **Phase 2 completed** | 2026-09-11 (Production read-only LTE_R1 forensics) |
| **Production baseline** | **VERIFIED_READ_ONLY** — see [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) |
| **Primary Production evidence** | [evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) |
| **Last updated** | 2026-09-11 |

## Executive summary

SynqDrive implements a **substantial multi-dimensional connectivity model** centered on `VehicleConnectivityRuntimeState` under `backend/src/modules/vehicles/connectivity/`, fed primarily by DIMO snapshot ingest, device-connection webhooks/episodes, and IAM/provider-link evidence. There is **no single code module** named Vehicle & Device Connectivity — semantics are distributed across Vehicles, DIMO Integration, AI evidence mapping, Trip Detection (snapshot wake), and rental operational projection.

Phase 1 (repository) confirms:

- Canonical telemetry freshness uses **15 min / 24 h / 48 h** five-state classification (`vehicle-state-interpreter.ts`).
- **Poll success ≠ strict source advance** — only `incoming > existing` proves a new observation instant; `incoming == existing` still full-upserts (**VDC-CX-010**); `<` skips telemetry but updates `providerFetchedAt` (VDC-INV-001, VDC-INV-002).
- **Runtime projection** combines provider link, telemetry, physical device, data coverage, attention, and overall state with explicit precedence.
- **Connectivity alert policy** is provider-neutral pure functions but **implemented under DIMO** (VDC-CX-001).
- **Legacy parallel paths** (3-state `onlineStatus`, operational list reduced timestamps, admin DIMO debug thresholds) **drift** from canonical runtime.
- **High Mobility** is not integrated into canonical connectivity runtime (VDC-GAP-009).

Phase 2 (Production, KS MX 2024 LTE_R1) confirms:

- **~24 h strict source advances** during standby (86,563–86,581 s; n=3) — VDC-HYP-001 STRONGLY_SUPPORTED.
- **Poll success ≠ source advance** at ~343:1 during 3.75 d stationary window — VDC-HYP-003 CONFIRMED.
- **24 h threshold jitter** produces 163–181 s transient `signal_delayed` windows per cycle — VDC-Q-011 answered.
- **IO174 not exposed** in signalsLatest ingest — VDC-HYP-002 STRONGLY_SUPPORTED.
- **VDC-CX-010** equality upserts MATERIAL in Production churn; not fixed in Phase 2.

## Component hierarchy

```
[DIMO API / webhooks]
        ↓
dimo-snapshot.processor / device-connection-webhook pipeline
        ↓
vehicle_latest_states + dimo_vehicles + episodes/events + dimo_poll_logs
        ↓
telemetry-freshness.resolver + physical-device-evidence + provider-link builder
        ↓
vehicle-connectivity-runtime-state.builder
        ↓
vehicle-connectivity-runtime-projection.service → fleet-connectivity API / device-connection API
        ↓
frontend operational-projection (connectivityRuntime authoritative on P1 surfaces)
```

**Neighbor boundaries:**

- Trip Detection: snapshot wake, trip FSM (`backend/src/workers/snapshot-wake/**`)
- DIMO Integration: provider clients, webhooks, episode persistence, alert delivery
- Scaling Process: scheduler leader election
- Notifications: delivery channel; VDC owns alert **semantics** (proposed)

## Data flow (repository-confirmed)

1. **Scheduled poll** (`dimo.snapshot.poll`) fetches `signalsLatest` → normalizes `lastSeenAt` → monotonic guard → VLS upsert (+ optional ClickHouse).
2. **Webhooks** (`POST /webhooks/dimo`): OBD plug/unplug → inbox → episodes; speed/ignition → snapshot wake (Trip Detection).
3. **Batch assembler** resolves canonical telemetry timestamps from VLS + dimo mirror fields.
4. **Runtime builder** synthesizes dimensions → legacy projection for list filters.
5. **Alert sync** (`ConnectivityAlertService`) after runtime projection.

Detail: [signals/SIGNAL_AUTHORITY.md](signals/SIGNAL_AUTHORITY.md), [operations/POLLING_AND_SCHEDULERS.md](operations/POLLING_AND_SCHEDULERS.md).

## State semantics

Full map: [lifecycle/CURRENT_SEMANTIC_MAP.md](lifecycle/CURRENT_SEMANTIC_MAP.md).

**Thresholds:** [signals/FRESHNESS_SEMANTICS.md](signals/FRESHNESS_SEMANTICS.md).

## Timestamp semantics

See [signals/SIGNAL_AUTHORITY.md](signals/SIGNAL_AUTHORITY.md).

**Source-advance semantics:** See [signals/SIGNAL_AUTHORITY.md](signals/SIGNAL_AUTHORITY.md). Strict advance requires `incoming > existing`. Equality (`==`) performs full VLS upsert **without** proving new source/device evidence (**VDC-CX-010**). Null incoming is not advance proof. ClickHouse may dedupe identical `(vehicle_id, recorded_at)` on equality replay (VDC-Q-009).

## Persistence & history

| Store | Connectivity role | Historical retention |
|-------|-------------------|----------------------|
| `vehicle_latest_states` | Latest observation + raw payload | Latest only (VDC-GAP-003) |
| `dimo_vehicles` | connection_status, last_signal mirror | Latest |
| `dimo_poll_logs` | Poll forensics | 30 days |
| `device_connection_episodes` | Unplug lifecycle | Unbounded |
| `dimo_device_connection_events` | Webhook events | Unbounded (VDC-GAP-011) |
| `device_connection_webhook_inbox` | Queue | Unbounded |
| ClickHouse `telemetry_snapshots` | Observation history | 180 days TTL |
| Notifications | Alert state | Notification system retention |

## Polling & schedulers

See [operations/POLLING_AND_SCHEDULERS.md](operations/POLLING_AND_SCHEDULERS.md).

Activity tiers: 30s (driving) → 30min (long idle). RESTING_STANDBY tier ties to telemetry `standby` classification.

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET .../fleet-connectivity` | Fleet list + `connectivityRuntime` + legacy fields |
| `GET .../fleet-connectivity/:vehicleId` | Detail + timeline |
| `GET .../vehicles/:vehicleId/device-connection` | Device connection card |
| `GET /admin/vehicles/operational*` | Master-admin (reduced telemetry path) |

## Frontend

- **Canonical:** `connectivityRuntime` via operational-projection (`map-fleet-map-to-canonical.ts`, vehicle detail presentation).
- **Legacy:** `telemetryFreshness.ts` client classifier when runtime absent.
- **Drift:** 5 min “Live” label vs 15 min freshness; legacy `onlineStatus` on map paths (VDC-GAP-012).

## DIMO / device connectivity

- **Episodes:** OBD unplug opens episode; resolve via **PHYSICAL_REPLUG** (plug webhook / snapshot OBD), **TELEMETRY_RESUMED** (sustained telemetry policy), or explicit plug webhook resolution paths — each proves a different recovery layer; none alone proves **FULL_CONNECTIVITY_RECOVERED**.
- **Physical evidence:** `physical-device-evidence.ts` + read-model anchors.
- **Alerts:** policy in `connectivity-alert.policy.ts`; delivery in DIMO module.
- **Native events inventory:** OBD plug/unplug, speed, ignition, RPM (wake), DTC — see DIMO webhook controller.

Provider profile (LTE_R1): [providers/dimo/LTE_R1.md](providers/dimo/LTE_R1.md) — hardware timing **not** confirmed in Phase 1.

## High Mobility

Bounded audit: [providers/high-mobility/REPOSITORY_AUDIT.md](providers/high-mobility/REPOSITORY_AUDIT.md). Not in canonical runtime.

## Failure / recovery (summary)

| Condition | Behavior |
|-----------|----------|
| Stale provider snapshot | Skip VLS telemetry; update `providerFetchedAt` |
| Provider HTTP failure | Poll log FAILURE; BullMQ retry |
| Auth/consent expired | `AUTHORIZATION_REQUIRED` overall state |
| OBD unplug webhook | Open episode + device alert |
| Webhook inbox failure | Retry → dead letter |
| Episode resolution | **PHYSICAL_REPLUG**, **TELEMETRY_RESUMED**, or explicit plug paths — see recovery vocabulary in `SIGNAL_AUTHORITY.md` |
| Alert resolve | Policy resolves telemetry/device alerts when freshness/dimensions improve — not synonymous with **FULL_CONNECTIVITY_RECOVERED** |
| Redis/leader loss | Scaling Process leader guard skips tick |

## Test coverage

[Index](evidence/TEST_COVERAGE_INDEX.md) — strong unit/regression on runtime builder, freshness, alerts, episodes; gaps on operational path and E2E Production cadence.

## Ownership reality vs proposed VDC

| Concern | Code location today | Proposed VDC owner |
|---------|---------------------|-------------------|
| Runtime semantics | `vehicles/connectivity/**` | VDC |
| Alert policy | `dimo/connectivity-alert/**` | VDC semantics (VDC-CX-001) |
| Episode persistence | `dimo/device-connection-*` | DIMO |
| Snapshot ingest | `dimo-snapshot.processor` | DIMO |
| Wake | `snapshot-wake/**` | Trip Detection |

## Contradictions

[contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md) — VDC-CX-001 through VDC-CX-010.

## Knowledge gaps

[contradictions/KNOWLEDGE_GAPS.md](contradictions/KNOWLEDGE_GAPS.md) — VDC-GAP-001 through VDC-GAP-012.

## Hypotheses (unchanged status)

VDC-HYP-001 through VDC-HYP-007 remain **PROPOSED** — not promoted. LTE_R1 ~24h observation stays pending Production reconstruction.

## Explicit non-claims

- Production-validated LTE_R1 sleep/wake cadence
- IO174 visibility in ingest
- HM connectivity parity
- Canonical promotion of KS MX 2024 forensic numbers
- Physical device transmission frequency (requires Phase 2)

## Phase 2 Production questions

1. Deduplicated `source_timestamp` series vs `dimo_poll_logs` SUCCESS rate (VDC-HYP-003).
2. Post-trip LTE_R1 gap distribution (VDC-HYP-001).
3. Per-signal timestamp heterogeneity on standby wakes (VDC-HYP-004).
4. IO174 / raw IO in Production payloads (VDC-HYP-002).
5. Episode vs physical-unplug without episode incidence rate (VDC-CX-007).
6. Operator false-positive rate for standby vs offline at 24h/48h boundaries.
7. **LTE_R1 stationary periodic-source jitter around 86,400 s:** what is normal jitter, and does the current 24 h standby boundary (`standby` < 24 h; `signal_delayed` ≥ 24 h and < 48 h) produce transient false `SOFT_OFFLINE` / `signal_delayed` for healthy devices? (VDC-Q-011)
8. Multi-replica duplicate snapshot insert rate in ClickHouse at equal `recorded_at` (VDC-Q-009, **VDC-CX-010**).
9. Webhook delivery latency vs poll-only **TELEMETRY_RESUMED** / strict source-advance detection.

## Related entry documents

- [evidence/REPOSITORY_INVENTORY.md](evidence/REPOSITORY_INVENTORY.md)
- [lifecycle/EVIDENCE_HIERARCHY.md](lifecycle/EVIDENCE_HIERARCHY.md)
- [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md)
