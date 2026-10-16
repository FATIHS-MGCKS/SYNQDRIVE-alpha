export const VSI_FALLBACK_APPROVAL_REGISTRY_VERSION = 'vsi-fallback-approval-v1' as const;

export const VsiFallbackApprovalStatus = {
  PROPOSED: 'PROPOSED',
  AWAITING_DOMAIN_REVIEW: 'AWAITING_DOMAIN_REVIEW',
  VALIDATED: 'VALIDATED',
  PRODUCTION_VALIDATED: 'PRODUCTION_VALIDATED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED',
} as const;

export type VsiFallbackApprovalStatus =
  (typeof VsiFallbackApprovalStatus)[keyof typeof VsiFallbackApprovalStatus];

export type VsiFallbackChainSpecV1 = {
  chainId: string;
  fromCanonicalSignalKey: string;
  toCanonicalSignalKey: string;
  status: VsiFallbackApprovalStatus;
  domainOwner: string;
  evidenceReference: string;
  semanticNotes: readonly string[];
};

/**
 * P4 V1 production registry — no PRODUCTION_VALIDATED chains.
 * Fixture chains live in `vsi-capability-resolver.test-registry.ts` for unit tests only.
 */
export const VSI_FALLBACK_APPROVAL_CHAINS: readonly VsiFallbackChainSpecV1[] = [
  {
    chainId: 'di-gps-speed-for-accelerator-proposed',
    fromCanonicalSignalKey: 'accelerator_pedal_position',
    toCanonicalSignalKey: 'vehicle_speed',
    status: VsiFallbackApprovalStatus.PROPOSED,
    domainOwner: 'driving_intelligence',
    evidenceReference: 'UNAPPROVED — GPS speed is not accelerator pedal position',
    semanticNotes: ['Must not activate without Driving Intelligence domain review'],
  },
  {
    chainId: 'hv-soc-for-lv-voltage-proposed',
    fromCanonicalSignalKey: 'lv_voltage',
    toCanonicalSignalKey: 'hv_battery_soc',
    status: VsiFallbackApprovalStatus.REJECTED,
    domainOwner: 'battery_v2',
    evidenceReference: 'VSI cross-workstream contract — HV SOC is not LV voltage',
    semanticNotes: [],
  },
];

export function findFallbackChain(chainId: string): VsiFallbackChainSpecV1 | undefined {
  return VSI_FALLBACK_APPROVAL_CHAINS.find((c) => c.chainId === chainId);
}

/** P4 V1 never executes fallback substitution — registry match / audit only. */
export function isFallbackChainExecutable(_status: VsiFallbackApprovalStatus): boolean {
  return false;
}
