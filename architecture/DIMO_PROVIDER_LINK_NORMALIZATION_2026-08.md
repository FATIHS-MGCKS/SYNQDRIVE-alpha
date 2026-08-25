# DIMO Provider Link Normalization (2026-08-25)

## Summary

Materializes canonical `VehicleDataSourceLink` rows for DIMO vehicles. Previously only High Mobility created link rows; DIMO used `Vehicle.dimoVehicleId` as functional mapping while `ProviderLinkStateBuilder.ACTIVE` required `hasActiveMapping` from `VehicleDataSourceLink`.

## Canonical binding

| Field | Value |
|-------|-------|
| provider | `DIMO` |
| sourceType | `DIMO` |
| sourceSubtype | `null` |
| sourceReferenceId | Internal `DimoVehicle.id` (= `Vehicle.dimoVehicleId`). **Not** external DIMO vehicle ID — see `metadata.dimoExternalId`. |

Mapping population is separate from grant health — inactive consent still gets a link row; provider state resolves via existing builder.

## Components

- `DimoVehicleDataSourceLinkService` — idempotent ensure + backfill planning + drift audit
- `VehiclesService.registerFromDimo()` — creates link inside registration transaction
- `scripts/ops/backfill-dimo-vehicle-data-source-links.ts` — dry-run default, `--apply` explicit

## Reconciliation

`auditProviderLinkDrift()` detects missing links. `reconcileSafeDrift()` self-heals only deterministic `CREATE` cases.

## REACTIVATE safety contract

| Scenario | Action | Rationale |
|----------|--------|-----------|
| Backfill / reconciliation + inactive match | `CONFLICT` (`inactive_link_requires_manual_review`) | Maintenance must never resurrect historical links |
| `metadata.intentionalDeactivation === true` | `CONFLICT` | Explicit admin/provider unlink |
| `metadata.deactivationReason` present | `CONFLICT` | Recorded disablement provenance |
| Registration + `metadata.reactivationEligible === true` | `REACTIVATE` | Positive safe provenance only |
| Registration + inactive, no positive evidence | `CONFLICT` (`missing_positive_reactivation_evidence`) | Conservative default |

## Production shadow authority

Backfill `--shadow` uses `VehicleOperationalProjectionService.projectWithConnectivityOverride()`:

- **Business state:** `deriveFleetBusinessContextBatch()` + persisted `vehicle.status`
- **Health:** `RentalHealthSummaryService.getFleetRowsBatch()`
- **Episode evidence:** `resolveEpisodeEvidenceReliability()` (lifecycle policy)
- **Connectivity override only:** `assembleVehicleConnectivityRuntimeBundle()` with simulated active DIMO link

No synthetic `vehicleStatus: 'AVAILABLE'` or hardcoded `episodeEvidenceReliable: false`.

## Mapping vs consent/auth separation

`VehicleDataSourceLink` population is independent of grant health. `ProviderLinkStateBuilder` still evaluates consent/token/authorization separately — a structurally correct mapping does **not** imply `ACTIVE` provider authorization.

## Test matrix (final hardening)

| Suite | Cases | Status |
|-------|-------|--------|
| Link ensure | L1–L10 | Unit |
| Backfill | B1–B8 | Unit |
| Reconciliation | R1–R5 | Unit |
| Operational regression | O1–O5 | Unit |

## Rollback

Deactivate rows by `metadata.runId` + `metadata.provenance in ('backfill','reconciliation')`.

## Changes (2026-08-25 final hardening)

- Production shadow uses canonical `projectWithConnectivityOverride()` — no synthetic business state
- REACTIVATE gated by `assessInactiveLinkReactivation()`; backfill/reconciliation never reactivates
- Test matrix completed: L1–L10, B1–B8, R1–R5, O1–O5
