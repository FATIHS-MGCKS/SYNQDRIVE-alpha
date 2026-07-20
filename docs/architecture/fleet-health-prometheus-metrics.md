# Fleet Health Service Prometheus Metrics (V4.9.730)

Low-cardinality Fleet Health Service counters, histograms, and gauges registered on the shared `TripMetricsService` registry (`GET /api/v1/metrics`). No `vehicleId`, `organizationId`, license plates, or other high-cardinality labels.

## Metric catalog

| Prometheus name | Labels | Emitted from |
|-----------------|--------|--------------|
| `synqdrive_fleet_health_rental_health_request_duration_seconds` | `route`, `result` | `RentalHealthController` |
| `synqdrive_fleet_health_fleet_summary_duration_seconds` | `operation`, `result` | `RentalHealthSummaryService`, `RentalHealthFleetService` |
| `synqdrive_fleet_health_module_status_total` | `module`, `state` | Fleet summary row aggregation |
| `synqdrive_fleet_health_availability_total` | `level` (`ready`/`partial`/`unavailable`) | Fleet summary row aggregation |
| `synqdrive_fleet_health_technical_blockade_total` | `source` | `rental_blocked` rows |
| `synqdrive_fleet_health_stale_module_total` | `module` | Modules with `data_stale` |
| `synqdrive_fleet_health_service_case_total` | `status` | `ServiceCasesService.list` |
| `synqdrive_fleet_health_blocking_service_case_total` | — | Cases with `blocksRental` |
| `synqdrive_fleet_health_task_api_errors_total` | `operation`, `error_code` | `TasksService` list/summary failures |
| `synqdrive_fleet_health_case_api_errors_total` | `operation`, `error_code` | `ServiceCasesService` failures |
| `synqdrive_fleet_health_vendor_api_errors_total` | `operation`, `error_code` | `VendorsService` list/stats failures |
| `synqdrive_fleet_health_refresh_partial_failure_total` | `source` | Degraded summary rows / batch safe fallbacks |
| `synqdrive_fleet_health_health_task_ambiguous_legacy_match_total` | `outcome` | `TasksService.list` health-task match audit |
| `synqdrive_fleet_health_battery_publication_coverage_ratio` | `scope` | Share of battery-applicable rows with publication coverage |

### Route / operation label values

**Rental health routes:** `vehicle_detail`, `fleet_legacy_batch`, `fleet_page`

**Fleet summary operations:** `row`, `batch`, `page`

**Module keys:** `battery`, `tires`, `brakes`, `error_codes`, `service_compliance`, `complaints`, `vehicle_alerts`

**Module states:** `good`, `warning`, `critical`, `unknown`, `n_a`

## Integration

- Module: `backend/src/modules/fleet-health-observability/`
- Metrics service: `fleet-health-metrics.service.ts`
- Record helpers: `fleet-health-prometheus.metrics.ts`
- Facade: `fleet-health-observability.service.ts`
- Health→task match audit: `fleet-health-task-match.util.ts`

## Tests

- `fleet-health-prometheus.metrics.spec.ts`
- `fleet-health-task-match.util.spec.ts`
- `prometheus-config.spec.ts` (registry + forbidden labels)
- Alerts: `backend/monitoring/prometheus/alerts.yml` → `synqdrive_fleet_health`
