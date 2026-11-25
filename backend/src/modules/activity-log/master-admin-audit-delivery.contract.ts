import { randomUUID } from 'node:crypto';
import type { MasterAdminAuditRecordInput } from './master-admin-audit.contract';

/** IAM audit outbox carrier for deferred master-admin semantic audit delivery. */
export const MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE = 'MASTER_ADMIN_AUDIT_DELIVERY' as const;

export type MasterAdminAuditDeliveryOptions = {
  idempotencyKey: string;
  /** Known session/org context for ORGANIZATION_CONTEXT scope only — never fabricated. */
  organizationContextId?: string | null;
  occurredAt?: Date;
};

/** Trusted server-side identity for one admitted privileged security operation. */
export function generateMasterAdminSecurityOperationId(): string {
  return randomUUID();
}

/** Stable outbox idempotency key for a single security operation (distinct per admission). */
export function buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId: string): string {
  return `ma-session-audit:op:${operationId}`;
}

export type MasterAdminSessionAuditMetadata = Record<string, unknown> & {
  securityOperationId?: string;
};