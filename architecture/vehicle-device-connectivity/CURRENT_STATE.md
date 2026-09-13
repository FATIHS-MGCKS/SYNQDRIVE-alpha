# Vehicle & Device Connectivity — Current State

| Field | Value |
|-------|-------|
| **Authority status** | `AUDIT_IN_PROGRESS` — **not** `AUTHORITY_ACTIVE` |
| **Phase 1 completed** | 2026-09-11 (repository current-state audit) |
| **Phase 2 completed** | 2026-09-11 (Production read-only LTE_R1 forensics) |
| **Phase 3 completed** | 2026-09-11 (reconciliation & classification) |
| **Production baseline** | **VERIFIED_READ_ONLY** — see [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) |
| **Primary Production evidence** | [evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) |
| **Phase 3 reconciliation** | [reconciliation/PHASE3_RECONCILIATION.md](reconciliation/PHASE3_RECONCILIATION.md) |
| **Remediation backlog** | [reconciliation/REMEDIATION_BACKLOG.md](reconciliation/REMEDIATION_BACKLOG.md) |
| **Last updated** | 2026-09-12 (physical-state reconciliation Phase 1 foundation) |

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
- **24 h threshold jitter** produces 163–181 s **potential** classification windows per cycle (VDC-Q-003 partial); Sep cycles: 0 SNAPSHOT jobs in exact windows, 0 persisted alerts, **RUNTIME_EVALUATION_NOT_PROVEN** for projection/alert sync — VDC-Q-011 answered (window geometry).
- **DIMO CONNECTED vs `providerLinkState` UNKNOWN** observed on same vehicle — VDC-CX-011.
- **VDC_RUNTIME_SEMANTIC_DRIFT** between Production and main SHAs: **NONE_OBSERVED** for connectivity code paths.
- **IO174 not exposed** in signalsLatest ingest — VDC-HYP-002 STRONGLY_SUPPORTED.
- **VDC-CX-010** equality upserts MATERIAL in Production churn; not fixed in Phase 2.

Phase 3 (reconciliation) establishes:

- **11 contradictions** dispositioned — 4 RESOLVED_IN_ARCHITECTURE; 7 ARCHITECTURALLY_ADDRESSED_RUNTIME_PENDING (see [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md)).
- **11 Phase-3 decisions** VDC-DEC-002..011 + bootstrap — see [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md).
- **Recovery fast-path:** PLUG webhook optional (VDC-DEC-010); **adaptive polling** principle (VDC-DEC-011); **RB-001 GT-gated** per-signal safety.
- **Canonical evidence hierarchy** and **target semantic model** — PROPOSED (not implemented).
- **18-item remediation backlog** — prioritized P0–P3; no runtime changes in Phase 3.
- **GT-R1-UNPLUG-001** **executed** 2026-09-12 on KS MX 2024: UNPLUG webhook **delivered** post-recovery but **ignored** (`no_state_change` — stale canonical last-event); snapshot unplug/replug **confirmed**; **no episode/alert**; PLUG webhook **absent** (disabled); snapshot-only replug recovery **confirmed** (VDC-EVID-GT-R1-EXECUTION-001).
- **Physical-state reconciliation Phase 1 (dark):** VDC-DEC-012 + VDC-RB-019 — durable `device_connection_physical_states` projection, transition log, pure policy, repository (`SELECT FOR UPDATE`), service layer, `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` (**OFF**); **no** live webhook/snapshot cutover yet.
- **AUTHORITY_ACTIVE promotion deferred** — HM gap, runtime cutover, Production backfill pending.

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

[contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md) — VDC-CX-001 through VDC-CX-011.

## Knowledge gaps

[contradictions/KNOWLEDGE_GAPS.md](contradictions/KNOWLEDGE_GAPS.md) — VDC-GAP-001 through VDC-GAP-012.

## Hypotheses (Phase 3)

VDC-HYP-001..007 classified in [research/OPEN_HYPOTHESES.md](research/OPEN_HYPOTHESES.md). Several **PRODUCTION_VALIDATED** (single-vehicle LTE_R1); physical IO174 timer **not** confirmed. Promotions: VDC-INV-003, VDC-INV-004, VDC-DEC-010.

## Explicit non-claims

- Fleet-wide LTE_R1 gap distribution (VDC-Q-001 partial)
- Physical Ruptela IO174 timer mechanism
- HM connectivity parity (VDC-GAP-009)
- Historical `FULL_CONNECTIVITY_RECOVERED` instant — GT-R1 replug did not emit TELEMETRY/FULL recovery notifications in capture window (VDC-EVID-GT-R1-EXECUTION-001)
- CH duplicate root cause (VDC-Q-012)
- Aug 2026 enqueue_failed mechanism — **CONFIRMED** (BullMQ `jobId` colon bug; VDC-EVID-GT-R1-UNPLUG-FAILURE-001); provider `failed` auto-recovery without `PUT` **UNKNOWN**; `PUT` enable recovery **VERIFIED** (VDC-Q-015 partial)

## Next workstream (Phase 3 hardened order)

1. **VDC-RB-001** per-signal-safe equality — GT-R1 complete; design/rollout authorized.
2. **Canonical plug-state repair** when PLUG webhook disabled and last event is UNPLUGGED — GT-R1 exposed `no_state_change` gap (VDC-EVID-GT-R1-EXECUTION-001 §6.1).
3. Finalize per-signal-safe equality design for **VDC-RB-001** (VDC-DEC-002 gate).
4. Implement **VDC-RB-001** + **VDC-RB-017**.
5. **VDC-RB-018** adaptive polling (VDC-DEC-011, VDC-Q-014).
6. Webhook remediation — VDC-RB-002/004/005.
7. Remaining provider/runtime — RB-003, RB-015 (HM).

**Principles (hardening):** PLUG webhook optional for recovery (VDC-DEC-010); fixed standby polling not scalable (VDC-DEC-011).

## Related entry documents

- [evidence/REPOSITORY_INVENTORY.md](evidence/REPOSITORY_INVENTORY.md)
- [lifecycle/EVIDENCE_HIERARCHY.md](lifecycle/EVIDENCE_HIERARCHY.md)
- [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md)
