/**
 * Canonical DIMO VehicleDataSourceLink binding semantics.
 *
 * Mapping population is independent of grant-chain health — ProviderLinkStateBuilder
 * still evaluates consent/token/authorization separately.
 */
export const DIMO_DATA_SOURCE_PROVIDER = 'DIMO' as const;
export const DIMO_DATA_SOURCE_TYPE = 'DIMO' as const;
/** Single canonical DIMO telemetry channel — matches connectivity test fixtures. */
export const DIMO_DATA_SOURCE_SUBTYPE = null as null;

export type DimoLinkProvenance =
  | 'registration'
  | 'backfill'
  | 'reconciliation'
  | 'manual';

export const DIMO_LINK_METADATA_VERSION = 1 as const;

/**
 * DIMO mapping identity is stored in VehicleDataSourceLink.dimoVehicleId
 * (internal SynqDrive DimoVehicle.id = Vehicle.dimoVehicleId).
 *
 * sourceReferenceId is reserved for High Mobility (high_mobility_vehicles.id)
 * and MUST remain null for DIMO rows.
 *
 * External DIMO identity is stored in metadata.dimoExternalId.
 */
export const DIMO_MAPPING_IDENTITY_FIELD = 'dimoVehicleId' as const;
export const DIMO_MAPPING_IDENTITY_AUTHORITY = 'DimoVehicle.id' as const;

/** @deprecated Use DIMO_MAPPING_IDENTITY_FIELD — legacy name from pre-schema-fix contract */
export const DIMO_SOURCE_REFERENCE_AUTHORITY = DIMO_MAPPING_IDENTITY_AUTHORITY;
