import { materializeEd25519TrustSpkiV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
  type M3_3HvH4A3PhaseAP1TrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

const RELEASE_SHA_RE = /^[a-f0-9]{40}$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const ED25519_DETACHED_SIGNATURE_BYTES = 64;

export { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): { ok: true } | { ok: false; reasonCode: string } {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
    }
  }
  return { ok: true };
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  min = 1,
  max = 4096,
): { ok: true; value: string } | { ok: false; reasonCode: string } {
  const value = record[key];
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  return { ok: true, value };
}

function parseAuthorizationLimitsV1(
  raw: unknown,
): { ok: true; value: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1['authorizationLimits'] } | {
  ok: false;
  reasonCode: string;
} {
  if (!isPlainObject(raw)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const keys = rejectUnknownKeys(raw, [
    'schemaChangesAuthorized',
    'issuanceActivationAuthorized',
    'applicationRuntimeFlagChangesAuthorized',
    'hybridLoaderActivationAuthorized',
    'attestationInsertOrUpdateAuthorized',
    'retentionActivationAuthorized',
    'reconciliationActivationAuthorized',
    'backfillActivationAuthorized',
  ]);
  if (!keys.ok) return keys;
  const boolKeys = [
    'schemaChangesAuthorized',
    'issuanceActivationAuthorized',
    'applicationRuntimeFlagChangesAuthorized',
    'hybridLoaderActivationAuthorized',
    'attestationInsertOrUpdateAuthorized',
    'retentionActivationAuthorized',
    'reconciliationActivationAuthorized',
    'backfillActivationAuthorized',
  ] as const;
  for (const k of boolKeys) {
    if (raw[k] !== false) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
    }
  }
  return {
    ok: true,
    value: {
      schemaChangesAuthorized: false,
      issuanceActivationAuthorized: false,
      applicationRuntimeFlagChangesAuthorized: false,
      hybridLoaderActivationAuthorized: false,
      attestationInsertOrUpdateAuthorized: false,
      retentionActivationAuthorized: false,
      reconciliationActivationAuthorized: false,
      backfillActivationAuthorized: false,
    },
  };
}

export function parsePhaseAP1TrustedAuthorizationEvidenceV1(
  input: unknown,
): { ok: true; value: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 } | {
  ok: false;
  reasonCode: string;
} {
  if (!isPlainObject(input)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const topKeys = rejectUnknownKeys(input, [
    'contractVersion',
    'authorizationId',
    'governanceMode',
    'operatorIdentity',
    'changeTicket',
    'authorizedReleaseSha',
    'deploymentIdentity',
    'postgresTargetFingerprint',
    'auditRoleLogin',
    'queryManifestFingerprint',
    'approvalBinding',
    'maintenanceWindow',
    'authorizationLimits',
    'authorizationPolicyId',
    'maintenanceWindowPolicyId',
    'evidenceStorageDestination',
    'consumptionStoreBinding',
    'issuedAtUtc',
    'expiresAtUtc',
    'signature',
  ]);
  if (!topKeys.ok) return topKeys;

  if (input.contractVersion !== M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (input.governanceMode !== 'SINGLE_OPERATOR_V1') {
    return { ok: false, reasonCode: 'PHASE_A_P1_GOVERNANCE_MODE_UNSUPPORTED' };
  }

  const authorizationId = requireString(input, 'authorizationId', 8, 128);
  if (!authorizationId.ok) return authorizationId;
  const operatorIdentity = requireString(input, 'operatorIdentity', 3, 320);
  if (!operatorIdentity.ok) return operatorIdentity;
  const changeTicket = requireString(input, 'changeTicket', 1, 128);
  if (!changeTicket.ok) return changeTicket;
  const authorizedReleaseSha = requireString(input, 'authorizedReleaseSha', 40, 40);
  if (!authorizedReleaseSha.ok) return authorizedReleaseSha;
  if (!RELEASE_SHA_RE.test(authorizedReleaseSha.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }

  if (!isPlainObject(input.deploymentIdentity)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const depKeys = rejectUnknownKeys(input.deploymentIdentity, [
    'releaseCheckoutSha',
    'deploymentHost',
    'deploymentLabel',
  ]);
  if (!depKeys.ok) return depKeys;
  const releaseCheckoutSha = requireString(input.deploymentIdentity, 'releaseCheckoutSha', 40, 40);
  if (!releaseCheckoutSha.ok) return releaseCheckoutSha;
  if (!RELEASE_SHA_RE.test(releaseCheckoutSha.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const deploymentHost = requireString(input.deploymentIdentity, 'deploymentHost', 1, 253);
  if (!deploymentHost.ok) return deploymentHost;
  const deploymentLabel = requireString(input.deploymentIdentity, 'deploymentLabel', 1, 128);
  if (!deploymentLabel.ok) return deploymentLabel;

  const postgresTargetFingerprint = requireString(input, 'postgresTargetFingerprint', 3, 512);
  if (!postgresTargetFingerprint.ok) return postgresTargetFingerprint;
  const auditRoleLogin = requireString(input, 'auditRoleLogin', 1, 128);
  if (!auditRoleLogin.ok) return auditRoleLogin;
  if (!/^[\w][\w.-]*$/.test(auditRoleLogin.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }

  const queryManifestFingerprint = requireString(input, 'queryManifestFingerprint', 64, 64);
  if (!queryManifestFingerprint.ok) return queryManifestFingerprint;
  if (!SHA256_HEX_RE.test(queryManifestFingerprint.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }

  const authorizationPolicyId = requireString(input, 'authorizationPolicyId', 1, 128);
  if (!authorizationPolicyId.ok) return authorizationPolicyId;
  const maintenanceWindowPolicyId = requireString(input, 'maintenanceWindowPolicyId', 1, 128);
  if (!maintenanceWindowPolicyId.ok) return maintenanceWindowPolicyId;

  if (!isPlainObject(input.approvalBinding)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const approvalKeys = rejectUnknownKeys(input.approvalBinding, [
    'approvalId',
    'executeNonce',
    'validFromUtc',
    'validUntilUtc',
  ]);
  if (!approvalKeys.ok) return approvalKeys;
  const approvalId = requireString(input.approvalBinding, 'approvalId', 1, 128);
  if (!approvalId.ok) return approvalId;
  const executeNonce = requireString(input.approvalBinding, 'executeNonce', 8, 128);
  if (!executeNonce.ok) return executeNonce;
  const validFromUtc = requireString(input.approvalBinding, 'validFromUtc', 20, 32);
  if (!validFromUtc.ok) return validFromUtc;
  const validUntilUtc = requireString(input.approvalBinding, 'validUntilUtc', 20, 32);
  if (!validUntilUtc.ok) return validUntilUtc;
  const approvalFromInstant = parseUtcInstantStrictV1(validFromUtc.value);
  const approvalUntilInstant = parseUtcInstantStrictV1(validUntilUtc.value);
  if (!approvalFromInstant || !approvalUntilInstant) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
  }
  if (approvalUntilInstant <= approvalFromInstant) {
    return { ok: false, reasonCode: 'PHASE_A_P1_APPROVAL_WINDOW_INVALID' };
  }

  if (!isPlainObject(input.maintenanceWindow)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const mwKeys = rejectUnknownKeys(input.maintenanceWindow, ['startUtc', 'endUtc']);
  if (!mwKeys.ok) return mwKeys;
  const startUtc = requireString(input.maintenanceWindow, 'startUtc', 20, 32);
  if (!startUtc.ok) return startUtc;
  const endUtc = requireString(input.maintenanceWindow, 'endUtc', 20, 32);
  if (!endUtc.ok) return endUtc;
  if (!parseUtcInstantStrictV1(startUtc.value) || !parseUtcInstantStrictV1(endUtc.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
  }

  const limits = parseAuthorizationLimitsV1(input.authorizationLimits);
  if (!limits.ok) return limits;

  const evidenceStorageDestination = requireString(input, 'evidenceStorageDestination', 1, 512);
  if (!evidenceStorageDestination.ok) return evidenceStorageDestination;

  if (!isPlainObject(input.consumptionStoreBinding)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const csKeys = rejectUnknownKeys(input.consumptionStoreBinding, [
    'absolutePathSha256',
    'markerFileName',
  ]);
  if (!csKeys.ok) return csKeys;
  const absolutePathSha256 = requireString(input.consumptionStoreBinding, 'absolutePathSha256', 64, 64);
  if (!absolutePathSha256.ok) return absolutePathSha256;
  if (!SHA256_HEX_RE.test(absolutePathSha256.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (input.consumptionStoreBinding.markerFileName !== '.synqdrive_phase_a_production_consumption_store_v1') {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }

  const issuedAtUtc = requireString(input, 'issuedAtUtc', 20, 32);
  if (!issuedAtUtc.ok) return issuedAtUtc;
  const expiresAtUtc = requireString(input, 'expiresAtUtc', 20, 32);
  if (!expiresAtUtc.ok) return expiresAtUtc;
  if (!parseUtcInstantStrictV1(issuedAtUtc.value) || !parseUtcInstantStrictV1(expiresAtUtc.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
  }

  if (!isPlainObject(input.signature)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  const sigKeys = rejectUnknownKeys(input.signature, ['algorithm', 'keyId', 'detachedBase64']);
  if (!sigKeys.ok) return sigKeys;
  if (input.signature.algorithm !== 'Ed25519') {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_ALGORITHM_UNSUPPORTED' };
  }
  const keyId = requireString(input.signature, 'keyId', 1, 64);
  if (!keyId.ok) return keyId;
  const detachedBase64 = requireString(input.signature, 'detachedBase64', 1, 256);
  if (!detachedBase64.ok) return detachedBase64;

  return {
    ok: true,
    value: {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
      authorizationId: authorizationId.value,
      governanceMode: 'SINGLE_OPERATOR_V1',
      operatorIdentity: operatorIdentity.value,
      changeTicket: changeTicket.value,
      authorizedReleaseSha: authorizedReleaseSha.value,
      deploymentIdentity: {
        releaseCheckoutSha: releaseCheckoutSha.value,
        deploymentHost: deploymentHost.value,
        deploymentLabel: deploymentLabel.value,
      },
      postgresTargetFingerprint: postgresTargetFingerprint.value,
      auditRoleLogin: auditRoleLogin.value,
      queryManifestFingerprint: queryManifestFingerprint.value,
      approvalBinding: {
        approvalId: approvalId.value,
        executeNonce: executeNonce.value,
        validFromUtc: validFromUtc.value,
        validUntilUtc: validUntilUtc.value,
      },
      maintenanceWindow: {
        startUtc: startUtc.value,
        endUtc: endUtc.value,
      },
      authorizationLimits: limits.value,
      authorizationPolicyId: authorizationPolicyId.value,
      maintenanceWindowPolicyId: maintenanceWindowPolicyId.value,
      evidenceStorageDestination: evidenceStorageDestination.value,
      consumptionStoreBinding: {
        absolutePathSha256: absolutePathSha256.value,
        markerFileName: '.synqdrive_phase_a_production_consumption_store_v1',
      },
      issuedAtUtc: issuedAtUtc.value,
      expiresAtUtc: expiresAtUtc.value,
      signature: {
        algorithm: 'Ed25519',
        keyId: keyId.value,
        detachedBase64: detachedBase64.value,
      },
    },
  };
}

export function parsePhaseAP1TrustStoreV1(
  input: unknown,
): { ok: true; value: M3_3HvH4A3PhaseAP1TrustStoreV1 } | { ok: false; reasonCode: string } {
  if (!isPlainObject(input)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
  }
  const topKeys = rejectUnknownKeys(input, ['contractVersion', 'keys', 'revokedKeyIds']);
  if (!topKeys.ok) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
  }
  if (input.contractVersion !== M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_VERSION_UNSUPPORTED' };
  }
  if (!Array.isArray(input.keys)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
  }
  if (!Array.isArray(input.revokedKeyIds)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
  }

  const seenKeyIds = new Set<string>();
  const seenSpkiFingerprint = new Map<string, string>();
  const keys: M3_3HvH4A3PhaseAP1TrustStoreV1['keys'] = [];

  for (const entry of input.keys) {
    if (!isPlainObject(entry)) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
    }
    const entryKeys = rejectUnknownKeys(entry, [
      'keyId',
      'publicKeySpkiBase64',
      'notBeforeUtc',
      'notAfterUtc',
    ]);
    if (!entryKeys.ok) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
    }
    const keyId = requireString(entry, 'keyId', 1, 64);
    if (!keyId.ok) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
    }
    if (seenKeyIds.has(keyId.value)) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ID' };
    }
    seenKeyIds.add(keyId.value);

    const spkiB64 = requireString(entry, 'publicKeySpkiBase64', 32, 512);
    if (!spkiB64.ok) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_SCHEMA_INVALID' };
    }
    const spkiMaterialized = materializeEd25519TrustSpkiV1(spkiB64.value);
    if (!spkiMaterialized.ok) return spkiMaterialized;

    const aliasOwner = seenSpkiFingerprint.get(spkiMaterialized.value.spkiSha256Hex);
    if (aliasOwner && aliasOwner !== keyId.value) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ALIAS' };
    }
    seenSpkiFingerprint.set(spkiMaterialized.value.spkiSha256Hex, keyId.value);

    if (spkiB64.value !== spkiMaterialized.value.canonicalSpkiBase64) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_SPKI_BASE64_NONCANONICAL' };
    }

    let notBeforeUtc: string | undefined;
    if (entry.notBeforeUtc !== undefined) {
      if (typeof entry.notBeforeUtc !== 'string' || !parseUtcInstantStrictV1(entry.notBeforeUtc)) {
        return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
      }
      notBeforeUtc = entry.notBeforeUtc;
    }
    let notAfterUtc: string | undefined;
    if (entry.notAfterUtc !== undefined) {
      if (typeof entry.notAfterUtc !== 'string' || !parseUtcInstantStrictV1(entry.notAfterUtc)) {
        return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
      }
      notAfterUtc = entry.notAfterUtc;
    }

    keys.push({
      keyId: keyId.value,
      publicKeySpkiBase64: spkiMaterialized.value.canonicalSpkiBase64,
      notBeforeUtc,
      notAfterUtc,
    });
  }

  const revokedKeyIds: string[] = [];
  for (const revoked of input.revokedKeyIds) {
    if (typeof revoked !== 'string' || revoked.length < 1 || revoked.length > 64) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_STORE_REVOCATION_MALFORMED' };
    }
    revokedKeyIds.push(revoked);
  }

  return {
    ok: true,
    value: {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys,
      revokedKeyIds,
    },
  };
}

export function parsePhaseAP1TrustedAuthorizationVerifyContextV1(
  input: unknown,
): { ok: true; value: M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1 } | {
  ok: false;
  reasonCode: string;
} {
  if (!isPlainObject(input)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const allowed = [
    'runningReleaseSha',
    'deploymentHost',
    'deploymentLabel',
    'postgresTargetFingerprint',
    'auditRoleLogin',
    'approvalId',
    'executeNonce',
    'changeTicket',
    'authorizationId',
    'queryManifestFingerprint',
    'consumptionStorePathSha256',
    'maintenanceWindowPolicyId',
    'authorizationPolicyId',
    'liveDeploymentIdentityVerified',
  ];
  const keys = rejectUnknownKeys(input, allowed);
  if (!keys.ok) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }

  const runningReleaseSha = requireString(input, 'runningReleaseSha', 40, 40);
  if (!runningReleaseSha.ok || !RELEASE_SHA_RE.test(runningReleaseSha.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const deploymentHost = requireString(input, 'deploymentHost', 1, 253);
  if (!deploymentHost.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const deploymentLabel = requireString(input, 'deploymentLabel', 1, 128);
  if (!deploymentLabel.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const postgresTargetFingerprint = requireString(input, 'postgresTargetFingerprint', 3, 512);
  if (!postgresTargetFingerprint.ok) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const auditRoleLogin = requireString(input, 'auditRoleLogin', 1, 128);
  if (!auditRoleLogin.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const approvalId = requireString(input, 'approvalId', 1, 128);
  if (!approvalId.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const executeNonce = requireString(input, 'executeNonce', 8, 128);
  if (!executeNonce.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const changeTicket = requireString(input, 'changeTicket', 1, 128);
  if (!changeTicket.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const authorizationId = requireString(input, 'authorizationId', 8, 128);
  if (!authorizationId.ok) return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  const queryManifestFingerprint = requireString(input, 'queryManifestFingerprint', 64, 64);
  if (!queryManifestFingerprint.ok || !SHA256_HEX_RE.test(queryManifestFingerprint.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const consumptionStorePathSha256 = requireString(input, 'consumptionStorePathSha256', 64, 64);
  if (!consumptionStorePathSha256.ok || !SHA256_HEX_RE.test(consumptionStorePathSha256.value)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const maintenanceWindowPolicyId = requireString(input, 'maintenanceWindowPolicyId', 1, 128);
  if (!maintenanceWindowPolicyId.ok) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  const authorizationPolicyId = requireString(input, 'authorizationPolicyId', 1, 128);
  if (!authorizationPolicyId.ok) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_SCHEMA_INVALID' };
  }
  if (input.liveDeploymentIdentityVerified !== false) {
    return { ok: false, reasonCode: 'PHASE_A_P1_VERIFY_CONTEXT_LIVE_IDENTITY_UNVERIFIED_REQUIRED' };
  }

  return {
    ok: true,
    value: {
      runningReleaseSha: runningReleaseSha.value,
      deploymentHost: deploymentHost.value,
      deploymentLabel: deploymentLabel.value,
      postgresTargetFingerprint: postgresTargetFingerprint.value,
      auditRoleLogin: auditRoleLogin.value,
      approvalId: approvalId.value,
      executeNonce: executeNonce.value,
      changeTicket: changeTicket.value,
      authorizationId: authorizationId.value,
      queryManifestFingerprint: queryManifestFingerprint.value,
      consumptionStorePathSha256: consumptionStorePathSha256.value,
      maintenanceWindowPolicyId: maintenanceWindowPolicyId.value,
      authorizationPolicyId: authorizationPolicyId.value,
      liveDeploymentIdentityVerified: false,
    },
  };
}

export function decodeEd25519DetachedSignatureV1(
  detachedBase64: string,
): { ok: true; signature: Buffer } | { ok: false; reasonCode: string } {
  let signature: Buffer;
  try {
    signature = Buffer.from(detachedBase64, 'base64');
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_MALFORMED' };
  }
  if (signature.length !== ED25519_DETACHED_SIGNATURE_BYTES) {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_MALFORMED' };
  }
  return { ok: true, signature };
}
