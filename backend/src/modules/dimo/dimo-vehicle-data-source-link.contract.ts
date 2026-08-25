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
