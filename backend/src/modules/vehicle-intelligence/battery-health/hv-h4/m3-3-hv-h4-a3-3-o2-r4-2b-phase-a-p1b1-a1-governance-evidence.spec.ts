import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import { M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.v1';
import {
  hashDeploymentIdentityEvidenceSigningPayloadV1,
  hashGovernanceOperatorRiskAttestationSigningPayloadV1,
  hashGovernanceRatificationAttestationSigningPayloadV1,
  hashPostgresTargetEvidenceSigningPayloadV1,
  hashRepositoryMergeEvidenceFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import {
  M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
  M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3DeploymentIdentityEvidenceV1,
  type M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
  type M3_3HvH4A3GovernanceRatificationAttestationV1,
  type M3_3HvH4A3GovernanceSignedAttestationV1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
  type M3_3HvH4A3PostgresTargetEvidenceV1,
  type M3_3HvH4A3RepositoryMergeEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON_ENV,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority-offline.v1';
import { resolvePhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  parseDeploymentIdentityEvidenceV1,
  verifyDeploymentIdentityEvidenceOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-deployment-identity-evidence.v1';
import {
  parsePostgresTargetEvidenceV1,
  verifyPostgresTargetEvidenceOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-postgres-target-evidence.v1';
import {
  verifyGovernanceRatificationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  verifyGovernanceOperatorRiskAttestationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-verify-offline.v1';
import {
  canonicalBase64FromBytesV1,
  exportCanonicalEd25519SpkiDerV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import {
  evaluatePhaseAHumanVerificationReadinessV1,
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import {
  evaluatePhaseAProductionP1ExecutionGateV1,
  resolvePhaseAProductionP1AuthorizationV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';

const POLICY_ID = 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1';
const PROPOSAL_REF =
  'architecture/battery-v2/governance/M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_PROPOSAL_2026-10-09.md';
const REPO = 'FATIHS-MGCKS/SYNQDRIVE-alpha';
const PR_NUMBER = 1954;
const OWNER_LOGIN = 'owner-github-login';
const MERGE_SHA = '68d3f913294f678d742e3215ffb7fcff90f0bfa6';
const RELEASE_SHA = MERGE_SHA;
const CHANGE_TICKET = 'CHG-P1B1-A1';
const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';
const TARGET_FP = canonicalPostgresTargetKeyV1(DB_URL)!;
const BINDING = {
  approvalId: 'apr-a1',
  executeNonce: 'nonce-a1',
  validFrom: '2026-10-09T11:00:00.000Z',
  validUntil: '2026-10-09T14:00:00.000Z',
};
const MAINTENANCE = {
  startUtc: '2026-10-09T10:00:00.000Z',
  endUtc: '2026-10-09T15:00:00.000Z',
};
const NOW = new Date('2026-10-09T12:00:00.000Z');

type PurposeKey = {
  keyId: string;
  purpose: 'GOVERNANCE_RATIFICATION' | 'OPERATOR_RISK_ACCEPTANCE' | 'DEPLOYMENT_PROBE' | 'POSTGRES_TARGET';
  privateKey: KeyObject;
  publicKeySpkiBase64: string;
};

function mintPurposeKey(
  purpose: PurposeKey['purpose'],
  keyId: string,
): PurposeKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = exportCanonicalEd25519SpkiDerV1(publicKey);
  return {
    keyId,
    purpose,
    privateKey,
    publicKeySpkiBase64: canonicalBase64FromBytesV1(spki),
  };
}

function signDigestV1(digest: Buffer, privateKey: KeyObject, keyId: string): M3_3HvH4A3GovernanceSignedAttestationV1 {
  return {
    algorithm: 'Ed25519',
    keyId,
    detachedBase64: sign(null, digest, privateKey).toString('base64'),
  };
}

function buildTrustStore(keys: PurposeKey[], revokedKeyIds: string[] = []): M3_3HvH4A3GovernanceTrustStoreV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
    keys: keys.map((k) => ({
      keyId: k.keyId,
      publicKeySpkiBase64: k.publicKeySpkiBase64,
      issuerPurpose: k.purpose,
    })),
    revokedKeyIds,
  };
}

function buildOwnerPolicy() {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
    repositoryFullName: REPO,
    expectedPullRequestNumber: PR_NUMBER,
    governancePolicyId: POLICY_ID,
    governanceAdoptionProposalRef: PROPOSAL_REF,
    authorizedOwnerLogins: [OWNER_LOGIN],
  };
}

function buildRepositoryEvidence(mergeSha: string): M3_3HvH4A3RepositoryMergeEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
    evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE',
    repositoryFullName: REPO,
    pullRequestNumber: PR_NUMBER,
    mergeCommitSha: mergeSha,
    merged: true,
    mergedAtUtc: '2026-10-09T10:30:00.000Z',
    mergeCommitAuthorLogin: 'untrusted-metadata',
    acquiredAtUtc: '2026-10-09T10:31:00.000Z',
  };
}

function buildSignedRatificationAttestation(
  keys: PurposeKey,
  repositoryEvidence: M3_3HvH4A3RepositoryMergeEvidenceV1,
  authenticatedOwnerLogin: string = OWNER_LOGIN,
): M3_3HvH4A3GovernanceRatificationAttestationV1 {
  const fingerprint = hashRepositoryMergeEvidenceFingerprintV1(repositoryEvidence);
  const draft: M3_3HvH4A3GovernanceRatificationAttestationV1 = {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
    repositoryFullName: REPO,
    pullRequestNumber: PR_NUMBER,
    mergeCommitSha: repositoryEvidence.mergeCommitSha,
    governancePolicyId: POLICY_ID,
    governanceAdoptionProposalRef: PROPOSAL_REF,
    authenticatedOwnerLogin,
    repositoryEvidenceFingerprintSha256: fingerprint,
    evidenceNonce: 'rat-nonce-a1',
    issuedAtUtc: '2026-10-09T11:00:00.000Z',
    expiresAtUtc: '2026-10-09T15:00:00.000Z',
    attestationPurpose: 'GOVERNANCE_RATIFICATION_V1',
    signature: { algorithm: 'Ed25519', keyId: keys.keyId, detachedBase64: '' },
  };
  const digest = hashGovernanceRatificationAttestationSigningPayloadV1(draft);
  draft.signature = signDigestV1(digest, keys.privateKey, keys.keyId);
  return draft;
}

function buildSignedRiskAttestation(keys: PurposeKey): M3_3HvH4A3GovernanceOperatorRiskAttestationV1 {
  const draft: M3_3HvH4A3GovernanceOperatorRiskAttestationV1 = {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V2,
    acceptanceId: 'risk-accept-a1',
    operatorLogin: OWNER_LOGIN,
    changeTicket: CHANGE_TICKET,
    approvalId: BINDING.approvalId,
    executeNonce: BINDING.executeNonce,
    authorizedReleaseSha: RELEASE_SHA,
    postgresTargetFingerprint: TARGET_FP,
    maintenanceWindow: MAINTENANCE,
    pathBSecurityReviewExceptionScope: 'Phase-A read-only audit SQL under Path B exception',
    residualRiskAcknowledgement: true,
    acceptedAtUtc: BINDING.validFrom,
    evidenceNonce: 'risk-nonce-a1',
    issuedAtUtc: '2026-10-09T11:00:00.000Z',
    expiresAtUtc: '2026-10-09T15:00:00.000Z',
    attestationPurpose: 'OPERATOR_RISK_ACCEPTANCE_V2',
    signature: { algorithm: 'Ed25519', keyId: keys.keyId, detachedBase64: '' },
  };
  const digest = hashGovernanceOperatorRiskAttestationSigningPayloadV1(draft);
  draft.signature = signDigestV1(digest, keys.privateKey, keys.keyId);
  return draft;
}

function buildAdoptionJson(): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
    governanceMode: 'SINGLE_OPERATOR_V1',
    policyPath: 'B',
    ratificationStatus: 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE',
    governanceContractId: POLICY_ID,
    governanceModeContractId: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
    authorities: {
      humanOwnerOperator: 'AUTHORITY_A',
      aiTechnicalReview: 'AUTHORITY_B_ADVISORY_ONLY',
      machineAuthorization: 'AUTHORITY_C_CRYPTOGRAPHIC_FUTURE',
    },
    acknowledgements: {
      noSecondHumanSecurityReviewerAtPolicyLevel: true,
      residualRiskSingleOperatorGovernance: true,
      multiPartyModePreservedForOtherOperations: true,
      externalSeparationOfDutiesCannotBeSelfWaived: true,
      doesNotAuthorizeProductionExecution: true,
      doesNotGrantPerChangeRiskAcceptance: true,
    },
    ownerDeclaredChoice: 'PATH_B_SINGLE_OPERATOR_SECURITY_REVIEW_EXCEPTION',
    governanceProposalRef: PROPOSAL_REF,
  });
}

function buildProvenanceClaimsJson(mergeSha: string): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
    governancePolicyId: POLICY_ID,
    governanceAdoptionProposalRef: PROPOSAL_REF,
    pullRequestNumber: PR_NUMBER,
    ratifiedMergeCommitSha: mergeSha,
    authorizedOwnerIdentity: 'AUTHORITY_A',
    ratificationAction: 'OWNER_CONTROLLED_REPOSITORY_MERGE',
    provenanceAuthenticationStatus: 'UNVERIFIED',
  });
}

function buildRiskClaimsObject() {
  return JSON.parse(buildRiskClaimsJson()) as import('./m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1').M3_3HvH4A3OperatorRiskAcceptanceV2;
}

function buildRiskClaimsJson(): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
    governanceMode: 'SINGLE_OPERATOR_V1',
    operatorIdentity: OWNER_LOGIN,
    authorizedOwnerIdentity: OWNER_LOGIN,
    changeTicket: CHANGE_TICKET,
    approvalBinding: BINDING,
    maintenanceWindow: MAINTENANCE,
    pathBSecurityReviewExceptionScope: 'Phase-A read-only audit SQL under Path B exception',
    residualRiskAcknowledgement: true,
    provenanceAuthenticationStatus: 'UNVERIFIED',
    acceptedAtUtc: BINDING.validFrom,
    attestation: 'Synthetic fixture — not execution authorization.',
  });
}

function buildSignedGovernanceEnv(keys: {
  ratification: PurposeKey;
  risk: PurposeKey;
  mergeSha?: string;
}): NodeJS.ProcessEnv {
  const repositoryEvidence = buildRepositoryEvidence(keys.mergeSha ?? MERGE_SHA);
  const trustStore = buildTrustStore([keys.ratification, keys.risk]);
  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
    [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: buildAdoptionJson(),
    [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson(
      repositoryEvidence.mergeCommitSha,
    ),
    [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson(),
    [M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV]: JSON.stringify(trustStore),
    [M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV]: JSON.stringify(buildOwnerPolicy()),
    [M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON_ENV]: JSON.stringify(repositoryEvidence),
    [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON_ENV]: JSON.stringify(
      buildSignedRatificationAttestation(keys.ratification, repositoryEvidence),
    ),
    [M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON_ENV]: JSON.stringify(
      buildSignedRiskAttestation(keys.risk),
    ),
  };
}

function readinessOptions() {
  return {
    approvingAuthority: 'author@example.com',
    authorizedHumanApprover: OWNER_LOGIN,
    changeTicket: CHANGE_TICKET,
    approvalBinding: BINDING,
    maintenanceWindow: MAINTENANCE,
    authorizedReleaseSha: RELEASE_SHA,
    postgresTargetFingerprint: TARGET_FP,
    governanceModeFromGoRecord: 'SINGLE_OPERATOR_V1' as const,
    now: NOW,
  };
}

describe('P1B1-A1 governance evidence foundation (offline, fail-closed execution)', () => {
  const ratKey = mintPurposeKey('GOVERNANCE_RATIFICATION', 'gov-rat-key');
  const riskKey = mintPurposeKey('OPERATOR_RISK_ACCEPTANCE', 'gov-risk-key');
  const probeKey = mintPurposeKey('DEPLOYMENT_PROBE', 'gov-probe-key');
  const pgKey = mintPurposeKey('POSTGRES_TARGET', 'gov-pg-key');

  it('rejects forged merge SHA and unauthorized owner actor in ratification offline verify', () => {
    const repo = buildRepositoryEvidence(MERGE_SHA);
    const attestation = buildSignedRatificationAttestation(ratKey, repo, 'attacker-login');
    const trustStore = buildTrustStore([ratKey]);
    const ownerPolicy = buildOwnerPolicy();

    const badOwner = verifyGovernanceRatificationOfflineV1({
      trustStore,
      ownerPolicy,
      repositoryEvidence: repo,
      attestation,
      now: NOW,
    });
    expect(badOwner.ok).toBe(false);
    if (!badOwner.ok) {
      expect(badOwner.reasonCode).toBe('PHASE_A_GOVERNANCE_OWNER_ACTOR_UNAUTHORIZED');
    }

    const wrongShaRepo = buildRepositoryEvidence('0000000000000000000000000000000000000000');
    const wrongShaAtt = buildSignedRatificationAttestation(ratKey, wrongShaRepo);
    const mismatch = verifyGovernanceRatificationOfflineV1({
      trustStore,
      ownerPolicy,
      repositoryEvidence: repo,
      attestation: wrongShaAtt,
      now: NOW,
    });
    expect(mismatch.ok).toBe(false);
  });

  it('returns disabled verifier when trust material is missing', () => {
    const verifier = resolvePhaseAGovernanceExternalAuthorityVerifierV1({});
    const result = verifier.verifyRatificationProvenanceV1({
      provenanceClaims: JSON.parse(buildProvenanceClaimsJson(MERGE_SHA)),
      adoptionRecord: JSON.parse(buildAdoptionJson()),
    });
    expect(result.authorityStatus).toBe('AUTHORITY_NOT_VERIFIED');
    expect(result.reasonCode).toBe('PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED');
  });

  it('rejects forged operator risk attestation and replayed acceptance id', () => {
    const trustStore = buildTrustStore([riskKey]);
    const ownerPolicy = buildOwnerPolicy();
    const attestation = buildSignedRiskAttestation(riskKey);
    const seen = new Set<string>();
    const riskClaims = buildRiskClaimsObject();
    const ok = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: riskClaims,
      authorizedHumanApprover: OWNER_LOGIN,
      changeTicket: CHANGE_TICKET,
      approvalBinding: BINDING,
      maintenanceWindow: MAINTENANCE,
      authorizedReleaseSha: RELEASE_SHA,
      postgresTargetFingerprint: TARGET_FP,
      now: NOW,
      seenAcceptanceIds: seen,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.independentAuthorityVerified).toBe(false);
    }

    const replay = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation,
      riskAcceptanceClaims: riskClaims,
      authorizedHumanApprover: OWNER_LOGIN,
      changeTicket: CHANGE_TICKET,
      approvalBinding: BINDING,
      maintenanceWindow: MAINTENANCE,
      authorizedReleaseSha: RELEASE_SHA,
      postgresTargetFingerprint: TARGET_FP,
      now: NOW,
      seenAcceptanceIds: seen,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.reasonCode).toBe('PHASE_A_GOVERNANCE_OPERATOR_RISK_ACCEPTANCE_REPLAY_WITHIN_EPHEMERAL_SCOPE');
    }

    const forged = buildSignedRiskAttestation(riskKey);
    forged.changeTicket = 'CHG-FORGED';
    const badTicket = verifyGovernanceOperatorRiskAttestationOfflineV1({
      trustStore,
      ownerPolicy,
      attestation: forged,
      riskAcceptanceClaims: riskClaims,
      authorizedHumanApprover: OWNER_LOGIN,
      changeTicket: CHANGE_TICKET,
      approvalBinding: BINDING,
      maintenanceWindow: MAINTENANCE,
      authorizedReleaseSha: RELEASE_SHA,
      postgresTargetFingerprint: TARGET_FP,
      now: NOW,
    });
    expect(badTicket.ok).toBe(false);
  });

  it('rejects deployment identity host/release mismatch and probe nonce replay', () => {
    const trustStore = buildTrustStore([probeKey]);
    const draft: M3_3HvH4A3DeploymentIdentityEvidenceV1 = {
      contractVersion: M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1,
      repositoryFullName: REPO,
      releaseCheckoutSha: RELEASE_SHA,
      deploymentHost: 'app.synqdrive.eu',
      deploymentLabel: 'synqdrive-production',
      artifactFingerprintSha256: 'abc123',
      probeNonce: 'probe-nonce-1',
      probedAtUtc: '2026-10-09T11:30:00.000Z',
      freshnessValidUntilUtc: '2026-10-09T13:00:00.000Z',
      evidenceSource: 'OFFLINE_FIXTURE_PROBE',
      signature: { algorithm: 'Ed25519', keyId: probeKey.keyId, detachedBase64: '' },
    };
    const digest = hashDeploymentIdentityEvidenceSigningPayloadV1(draft);
    draft.signature = signDigestV1(digest, probeKey.privateKey, probeKey.keyId);
    const parsed = parseDeploymentIdentityEvidenceV1(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const seen = new Set<string>();
    const ok = verifyDeploymentIdentityEvidenceOfflineV1({
      trustStore,
      evidence: parsed.evidence,
      expected: {
        repositoryFullName: REPO,
        releaseCheckoutSha: RELEASE_SHA,
        deploymentHost: 'app.synqdrive.eu',
        deploymentLabel: 'synqdrive-production',
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: NOW,
      seenProbeNonces: seen,
    });
    expect(ok.ok).toBe(true);

    const replay = verifyDeploymentIdentityEvidenceOfflineV1({
      trustStore,
      evidence: parsed.evidence,
      expected: {
        repositoryFullName: REPO,
        releaseCheckoutSha: RELEASE_SHA,
        deploymentHost: 'app.synqdrive.eu',
        deploymentLabel: 'synqdrive-production',
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: NOW,
      seenProbeNonces: seen,
    });
    expect(replay.ok).toBe(false);

    const hostMismatch = verifyDeploymentIdentityEvidenceOfflineV1({
      trustStore,
      evidence: parsed.evidence,
      expected: {
        repositoryFullName: REPO,
        releaseCheckoutSha: RELEASE_SHA,
        deploymentHost: 'evil.example.com',
        deploymentLabel: 'synqdrive-production',
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: NOW,
    });
    expect(hostMismatch.ok).toBe(false);
    if (!hostMismatch.ok) {
      expect(hostMismatch.reasonCode).toBe('PHASE_A_DEPLOYMENT_HOST_MISMATCH');
    }
  });

  it('matches postgres target configuration offline without live role verification', () => {
    const trustStore = buildTrustStore([pgKey]);
    const draft: M3_3HvH4A3PostgresTargetEvidenceV1 = {
      contractVersion: M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1,
      hostname: 'prod-db.example.com',
      port: 5432,
      database: 'synqdrive',
      auditRoleLogin: 'audit_ro',
      tlsRequirements: {
        sslmode: 'verify-full',
        hostnameValidationRequired: true,
        trustedCaBundleRequired: true,
      },
      credentialSeparation: {
        distinctFromApplicationDatabaseUrl: true,
        distinctFromMigrationOwnerCredentials: true,
        distinctFromAttestationIssuerPool: true,
      },
      verificationStatus: 'TARGET_CONFIGURATION_MATCHED',
      evidenceNonce: 'pg-nonce-1',
      issuedAtUtc: '2026-10-09T11:00:00.000Z',
      expiresAtUtc: '2026-10-09T15:00:00.000Z',
      signature: { algorithm: 'Ed25519', keyId: pgKey.keyId, detachedBase64: '' },
    };
    const digest = hashPostgresTargetEvidenceSigningPayloadV1(draft);
    draft.signature = signDigestV1(digest, pgKey.privateKey, pgKey.keyId);

    const liveClaim = parsePostgresTargetEvidenceV1({
      ...draft,
      verificationStatus: 'LIVE_DATABASE_ROLE_VERIFIED',
    });
    expect(liveClaim.ok).toBe(false);

    const parsed = parsePostgresTargetEvidenceV1(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ok = verifyPostgresTargetEvidenceOfflineV1({
      trustStore,
      evidence: parsed.evidence,
      expected: {
        hostname: 'prod-db.example.com',
        port: 5432,
        database: 'synqdrive',
        auditRoleLogin: 'audit_ro',
      },
      now: NOW,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.verificationStatus).toBe('TARGET_CONFIGURATION_MATCHED');
      expect(ok.liveDatabaseRoleVerified).toBe(false);
    }

    const wrongRole = verifyPostgresTargetEvidenceOfflineV1({
      trustStore,
      evidence: parsed.evidence,
      expected: {
        hostname: 'prod-db.example.com',
        port: 5432,
        database: 'synqdrive',
        auditRoleLogin: 'superuser',
      },
      now: NOW,
    });
    expect(wrongRole.ok).toBe(false);
  });

  it('fails closed on revoked trust key and wrong signing purpose substitution', () => {
    const repo = buildRepositoryEvidence(MERGE_SHA);
    const attestation = buildSignedRatificationAttestation(ratKey, repo);
    const revokedStore = buildTrustStore([ratKey], [ratKey.keyId]);
    const revoked = verifyGovernanceRatificationOfflineV1({
      trustStore: revokedStore,
      ownerPolicy: buildOwnerPolicy(),
      repositoryEvidence: repo,
      attestation,
      now: NOW,
    });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) {
      expect(revoked.reasonCode).toBe('PHASE_A_GOVERNANCE_TRUST_KEY_REVOKED');
    }

    const wrongPurposeStore = buildTrustStore([probeKey]);
    const wrongPurpose = verifyGovernanceRatificationOfflineV1({
      trustStore: wrongPurposeStore,
      ownerPolicy: buildOwnerPolicy(),
      repositoryEvidence: repo,
      attestation,
      now: NOW,
    });
    expect(wrongPurpose.ok).toBe(false);
  });

  it('does not grant governance readiness from caller-supplied signed evidence; P1 remains NO_GO', () => {
    const env = buildSignedGovernanceEnv({ ratification: ratKey, risk: riskKey });
    const readiness = evaluatePhaseAHumanVerificationReadinessV1(env, readinessOptions());
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reasonCode).toBe('PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED');
    }

    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');

    const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
    const integrationEnv = buildPhaseAProductionP1IntegrationEnvV1({
      productionDatabaseUrl: DB_URL,
      consumptionDir: `/tmp/phase-a-p1b1-a1-${Date.now()}`,
      governanceMode: 'SINGLE_OPERATOR_V1',
      releaseSha: RELEASE_SHA,
    });
    Object.assign(integrationEnv, env);
    integrationEnv[M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV] = buildRiskClaimsJson();

    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, integrationEnv, { now: NOW });
    expect(gate.p1Authorization).toBe('NO_GO');
    expect(prismaSpy).not.toHaveBeenCalled();
    prismaSpy.mockRestore();
  });

  it('fails readiness on incorrect governance policy binding in provenance claims', () => {
    const env = buildSignedGovernanceEnv({ ratification: ratKey, risk: riskKey });
    env[M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV] = buildProvenanceClaimsJson(MERGE_SHA).replace(
      POLICY_ID,
      'WRONG_POLICY',
    );
    const readiness = evaluatePhaseAHumanVerificationReadinessV1(env, readinessOptions());
    expect(readiness.ok).toBe(false);
  });
});
