# ERD E5.1 — Canonical VEE RECHARGE projection foundation (2026-09-24)

**Status:** IMPLEMENTED (schema + pure policy only; **no runtime projector**, no cutover, no flags).  
**Baseline main:** `5b9afe05039d33ad25f2c5414bf441e8dd64cced`  
**Workstream stage:** `ERD_E5_1_CANONICAL_VEE_RECHARGE_PROJECTION_FOUNDATION`

## Scope delivered

| Area | Outcome |
|------|---------|
| Schema | `canonicalChargeSessionId` → `HvChargeSession.id` (nullable, unique, `onDelete: SetNull`) |
| `dimoSegmentId` | **Nullable** — real DIMO id when native session has one; **NULL** for telemetry-only projections |
| Provenance | `VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION` + extended SQL CHECK |
| Identity v1 | Immutable `sourceEventKey` = `erd:physical:v1:{vehicleId}:{anchorSegmentFingerprint}` |
| Pure policy | `evaluateErdRechargeProjectionEligibility`, `mapCanonicalHvChargeSessionToErdRechargeProjectionDraft` |
| Concurrency contract | Documented requirement to use `acquireErdHvChargeSessionVehicleAuthorityLock` (E5.2+) |
| Runtime | **NOT WIRED** — no Nest provider, no scheduler, no legacy writer changes |

## Provenance model

**ERD_PROJECTION_PROVENANCE_MODEL:** extend `VehicleEnergyEventDetectionSource` (option A).

| Row class | detectionSource | sourceEventKey | dimoSegmentId |
|-----------|-----------------|----------------|---------------|
| Legacy product history | NULL | NULL | NOT NULL (required) |
| Explicit native REFUEL | DIMO_NATIVE | NULL | NOT NULL |
| RFRF fallback REFUEL | SYNQDRIVE_RAW_FUEL_FALLBACK | NOT NULL | NOT NULL (namespaced surrogate) |
| ERD RECHARGE projection | SYNQDRIVE_ERD_RECHARGE_PROJECTION | NOT NULL (physical v1 key) | NULL or real native segment id |

RFRF pairings unchanged. No backfill.

## Projection identity v1

- **Anchor:** `HvChargeSession.segmentFingerprint` at first projection mint (immutable for product row).
- **VEE row id:** server-generated UUID — **unchanged** on fallback→native handoff (E5.3).
- **canonicalChargeSessionId:** **reassignable** on handoff without new VEE row.
- **sourceEventKey:** must **not** be rewritten on handoff.

## Migration

`20260924180000_erd_e5_1_recharge_projection_foundation`

- Add enum value `SYNQDRIVE_ERD_RECHARGE_PROJECTION`
- Add column + FK + unique index on `canonical_charge_session_id`
- Drop NOT NULL on `dimo_segment_id`
- Replace `vehicle_energy_events_source_identity_check` (legacy + RFRF + ERD branches)

## Tests

- Unit: `erd-recharge-projection/*.spec.ts`
- PostgreSQL gate (opt-in): `erd-e5-1-recharge-projection-foundation.postgres.integration.spec.ts` — scenarios PG-A … PG-K
- CI: `boundary-repair-postgres-ci.sh` step 8/8

## Explicit non-goals (E5.1)

- Projector runtime / idempotent upsert service
- Shadow / parity / cutover config
- Product read dedupe for RECHARGE
- Legacy DIMO→VEE writer disable
- Late-native handoff transaction (E5.3)

## Next

`ERD_E5_2_PROJECTOR_IDEMPOTENCY` — wire projector under authority lock with Postgres idempotency proofs.
