import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import {
  computePhaseAQueryManifestFingerprintV1,
  hashPhaseAP1TrustedAuthorizationSigningPayloadV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import {
  decodeEd25519DetachedSignatureV1,
  parsePhaseAP1TrustStoreV1,
  parsePhaseAP1TrustedAuthorizationEvidenceV1,
  parsePhaseAP1TrustedAuthorizationVerifyContextV1,
  parseUtcInstantStrictV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.parse.v1';
import { resolveVerificationClockV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';
import {
  PHASE_A_P1_TRUSTED_AUTHORIZATION_ISSUED_AT_FUTURE_SKEW_MS_V1,
  PHASE_A_P1_TRUSTED_AUTHORIZATION_MAX_LIFETIME_MS_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.temporal-policy.v1';
import type {
  M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1,
  M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
  M3_3HvH4A3PhaseAP1TrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

function allAuthorizationLimitsFalseV1(
  limits: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1['authorizationLimits'],
): boolean {
  return (
    limits.schemaChangesAuthorized === false &&
    limits.issuanceActivationAuthorized === false &&
    limits.applicationRuntimeFlagChangesAuthorized === false &&
    limits.hybridLoaderActivationAuthorized === false &&
    limits.attestationInsertOrUpdateAuthorized === false &&
    limits.retentionActivationAuthorized === false &&
    limits.reconciliationActivationAuthorized === false &&
    limits.backfillActivationAuthorized === false
  );
}

function resolveTrustPublicKeyV1(
  trustStore: M3_3HvH4A3PhaseAP1TrustStoreV1,
  keyId: string,
  now: Date,
): { ok: true; publicKey: KeyObject } | { ok: false; reasonCode: string } {
  if (trustStore.revokedKeyIds.includes(keyId)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_REVOKED' };
  }
  const entry = trustStore.keys.find((k) => k.keyId === keyId);
  if (!entry) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_NOT_FOUND' };
  }
  if (entry.notBeforeUtc) {
    const notBefore = parseUtcInstantStrictV1(entry.notBeforeUtc);
    if (!notBefore || now < notBefore) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_NOT_YET_VALID' };
    }
  }
  if (entry.notAfterUtc) {
    const notAfter = parseUtcInstantStrictV1(entry.notAfterUtc);
    if (!notAfter || now > notAfter) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_EXPIRED' };
    }
  }
  try {
    const der = Buffer.from(entry.publicKeySpkiBase64, 'base64');
    const publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_TYPE_UNSUPPORTED' };
    }
    return { ok: true, publicKey };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
}

function validateArtifactSemanticShapeV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!allAuthorizationLimitsFalseV1(artifact.authorizationLimits)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_LIMITS_FORBIDDEN' };
  }
  const validFrom = parseUtcInstantStrictV1(artifact.approvalBinding.validFromUtc);
  const validUntil = parseUtcInstantStrictV1(artifact.approvalBinding.validUntilUtc);
  if (!validFrom || !validUntil || validUntil <= validFrom) {
    return { ok: false, reasonCode: 'PHASE_A_P1_APPROVAL_WINDOW_INVALID' };
  }
  const loginFromFingerprint = artifact.postgresTargetFingerprint.split('@')[0] ?? '';
  if (loginFromFingerprint && loginFromFingerprint !== artifact.auditRoleLogin) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUDIT_LOGIN_MISMATCH' };
  }
  if (artifact.authorizedReleaseSha !== artifact.deploymentIdentity.releaseCheckoutSha) {
    return { ok: false, reasonCode: 'PHASE_A_P1_DEPLOYMENT_SHA_MISMATCH' };
  }
  return { ok: true };
}

function validateTemporalPolicyV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  now: Date,
): { ok: true } | { ok: false; reasonCode: string } {
  const issuedAt = parseUtcInstantStrictV1(artifact.issuedAtUtc);
  const expiresAt = parseUtcInstantStrictV1(artifact.expiresAtUtc);
  const approvalFrom = parseUtcInstantStrictV1(artifact.approvalBinding.validFromUtc);
  const approvalUntil = parseUtcInstantStrictV1(artifact.approvalBinding.validUntilUtc);
  const windowStart = parseUtcInstantStrictV1(artifact.maintenanceWindow.startUtc);
  const windowEnd = parseUtcInstantStrictV1(artifact.maintenanceWindow.endUtc);

  if (!issuedAt || !expiresAt || !approvalFrom || !approvalUntil || !windowStart || !windowEnd) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_INSTANT_INVALID' };
  }

  if (issuedAt.getTime() > now.getTime() + PHASE_A_P1_TRUSTED_AUTHORIZATION_ISSUED_AT_FUTURE_SKEW_MS_V1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_ISSUED_AT_FUTURE' };
  }

  if (now < approvalFrom || now > approvalUntil) {
    return { ok: false, reasonCode: 'PHASE_A_P1_APPROVAL_BINDING_EXPIRED' };
  }

  if (now < windowStart || now > windowEnd) {
    return { ok: false, reasonCode: 'PHASE_A_P1_MAINTENANCE_WINDOW_CLOSED' };
  }

  if (now >= expiresAt) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_EXPIRED' };
  }

  if (expiresAt <= issuedAt) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TEMPORAL_BOUNDARY_INVALID' };
  }

  if (expiresAt.getTime() - issuedAt.getTime() > PHASE_A_P1_TRUSTED_AUTHORIZATION_MAX_LIFETIME_MS_V1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_LIFETIME_EXCEEDED' };
  }

  if (expiresAt > approvalUntil) {
    return { ok: false, reasonCode: 'PHASE_A_P1_EXPIRY_EXCEEDS_APPROVAL' };
  }

  if (windowEnd > approvalUntil || windowStart < approvalFrom) {
    return { ok: false, reasonCode: 'PHASE_A_P1_MAINTENANCE_OUTSIDE_APPROVAL' };
  }

  if (issuedAt < approvalFrom || issuedAt > approvalUntil) {
    return { ok: false, reasonCode: 'PHASE_A_P1_ISSUED_OUTSIDE_APPROVAL' };
  }

  return { ok: true };
}

function validateIndependentContextBindingsV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  context: M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (artifact.authorizedReleaseSha !== context.runningReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_P1_RELEASE_SHA_MISMATCH' };
  }
  if (artifact.deploymentIdentity.releaseCheckoutSha !== context.runningReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_P1_DEPLOYMENT_SHA_MISMATCH' };
  }
  if (artifact.deploymentIdentity.deploymentHost !== context.deploymentHost) {
    return { ok: false, reasonCode: 'PHASE_A_P1_DEPLOYMENT_HOST_MISMATCH' };
  }
  if (artifact.deploymentIdentity.deploymentLabel !== context.deploymentLabel) {
    return { ok: false, reasonCode: 'PHASE_A_P1_DEPLOYMENT_LABEL_MISMATCH' };
  }
  if (artifact.postgresTargetFingerprint !== context.postgresTargetFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_P1_POSTGRES_TARGET_MISMATCH' };
  }
  if (artifact.auditRoleLogin !== context.auditRoleLogin) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUDIT_LOGIN_CONTEXT_MISMATCH' };
  }
  if (artifact.approvalBinding.approvalId !== context.approvalId) {
    return { ok: false, reasonCode: 'PHASE_A_P1_APPROVAL_ID_MISMATCH' };
  }
  if (artifact.approvalBinding.executeNonce !== context.executeNonce) {
    return { ok: false, reasonCode: 'PHASE_A_P1_EXECUTE_NONCE_MISMATCH' };
  }
  if (artifact.changeTicket !== context.changeTicket) {
    return { ok: false, reasonCode: 'PHASE_A_P1_CHANGE_TICKET_MISMATCH' };
  }
  if (artifact.authorizationId !== context.authorizationId) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_ID_MISMATCH' };
  }
  if (artifact.queryManifestFingerprint !== context.queryManifestFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_P1_QUERY_MANIFEST_MISMATCH' };
  }
  if (context.queryManifestFingerprint !== computePhaseAQueryManifestFingerprintV1()) {
    return { ok: false, reasonCode: 'PHASE_A_P1_QUERY_MANIFEST_CONTEXT_STALE' };
  }
  if (artifact.consumptionStoreBinding.absolutePathSha256 !== context.consumptionStorePathSha256) {
    return { ok: false, reasonCode: 'PHASE_A_P1_CONSUMPTION_STORE_MISMATCH' };
  }
  if (artifact.maintenanceWindowPolicyId !== context.maintenanceWindowPolicyId) {
    return { ok: false, reasonCode: 'PHASE_A_P1_MAINTENANCE_POLICY_MISMATCH' };
  }
  if (artifact.authorizationPolicyId !== context.authorizationPolicyId) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_POLICY_MISMATCH' };
  }
  return { ok: true };
}

function verifyParsedArtifactV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  trustStore: M3_3HvH4A3PhaseAP1TrustStoreV1,
  context: M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
  now: Date,
): M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1 {
  const semantic = validateArtifactSemanticShapeV1(artifact);
  if (!semantic.ok) return semantic;

  const temporal = validateTemporalPolicyV1(artifact, now);
  if (!temporal.ok) return temporal;

  const keyResolved = resolveTrustPublicKeyV1(trustStore, artifact.signature.keyId, now);
  if (!keyResolved.ok) return keyResolved;

  const signatureDecoded = decodeEd25519DetachedSignatureV1(artifact.signature.detachedBase64);
  if (!signatureDecoded.ok) return signatureDecoded;

  const digest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
  const valid = verify(null, digest, keyResolved.publicKey, signatureDecoded.signature);
  if (!valid) {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_INVALID' };
  }

  const bindings = validateIndependentContextBindingsV1(artifact, context);
  if (!bindings.ok) return bindings;

  return { ok: true, authorizationId: artifact.authorizationId, keyId: artifact.signature.keyId };
}

/**
 * Offline cryptographic verification only — does **not** authorize production execution.
 * Runtime P1 remains NO_GO until a future integration slice wires verified artifacts into the gate.
 */
export function verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
  artifactInput: unknown,
  trustStoreInput: unknown,
  contextInput: unknown,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1 {
  const clock = resolveVerificationClockV1(options);
  if (!clock.ok) return clock;
  const now = clock.now;

  try {
    const trustParsed = parsePhaseAP1TrustStoreV1(trustStoreInput);
    if (!trustParsed.ok) return trustParsed;

    const artifactParsed = parsePhaseAP1TrustedAuthorizationEvidenceV1(artifactInput);
    if (!artifactParsed.ok) return artifactParsed;

    const contextParsed = parsePhaseAP1TrustedAuthorizationVerifyContextV1(contextInput);
    if (!contextParsed.ok) return contextParsed;

    return verifyParsedArtifactV1(
      artifactParsed.value,
      trustParsed.value,
      contextParsed.value,
      now,
    );
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_VERIFY_INTERNAL_ERROR' };
  }
}

/** Helper for binding checks when a database URL is available (no connect). */
export function postgresTargetFingerprintFromDatabaseUrlV1(databaseUrl: string): string | null {
  const login = parsePostgresUrlLoginV1(databaseUrl);
  if (!login) return null;
  try {
    const parsed = new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
    const host = parsed.hostname;
    const port = parsed.port || '5432';
    const database = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    return `${login}@${host}:${port}/${database}`;
  } catch {
    return null;
  }
}
