# M3.3F F4.3 — exact-SHA flag-OFF production deploy + two-replica observability smoke

**Date:** 2026-09-28 (UTC)  
**Mode:** Production deploy — D3 remains OFF; no `F_D3_T0`.

## Deploy identity

| Field | Value |
|-------|-------|
| Requested / target SHA | `68a05e4156db28568ad5b7718ca1f9ad2d799884` (PR #1817 merge) |
| Previous production SHA | `5bcecc6c6016b1d1186db353fc2c3cd518d88565` |
| Previous release | `20260927212254_v4994` |
| New release | `20260928001456_v4994` |
| Pre-deploy backup | `/opt/synqdrive/shared/backups/db-pre-deploy-20260928001456.sql.gz` (~83MB) |

## Migration / schema

- `prisma migrate deploy`: **363** migrations; **No pending migrations to apply.**
- `NEW_PRISMA_MIGRATION_COUNT=0`

## Env (unchanged semantics)

- `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`
- `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=true`
- `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` absent → effective OFF both replicas
- ERD: `ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST` unchanged (only ERD key present)

## Database pre → post

| Metric | Pre | Post |
|--------|-----|------|
| D3 revisions | 0 | 0 |
| Source-evidence acks | 0 | 0 |
| Fleet cursor | `null\|null` | `null\|null` |
| C3 feature rows | 29 | 30 (natural C3 shadow) |

## Multi-replica smoke (~15m natural scheduler tick)

Observed @ ~00:41 UTC after deploy @ ~00:26 UTC:

| Replica | Port | Role | `materialization_flag_enabled` | `ticks_total{result=FLAG_OFF}` | `ticks_total{result=NOT_LEADER}` |
|---------|------|------|--------------------------------|--------------------------------|----------------------------------|
| A | 3001 | LEADER | 0 | 1 | 0 |
| B | 3002 | FOLLOWER | 0 | 0 | 1 |

All eight F4.3 metric families present on both processes; `HIGH_CARDINALITY_LABEL_COUNT=0`.

## Activation gates

- `F4_3_DEPLOY_COMPLETE=YES`
- `F4_3_FLAG_OFF_SMOKE=PASS`
- `F4_ACTIVATION_OBSERVABILITY_PROVEN_IN_PRODUCTION=YES`
- `F4_D3_ACTIVATION_ALLOWED=NO` — strong pre-activation backup + explicit authorization still required
- `NEXT_STAGE=F4_4_CONTROLLED_D3_ACTIVATION_PREFLIGHT`
