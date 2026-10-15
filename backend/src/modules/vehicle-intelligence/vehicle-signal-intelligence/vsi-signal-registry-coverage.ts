import { VSI_CANONICAL_SIGNAL_DEFINITIONS, type VsiCanonicalSignalKey } from './canonical-signal-keys';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';

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

/** Static coverage matrix for P3 audit (repository snapshot). */
export function buildVsiSignalRegistryCoverageMatrix(): Array<{
  canonicalSignalKey: VsiCanonicalSignalKey;
  primaryDimoSignalName: string | null;
  coverage: VsiSignalRegistryCoverageStatus;
}> {
  return Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS).map((key) => {
    const def = VSI_CANONICAL_SIGNAL_DEFINITIONS[key as VsiCanonicalSignalKey];
    let coverage: VsiSignalRegistryCoverageStatus =
      VsiSignalRegistryCoverageStatus.SUPPORTED_IN_CANONICAL_REGISTRY;
    if (materialized.has(key)) {
      coverage = VsiSignalRegistryCoverageStatus.MATERIALIZED_IN_PROFILE;
    } else if (def.primaryDimoSignalName) {
      coverage = VsiSignalRegistryCoverageStatus.CATALOG_ONLY;
    }
    return {
      canonicalSignalKey: def.key,
      primaryDimoSignalName: def.primaryDimoSignalName ?? null,
      coverage,
    };
  });
}
