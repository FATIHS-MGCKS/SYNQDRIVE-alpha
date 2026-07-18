# Stations V2 Grafana / Prometheus Ops (V4.9.650)

Operational dashboards for Stations V2, built on the existing SynqDrive monitoring stack (`backend/monitoring/`).

## Files

| File | Purpose |
|------|---------|
| `monitoring/grafana/dashboards/synqdrive-stations-v2.json` | Stations V2 ops dashboard |
| `src/modules/stations/station-metrics.service.ts` | Prometheus counters/histograms |
| `src/modules/stations/stations-metrics.interceptor.ts` | HTTP latency + scope-denied recording |
| `scripts/ops/vps-setup-grafana.sh` | Copies dashboard to VPS |

Provisioning follows the same pattern as Battery V2 via `grafana/provisioning/dashboards/default.yml`.

## Metrics

All metrics use the `synqdrive_` prefix. **No IDs, names, or license plates** appear as labels.

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `synqdrive_stations_total` | gauge | `status` | MetricsRefreshService (5 min groupBy) |
| `synqdrive_station_scope_denied_total` | counter | `gate`, `reason` | StationsMetricsInterceptor (403) |
| `synqdrive_station_summary_requests_total` | counter | `surface` | StationSummaryReadModelService |
| `synqdrive_station_summary_partial_total` | counter | `surface`, `reason` | StationSummaryReadModelService |
| `synqdrive_station_assignment_total` | counter | `kind`, `outcome` | StationsService (home/current commands) |
| `synqdrive_station_assignment_conflict_total` | counter | `kind`, `reason` | StationsService + VehicleStationTransferService |
| `synqdrive_current_station_correction_total` | counter | `outcome` | StationsService |
| `synqdrive_station_transfer_total` | counter | `command`, `outcome` | VehicleStationTransferService |
| `synqdrive_station_booking_rule_total` | counter | `surface`, `outcome` | StationBookingRulesService |
| `synqdrive_station_booking_rule_blocked_total` | counter | `surface`, `reason` | StationBookingRulesService |
| `synqdrive_station_booking_override_total` | counter | `reference_type` | StationRuleManualOverrideService |
| `synqdrive_station_capacity_status_total` | counter | `status` | StationSummaryReadModelService |
| `synqdrive_station_archive_total` | counter | `outcome` | StationsService |
| `synqdrive_station_restore_total` | counter | `outcome` | StationsService |
| `synqdrive_station_http_requests_total` | counter | `route`, `method`, `status_class` | StationsMetricsInterceptor |
| `synqdrive_station_http_request_duration_seconds` | histogram | `route`, `method`, `status_class` | StationsMetricsInterceptor |

HTTP routes are normalized to templates (`:orgId`, `:id`) — UUIDs never appear in labels.

## Dashboard sections

1. **Stationsbestand** — `synqdrive_stations_total` by status, archive/restore rates
2. **Scope/Authz** — scope denials, HTTP 4xx/5xx
3. **Fleet Positioning** — assignments, version conflicts, current corrections
4. **Booking Rules** — rule evaluations, blocked reasons, manual overrides
5. **Kapazität** — capacity status observations from summary KPI assembly
6. **Transfers** — transfer command outcomes by command type
7. **API-Latenzen und Fehler** — HTTP rate and p50/p95 latency by route template
8. **Partial Data** — summary partial ratio and reasons

## Deploy

After merging to `main`:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
```

Grafana UID: `synqdrive-stations-v2` — linked from SynqDrive Ops dashboard tag navigation.
