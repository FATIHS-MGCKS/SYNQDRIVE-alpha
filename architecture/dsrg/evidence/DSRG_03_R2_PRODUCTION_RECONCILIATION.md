# DSRG-03 R2 — Production reconciliation (read-only)

| Field | Value |
|-------|-------|
| **UTC** | `2026-10-11T10:14:01Z` |
| **Access** | SSH `synqdrive-admin@srv1374778.hstgr.cloud` + `sudo` bounded reads |
| **Mutations** | **None** |

## Direct observation (this audit)

| Check | Result |
|-------|--------|
| `current` → release path | `/opt/synqdrive/releases/20261010184619_v4994` |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| Release dir `git rev-parse` | **Not applicable** (not a git checkout) |
| `vo5c-pinned-executor.env` | `600 root:root` |
| Pin ROOT/SHA | `…/448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Pin tree HEAD | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Pin + ops porcelain | **0** lines (clean) |
| Runner last line | `exec bash "$PINNED_DEPLOY_SCRIPT" "$@"` |
| Deploy authority file | **absent** |
| sudoers `synqdrive-vo5c-deploy` | **absent** |
| `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT` in backend.env | **absent** |
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | `ab72f574014d6657cac158c253696b7237cdd3e6` |
| PM2 `synqdrive` / `synqdrive-b` | online PIDs `2970224`, `2970404` |
| Preserved old pin trees | **2** (`40c6dd9…`, `dc30d2c…`) |

## Historical evidence (not re-executed)

DSRG-02 R2 seal (`DSRG_02_PIN_REPROMOTION_2026-10-11.md`): Gate-6 **KILLED**, APDS ACTIVE epoch timestamp, scheduler leader tick — **HISTORICAL** unless re-verified.

## Separation

This file records **DSRG-03 R2** observations. It does not replace DSRG-02 promotion narrative or VO5C implementation evidence.
