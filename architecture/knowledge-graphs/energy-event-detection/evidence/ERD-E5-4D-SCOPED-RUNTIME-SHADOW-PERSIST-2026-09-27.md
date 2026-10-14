# ERD E5.4D — Scoped runtime shadow parity canary gate

**Status:** IMPLEMENTED (code + tests; **no** Production env activation)  
**Evidence ID:** EED-EV-0096  
**Prior Production canary:** EED-EV-0095 (`CONTROLLED_PERSIST_CANARY_PASS`, direct `persist:true` ops only)

## Problem

`EnergyEventsService` invokes `ErdRechargeShadowParityRuntimeService.runAfterEnergyDetectionSafe()` after detection. Previously, runtime persistence required `ERD_RECHARGE_SHADOW_PARITY_ENABLED=true` globally — unsafe for narrow Production canaries while global flag must remain OFF.

## Solution

Env-only scoped authorization:

| Mode | Condition | Runtime persist |
|------|-----------|-----------------|
| `GLOBAL` | `ERD_RECHARGE_SHADOW_PARITY_ENABLED` = `true` / `1` | Any hook invocation may persist |
| `SCOPED_CANARY` | Global false + valid allowlist contains exact `organizationId:vehicleId` | Matching pair only |
| `DISABLED` | Global false + empty/missing allowlist or non-matching pair | No evaluation |
| `INVALID_SCOPED_CONFIG` | Any malformed allowlist token | Fail closed — zero scoped pairs |

**New env:** `ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST`  
Syntax: `organizationId:vehicleId[,organizationId:vehicleId...]`  
No wildcards, no org-only / vehicle-only entries, no partial matching. Duplicate entries dedupe. One malformed token invalidates the entire scoped config (no valid subset).

## Code

- `erd-recharge-shadow-runtime-scope.policy.ts` — `resolveErdRechargeShadowRuntimeAuthorization`
- `erd-recharge-shadow-parity.runtime.ts` — authorization boundary only; `evaluateVehicleWindow({ persist: true })` unchanged when authorized
- `ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV` constant

Comparator / pairing / parity versions **unchanged** (v2 / v1 / v2).

## Tests

| Suite | Coverage |
|-------|----------|
| `erd-recharge-shadow-runtime-scope.policy.spec.ts` | C1–C16 policy matrix |
| `erd-recharge-shadow-parity.runtime.spec.ts` | R1–R7 runtime unit matrix |
| `erd-e5-4-recharge-shadow-parity.postgres.integration.spec.ts` | PG-SCOPE-1..4, S25b scoped fail-open; S25/S26 regression; bounded `waitForCondition` / row-count polling (no fixed post-hook sleeps) |

## Metrics

`SCOPED_AUTH_METRIC_STRATEGY=UNCHANGED_TAXONOMY` — unauthorized paths still record `SKIPPED_FLAG_OFF`; no org/vehicle Prometheus labels.

## Explicit non-goals (this PR)

- No Production env change or scoped allowlist activation
- No Prisma schema / migration / persistent allowlist table
- No change to direct ops `evaluateVehicleWindow({ persist: true|false })` semantics
- No canonical VEE / legacy / dedupe / cutover / E6.3 / HV write path changes
- Does **not** authorize setting global `ERD_RECHARGE_SHADOW_PARITY_ENABLED` in Production

## Production activation prerequisite (EED-EV-0095)

Before any future Production mutation activating scoped runtime persistence:

`FUTURE_PRODUCTION_MUTATION_WITHOUT_VERIFIED_PREWRITE_BACKUP_ALLOWED=NO` — verified **pre-write** pg_dump with Prisma-stripped URI (see EED-EV-0095 operational deviation).

## Production exact-SHA deploy (empty scope)

| Field | Value |
|-------|--------|
| Deploy time (UTC) | 2026-09-27 ~19:21–19:32 |
| Release ID | `20260927192148_v4994` |
| Source SHA | `7d3b7ed9de3f8025a9332caf3448dc8dd3ae74b9` (not `main` tip) |
| Prior live SHA | `9322a5d6b6d10240f9af8491cc0106ad8c7ea98d` |
| DB backup (pre) | `/opt/synqdrive/shared/backups/db-pre-erd-e5-4d-exact-20260927192108.sql.gz` (+ deploy script backup) |
| Env backup (pre) | `/opt/synqdrive/shared/backups/backend-env-pre-erd-e5-4d-20260927192104.env` |
| `prisma migrate deploy` | **No pending migrations** |
| Env mutation | **None** (`ENV_CONTENT_CHANGED=NO`) |
| Shadow rows pre/post | 12 / 12 |
| Scoped allowlist | unset; resolver `DISABLED` for known canary pair |
| Rollback | **Not executed** |

## Next stage

Production activation preflight → optional scoped allowlist (separate authorization; not performed in deploy).
