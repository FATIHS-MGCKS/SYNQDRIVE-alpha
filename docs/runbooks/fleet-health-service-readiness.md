# Fleet Health Service — Readiness Runbook

**Owner:** `fleet-health-service` (Platform + Rental Health + Service Center)  
**Dashboard:** Grafana UID `synqdrive-fleet-health-service`  
**Metrics:** `docs/architecture/fleet-health-prometheus-metrics.md`  
**SLOs:** `docs/architecture/fleet-health-service-readiness-alerts-slo.md`

## General response

1. Open Grafana **SynqDrive Fleet Health Service** and confirm the alert panel trend (not a single-scrape spike).
2. Check `GET /api/v1/health` and backend scrape `up{job="synqdrive-backend"}`.
3. Correlate with SynqDrive Ops queue panels (`synqdrive_queue_failed_jobs`, lag).
4. If tenant-specific: confirm org fleet size — small fleets may self-clear via guardrails.
5. Document incident in the ops channel with alert name, severity, and whether it is platform vs operational backlog.

**Abbruchkriterium (do not escalate further):** alert `clear_condition` met for the full `for` window, or fleet-size guard dropped below threshold.

---

## FleetHealthUnavailableShareHigh

**Severity:** critical  
**Entwarnung:** unavailable share < 15% for 10m, or `fleet_row_total < 10`.

### Check

- Grafana: Health Availability panel — `unavailable` vs `ready`/`partial`.
- Logs: `RentalHealthSummaryService`, `RentalHealthFleetService`, module evaluators with `_error` or safe-fallback paths.
- Partial refresh counter: `synqdrive_fleet_health_refresh_partial_failure_total`.

### Mitigate

- Identify failing module (`module_status_total{state="unknown"}` or stale modules).
- Restart backend only after root cause identified; prefer fixing upstream DIMO/DB/ClickHouse issues first.
- If single-tenant: verify vehicle count and whether unavailable rows are expected (new onboarding).

---

## FleetHealthRentalRequestLatencyP99High

**Severity:** warning  
**Entwarnung:** `fleet_page` p99 < 6s for 15m with sustained traffic.

### Check

- Grafana: Fleet-Health-Latenz → rental health request p95/p99.
- DB slow queries, Redis cache hit rate, fleet page size (pagination limits).
- `synqdrive_fleet_health_rental_health_request_duration_seconds` by `route` and `result`.

### Mitigate

- Reduce concurrent fleet-page refreshes if caused by UI storm.
- Inspect per-module evaluator latency; scale DB connections if pool exhausted.

---

## FleetHealthSummaryLatencyP99High

**Severity:** warning  
**Entwarnung:** summary `page` p99 < 8s for 15m.

### Check

- `synqdrive:fleet_health:fleet_summary_p99_seconds{operation="page"}`.
- Batch vs page operation split in metrics.

### Mitigate

- Same as rental latency; focus on summary aggregation path and N+1 module calls.

---

## FleetHealthBatteryPublicationCoverageLow

**Severity:** warning  
**Entwarnung:** coverage ≥ 0.75 for 30m, or battery rows < 5.

### Check

- Grafana: Battery publication coverage panel.
- Battery V2 dashboard: publications, assessments, snapshot success.
- `synqdrive_battery_publications_total` and `synqdrive_fleet_health_battery_publication_coverage_ratio`.

### Mitigate

- If publications stopped: follow Battery V2 runbook (`docs/runbooks/battery-health-v2-deployment.md` incident section).
- If snapshots healthy but coverage low: inspect battery-applicable vehicle set vs publication maturity gates.

---

## FleetHealthBatteryPublicationCoverageAbsent

**Severity:** critical  
**Entwarnung:** coverage > 0.5 for 20m.

### Check

- Confirm ratio near zero with `battery_applicable_rows >= 5` — publications likely stopped, not gradual drift.
- Battery queue dead-letter and job failure alerts.

### Mitigate

- Treat as Battery pipeline outage affecting fleet health display; escalate to battery-health owner.
- Do not mask by lowering fleet-health UI thresholds.

---

## FleetHealthPartialRefreshFailuresSustained

**Severity:** warning  
**Entwarnung:** zero partial failures for 30m.

### Check

- `refresh_partial_failure_total` by `source` label (`summary_batch`, etc.).
- Backend logs for degraded row fallbacks.

### Mitigate

- Fix failing submodule; partial failures are intentional degradation — sustained volume means user-visible incomplete fleet health.

---

## FleetHealthTaskApiErrorsSustained

**Severity:** warning  
**Entwarnung:** < 2 task API errors in trailing 15m.

### Check

- Error labels: `operation`, `error_code` on `synqdrive_fleet_health_task_api_errors_total`.
- Tasks service logs, DB connectivity, org scoping.

### Mitigate

- Fix Tasks API root cause; Fleet Health Service UI will show empty/stale Arbeiten until resolved.

---

## FleetHealthCaseApiErrorsSustained

**Severity:** warning  
**Entwarnung:** < 2 case API errors in trailing 15m.

### Check

- `synqdrive_fleet_health_case_api_errors_total` labels.
- ServiceCasesService list endpoint and Prisma errors.

### Mitigate

- Restore service cases API; Übersicht service-case sections depend on this list.

---

## FleetHealthVendorApiErrorsSustained

**Severity:** warning  
**Entwarnung:** < 2 vendor API errors in trailing 15m.

### Check

- Vendor list/stats endpoints, org filter, DB.

### Mitigate

- Fix VendorsService; Partner panel in Arbeiten degrades without vendor stats.

---

## FleetHealthUnknownModuleShareHigh

**Severity:** warning  
**Entwarnung:** unknown share < 20% for 30m, or unknown cells < 3.

### Check

- Stale vs unknown split in Grafana stale/unknown panel.
- DIMO snapshot success, module-specific ingestion (tires, brakes, battery).

### Mitigate

- Distinguish data gap (telemetry) from evaluator bug.
- Cross-check `synqdrive_dimo_snapshot_poll_total` success ratio.

---

## FleetHealthTaskAutomationEnqueueFailures

**Severity:** warning  
**Entwarnung:** < 2 outbox failures in 30m and backlog < 5.

### Check

- `synqdrive_task_automation_outbox_failed_total`, `synqdrive_task_automation_outbox_backlog`.
- Redis/BullMQ availability for task automation outbox worker.

### Mitigate

- Retry dead-letter outbox rows per `docs/runbooks/task-data-repair.md` patterns.
- Ensure task materialization workers running.

---

## FleetHealthBlockingCasesBacklogHigh

**Severity:** info  
**Entwarnung:** blocking count < 3, or 24h delta negative.

### Check

- Grafana: blockierende Cases + Service Cases nach Status.
- This is often **operational**, not platform — cases with `blocksRental` not being closed.

### Mitigate

- Notify fleet operations to close or reschedule blocking service cases.
- If cases cannot load due to API errors, fix case API first (see case error alert).

---

## FleetHealthQueueFailedJobsElevated

**Severity:** warning  
**Entwarnung:** failed jobs < 3 for 30m, or ratio < 1% of fleet rows.

### Check

- `synqdrive_queue_failed_jobs` by `queue` label.
- Correlate with global `QueueFailedJobsHigh` in `synqdrive_workers`.

### Mitigate

- Inspect failed job payloads in BullMQ admin / logs.
- Re-queue or fix poison messages affecting health-related workers (snapshots, task automation, battery).
