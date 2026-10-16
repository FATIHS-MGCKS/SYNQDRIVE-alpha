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
 * P4 V1: all production chains inactive until explicit domain sign-off.
 * `vsi-fallback-fixture-domain-approved` exists for unit/integration fixtures only.
 */
export const VSI_FALLBACK_APPROVAL_CHAINS: readonly VsiFallbackChainSpecV1[] = [
  {
    chainId: 'vsi-fallback-fixture-domain-approved',
    fromCanonicalSignalKey: 'accelerator_pedal_position',
    toCanonicalSignalKey: 'vehicle_speed',
    status: VsiFallbackApprovalStatus.PRODUCTION_VALIDATED,
    domainOwner: 'VSI_TEST_FIXTURE_ONLY',
    evidenceReference: 'vsi-capability-resolver.postgres.integration.spec.ts',
    semanticNotes: ['Fixture-only — not authorized for production consumer substitution'],
  },
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

export function isFallbackChainExecutable(status: VsiFallbackApprovalStatus): boolean {
  return (
    status === VsiFallbackApprovalStatus.VALIDATED ||
    status === VsiFallbackApprovalStatus.PRODUCTION_VALIDATED
  );
}
