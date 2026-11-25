import type {
  MasterAdminAuditActionCode,
  MasterAdminAuditRecordInput,
} from './master-admin-audit.contract';

/** IAM audit outbox carrier for deferred master-admin semantic audit delivery. */
export const MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE = 'MASTER_ADMIN_AUDIT_DELIVERY' as const;

export type MasterAdminAuditDeliveryOptions = {
  idempotencyKey: string;
  /** Known session/org context for ORGANIZATION_CONTEXT scope only — never fabricated. */
  organizationContextId?: string | null;
  occurredAt?: Date;
};

export function buildMasterAdminSessionRevocationAuditIdempotencyKey(input: {
  correlationId: string;
  auditAction: MasterAdminAuditActionCode;
  targetUserId: string;
  sessionId?: string;
  outcome: string;
}): string {
  const sessionPart = input.sessionId ?? 'revoke-all';
  return [
    'ma-session-audit',
    input.correlationId,
    input.auditAction,
    input.targetUserId,
    sessionPart,
    input.outcome,
  ].join(':');
}
