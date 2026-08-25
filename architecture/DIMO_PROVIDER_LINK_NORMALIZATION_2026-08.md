# DIMO Provider Link Normalization (2026-08-25)

## Summary

Materializes canonical `VehicleDataSourceLink` rows for DIMO vehicles. Previously only High Mobility created link rows; DIMO used `Vehicle.dimoVehicleId` as functional mapping while `ProviderLinkStateBuilder.ACTIVE` required `hasActiveMapping` from `VehicleDataSourceLink`.

## Canonical binding

| Field | Value |
|-------|-------|
| provider | `DIMO` |
| sourceType | `DIMO` |
| sourceSubtype | `null` |
| sourceReferenceId | `DimoVehicle.id` |

Mapping population is separate from grant health — inactive consent still gets a link row; provider state resolves via existing builder.

## Components

- `DimoVehicleDataSourceLinkService` — idempotent ensure + backfill planning + drift audit
- `VehiclesService.registerFromDimo()` — creates link inside registration transaction
- `scripts/ops/backfill-dimo-vehicle-data-source-links.ts` — dry-run default, `--apply` explicit

## Reconciliation

`auditProviderLinkDrift()` detects missing links. `reconcileSafeDrift()` self-heals only deterministic `CREATE` cases.

## Rollback

Deactivate rows by `metadata.runId` + `metadata.provenance in ('backfill','reconciliation')`.
