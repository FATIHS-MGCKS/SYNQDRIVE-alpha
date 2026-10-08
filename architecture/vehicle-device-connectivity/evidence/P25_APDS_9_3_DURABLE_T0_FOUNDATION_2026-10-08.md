# P25 APDS-9.3 — Durable activation epoch foundation (engineering only)

**Evidence ID:** VDC-EVID-P25-APDS-9-3-001  
**Date:** 2026-10-08  
**Status:** IMPLEMENTATION_PRESENT (no Production deploy, no Shadow activation, no T0 start)

## Summary

Adds a **durable PostgreSQL activation epoch** for APDS Shadow observe-only mode. Shadow decision writes now require:

1. `WORKER_APD_SHADOW_ENABLED` (global flag)
2. Cohort allowlist (`WORKER_APD_SHADOW_COHORT_JSON`, state `READY`)
3. **ACTIVE** durable epoch bound to cohort fingerprint
4. `decisionAt >= activatedAt` (immutable DB-time T0)

**Flag ON alone does not create or activate an epoch.** Operator must `prepare` then `activate` via `ApdShadowActivationEpochService` (ops wiring in follow-up if needed).

## Lifecycle

| State | Shadow decisions | T0 |
|-------|------------------|-----|
| PREPARED | Blocked | Not set |
| ACTIVE | Allowed (if other gates pass) | Set once at activation (`NOW()`) |
| PAUSED | Blocked | Retained |
| CLOSED | Blocked | Retained |

Transitions: `PREPARED → ACTIVE` (authorized activation only), `ACTIVE → PAUSED`, `ACTIVE|PAUSED|PREPARED → CLOSED`. Historical epochs preserved.

## Schema (additive)

- Table: `apd_shadow_activation_epochs`
- Column: `apd_shadow_reconciliation_decisions.activation_epoch_id` (nullable FK) — **366** legacy Production rows remain `NULL` and are excluded from post-T0 epoch-bound analytics.

Migration: `20261008120000_apd_shadow_activation_epochs`

## Kill switch / fail-closed

- Missing/invalid epoch → no shadow DB writes; **normal DIMO polling unchanged**
- Epoch positive cache TTL: 5s (`APD_SHADOW_EPOCH_CACHE_TTL_MS`) — **read hints only** (`isEnabledForVehicle` prefetch)
- **Decision-write boundary** uses `loadActiveEpochForScopeAuthoritative()` (no positive-cache admission; `MAX_STALE_ADMISSION_MS=0`)
- Shadow DB errors in epoch lookup → fail-closed (no stale-positive fallback)
- `WORKER_APD_SHADOW_ENABLED=false` checked on every decision gate (immediate per-process kill switch)

## APDS-9.3A hardening (same PR #1920)

- Decision row immutability: legacy `activation_epoch_id=NULL` cannot adopt epoch; cross-epoch replay → `ApdShadowDecisionEpochConflictError`; `decisionAt` immutable
- FK `ON DELETE RESTRICT` on `activation_epoch_id` (epochs with evidence cannot be deleted silently)
- PostgreSQL trigger `apd_shadow_activation_epochs_immutable_t0` prevents `activated_at` mutation
- Activation request key bound to scope + policy versions + epoch id

## APDS-9.3B final authority (PR #1920)

- **T0 SQL:** `NOW()` via `APD_SHADOW_EPOCH_T0_SQL` (timestamptz absolute instant; session-TZ independent). Corrective migration `20261008150000_apd_shadow_epoch_activated_at_timestamptz` (`TIMESTAMPTZ(3)`).
- **Write linearization:** `AdaptivePollingShadowRepository.assertActivationEpochActiveAtCommit` — advisory xact lock + ACTIVE lifecycle verify on **new decision create** only.
- **Cold cache:** `isEnabledForVehicle` = flag + cohort only; epoch gate remains authoritative in `observe*` + commit boundary.
- **Operator path:** `APD_SHADOW_EPOCH_OPS_TOKEN` + actor/request-id/reason + optional `SYNQDRIVE_DEPLOYED_GIT_SHA` verification; CLI `backend/scripts/ops/apd-shadow-activation-epoch-cli.ts`; facade `ApdShadowActivationEpochOperatorFacade` (status/preflight/prepare/activate/pause/close, `--dry-run`).
- **Tests:** T0 timezone parity (UTC/LA/Berlin), pause/close write-race (dual Prisma clients), operator authority unit tests, cold-cache spec.

## Operator runbook (draft)

1. Verify cohort JSON fingerprint matches intended pilot scope.
2. `prepareEpoch` → record `epochId` (PREPARED).
3. Authorized `activateEpoch` with unique `activationRequestKey` → establishes immutable T0.
4. Enable `WORKER_APD_SHADOW_ENABLED` (does **not** reset T0).
5. Rollback: set flag OFF (instant kill switch); optional `pauseEpoch` / `closeEpoch` for audit closure.

## Cohort readiness — vehicle 187336

See audit artifact `/opt/cursor/artifacts/apds-vehicle-187336-forensics.json` (read-only VPS/DB). Classification: **NOT_READY** (no successful SNAPSHOT ~5.9d; physical UNPLUGGED). Waiver required for shadow evidence expectations — **not issued** in this workstream.

## Validation

- Unit: `apd-shadow-activation-epoch.service.spec.ts`, updated shadow service specs
- Postgres: `apd-shadow-activation-epoch.postgres.integration.spec.ts` (idempotency + concurrent activation)
- `bash backend/scripts/test/p25-apd-shadow-postgres-ci.sh` when `DATABASE_URL` available
