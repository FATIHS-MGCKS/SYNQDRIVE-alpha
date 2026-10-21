# Vehicle & Device Connectivity — Ground-Truth Test Strategy

**Status:** Methodology only — **no destructive or mutation-based tests** in bootstrap Phase 0.

## Principles

1. **Source time ≠ poll time** — ground truth uses monotonic `sourceTimestamp` / `lastSeen`, not `providerFetchedAt`.
2. **Multi-source corroboration** — trips, episodes, raw payloads, ClickHouse, poll logs.
3. **Per-provider profiles** — LTE_R1 first; HM later.
4. **Read-only Production forensics** by default; controlled physical tests only with explicit authorization.

## Target scenarios

| Scenario | Primary evidence | Notes |
|----------|------------------|-------|
| Normal driving | High-frequency distinct `recorded_at` in CH; ignition/motion state changes | Baseline cadence |
| Ignition off | Last moving + ignition-off alignment | End of active phase |
| Prolonged parking | Source silence duration; standby wakes | Tolerance calibration |
| Expected standby source update | New `lastSeen` without trip | VDC-HYP-001 |
| OBD/R1 physically unplugged | `obdIsPluggedIn`, device connection episodes/webhooks | Physical fault class |
| R1 plugged back in | New strict source advance + plug signal after unplug | **PHYSICAL_REPLUG** + optional **TELEMETRY_RESUMED** — not **FULL_CONNECTIVITY_RECOVERED** unless all dimensions align; **PLUG webhook optional** (VDC-DEC-010) |
| LTE/network loss | Provider vs device divergence | If observable |
| Provider/API outage | Poll failures vs stale success | VDC-HYP-006 |
| DIMO permission/auth failure | Consent/link status vs telemetry | Separate from sleep |
| Stale cached provider data | Poll success + unchanged `lastSeen` | VDC-HYP-003 |
| Fresh source after long silence | Monotonic `lastSeen` jump | Standby wake |
| Native event without full snapshot | Webhook/RPM candidate without CH row | Trip wake neighbor |
| Fresh snapshot without webhook | CH row without inbox event | Scheduler path |
| Hardware suspected defective | Sustained absence beyond profile tolerance | Fault class |
| Recovery after known disconnect | State transition with fresh source | VDC-HYP-007 |

## Execution gates

| Gate | Requirement |
|------|-------------|
| G1 | Vehicle identified; tenant-scoped read-only queries only |
| G2 | Analysis window documented (UTC + Europe/Berlin) |
| G3 | Deduplicated source timeline (ClickHouse + Postgres) |
| G4 | Hypothesis matrix updated with CONFIRMED / CONTRADICTED |
| G5 | Evidence committed with `VDC-EVID-*` IDs |

## Prohibited in Phase 0

- Production mutations, deploys, restarts
- Synthetic Production records
- Promoting chat-derived numbers without reconstruction

---

## Physical-state reconciliation tests (VDC-RB-019 Phase 1)

| Layer | Path | Coverage |
|-------|------|----------|
| Pure policy | `device-connection-physical-state.policy.spec.ts` | baseline, duplicate, stale, conflict, provenance refresh, webhook/snapshot ordering, RB-001 per-signal timestamp guard |
| PostgreSQL integration | `device-connection-physical-state.postgres.integration.spec.ts` | authority row, concurrent writers, GT-R1 self-heal + webhook unplug, snapshot-unplug episode deferred, stale-after-newer |
| Drift detector (read-only) | `backend/scripts/ops/vdc-physical-state-drift-detect.ts` | EVENT_UNPLUGGED vs newer VLS `obdIsPluggedIn` dry-run |

**Flag:** tests may enable `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED=true` in isolated environments only — Production remains OFF until Phase 2 cutover.

---

## GT-R1-UNPLUG-001 — Controlled physical unplug/replug (LTE_R1)

**Status:** **EXECUTED** 2026-09-12 — KS MX 2024 / tokenId 187336 (see execution evidence).
**Preflight (read-only):** [../evidence/GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](../evidence/GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md) — live provider + Production baseline for KS MX 2024 / tokenId 187336.
**Execution:** [../evidence/GT_R1_UNPLUG_EXECUTION_2026-09-12.md](../evidence/GT_R1_UNPLUG_EXECUTION_2026-09-12.md) — VDC-EVID-GT-R1-EXECUTION-001.

### Preconditions

- Operator authorization for physical OBD manipulation
- Healthy baseline: LTE_R1, CONNECTED, `obdIsPluggedIn=1`, recent strict source advance
- Recommended vehicle: KS MX 2024 (token 187336) or operator-selected equivalent LTE_R1

### Sequence

1. **Baseline** — record VLS `sourceTimestamp`, `providerFetchedAt`, DIMO `connectionStatus`, `obdIsPluggedIn`, connectivity runtime JSON
2. **Physical unplug** — operator removes R1 from OBD port; do not restart services
3. **Capture provider webhook** — `device_connection_webhook_inbox`, `dimo_device_connection_events`
4. **Capture episode/alert** — `device_connection_episodes`, `notifications` (DEVICE_UNPLUGGED / TELEMETRY_*)
5. **Wait** — observe telemetry stall (expect stale `sourceTimestamp`, continued polls)
6. **Physical replug** — operator reinserts R1
7. **Capture plug path** — PLUG webhook **if emitted** and/or snapshot `obdIsPluggedIn=true` (both paths recorded; neither assumed mandatory)
8. **Record per-signal timestamps** — compare top-level `sourceTimestamp` vs individual signal `.timestamp` fields (VDC-HYP-004)
9. **Wait for strict source advance** — `incoming > existing` on top-level `sourceTimestamp`
10. **Confirm recovery without PLUG webhook** — if no webhook, document snapshot-only recovery path
11. **Confirm TELEMETRY_RESUMED** — fresh source + operational signals
12. **Confirm FULL_CONNECTIVITY_RECOVERED** — strict source advance + healthy dimensions (**must not** require PLUG webhook)

### GT-R1 must determine (LTE_R1)

- Whether PLUG webhook is emitted
- Whether `obdIsPluggedIn=true` appears before/with/after strict top-level source advance
- Whether per-signal timestamps advance independently
- Whether fresh telemetry can restore recovery without PLUG webhook
- Exact recovery ordering (webhook → snapshot → strict advance)

### Timestamps to record (UTC + Europe/Berlin)

| Layer | Fields |
|-------|--------|
| Physical | Operator T0 unplug, T1 replug (video/time.is optional) |
| Provider | Webhook `observed_at`, `received_at` |
| SynqDrive | Episode `opened_at`, `resolved_at`, VLS `sourceTimestamp`, `providerFetchedAt` |
| Alerts | Notification `firstSeenAt`, `resolvedAt` |

### Tables / logs to monitor (read-only)

- `vehicle_latest_states`
- `dimo_poll_logs` (SNAPSHOT)
- `dimo_device_connection_events`
- `device_connection_webhook_inbox`
- `device_connection_episodes`
- `notifications` (TELEMETRY_*, DEVICE_*)
- ClickHouse `telemetry_snapshots` (distinct `recorded_at`)
- PM2 logs: `VLS monotonic guard`, snapshot processor (no log mutation)

### Expected vs falsifying observations

| Expectation | Falsified if |
|-------------|--------------|
| Unplug webhook arrives within minutes | No inbox row within 15 min of physical unplug |
| Episode opens on unplug | No episode; only snapshot `obdIsPluggedIn=false` |
| Telemetry stalls after unplug | Strict source continues advancing without replug |
| Replug resolves via webhook and/or snapshot | Episode stays open >24 h with plugged signal |
| FULL_CONNECTIVITY_RECOVERED requires strict source advance | Runtime shows recovered while `sourceTimestamp` unchanged >1 h |

### Max safe observation window

- Unplug observation: up to **2 h** before abort (avoid false TELEMETRY_OFFLINE conflation with standby)
- Post-replug wait: up to **26 h** (one standby cycle + jitter buffer)

### Stop conditions

- Operator safety concern
- Unexpected vehicle movement / ignition on
- Production incident declared by operator
- GT-R1-UNPLUG-001 completes all capture checkpoints
