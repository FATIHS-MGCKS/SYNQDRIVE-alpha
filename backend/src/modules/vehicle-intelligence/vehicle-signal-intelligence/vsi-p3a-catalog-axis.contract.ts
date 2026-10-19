import type { VsiProfileMaterializationKey } from './vsi-profile.types';

export const VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION = 'vsi-p3a-catalog-axis-v1' as const;

/** Canonical keys that map to DIMO availableSignals (not provider metadata axes). */
export const VSI_P3A_MATERIALIZATION_CATALOG_KEYS = [
  'lv_voltage',
  'hv_battery_soc',
  'vehicle_speed',
  'odometer',
  'position_coordinates',
  'fuel_level_relative',
  'diagnostic_trouble_code',
  'accelerator_pedal_position',
] as const satisfies readonly VsiProfileMaterializationKey[];

export type VsiP3aMaterializationCatalogKey = (typeof VSI_P3A_MATERIALIZATION_CATALOG_KEYS)[number];

export const VsiProviderCatalogSnapshotCompleteness = {
  COMPLETE_PROVIDER_CATALOG: 'COMPLETE_PROVIDER_CATALOG',
  INCOMPLETE_PROVIDER_RESPONSE: 'INCOMPLETE_PROVIDER_RESPONSE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
} as const;

export type VsiProviderCatalogSnapshotCompleteness =
  (typeof VsiProviderCatalogSnapshotCompleteness)[keyof typeof VsiProviderCatalogSnapshotCompleteness];

export const VsiProviderCatalogAxisProvenance = {
  DIMO_AVAILABLE_SIGNALS_PREFLIGHT: 'DIMO_AVAILABLE_SIGNALS_PREFLIGHT',
} as const;

export type VsiProviderCatalogAxisProvenance =
  (typeof VsiProviderCatalogAxisProvenance)[keyof typeof VsiProviderCatalogAxisProvenance];

export const VSI_P3A_LIMITATION_LEGACY_VEHICLE_SCOPED_CATALOG =
  'LEGACY_DECLARED_CATALOG_VEHICLE_SCOPED_NOT_LINK_VERIFIED';

export const VSI_P3A_LIMITATION_PER_LINK_CATALOG_UNAVAILABLE =
  'PER_LINK_DECLARED_CATALOG_EVIDENCE_UNAVAILABLE';

export const VSI_P3A_LIMITATION_INCOMPLETE_PROVIDER_CATALOG =
  'PROVIDER_CATALOG_SNAPSHOT_INCOMPLETE_NOT_LISTED_WITHHELD';
