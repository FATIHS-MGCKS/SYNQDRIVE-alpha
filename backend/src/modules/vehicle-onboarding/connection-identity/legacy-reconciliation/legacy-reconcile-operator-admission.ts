import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LegacyReconcileAuthorization } from './legacy-connection-identity-reconcile.types';
import { VO_SIG_B1_TRUSTED_RELEASE_SHA_REGISTRY } from './vo-sig-b1-trusted-release.registry';

const ADMISSION_SECRET_ENV = 'VO_SIG_B1_OPERATOR_ADMISSION_SECRET';

export function isTrustedLegacyReconcileReleaseSha(sha: string): boolean {
  const normalized = sha.trim();
  if (!normalized) return false;
  if (VO_SIG_B1_TRUSTED_RELEASE_SHA_REGISTRY.has(normalized)) {
    return true;
  }
  return false;
}

export function computeLegacyReconcileOperatorAdmissionProof(input: {
  manifestFingerprint: string;
  runId: string;
  authorizationReference: string;
  secret: string;
}): string {
  const payload = `${input.manifestFingerprint}|${input.runId}|${input.authorizationReference}`;
  return createHmac('sha256', input.secret).update(payload).digest('hex');
}

function readAdmissionSecret(): string | null {
  const secret = process.env[ADMISSION_SECRET_ENV]?.trim();
  return secret || null;
}

export function assertLegacyReconcileOperatorAdmissionBoundary(
  auth: LegacyReconcileAuthorization,
  manifestFingerprint: string,
): void {
  if (!auth.ownerAuthorized) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_REQUIRED');
  }
  const secret = readAdmissionSecret();
  if (!secret) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_SECRET_MISSING');
  }
  const proof = auth.operatorAdmissionProof?.trim();
  if (!proof) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_PROOF_REQUIRED');
  }
  const expected = computeLegacyReconcileOperatorAdmissionProof({
    manifestFingerprint,
    runId: auth.runId,
    authorizationReference: auth.authorizationReference,
    secret,
  });
  const a = Buffer.from(proof, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_PROOF_INVALID');
  }
}
