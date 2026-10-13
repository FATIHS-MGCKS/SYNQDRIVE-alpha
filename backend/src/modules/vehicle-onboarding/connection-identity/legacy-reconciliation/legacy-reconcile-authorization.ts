import type { LegacyReconcileAuthorization } from './legacy-connection-identity-reconcile.types';

const TRUSTED_RELEASE_ENV = 'VO_SIG_B1_TRUSTED_RELEASE_SHA';

export function resolveTrustedLegacyReconcileReleaseShas(): ReadonlySet<string> {
  const raw = process.env[TRUSTED_RELEASE_ENV] ?? '';
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(parts);
}

export function isTrustedLegacyReconcileReleaseSha(sha: string): boolean {
  const normalized = sha.trim();
  if (!normalized) return false;
  return resolveTrustedLegacyReconcileReleaseShas().has(normalized);
}

export function assertLegacyReconcileExecuteAuthorization(
  auth: LegacyReconcileAuthorization,
  input: { organizationId: string; linkIds: string[] },
): void {
  if (auth.mode !== 'EXECUTE') {
    throw new Error('LEGACY_RECONCILE_EXECUTE_REQUIRES_EXECUTE_MODE');
  }
  if (!auth.ownerAuthorized) {
    throw new Error('LEGACY_RECONCILE_OWNER_AUTHORIZATION_REQUIRED');
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
  const releaseSha = auth.productionReleaseSha?.trim();
  if (!releaseSha || !isTrustedLegacyReconcileReleaseSha(releaseSha)) {
    throw new Error('LEGACY_RECONCILE_UNTRUSTED_RELEASE_SHA');
  }
  const tenantScope = auth.tenantScopeOrganizationId?.trim();
  if (!tenantScope || tenantScope !== input.organizationId.trim()) {
    throw new Error('LEGACY_RECONCILE_TENANT_SCOPE_MISMATCH');
  }
  for (const linkId of input.linkIds) {
    if (!auth.allowlistedLinkIds.has(linkId)) {
      throw new Error(`LEGACY_RECONCILE_LINK_NOT_ALLOWLISTED:${linkId}`);
    }
  }
}

export type LegacyReconcileRollbackAuthorization = {
  mode: 'ROLLBACK_EXECUTE';
  ownerAuthorized: boolean;
  targetAuditId: string;
  authorizationReference: string;
  operatorReference: string;
  runId: string;
};

export function assertLegacyReconcileRollbackAuthorization(auth: LegacyReconcileRollbackAuthorization): void {
  if (auth.mode !== 'ROLLBACK_EXECUTE') {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_MODE_REQUIRED');
  }
  if (!auth.ownerAuthorized) {
    throw new Error('LEGACY_RECONCILE_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED');
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
}
