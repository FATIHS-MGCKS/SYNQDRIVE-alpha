import { NotificationEventKind, NotificationStatus } from '@prisma/client';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { isManualResolutionAllowed } from '../api/notification-manual-resolution.policy';

export type NotificationTaskCompletionDecision =
  | { action: 'resolve'; mode: 'manual' | 'condition_cleared' }
  | { action: 'skip'; reason: string };

export function evaluateNotificationResolveOnTaskCompletion(input: {
  notification: {
    id: string;
    organizationId: string;
    eventType: string;
    eventKind: NotificationEventKind;
    status: NotificationStatus;
    fingerprint: string;
  };
  task: {
    resolutionNote?: string | null;
    completionMode?: string | null;
  };
  conditionCleared?: boolean;
}): NotificationTaskCompletionDecision {
  const { notification, task } = input;

  if (
    notification.status === NotificationStatus.RESOLVED
    || notification.status === NotificationStatus.ARCHIVED
  ) {
    return { action: 'skip', reason: 'ALREADY_RESOLVED' };
  }

  const def = getEventTypeDefinition(notification.eventType);
  const resolutionPolicy = def?.resolutionPolicy;

  if (
    notification.eventKind === NotificationEventKind.STATE
    && resolutionPolicy?.autoResolveWhenConditionClears !== false
  ) {
    if (!input.conditionCleared) {
      return { action: 'skip', reason: 'CONDITION_STILL_ACTIVE' };
    }
    return { action: 'resolve', mode: 'condition_cleared' };
  }

  const allowTaskCompletionResolve =
    resolutionPolicy?.allowTaskCompletionResolve
    ?? notification.eventKind === NotificationEventKind.EVENT;

  if (!allowTaskCompletionResolve) {
    return { action: 'skip', reason: 'REGISTRY_BLOCKS_TASK_RESOLVE' };
  }

  const manualAllowed = isManualResolutionAllowed(
    notification.eventType,
    notification.eventKind,
  );
  if (!manualAllowed) {
    return { action: 'skip', reason: 'MANUAL_RESOLUTION_NOT_ALLOWED' };
  }

  const note = task.resolutionNote?.trim();
  if (!note) {
    return { action: 'skip', reason: 'RESOLUTION_NOTE_REQUIRED' };
  }

  return { action: 'resolve', mode: 'manual' };
}
