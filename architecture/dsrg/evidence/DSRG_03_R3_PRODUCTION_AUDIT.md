# DSRG-03 R3 — Production audit (read-only)

| Field | Value |
|-------|-------|
| **UTC** | `2026-10-11T13:49:49Z` |
| **Repository main** | `299205bc7fa07f3494f50961c49fd5a591e029fe` (#1975 merged) |
| **Access** | SSH + `sudo` bounded reads; `sudo -u postgres psql` SELECT only |
| **Mutations** | **None** |

## A — Application

| Item | Observed | Class |
|------|----------|-------|
| Release path (`current`) | `/opt/synqdrive/releases/20261010184619_v4994` | CONFIRMED |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` | CONFIRMED (attestation) |
| Release dir git HEAD | **N/A** | Not a git checkout |
| `backend.env` SHA256 | `19685a3b15d88f7df5ffb6376ef1d74a922021edb921d2190d4b17ae1cfac2af` | CONFIRMED |
| PM2 `synqdrive` | online, pid `2970224`, cwd `…/current/backend` | CONFIRMED |
| PM2 `synqdrive-b` | online, pid `2970404`, cwd `…/current/backend` | CONFIRMED |
| Health `https://app.synqdrive.eu/api/v1/health` | `status: ok` @ `2026-10-11T13:49:50Z` | CONFIRMED |
| Deploy process running | **none** (`pgrep` empty) | CONFIRMED |
| Battery V2 publish flags in `backend.env` | **none matched** | CONFIRMED |

## B — Pinned executor

| Item | Observed |
|------|----------|
| `vo5c-pinned-executor.env` | `600 root:root` |
| ROOT / SHA | `…/448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Tree `git rev-parse HEAD` | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Full + ops porcelain | `0` |
| Runner tail | `exec bash "$PINNED_DEPLOY_SCRIPT" "$@"` |
| Prior pin dirs preserved | **2** (`40c6dd9…`, `dc30d2c…`) |

## C — Deployment authorization / OS boundary

| Item | State |
|------|--------|
| `vo5c-production-deploy-authority.env` | **absent** |
| Armed stamp files | **absent** |
| `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT*` in `backend.env` | **none matched** |
| `/etc/sudoers.d/synqdrive-vo5c-deploy` | **absent** |
| `/etc/sudoers.d/synqdrive-admin` | **present** (admin SSH; not VO5C deploy wrapper) |
| Enforcement | **OFF** (configuration) |
| OS VO5C deploy boundary | **NOT_READY** (no dedicated sudoers) |

**Reachability note:** Script-level guards exist in repository and pin tree; **OS-level block** of legacy deploy paths is **not** proven while enforcement is OFF and sudoers absent.

## D — Cross-module (bounded)

| Module | Observation | Source |
|--------|-------------|--------|
| **APDS approved pin** | `ab72f574014d6657cac158c253696b7237cdd3e6` in `backend.env` | CONFIRMED |
| **APDS ACTIVE epoch** | `3cbc5d95-a5fb-4259-8c00-88f0df93e77a` @ `2026-10-09 21:40:53.798+00`, `production_release_identity` = `ab72f574…` | CONFIRMED (`apd_shadow_activation_epochs` SELECT) |
| **EXP021 Gate-6 GLOBAL** | `kill_state=KILLED`, `updated_at=2026-10-02 05:46:16.114002+00` | CONFIRMED (`di_v0_s4_control` SELECT) |
| **EXP021 scheduler leader** | `synqdrive_scheduler_leader_status` not exposed on `:3001`/`:3002` metrics scrape in this probe | **UNKNOWN** |
| **RFRF** | `prove-rfrf-*`, `rfrf-monitoring-*` scripts on live release tree | CONFIRMED (files present; traps not exercised) |
| **VO5C admission/MFA** | No `VO5C_*` keys in `backend.env` grep | **UNKNOWN** (Vehicle Onboarding authority) |

## Drift vs `main` @ `299205bc`

Deployed app SHA is an **ancestor** of `main` (expected until full application deploy). Pin SHA **matches** merged ops contract on `main`.
