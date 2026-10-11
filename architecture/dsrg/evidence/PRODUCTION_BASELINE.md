# DSRG — Production baseline (read-only)

| Field | Value |
|-------|-------|
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **Connectivity check** | `bash .cursor/scripts/cloud-agent-verify-vps.sh` — SSH OK `synqdrive-admin@srv1374778.hstgr.cloud` (2026-10-11) |
| **Audit timestamp (UTC)** | R0 `00:47:51Z`; R2 `10:14:01Z`; **authoritative for Gate A:** [`DSRG_03_R3_PRODUCTION_AUDIT.md`](DSRG_03_R3_PRODUCTION_AUDIT.md) @ `13:49:49Z` |
| **Mutations** | **None** — deploy runner not executed |

## Release and application

| Item | Observed value | Evidence class |
|------|----------------|----------------|
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20261010184619_v4994` | SSH `readlink` on `current` |
| **PRODUCTION_RELEASE_SHA** (attestation) | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` | `SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env` (sudo grep) |
| Independent git HEAD on release path | **Not available** | `git rev-parse` **failed** on release dir — **do not** claim checkout identity |
| Health | `GET https://app.synqdrive.eu/api/v1/health` → `status: ok` | HTTP read |

**Drift vs `origin/main` @ `2a44f5c…`:** deployed application SHA is **behind** `main` tip (expected until a full application deploy). Pinned executor SHA **matches** merged ops contract on `main`.

## PM2 topology

| Process | PID | Status | User |
|---------|-----|--------|------|
| `synqdrive` | `2970224` | online | root |
| `synqdrive-b` | `2970404` | online | root |

Observed via `sudo pm2 list` (2026-10-11). Matches DSRG-02 R2 seal (PIDs unchanged since P6 baseline) — **INFERRED** stable unless later restart.

## Pinned executor

| Item | Value |
|------|--------|
| Config file | `/opt/synqdrive/shared/vo5c-pinned-executor.env` (`0600` root:root) |
| `SYNQDRIVE_PINNED_EXECUTOR_ROOT` | `/opt/synqdrive/shared/pinned-executor/448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| `SYNQDRIVE_PINNED_EXECUTOR_SHA` | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| Tree `git rev-parse HEAD` | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |
| `chattr +i` on pin dir | **absent** (`lsattr` → `e` only) |
| Preserved trees | `40c6dd9…`, `dc30d2c…` present under `pinned-executor/` |

## Deploy authority and enforcement

| Item | State |
|------|--------|
| `vo5c-production-deploy-authority.env` | **absent** |
| Armed enforcement stamp | **absent** (no matching files under shared) |
| `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE` in `backend.env` | **not observed** (grep) |
| `/etc/sudoers.d/synqdrive-vo5c-deploy` | **absent** |

## APDS (bounded, non-secret)

| Item | Value |
|------|--------|
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | `ab72f574014d6657cac158c253696b7237cdd3e6` |

ACTIVE epoch id/timestamp: **not re-queried** in DSRG-03 R0 — see DSRG-02 seal (`3cbc5d95-a5fb-4259-8c00-88f0df93e77a` @ `2026-10-09 21:40:53.812`) — **HISTORICAL** unless refreshed.

## EXP021 (bounded)

Non-secret flags observed in `backend.env` (names only): `EXP021_FLEET_DRY_RUN`, `EXP021_FLEET_COORDINATOR_ENABLED`, `EXP021_MATURATION_SHADOW_ENABLED`, allowlist token ids.

Gate-6 global kill state: **UNKNOWN** in DSRG-03 R0 direct probe; **CONFIRMED** as KILLED in DSRG-02 R2 seal evidence.

## VO5C admission / MFA

No `VO5C_*` keys observed in `backend.env` grep during DSRG-03 R0 — product admission state **UNKNOWN** on VPS; see Vehicle Onboarding evidence for intended flags.

## Reconciliation vs `origin/main`

| Surface | `main` @ `2a44f5c` | Production |
|---------|-------------------|------------|
| Active pin SHA | `448a889…` (merged #1970) | `448a889…` **aligned** |
| Live application | **UNKNOWN** exact release tag on `main` without mapping | `7f47c9f…` deployed |
| Enforcement / sudoers | examples in repo | **not activated** |
