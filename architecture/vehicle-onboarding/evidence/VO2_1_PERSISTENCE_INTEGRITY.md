# VO-2.1 — Persistence integrity seal

**Date:** 2026-09-30  
**PR:** #1851  
**Scope:** Database constraints, legacy upgrade proof, CI — no VO-3 orchestration.

## Idempotency (global across terminal history)

- **Constraint:** `uq_vo_onboarding_case_idempotency_global` on `(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`
- Replaces non-terminal-only `uq_vo_onboarding_case_open_idempotency`.
- New intentional onboarding attempts must use a new idempotency key; historical COMPLETED cases retain the key reservation.

## Primary source connection scope

- **Case field:** `primary_source_scope_key` (empty string = provider-global / NULL scope).
- **Open-case uniqueness:** `uq_vo_onboarding_case_open_primary_source` on `(organization_id, primary_source_provider, primary_source_scope_key, primary_source_external_id)` for non-terminal statuses.
- **Source ref:** `connection_scope` + normalized `connection_scope_key` for semantic duplicate prevention.

Semantics:

- **Provider-global:** `primary_source_scope_key = ''` — one open case per org + provider + external id.
- **Account-scoped:** distinct scope keys allow the same external id when the provider contract is account-scoped.

## Source ref invariants

- **One primary:** `uq_vo_onboarding_case_source_ref_one_primary` (`is_primary = true` per case).
- **No duplicate semantic refs:** `uq_vo_onboarding_case_source_ref_semantic` on `(onboarding_case_id, provider, connection_scope_key, external_vehicle_identity)`.

## JSON contract versions

Scalar version fields (default `0`): `draft_identity_version`, `draft_admin_baseline_version`, `draft_technical_baseline_version`, `readiness_snapshot_version`, `validation_findings_version`, `snapshot_metadata_version` (source ref).

## Terminal state CHECK constraints

- `chk_vo_onboarding_case_completed`, `chk_vo_onboarding_case_cancelled`, `chk_vo_onboarding_case_expired`, `chk_vo_onboarding_case_non_terminal`.

## Organization assignment FK

- `vehicle_organization_assignments.organization_id` → `organizations.id` **ON DELETE RESTRICT**.

## VehicleDataSourceLink history

- Dropped Prisma/`uq_data_source_link_active` compound unique.
- **Active-only partial unique:** `uq_vehicle_data_source_link_active_scope` on `(vehicle_id, source_type, COALESCE(source_subtype, '')) WHERE is_active = true`.
- Unlimited inactive episodes; NULL subtype treated as `''` for active uniqueness.
- **Runtime audit:** zero uses of `vehicleId_sourceType_sourceSubtype_isActive` in `backend/src`.

## Migration proof

| Gate | Script |
|------|--------|
| Fresh chain | `backend/scripts/test/vo2-vehicle-onboarding-migration-ephemeral.sh` |
| Legacy upgrade | `backend/scripts/test/vo2-vehicle-onboarding-migration-legacy-upgrade.sh` |
| Integration | `vo2-persistence.postgres.integration.spec.ts` |
| CI | `.github/workflows/vehicle-onboarding-vo2-postgres-ci.yml` |

Legacy fixture is seeded **before** `20260930130000_vehicle_onboarding_vo2_persistence` via held-migration deploy + `vo2-pre-vo2-fixture.seed.ts`.

## Nullable VIN compatibility

- HM status DTO retains `vin: string | null`; no `vehicle.vin ?? ''` identity coercion.
- Fleet connectivity list DTO `vin` is `string | null` (display/telemetry; not identity matching).

## Non-effects

- No production deploy, no DIMO/HM registration switch, no billing/deregistration runtime change, no VO-3 orchestration.
