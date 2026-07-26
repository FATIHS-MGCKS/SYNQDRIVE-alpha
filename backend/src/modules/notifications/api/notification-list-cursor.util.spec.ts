import { NotificationSeverity } from '@prisma/client';
import {
  buildNotificationListCursorWhere,
  decodeNotificationListCursor,
  encodeNotificationListCursor,
  encodeNotificationListCursorFromRow,
} from './notification-list-cursor.util';

describe('notification-list-cursor.util', () => {
  it('round-trips cursor payload', () => {
    const encoded = encodeNotificationListCursor({
      sortBy: 'lastSeenAt',
      sortOrder: 'desc',
      id: 'notif-1',
      lastSeenAt: '2026-07-26T10:00:00.000Z',
      createdAt: '2026-07-26T09:00:00.000Z',
    });
    const decoded = decodeNotificationListCursor(encoded);
    expect(decoded.id).toBe('notif-1');
    expect(decoded.sortBy).toBe('lastSeenAt');
  });

  it('builds deterministic lastSeenAt cursor where clause', () => {
    const where = buildNotificationListCursorWhere({
      sortBy: 'lastSeenAt',
      sortOrder: 'desc',
      id: 'notif-2',
      lastSeenAt: '2026-07-26T10:00:00.000Z',
      createdAt: '2026-07-26T09:00:00.000Z',
    });
    expect(where.OR).toBeDefined();
    expect(JSON.stringify(where)).toContain('notif-2');
  });

  it('encodes cursor from row with severity sort', () => {
    const encoded = encodeNotificationListCursorFromRow(
      {
        id: 'notif-3',
        lastSeenAt: new Date('2026-07-26T10:00:00.000Z'),
        createdAt: new Date('2026-07-26T09:00:00.000Z'),
        severity: NotificationSeverity.CRITICAL,
      },
      'severity',
      'desc',
    );
    const decoded = decodeNotificationListCursor(encoded);
    expect(decoded.severity).toBe(NotificationSeverity.CRITICAL);
  });
});
