# EXP-021 / VO5C D2-B — Permanent registry lifecycle guard

**Date:** 2026-10-13  
**Production baseline (pre-deploy):** SHA `6d68289018b65ce0c061dc5dbf8c66db7954ab29`, P4B16 Gen 8, EXP021 `GLOBAL_KILL=NOT_KILLED`, four Wave-3 ACTIVE vehicles after D2 cohort cleanup.  
**Cohort cleanup evidence:** `/opt/cursor/artifacts/vo5c-d2-cohort-cleanup-2026-10-13.md`

## BEFORE

- S4B `selectCandidates()` filtered allowlisted org/vehicle and trip settlement only; **no** `vehicles.registry_lifecycle` predicate.
- S4A T01 `createWorkItem()` validated trip→vehicle→org scope but **no** registry lifecycle re-check inside the authoritative transaction for PRIMARY.
- EXP021 maturation shadow `resolveAuthoritativeTokenId()` did not reject OFFBOARDED/ARCHIVED enrollment.

## CHANGE

| Surface | Guard |
|---------|--------|
| S4B discovery SQL | `v.registry_lifecycle::text = 'ACTIVE'` for regular PRIMARY discovery |
| S4A T01 | PRIMARY only: `vehicles` row `FOR UPDATE` after kill-proof control lock; reject `TENANT_SCOPE_INVALID` if lifecycle ≠ ACTIVE (serializes with VO5C offboarding `vehicles` `FOR UPDATE`) |
| Maturation shadow | `resolveAuthoritativeTokenId` requires `registryLifecycle === 'ACTIVE'` |

## T01_OFFBOARD_LINEARIZATION

From the moment VO5C offboarding **commits** `registry_lifecycle = OFFBOARDED`, no new PRIMARY work item can be admitted: T01 blocks on the same `vehicles` row lock until offboarding finishes, then reads OFFBOARDED and rejects. If T01 holds the vehicle lock first and commits while ACTIVE, that PRIMARY WI is valid; a subsequent offboard may still transition the vehicle to OFFBOARDED without retracting the WI.

## HISTORICAL_REPLAY_SEMANTICS

**Unchanged:** `RECALIBRATION_REPLAY` and `REACQUISITION` paths do **not** apply the PRIMARY registry ACTIVE gate. Integration test: OFFBOARDED vehicle + seeded snapshot → replay WI created.

## VALIDATION

- `reference-capture-exp021-maturation-shadow-registry-guard.spec.ts` (unit)
- `di-v0-s4b-registry-lifecycle.postgres.integration.spec.ts` (lifecycle + **concurrent** offboard/T01 order A & B with `deferred` barriers, no sleep races)
- `npm run test:di:s4a:postgres:ci` with local `DI_V0_S4A_PG_ADMIN_URL` (92/92 passing in agent run)

## NON_EFFECTS

- No Prisma migrations; no Production env / allowlist / kill mutations; no deploy in this slice.
