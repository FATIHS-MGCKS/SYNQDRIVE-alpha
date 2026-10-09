export const M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_V1' as const;

export const M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_V1' as const;

export const M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1 =
  'synqdrive.battery-v2.hv-h4.phase-a.p1-trusted-authorization.v1' as const;

export const M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_PURPOSE_V1 =
  'PHASE_A_PRODUCTION_READ_ONLY_AUDIT_V1' as const;

export const M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_SCOPE_V1 =
  'HV_H4_A3_O2_R4_2B_SINGLE_OPERATOR_OFFLINE_VERIFY_V1' as const;

export type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1;
  authorizationId: string;
  governanceMode: 'SINGLE_OPERATOR_V1';
  operatorIdentity: string;
  changeTicket: string;
  authorizedReleaseSha: string;
  deploymentIdentity: {
    releaseCheckoutSha: string;
    deploymentHost: string;
    deploymentLabel: string;
  };
  postgresTargetFingerprint: string;
  auditRoleLogin: string;
  queryManifestFingerprint: string;
  approvalBinding: {
    approvalId: string;
    executeNonce: string;
    validFromUtc: string;
    validUntilUtc: string;
  };
  maintenanceWindow: {
    startUtc: string;
    endUtc: string;
  };
  authorizationLimits: {
    schemaChangesAuthorized: false;
    issuanceActivationAuthorized: false;
    applicationRuntimeFlagChangesAuthorized: false;
    hybridLoaderActivationAuthorized: false;
    attestationInsertOrUpdateAuthorized: false;
    retentionActivationAuthorized: false;
    reconciliationActivationAuthorized: false;
    backfillActivationAuthorized: false;
  };
  authorizationPolicyId: string;
  maintenanceWindowPolicyId: string;
  evidenceStorageDestination: string;
  consumptionStoreBinding: {
    absolutePathSha256: string;
    markerFileName: '.synqdrive_phase_a_production_consumption_store_v1';
  };
  issuedAtUtc: string;
  expiresAtUtc: string;
  signature: {
    algorithm: 'Ed25519';
    keyId: string;
    detachedBase64: string;
  };
};

export type M3_3HvH4A3PhaseAP1TrustedPublicKeyV1 = {
  keyId: string;
  /** SPKI DER, base64 (Node `crypto.createPublicKey`) */
  publicKeySpkiBase64: string;
  notBeforeUtc?: string;
  notAfterUtc?: string;
};

export type M3_3HvH4A3PhaseAP1TrustStoreV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1;
  keys: M3_3HvH4A3PhaseAP1TrustedPublicKeyV1[];
  revokedKeyIds: string[];
};

/**
 * Independently sourced verification bindings for eventual P1 execution.
 * P1B0: synthetic fixture values only — `liveDeploymentIdentityVerified` must remain `false`.
 */
export type M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1 = {
  runningReleaseSha: string;
  deploymentHost: string;
  deploymentLabel: string;
  postgresTargetFingerprint: string;
  auditRoleLogin: string;
  approvalId: string;
  executeNonce: string;
  changeTicket: string;
  authorizationId: string;
  queryManifestFingerprint: string;
  consumptionStorePathSha256: string;
  maintenanceWindowPolicyId: string;
  authorizationPolicyId: string;
  liveDeploymentIdentityVerified: false;
};

export type M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1 =
  | { ok: true; authorizationId: string; keyId: string }
  | { ok: false; reasonCode: string };
