# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

# Trip FSM R9 — Adaptive Polling / Provider Wake Model

**Date:** 2026-09-07  
**Branch:** `trip-fsm/r9-adaptive-polling-wake`  
**Baseline SHA:** `06095af91ce6f58366734a182ac5962830e858db`  
**R8 prerequisite merge SHA:** `6ea95124343e15e971220cb0c672239ac4b077d6` (verified ancestor)

## Mission

Close P4-F04 and P4-F05 by making DIMO Vehicle Trigger speed/ignition events the **primary low-latency wake path** for RESTING vehicles, while preserving activity-tier scheduler polling as durable fallback.

## Current polling graph (pre-R9 behavior documented)

```
@Interval(30s) DimoSnapshotScheduler
  → CONNECTED + AVAILABLE/RENTED + tokenId cohort
  → deriveSnapshotPollingTier()
  → hysteresis (applySnapshotPollingHysteresis)
  → isSnapshotPollDue(providerFetchedAt)
  → enqueue snapshot-{vehicleId}
```

**Tier defaults (unchanged in R9):**

| Tier | Default interval |
|------|------------------|
| ACTIVE_DRIVING | 30s |
| RECENTLY_ACTIVE | 60s |
| RESTING_STANDBY | 5m |
| LONG_IDLE | 30m |

**Movement promotion threshold:** `WORKER_SNAPSHOT_MOVEMENT_SPEED_KMH` default 3 km/h  
**Active demotion hold:** 90s

### Root cause P4-F04

LONG_IDLE due logic keys off `providerFetchedAt`. A vehicle that begins moving cannot promote itself until SynqDrive fetches new telemetry. A 30m LONG_IDLE interval can delay first live start candidate or miss short trips between polls.

### Root cause P4-F05

After trip completion, RESTING applies a fixed 120s complete cooldown before start scoring runs on ordinary scheduled snapshots.

## R9 integration seam

DIMO trigger subscriptions already include `speed` and `isIgnitionOn`. Pre-R9, `DimoWebhookController` only ACK/logged these signals.

## Wake-only authority rule

Webhooks MUST NOT:

- mutate Trip FSM directly
- write partial VLS for trip purposes
- call TripDecisionEngine lifecycle mutations

Webhooks MAY:

- authenticate/normalize provider events
- classify eligible snapshot wakes
- request coalesced canonical snapshot fetch via `SnapshotWakeCoordinatorService`

## Snapshot wake coordinator

Shared enqueue path for scheduler + provider wake:

- Single BullMQ jobId: `snapshot-{vehicleId}`
- Terminal job recycle (failed/completed)
- Coalesce while queued/active via Redis pending wake record
- Drain pending / schedule bounded `WAKE_PROBE` after job completion
- No parallel provider fetch for same vehicle

**Wake context shape:**

```typescript
{
  source: 'DIMO_TRIGGER',
  reason: 'SPEED_MOVEMENT' | 'IGNITION_ON',
  providerObservedAt: string | null,
  receivedAt: string,
  signalName: 'speed' | 'isIgnitionOn',
  probeGeneration: 0 | 1
}
```

## Trusted complete cooldown bypass

Preserves 120s / 30s / 60s smart cooldown for ordinary polling. Trusted provider wake may bypass **only** the complete cooldown early return when:

1. FSM = RESTING, `lastRestingReason === 'complete'`
2. Valid `providerObservedAt` strictly after `lastActivityAt` rest anchor
3. Wake + full snapshot pass R4 freshness / future-skew rules
4. Full snapshot `sourceTimestamp >= providerObservedAt`

Does **not** bypass scoring, confirmation, merge, or lifecycle ownership.

## Bounded probe

- Max one follow-up (`probeGeneration = 1`)
- Delay = `RECENTLY_ACTIVE` tier interval from `SnapshotPollingTierConfig` (default 60s)
- Triggered on stale monotonic skip, snapshot behind wake, trip-start eval error, or trusted wake without candidate

## Observability

- `synqdrive_trip_snapshot_wake_total{source,reason,outcome}`
- `synqdrive_trip_snapshot_wake_to_fetch_seconds`
- `synqdrive_trip_snapshot_wake_probe_total{reason,outcome}`
- `synqdrive_snapshot_polling_tier_vehicles{tier}`
- `synqdrive_snapshot_fast_tier_ratio`

R8 recognition metrics unchanged; wake provenance persisted in `startWake` on POSSIBLE_START evidence.

## Finding status

| Finding | Status |
|---------|--------|
| P4-F04 | RESOLVED_BY_R9 (architecture — production trigger coverage is R11) |
| P4-F05 | RESOLVED_BY_R9 |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 (R10) |

## Production safety

- **Deploy:** NOT PERFORMED
- **Production mutations:** NONE
- **DIMO provider mutations:** NONE
- **Schema migration:** NONE
- **DIMO_TRIGGER_BOOTSTRAP:** unchanged disabled-by-default
