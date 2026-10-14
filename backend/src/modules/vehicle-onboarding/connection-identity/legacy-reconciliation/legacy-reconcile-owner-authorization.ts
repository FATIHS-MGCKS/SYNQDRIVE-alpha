import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalizeJsonValue } from './stable-metadata-fingerprint';
import { assertLegacyReconcileRuntimeReleaseMatches } from './legacy-reconcile-runtime-release';

export const VO_SIG_B1_OWNER_EXECUTE_AUTH_VERSION = 'vo-sig-b1-owner-execute-auth-v1';
export const VO_SIG_B1_OWNER_ROLLBACK_AUTH_VERSION = 'vo-sig-b1-owner-rollback-auth-v1';

const ADMISSION_SECRET_ENV = 'VO_SIG_B1_OPERATOR_ADMISSION_SECRET';

export type VoSigB1OwnerExecuteAuthorizationV1 = {
  version: typeof VO_SIG_B1_OWNER_EXECUTE_AUTH_VERSION;
  approvedReleaseSha: string;
  organizationId: string;
  sourceLinkIds: string[];
  manifestFingerprint: string;
  authorizationReference: string;
  runId: string;
  expiresAt: string;
};

export type VoSigB1OwnerRollbackAuthorizationV1 = {
  version: typeof VO_SIG_B1_OWNER_ROLLBACK_AUTH_VERSION;
  approvedReleaseSha: string;
  targetAuditId: string;
  authorizationReference: string;
  runId: string;
  expiresAt: string;
};

function readAdmissionSecret(): string {
  const secret = process.env[ADMISSION_SECRET_ENV]?.trim();
  if (!secret) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_SECRET_MISSING');
  }
  return secret;
}

function normalizeLinkIds(linkIds: readonly string[]): string[] {
  const normalized = linkIds.map((id) => id.trim()).filter(Boolean);
  const sorted = [...normalized].sort((a, b) => a.localeCompare(b));
  if (sorted.length !== normalized.length) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTH_DUPLICATE_LINK_ID');
  }
  return sorted;
}

function canonicalPayloadString(payload: Record<string, unknown>): string {
  return JSON.stringify(canonicalizeJsonValue(payload));
}

function signPayload(payload: Record<string, unknown>, secret: string): string {
  return createHmac('sha256', secret).update(canonicalPayloadString(payload)).digest('hex');
}

function verifySignature(payload: Record<string, unknown>, signatureHex: string, secret: string): void {
  const expected = signPayload(payload, secret);
  const a = Buffer.from(signatureHex, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_SIGNATURE_INVALID');
  }
}

export function issueVoSigB1OwnerExecuteAuthorization(
  input: Omit<VoSigB1OwnerExecuteAuthorizationV1, 'version' | 'sourceLinkIds'> & {
    sourceLinkIds: readonly string[];
  },
  secret?: string,
): string {
  const payload: VoSigB1OwnerExecuteAuthorizationV1 = {
    version: VO_SIG_B1_OWNER_EXECUTE_AUTH_VERSION,
    approvedReleaseSha: input.approvedReleaseSha.trim().toLowerCase(),
    organizationId: input.organizationId.trim(),
    sourceLinkIds: normalizeLinkIds(input.sourceLinkIds),
    manifestFingerprint: input.manifestFingerprint.trim(),
    authorizationReference: input.authorizationReference.trim(),
    runId: input.runId.trim(),
    expiresAt: input.expiresAt,
  };
  const sig = signPayload(payload, secret ?? readAdmissionSecret());
  return `${payload.version}.${Buffer.from(canonicalPayloadString(payload), 'utf8').toString('base64url')}.${sig}`;
}

export function issueVoSigB1OwnerRollbackAuthorization(
  input: Omit<VoSigB1OwnerRollbackAuthorizationV1, 'version'>,
  secret?: string,
): string {
  const payload: VoSigB1OwnerRollbackAuthorizationV1 = {
    version: VO_SIG_B1_OWNER_ROLLBACK_AUTH_VERSION,
    approvedReleaseSha: input.approvedReleaseSha.trim().toLowerCase(),
    targetAuditId: input.targetAuditId.trim(),
    authorizationReference: input.authorizationReference.trim(),
    runId: input.runId.trim(),
    expiresAt: input.expiresAt,
  };
  const sig = signPayload(payload, secret ?? readAdmissionSecret());
  return `${payload.version}.${Buffer.from(canonicalPayloadString(payload), 'utf8').toString('base64url')}.${sig}`;
}

function parseOwnerToken<T extends { version: string }>(
  token: string,
  expectedVersion: string,
): { payload: T; signature: string } {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== expectedVersion) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_MALFORMED');
  }
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  const payload = JSON.parse(json) as T;
  if (payload.version !== expectedVersion) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_VERSION_MISMATCH');
  }
  return { payload, signature: parts[2] };
}

function assertNotExpired(expiresAt: string, now: Date): void {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_EXPIRY_INVALID');
  }
  if (expiry.getTime() <= now.getTime()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_EXPIRED');
  }
}

export function verifyVoSigB1OwnerExecuteAuthorization(input: {
  token: string;
  organizationId: string;
  linkIds: readonly string[];
  manifestFingerprint: string;
  authorizationReference: string;
  runId: string;
  productionReleaseSha: string;
  now?: Date;
}): VoSigB1OwnerExecuteAuthorizationV1 {
  const secret = readAdmissionSecret();
  const { payload, signature } = parseOwnerToken<VoSigB1OwnerExecuteAuthorizationV1>(
    input.token,
    VO_SIG_B1_OWNER_EXECUTE_AUTH_VERSION,
  );
  verifySignature(payload as Record<string, unknown>, signature, secret);
  const now = input.now ?? new Date();
  assertNotExpired(payload.expiresAt, now);

  const linkIds = normalizeLinkIds(input.linkIds);
  const payloadLinks = normalizeLinkIds(payload.sourceLinkIds);
  if (linkIds.length !== payloadLinks.length || linkIds.some((id, i) => id !== payloadLinks[i])) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_COHORT_MISMATCH');
  }
  if (payload.organizationId !== input.organizationId.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_TENANT_MISMATCH');
  }
  if (payload.manifestFingerprint !== input.manifestFingerprint.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_MANIFEST_MISMATCH');
  }
  if (payload.authorizationReference !== input.authorizationReference.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_REFERENCE_MISMATCH');
  }
  if (payload.runId !== input.runId.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_RUN_MISMATCH');
  }
  const approved = payload.approvedReleaseSha.trim().toLowerCase();
  if (approved !== input.productionReleaseSha.trim().toLowerCase()) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_RELEASE_MISMATCH');
  }
  assertLegacyReconcileRuntimeReleaseMatches(approved);
  return payload;
}

export function verifyVoSigB1OwnerRollbackAuthorization(input: {
  token: string;
  targetAuditId: string;
  authorizationReference: string;
  runId: string;
  productionReleaseSha: string;
  now?: Date;
}): VoSigB1OwnerRollbackAuthorizationV1 {
  const secret = readAdmissionSecret();
  const { payload, signature } = parseOwnerToken<VoSigB1OwnerRollbackAuthorizationV1>(
    input.token,
    VO_SIG_B1_OWNER_ROLLBACK_AUTH_VERSION,
  );
  verifySignature(payload as Record<string, unknown>, signature, secret);
  const now = input.now ?? new Date();
  assertNotExpired(payload.expiresAt, now);

  if (payload.targetAuditId !== input.targetAuditId.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_ROLLBACK_AUDIT_MISMATCH');
  }
  if (payload.authorizationReference !== input.authorizationReference.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_ROLLBACK_REFERENCE_MISMATCH');
  }
  if (payload.runId !== input.runId.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_ROLLBACK_RUN_MISMATCH');
  }
  if (payload.approvedReleaseSha.trim().toLowerCase() !== input.productionReleaseSha.trim().toLowerCase()) {
    throw new Error('LEGACY_RECONCILE_OWNER_ROLLBACK_RELEASE_MISMATCH');
  }
  assertLegacyReconcileRuntimeReleaseMatches(payload.approvedReleaseSha);
  return payload;
}

export function computeLegacyReconcileRollbackOperatorAdmissionProof(input: {
  targetAuditId: string;
  runId: string;
  authorizationReference: string;
  secret: string;
}): string {
  const payload = `${input.targetAuditId}|${input.runId}|${input.authorizationReference}`;
  return createHmac('sha256', input.secret).update(payload).digest('hex');
}

export async function assertOwnerExecuteAuthorizationNotReplayed(
  prisma: PrismaClient,
  input: { authorizationReference: string; runId: string },
): Promise<void> {
  const conflicting = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
    where: {
      runId: input.runId,
      outcome: 'APPLIED',
      NOT: { authorizationReference: input.authorizationReference },
    },
    select: { id: true },
  });
  if (conflicting) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_REPLAY_DETECTED');
  }
}
