# EXP021-S4P4D — Direct production deploy (owner-authorized)

**UTC deploy:** 2026-10-12T04:39:41Z – 04:51:27Z  
**Release:** `20261012043942_v4994`  
**Target SHA:** `bc7e80715d09767312b0f389f5cb0978f8ec0dbb`  
**Previous production SHA:** `92d3d61133ad524ae6d328dd0f603c525b0bd178`

## Execution

- JIT staged checkout: `/opt/synqdrive/staged/bc7e80715d09767312b0f389f5cb0978f8ec0dbb`
- VO5C preflight: PASS
- Runner: pinned `vps-vo5c-run-pinned-security-deploy.sh` with `MONITORING_AUTO_REFRESH=0`
- Deploy log: `/opt/synqdrive/shared/logs/exp021-s4p4d-direct-deploy.log`
- Exit code: **0**
- P4B16: `STATUS=COMMITTED` `DEPLOYED_SHA=bc7e807…` @ `/opt/synqdrive/shared/deploy-state/release-attestation.state`
- Monitoring refresh (explicit): `/opt/synqdrive/shared/logs/exp021-s4p4d-monitoring-refresh.log` RC=0 (promtool CLI warnings on host; reload OK)

## Post-deploy invariants

- `GLOBAL_KILL=KILLED`
- Scheduler: A=LEADER, B=FOLLOWER (convergence PASS)
- `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` unchanged (`92d3d611…`)
- Prometheus rule group `synqdrive_di_v0_s4_shadow` loaded
