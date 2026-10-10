import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import { M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import {
  hashDeploymentIdentityEvidenceSigningPayloadV1,
  hashGovernanceRatificationAttestationSigningPayloadV1,
  hashPostgresTargetEvidenceSigningPayloadV1,
  hashRepositoryMergeEvidenceFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import {
  M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
  M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3PostgresTargetEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { verifyDeploymentProbeFoundationOfflineV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-deployment-probe-foundation.v1';
import { buildGovernanceIndependentEvidenceReportV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-independent-evidence-report.v1';
import {
  M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1,
  M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
  M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
  M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
  M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-github-repository-provenance.types.v1';
import {
  parseGitHubRepositoryProvenanceAcquisitionV1,
  verifyGitHubRepositoryProvenanceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-github-repository-provenance.verify.v1';
import {
  fingerprintIndependentTrustAnchorProvisionV1,
  parseIndependentTrustAnchorProvisionV1,
  rejectCallerSuppliedTrustAnchorMaterialV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-independent-trust-anchor-provisioning.v1';
import {
  verifyPostgresTargetAuditFromMockCatalogV1,
  type M3_3HvH4A3PostgresCatalogAuditSnapshotV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-postgres-target-audit-foundation.v1';
import { verifyGovernanceRatificationOfflineV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import { resolvePhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import { resolvePhaseAProductionP1AuthorizationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import {
  canonicalBase64FromBytesV1,
  exportCanonicalEd25519SpkiDerV1,
  sha256HexFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const OWNER = 'owner-github-login';

function mintKey(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    privateKey,
    publicKeySpkiBase64: canonicalBase64FromBytesV1(exportCanonicalEd25519SpkiDerV1(publicKey)),
  };
}

function ownerPolicy() {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1,
    repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
    expectedPullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
    governancePolicyId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
    governanceAdoptionProposalRef: 'architecture/battery-v2/governance/proposal.md',
    authorizedOwnerLogins: [OWNER],
  };
}

function githubAcquisition(mergeSha: string, mergedBy = OWNER) {
  const body = {
    contractVersion: M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_CONTRACT_V1,
    acquisitionSource: 'GITHUB_REST_API_READONLY_FIXTURE' as const,
    repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
    repositoryNodeId: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
    repositoryOwnerLogin: 'FATIHS-MGCKS',
    pullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
    protectedBaseBranch: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
    mergeCommitSha: mergeSha,
    merged: true as const,
    mergedAtUtc: '2026-10-09T10:30:00.000Z',
    mergedByGithubLogin: mergedBy,
    mergedByGithubId: 'github-user-id-fixture',
    mergeCommitReachableFromProtectedBaseBranch: true,
    acquisitionAtUtc: '2026-10-09T10:31:00.000Z',
    responseIntegritySha256: sha256HexFingerprintV1(Buffer.from(mergeSha, 'utf8')),
  };
  return parseGitHubRepositoryProvenanceAcquisitionV1(body).ok
    ? body
    : (() => {
        throw new Error('fixture invalid');
      })();
}

describe('P1B1-A2 independent provenance & runtime evidence foundation', () => {
  beforeEach(() => {
    jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1').mockImplementation(() => {
      throw new Error('PRODUCTION_POSTGRES_CONNECTION_FORBIDDEN_IN_A2_TESTS');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies GitHub repository facts but leaves owner ratification authority unverified', () => {
    const parsed = parseGitHubRepositoryProvenanceAcquisitionV1(
      githubAcquisition(M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = verifyGitHubRepositoryProvenanceV1({
      acquisition: parsed.acquisition,
      ownerPolicy: ownerPolicy(),
      expected: {
        repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
        repositoryNodeId: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
        pullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
        protectedBaseBranch: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
        mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      },
    });
    expect(result.githubRepositoryFactsVerified).toBe(true);
    expect(result.mergingActorProviderIdentityMatched).toBe(true);
    expect(result.ownerRatificationAuthorityStatus).toBe('OWNER_RATIFICATION_AUTHORITY_UNVERIFIED');
    expect(result.independentAuthorityAuthenticated).toBe(false);
  });

  it('rejects forged merge SHA and wrong repository metadata', () => {
    const forged = parseGitHubRepositoryProvenanceAcquisitionV1(
      githubAcquisition('0000000000000000000000000000000000000000'),
    );
    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    const badSha = verifyGitHubRepositoryProvenanceV1({
      acquisition: forged.acquisition,
      ownerPolicy: ownerPolicy(),
      expected: {
        repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
        repositoryNodeId: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
        pullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
        protectedBaseBranch: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
        mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      },
    });
    expect(badSha.githubRepositoryFactsVerified).toBe(false);

    const wrongRepo = parseGitHubRepositoryProvenanceAcquisitionV1({
      ...githubAcquisition(M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1),
      repositoryFullName: 'evil/other',
    });
    expect(wrongRepo.ok).toBe(true);
    if (!wrongRepo.ok) return;
    const wrongRepoVerify = verifyGitHubRepositoryProvenanceV1({
      acquisition: wrongRepo.acquisition,
      ownerPolicy: ownerPolicy(),
      expected: {
        repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
        repositoryNodeId: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
        pullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
        protectedBaseBranch: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
        mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      },
    });
    expect(wrongRepoVerify.reasonCode).toBe('PHASE_A_GITHUB_REPOSITORY_IDENTITY_MISMATCH');
  });

  it('rejects self-signed caller trust bundles and revoked keys', () => {
    const self = rejectCallerSuppliedTrustAnchorMaterialV1({ provisioningChannel: 'CALLER_SUPPLIED_ENV' });
    expect(self.ok).toBe(false);
    const ratKey = mintKey('rat');
    const policy = ownerPolicy();
    const store = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'rat', publicKeySpkiBase64: ratKey.publicKeySpkiBase64, issuerPurpose: 'GOVERNANCE_RATIFICATION' as const }],
      revokedKeyIds: ['rat'],
    };
    const provisionDraft = {
      contractVersion: 'M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_V1',
      provisioningChannel: 'TEST_ISOLATED_FIXTURE' as const,
      anchorBundleId: 'test-bundle',
      anchorFingerprintSha256: '0'.repeat(64),
      ownerPolicy: policy,
      trustStore: store,
      issuedAtUtc: '2026-10-09T11:00:00.000Z',
      rotationEpoch: 0,
    };
    provisionDraft.anchorFingerprintSha256 = fingerprintIndependentTrustAnchorProvisionV1(provisionDraft);
    const parsed = parseIndependentTrustAnchorProvisionV1(provisionDraft);
    expect(parsed.ok).toBe(true);
    const revokedUse = verifyGovernanceRatificationOfflineV1({
      trustStore: store,
      ownerPolicy: policy,
      repositoryEvidence: {
        contractVersion: M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
        evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE',
        repositoryFullName: policy.repositoryFullName,
        pullRequestNumber: policy.expectedPullRequestNumber,
        mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
        merged: true,
        mergedAtUtc: '2026-10-09T10:30:00.000Z',
        acquiredAtUtc: '2026-10-09T10:31:00.000Z',
      },
      attestation: (() => {
        const repo = {
          contractVersion: M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1,
          evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE' as const,
          repositoryFullName: policy.repositoryFullName,
          pullRequestNumber: policy.expectedPullRequestNumber,
          mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
          merged: true as const,
          mergedAtUtc: '2026-10-09T10:30:00.000Z',
          acquiredAtUtc: '2026-10-09T10:31:00.000Z',
        };
        const draft = {
          contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1,
          repositoryFullName: policy.repositoryFullName,
          pullRequestNumber: policy.expectedPullRequestNumber,
          mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
          governancePolicyId: policy.governancePolicyId,
          governanceAdoptionProposalRef: policy.governanceAdoptionProposalRef,
          authenticatedOwnerLogin: OWNER,
          repositoryEvidenceFingerprintSha256: hashRepositoryMergeEvidenceFingerprintV1(repo),
          evidenceNonce: 'n1',
          issuedAtUtc: '2026-10-09T11:00:00.000Z',
          expiresAtUtc: '2026-10-09T15:00:00.000Z',
          attestationPurpose: 'GOVERNANCE_RATIFICATION_V1' as const,
          signature: { algorithm: 'Ed25519' as const, keyId: 'rat', detachedBase64: '' },
        };
        const digest = hashGovernanceRatificationAttestationSigningPayloadV1(draft);
        draft.signature = {
          algorithm: 'Ed25519',
          keyId: 'rat',
          detachedBase64: sign(null, digest, ratKey.privateKey).toString('base64'),
        };
        return draft;
      })(),
      now: NOW,
    });
    expect(revokedUse.ok).toBe(false);
  });

  it('rejects deployment probe replay, stale evidence, and release mismatch', () => {
    const probeKey = mintKey('probe');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'probe', publicKeySpkiBase64: probeKey.publicKeySpkiBase64, issuerPurpose: 'DEPLOYMENT_PROBE' as const }],
      revokedKeyIds: [],
    };
    const evidence = {
      contractVersion: M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1,
      repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
      releaseCheckoutSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      deploymentHost: 'app.synqdrive.eu',
      deploymentLabel: 'production',
      artifactFingerprintSha256: 'a'.repeat(64),
      probeNonce: 'probe-nonce-1',
      probedAtUtc: '2026-10-09T11:00:00.000Z',
      freshnessValidUntilUtc: '2026-10-09T13:00:00.000Z',
      evidenceSource: 'TEST_FIXTURE',
      signature: { algorithm: 'Ed25519' as const, keyId: 'probe', detachedBase64: '' },
    };
    const digest = hashDeploymentIdentityEvidenceSigningPayloadV1(evidence);
    evidence.signature = {
      algorithm: 'Ed25519',
      keyId: 'probe',
      detachedBase64: sign(null, digest, probeKey.privateKey).toString('base64'),
    };
    const seen = new Set<string>();
    const ok = verifyDeploymentProbeFoundationOfflineV1({
      trustStore,
      evidence,
      expected: {
        repositoryFullName: evidence.repositoryFullName,
        releaseCheckoutSha: evidence.releaseCheckoutSha,
        deploymentHost: evidence.deploymentHost,
        deploymentLabel: evidence.deploymentLabel,
        artifactFingerprintSha256: evidence.artifactFingerprintSha256,
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: NOW,
      seenProbeNonces: seen,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.deploymentShaVerifiedLive).toBe(false);
    }
    const replay = verifyDeploymentProbeFoundationOfflineV1({
      trustStore,
      evidence,
      expected: {
        repositoryFullName: evidence.repositoryFullName,
        releaseCheckoutSha: evidence.releaseCheckoutSha,
        deploymentHost: evidence.deploymentHost,
        deploymentLabel: evidence.deploymentLabel,
        artifactFingerprintSha256: evidence.artifactFingerprintSha256,
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: NOW,
      seenProbeNonces: seen,
    });
    expect(replay.ok).toBe(false);

    const stale = verifyDeploymentProbeFoundationOfflineV1({
      trustStore,
      evidence,
      expected: {
        repositoryFullName: evidence.repositoryFullName,
        releaseCheckoutSha: evidence.releaseCheckoutSha,
        deploymentHost: evidence.deploymentHost,
        deploymentLabel: evidence.deploymentLabel,
        artifactFingerprintSha256: evidence.artifactFingerprintSha256,
      },
      verificationChallengeNonce: 'probe-nonce-1',
      now: new Date('2026-10-09T20:00:00.000Z'),
      seenProbeNonces: new Set(),
    });
    expect(stale.ok).toBe(false);
  });

  it('rejects privileged postgres catalog impersonation fixtures', () => {
    const pgKey = mintKey('pg');
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId: 'pg', publicKeySpkiBase64: pgKey.publicKeySpkiBase64, issuerPurpose: 'POSTGRES_TARGET' as const }],
      revokedKeyIds: [],
    };
    const evidence: M3_3HvH4A3PostgresTargetEvidenceV1 = {
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
      signature: { algorithm: 'Ed25519', keyId: 'pg', detachedBase64: '' },
    };
    const digest = hashPostgresTargetEvidenceSigningPayloadV1(evidence);
    evidence.signature = {
      algorithm: 'Ed25519',
      keyId: 'pg',
      detachedBase64: sign(null, digest, pgKey.privateKey).toString('base64'),
    };
    const privilegedSnapshot: M3_3HvH4A3PostgresCatalogAuditSnapshotV1 = {
      contractVersion: 'M3_3_HV_H4_A3_POSTGRES_CATALOG_AUDIT_SNAPSHOT_V1',
      hostname: evidence.hostname,
      port: evidence.port,
      database: evidence.database,
      tlsMode: 'verify-full',
      trustedCaConfigured: true,
      auditRoleLogin: evidence.auditRoleLogin,
      applicationRoleLogin: 'app',
      migrationOwnerRoleLogin: 'migrate',
      issuerCredentialDistinctFromApplication: true,
      roles: [
        {
          rolname: 'audit_ro',
          rolsuper: true,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          rolbypassrls: false,
        },
      ],
      roleMemberships: [],
      schemaOwners: [],
    };
    const bad = verifyPostgresTargetAuditFromMockCatalogV1({
      trustStore,
      evidence,
      catalogSnapshot: privilegedSnapshot,
      now: NOW,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.liveDatabaseRoleVerified).toBe(false);
      expect(bad.productionConnectionAttempted).toBe(false);
    }
  });

  it('keeps production authority disabled and P1 NO_GO in synthetic combinations', () => {
    const acq = parseGitHubRepositoryProvenanceAcquisitionV1(
      githubAcquisition(M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1),
    );
    expect(acq.ok).toBe(true);
    if (!acq.ok) return;
    const github = verifyGitHubRepositoryProvenanceV1({
      acquisition: acq.acquisition,
      ownerPolicy: ownerPolicy(),
      expected: {
        repositoryFullName: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_FULL_NAME_V1,
        repositoryNodeId: M3_3_HV_H4_A3_GOVERNANCE_SYNQDRIVE_ALPHA_REPOSITORY_NODE_ID_FIXTURE_V1,
        pullRequestNumber: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PULL_REQUEST_NUMBER_V1,
        protectedBaseBranch: M3_3_HV_H4_A3_GOVERNANCE_ADOPTION_PROTECTED_BASE_BRANCH_V1,
        mergeCommitSha: M3_3_HV_H4_A3_GOVERNANCE_REFERENCE_PR1954_MERGE_SHA_V1,
      },
    });
    const report = buildGovernanceIndependentEvidenceReportV1({
      githubProvenance: github,
      cryptographicVerificationSucceeded: true,
    });
    expect(report.productionGovernanceAuthorityResolver).toBe('DISABLED');
    expect(report.p1Authorization).toBe('NO_GO');
    expect(report.operatorRiskAcceptanceStatus).toBe('OPERATOR_RISK_ACCEPTANCE_NOT_GRANTED');
    expect(report.pipeline.independentAuthorityAuthenticated).toBe(false);
    const resolver = resolvePhaseAGovernanceExternalAuthorityVerifierV1(process.env);
    expect(resolver.verifyRatificationProvenanceV1({ provenanceClaims: {} as never, adoptionRecord: {} as never }).authorityStatus).toBe(
      'AUTHORITY_NOT_VERIFIED',
    );
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });
});
