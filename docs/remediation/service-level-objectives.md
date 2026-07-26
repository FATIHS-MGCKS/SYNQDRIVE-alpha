# Service Level Objectives — Phase 2F.7

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Production SLIs, SLO targets, error budgets, escalation thresholds, Prometheus rules

---

## Executive summary

Phase 2F.7 defines **production-ready SLIs and SLOs** for eight platform capabilities. Each SLO has:

- A measurable **Service Level Indicator** (Prometheus recording rule)
- A **target** over a rolling window
- An **error budget** (allowed bad events before customer impact)
- **Escalation thresholds** (warning vs critical alerts)

Implementation: `backend/monitoring/prometheus/alerts-slo.yml` (recording rules + `Slo*` alerts).

---

## SLO framework

### Rolling windows

| Window | Use |
|--------|-----|
| 5m / 10m | Fast detection, burn-rate alerts |
| 30m / 1h | Operational SLI evaluation |
| 30d | Error budget accounting (availability) |

### Error budget math

For availability SLO target **T** (e.g. 99.9% = 0.999):

```
allowed_bad_fraction = 1 - T
error_budget_remaining = 1 - (actual_bad_fraction / allowed_bad_fraction)
```

| SLO target | Allowed downtime / 30 days |
|------------|--------------------------|
| 99.9% | ~43 minutes |
| 99.5% | ~3.6 hours |
| 99.0% | ~7.2 hours |
| 95.0% | ~36 hours |

### Burn-rate alerting (API availability)

Google SRE multi-window burn for **99.9%** monthly SLO:

| Alert | Short window | Long window | Burn multiplier | Meaning |
|-------|--------------|-------------|-----------------|---------|
| `SloApiAvailabilityFastBurn` | 5m | 1h | 14.4× / 6× | Budget consumed in hours if sustained |

---

## SLO catalog

### 1. API availability

**User promise:** The SynqDrive API is reachable and can serve health/readiness checks.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:api_scrape_up:ratio5m` = `avg(up{job="synqdrive-backend"})` |
| **Supplementary SLI** | `synqdrive:slo:api_blackbox_up:ratio5m` = blackbox `probe_success` (when deployed) |
| **SLO target** | **99.9%** over 30 days |
| **Measurement** | Prometheus scrape of `/api/v1/metrics` every 30s; optional blackbox probe on `/api/v1/health` |
| **Error budget** | 0.1% unavailability ≈ **43 min / month** |
| **Recording rules** | `synqdrive:slo:api_scrape_up:ratio5m`, `synqdrive:slo:api_availability:error_budget_remaining:30d` |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Critical | Fast burn (14.4× budget) | `SloApiAvailabilityFastBurn` |
| Critical | 30d budget exhausted | `SloApiAvailabilityBudgetExhausted` |
| Critical | Scrape down | `SynqDriveMetricsScrapeDown` (alerts.yml) |

**Runbook:** Check PM2, nginx, Postgres/Redis readiness (`GET /api/v1/health/readiness`), VPS disk.

---

### 2. API latency

**User promise:** API responses remain within acceptable latency under normal load.

| Item | Definition |
|------|------------|
| **SLI (synthetic)** | `synqdrive:slo:api_blackbox_latency_p95:5m` — blackbox `probe_duration_seconds` p95 |
| **SLI (surfaces)** | `synqdrive:slo:api_surface_latency_p95:10m` — p95 across evaluations, notification, fleet_page histograms |
| **SLO target** | Synthetic p95 **< 800ms**; authenticated surfaces p95 **< 2s** (warning), **< 5s** (critical) |
| **Measurement** | Blackbox exporter + domain histograms (`synqdrive_*_api_request_duration_seconds`) |
| **Error budget** | 5% of requests may exceed 800ms synthetic before warning (operational, not strict probabilistic) |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Blackbox p95 > 800ms for 15m | `SloApiLatencyP95High` |
| Critical | Surface p95 > 5s with traffic | `SloApiSurfaceLatencyP95Critical` |
| Warning | Evaluations p95 > 2s | `EvaluationsApiLatencyP95High` (alerts.yml) |

**Note:** Global HTTP middleware latency SLI is a future enhancement. Current SLOs use synthetic probes + instrumented high-traffic routes.

---

### 3. Queue processing

**User promise:** Background jobs are processed promptly; failed-job backlog stays bounded.

| Item | Definition |
|------|------------|
| **SLI (lag)** | `synqdrive:slo:queue_lag_p95:10m` — p95 `synqdrive_queue_lag_seconds` per queue |
| **SLI (failures)** | `synqdrive:slo:queue_failed_jobs:sum` — sum of `synqdrive_queue_failed_jobs` |
| **SLI (job failure rate)** | `synqdrive:slo:queue_job_failure_ratio:30m` — failures / processed jobs |
| **SLO target** | Lag p95 **< 120s**; failed jobs **< 25** without growth |
| **Measurement** | BullMQ lag histogram + failed job gauges (60s refresh) |
| **Error budget** | 5% job failure ratio over 30m before investigation |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Lag p95 > 120s | `SloQueueLagP95High` |
| Critical | Failed jobs > 25 and growing | `SloQueueFailedJobsBudgetBurn` |
| Warning | Generic lag | `QueueLagHigh` (alerts.yml) |

---

### 4. Stripe / payments

**User promise:** Stripe Connect webhooks reconcile reliably; checkout creation succeeds.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:stripe_webhook_success_ratio:30m` |
| **SLI** | `synqdrive:slo:stripe_checkout_success_ratio:30m` |
| **SLI** | `synqdrive:slo:stripe_reconciliation_mismatch:1h` (must be 0) |
| **SLO target** | Webhook success **≥ 99.5%** over 30d; **zero** reconciliation mismatches |
| **Measurement** | `synqdrive_payment_*` counters + health probe (Phase 2F.5) |
| **Error budget** | 0.5% webhook failures ≈ **3.6 h / month** |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Webhook success < 99.5% | `SloStripeWebhookSuccessLow` |
| Critical | Any reconciliation mismatch | `SloStripeReconciliationMismatch` |
| Warning | Checkout spike | `PaymentCheckoutFailureSpike` (alerts.yml) |

---

### 5. DIMO / telematics

**User promise:** Vehicle snapshot polling succeeds; fleet telemetry stays fresh.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:dimo_snapshot_success_ratio:30m` |
| **SLI** | `synqdrive:slo:dimo_stale_snapshots:1h` |
| **SLO target** | Snapshot success **≥ 95%** over 7d; stale snapshots **< 10/h** |
| **Measurement** | `synqdrive_dimo_snapshot_poll_total{result}` + stale counter |
| **Error budget** | 5% poll failures ≈ **8.4 h / week** at continuous polling |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Success < 95% | `SloDimoSnapshotSuccessLow` |
| Warning | Stale > 10/h | `SloDimoStaleSnapshotsHigh` |
| Warning | Success < 80% | `DimoSnapshotSuccessRateLow` (alerts.yml) |

---

### 6. Notifications

**User promise:** Notifications are delivered reliably; API remains healthy.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:notification_delivery_success_ratio:30m` |
| **SLI** | `synqdrive:slo:notification_api_error_ratio:15m` |
| **SLI** | `synqdrive:slo:notification_open_age_p95:1h` |
| **SLO target** | Delivery success **≥ 99%**; API errors **< 1%** (alert at 5%) |
| **Measurement** | Notification engine Prometheus metrics |
| **Error budget** | 1% delivery failures ≈ **7.2 h / month** |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Delivery < 99% | `SloNotificationDeliverySuccessLow` |
| Critical | API errors > 5% | `SloNotificationApiErrorRateHigh` |
| Warning | Outbox backlog | `NotificationOutboxBacklogHigh` (alerts.yml) |

---

### 7. AI platform

**User promise:** Document AI extraction and OCR complete successfully within latency bounds.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:ai_doc_extraction_success_ratio:30m` |
| **SLI** | `synqdrive:slo:ai_ocr_success_ratio:30m` |
| **SLI** | `synqdrive:slo:ai_extraction_latency_p95:10m` |
| **SLI** | `synqdrive:slo:ai_voice_webhook_success_ratio:30m` |
| **SLO target** | Extraction success **≥ 95%**; OCR **≥ 90%**; stage p95 **< 120s** |
| **Measurement** | Document extraction + OCR counters/histograms; voice webhook outcomes |
| **Error budget** | 5% extraction failures ≈ **8.4 h / week** at steady upload volume |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Extraction < 95% | `SloAiDocExtractionSuccessLow` |
| Warning | OCR < 90% | `SloAiOcrSuccessLow` |
| Warning | p95 > 120s | `SloAiExtractionLatencyP95High` |
| Warning | OCR rate limit | `DocumentExtractionOcrRateLimited` (alerts.yml) |

---

### 8. Dashboard (rental operator UI)

**User promise:** Fleet dashboard loads quickly with reliable health data.

| Item | Definition |
|------|------------|
| **SLI** | `synqdrive:slo:dashboard_fleet_ready_share` (from fleet health recording rules) |
| **SLI** | `synqdrive:slo:dashboard_fleet_page_latency_p99:10m` |
| **SLI** | `synqdrive:slo:dashboard_eval_api_error_ratio:15m` |
| **SLO target** | Ready share **≥ 80%** (fleet ≥ 10); fleet_page p99 **< 8s**; eval API errors **< 5%** |
| **Measurement** | `synqdrive_fleet_health_*` + evaluations API metrics |
| **Error budget** | 20% unavailable rows max (inverse of 80% ready target) |

**Escalation**

| Severity | Condition | Alert |
|----------|-----------|-------|
| Warning | Ready share < 80% | `SloDashboardFleetReadyShareLow` |
| Warning | fleet_page p99 > 8s | `SloDashboardFleetPageLatencyHigh` |
| Warning | Eval API errors > 5% | `SloDashboardEvalApiErrorsHigh` |

Aligns with existing `FleetHealth*` alerts in `alerts.yml` — SLO alerts add explicit `slo: dashboard` label for routing.

---

## Prometheus implementation

### Files

| File | Content |
|------|---------|
| `alerts-slo.yml` | 25 recording rules + 18 `Slo*` alerts |
| `prometheus.vps.yml` | Loads `alerts-slo.yml` |
| `prometheus.yml.example` | Local/docker reference |

### Recording rule prefix

All SLI time series use `synqdrive:slo:*` for Grafana panels and alert expressions.

**Example Grafana queries (Platform Overview):**

```promql
# API availability (30d budget remaining)
synqdrive:slo:api_availability:error_budget_remaining:30d

# DIMO success ratio
synqdrive:slo:dimo_snapshot_success_ratio:30m

# Notification delivery SLO
synqdrive:slo:notification_delivery_success_ratio:30m
```

### Alert labels

Every `Slo*` alert includes:

| Label | Example |
|-------|---------|
| `slo` | `api_availability`, `dimo`, `dashboard` |
| `owner` | `platform`, `billing`, `notifications` |
| `severity` | `warning` or `critical` |

Annotations: `summary`, `description`, `runbook_url`, `clear_condition`.

---

## Deployment

```bash
# VPS — after deploy
bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh

# Verify rules loaded
curl -s 'http://127.0.0.1:9090/api/v1/rules' | jq '.data.groups[].name' | grep slo
```

---

## Relationship to other phases

| Phase | Contribution to SLOs |
|-------|---------------------|
| 2F.1 | Observability architecture audit |
| 2F.2 | Alertmanager routing for `Slo*` alerts |
| 2F.4 | Queue depth/failure metrics |
| 2F.5 | `synqdrive_dependency_up` dependency SLIs (complementary) |
| 2F.6 | Grafana boards visualize `synqdrive:slo:*` series |

---

## Future enhancements

1. **Global HTTP SLI** — NestJS middleware histogram (`http_request_duration_seconds`) for all `/api/v1/*` routes
2. **SLO Grafana row** — dedicated error-budget panels on Platform Overview (2F.6 generator update)
3. **Alertmanager routes** — `slo` label → PagerDuty severity mapping
4. **Per-tenant SLO** — not supported (cardinality policy forbids `org_id` labels); use aggregate platform SLOs only

---

## Changes / Architektur

Updated in `ChangesView.tsx` and `ArchitekturView.tsx` (V4.9.904).
