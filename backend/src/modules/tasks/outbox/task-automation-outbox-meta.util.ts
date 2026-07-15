import type { TaskAutomationEntityType } from '@prisma/client';
import { buildTaskAutomationIdempotencyKey } from './task-automation-outbox-idempotency.util';
import type {
  TaskAutomationOutboxMeta,
  TaskAutomationOutboxPayload,
  TaskAutomationOperation,
} from './task-automation-outbox.types';

export function buildOutboxMeta(params: {
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  entityType: TaskAutomationEntityType;
  entityId: string;
  operation: TaskAutomationOperation;
  payload?: Partial<TaskAutomationOutboxPayload>;
}): TaskAutomationOutboxMeta {
  const payload: TaskAutomationOutboxPayload = {
    operation: params.operation,
    ...params.payload,
  };
  return {
    organizationId: params.organizationId,
    ruleId: params.ruleId,
    ruleVersion: params.ruleVersion,
    entityType: params.entityType,
    entityId: params.entityId,
    idempotencyKey: buildTaskAutomationIdempotencyKey({
      organizationId: params.organizationId,
      ruleId: params.ruleId,
      entityType: params.entityType,
      entityId: params.entityId,
    }),
    payload,
  };
}
