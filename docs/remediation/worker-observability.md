# Worker Observability — Phase 2F.4

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** BullMQ workers, queues, schedulers, retries, dead letters, concurrency, duplicates

---

## Executive summary

Phase 2F.4 adds **first-class worker observability** across all 18 BullMQ queues, 19 processors, and 24 scheduler ticks. Metrics are emitted via:

1. **QueueEvents listeners** — job duration, failures, retries, stalls, deduplication (no per-processor edits)
2. **MetricsRefreshService** — queue depth gauges (waiting/active/delayed/failed) for **all** queues
3. **SchedulerObservabilityService** — instrumented scheduler ticks with duration + last-success timestamps

New alert file: `alerts-workers.yml` (11 rules).

---

## Worker inventory

### BullMQ queues (18)

| Queue | Processor | Concurrency | Notes |
|-------|-----------|-------------|-------|
| `dimo.snapshot.poll` | DimoSnapshotProcessor | default | jobId dedup per vehicle |
| `dimo.vehicle.sync` | DimoVehicleSyncProcessor | default | Job scheduler |
| `dimo.dtc.poll` | DimoDtcProcessor | default | Repeat scheduler |
| `dimo.tire.recalculation` | TireRecalculationProcessor | 1 | Hourly bucket jobId |
| `dimo.brake.recalculation` | BrakeRecalculationProcessor | 1 | Hourly |
| `dimo.trip-tracking` | TripTrackingProcessor | default | observeQueueLag |
| `trip.behavior.enrichment` | TripBehaviorEnrichmentProcessor | default | HF pipeline |
| `trip.driving-impact.compute` | DrivingImpactProcessor | default | Post-enrichment |
| `driving.intelligence.jobs` | DrivingIntelligenceJobProcessor | configured | DI V2 |
| `document.extraction` | DocumentExtractionProcessor | **3** | lockDuration 120s |
| `booking.document.generation` | BookingDocumentGenerationProcessor | default | Legal PDFs |
| `dtc.knowledge.enrichment` | DtcKnowledgeProcessor | **2** | AI enrichment |
| `notification.evaluation` | NotificationEvaluationProcessor | configured | Debounced |
| `notification.delivery` | NotificationDeliveryProcessor | **4** | Outbox dispatch |
| `payment.email` | PaymentEmailProcessor | default | Resend |
| `task.automation` | TaskAutomationOutboxProcessor | default | Workflow outbox |
| `battery.v2` | BatteryV2Processor | configured | Dead-letter table |
| `voice.webhook.process` | VoiceWebhookProcessor | configured | Twilio/EL |
| `connectivity.webhook.process` | DeviceConnectionWebhookProcessor | configured | DLQ path |

### Schedulers (24 ticks)

| Scheduler | Cadence | Queue producer |
|-----------|---------|----------------|
| `dimo.snapshot.enqueue` | 30s | dimo.snapshot.poll |
| `dimo.snapshot.sweep_failed` | 1h | cleanup failed |
| `dimo.dtc.poll` | 3h | Job scheduler upsert |
| `dimo.vehicle.sync` | on init | Job scheduler |
| `tire.recalculation` | 1h | tire queue |
| `brake.recalculation` | 1h | brake queue |
| `trip.tracking.recovery` | 2m | trip-tracking |
| `trip.analysis.recovery` | 5m | DI recovery |
| `trip.reconciliation.warm` | 15m | reconciliation |
| `trip.reconciliation.cold` | 4h | reconciliation |
| `trip.reconciliation.daily` | daily cron | reconciliation |
| `driving.analysis.reconciliation` | 10m | DI |
| `payment.connect.reconciliation` | 5m | payments |
| `billing.reconciliation` | interval | Stripe SaaS |
| `hm.health.polling` | 5m | HM API |
| `data.retention` | daily | PG cleanup |
| `storage.orphan.sweep` | weekly | storage |
| `battery.v2.reconciliation` | interval | battery.v2 |
| `battery.v2.retention` | daily | battery tables |
| `voice.retention` | daily | voice tables |
| `iam.data.retention` | daily | IAM |
| `document.retention` | daily | documents |
| `document.intake.action.recovery` | 2m | intake recovery |
| `document.extraction.recovery` | interval | document.extraction |

---

## Metrics implemented

### Queue depth (gauges, 60s refresh)

| Metric | Labels | Source |
|--------|--------|--------|
| `synqdrive_queue_waiting_jobs` | `queue` | BullMQ getJobCounts |
| `synqdrive_queue_active_jobs` | `queue` | BullMQ getJobCounts |
| `synqdrive_queue_delayed_jobs` | `queue` | BullMQ getJobCounts |
| `synqdrive_queue_failed_jobs` | `queue` | existing — all 18 queues |

### Job lifecycle (QueueEvents)

| Metric | Labels | Events |
|--------|--------|--------|
| `synqdrive_queue_lag_seconds` | `queue` | histogram — existing, observeQueueLag on 6 processors |
| `synqdrive_queue_job_duration_seconds` | `queue`, `result` | completed / failed |
| `synqdrive_queue_jobs_processed_total` | `queue`, `result` | success / failure |
| `synqdrive_queue_job_retries_total` | `queue` | failed with retries remaining |
| `synqdrive_queue_jobs_stalled_total` | `queue` | stalled |
| `synqdrive_queue_enqueue_duplicate_total` | `queue`, `reason` | deduplicated event + dimo enqueue skip |

### Scheduler (SchedulerObservabilityService)

| Metric | Labels |
|--------|--------|
| `synqdrive_scheduler_last_success_timestamp` | `scheduler` |
| `synqdrive_scheduler_run_duration_seconds` | `scheduler` |
| `synqdrive_scheduler_failures_total` | `scheduler` |

### Domain-specific dead letters (existing)

| Module | Metric / table |
|--------|----------------|
| Notifications | `synqdrive_notification_dead_letters_total` |
| Battery V2 | `synqdrive_battery_v2_dead_letter_backlog`, `battery_v2_job_dead_letter` |
| Connectivity | `synqdrive_connectivity_webhook_dead_letter_total` |
| IAM audit | `iam_audit_dead_letter_total` |
| Payments | `synqdrive_payment_email_dead_letter` |

---

## Alerts (`alerts-workers.yml`)

| Alert | Severity | Trigger |
|-------|----------|---------|
| `WorkerQueueWaitingBacklogHigh` | warning | sum waiting > 200 |
| `WorkerQueueWaitingBacklogCritical` | critical | sum waiting > 500 |
| `WorkerQueueDelayedJobsHigh` | warning | sum delayed > 100 |
| `WorkerJobStalledRateHigh` | warning | stalled rate > 0.05/s |
| `WorkerJobFailureRateHigh` | warning | failure rate > 15% |
| `WorkerJobRetryStorm` | warning | retry rate > 1/s |
| `WorkerEnqueueDuplicateSpike` | info | duplicate enqueue rate high |
| `WorkerJobDurationP99High` | warning | P99 > 300s per queue |
| `SchedulerStale` | warning | no success in 2h |
| `SchedulerFailuresElevated` | warning | >3 failures/hour |
| `WorkerQueuePerQueueWaitingCritical` | critical | single queue waiting > 100 |

Plus existing alerts in `alerts.yml`: `QueueLagHigh`, `QueueFailedJobsHigh`, `BullMQQueueBacklogCritical`, domain-specific queue alerts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ WorkerObservabilityModule (global)                               │
├─────────────────────────────────────────────────────────────────┤
│ WorkerQueueEventsService                                         │
│   └── QueueEvents × 18 queues → duration/fail/retry/stalled    │
│ MetricsRefreshService (extended)                                 │
│   └── getJobCounts × 18 → waiting/active/delayed/failed gauges   │
│ SchedulerObservabilityService                                    │
│   └── wraps all @Interval/@Cron scheduler ticks                │
│ WorkerObservabilityMetrics                                       │
│   └── registers metrics on TripMetricsService registry         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    GET /api/v1/metrics
                              │
                              ▼
              Prometheus → alerts-workers.yml → Alertmanager
```

---

## Gap analysis (before → after)

| Area | Before 2F.4 | After 2F.4 |
|------|-------------|------------|
| Queue depth | failed only, 14/18 queues | waiting/active/delayed/failed, **18/18** |
| Job duration | document extraction only | all queues via QueueEvents |
| Retries | none | `synqdrive_queue_job_retries_total` |
| Stalled jobs | none | `synqdrive_queue_jobs_stalled_total` |
| Duplicate enqueue | logs only | metric + QueueEvents deduplicated |
| Scheduler health | none | last_success + duration + failures |
| Concurrency | config only in code | visible via active_jobs gauge |
| Dead letter | per-domain metrics | documented + cross-linked |

### Remaining (out of scope)

| Item | Notes |
|------|-------|
| Per-job-type labels on duration | Would increase cardinality — use queue label only |
| BullMQ Board UI | Not in repo — use Grafana + Master Admin platform-health |
| Cross-queue dependency tracing | Future OpenTelemetry |

---

## Operator runbooks

### Queue backlog {#queue-backlog}

1. Master Admin → Platform Health → queue counts
2. Prometheus: `synqdrive_queue_waiting_jobs`
3. `pm2 logs synqdrive` — worker errors
4. Verify `WORKERS_ENABLED=true`

### Stalled jobs {#stalled-jobs}

1. Check `synqdrive_queue_jobs_stalled_total` rate
2. Review processor `lockDuration` vs job runtime
3. Redis connectivity / memory pressure

### Failures {#failures}

1. `synqdrive_queue_jobs_processed_total{result="failure"}`
2. Inspect failed jobs in Redis: BullMQ failed set per queue
3. Domain runbooks: notification, battery, connectivity docs

### Job duration {#job-duration}

1. Grafana/histogram: `synqdrive_queue_job_duration_seconds`
2. Compare P99 across queues
3. Scale concurrency only after identifying bottleneck

### Schedulers {#schedulers}

1. `synqdrive_scheduler_last_success_timestamp`
2. If stale: check `WORKERS_ENABLED`, scheduler logs
3. `synqdrive_scheduler_failures_total`

---

## Files

| Path | Role |
|------|------|
| `src/modules/worker-observability/` | Module, metrics, QueueEvents, scheduler wrapper |
| `monitoring/prometheus/alerts-workers.yml` | Worker alert rules |
| `src/modules/observability/metrics-refresh.service.ts` | Queue depth refresh |
| `src/modules/observability/queue-lag.util.ts` | Per-job lag on processor start |

---

## Verification

```bash
cd backend
npm test -- --testPathPattern="worker-observability|prometheus-config"

# Metrics spot-check (requires bearer token)
curl -s -H "Authorization: Bearer $METRICS_BEARER_TOKEN" \
  http://127.0.0.1:3001/api/v1/metrics | grep synqdrive_queue_waiting_jobs
```

---

## Related

- `docs/remediation/observability-architecture.md` (2F.1)
- `docs/remediation/alertmanager.md` (2F.2)
- `docs/remediation/infrastructure-monitoring.md` (2F.3)
- `docs/operations/notification-engine-observability-runbook.md`

---

*Phase 2F.4 implementation complete.*
