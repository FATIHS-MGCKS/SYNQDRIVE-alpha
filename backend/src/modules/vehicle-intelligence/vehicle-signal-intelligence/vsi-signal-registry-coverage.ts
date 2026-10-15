import { VSI_CANONICAL_SIGNAL_DEFINITIONS, type VsiCanonicalSignalKey } from './canonical-signal-keys';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';
import { isProfileEmpiricalExtractorImplemented } from './vsi-profile-empirical-extractor';

export const VsiSignalRegistryCoverageStatus = {
  SUPPORTED_IN_CANONICAL_REGISTRY: 'SUPPORTED_IN_CANONICAL_REGISTRY',
  MATERIALIZED_IN_PROFILE: 'MATERIALIZED_IN_PROFILE',
  CATALOG_ONLY: 'CATALOG_ONLY',
  OBSERVED_BUT_NOT_MAPPED: 'OBSERVED_BUT_NOT_MAPPED',
  UNMAPPED_PROVIDER_SIGNAL: 'UNMAPPED_PROVIDER_SIGNAL',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiSignalRegistryCoverageStatus =
  (typeof VsiSignalRegistryCoverageStatus)[keyof typeof VsiSignalRegistryCoverageStatus];

const materialized = new Set<string>(VSI_PROFILE_MATERIALIZATION_KEYS);

export type VsiSignalRegistryCoverageRow = {
  canonicalSignalKey: VsiCanonicalSignalKey;
  primaryDimoSignalName: string | null;
  coverage: VsiSignalRegistryCoverageStatus;
  catalogSupportInRegistry: boolean;
  canonicalMappingImplemented: boolean;
  empiricalExtractorImplemented: boolean;
  materializationEnabled: boolean;
  historicalQualityAvailable: boolean;
};

/** Static coverage matrix — registry presence ≠ empirical extraction. */
export function buildVsiSignalRegistryCoverageMatrix(): VsiSignalRegistryCoverageRow[] {
  return Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS).map((key) => {
    const def = VSI_CANONICAL_SIGNAL_DEFINITIONS[key as VsiCanonicalSignalKey];
    const materializationEnabled = materialized.has(key);
    const empiricalExtractorImplemented =
      materializationEnabled &&
      (key === 'lv_voltage' ||
        key === 'hv_battery_soc' ||
        key === 'provider_source_timestamp' ||
        key === 'device_connectivity' ||
        key === 'provider_last_successful_fetch' ||
        isProfileEmpiricalExtractorImplemented(key as (typeof VSI_PROFILE_MATERIALIZATION_KEYS)[number]));

    let coverage: VsiSignalRegistryCoverageStatus =
      VsiSignalRegistryCoverageStatus.SUPPORTED_IN_CANONICAL_REGISTRY;
    if (materializationEnabled) {
      coverage = empiricalExtractorImplemented
        ? VsiSignalRegistryCoverageStatus.MATERIALIZED_IN_PROFILE
        : VsiSignalRegistryCoverageStatus.OBSERVED_BUT_NOT_MAPPED;
    } else if (def.primaryDimoSignalName) {
      coverage = VsiSignalRegistryCoverageStatus.CATALOG_ONLY;
    }

    return {
      canonicalSignalKey: def.key,
      primaryDimoSignalName: def.primaryDimoSignalName ?? null,
      coverage,
      catalogSupportInRegistry: true,
      canonicalMappingImplemented: Boolean(def.primaryDimoSignalName || def.semanticNotes),
      empiricalExtractorImplemented,
      materializationEnabled,
      historicalQualityAvailable: key === 'provider_source_timestamp',
    };
  });
}
