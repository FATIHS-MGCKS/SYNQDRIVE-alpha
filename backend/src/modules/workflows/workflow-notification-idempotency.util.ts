import { NOTIFICATION_LIFECYCLE_EVENT_TYPES } from './workflow.constants';
import type { WorkflowActionDef } from './workflow-definition.validator';
import type { WorkflowDomainEvent } from './workflow-engine.service';

export interface NotificationWorkflowContext {
  notificationId: string;
  notificationFingerprint: string;
  notificationGeneration: number;
  triggerEventId: string;
  correlationId: string | null;
  causationId: string | null;
}

const NOTIFICATION_LIFECYCLE_SET = new Set<string>(NOTIFICATION_LIFECYCLE_EVENT_TYPES);

export function isNotificationLifecycleEventType(eventType: string): boolean {
  return NOTIFICATION_LIFECYCLE_SET.has(eventType);
}

export function resolveActionDefinitionId(
  action: WorkflowActionDef,
  actionIndex: number,
): string {
  const config = action.config ?? {};
  const fromConfig = config.actionDefinitionId ?? config.actionId;
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }
  return `${action.type}:${actionIndex}`;
}

export function extractNotificationWorkflowContext(
  event: WorkflowDomainEvent,
): NotificationWorkflowContext | null {
  if (!isNotificationLifecycleEventType(event.type)) {
    return null;
  }

  const payload = event.payload;
  const notificationId = payload.notificationId;
  const lifecycleGeneration = payload.lifecycleGeneration;

  if (typeof notificationId !== 'string' || !notificationId.trim()) {
    return null;
  }
  if (typeof lifecycleGeneration !== 'number' || !Number.isFinite(lifecycleGeneration)) {
    return null;
  }

  const fingerprint =
    typeof payload.fingerprint === 'string' ? payload.fingerprint : '';
  const triggerEventId =
    (typeof payload.triggerEventId === 'string' && payload.triggerEventId.trim())
    || event.idempotencyKey
    || `${event.type}:${notificationId}:gen:${lifecycleGeneration}`;

  return {
    notificationId: notificationId.trim(),
    notificationFingerprint: fingerprint,
    notificationGeneration: lifecycleGeneration,
    triggerEventId,
    correlationId:
      typeof payload.correlationId === 'string' ? payload.correlationId : null,
    causationId:
      typeof payload.causationId === 'string' ? payload.causationId : null,
  };
}

export function buildNotificationWorkflowRunIdempotencyKey(input: {
  organizationId: string;
  workflowId: string;
  triggerEventId: string;
}): string {
  return `notification-run:${input.organizationId}:${input.workflowId}:${input.triggerEventId}`;
}

export function buildNotificationActionIdempotencyKey(input: {
  organizationId: string;
  workflowId: string;
  notificationId: string;
  notificationGeneration: number;
  actionDefinitionId: string;
}): string {
  return [
    'notification-action',
    input.organizationId,
    input.workflowId,
    input.notificationId,
    `gen:${input.notificationGeneration}`,
    `action:${input.actionDefinitionId}`,
  ].join(':');
}

export function resolveWorkflowRunIdempotencyKey(
  event: WorkflowDomainEvent,
  workflowId: string,
): string {
  const notificationCtx = extractNotificationWorkflowContext(event);
  if (notificationCtx) {
    return buildNotificationWorkflowRunIdempotencyKey({
      organizationId: event.organizationId,
      workflowId,
      triggerEventId: notificationCtx.triggerEventId,
    });
  }

  const baseKey =
    event.idempotencyKey
    ?? `${event.type}:${event.entityType ?? 'none'}:${event.entityId ?? 'none'}`;
  return `${baseKey}:workflow:${workflowId}`;
}
