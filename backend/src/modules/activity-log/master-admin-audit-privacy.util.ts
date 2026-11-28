import type { MasterAdminAuditRecordInput } from './master-admin-audit.contract';

const ALLOWED_ENVELOPE_ROOT_KEYS = new Set([
  'auditAction',
  'actorUserId',
  'actorPlatformRole',
  'actorPermissions',
  'targetOrganizationId',
  'entityId',
  'description',
  'reasonCode',
  'correlationId',
  'route',
  'httpMethod',
  'httpStatus',
  'ipAddress',
  'userAgent',
  'mfaStepUpAction',
  'mfaAssuranceLevel',
  'mfaStepUpUsed',
  'permissionGranted',
  'metadata',
  'before',
  'after',
  'changeSummary',
  'level',
]);

const ALLOWED_METADATA_KEYS = new Set([
  'domain',
  'operation',
  'outcome',
  'targetUserId',
  'operationBinding',
  'membershipId',
  'inviteId',
  'inviteByEmail',
  'idempotent',
  'sessionId',
  'revokedSessionCount',
  'intendedAuditAction',
  'idempotencyKey',
  'deliveryErrorCode',
  'auditDeliveryIdempotencyKey',
  'originalOccurredAt',
  'auditScope',
  'organizationContextId',
  'securityOperationId',
]);

const FORBIDDEN_VALUE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /bearer\s+/i,
  /postgresql:\/\//i,
  /refresh_token/i,
];

export function classifyMasterAdminAuditDeliveryError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length <= 32) {
      return code.startsWith('P') ? `PRISMA_${code}` : code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 48);
    }
  }
  return 'AUDIT_DELIVERY_FAILED';
}

export function sanitizeMasterAdminAuditRecordInput(
  input: MasterAdminAuditRecordInput,
): MasterAdminAuditRecordInput {
  const metadata =
    input.metadata && typeof input.metadata === 'object'
      ? Object.fromEntries(
          Object.entries(input.metadata).filter(([key]) => ALLOWED_METADATA_KEYS.has(key)),
        )
      : undefined;

  const envelope: MasterAdminAuditRecordInput = {
    auditAction: input.auditAction,
    actorUserId: input.actorUserId,
    actorPlatformRole: input.actorPlatformRole,
    actorPermissions: input.actorPermissions,
    targetOrganizationId: input.targetOrganizationId ?? null,
    entityId: input.entityId ?? null,
    description: input.description,
    reasonCode: input.reasonCode ?? null,
    correlationId: input.correlationId,
    route: input.route,
    httpMethod: input.httpMethod,
    httpStatus: input.httpStatus,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    mfaStepUpAction: input.mfaStepUpAction,
    mfaAssuranceLevel: input.mfaAssuranceLevel,
    mfaStepUpUsed: input.mfaStepUpUsed,
    permissionGranted: input.permissionGranted,
    metadata,
    before: input.before,
    after: input.after,
    changeSummary: input.changeSummary ?? null,
    level: input.level,
  };

  for (const key of Object.keys(envelope)) {
    if (!ALLOWED_ENVELOPE_ROOT_KEYS.has(key)) {
      delete (envelope as unknown as Record<string, unknown>)[key];
    }
  }

  assertNoForbiddenScalarValues(envelope);
  return envelope;
}

function assertNoForbiddenScalarValues(value: unknown, depth = 0): void {
  if (depth > 6) {
    return;
  }
  if (typeof value === 'string') {
    for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error('AUDIT_PAYLOAD_SENSITIVE_VALUE');
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenScalarValues(item, depth + 1);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      assertNoForbiddenScalarValues(nested, depth + 1);
    }
  }
}