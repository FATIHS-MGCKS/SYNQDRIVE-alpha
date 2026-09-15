# RFRF F8 — Operational telemetry + Prometheus alerting closure

**Date:** 2026-09-15  
**Branch:** `cursor/eed-rfrf-f8-operational-telemetry-alerting-f21f`  
**Base:** `main` @ `ad8392d8cb9bf4301602783bed74876c9c5fd5b2` (post F7 merge `d4ffc4c6a`)

## Pre-implementation inventory

| Field | Finding |
|-------|---------|
| GLOBAL_PROMETHEUS_REGISTRY | `TripMetricsService.registry` (single prom-client Registry) |
| METRICS_ENDPOINT | Protected `GET /api/v1/metrics` via `MetricsController` |
| EXISTING_RFRF_PROMETHEUS_SERVICE | `RawFuelRefuelFallbackMetricsService` (57 counters) |
| EXISTING_RFRF_G2_HANDOFF_METRICS | 8 `synqdrive_rfrf_g2_handoff_*` counters — unchanged |
| RFRF_METRICS_PRODUCTION_REGISTERED | Yes via global `EnergyEventsObservabilityModule` |
| EXISTING_PHYSICAL_REFUEL_RECOVERY_PROM_METRICS | **None before F8** (log-only backlog) |
| RECOVERY_BACKLOG_CURRENTLY_PROM_EXPORTED | **No** → **Yes after F8** |
| RECOVERY_SCHEDULER_CURRENTLY_PROM_EXPORTED | **No** → **Yes after F8** |
| EXISTING_PHYSICAL_REFUEL_ALERT_RULES | **None** → F8 group added |
| ALERT_RULE_INFRA_REUSED | Yes — `backend/monitoring/prometheus/alerts.yml` (not parallel stack) |

## Ownership boundary

| Service | Scope |
|---------|-------|
| `EnergyEventsMetricsService` | Native EED detection observability |
| `RawFuelRefuelFallbackMetricsService` | RFRF detector/candidate/convergence/promotion/handoff |
| `PhysicalRefuelReconciliationMetricsService` | Source-agnostic G2 reconciliation/recovery operational observability |
| Prometheus alert rules | Operational symptom detection only — not runtime authority |

## F8 implementation (observability only)

No recovery science changes. No schema change. No second metrics stack.

### Metrics (TripMetricsService.registry)

| Metric | Type | Owner |
|--------|------|-------|
| `synqdrive_physical_refuel_recovery_backlog{reason}` | Gauge | Runtime `emitRecoveryBacklogMetrics()` |
| `synqdrive_physical_refuel_recovery_enabled` | Gauge | Runtime `emitRecoveryBacklogMetrics()` |
| `synqdrive_physical_refuel_recovery_runs_total{result}` | Counter | Scheduler `runRecoveryTick()` only |
| `synqdrive_physical_refuel_recovery_last_success_unixtime` | Gauge | Scheduler on `result=success` only |
| `synqdrive_physical_refuel_recovery_recovered_total{reason}` | Counter | Runtime batch (bounded reasons) |

Bounded `reason` labels: `orphan_refuel`, `settlement_due`, `stale_enrichment`, `lost_enqueue`, `coordinate_initial`, `coordinate_retry`.

All backlog gauges explicitly zeroed on refresh (no stale non-zero series).

Backlog source: existing `countPhysicalRefuelRecoveryBacklog()` — orphan count aligned with recovery work authority filter (fallback excluded when G2 handoff authority OFF).

### Alerts (`synqdrive_physical_refuel` group)

| Alert | `for` | Semantics |
|-------|-------|-----------|
| PhysicalRefuelOrphanBacklogPersistent | 10m | enabled + orphan_refuel > 0 |
| PhysicalRefuelLostEnqueueBacklogPersistent | 10m | enabled + lost_enqueue > 0 |
| PhysicalRefuelStaleEnrichmentBacklogPersistent | 15m | enabled + stale_enrichment > 0 |
| PhysicalRefuelRecoverySchedulerStale | 5m | enabled + last_success > 0 + stale > 300s (~5×60s default interval) |
| PhysicalRefuelRecoveryFailuresElevated | 10m | enabled + ≥3 failures / 15m |

All alerts gated on `synqdrive_physical_refuel_recovery_enabled == 1`. No settlement/coordinate transient alerts added.

## Real PostgreSQL gate

Script: `backend/scripts/test/rfrf-f8-operational-telemetry-gate.sh`  
Env: `RAW_FUEL_REFUEL_F8_INTEGRATION=1`, `RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED=1`

| Case | Result |
|------|--------|
| F8-P1 orphan backlog gauge | PASS |
| F8-P2 backlog clears to zero | PASS |
| F8-P3 multiple categories | PASS |
| F8-P4 authority-off fallback | PASS |
| F8-P5 native orphan | PASS |
| F8-P6 success tick + last-success | PASS |
| F8-P7 failure tick immutable last-success | PASS |
| F8-P8 overlap_skipped | PASS |
| F8-P9 disabled enabled gauge | PASS |
| F8-P10 registry export | PASS |

**Gate:** 16/16 PASS (11 PG integration + 5 unit), 0 skips

## Closure flags

| Flag | Value |
|------|-------|
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| SECOND_METRICS_STACK_CREATED | NO |
| PRODUCTION_MUTATED | NO |
