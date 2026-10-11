# P4B16 R0 — Production read-only attestation audit

| Field | Value |
|-------|-------|
| **Audited at (UTC)** | `2026-10-11T16:05:00Z` (approx.) |
| **Mode** | `VERIFIED_READ_ONLY` |
| **Repository main @ audit** | `b3c5a0b970162b44496e817e3b13a9b0e89615e4` |
| **Active pin SHA** | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| **Production mutations** | **NONE** |

## Release identity (independent sources)

| Source | Value | Notes |
|--------|-------|-------|
| `readlink -f /opt/synqdrive/current` | `/opt/synqdrive/releases/20261011154442_v4994` | Active release path |
| `git -C current rev-parse HEAD` | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` | **Usable today** on this release (shallow clone from deploy) |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` (`backend.env`) | `3a4bb9448279cd9e04a88c3639059c948c62f3ed` | **MISMATCH** vs current git HEAD |
| `last-deploy-state.env` `PREVIOUS_SHA` | `3a4bb9448279cd9e04a88c3639059c948c62f3ed` | Captured pre last deploy @ `2026-10-11T15:56:00Z` |

**Classification:** Running application tree SHA (**`2b89f746…`**) ≠ declared attestation (**`3a4bb944…`**). This confirms the historical P4B15 gap; attestation is **not** automatically reconciled after successful deploy.

## PM2 / replicas

| Replica | Readiness | Scheduler role |
|---------|-----------|----------------|
| `:3001` | `ok` | `LEADER` |
| `:3002` | `ok` | `FOLLOWER` |

Per-replica **runtime SHA** is not exposed via health API (design gap). Identity today is inferred via shared `current` symlink + git in release dir + PM2 `pm_exec_path` under `current` (not re-verified in this audit).

## Deploy in progress

| Check | Result |
|-------|--------|
| `SYNQDRIVE_DEPLOY_IN_PROGRESS_SHA` in `backend.env` | **ABSENT** (variable **NOT_IMPLEMENTED**) |
| Dedicated in-progress marker file | **ABSENT** |
| Mixed-SHA rolling window signal | **UNKNOWN** from attestation alone; rolling logic exists in `vps-production-replica.lib.sh` |

## Deploy state artifacts

**`last-deploy-state.env`** (canonical rollback capture):

- `PREVIOUS_CURRENT_RELEASE`, `PREVIOUS_SHA`, `CAPTURED_AT`, `PM2_DUMP`, `NGINX_SITE`, `REPLICA_COUNT`

**`vo5c-joint-apds-deploy-result.env`:** historical joint deploy record (2026-10-09 era); fields include `ACTUAL_RELEASE_SHA`, `REPLICA_*_RUNTIME_SHA`, `NO_MIXED_RUNTIME` — **separate** from routine `vps-deploy-release.sh` attestation path.

## Pin / enforcement

| Item | Status |
|------|--------|
| Pin config | `448a889…` @ `/opt/synqdrive/shared/pinned-executor/448a889…` |
| VO5C deploy authority file | **ABSENT** |
| VO5C sudoers | **ABSENT** |
| `ENFORCEMENT_ACTIVE` | **OFF** (no authority file) |

## Cross-module (read-only)

| Item | Value |
|------|-------|
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | `ab72f574014d6657cac158c253696b7237cdd3e6` (**unchanged**; ≠ live `2b89f746…`) |
| EXP021 Gate-6 `di_v0_s4_control` | `KILLED` @ `2026-10-02T05:46:16Z` |
| APDS ACTIVE epoch | SQL probe attempted; use R3 evidence if row empty |

## Drift vs DSRG-03 R3 baseline

R3 recorded live app `7f47c9f…`. Production has since advanced (authorized deploy activity outside this audit). R0 audit **does not** rewrite R3 timestamps; it records **current** bounded observations above.
