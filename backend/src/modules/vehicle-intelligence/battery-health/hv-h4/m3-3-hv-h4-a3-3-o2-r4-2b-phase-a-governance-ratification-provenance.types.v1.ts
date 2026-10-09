export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_V1' as const;

/**
 * Immutable ratification provenance — owner-declared intent in adoption JSON is not ratification proof.
 * `provenanceAuthenticationStatus` must be established by a trusted external verifier (not self-authored JSON).
 */
export type M3_3HvH4A3GovernanceRatificationProvenanceAuthenticationStatusV1 =
  | 'UNVERIFIED'
  | 'TRUSTED_EXTERNAL_VERIFIED';

export type M3_3HvH4A3GovernanceRatificationProvenanceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1;
  governancePolicyId: string;
  governanceAdoptionProposalRef: string;
  pullRequestNumber: number;
  ratifiedMergeCommitSha: string;
  authorizedOwnerIdentity: string;
  ratificationAction: 'OWNER_CONTROLLED_REPOSITORY_MERGE';
  provenanceAuthenticationStatus: M3_3HvH4A3GovernanceRatificationProvenanceAuthenticationStatusV1;
};
