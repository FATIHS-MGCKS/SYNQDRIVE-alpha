import type { BusinessAuditActionCode } from './business-audit.constants';

export function buildBusinessAuditIdempotencyKey(input: {
  action: BusinessAuditActionCode;
  organizationId: string;
  entityType: string;
  entityId: string;
  correlationId: string;
}): string {
  return [
    'business-audit',
    input.organizationId,
    input.action,
    input.entityType,
    input.entityId,
    input.correlationId,
  ].join(':');
}
