export const M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_V1' as const;

export const M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_VERIFY_RESULT_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_VERIFY_RESULT_V1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1 =
  'FATIHS-MGCKS/SYNQDRIVE-alpha' as const;

/** Stable GitHub repository node id for offline fixtures (not a live API lookup in A2 tests). */
export const M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1 =
  'R_kgDOFixtureSynqDriveAlpha' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1 = 1954 as const;

export const M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1 = 'main' as const;

export type M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionSourceV1 =
  | 'GITHUB_REST_API_READONLY'
  | 'GITHUB_REST_API_READONLY_FIXTURE';

/**
 * Read-only GitHub acquisition record. Provider metadata establishes repository facts only —
 * not independent cryptographic owner ratification.
 */
export type M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1;
  acquisitionSource: M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionSourceV1;
  repositoryFullName: string;
  repositoryNodeId: string;
  repositoryOwnerLogin: string;
  pullRequestNumber: number;
  protectedBaseBranch: string;
  mergeCommitSha: string;
  merged: true;
  mergedAtUtc: string;
  /** GitHub-reported merging actor (provider identity), not Git commit author. */
  mergedByGithubLogin: string;
  mergedByGithubId: string;
  mergeCommitReachableFromProtectedBaseBranch: boolean;
  acquisitionAtUtc: string;
  responseIntegritySha256: string;
};

export type M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_VERIFY_RESULT_CONTRACT_V1;
  evidenceReceived: boolean;
  structurallyValid: boolean;
  githubRepositoryFactsVerified: boolean;
  mergingActorProviderIdentityMatched: boolean;
  ownerRatificationAuthorityStatus: 'OWNER_RATIFICATION_AUTHORITY_UNVERIFIED';
  independentAuthorityAuthenticated: false;
  reasonCode: string;
};
