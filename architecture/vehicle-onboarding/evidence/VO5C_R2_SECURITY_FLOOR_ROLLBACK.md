# VO5C R2 — Security-floor rollback hardening and migration order proof

**Status:** REPO_EVIDENCE (draft PR)  
**Security floor SHA (VO5C slices):** `39775cbb0cdc0addc7a71b26a39e2395c9f36c63`  
**Production pre-R2 SHA (R1):** `3b557e208c1a06e91c0a13fb8ba861b1255ee375`  
**Known unsafe rollback SHA:** `54fc704fb50c285c68470d8fa274d72a67438482`

## R2-H1 mandatory fixes

- **Immutable security floor** — `39775cbb…` pinned in code; environment cannot override.
- **Fail-closed guard** — missing VO5C library, load failure, or missing guard function denies rollback.
- **S4F7Q path** — candidate `RELEASE_OPS_DIR` replica library only (not older controller copy); `SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR` pins authority.
- **PM2 dump resurrect** — disabled; forward recovery only.
- **Migration fixture** — baseline deploy uses migration tree **without** Battery R2 folders; forward deploy uses full tree (no `_prisma_migrations` row deletion).

## Protected rollback entry points

| Path | Mechanism |
|------|-----------|
| `vps_replica_rollback()` | `vps_vo5c_assert_release_rollback_eligible` **before** `ln -sfn` / PM2 restart |
| `vps-rollback-production-release.sh` | Sources `vps-production-replica.lib.sh` → same guard |
| `vps-deploy-release.sh` `ROLLBACK_ON_FAIL=1` | Calls `vps_replica_rollback` (guard applies) |
| PM2 dump restore fallback | `vps_vo5c_assert_pm2_dump_restore_allowed` before `pm2 resurrect` |
| S4F7Q gated rolling deploy | Uses same `vps_replica_rollback` / replica lib when rollback invoked |

Denied operational code: `VO5C_UNSAFE_ROLLBACK_DENIED` (includes target SHA, current HEAD, reason, correlation id).

## Rollback call graph (production)

```
vps-deploy-release.sh
  ├─ build/migrate/boot (fail → exit, current untouched)
  ├─ source RELEASE_OPS_DIR/lib/vps-production-replica.lib.sh  [NEW release on forward deploy]
  ├─ capture PREVIOUS_* state
  ├─ ln -sfn NEW → /opt/synqdrive/current
  ├─ vps_replica_rolling_deploy
  │    └─ fail → vps_replica_rollback (VO5C guard)
  └─ vps_replica_verify_post_deploy
       └─ fail → vps_replica_rollback (VO5C guard)

vps-rollback-production-release.sh → vps_replica_rollback

vps_replica_rollback
  ├─ VO5C eligibility (git ancestry + markers) BEFORE symlink
  ├─ ln -sfn PREVIOUS → current
  ├─ vps_replica_rolling_deploy
  └─ on fail → PM2 dump restore (only if eligibility re-confirmed)
```

## Executor bootstrap dependency (critical)

Production invokes **`/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh`** (pre-promotion executor).  
The VO5C guard ships in the **candidate release tree** and is loaded when:

1. `vps-deploy-release.sh` sources `RELEASE_DIR/backend/scripts/ops/lib/vps-production-replica.lib.sh` **after clone** (before rolling promotion / rollback-on-fail).
2. Manual rollback uses **`current`** copy of `vps-production-replica.lib.sh` (patched only after successful promotion).

**First security rollout:** rollback-on-fail is protected only once the executor reaches the post-clone source line with a release containing R2. Build/migrate/boot failures leave `current` on the old SHA without auto-rollback.

## Partial replica failure policy (design)

| Case | Safe failure state |
|------|-------------------|
| A Build fail pre-promotion | Abort; `current` unchanged |
| B Migrate fail pre-promotion | Abort; `current` unchanged |
| C Replica A restart fail | Do not auto-revert to pre-VO5C; contain traffic to healthy replica; forward-fix |
| D A ok, B fail | Mixed SHA — stop promotion verification; **no unsafe rollback**; isolate B from upstream |
| E Both up, verify fail | VO5C guard blocks revert to `3b557e` / `54fc704` |
| F Scheduler leader fail | Same as E |
| G Safe rollback unavailable | `VO5C_UNSAFE_ROLLBACK_DENIED` + containment log; manual forward redeploy |
| H PM2 dump unsafe paths | Dump restore gated by same floor eligibility |
| I S4F7Q controller path | Controller sources replica lib from `SYNQDRIVE_DEPLOY_CONTROLLER_ROOT` when gated — must include R2 lib |

Traffic containment (no live changes in R2): prefer nginx upstream health drain + stop unhealthy replica PM2 process; never symlink back to pre-floor SHA.

## Ancestry verification

- Git `merge-base --is-ancestor $VO5C_SECURITY_FLOOR_SHA $target_sha`
- Bounded `git fetch --depth=1` (then `--depth=32`) when floor object missing (shallow release clone)
- Shallow/unresolved → **DENY** (`shallow_history_unresolved_floor_object`)
- Supplemental markers: `LEGACY_VEHICLE_DESTRUCTION_DISABLED` + `PLATFORM_PRUNE_DISABLED` in `backend/src` or `backend/dist/src`

## Isolated Prisma migration reproduction

Harness: `backend/scripts/test/vo5c-r2-battery-migration-order-ephemeral.sh`

Fixture: full `migrate deploy`, delete Battery R2 `_prisma_migrations` rows, keep `20261008150000_apd_shadow_epoch_activated_at_timestamptz`, re-run `prisma migrate deploy`. Records exact Prisma error code (no assumed P3016).

## Residual risks / authorization

- R2 adds a **new commit**; deploy candidate must be an explicit full SHA containing VO5C slices **and** R2 guard.
- Production migration history / `migrate resolve` / renames — **out of scope** (separate R2-M if reproduction proves blocker).
- `VITE_MASTER_VEHICLE_OFFBOARD_UI` unchanged; no product activation.
