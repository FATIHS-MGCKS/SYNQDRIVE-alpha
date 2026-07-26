import type { ActionExecutionContext } from '@modules/workflows/workflow-action-executor.service';
import type { NotificationWorkflowContext } from '@modules/workflows/workflow-notification-idempotency.util';
import type { NotificationTaskLink, NotificationTaskUpsertInput } from './notification-task-link.types';

export function buildNotificationTaskLink(
  ctx: ActionExecutionContext,
  idempotencyKey: string,
): NotificationTaskLink | null {
  const notificationId = ctx.notificationContext?.notificationId
    ?? (typeof ctx.payload.notificationId === 'string' ? ctx.payload.notificationId : undefined);

  if (!notificationId?.trim()) {
    return null;
  }

  return {
    organizationId: ctx.organizationId,
    notificationId: notificationId.trim(),
    workflowRunId: ctx.workflowRunId,
    sourceEventType: ctx.eventType,
    idempotencyKey,
    workflowId: ctx.workflowId,
    actionDefinitionId: ctx.actionDefinitionId,
    notificationGeneration: ctx.notificationContext?.notificationGeneration,
    notificationFingerprint: ctx.notificationContext?.notificationFingerprint,
  };
}

export function mergeNotificationTaskMetadata(
  link: NotificationTaskLink,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    notificationTaskLink: link,
    notificationId: link.notificationId,
    workflowRunId: link.workflowRunId,
    sourceEventType: link.sourceEventType,
    idempotencyKey: link.idempotencyKey,
    triggeringNotificationId: link.notificationId,
    workflowId: link.workflowId,
    actionDefinitionId: link.actionDefinitionId,
  };
}

export function extractNotificationTaskLink(metadata: unknown): NotificationTaskLink | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const root = metadata as Record<string, unknown>;
  const embedded = root.notificationTaskLink;
  if (embedded && typeof embedded === 'object') {
    return embedded as NotificationTaskLink;
  }

  const notificationId = root.notificationId;
  const workflowRunId = root.workflowRunId;
  const sourceEventType = root.sourceEventType;
  const idempotencyKey = root.idempotencyKey ?? root.dedupKey;
  const organizationId = root.organizationId;

  if (
    typeof notificationId === 'string'
    && typeof workflowRunId === 'string'
    && typeof sourceEventType === 'string'
    && typeof idempotencyKey === 'string'
    && typeof organizationId === 'string'
  ) {
    return {
      organizationId,
      notificationId,
      workflowRunId,
      sourceEventType,
      idempotencyKey,
      workflowId: typeof root.workflowId === 'string' ? root.workflowId : undefined,
      actionDefinitionId:
        typeof root.actionDefinitionId === 'string' ? root.actionDefinitionId : undefined,
    };
  }

  return null;
}

export function toNotificationTaskUpsertFields(link: NotificationTaskLink) {
  return {
    notificationId: link.notificationId,
    workflowRunId: link.workflowRunId,
    sourceEventType: link.sourceEventType,
    dedupKey: link.idempotencyKey,
  };
}
