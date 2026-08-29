# P1.2 — Activity-Tier Snapshot Polling

| Field | Value |
|-------|-------|
| **Slice** | P1.2 — DIMO snapshot scheduler activity-tier polling |
| **Status** | Implemented (feature-flagged rollback) |
| **Schema** | None |

## Before

`DimoSnapshotScheduler` ran `@Interval(30_000)` and enqueued **every** DIMO-connected
AVAILABLE/RENTED vehicle on **every** tick — O(N) producer rate (~2N jobs/min at
N vehicles with c=5 consumers).

## After

The scheduler tick remains every 30s, but enqueue is **tier-gated**:

| Tier | Condition (canonical) | Default interval |
|------|----------------------|------------------|
| `ACTIVE_DRIVING` | FSM `ACTIVE_TRIP` / `IDLE_WITHIN_TRIP` / `POSSIBLE_END` | 30s |
| `RECENTLY_ACTIVE` | `live` telemetry, movement, recent FSM activity | 60s |
| `RESTING_STANDBY` | `standby` telemetry (<24h) | 5min |
| `LONG_IDLE` | `signal_delayed` / `offline` / no signal >24h | 30min |
| `OFFLINE` | `connectionStatus !== CONNECTED` | sparse probe only |
| `HARD_OFFLINE` | missing `tokenId` | no polling |

### Canonical derivation

`deriveSnapshotPollingTier()` in
`backend/src/workers/schedulers/snapshot-polling/derive-snapshot-polling-tier.ts`

Reuses:

- `classifyTelemetryFreshness` / `TELEMETRY_*_THRESHOLD_MS` from `vehicle-state-interpreter`
- `VehicleLatestState.sourceTimestamp` (observation) over `lastSeenAt`
- `VehicleTripDetectionState` FSM + `lastActivityAt`
- DIMO `connectionStatus` + `tokenId` (same cohort as pre-P1.2)

### Hysteresis

`applySnapshotPollingHysteresis()` holds `RECENTLY_ACTIVE` cadence for
`WORKER_SNAPSHOT_ACTIVE_DRIVING_DEMOTION_HOLD_MS` (default 90s) after
`ACTIVE_DRIVING` ends — prevents single quiet snapshot demotion flapping.

### Due check

`providerFetchedAt` from `VehicleLatestState` — same field used by connectivity
diagnostics for provider reachability.

### Multi-org fairness

`interleaveByOrganization()` round-robins due vehicles across `organizationId`
before enqueue (deterministic sort).

### Rollback

`WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` restores pre-P1.2 every-tick enqueue
without DB migration or data repair.

### Queue idempotency (unchanged)

`jobId = snapshot-{vehicleId}` + terminal-state job recovery before re-add.

## Simulation (audit mixed fleet 5/15/60/20)

| N | Legacy jobs/min | Modeled jobs/min | Reduction |
|---|-----------------|------------------|-----------|
| 100 | 200 | ~37.7 | ~5.3× |
| 250 | 500 | ~94.2 | ~5.3× |
| 500 | 1000 | ~188.3 | ~5.3× |
| 1000 | 2000 | ~376.7 | ~5.3× |
| 2500 | 5000 | ~941.7 | ~5.3× |

Formula per tier: `count × (tickMs / intervalMs) × ticksPerMinute`.

## Not in scope (P1.3+)

- Global DIMO semaphore / token bucket
- Per-tenant queues
- Full P1.10 metrics suite

## Files

- `backend/src/workers/schedulers/snapshot-polling/*`
- `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts`
