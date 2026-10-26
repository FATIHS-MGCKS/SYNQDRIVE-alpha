import type {
  VsiProfileCadenceEvidencePort,
  VsiProfileCadenceLoadContext,
} from './vsi-profile-cadence-evidence.loader';
import type {
  VsiLvCadenceEvidenceInput,
  VsiRpmCadenceEvidenceInput,
} from './vsi-profile-cadence.types';

/** Test/dev stub — skips ClickHouse/extended history reads. */
export function createNoopVsiProfileCadenceEvidenceLoader(): VsiProfileCadenceEvidencePort {
  return {
    loadRpmEvidence: async () => null,
    loadLvEvidence: async () => null,
  };
}

/** Injectable test double for PostgreSQL lifecycle certification. */
export function createScriptedVsiProfileCadenceEvidenceLoader(script: {
  loadRpmEvidence?: (
    ctx: VsiProfileCadenceLoadContext,
  ) => Promise<VsiRpmCadenceEvidenceInput | null>;
  loadLvEvidence?: (
    ctx: VsiProfileCadenceLoadContext,
  ) => Promise<VsiLvCadenceEvidenceInput | null>;
}): VsiProfileCadenceEvidencePort {
  const noop = createNoopVsiProfileCadenceEvidenceLoader();
  return {
    loadRpmEvidence: script.loadRpmEvidence ?? ((ctx) => noop.loadRpmEvidence(ctx)),
    loadLvEvidence: script.loadLvEvidence ?? ((ctx) => noop.loadLvEvidence(ctx)),
  };
}
