import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import {
  REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE,
  M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
  PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import {
  hashGovernanceOperatorRiskAttestationSigningPayloadV1,
  hashGovernanceRatificationAttestationSigningPayloadV1,
  hashRepositoryMergeEvidenceFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
  M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import {
  createPhaseAGovernanceExternalAuthorityVerifierOfflineV1,
  loadPhaseAGovernanceOfflineEvidenceBundleV1,
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority-offline.v1';
import {
  resolvePhaseAGovernanceExternalAuthorityVerifierV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  isRepositoryMergeEvidenceProductionAuthoritativeV1,
  parseGovernanceTrustStoreV1,
  verifyGovernanceRatificationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  verifyGovernanceOperatorRiskAttestationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-verify-offline.v1';
import {
  evaluatePhaseAHumanVerificationReadinessV1,
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import {
  evaluatePhaseAProductionP1ExecutionGateV1,
  resolvePhaseAProductionP1AuthorizationV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import {
  canonicalBase64FromBytesV1,
  exportCanonicalEd25519SpkiDerV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';

const OWNER_A = 'owner-a-login';
const OWNER_B = 'owner-b-login';
const NOW = new Date('2026-10-09T12:00:00.000Z');

function signDigest(digest: Buffer, privateKey: KeyObject, keyId: string) {
  return {
    algorithm: 'Ed25519' as const,
    keyId,
    detachedBase64: sign(null, digest, privateKey).toString('base64'),
  };
}

function mintKey(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = exportCanonicalEd25519SpkiDerV1(publicKey);
  return {
    keyId,
    privateKey,
    publicKeySpkiBase64: canonicalBase64FromBytesV1(spki),
  };
}

describe('P1B1-A1-H1 trust anchor and replay boundary closure', () => {
  it('caller-supplied trust JSON cannot establish production governance authority', () => {
    const ratKey = mintKey('rat');
    const riskKey = mintKey('risk');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'rat', publicKeySpkiBase64: ratKey.publicKeySpkiBase64, issuerPurpose: 'GOVERNANCE_RATIFICATION' as const },
        { keyId: 'risk', publicKeySpkiBase64: riskKey.publicKeySpkiBase64, issuerPurpose: 'OPERATOR_RISK_ACCEPTANCE' as const },
      ],
      revokedKeyIds: [],
    };
    const env: NodeJS.ProcessEnv = {
      [M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV]: JSON.stringify(trustStore),
      [M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV]: JSON.stringify({
        contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
        repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
        expectedPullRequestNumber: 1954,
        governancePolicyId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
        governanceAdoptionProposalRef: 'architecture/battery-v2/governance/proposal.md',
        authorizedOwnerLogins: [OWNER_A],
      }),
    };
    const resolver = resolvePhaseAGovernanceExternalAuthorityVerifierV1(env);
    const rat = resolver.verifyRatificationProvenanceV1({
      provenanceClaims: {} as never,
      adoptionRecord: {} as never,
    });
    expect(rat.authorityStatus).toBe('AUTHORITY_NOT_VERIFIED');
    expect(rat.reasonCode).toBe(PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED);
    expect(rat.independentAuthorityStatus).toBe('INDEPENDENT_AUTHORITY_NOT_VERIFIED');
  });

  it('fixture GitHub evidence is never production authoritative', () => {
    const repo = {
      contractVersion: M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
      evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE' as const,
      repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
      pullRequestNumber: 1954,
      mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      merged: true as const,
      mergedAtUtc: '2026-10-09T10:30:00.000Z',
      acquiredAtUtc: '2026-10-09T10:31:00.000Z',
    };
    expect(isRepositoryMergeEvidenceProductionAuthoritativeV1(repo)).toBe(false);
  });

  it('rejects duplicate trust-store key ids without throwing', () => {
    const parsed = parseGovernanceTrustStoreV1({
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'dup', publicKeySpkiBase64: 'AAAA', issuerPurpose: 'GOVERNANCE_RATIFICATION' },
        { keyId: 'dup', publicKeySpkiBase64: 'BBBB', issuerPurpose: 'GOVERNANCE_RATIFICATION' },
      ],
      revokedKeyIds: [],
    });
    expect(parsed.ok).toBe(false);
  });

  it('verifier recreation resets ephemeral replay sets', () => {
    const bundle = loadPhaseAGovernanceOfflineEvidenceBundleV1({});
    expect(bundle.ok).toBe(false);
    const v1 = createPhaseAGovernanceExternalAuthorityVerifierOfflineV1({
      ownerPolicy: {
        contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
        repositoryFullName: 'x',
        expectedPullRequestNumber: 1,
        governancePolicyId: 'p',
        governanceAdoptionProposalRef: 'r',
        authorizedOwnerLogins: [OWNER_A],
      },
    });
    const v2 = createPhaseAGovernanceExternalAuthorityVerifierOfflineV1({
      ownerPolicy: {
        contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
        repositoryFullName: 'x',
        expectedPullRequestNumber: 1,
        governancePolicyId: 'p',
        governanceAdoptionProposalRef: 'r',
        authorizedOwnerLogins: [OWNER_A],
      },
    });
    expect(v1).not.toBe(v2);
    expect(v1.verifyOperatorRiskAcceptanceV1({} as never).authorityStatus).toBe('AUTHORITY_NOT_VERIFIED');
  });

  it('signed attestation for owner A cannot authorize approver B', () => {
    const riskKey = mintKey('risk');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'risk', publicKeySpkiBase64: riskKey.publicKeySpkiBase64, issuerPurpose: 'OPERATOR_RISK_ACCEPTANCE' as const }],
      revokedKeyIds: [],
    };
    const ownerPolicy = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
      repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
      expectedPullRequestNumber: 1954,
      governancePolicyId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
      governanceAdoptionProposalRef: 'architecture/battery-v2/governance/proposal.md',
      authorizedOwnerLogins: [OWNER_A, OWNER_B],
    };
    const attestation = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
      acceptanceId: 'acc-1',
      operatorLogin: OWNER_A,
      changeTicket: 'CHG-1',
      approvalId: 'apr-1',
      executeNonce: 'nonce-1',
      authorizedReleaseSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      postgresTargetFingerprint: 'audit_ro@prod-db.example.com:5432/synqdrive',
      maintenanceWindow: { startUtc: '2026-10-09T10:00:00.000Z', endUtc: '2026-10-09T15:00:00.000Z' },
      pathBSecurityReviewExceptionScope: 'scope',
      residualRiskAcknowledgement: true as const,
      acceptedAtUtc: '2026-10-09T11:00:00.000Z',
      evidenceNonce: 'n1',
      issuedAtUtc: '2026-10-09T11:00:00.000Z',
      expiresAtUtc: '2026-10-09T15:00:00.000Z',
      attestationPurpose: 'OPERATOR_RISK_ACCEPTANCE_V2' as const,
      signature: { algorithm: 'Ed25519' as const, keyId: 'risk', detachedBase64: '' },
    };
    const digest = hashGovernanceOperatorRiskAttestationSigningPayloadV1(attestation);
    attestation.signature = signDigest(digest, riskKey.privateKey, 'risk');
    const claims = {
      contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
      governanceMode: 'SINGLE_OPERATOR_V1' as const,
      operatorIdentity: OWNER_B,
      authorizedOwnerIdentity: OWNER_B,
      changeTicket: 'CHG-1',
      approvalBinding: {
        approvalId: 'apr-1',
        executeNonce: 'nonce-1',
        validFrom: '2026-10-09T11:00:00.000Z',
        validUntil: '2026-10-09T14:00:00.000Z',
      },
      maintenanceWindow: attestation.maintenanceWindow,
      pathBSecurityReviewExceptionScope: 'scope',
      residualRiskAcknowledgement: true as const,
      provenanceAuthenticationStatus: 'UNVERIFIED' as const,
      acceptedAtUtc: '2026-10-09T11:00:00.000Z',
      attestation: 'claim only',
    };
    const result = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: claims,
      authorizedHumanApprover: OWNER_B,
      changeTicket: 'CHG-1',
      approvalBinding: claims.approvalBinding,
      maintenanceWindow: claims.maintenanceWindow,
      authorizedReleaseSha: attestation.authorizedReleaseSha,
      postgresTargetFingerprint: attestation.postgresTargetFingerprint,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it('cryptographic pass on fixture merge still returns REPOSITORY_MERGE_PROVENANCE_UNVERIFIED', () => {
    const ratKey = mintKey('rat');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'rat', publicKeySpkiBase64: ratKey.publicKeySpkiBase64, issuerPurpose: 'GOVERNANCE_RATIFICATION' as const }],
      revokedKeyIds: [],
    };
    const ownerPolicy = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
      repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
      expectedPullRequestNumber: 1954,
      governancePolicyId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
      governanceAdoptionProposalRef: 'architecture/battery-v2/governance/proposal.md',
      authorizedOwnerLogins: [OWNER_A],
    };
    const repositoryEvidence = {
      contractVersion: M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
      evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE' as const,
      repositoryFullName: 'FATIHS-MGCKS/SYNQDRIVE-alpha',
      pullRequestNumber: 1954,
      mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      merged: true as const,
      mergedAtUtc: '2026-10-09T10:30:00.000Z',
      acquiredAtUtc: '2026-10-09T10:31:00.000Z',
    };
    const attestation = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
      repositoryFullName: repositoryEvidence.repositoryFullName,
      pullRequestNumber: 1954,
      mergeCommitSha: repositoryEvidence.mergeCommitSha,
      governancePolicyId: ownerPolicy.governancePolicyId,
      governanceAdoptionProposalRef: ownerPolicy.governanceAdoptionProposalRef,
      authenticatedOwnerLogin: OWNER_A,
      repositoryEvidenceFingerprintSha256: hashRepositoryMergeEvidenceFingerprintV1(repositoryEvidence),
      evidenceNonce: 'rat-nonce',
      issuedAtUtc: '2026-10-09T11:00:00.000Z',
      expiresAtUtc: '2026-10-09T15:00:00.000Z',
      attestationPurpose: 'GOVERNANCE_RATIFICATION_V1' as const,
      signature: { algorithm: 'Ed25519' as const, keyId: 'rat', detachedBase64: '' },
    };
    const digest = hashGovernanceRatificationAttestationSigningPayloadV1(attestation);
    attestation.signature = signDigest(digest, ratKey.privateKey, 'rat');
    const result = verifyGovernanceRatificationOfflineV1({
      trustStore,
      ownerPolicy,
      repositoryEvidence,
      attestation,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cryptographicVerificationStatus).toBe('SIGNATURE_VALID_WITH_SUPPLIED_KEY');
      expect(result.independentAuthorityVerified).toBe(false);
      expect(result.reasonCode).toBe(REPOSITORY_MERGE_PROVENANCE_UNVERIFIED_REASON_CODE);
    }
  });

  it('keeps P1 NO_GO with zero Prisma usage when env contains full synthetic bundle', () => {
    const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
    const env: NodeJS.ProcessEnv = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
      [M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV]: '{}',
    };
    const readiness = evaluatePhaseAHumanVerificationReadinessV1(env, {
      approvingAuthority: 'a@example.com',
      authorizedHumanApprover: OWNER_A,
      changeTicket: 'CHG',
      approvalBinding: {
        approvalId: 'apr',
        executeNonce: 'n',
        validFrom: '2026-10-09T11:00:00.000Z',
        validUntil: '2026-10-09T14:00:00.000Z',
      },
      maintenanceWindow: { startUtc: '2026-10-09T10:00:00.000Z', endUtc: '2026-10-09T15:00:00.000Z' },
      now: NOW,
    });
    expect(readiness.ok).toBe(false);
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
    const gate = evaluatePhaseAProductionP1ExecutionGateV1('postgresql://u@h:5432/db', env, { now: NOW });
    expect(gate.p1Authorization).toBe('NO_GO');
    expect(prismaSpy).not.toHaveBeenCalled();
    prismaSpy.mockRestore();
  });
});
