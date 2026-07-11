import { describe, expect, it, vi } from 'vitest';
import { notificationClient, NotificationClientError } from './notification-client';

vi.mock('../../../lib/api', () => ({
  api: {
    notifications: {
      list: vi.fn(),
      counts: vi.fn(),
      markRead: vi.fn(),
      snooze: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';

describe('notificationClient', () => {
  it('maps 503 to api_disabled', async () => {
    vi.mocked(api.notifications.list).mockRejectedValue(
      new Error('API error 503 (/organizations/org-1/notifications)'),
    );
    await expect(notificationClient.list('org-1')).rejects.toMatchObject({
      code: 'api_disabled',
    } satisfies Partial<NotificationClientError>);
  });

  it('maps 403 to permission_denied', async () => {
    vi.mocked(api.notifications.counts).mockRejectedValue(
      new Error('API error 403 (/organizations/org-1/notifications/counts)'),
    );
    await expect(notificationClient.counts('org-1')).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('delegates markRead to api.notifications', async () => {
    vi.mocked(api.notifications.markRead).mockResolvedValue({ id: 'n-1' } as never);
    await notificationClient.markRead('org-1', 'n-1');
    expect(api.notifications.markRead).toHaveBeenCalledWith('org-1', 'n-1');
  });

  it('delegates snooze with until payload', async () => {
    vi.mocked(api.notifications.snooze).mockResolvedValue({ id: 'n-1' } as never);
    await notificationClient.snooze('org-1', 'n-1', '2026-07-11T10:00:00.000Z');
    expect(api.notifications.snooze).toHaveBeenCalledWith(
      'org-1',
      'n-1',
      '2026-07-11T10:00:00.000Z',
    );
  });
});
