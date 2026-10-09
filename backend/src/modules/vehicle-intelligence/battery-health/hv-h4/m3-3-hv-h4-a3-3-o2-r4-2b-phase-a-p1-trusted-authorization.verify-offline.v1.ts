import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import {
  computePhaseAQueryManifestFingerprintV1,
  hashPhaseAP1TrustedAuthorizationSigningPayloadV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
  type M3_3HvH4A3PhaseAP1TrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

const RELEASE_SHA_RE = /^[a-f0-9]{40}$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

function parseUtcInstantV1(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed.endsWith('Z') && !trimmed.includes('+00:00')) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

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
    const notBefore = parseUtcInstantV1(entry.notBeforeUtc);
    if (!notBefore || now < notBefore) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_NOT_YET_VALID' };
    }
  }
  if (entry.notAfterUtc) {
    const notAfter = parseUtcInstantV1(entry.notAfterUtc);
    if (!notAfter || now > notAfter) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_EXPIRED' };
    }
  }
  try {
    const der = Buffer.from(entry.publicKeySpkiBase64, 'base64');
    const publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return { ok: true, publicKey };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
}

function validateArtifactShapeV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (artifact.contractVersion !== M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (artifact.governanceMode !== 'SINGLE_OPERATOR_V1') {
    return { ok: false, reasonCode: 'PHASE_A_P1_GOVERNANCE_MODE_UNSUPPORTED' };
  }
  if (!RELEASE_SHA_RE.test(artifact.authorizedReleaseSha)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (!RELEASE_SHA_RE.test(artifact.deploymentIdentity.releaseCheckoutSha)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (!SHA256_HEX_RE.test(artifact.queryManifestFingerprint)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUSTED_AUTHORIZATION_SCHEMA_INVALID' };
  }
  if (!allAuthorizationLimitsFalseV1(artifact.authorizationLimits)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_LIMITS_FORBIDDEN' };
  }
  if (artifact.signature.algorithm !== 'Ed25519') {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_ALGORITHM_UNSUPPORTED' };
  }
  const validFrom = parseUtcInstantV1(artifact.approvalBinding.validFromUtc);
  const validUntil = parseUtcInstantV1(artifact.approvalBinding.validUntilUtc);
  if (!validFrom || !validUntil || validUntil <= validFrom) {
    return { ok: false, reasonCode: 'PHASE_A_P1_APPROVAL_WINDOW_INVALID' };
  }
  const loginFromFingerprint = artifact.postgresTargetFingerprint.split('@')[0] ?? '';
  if (loginFromFingerprint && loginFromFingerprint !== artifact.auditRoleLogin) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUDIT_LOGIN_MISMATCH' };
  }
  return { ok: true };
}

/**
 * Offline cryptographic verification only — does **not** authorize production execution.
 * Runtime P1 remains NO_GO until a future integration slice wires verified artifacts into the gate.
 */
export function verifyPhaseAProductionP1TrustedAuthorizationEvidenceOfflineV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
  trustStore: M3_3HvH4A3PhaseAP1TrustStoreV1,
  context: M3_3HvH4A3PhaseAP1TrustedAuthorizationVerifyContextV1,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAP1TrustedAuthorizationOfflineVerifyResultV1 {
  const now = options.now ?? new Date();

  const shape = validateArtifactShapeV1(artifact);
  if (!shape.ok) return shape;

  const expiresAt = parseUtcInstantV1(artifact.expiresAtUtc);
  if (!expiresAt || now > expiresAt) {
    return { ok: false, reasonCode: 'PHASE_A_P1_AUTHORIZATION_EXPIRED' };
  }

  const windowEnd = parseUtcInstantV1(artifact.maintenanceWindow.endUtc);
  const windowStart = parseUtcInstantV1(artifact.maintenanceWindow.startUtc);
  if (!windowStart || !windowEnd || now < windowStart || now > windowEnd) {
    return { ok: false, reasonCode: 'PHASE_A_P1_MAINTENANCE_WINDOW_CLOSED' };
  }

  if (artifact.authorizedReleaseSha !== context.authorizedReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_P1_RELEASE_SHA_MISMATCH' };
  }
  if (artifact.deploymentIdentity.releaseCheckoutSha !== context.authorizedReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_P1_DEPLOYMENT_SHA_MISMATCH' };
  }
  if (artifact.postgresTargetFingerprint !== context.postgresTargetFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_P1_POSTGRES_TARGET_MISMATCH' };
  }
  if (artifact.queryManifestFingerprint !== context.queryManifestFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_P1_QUERY_MANIFEST_MISMATCH' };
  }
  if (context.queryManifestFingerprint !== computePhaseAQueryManifestFingerprintV1()) {
    return { ok: false, reasonCode: 'PHASE_A_P1_QUERY_MANIFEST_CONTEXT_STALE' };
  }

  const keyResolved = resolveTrustPublicKeyV1(trustStore, artifact.signature.keyId, now);
  if (!keyResolved.ok) return keyResolved;

  let signature: Buffer;
  try {
    signature = Buffer.from(artifact.signature.detachedBase64, 'base64');
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_MALFORMED' };
  }

  const digest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
  const valid = verify(null, digest, keyResolved.publicKey, signature);
  if (!valid) {
    return { ok: false, reasonCode: 'PHASE_A_P1_SIGNATURE_INVALID' };
  }

  return { ok: true, authorizationId: artifact.authorizationId, keyId: artifact.signature.keyId };
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
