export const NOTIFICATION_TASK_DEDUP_PREFIX = 'notification:task:';

export function notificationTaskDedupKey(notificationId: string): string {
  return `${NOTIFICATION_TASK_DEDUP_PREFIX}${notificationId.trim()}`;
}
