# Fleet Health Service Grafana / Prometheus Ops (V4.9.731)

Operational dashboard for **Zustand & Service** (Fleet Health Service), built on the existing SynqDrive monitoring stack (`backend/monitoring/`) and the `synqdrive_fleet_health_*` metrics from P59.

## Files

| File | Purpose |
|------|---------|
| `monitoring/grafana/dashboards/synqdrive-fleet-health-service.json` | Fleet Health Service ops dashboard |
| `monitoring/prometheus/alerts.yml` | Alert group `synqdrive_fleet_health` (P59) |
| `docs/architecture/fleet-health-prometheus-metrics.md` | Metric catalog |

Provisioning follows the same pattern as `synqdrive-battery-v2.json` via `grafana/provisioning/dashboards/default.yml`.

## Dashboard panels

1. **Übersicht** — ready availability share, blocking service cases, battery publication coverage, refresh partial-failure rate
2. **Health Availability** — `synqdrive_fleet_health_availability_total` by `level` (`ready` / `partial` / `unavailable`)
3. **Modul-Coverage** — `synqdrive_fleet_health_module_status_total` by `module` + `state`
4. **Technische Blockaden** — `synqdrive_fleet_health_technical_blockade_total` by `source`
5. **Stale & unknown Module** — `synqdrive_fleet_health_stale_module_total` + `module_status_total{state="unknown"}`
6. **Fleet-Health-Latenz** — rental-health request + fleet-summary histogram p50/p95
7. **API-Fehler** — task / case / vendor API error counters
8. **Service Cases nach Status** — `synqdrive_fleet_health_service_case_total` by `status`
9. **Tasks** — health→task ambiguous legacy match audit + task API errors (no task-by-status counter yet)
10. **Blockierende Cases** — `synqdrive_fleet_health_blocking_service_case_total`
11. **Battery publication coverage** — `synqdrive_fleet_health_battery_publication_coverage_ratio`
12. **Vendor-Fehler** — `synqdrive_fleet_health_vendor_api_errors_total`
13. **Queues** — `synqdrive_queue_failed_jobs`, `synqdrive_queue_lag_seconds` p95, refresh partial failures

## Alerts & SLOs (`synqdrive_fleet_health`)

See `docs/architecture/fleet-health-service-readiness-alerts-slo.md` and `docs/runbooks/fleet-health-service-readiness.md`.

Recording rules pre-compute fleet-size-aware ratios and p99 latencies. Alerts use `for` durations, `owner: fleet-health-service`, severity, runbook links, and documented clear conditions. Small-fleet guardrails prevent paging on 1–3 vehicle tenants.

Key alerts:

- `FleetHealthUnavailableShareHigh` — > 20% unavailable when fleet ≥ 10
- `FleetHealthRentalRequestLatencyP99High` / `FleetHealthSummaryLatencyP99High`
- `FleetHealthBatteryPublicationCoverageLow` / `Absent`
- `FleetHealthTaskApiErrorsSustained` / `Case` / `Vendor`
- `FleetHealthUnknownModuleShareHigh`
- `FleetHealthTaskAutomationEnqueueFailures`
- `FleetHealthBlockingCasesBacklogHigh` (info)
- `FleetHealthQueueFailedJobsElevated`

## Deploy

After merging to `main`, monitoring configs refresh automatically at the end of `vps-deploy-release.sh` (`MONITORING_AUTO_REFRESH=auto` default). The refresh script copies `alerts.yml`, reloads Prometheus (`POST /-/reload`), syncs Grafana provisioning + dashboards (including this file), and restarts Grafana when the container is already running.

First-time VPS bootstrap (containers missing):

```bash
MONITORING_AUTO_BOOTSTRAP=1 bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
```

Manual refresh only:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
```

Grafana UID: `synqdrive-fleet-health-service` — linked from SynqDrive Ops dashboard tag navigation (`tags: ["synqdrive"]`).
