export const NOTIFICATION_TASK_DEDUP_PREFIX = 'notification:task:';

export function notificationTaskDedupKey(notificationId: string): string {
  return `${NOTIFICATION_TASK_DEDUP_PREFIX}${notificationId.trim()}`;
}

export function readNotificationIdFromTaskMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).notificationId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
