import { normalizePhaseAAuthorizedReleaseShaV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { OWNER_RATIFICATION_AUTHORITY_UNVERIFIED } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import type { M3_3HvH4A3GovernanceOwnerPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import {
  M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1,
  M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_VERIFY_RESULT_CONTRACT_V1,
  type M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionV1,
  type M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-github-repository-provenance.types.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unverified(reasonCode: string, partial: Partial<M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1> = {}): M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_VERIFY_RESULT_CONTRACT_V1,
    evidenceReceived: partial.evidenceReceived ?? false,
    structurallyValid: partial.structurallyValid ?? false,
    githubRepositoryFactsVerified: partial.githubRepositoryFactsVerified ?? false,
    mergingActorProviderIdentityMatched: partial.mergingActorProviderIdentityMatched ?? false,
    ownerRatificationAuthorityStatus: OWNER_RATIFICATION_AUTHORITY_UNVERIFIED,
    independentAuthorityAuthenticated: false,
    reasonCode,
  };
}

export function parseGitHubRepositoryProvenanceAcquisitionV1(
  parsed: unknown,
): { ok: true; acquisition: M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionV1 } | { ok: false; reasonCode: string } {
  try {
    if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1) {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
    }
    if (parsed.merged !== true) {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_NOT_MERGED' };
    }
    const mergeSha = normalizePhaseAAuthorizedReleaseShaV1(
      typeof parsed.mergeCommitSha === 'string' ? parsed.mergeCommitSha : undefined,
    );
    if (!mergeSha.ok) {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_MERGE_SHA_INVALID' };
    }
    const requiredStrings = [
      'repositoryFullName',
      'repositoryNodeId',
      'repositoryOwnerLogin',
      'protectedBaseBranch',
      'mergedAtUtc',
      'mergedByGithubLogin',
      'mergedByGithubId',
      'acquisitionAtUtc',
      'responseIntegritySha256',
      'acquisitionSource',
    ] as const;
    for (const key of requiredStrings) {
      if (typeof parsed[key] !== 'string' || !String(parsed[key]).trim()) {
        return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
      }
    }
    if (typeof parsed.pullRequestNumber !== 'number' || !Number.isInteger(parsed.pullRequestNumber)) {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
    }
    if (typeof parsed.mergeCommitReachableFromProtectedBaseBranch !== 'boolean') {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
    }
    if (!parseUtcInstantStrictV1(String(parsed.mergedAtUtc)) || !parseUtcInstantStrictV1(String(parsed.acquisitionAtUtc))) {
      return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
    }
    const acquisition = parsed as M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionV1;
    acquisition.mergeCommitSha = mergeSha.normalized;
    return { ok: true, acquisition };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID' };
  }
}

export function verifyGitHubRepositoryProvenanceV1(input: {
  acquisition: M3_3HvH4A3GitHubRepositoryProvenanceAcquisitionV1;
  ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
  expected: {
    repositoryFullName: string;
    repositoryNodeId: string;
    pullRequestNumber: number;
    protectedBaseBranch: string;
    mergeCommitSha: string;
  };
}): M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 {
  try {
    const { acquisition, ownerPolicy, expected } = input;
    const base = unverified(OWNER_RATIFICATION_AUTHORITY_UNVERIFIED, {
      evidenceReceived: true,
      structurallyValid: true,
    });

    if (acquisition.repositoryFullName !== expected.repositoryFullName) {
      return unverified('PHASE_A_GITHUB_REPOSITORY_IDENTITY_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (acquisition.repositoryNodeId !== expected.repositoryNodeId) {
      return unverified('PHASE_A_GITHUB_REPOSITORY_NODE_ID_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (acquisition.pullRequestNumber !== expected.pullRequestNumber) {
      return unverified('PHASE_A_GITHUB_PULL_REQUEST_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (acquisition.protectedBaseBranch !== expected.protectedBaseBranch) {
      return unverified('PHASE_A_GITHUB_PROTECTED_BASE_BRANCH_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (acquisition.mergeCommitSha !== expected.mergeCommitSha) {
      return unverified('PHASE_A_GITHUB_MERGE_SHA_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (!acquisition.mergeCommitReachableFromProtectedBaseBranch) {
      return unverified('PHASE_A_GITHUB_MERGE_COMMIT_NOT_REACHABLE', { evidenceReceived: true, structurallyValid: true });
    }
    if (ownerPolicy.repositoryFullName !== expected.repositoryFullName) {
      return unverified('PHASE_A_GOVERNANCE_OWNER_POLICY_REPOSITORY_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }
    if (ownerPolicy.expectedPullRequestNumber !== expected.pullRequestNumber) {
      return unverified('PHASE_A_GOVERNANCE_OWNER_POLICY_PR_MISMATCH', { evidenceReceived: true, structurallyValid: true });
    }

    const providerLogin = acquisition.mergedByGithubLogin.trim().toLowerCase();
    const authorized = ownerPolicy.authorizedOwnerLogins.map((l) => l.trim().toLowerCase());
    const mergingActorProviderIdentityMatched = providerLogin.length > 0 && authorized.includes(providerLogin);

    return {
      ...base,
      githubRepositoryFactsVerified: true,
      mergingActorProviderIdentityMatched,
      ownerRatificationAuthorityStatus: OWNER_RATIFICATION_AUTHORITY_UNVERIFIED,
      independentAuthorityAuthenticated: false,
      reasonCode: OWNER_RATIFICATION_AUTHORITY_UNVERIFIED,
    };
  } catch {
    return unverified('PHASE_A_GITHUB_PROVENANCE_ACQUISITION_INVALID');
  }
}
