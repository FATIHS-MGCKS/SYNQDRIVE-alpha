# Operator App — Observability Audit (2026-07)

Production-readiness Prompt 37: metrics, structured logs, health checks, alert thresholds.

## Architecture

- **`OperatorObservabilityModule`** (global) — `OperatorMetricsService`, `OperatorObservabilityService`, `OperatorHealthService`
- **`OperatorApiObservabilityInterceptor`** — operator route detection, request duration + error rate
- **`GET /api/v1/health/operator`** — queue, storage, outbox, workers snapshot
- Reuses **`TripMetricsService.registry`** (same `/metrics` endpoint as fleet/trips/document intake)

## Metric catalog

| Metric | Labels | Source |
|--------|--------|--------|
| `synqdrive_operator_api_requests_total` | route, method, status_class, result | API interceptor |
| `synqdrive_operator_api_request_duration_seconds` | route, method, result | API interceptor |
| `synqdrive_operator_handover_total` | kind, event, error_code | `BookingsHandoverService` |
| `synqdrive_operator_idempotency_replay_total` | scope | Handover idempotent replay |
| `synqdrive_operator_version_conflict_total` | surface | Task optimistic lock (when enabled) |
| `synqdrive_operator_draft_save_failure_total` | reason | Reserved for server draft sync |
| `synqdrive_operator_upload_total` | outcome | Document upload (`operator_app`) |
| `synqdrive_operator_upload_failure_total` | error_code | Document upload failures |
| `synqdrive_operator_ocr_failure_total` | error_code, retryable | Document OCR stage |
| `synqdrive_operator_document_verification_failure_total` | reason | Manual pickup check rejected |
| `synqdrive_operator_auth_denial_total` | reason | OrgScoping + Permissions guards |
| `synqdrive_operator_task_completion_failure_total` | error_code | `TasksService.completeTask` |
| `synqdrive_operator_outbox_failure_total` | outbox_type, error_code | Task automation outbox |
| `synqdrive_operator_orphan_cleanup_total` | outcome | Retention jobs (when wired) |
| `synqdrive_operator_retention_job_failure_total` | phase | Retention jobs (when wired) |
| `synqdrive_operator_upload_queue_backlog` | — | Health refresh (document.extraction waiting) |
| `synqdrive_operator_outbox_backlog` | — | Health refresh (task automation pending) |
| `synqdrive_operator_storage_health` | — | Document storage probe |

**No high-cardinality labels:** never `userId`, `customerId`, `bookingId`, email, or full `organizationId`.

## Structured logs

Prefix `operator.*` — JSON fields:

- `correlationId`, `requestId` (from `X-Request-Id` / `X-Correlation-Id`)
- `orgRef` — first 8 chars of org UUID when needed
- `route`, `method`, `statusCode`, `durationMs`, `errorCode`, `kind`, `scope`

No signature data, document content, or customer PII.

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness (process up) |
| `GET /health/readiness` | Postgres, Redis, workers, document extraction |
| `GET /health/operator` | Operator-specific queue/storage/outbox |

## Recommended alerts (Grafana/Prometheus)

| Alert | Expression | Severity |
|-------|------------|----------|
| Operator API 5xx rate | `sum(rate(synqdrive_operator_api_requests_total{status_class="5xx"}[5m])) / sum(rate(synqdrive_operator_api_requests_total[5m])) > 0.05` | warning |
| Handover failure burst | `sum(rate(synqdrive_operator_handover_total{event="completion_failure"}[5m])) > 0.2` | warning |
| Upload queue backlog | `synqdrive_operator_upload_queue_backlog > 200` | critical |
| Upload queue warning | `synqdrive_operator_upload_queue_backlog > 50` | warning |
| Storage down | `synqdrive_operator_storage_health == 0` | critical |
| Auth denial spike | `sum(rate(synqdrive_operator_auth_denial_total{reason="tenant_scope"}[15m])) > 1` | warning |
| Task completion failures | `sum(rate(synqdrive_operator_task_completion_failure_total[10m])) > 0.5` | warning |
| Outbox backlog | `synqdrive_operator_outbox_backlog > 500` | critical |

## Runbook

See `docs/runbooks/operator-app-incident-response.md`.

## Gaps / follow-ups

- Server-side handover draft sync metrics (`draft_save_failure`) await draft API merge (Prompt 34 branch).
- Orphan cleanup / retention failure counters await `OperatorRetentionModule` merge.
- Redis idempotency replay metric from Prompt 36 security branch complements handover DB replay.
- Grafana dashboard JSON not committed — wire panels in ops Grafana using metric names above.
