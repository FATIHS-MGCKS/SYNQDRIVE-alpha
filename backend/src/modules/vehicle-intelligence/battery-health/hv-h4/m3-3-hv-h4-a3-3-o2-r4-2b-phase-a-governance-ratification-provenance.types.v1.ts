export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_V1' as const;

/**
 * Claim-only record — `provenanceAuthenticationStatus` documents claim state only.
 * `TRUSTED_EXTERNAL_VERIFIED` is rejected at load; authority requires external verifier output.
 */
export type M3_3HvH4A3GovernanceRatificationProvenanceAuthenticationStatusV1 = 'UNVERIFIED';

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
