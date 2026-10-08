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
- Epoch cache TTL: 5s (`APD_SHADOW_EPOCH_CACHE_TTL_MS`)
- Shadow DB errors in epoch lookup → fail-closed for shadow only

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
