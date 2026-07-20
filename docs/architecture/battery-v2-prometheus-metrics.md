# Battery V2 Prometheus Metrics (V4.9.568)

Low-cardinality Battery V2 counters registered on the shared `TripMetricsService` registry (`GET /api/v1/metrics`). No vehicle IDs, license plates, org IDs, or other high-cardinality labels.

**Ops dashboards and alerts:** see `battery-v2-grafana-prometheus-ops.md` (V4.9.569).

## Metric catalog

| Prometheus name | Labels | Emitted from |
|-----------------|--------|--------------|
| `synqdrive_battery_provider_observation_total` | `signal`, `outcome` | Snapshot observation classify |
| `synqdrive_battery_provider_duplicate_total` | `signal`, `reason` | LV/HV duplicate observation skips |
| `synqdrive_battery_jobs_total` | `job_type`, `outcome` | Job enqueue + completion |
| `synqdrive_battery_jobs_failed_total` | `job_type`, `error_code` | Job processor failures |
| `synqdrive_battery_jobs_dead_letter_total` | `job_type`, `error_code` | Dead-letter moves |
| `synqdrive_battery_rest_windows_total` | `window`, `outcome` | LV rest window FSM |
| `synqdrive_battery_rest_measurements_total` | `window`, `quality` | REST target evaluation |
| `synqdrive_battery_rest_missed_total` | `window` | REST MISSED quality |
| `synqdrive_battery_rest_contaminated_total` | `window` | REST contamination quality |
| `synqdrive_battery_start_proxy_total` | `outcome` | Start proxy extraction |
| `synqdrive_battery_start_insufficient_coverage_total` | — | Cadence gate insufficient coverage |
| `synqdrive_hv_recharge_segments_total` | `trigger`, `outcome` | HV recharge reconcile |
| `synqdrive_hv_charge_sessions_total` | `trigger`, `change` | HV session persist |
| `synqdrive_hv_capacity_observations_total` | `quality` | HV M2 shadow observations |
| `synqdrive_hv_capacity_sessions_qualified_total` | `qualified` | HV shadow session eligibility |
| `synqdrive_battery_assessments_total` | `scope`, `mode`, `outcome` | LV assessment recompute |
| `synqdrive_battery_publications_total` | `maturity`, `outcome` | LV publication update |

### Supplementary ops metrics (V4.9.569)

| Prometheus name | Labels | Emitted from |
|-----------------|--------|--------------|
| `synqdrive_battery_capability_signals_total` | `signal`, `status` | Capability preflight |
| `synqdrive_hv_capacity_m2_session_cv` | — | M2 session summary CV |
| `synqdrive_hv_capacity_method_conflict_total` | `outcome` | M3 validation agree/conflict |
| `synqdrive_battery_postgres_table_rows` | `table` | MetricsRefreshService cron |

### Pipeline observability (FHS Phase 1 P9)

| Prometheus name | Labels | Emitted from |
|-----------------|--------|--------------|
| `synqdrive_battery_v2_jobs_enqueue_total` | `job_type`, `outcome` | Job producer (`success` / `failed`) |
| `synqdrive_battery_v2_jobs_enqueue_suppressed_total` | `job_type`, `reason` | Producer suppressions (`dead_letter`, `duplicate`, `workers_disabled`) |
| `synqdrive_battery_v2_reconciliation_enqueued_total` | `category` | Reconciliation tick per category |
| `synqdrive_battery_v2_publication_coverage_total` | `scope`, `state` | Publication service (`published` / `skipped`) |
| `synqdrive_battery_v2_publication_age_hours` | `maturity` | Publication evidence age histogram |
| `synqdrive_battery_v2_vehicles_without_publication` | `scope` | MetricsRefreshService cron (LV capability without publication row) |

Structured logs: `observability/battery-v2-pipeline-observability.util.ts` — fingerprints for idempotency/job IDs; `organizationId`/`vehicleId` per Battery V2 convention; no VINs or secrets.

## Integration

- Definitions: `trip-metrics.service.ts`
- Record helpers: `observability/battery-v2-prometheus.metrics.ts`
- Job metrics: `battery-v2-job-observability.service.ts`, `battery-v2-job-producer.service.ts`
- Pipeline logs: `observability/battery-v2-pipeline-observability.util.ts`
- Pipeline hooks: snapshot producer, rest window FSM, start proxy, HV reconcile/shadow, assessment, publication

Supplementary metrics retained: job retry, processing duration histogram, dead-letter backlog gauge, HV reconcile errors, provider delay histogram, legacy `synqdrive_hv_snapshot_duplicates_discarded_total`.

Tests: `battery-v2-prometheus.metrics.spec.ts`, `battery-v2-pipeline-observability.util.spec.ts`, `battery-v2-job-observability.service.spec.ts`, `lv-rest-shadow-metrics.spec.ts`, `prometheus-config.spec.ts`.
