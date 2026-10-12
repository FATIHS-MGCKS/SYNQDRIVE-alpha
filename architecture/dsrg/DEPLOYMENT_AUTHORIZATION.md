# Deployment authorization

**Operational runbook (SSH, Cloud Agent, bootstrap):** [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](./PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

## Layers (fail-closed stack)

1. **Human:** `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` only at pinned runner entry (never cloud-agent auto-set).
2. **Target SHA:** `SYNQDRIVE_REQUESTED_DEPLOY_SHA` + `vps_vo5c_assert_deploy_target_admitted`.
3. **Pinned executor:** preflight verifies tree integrity, floor ancestry, R2 markers.
4. **Enforcement (inactive):** `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1` in authority file blocks legacy entrypoints when armed.

## Entrypoint classes (P4B15 inventory)

See `architecture/vehicle-onboarding/evidence/VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md` for the full bypass table (A–E).

**Routine production path (target state):** invoke **`${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh`** (not `/opt/synqdrive/current/...`) with `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` and pin env → preflight from pinned ops → `exec bash` pinned `vps-deploy-release.sh`. The runner aborts if invoked from a non-pinned ops directory.

## Preflight vs execution contract (DSRG-01)

`vps-vo5c-first-security-deploy-preflight.sh` validates git integrity and admission; it does **not** simulate `exec` of the deploy script. A bare `exec` on mode-644 deploy script fails at runtime with **EACCES** — caught by DSRG-01 selftest, not preflight.

## Unauthorized deploy prevention (offline)

- Runner aborts without `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`
- Direct `vps-deploy-release.sh` from unpinned `current` blocked when enforcement active (future)
- Security-floor rollback denies sub-floor targets
