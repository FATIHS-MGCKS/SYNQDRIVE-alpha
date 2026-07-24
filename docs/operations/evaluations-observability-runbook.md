# Auswertungen & Forecast Pipeline — Observability Runbook

**Owner:** `evaluations` (Business Insights / Auswertungen / Forecast)  
**Dashboard:** Grafana UID `synqdrive-evaluations` (`backend/monitoring/grafana/dashboards/synqdrive-evaluations.json`)  
**Metrics prefix:** `synqdrive_evaluations_*` (registered via `EvaluationsMetricsService` → shared `TripMetricsService` registry)  
**Scrape:** `GET /api/v1/metrics` (Bearer-protected)

## Scope

This runbook covers production observability for:

- Auswertungen API (`/dashboard-insights`, `/data-analyse`)
- Business-insights detector pipeline (`BusinessInsightsService`)
- BullMQ `notification.evaluation` worker path
- Scheduler enqueue (`BusinessInsightsScheduler`)
- Data-source freshness, DB slow queries, Redis coalesce/lock path
- Forward-compatible forecast hooks (`synqdrive_evaluations_forecast_*`)

**Out of scope:** Per-tenant drill-down in Prometheus — tenant IDs are **never** metric labels. Use structured logs with `correlationId` (`eval-*`) and hashed `orgRef` (first 8 chars) only in logs.

## Cardinality & privacy rules

| Allowed labels | Forbidden |
|----------------|-----------|
| `route`, `method`, `status_class`, `result`, `detector`, `trigger_class`, `source`, `freshness`, `cache`, `operation`, `severity`, `level` | `org_id`, `organization_id`, `vehicle_id`, `customer_id`, PII |

## Threshold summary

| Signal | Warning | Critical |
|--------|---------|----------|
| API p95 latency | > 2s (10m) | > 5s (5m) |
| API error rate | > 5% (15m) | — |
| Insights run failure rate | > 10% (30m) | — |
| Detector errors | > 0.05/s sustained (30m) | — |
| DB slow queries (>1s) | ≥ 10 in 15m | — |
| `notification.evaluation` queue lag p95 | > 300s (10m) | — |
| Scheduler enqueue failures | — | ≥ 2 in 1h |
| Redis errors | ≥ 5 in 15m | — |
| Missing data sources | ≥ 5 in 30m | — |
| Severe KPI jumps | ≥ 3 in 1h | — |

## General response

1. Open Grafana **SynqDrive — Auswertungen & Forecast Pipeline**.
2. Confirm `up{job="synqdrive-backend"}` and `GET /api/v1/health`.
3. Check shared queue panels on **SynqDrive Ops** (`synqdrive_queue_lag_seconds`, `synqdrive_queue_failed_jobs`).
4. Search backend logs for `correlationId` starting with `eval-` and message keys `evaluations.*`.
5. Do not page on forecast alerts until fc.* backend is enabled in production.

**Clear condition:** each alert in `backend/monitoring/prometheus/alerts.yml` defines `clear_condition` — wait for the full window before resolving.

---

## EvaluationsApiLatencyP95High

**Severity:** warning

### Check

- Grafana: API-Latenz panel — which `route` is slow (`dashboard_insights`, `data_analyse`, `dashboard_insights_summary`).
- DB panel: `synqdrive_evaluations_db_query_duration_seconds` for `insights_active_read`.
- Traffic volume: alert requires `> 0.05` req/s — low traffic may self-clear.

### Mitigate

- Inspect Postgres load and missing indexes on `dashboard_insight` / `dashboard_insight_run`.
- Verify no runaway polling from frontend Auswertungen page.
- Scale backend replicas if CPU/memory panels show saturation.

---

## EvaluationsApiLatencyP95Critical

**Severity:** critical

### Check

- Same as warning; prioritize `result="error"` routes and 5xx `status_class`.
- Check for deadlock or long transactions during `publishInsights`.

### Mitigate

- Temporarily reduce `maxVisibleInsights` via tenant policy if a single large tenant dominates (ops DB change, not metric label).
- Restart backend only after identifying root cause.

---

## EvaluationsApiErrorRateHigh

**Severity:** warning

### Check

- `synqdrive_evaluations_api_requests_total` by `route` and `status_class`.
- Auth/org-scoping failures (4xx) vs server errors (5xx).
- Recent deploy or Prisma migration status.

### Mitigate

- Fix auth/scoping misconfiguration if 4xx spike.
- Roll back deploy if 5xx correlated with release.

---

## EvaluationsInsightsRunFailureRateHigh

**Severity:** warning

### Check

- `synqdrive_evaluations_insights_runs_total{result="error"}` by `trigger_class`.
- Logs: `evaluations.insights.run_completed` with `result=error`.
- Per-run `dashboard_insight_run.error_message` in DB (ops query, not metrics).

### Mitigate

- Identify failing stage: detector, gating, publish, or bridge.
- Check Prisma connectivity and transaction timeouts on `publishInsights`.

---

## EvaluationsDetectorFailuresSustained

**Severity:** warning

### Check

- `synqdrive_evaluations_detector_runs_total{result="error"}` by `detector`.
- Logs: `evaluations.detector.failed` with `detector` and `correlationId`.
- `synqdrive_evaluations_data_source_total{freshness="error"}` for upstream mapping.

### Mitigate

- Map detector → sources via `evaluations-detector-sources.ts`.
- Restore upstream module (bookings, rental_health, telemetry, compliance).
- Disable specific detector type in tenant policy if isolated bad data.

---

## EvaluationsSlowDbQueriesElevated

**Severity:** warning

### Check

- `synqdrive_evaluations_db_slow_queries_total` by `operation`.
- `synqdrive_evaluations_db_query_duration_seconds` p95.

### Mitigate

- Add/verify indexes on `dashboard_insight(organizationId, isActive, priority)`.
- Run `pruneOldData` if retention backlog (scheduler runs every 48 cycles).

---

## EvaluationsNotificationEvaluationQueueLagHigh

**Severity:** warning

### Check

- `synqdrive_queue_lag_seconds{queue="notification.evaluation"}` on Ops dashboard.
- Worker concurrency (`NotificationEvaluationProcessor`, default 2).
- Lock contention: `synqdrive_evaluations_cache_total{cache="coalesce",result="hit"}`.

### Mitigate

- Ensure `WORKERS_ENABLED` / Redis healthy; PM2 worker process running.
- Increase worker concurrency cautiously (DB pressure per org).
- Investigate per-org lock hold times in logs (`notification.evaluation.lock_*`).

---

## EvaluationsSchedulerFailures

**Severity:** critical

### Check

- `synqdrive_evaluations_scheduler_runs_total{result="error"}`.
- Logs: `evaluations.scheduler.failed`.
- Cron `2,32 * * * *` firing (Nest `@Cron`).

### Mitigate

- Verify Redis queue enqueue (`NOTIFICATION_EVALUATION_QUEUE_ENABLED`).
- Check `getActiveOrganizationIds` Prisma query.
- Manual trigger: restart backend to fire `scheduled_boot` stagger.

---

## EvaluationsRedisErrorsSustained

**Severity:** warning

### Check

- `synqdrive_evaluations_redis_errors_total` by `operation` (`lock_acquire`, `pending_events_rpush`, `follow_up_mark`, `pending_events_drain`).
- Redis server memory/eviction and connectivity.

### Mitigate

- Restore Redis; evaluation jobs will inline-fallback when queue unavailable (higher load).
- Review lock TTL (`NOTIFICATION_EVALUATION_LOCK_TTL_MS`).

---

## EvaluationsDataSourceMissingElevated

**Severity:** warning

### Check

- `synqdrive_evaluations_source_missing_total` by `source`.
- `synqdrive_evaluations_data_source_total{freshness="missing"}` and `stale` for `insights_snapshot`.

### Mitigate

- Ensure scheduled runs completing (`synqdrive_evaluations_scheduler_orgs_enqueued` > 0).
- Verify upstream feeds: bookings, fleet, service, rental_health, telemetry, compliance.

---

## EvaluationsKpiJumpSevere

**Severity:** warning

### Check

- `synqdrive_evaluations_kpi_jump_total{severity="severe"}`.
- Logs: `evaluations.kpi.jump_detected` with `previousCount` / `currentCount`.
- Recent detector or policy changes.

### Mitigate

- Compare last runs in `dashboard_insight_run` for affected org (DB, not metrics).
- Validate detector regression after deploy; thresholds in `evaluations-kpi-anomaly.util.ts`.

---

## EvaluationsForecastErrors

**Severity:** info

### Check

- `synqdrive_evaluations_forecast_total{result="error|unavailable"}`.

### Mitigate

- **Expected** while fc.* forecast backend is not deployed — metric stubs only.
- When forecast ships: wire `recordForecastOperation` in forecast service and raise severity.

---

## EvaluationsForecastDriftCritical

**Severity:** warning

### Check

- `synqdrive_evaluations_forecast_drift_total{level="critical"}`.
- Logs: `evaluations.forecast.drift`.

### Mitigate

- Review model inputs vs published KPIs on Auswertungen page.
- Disable forecast feature flag if user-facing numbers are wrong.

---

## Local verification

```bash
cd backend
npm test -- --testPathPattern='evaluations-|prometheus-config'
```

Manual smoke (dev):

1. Start backend with Redis + workers.
2. `curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/api/v1/metrics | grep synqdrive_evaluations`
3. Hit `GET /api/v1/organizations/:orgId/dashboard-insights` and confirm counter increments.
4. Import Grafana dashboard JSON and validate panels render against Prometheus.

## Infrastructure dependencies

| Dependency | Required for |
|------------|----------------|
| Prometheus scraping `/api/v1/metrics` | All metrics |
| Grafana + dashboard provisioning | Dashboards |
| Alertmanager routing `owner: evaluations` | Paging |
| Redis | BullMQ `notification.evaluation`, locks, coalesce |
| Postgres | Insights persistence, detectors |
| `collectDefaultMetrics` (TripMetricsService) | CPU/memory panels |

## Key files

- `backend/src/modules/evaluations-observability/*`
- `backend/src/modules/business-insights/business-insights.service.ts`
- `backend/src/modules/business-insights/business-insights-scheduler.service.ts`
- `backend/src/modules/notifications/runtime/notification-evaluation.service.ts`
- `backend/monitoring/prometheus/alerts.yml` (group `synqdrive_evaluations`)
- `backend/monitoring/grafana/dashboards/synqdrive-evaluations.json`
