# M3.3F F4.3 — flag-OFF production deploy evidence (authoritative seal)

**Date:** 2026-09-28 (UTC)  
**Mode:** Read-only governance seal — no production mutation in this document.

## Authoritative identities

| Field | Value |
|-------|-------|
| Engineering merge | PR **#1817** @ `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| Production deploy SHA | `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| Production release ID | `20260928001456_v4994` |
| Prior production SHA | `5bcecc6c6016b1d1186db353fc2c3cd518d88565` / `20260927212254_v4994` |
| Pre-deploy backup | `/opt/synqdrive/shared/backups/db-pre-deploy-20260928001456.sql.gz` (~83MB; gzip integrity not yet at strong activation standard) |

## Production outcome flags

| Flag | Value |
|------|-------|
| `F4_3_DEPLOY_COMPLETE` | **YES** |
| `F4_3_FLAG_OFF_SMOKE` | **PASS** |
| `F4_ACTIVATION_OBSERVABILITY_PROVEN_IN_PRODUCTION` | **YES** |
| `D3_PRODUCTION_ACTIVATED` | **NO** |
| `F_D3_T0_ASSIGNED` | **NO** |
| `F4_D3_ACTIVATION_ALLOWED` | **NO** |

## Replica convergence

| Check | Result |
|-------|--------|
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `68a05e4156db28568ad5b7718ca1f9ad2d799884` (both) |
| `PRODUCTION_SHA_CONVERGED` | **YES** |
| `REPLICA_A_FLAG_GAUGE` / `REPLICA_B_FLAG_GAUGE` | **0** / **0** |
| `FLAG_STATE_CONVERGED_OFF` | **YES** |
| `LEADER_FLAG_OFF_OBSERVED` | **YES** (replica A / port 3001, natural tick ~00:41 UTC) |
| `FOLLOWER_NOT_LEADER_OBSERVED` | **YES** (replica B / port 3002) |
| `BOTH_REPLICA_FLAG_STATE_OBSERVABLE` | **YES** |

## Database inertness (D3 OFF)

| Metric | Pre | Post | Delta |
|--------|-----|------|-------|
| D3 profile revisions | 0 | 0 | **0** |
| Source-evidence ack rows | 0 | 0 | **0** |
| Fleet cursor | `null\|null` | `null\|null` | **did not advance** |
| C3 feature rows | 29 | 30 | **+1 natural C3 shadow** |

`C3_PIPELINE_HEALTH=PASS` (C3 not frozen; natural shadow write expected).

## Observability / safety smoke

- All **eight** F4.3 Prometheus families present on **both** processes.
- `HIGH_CARDINALITY_LABEL_COUNT=0` (no org/vehicle/fingerprint/revision labels on reconciliation families).
- `PRODUCTION_INVARIANT_FAILURE_DELTA=0` (`VEHICLE_ORGANIZATION_MISMATCH` guard present; no production adversarial test).
- `synqdrive_battery_longitudinal_reconciliation_ack_total`: no delta while D3 OFF (no ops materialization invoked for smoke).

## Platform health @ deploy window

`APPLICATION_HEALTH=PASS` · `PM2_HEALTH=PASS` · `POSTGRES_HEALTH=PASS` · `REDIS_HEALTH=PASS` · `SCHEDULER_LEADER_HEALTH=PASS` (single leader converged post rolling deploy).

## Migrations @ F4.3 deploy

- `PENDING_MIGRATION_COUNT=0` at deploy time.
- `NEW_PRISMA_MIGRATION_COUNT=0` for F4.3 release (no new migration in #1817 delta).

## Production vs `origin/main` boundary (F4.4 gate)

As of governance seal, **`origin/main` is ahead of production** with **unrelated** Driving Intelligence / EXP-021 S4A work (including a new Prisma migration). **Battery F4.4 controlled D3 activation preflight does not require deploying current `main`.**

| Authority | SHA / note |
|-----------|------------|
| **`F4_4_PRODUCTION_RUNTIME_SHA`** | **`68a05e4156db28568ad5b7718ca1f9ad2d799884`** |
| `CURRENT_MAIN_IS_BATTERY_DEPLOY_CANDIDATE` | **NO** |

Future D3 flag ON must be evaluated against **verified deployed production** at the authoritative F4.4 runtime SHA above, unless a **separate** deployment gate explicitly authorizes a different SHA. This prevents accidental rollout of unrelated DI migrations during Battery activation.

### Commits on `main` after #1817 merge (`68a05e41..main`)

| Commit | Summary |
|--------|---------|
| `b8389c229` | DI S4A dormant schema + migration |
| `bd7d1400d` | DI S4A contract / state machine / control plane |
| `2708c74a4` | DI S4A work-item repository + Postgres tests |
| `abf36839d` | DI S4A channel-policy V1 |
| `cdf756141` | DI S4A fixture / dormant audit specs |
| `9ce98e809` | DI S4A migration Postgres spec + CI scripts |
| `77d112dba` | DI authority documentation (S4A foundation) |
| `2c321823a` | Merge PR #1816 (EXP-021 S4A) |
| `9701df7e9` | DI S4A post-merge deploy-gate documentation |

Classification: **`POST_F4_3_BATTERY_RUNTIME_CHANGE_COUNT=0`** · unrelated runtime/migration work only.

## Remaining activation gates (not satisfied)

1. Fresh **strong** pre-write backup (`gzip -t`, readable SQL stream; preferably restore/parse verification).
2. Post-F4.3 production baseline recheck immediately before any D3 flag ON.
3. Exact activation scope verification (no unrelated SHA).
4. Explicit controlled D3 activation authorization.

`PRE_ACTIVATION_BACKUP_STRONG_VERIFICATION_REQUIRED=YES`

## Next stage

`NEXT_STAGE=F4_4_CONTROLLED_D3_ACTIVATION_PREFLIGHT`

Do **not** interpret this seal as D3 activation or `F_D3_T0` assignment.
