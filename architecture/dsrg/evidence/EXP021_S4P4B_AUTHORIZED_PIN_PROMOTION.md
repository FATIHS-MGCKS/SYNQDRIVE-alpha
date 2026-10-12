# EXP021-S4P4B — Authorized production pin promotion

**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Owner authorization:** YES — pin-only (`vo5c-pinned-executor.env` + executor tree)  
**UTC:** 2026-10-12T04:05:51Z (config switch)  
**Operator:** Cursor Cloud Agent (owner-authorized S4P4B)

## Summary

| Item | Value |
|------|--------|
| Previous pin | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| New pin | `bc7e80715d09767312b0f389f5cb0978f8ec0dbb` (`main` post #1987/#1988) |
| Live application (unchanged) | `92d3d61133ad524ae6d328dd0f603c525b0bd178` @ `20261011200344_v4994` |
| Config backup | `vo5c-pinned-executor.env.bak-20261012T040551Z` |
| `GLOBAL_KILL` | `KILLED` (unchanged) |

## Phase 1 — Recheck (PASS)

- Active config + tree @ `448a889…`
- `SYNQDRIVE_DEPLOYED_GIT_SHA=92d3d611…` in `backend.env`
- Replicas `:3001` / `:3002` health HTTP 200
- No in-flight `vps-deploy-release` process
- VO5C enforcement authority file absent (expected)
- Target tree missing before install (expected)

## Phase 2 — Promotion (executed)

1. Full git clone @ `bc7e807…` under `/opt/synqdrive/shared/pinned-executor/bc7e80715d09767312b0f389f5cb0978f8ec0dbb` (non-shallow; shallow install rejected by security-floor rollback selftest)
2. `vps_vo5c_verify_executor_tree_integrity` + `vps_vo5c_verify_ancestry_includes_floor` — PASS
3. `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` — PASS
4. `vps-vo5c-security-floor-rollback.selftest.sh` — PASS
5. P4B16 integration lib present; wired in pinned `vps-deploy-release.sh`
6. Atomic replace `vo5c-pinned-executor.env` (`0600` root:root)

**Not executed:** application deploy, PM2 restart, DB migration, Prometheus reload, `GLOBAL_KILL` change, Gate-6 LIVE_OPEN.

## Phase 3 — Post-promotion (PASS)

| Check | Result |
|-------|--------|
| Config SHA / ROOT | `bc7e807…` |
| Resolved `git HEAD` | `bc7e807…`, porcelain `0` |
| VO5C integrity + security floor | PASS |
| P4B16 hooks | reachable in pin tree |
| Old pin tree `448a889…` | preserved |
| Production attestation | still `92d3d611…` |
| Replica health | 200 / 200 |
| Monitoring | no `alerts-di-s4.yml` on disk (pre-deploy state unchanged) |

## Rollback

Restore `vo5c-pinned-executor.env` from `vo5c-pinned-executor.env.bak-20261012T040551Z`; do not delete `448a889…` tree.

## Next step (separate owner authorization)

Staged application deploy to `bc7e807…` via pinned VO5C runner; use `MONITORING_AUTO_REFRESH=0` and explicit `vps-refresh-monitoring.sh` per S4P2-R2 runbook; handle P4B16 partial-success exit 3 per R1B.
