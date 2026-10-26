import type { VsiProfileCadenceEvidencePort } from './vsi-profile-cadence-evidence.loader';

/** Test/dev stub — skips ClickHouse/extended history reads. */
export function createNoopVsiProfileCadenceEvidenceLoader(): VsiProfileCadenceEvidencePort {
  return {
    loadRpmEvidence: async () => null,
    loadLvEvidence: async () => null,
  };
}
