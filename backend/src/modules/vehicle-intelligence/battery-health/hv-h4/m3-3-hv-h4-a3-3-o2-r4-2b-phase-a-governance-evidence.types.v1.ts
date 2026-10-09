export const M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_V1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_V1' as const;

export const M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_V1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_V1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_V1' as const;

export const M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_V1' as const;

export const M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_V1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_SIGNING_DOMAIN_V1 =
  'synqdrive.battery-v2.hv-h4.phase-a.governance-ratification-attestation.v1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_SIGNING_DOMAIN_V1 =
  'synqdrive.battery-v2.hv-h4.phase-a.governance-operator-risk-attestation.v1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_DEPLOYMENT_PROBE_SIGNING_DOMAIN_V1 =
  'synqdrive.battery-v2.hv-h4.phase-a.governance-deployment-probe.v1' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_POSTGRES_TARGET_SIGNING_DOMAIN_V1 =
  'synqdrive.battery-v2.hv-h4.phase-a.governance-postgres-target-evidence.v1' as const;

export type M3_3HvH4A3GovernanceTrustedPublicKeyV1 = {
  keyId: string;
  publicKeySpkiBase64: string;
  issuerPurpose: 'GOVERNANCE_RATIFICATION' | 'OPERATOR_RISK_ACCEPTANCE' | 'DEPLOYMENT_PROBE' | 'POSTGRES_TARGET';
  notBeforeUtc?: string;
  notAfterUtc?: string;
};

export type M3_3HvH4A3GovernanceTrustStoreV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_CONTRACT_V1;
  keys: M3_3HvH4A3GovernanceTrustedPublicKeyV1[];
  revokedKeyIds: string[];
};

export type M3_3HvH4A3GovernanceOwnerPolicyV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_CONTRACT_V1;
  repositoryFullName: string;
  expectedPullRequestNumber: number;
  governancePolicyId: string;
  governanceAdoptionProposalRef: string;
  /** Independently controlled authorized merging actors — not role labels like AUTHORITY_A. */
  authorizedOwnerLogins: string[];
};

export type M3_3HvH4A3RepositoryMergeEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_REPOSITORY_MERGE_EVIDENCE_CONTRACT_V1;
  evidenceSource: 'GITHUB_REST_API_READONLY_FIXTURE' | 'GITHUB_REST_API_READONLY';
  repositoryFullName: string;
  pullRequestNumber: number;
  mergeCommitSha: string;
  merged: true;
  mergedAtUtc: string;
  /** Untrusted metadata — never used as owner authentication. */
  mergeCommitAuthorLogin?: string;
  acquiredAtUtc: string;
};

export type M3_3HvH4A3GovernanceSignedAttestationV1 = {
  algorithm: 'Ed25519';
  keyId: string;
  detachedBase64: string;
};

export type M3_3HvH4A3GovernanceRatificationAttestationV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_CONTRACT_V1;
  repositoryFullName: string;
  pullRequestNumber: number;
  mergeCommitSha: string;
  governancePolicyId: string;
  governanceAdoptionProposalRef: string;
  authenticatedOwnerLogin: string;
  repositoryEvidenceFingerprintSha256: string;
  evidenceNonce: string;
  issuedAtUtc: string;
  expiresAtUtc: string;
  attestationPurpose: 'GOVERNANCE_RATIFICATION_V1';
  signature: M3_3HvH4A3GovernanceSignedAttestationV1;
};

export type M3_3HvH4A3GovernanceOperatorRiskAttestationV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1;
  acceptanceId: string;
  operatorLogin: string;
  changeTicket: string;
  approvalId: string;
  executeNonce: string;
  authorizedReleaseSha: string;
  postgresTargetFingerprint: string;
  maintenanceWindow: { startUtc: string; endUtc: string };
  pathBSecurityReviewExceptionScope: string;
  residualRiskAcknowledgement: true;
  evidenceNonce: string;
  issuedAtUtc: string;
  expiresAtUtc: string;
  attestationPurpose: 'OPERATOR_RISK_ACCEPTANCE_V2';
  signature: M3_3HvH4A3GovernanceSignedAttestationV1;
};

export type M3_3HvH4A3DeploymentIdentityEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_CONTRACT_V1;
  repositoryFullName: string;
  releaseCheckoutSha: string;
  deploymentHost: string;
  deploymentLabel: string;
  artifactFingerprintSha256: string;
  probeNonce: string;
  probedAtUtc: string;
  freshnessValidUntilUtc: string;
  evidenceSource: string;
  signature: M3_3HvH4A3GovernanceSignedAttestationV1;
};

export type M3_3HvH4A3PostgresTargetEvidenceVerificationStatusV1 =
  | 'TARGET_CONFIGURATION_MATCHED'
  | 'LIVE_DATABASE_ROLE_VERIFIED';

export type M3_3HvH4A3PostgresTargetEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1;
  hostname: string;
  port: number;
  database: string;
  auditRoleLogin: string;
  tlsRequirements: {
    sslmode: 'verify-full';
    hostnameValidationRequired: true;
    trustedCaBundleRequired: true;
  };
  credentialSeparation: {
    distinctFromApplicationDatabaseUrl: true;
    distinctFromMigrationOwnerCredentials: true;
    distinctFromAttestationIssuerPool: true;
  };
  verificationStatus: M3_3HvH4A3PostgresTargetEvidenceVerificationStatusV1;
  evidenceNonce: string;
  issuedAtUtc: string;
  expiresAtUtc: string;
  signature: M3_3HvH4A3GovernanceSignedAttestationV1;
};
