# Notification Engine — Runtime Architecture (V4.9.355)

Production-safe, multi-instance execution for notification evaluation (Business Insights + V2 producer sync).

## Decision: Redis lock (not PostgreSQL advisory)

| Option | Verdict |
|--------|---------|
| **Redis SET NX PX** | **Chosen** — Redis is already required for BullMQ; debounce pending lists and follow-up flags also live in Redis. |
| PostgreSQL advisory lock | Rejected for this path — would add DB coupling to a queue-coordinated workload without replacing Redis state. |

DB unique constraints on `notifications (organization_id, fingerprint, lifecycle_generation)` remain the **last line of defense** against duplicate materialization.

---

## Components

```
┌─────────────────────┐     ┌──────────────────────────────┐
│ BusinessInsights    │     │ BusinessInsightsScheduler    │
│ TriggerService      │     │ (@Cron + boot enqueue)       │
└─────────┬───────────┘     └──────────────┬───────────────┘
          │ scheduleDebounced               │ scheduleScheduled
          └──────────────┬──────────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ NotificationEvaluationService    │
          │  • enqueue BullMQ job            │
          │  • Redis pending/follow-up keys  │
          └──────────────┬───────────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ BullMQ queue: notification.evaluation │
          │ jobId: notification-evaluation:{orgId}:{triggerClass} │
          └──────────────┬───────────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ NotificationEvaluationProcessor  │
          │  (WorkersModule, concurrency: 2) │
          └──────────────┬───────────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ RedisDistributedLockService      │
          │  key: notification:eval:lock:{orgId} │
          └──────────────┬───────────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ BusinessInsightsService          │
          │  .runForOrganization()           │
          │  (+ V2 NotificationProducerIngest) │
          └──────────────────────────────────┘
```

---

## Scheduler architecture

- **Cron:** `2,32 * * * *` — enqueues `scheduled` evaluation jobs per active org (no local `running` flag).
- **Boot:** `onApplicationBootstrap` enqueues `scheduled_boot` jobs after `NOTIFICATION_EVALUATION_BOOT_STAGGER_MS` (default 15s).
- Jobs are **persistent in Redis/BullMQ** — survive PM2/container restarts.

## Event-trigger architecture

- `BusinessInsightsTriggerService` no longer uses `setTimeout` or `pendingTimers`.
- Events are appended to `notification:eval:pending:{orgId}` and a **delayed** BullMQ job is created:
  - `jobId`: `notification-evaluation:{orgId}:debounced`
  - `delay`: `NOTIFICATION_EVALUATION_DEBOUNCE_MS` (default 120s)
- Duplicate enqueue while job is `waiting`/`delayed`/`active` → **coalesced** (events kept in pending list).

## Locking

- **Acquire:** `SET key token NX PX ttl`
- **Release:** Lua compare-and-delete (token must match)
- **Heartbeat:** extend TTL every `NOTIFICATION_EVALUATION_LOCK_HEARTBEAT_MS` during long runs
- **Contention:** second worker sets `notification:eval:followup:{orgId}` and schedules follow-up job after first run completes

## Retry strategy

BullMQ job options (per queue util):

| Setting | Default |
|---------|---------|
| `attempts` | 4 |
| `backoff` | exponential, 5s base |
| `removeOnComplete` | count 500 / 24h |
| `removeOnFail` | count 2000 / 7d (DLQ visibility) |

Failed jobs remain inspectable via BullMQ `failed` set / ops tooling.

## Run context

Each job carries:

- `runId`, `organizationId`, `triggerType`, `triggerClass`, `scheduledAt`

`executeRun` records:

- `startedAt`, `completedAt`, `durationMs`
- `candidateCount` / `publishedCount` (from insights run)
- `createdCount`, `updatedCount`, `resolvedCount`, `deduplicatedCount`, `failureCount` (via `notificationRunContextStorage` in `NotificationCoreService`)

Structured logs: `notification.evaluation.*` (see `NotificationEvaluationObservabilityService`).

## Crash recovery

| Scenario | Behavior |
|----------|----------|
| Process crash during debounce | Delayed BullMQ job remains — fires after delay |
| Crash while job active | Lock TTL expires; follow-up flag + pending events preserved in Redis |
| Backend restart during debounce | No local timer loss — job still in queue |
| Duplicate job delivery | Org lock serializes; DB unique constraint prevents duplicate notifications |
| Redis briefly unavailable | Lock acquire fails gracefully; enqueue falls back to inline run when workers disabled |

## Multi-instance behavior

- N API/PM2 instances may enqueue jobs — **deterministic jobId** prevents duplicate queued debounce jobs per org/class.
- M worker instances process queue — **org lock** ensures one active evaluation per organization.
- Scheduler on every instance would duplicate cron enqueues — jobs coalesce via jobId (only one `scheduled` job per org waiting).

## Operations

### Environment variables

```bash
NOTIFICATION_EVALUATION_QUEUE_ENABLED=true   # default true; false = inline executeRun
NOTIFICATION_EVALUATION_DEBOUNCE_MS=120000
NOTIFICATION_EVALUATION_LOCK_TTL_MS=300000
NOTIFICATION_EVALUATION_LOCK_HEARTBEAT_MS=60000
NOTIFICATION_EVALUATION_JOB_ATTEMPTS=4
NOTIFICATION_EVALUATION_JOB_BACKOFF_MS=5000
NOTIFICATION_EVALUATION_BOOT_STAGGER_MS=15000
NOTIFICATIONS_V2=false                     # shadow mode for V2 persistence
```

### Verify queue

```bash
# Redis CLI — pending events for an org
LRANGE notification:eval:pending:{orgId} 0 -1

# BullMQ — inspect failed jobs (ops dashboard or redis keys under bull:notification.evaluation:*)
```

### Live integration test

```bash
NOTIFICATION_EVALUATION_LIVE_INTEGRATION=1 npm test -- notification-evaluation.live.integration
```

## Known limits

- Cron enqueue runs on **each** backend instance unless external cron leader election is added — mitigated by deterministic jobId coalescing per org.
- Inline fallback when Redis unavailable at bootstrap does not provide cross-instance serialization (logged warning).
- V2 notification ingest from inline producer hooks (driving assessment, technical observations) remains event-driven; batch path is BI evaluation queue.
