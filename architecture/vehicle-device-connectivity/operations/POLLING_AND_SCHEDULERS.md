# Vehicle & Device Connectivity — Polling & Schedulers

**Phase 1 baseline** below documents **current** behavior.  
**Target policy (Phase 3 hardening):** [VDC-DEC-011](../decisions/DECISION_REGISTER.md), [REMEDIATION_BACKLOG.md](../reconciliation/REMEDIATION_BACKLOG.md) VDC-RB-018.

## Ownership boundary

| Module | Owns |
|--------|------|
| **Vehicle & Device Connectivity** | Semantic polling policy; provider/device profile expectations; when information is useful to request; adaptive/backoff rules; information-gain principle |
| **DIMO Integration** | Executes DIMO API acquisition; provider-specific adapter details |
| **Scaling Process** | Leader election; replica safety; scheduler execution mechanics; distributed scheduling/idempotency infrastructure |

Do **not** duplicate Scaling Process ownership here.

## Adaptive polling principle (PROPOSED — VDC-DEC-011)

**Current problem (Phase 2):** ~1,030 SUCCESS stationary polls vs 3 strict source advances (KS MX 2024). Fixed ~5 min RESTING_STANDBY tier is not scalable canonical design.

**Canonical principle:** Polling cadence follows **expected information gain** and vehicle/device state, not wall-clock alone.

**Policy input tiers** (polling scheduler inputs — **not** connectivity runtime states):

`ACTIVE_DRIVING` · `POST_TRIP_SETTLING` · `CONFIRMED_STANDBY` · `LONG_IDLE` · `DISCONNECTED_UNPLUGGED` · `RECOVERY` · `EVENT_TRIGGERED_REFRESH`

**Requirements (summary):** high frequency while driving; frequent post-trip settling; backoff on repeated equal `sourceTimestamp`; sparse watchdog for confirmed healthy standby; event-triggered refresh; jitter; rate-limit respect; never permanently stop polling due to missing webhooks; profile overrides (LTE_R1 ~24h source advance is **profile evidence**, not universal 24h poll interval).

**Calibration:** VDC-Q-014 + GT-R1 — do not hardcode final intervals in architecture.

**Leader election:** [Scaling Process](../../scaling-process/) — `scheduler-leader-guard.service.ts`.

## Three frequency layers (VDC invariant candidate)

| Layer | Meaning | Canonical field / mechanism |
|-------|---------|---------------------------|
| **SynqDrive poll frequency** | How often jobs hit DIMO API | Activity tiers 30s–30min; scheduler tick 30s |
| **Provider source update frequency** | When `signalsLatest.lastSeen` advances | VLS `source_timestamp` |
| **Physical device transmission** | Device emits upstream | Interpreted via `source_timestamp` + freshness tiers |

**Confirmed:** poll can succeed while source unchanged (`providerFetchedAt` updates, monotonic skip).

## Snapshot polling

| Component | Path | Cadence |
|-----------|------|---------|
| Scheduler tick | `dimo-snapshot.scheduler.ts` | 30s (`@Interval`) |
| Activity tier ACTIVE_DRIVING | `snapshot-polling-tier.config.ts` | 30s default |
| RECENTLY_ACTIVE | same | 60s |
| RESTING_STANDBY | same | 5 min |
| LONG_IDLE | same | 30 min |
| Queue | `dimo.snapshot.poll` | Stable `jobId=snapshot-{vehicleId}` |

Tier derivation uses telemetry `standby` state (`derive-snapshot-polling-tier.ts`).

**Leader guard:** `dimo_snapshot_tick`, `dimo_snapshot_janitor`

## Snapshot wake (Trip Detection boundary)

| Trigger | Path | Notes |
|---------|------|-------|
| Speed / ignition webhook | `dimo-webhook.controller.ts` → `SnapshotWakeIntakeService` | FSM must be RESTING |
| Post-snapshot probe | `SnapshotWakeCoordinatorService.afterSnapshotJob` | Handoff queue |
| Handoff queue | `snapshot.wake.handoff` | 100 attempts, 1s fixed backoff |

Wake **does not** mean device connected or fresh source data — schedules another poll.

## Device connection webhooks

| Component | Cadence / config |
|-----------|------------------|
| Inbox scheduler | 30s cron |
| Process queue | `connectivity.webhook.process` |
| Max attempts | 5 (default) |
| Stale inbox | 5 min default |

**Leader guard:** `device_connection_webhook_inbox`

## Other periodic jobs (connectivity-adjacent)

| Job | Cadence | Path |
|-----|---------|------|
| DIMO vehicle sync | 24h repeat | `dimo-vehicle-sync.scheduler.ts` |
| DTC poll | 3h repeat | `dimo-dtc.scheduler.ts` |
| HM health check | 5 min | `hm-health-polling.scheduler.ts` |

## Failure / retry (summary)

- Global BullMQ: 3 attempts, 5s exponential backoff
- Snapshot jobs: coalesce on `snapshot-{vehicleId}`; `afterSnapshotJob` in `finally`
- Handoff: `DelayedError` + `moveToDelayed`; orphan recovery 60s SCAN
- Webhook inbox: dead-letter at max attempts

## Scaling references

- `DimoQueueBackpressureService` — defer when backlog ≥ 500
- `CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N = 100`
- Concurrency: `WORKER_SNAPSHOT_CONCURRENCY` default 5

## Tests

`snapshot-polling/*.spec.ts`, `dimo-snapshot.scheduler.spec.ts`, `snapshot-wake-*.spec.ts`, `scheduler-leader-*.spec.ts`
