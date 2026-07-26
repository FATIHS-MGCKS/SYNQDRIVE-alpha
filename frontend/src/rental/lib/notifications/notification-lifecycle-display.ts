import type { ApiNotificationResponse } from './notification-api.types';
import type { NotificationLifecycleStatus } from '../../components/dashboard/notificationQueueModel';

/**
 * Derives display lifecycle from org notification status + per-user receipt.
 * Personal acknowledge/snooze must not change org status (backend contract).
 */
export function mapNotificationLifecycleFromApi(
  row: ApiNotificationResponse,
  referenceNowMs: number = Date.now(),
): NotificationLifecycleStatus {
  if (row.status === 'RESOLVED') return 'resolved';
  if (row.status === 'ARCHIVED') return 'archived';

  const snoozedUntil = row.userReceipt?.snoozedUntil;
  if (snoozedUntil) {
    const untilMs = Date.parse(snoozedUntil);
    if (!Number.isNaN(untilMs) && untilMs > referenceNowMs) {
      return 'snoozed';
    }
  }

  if (row.userReceipt?.acknowledgedAt) {
    return 'acknowledged';
  }

  if (row.status === 'SNOOZED') return 'snoozed';
  if (row.status === 'ACKNOWLEDGED') return 'acknowledged';

  return 'open';
}

export function isPersonallyAcknowledged(row: ApiNotificationResponse): boolean {
  return row.userReceipt?.acknowledgedAt != null;
}

export function isPersonallySnoozed(
  row: ApiNotificationResponse,
  referenceNowMs: number = Date.now(),
): boolean {
  const until = row.userReceipt?.snoozedUntil;
  if (!until) return false;
  const untilMs = Date.parse(until);
  return !Number.isNaN(untilMs) && untilMs > referenceNowMs;
}

export function isOrgResolvedNotification(row: ApiNotificationResponse): boolean {
  return row.status === 'RESOLVED' || row.status === 'ARCHIVED';
}
