import type { VsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader';

/** Test/dev stub — skips ClickHouse/extended history reads. */
export function createNoopVsiProfileCadenceEvidenceLoader(): VsiProfileCadenceEvidenceLoader {
  return {
    loadRpmEvidence: async () => null,
    loadLvEvidence: async () => null,
  } as VsiProfileCadenceEvidenceLoader;
}
