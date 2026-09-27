# M3.3F F4.3 — D3 activation observability closure

**Date:** 2026-09-27  
**Mode:** Engineering only — no production deploy, no D3 activation, no `F_D3_T0`.

## Production baseline (F4.2 complete)

| Field | Value |
|-------|-------|
| Deploy SHA | `5bcecc6c6016b1d1186db353fc2c3cd518d88565` |
| Release | `20260927212254_v4994` |
| F4.1 migrations | applied (pending 0) |
| D3 flag | OFF / absent |
| D3 revisions | 0 |
| Ack rows | 0 |
| Fleet cursor rows | 1 (migration bootstrap singleton) |

## New Prometheus families (low cardinality)

| Metric | Labels | Purpose |
|--------|--------|---------|
| `synqdrive_battery_longitudinal_reconciliation_ticks_total` | `result` ∈ NOT_LEADER, FLAG_OFF, OVERLAP, COMPLETED, FAILED | Scheduler decision path |
| `synqdrive_battery_longitudinal_reconciliation_candidates` | none | Candidate count per completed tick |
| `synqdrive_battery_longitudinal_reconciliation_processed_total` | `outcome` ∈ CREATED, EXISTING, D1_REJECTED, D2_REJECTED, ERROR | Per-candidate outcomes (matches tick outcome struct) |
| `synqdrive_battery_longitudinal_reconciliation_ack_total` | `outcome` ∈ CREATED, EXISTING | Authoritative ack append outcomes |
| `synqdrive_battery_longitudinal_reconciliation_duration_seconds` | `result` | Scheduler tick duration |
| `synqdrive_battery_longitudinal_reconciliation_last_success_timestamp` | none | Unix seconds (per process) |

Existing D3 materialization metrics remain:

- `synqdrive_battery_longitudinal_profile_materialization_attempts_total`
- `synqdrive_battery_longitudinal_profile_materialization_duration_seconds`

## Pre-change observability audit (F4.3 baseline)

| SIGNAL | EXISTS (pre-F4.3) | SOURCE | SUFFICIENT_FOR_FIRST_ACTIVATION |
|--------|-------------------|--------|--------------------------------|
| Scheduler invocation | partial (debug logs) | scheduler | NO |
| Leader / non-leader | partial (leader guard) | `SchedulerLeaderGuardService` | NO |
| Flag OFF skip | partial (early return) | scheduler + service | NO |
| Flag ON tick | partial (info log on candidates>0) | scheduler | NO |
| Overlap skip | partial (debug log) | scheduler | NO |
| Tick completed | partial | scheduler log | NO |
| Tick failed | partial (warn log) | scheduler | NO |
| Candidate count | NO | — | NO |
| Processed count | NO | — | NO |
| CREATED / EXISTING / D1 / D2 / ERROR | partial (materialization attempts metric only on direct materialize path) | `TripMetricsService` D3 families | NO |
| Ack CREATED / EXISTING | NO | ack repository | NO |
| Tick duration | NO (reconciliation) | — | NO |
| Cross-tenant invariant failure | NO typed signal | — | NO |
| Last successful reconciliation timestamp | NO | — | NO |

Post-F4.3 engineering closes gaps via bounded Prometheus families above (fail-open recording).

## Multi-replica semantics

Both PM2 replicas expose metrics. Non-leader replicas increment `ticks_total{result="NOT_LEADER"}` only. Leader executes reconciliation when D3 flag ON. Use Prometheus `instance` / process identity externally — no per-replica custom labels.

## First-activation query contract (operator)

After flag ON (future gate — not this PR):

1. **Flag transition visible:** `increase(synqdrive_battery_longitudinal_reconciliation_ticks_total{result="FLAG_OFF"}[5m])` drops; `COMPLETED` appears on leader instance.
2. **Single leader work:** non-zero `COMPLETED` on one instance; `NOT_LEADER` on follower.
3. **Tick volume:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_ticks_total{result="COMPLETED"}[15m]))`
4. **Candidates:** `histogram_quantile(0.5, sum(rate(synqdrive_battery_longitudinal_reconciliation_candidates_bucket[15m])) by (le))`
5. **Outcomes:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_processed_total[15m])) by (outcome)`
6. **Acks:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_ack_total[15m])) by (outcome)`
7. **Errors:** `increase(..._processed_total{outcome="ERROR"}[15m])`
8. **Last success:** `max(synqdrive_battery_longitudinal_reconciliation_last_success_timestamp)` advancing on leader
9. **DB cross-check:** Δ `battery_longitudinal_profile_revisions` ≈ Δ `processed CREATED`; Δ ack rows ≈ ack metric CREATED (EXISTING idempotent replays expected)

## Hard abort (qualitative)

Migration/schema failure, cross-tenant typed invariant (none today), scientific uniqueness violation, duplicate revision anomaly, ack authority inconsistency, batch > configured max, unclassified ERROR spike, scheduler runaway, replica SHA/config divergence, DB integrity failure.

`REJECTION_SPIKE_NUMERIC_THRESHOLD=UNSET` — D1/D2 rejections classified manually via reason taxonomy.

## Backup debt (unchanged)

Before future D3 flag ON: fresh backup with `gzip -t` + readable SQL stream (`PRE_ACTIVATION_BACKUP_STRONG_VERIFICATION_REQUIRED=YES`).

## Cross-tenant observability

`CROSS_TENANT_TYPED_SIGNAL_PRESENT=NO` — no authoritative typed cross-tenant failure enum exists yet; do not infer from log strings.
