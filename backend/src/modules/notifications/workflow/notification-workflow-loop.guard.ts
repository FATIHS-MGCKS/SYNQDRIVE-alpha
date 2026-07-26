import type { Notification } from '@prisma/client';
import type { NotificationCandidate } from '../notification.types';
import type { IngestCandidateOptions } from '../notification-core.types';

export const WORKFLOW_TRIGGER_NOTIFICATION_ID_METADATA_KEY = 'workflowTriggerNotificationId';

/**
 * Blocks workflow-originated notification ingest that would duplicate the
 * triggering notification (notification → workflow → same notification loop).
 */
export function shouldSuppressWorkflowNotificationLoop(
  candidate: NotificationCandidate,
  options: IngestCandidateOptions,
  existingByTriggerId?: Pick<Notification, 'id' | 'fingerprint'> | null,
): boolean {
  const triggerNotificationId = resolveWorkflowTriggerNotificationId(candidate, options);
  if (!triggerNotificationId) return false;
  if (!existingByTriggerId) return false;
  return existingByTriggerId.id === triggerNotificationId;
}

export function resolveWorkflowTriggerNotificationId(
  candidate: NotificationCandidate,
  options: IngestCandidateOptions = {},
): string | undefined {
  const fromOptions = options.workflowTriggerNotificationId?.trim();
  if (fromOptions) return fromOptions;

  const fromMetadata = candidate.metadata?.[WORKFLOW_TRIGGER_NOTIFICATION_ID_METADATA_KEY];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata.trim();
  }

  return undefined;
}
