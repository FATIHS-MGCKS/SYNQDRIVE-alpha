import { describe, expect, it } from 'vitest';
import { createNotificationTranslator } from '../notificationQueueEnricher';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';

function shouldShowMarkRead(
  availableActions: ApiNotificationAvailableAction[],
  readStatus: 'read' | 'unread',
): boolean {
  return (
    readStatus === 'unread'
    && availableActions.includes('read')
    && !availableActions.includes('acknowledge')
  );
}

describe('notification actions gating', () => {
  it('hides mark-read when acknowledge is available', () => {
    expect(shouldShowMarkRead(['read', 'acknowledge'], 'unread')).toBe(false);
  });

  it('shows mark-read only for unread rows with read action and no acknowledge', () => {
    expect(shouldShowMarkRead(['read', 'snooze'], 'unread')).toBe(true);
    expect(shouldShowMarkRead(['read'], 'read')).toBe(false);
  });
});

describe('notification time i18n', () => {
  it('formats DE last-short label via translation keys', () => {
    const t = createNotificationTranslator('de');
    const label = t('notification.time.lastShort', { relative: t('notification.time.minutesAgo', { count: 5 }) });
    expect(label).toBe('zuletzt vor 5 Min.');
  });

  it('formats EN resolved-short label via translation keys', () => {
    const t = createNotificationTranslator('en');
    const label = t('notification.time.resolvedShort', { relative: t('notification.time.hoursAgo', { count: 2 }) });
    expect(label).toBe('resolved 2h ago');
  });
});
