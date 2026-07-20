# Fleet Health Service — Readiness Alerts & SLOs (V4.9.732)

Operational readiness rules for **Zustand & Service** (Fleet Health Service). Built on `synqdrive_fleet_health_*` metrics (P59), Grafana dashboard `synqdrive-fleet-health-service` (P60), and Prometheus rules in `backend/monitoring/prometheus/alerts.yml`.

## Files

| File | Purpose |
|------|---------|
| `monitoring/prometheus/alerts.yml` | Recording rules `synqdrive_fleet_health_slo` + alerts `synqdrive_fleet_health` |
| `docs/runbooks/fleet-health-service-readiness.md` | Operator runbook (response, owner, clear conditions) |
| `docs/architecture/fleet-health-prometheus-metrics.md` | Metric catalog |
| `docs/architecture/fleet-health-grafana-prometheus-ops.md` | Grafana dashboard |

## SLO catalog

All SLOs use **fleet-size guards** so small tenants with 1–3 vehicles do not page on normal operational noise.

| SLO | Target | Evaluation window | Recording rule | Alert |
|-----|--------|-------------------|----------------|-------|
| Fleet row readiness | ≥ 80% rows `ready` | 20m sustained | `synqdrive:fleet_health:ready_share` | inverse via `FleetHealthUnavailableShareHigh` |
| Fleet row unavailability | < 20% rows `unavailable` when fleet ≥ 10 | 20m | `synqdrive:fleet_health:unavailable_share` | `FleetHealthUnavailableShareHigh` |
| Rental health `fleet_page` latency p99 | < 8s | 15m | `synqdrive:fleet_health:rental_health_request_p99_seconds` | `FleetHealthRentalRequestLatencyP99High` |
| Fleet summary `page` latency p99 | < 10s | 15m | `synqdrive:fleet_health:fleet_summary_p99_seconds` | `FleetHealthSummaryLatencyP99High` |
| Battery publication coverage | ≥ 70% when ≥ 5 battery rows | 1h | `synqdrive_fleet_health_battery_publication_coverage_ratio` | `FleetHealthBatteryPublicationCoverageLow` |
| Battery publications present | not < 10% when ≥ 5 battery rows | 30m | same gauge | `FleetHealthBatteryPublicationCoverageAbsent` |
| Task API reliability | < 3 errors / 15m | 10m | counter increase | `FleetHealthTaskApiErrorsSustained` |
| Case API reliability | < 3 errors / 15m | 10m | counter increase | `FleetHealthCaseApiErrorsSustained` |
| Vendor API reliability | < 3 errors / 15m | 10m | counter increase | `FleetHealthVendorApiErrorsSustained` |
| Unknown module share | < 25% when fleet ≥ 10 and unknown ≥ 5 | 30m | `synqdrive:fleet_health:unknown_module_share` | `FleetHealthUnknownModuleShareHigh` |
| Partial refresh degradation | < 3 partial failures / 30m when fleet ≥ 10 | 15m | counter increase | `FleetHealthPartialRefreshFailuresSustained` |
| Task automation outbox | < 5 failures / 30m, backlog < 10 | 15m | outbox counters/gauge | `FleetHealthTaskAutomationEnqueueFailures` |
| Blocking case clearance | net reduction within 24h when fleet ≥ 15 | 6h | blocking gauge + delta | `FleetHealthBlockingCasesBacklogHigh` (info) |
| Queue failed jobs | < 5 absolute and < 2% of fleet rows | 30m | `synqdrive_queue_failed_jobs` | `FleetHealthQueueFailedJobsElevated` |

### Small-fleet guardrails

| Guard | Rationale |
|-------|-----------|
| `fleet_row_total >= 10` | Ratio alerts (unavailable, unknown) require a meaningful denominator |
| `battery_applicable_rows >= 5` | Battery coverage SLOs ignore tiny battery fleets |
| `blocking >= 5` and `fleet >= 15` | Blocking-case backlog is operational signal, not platform outage for micro-fleets |
| API error `increase >= 3` | Single transient failures on low traffic do not page |
| Latency alerts require request rate > 0.05/s | Avoids histogram noise on idle tenants |

## Alert labels

Every alert in `synqdrive_fleet_health` carries:

| Label | Value |
|-------|-------|
| `owner` | `fleet-health-service` |
| `severity` | `critical`, `warning`, or `info` |

Annotations include `runbook_url`, `clear_condition`, `summary`, and `description`.

## Recording rules (`synqdrive_fleet_health_slo`)

Pre-aggregated ratios and p99 histograms for dashboards and alert expressions:

- `synqdrive:fleet_health:fleet_row_total`
- `synqdrive:fleet_health:battery_applicable_rows`
- `synqdrive:fleet_health:ready_share`
- `synqdrive:fleet_health:unavailable_share`
- `synqdrive:fleet_health:unknown_module_share`
- `synqdrive:fleet_health:rental_health_request_p99_seconds`
- `synqdrive:fleet_health:fleet_summary_p99_seconds`

## Deploy

Prometheus reloads `alerts.yml` with the standard VPS setup (`vps-setup-prometheus.sh`). No deployment script changes in P61.
