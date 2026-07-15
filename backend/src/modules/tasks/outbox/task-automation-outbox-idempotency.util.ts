import type { TaskAutomationEntityType } from '@prisma/client';

export function buildTaskAutomationIdempotencyKey(params: {
  organizationId: string;
  ruleId: string;
  entityType: TaskAutomationEntityType;
  entityId: string;
}): string {
  return `task-auto:${params.organizationId}:${params.ruleId}:${params.entityType}:${params.entityId}`;
}
