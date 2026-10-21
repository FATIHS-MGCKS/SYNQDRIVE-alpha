# ERD E5.6 — Write-authority cutover gate (2026-09-25)

**Status:** IMPLEMENTED (code readiness only; **default OFF**).  
**Baseline:** post E5.5 merge `fd6160a5449b6f1d4761dfcad8cf82a99406a319`  
**Stage:** `ERD_E5_6_CUTOVER_GATE`

## Purpose

Single deterministic **product write authority** for RECHARGE episodes:

| Phase | Writer |
|-------|--------|
| Before cutover (physical evidence end `< cutoverAt`) | Legacy DIMO → `VehicleEnergyEvent.RECHARGE` |
| At/after cutover (`physical evidence end >= cutoverAt`) | Canonical `HvChargeSession` → `projectCanonicalRecharge` |

**No Production activation** in this stage.

## Configuration (single authority)

| Env | Default | Notes |
|-----|---------|-------|
| `ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED` | `false` | Canonical **`true` only** (case/whitespace tolerant). Rejects `1`/`yes`/`on`. |
| `ERD_RECHARGE_WRITE_CUTOVER_AT` | unset | Explicit ISO instant. No implicit startup/deploy timestamp. |

Malformed / incomplete config ⇒ **global authority LEGACY** (never NONE).

## CANONICAL prerequisites (all required)

When authorized, CANONICAL authority requires:

- valid `ERD_RECHARGE_WRITE_CUTOVER_AT`
- `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=true`
- `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED=true`
- `BATTERY_V2_RECONCILIATION_ENABLED=true`
- `ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED=true` (`1`/`true`)

**Does not** require E5.4 shadow parity (`CUTOVER_DEPENDS_ON_SHADOW_FLAG=NO`).

## Boundary

`CUTOVER_BOUNDARY_SOURCE=PHYSICAL_EVIDENCE_END`

- Legacy segment: `endTime`
- Canonical session: `endAt` (completed/projectable)

Not `createdAt`, ingest time, job time, or retry time.

## Runtime wiring

- **Legacy gate:** `EnergyEventsService` RECHARGE upsert only (REFUEL unchanged).
- **Canonical runtime:** `ErdRechargeCanonicalProjectionRuntimeService` invoked **after** physical session persistence from `HvRechargeSessionReconcileService` (outside E3 transaction).
- Retries projection for **unchanged** sessions (prior isolated failure recovery).
- Product projection failure **does not** roll back `HvChargeSession` persistence.

## Rollback

Set `ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED=false`. No DB mutation. Canonical history preserved. Legacy writer **cannot** mutate existing canonical ERD rows (`CANONICAL_ROW_PROTECTED`).

## Multi-replica caveat

Code uses one shared resolver; operators must converge env across replicas before declaring cutover complete. E5.2 `LEGACY_DIMO_COLLISION` and canonical-row protection remain fail-closed safety nets.

## Tests

- Unit: `erd-recharge-write-authority.spec.ts` (C1–C12, W1–W9)
- PostgreSQL: `erd-e5-6-write-authority-cutover.postgres.integration.spec.ts`
- CI: `boundary-repair-postgres-ci.sh` step **13/13**

## Explicit non-effects

- No historical backfill
- No schema migration
- No Production flag activation
- E5.5 read policy unchanged
- E5.4 shadow observational only

## Next

Production cutover activation is a separate operational stage (not E5.6 implementation).
