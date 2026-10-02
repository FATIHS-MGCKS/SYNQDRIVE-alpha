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
| `synqdrive_battery_longitudinal_materialization_flag_enabled` | none | Per-process effective D3 flag (0=OFF, 1=ON); updated every scheduler tick **before** leader guard |
| `synqdrive_battery_longitudinal_reconciliation_invariant_failures_total` | `type` ∈ `VEHICLE_ORGANIZATION_MISMATCH` | Typed fail-closed safety violations |

### Ack metric scope (freshness authority)

`synqdrive_battery_longitudinal_reconciliation_ack_total` is recorded at the **authoritative** `LongitudinalProfileMaterializationService` ack append boundary. It counts **all** durable source-evidence acknowledgements that affect F4.1 freshness (scheduler reconciliation **and** explicitly authorized internal ops materialization). It is **not** scheduler-origin-only. Compare DB Δ ack rows to this metric under that global scope (CREATED vs EXISTING idempotent replays).

`ACK_METRIC_TRIGGER_SEMANTICS_UNAMBIGUOUS=YES`  
`ACK_DB_DELTA_COMPARISON_VALID_UNDER_DOCUMENTED_SCOPE=YES`

### Cross-tenant schema audit (F4.3 pre-merge)

`BatteryRestSessionFeature` and `BatteryLongitudinalProfileRevision` each declare independent `organizationId` → `Organization` and `vehicleId` → `Vehicle` FKs. There is **no** composite DB constraint enforcing `vehicles.organization_id = feature.organization_id`. Cross-tenant rows are **possible** at the schema level.

**Runtime guard (F4.3):** bounded fleet-key SQL joins `vehicles` and compares `feature.organization_id` to `vehicles.organization_id` before fingerprint/D1/materialization. Mismatch → typed `VEHICLE_ORGANIZATION_MISMATCH`, invariant metric, tick abort (scheduler `FAILED`).

`CROSS_TENANT_TYPED_SIGNAL_PRESENT=YES`  
PostgreSQL adversarial integration test constructs a permitted mismatch and verifies no D3/ack.

### Metric fail-open granularity

Scheduler tick recording uses **independent** fail-open wrappers per signal (ticks counter, duration histogram, candidate histogram, last-success gauge). One broken collector operation does not suppress subsequent observations.

`METRIC_RECORDING_FAILURE_COUPLING=NONE` (independent fail-open per operation)  
`METRIC_FAILURE_ISOLATION_SUFFICIENT=YES`

### Activation gate semantics (engineering vs production)

| Gate | PR #1817 exact-head |
|------|---------------------|
| `F4_ACTIVATION_OBSERVABILITY_SUFFICIENT` | YES (after pre-merge hardening) |
| `F4_D3_ACTIVATION_ALLOWED` | **NO** — requires merge, F4.3 flag-OFF production deploy, two-replica metrics smoke, strong backup verification, explicit activation authorization |

`NEXT_STAGE=F4_3_EXACT_SHA_FLAG_OFF_PRODUCTION_DEPLOY` (not D3 flag ON)

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

Both PM2 replicas expose metrics. Non-leader replicas increment `ticks_total{result="NOT_LEADER"}` only. Leader executes reconciliation when D3 flag ON. **`synqdrive_battery_longitudinal_materialization_flag_enabled`** is updated on **every** replica on **every** scheduler tick (before leader guard) so operators can verify both replicas observed flag OFF→ON via per-instance gauges. Use Prometheus `instance` / process identity externally — no per-replica custom labels.

`BOTH_REPLICA_FLAG_STATE_OBSERVABLE=YES`

## First-activation query contract (operator)

After flag ON (future gate — not this PR):

1. **Both replicas flag state:** per instance `synqdrive_battery_longitudinal_materialization_flag_enabled` (expect 0 before activation, 1 after authorized flag ON on both replicas).
2. **Flag transition (leader ticks):** `increase(synqdrive_battery_longitudinal_reconciliation_ticks_total{result="FLAG_OFF"}[5m])` drops on leader; `COMPLETED` appears on leader instance.
3. **Single leader work:** non-zero `COMPLETED` on one instance; `NOT_LEADER` on follower.
4. **Executed tick count:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_ticks_total{result="COMPLETED"}[15m]))` (or histogram `synqdrive_battery_longitudinal_reconciliation_candidates_count` delta — prefer tick counter for executed ticks).
5. **Total candidates seen (not median):** `sum(increase(synqdrive_battery_longitudinal_reconciliation_candidates_sum[15m]))` — use `_sum` for aggregate candidate observations across completed ticks.
6. **Median candidates per tick (supplementary only):** `histogram_quantile(0.5, sum(rate(synqdrive_battery_longitudinal_reconciliation_candidates_bucket[15m])) by (le))` — **do not** treat as total candidates.

`TOTAL_CANDIDATES_QUERY_EXACT=YES`  
`MEDIAN_QUERY_NOT_PRESENTED_AS_TOTAL=YES`

7. **Outcomes:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_processed_total[15m])) by (outcome)`
8. **Acks:** `sum(increase(synqdrive_battery_longitudinal_reconciliation_ack_total[15m])) by (outcome)` (global authoritative ack scope — see above)
9. **Errors:** `increase(..._processed_total{outcome="ERROR"}[15m])`
10. **Cross-tenant invariant:** `increase(synqdrive_battery_longitudinal_reconciliation_invariant_failures_total{type="VEHICLE_ORGANIZATION_MISMATCH"}[15m])` must stay 0 in healthy activation
11. **Last success:** `max(synqdrive_battery_longitudinal_reconciliation_last_success_timestamp)` advancing on leader
12. **DB cross-check:** Δ `battery_longitudinal_profile_revisions` ≈ Δ `processed CREATED`; Δ ack rows ≈ ack metric CREATED under documented ack scope (EXISTING idempotent replays expected)

## Hard abort (qualitative)

Migration/schema failure, **cross-tenant typed invariant** (`VEHICLE_ORGANIZATION_MISMATCH`), scientific uniqueness violation, duplicate revision anomaly, ack authority inconsistency, batch > configured max, unclassified ERROR spike, scheduler runaway, replica SHA/config divergence, DB integrity failure.

`REJECTION_SPIKE_NUMERIC_THRESHOLD=UNSET` — D1/D2 rejections classified manually via reason taxonomy.

## Backup debt (unchanged)

Before future D3 flag ON: fresh backup with `gzip -t` + readable SQL stream (`PRE_ACTIVATION_BACKUP_STRONG_VERIFICATION_REQUIRED=YES`).

## Cross-tenant observability

`CROSS_TENANT_TYPED_SIGNAL_PRESENT=YES` — `VEHICLE_ORGANIZATION_MISMATCH` at bounded candidate discovery; metric `synqdrive_battery_longitudinal_reconciliation_invariant_failures_total{type="VEHICLE_ORGANIZATION_MISMATCH"}`; fail-closed tick abort. Do not infer from log strings.
