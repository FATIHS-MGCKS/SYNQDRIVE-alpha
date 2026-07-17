# Battery V2 Grafana / Prometheus Ops (V4.9.569)

Operational dashboards and alerts for Battery V2, built on the existing SynqDrive monitoring stack (`backend/monitoring/`).

## Files

| File | Purpose |
|------|---------|
| `monitoring/grafana/dashboards/synqdrive-battery-v2.json` | Battery V2 ops dashboard |
| `monitoring/prometheus/alerts.yml` | Alert group `synqdrive_battery_v2` |
| `scripts/ops/vps-setup-grafana.sh` | Copies both Ops + Battery V2 dashboards to VPS |

Provisioning follows the same pattern as `synqdrive-ops.json` via `grafana/provisioning/dashboards/default.yml`.

## Dashboard panels

1. **Polls vs new provider observations** — `synqdrive_dimo_snapshot_poll_total` vs `synqdrive_battery_provider_observation_total{outcome="NEW_OBSERVATION"}`
2. **Duplicate rate** — duplicate / (new + duplicate) by signal
3. **Battery queue** — completed, failed, retry, dead-letter job rates + processing p95
4. **REST capture / MISSED / contamination** — measurements, missed, contaminated counters + window lifecycle
5. **Start proxy coverage** — persisted ratio + insufficient coverage
6. **Capability availability** — `synqdrive_battery_capability_signals_total` by signal/status
7. **Recharge segments & sessions** — HV reconcile segments, charge sessions, reconcile errors
8. **M2 session dispersion** — `synqdrive_hv_capacity_m2_session_cv` histogram (p50/p95/mean)
9. **M2/M3 method agreement** — `synqdrive_hv_capacity_method_conflict_total` agree vs conflict
10. **Assessment maturity** — publications by maturity + assessments by scope/mode
11. **Database growth** — `synqdrive_battery_postgres_table_rows` + ClickHouse telemetry/battery tables

## Alerts (`synqdrive_battery_v2`)

| Alert | Signal |
|-------|--------|
| `BatteryJobsFailingDespiteSnapshotSuccess` | Job failures while snapshot success ratio > 90% |
| `BatteryRestWakeContaminationHigh` | > 35% REST measurements `CONTAMINATED_BY_WAKE` |
| `BatteryRestCaptureMissingDespiteWindows` | > 20 opened windows, zero VALID captures in 6h |
| `BatteryHvRechargeReconciliationFailing` | Reconcile errors or segment errors without success |
| `BatteryHvMethodDeviationUnusual` | > 25% M2/M3 method conflicts in 6h |
| `BatteryProviderDuplicatePersistenceHigh` | > 50% duplicate observation rate in 1h |
| `BatteryV2DeadLetterJobsPresent` | Dead-letter backlog or recent dead-letter moves |

All alerts use low-cardinality metrics only — no vehicle/org labels.

## Supplementary metrics (P69)

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `synqdrive_battery_capability_signals_total` | counter | `signal`, `status` | Capability preflight |
| `synqdrive_hv_capacity_m2_session_cv` | histogram | — | M2 session summary CV |
| `synqdrive_hv_capacity_method_conflict_total` | counter | `outcome` | M3 validation |
| `synqdrive_battery_postgres_table_rows` | gauge | `table` | MetricsRefreshService (5 min) |

## Deploy

After merging to `main`:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
```

Prometheus alert rules reload with the standard VPS Prometheus setup (`vps-setup-prometheus.sh`).

Grafana UID: `synqdrive-battery-v2` — linked from SynqDrive Ops dashboard tag navigation.
