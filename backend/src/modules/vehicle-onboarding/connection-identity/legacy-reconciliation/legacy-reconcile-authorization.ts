import { timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { LegacyReconcileAuthorization } from './legacy-connection-identity-reconcile.types';
import {
  assertLegacyReconcileOperatorAdmissionBoundary,
  assertLegacyReconcileProductionReleaseShaDeclared,
} from './legacy-reconcile-operator-admission';
import { assertLegacyReconcileRuntimeReleaseMatches } from './legacy-reconcile-runtime-release';
import {
  assertOwnerExecuteAuthorizationNotReplayed,
  verifyVoSigB1OwnerExecuteAuthorization,
  verifyVoSigB1OwnerRollbackAuthorization,
  computeLegacyReconcileRollbackOperatorAdmissionProof,
} from './legacy-reconcile-owner-authorization';

export { isTrustedLegacyReconcileReleaseSha } from './legacy-reconcile-operator-admission';

export async function assertLegacyReconcileExecuteAuthorization(
  prisma: PrismaClient,
  auth: LegacyReconcileAuthorization,
  input: { organizationId: string; linkIds: string[] },
  manifestFingerprint: string,
): Promise<void> {
  if (auth.mode !== 'EXECUTE') {
    throw new Error('LEGACY_RECONCILE_EXECUTE_REQUIRES_EXECUTE_MODE');
  }
  if (!auth.authorizationReference?.trim()) {
    throw new Error('LEGACY_RECONCILE_AUTHORIZATION_REFERENCE_REQUIRED');
  }
  if (!auth.operatorReference?.trim()) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_REFERENCE_REQUIRED');
  }
  if (!auth.runId?.trim()) {
    throw new Error('LEGACY_RECONCILE_RUN_ID_REQUIRED');
  }
  const manifest = auth.manifestFingerprint?.trim();
  if (!manifest) {
    throw new Error('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_REQUIRED');
  }
  if (manifest !== manifestFingerprint.trim()) {
    throw new Error('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH');
  }
  assertLegacyReconcileProductionReleaseShaDeclared(auth);
  const tenantScope = auth.tenantScopeOrganizationId?.trim();
  if (!tenantScope || tenantScope !== input.organizationId.trim()) {
    throw new Error('LEGACY_RECONCILE_TENANT_SCOPE_MISMATCH');
  }
  for (const linkId of input.linkIds) {
    if (!auth.allowlistedLinkIds.has(linkId)) {
      throw new Error(`LEGACY_RECONCILE_LINK_NOT_ALLOWLISTED:${linkId}`);
    }
  }
  if (!auth.ownerExecuteAuthorizationToken?.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_EXECUTE_AUTHORIZATION_REQUIRED');
  }
  verifyVoSigB1OwnerExecuteAuthorization({
    token: auth.ownerExecuteAuthorizationToken,
    organizationId: input.organizationId,
    linkIds: input.linkIds,
    manifestFingerprint: manifest,
    authorizationReference: auth.authorizationReference,
    runId: auth.runId,
    productionReleaseSha: auth.productionReleaseSha,
  });
  await assertOwnerExecuteAuthorizationNotReplayed(prisma, {
    authorizationReference: auth.authorizationReference,
    runId: auth.runId,
  });
  assertLegacyReconcileOperatorAdmissionBoundary(auth, manifestFingerprint);
}

export type LegacyReconcileRollbackAuthorization = {
  mode: 'ROLLBACK_EXECUTE';
  targetAuditId: string;
  authorizationReference: string;
  operatorReference: string;
  runId: string;
  productionReleaseSha: string;
  ownerRollbackAuthorizationToken: string;
  operatorRollbackAdmissionProof: string;
};

export function assertLegacyReconcileRollbackAuthorization(auth: LegacyReconcileRollbackAuthorization): void {
  if (auth.mode !== 'ROLLBACK_EXECUTE') {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_MODE_REQUIRED');
  }
  if (!auth.targetAuditId?.trim()) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_TARGET_AUDIT_REQUIRED');
  }
  if (!auth.authorizationReference?.trim()) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_AUTHORIZATION_REFERENCE_REQUIRED');
  }
  if (!auth.operatorReference?.trim()) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_OPERATOR_REFERENCE_REQUIRED');
  }
  if (!auth.runId?.trim()) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_RUN_ID_REQUIRED');
  }
  if (!auth.ownerRollbackAuthorizationToken?.trim()) {
    throw new Error('LEGACY_RECONCILE_OWNER_ROLLBACK_AUTHORIZATION_REQUIRED');
  }
  if (!auth.operatorRollbackAdmissionProof?.trim()) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_OPERATOR_PROOF_REQUIRED');
  }
  const declaredRelease = auth.productionReleaseSha?.trim().toLowerCase();
  if (!declaredRelease || !/^[0-9a-f]{40}$/.test(declaredRelease)) {
    throw new Error('LEGACY_RECONCILE_PRODUCTION_RELEASE_SHA_REQUIRED');
  }
  assertLegacyReconcileRuntimeReleaseMatches(declaredRelease);
  verifyVoSigB1OwnerRollbackAuthorization({
    token: auth.ownerRollbackAuthorizationToken,
    targetAuditId: auth.targetAuditId,
    authorizationReference: auth.authorizationReference,
    runId: auth.runId,
    productionReleaseSha: auth.productionReleaseSha,
  });
  const secret = process.env.VO_SIG_B1_OPERATOR_ADMISSION_SECRET?.trim();
  if (!secret) {
    throw new Error('LEGACY_RECONCILE_OPERATOR_ADMISSION_SECRET_MISSING');
  }
  const expected = computeLegacyReconcileRollbackOperatorAdmissionProof({
    targetAuditId: auth.targetAuditId,
    runId: auth.runId,
    authorizationReference: auth.authorizationReference,
    secret,
  });
  const a = Buffer.from(auth.operatorRollbackAdmissionProof, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_OPERATOR_PROOF_INVALID');
  }
}
