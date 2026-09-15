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

## F8.1 — scheduler zero-success + actionable-backlog semantic closure

**Initial F8 head:** `f6b84bc055cc72ae9350bb8047b1a54db8857871`

### Gaps closed

| Gap | Before F8.1 | After F8.1 |
|-----|-------------|------------|
| Scheduler stale blind spot | `recovery_enabled` only emitted on tick; stale alert required `last_success_unixtime > 0` | `onModuleInit()` publishes `recovery_enabled` and initializes `last_success_unixtime=0`; stale alert fires on zero-success or aged success after `for: 5m` |
| Actionable backlog mismatch | `countPhysicalRefuelRecoveryBacklog()` only authority-filtered orphans; other five reasons could count rows canonical recovery would refuse | Shared recovery where builders + `countActionablePhysicalRefuelRecoveryReasons()` align all six exported reason gauges with `findPhysicalRefuelRecoveryWork()` including fallback authority, enrichment-row guards, and `isV2CoordinateEligibleForEnrichment()` |

### Scheduler lifecycle (F8.1-A)

- Deliberately disabled recovery: `onModuleInit()` sets `recovery_enabled=0`, initializes last-success series to `0`, no timer.
- Enabled recovery timer start: `onModuleInit()` sets `recovery_enabled=1`, initializes last-success to semantic `0`, starts interval unchanged (min 30s, default 60s).
- No recovery batch executed merely for metrics.
- `PhysicalRefuelRecoverySchedulerStale` expression:

```promql
synqdrive_physical_refuel_recovery_enabled == 1
and (
  synqdrive_physical_refuel_recovery_last_success_unixtime == 0
  or (time() - synqdrive_physical_refuel_recovery_last_success_unixtime) > 300
)
```

`for: 5m` — materially exceeds one default 60s first tick interval (F8.1-P4).

### Actionable backlog (F8.1-B..E)

- `countActionablePhysicalRefuelRecoveryReasons()` is the canonical actionable counter used by `countPhysicalRefuelRecoveryBacklog()` for the six exported reasons.
- Inventory fields (`provisional`, `settling`, `insufficientEvidence`, `finalCanonical`, `finalDistinct`, `lateSiblingConflict`, `coordinateHold`) unchanged.
- F8 zero-reset preserved: all six reason gauges explicitly set including zero.

### F8.1 test matrix

| Case | Scope | Result |
|------|-------|--------|
| F8.1-P1 | enabled at lifecycle startup | unit |
| F8.1-P2 | deliberately disabled startup | unit |
| F8.1-P3 | stale alert zero-success expression | prometheus-config static |
| F8.1-P4 | first tick window vs `for: 5m` | static |
| F8.1-P5 | authority OFF settlement_due | PG |
| F8.1-P6 | authority OFF stale_enrichment | PG |
| F8.1-P7 | authority OFF lost_enqueue | PG |
| F8.1-P8 | authority OFF coordinate_initial/coordinate_retry | PG |
| F8.1-P9 | lost_enqueue existing enrichment row | PG |
| F8.1-P10 | lost_enqueue coordinate policy | PG |
| F8.1-P11 | all six gauges vs actionable + canonical work | PG |

Evidence: **EED-EV-0061** (extended, no new ID).
