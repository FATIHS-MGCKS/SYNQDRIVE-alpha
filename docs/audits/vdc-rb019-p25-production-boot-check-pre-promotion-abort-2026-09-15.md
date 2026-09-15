# VDC RB-019 P2.5 — Production boot-check pre-promotion abort

**Date:** 2026-09-15  
**Classification:** `PRE_PROMOTION_ABORT` (not a rollback)

## Authorized deployment

| Field | Value |
|-------|-------|
| Authorized target SHA | `ad8392d8cb9bf4301602783bed74876c9c5fd5b2` |
| Canonical path | `bash .cursor/scripts/cloud-agent-deploy.sh` |
| Failed release ID | `20260915143513_v4994` |

## Outcome

The canonical deployment lifecycle completed build/migrate/frontend build, then **aborted at boot check** before promoting `/opt/synqdrive/current`.

**Correct semantic:** `PRE_PROMOTION_ABORT` — promotion never occurred; prior release remained active.

## Pre-abort production state (unchanged)

| Field | Value |
|-------|-------|
| Production SHA | `bd3fd78060034f628892d1b9da9cf6991e65606b` |
| Release | `/opt/synqdrive/releases/20260915000043_v4994` |
| Replica A | `synqdrive` online, port 3001 |
| Replica B | `synqdrive-b` online, port 3002 |
| Scheduler leaders | 1 (LEADER/FOLLOWER) |
| Health | local A/B + external PASS |
| Authority | LEGACY |
| P2.5 cutover | NO |
| STATEFUL_SHADOW | NO |
| Physical-state feature flags | OFF (absent → defaults) |

## Lifecycle steps observed

1. Pre-deploy PostgreSQL backup — **SUCCESS** (`db-pre-deploy-20260915143513.sql.gz`)
2. Exact-SHA release clone — **SUCCESS** (`ad8392d8c…`)
3. `npm ci`, Prisma migrate deploy — **SUCCESS** (no pending migrations)
4. Backend + frontend build — **SUCCESS**
5. Boot check (`node dist/src/main.js`) — **FAILED**
6. Promotion — **NOT PERFORMED**

## Root cause

`physical-state-cutover-evidence.schema-validation.ts` (and related compiled modules) runtime-require:

```
physical-state-cutover-evidence.ops-lib.cjs
```

via `createRequire(__dirname)` relative to the **compiled** `dist/` path.

`backend/nest-cli.json` asset manifest copied ClickHouse SQL only. Nest build did **not** copy the shared CJS trust-root file into:

```
dist/src/modules/dimo/device-connection-physical-state/physical-state-cutover-evidence.ops-lib.cjs
```

Evidence on failed release:

- `src/.../physical-state-cutover-evidence.ops-lib.cjs` — **PRESENT**
- `dist/.../physical-state-cutover-evidence.ops-lib.cjs` — **MISSING**

Boot-check error:

```
Error: Cannot find module '.../dist/.../physical-state-cutover-evidence.ops-lib.cjs'
```

## Fix (repository)

- Add explicit Nest CLI asset rule for `physical-state-cutover-evidence.ops-lib.cjs`
- Add `backend/scripts/test/physical-state-cutover-runtime-assets.sh` regression gate (dist presence, SHA-256 byte identity, compiled runtime import)
- Wire gate into `vehicle-detail-production-readiness.yml` `production-build` job

## Safety invariants preserved

- No Production env mutation
- No PM2 restart by repair task
- No authority latch mutation
- No P2.5 cutover
- No STATEFUL_SHADOW activation
- Failed release forensic artifacts retained on VPS
