# Notification Engine — Observability Runbook (V4.9.876)

**Date:** 2026-07-26  
**Metrics endpoint:** `GET /api/v1/metrics`  
**Dashboard:** `backend/monitoring/grafana/dashboards/notification-engine-ops.json`  
**Alerts:** `backend/monitoring/prometheus/alerts.yml` → group `synqdrive_notifications`

Related: `docs/notification-engine-delivery-and-observability.md`

## Label cardinality policy

- **Never** use `organizationId`, `userId`, `vehicleId`, or free-text as Prometheus labels.
- Logs use `organizationRef` = first 8 characters of UUID only.
- Metric labels are bounded enums: `domain`, `severity`, `channel`, `error_code`, `event_type`, `source_type`, `reason`, `route`, `trigger_class`.

## Prometheus metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `synqdrive_notification_candidates_total` | `source_type`, `event_type` | Candidates submitted to ingest |
| `synqdrive_notification_candidates_rejected_total` | `reason` | Pre-ingest rejections |
| `synqdrive_notifications_created_total` | `domain` | New notifications |
| `synqdrive_notifications_updated_total` | `domain` | Active notification updates |
| `synqdrive_notifications_resolved_total` | `domain` | Resolutions |
| `synqdrive_notification_duplicate_conflicts_total` | — | Idempotency/fingerprint conflicts |
| `synqdrive_notification_ingest_duration_seconds` | `event_type` | Per-ingest latency |
| `synqdrive_notification_open_age_seconds` | `severity` | Open notification age (5m refresh) |
| `synqdrive_notification_outbox_pending` | — | Delivery outbox backlog |
| `synqdrive_notification_delivery_attempts_total` | `channel` | Dispatch attempts |
| `synqdrive_notification_delivery_failed_total` | `channel`, `error_code` | Failed deliveries |
| `synqdrive_notification_dead_letters_total` | `channel`, `error_code` | Terminal delivery failures |
| `synqdrive_notification_workflow_runs_total` | `lifecycle_event`, `result` | Workflow triggers |
| `synqdrive_notification_workflow_duplicates_suppressed_total` | `lifecycle_event` | Idempotent workflow reuse |
| `synqdrive_notification_api_requests_total` | `route`, `method`, `status_class`, `result` | REST API traffic |

## Structured log fields

All notification ops logs include where applicable:

`correlationId`, `organizationRef`, `eventType`, `notificationId`, `action`, `result`, `latencyMs`, `errorCode`

**Never logged:** title/body text, templateParams, customer PII, provider secrets.

## Alert runbook

### NotificationDeliveryBacklogHigh

1. Check `synqdrive_notification_outbox_pending` and `notification.delivery` queue.
2. Verify `WORKERS_ENABLED=true`, Resend credentials, worker logs `notification.delivery.*`.
3. Inspect `notification_delivery_outbox` for stuck `PROCESSING` rows.

### NotificationDeadLettersIncreasing

1. Grafana panel **Dead letters (1h)**.
2. Query `synqdrive_notification_dead_letters_total` by `channel`, `error_code`.
3. Fix recipient/config; replay dead-letter rows via ops when supported.

### NotificationIngestFailuresHigh

1. Search logs `notification.ingest.failure`.
2. Check evaluation run errors and registry validation.
3. Verify `NOTIFICATIONS_V2=true`.

### NotificationDuplicateConstraintViolations

1. Expected at low rate (idempotent enqueue).
2. Spike > 50/h — inspect duplicate fingerprint/outbox keys.

### NotificationOpenAgeHigh / NotificationCriticalOpenAgeHigh

1. Panel **Open age p95 by severity**.
2. Identify stale CRITICAL rows in DB; verify resolution policies and operator workflows.

### NotificationEvaluationRunsMissing

1. Confirm scheduler + `notification.evaluation` queue.
2. Check `synqdrive_notification_run_duration_seconds` and evaluation logs.

### NotificationEvaluationWorkerDown

1. `synqdrive_queue_failed_jobs{queue="notification.evaluation"}`.
2. Restart workers; inspect failed job payloads in Redis/BullMQ.

### NotificationApiErrorRateHigh

1. Panel **API error rate**; filter `synqdrive_notification_api_requests_total{result="error"}`.
2. Correlate with auth, org scoping, feature flag `NOTIFICATIONS_V2`.

### NotificationOutboxBacklogHigh

Alias alert for `synqdrive_notification_outbox_pending` — same response as delivery backlog.

## Privacy

- `toSafeMetricLabel()` sanitizes label values.
- Delivery errors sanitized via `sanitizeDeliveryErrorMessage()`.
- No `organizationId` in metric labels — logs only as `organizationRef`.
