import { NotificationCategory, NotificationEventKind, NotificationSeverity } from '@prisma/client';
import { buildPreferenceWhereClause } from './notification-preference.query';

describe('buildPreferenceWhereClause', () => {
  it('returns null when all categories allow in-app delivery', () => {
    const clause = buildPreferenceWhereClause([
      {
        category: NotificationCategory.BOOKINGS,
        inApp: true,
        criticalOnly: false,
      } as never,
    ]);
    expect(clause).toBeNull();
  });

  it('hides non-critical ALERT events when inApp is disabled for the category', () => {
    const clause = buildPreferenceWhereClause([
      {
        category: NotificationCategory.BOOKINGS,
        inApp: false,
        criticalOnly: false,
      } as never,
    ]);

    expect(clause).toEqual({
      AND: [
        {
          NOT: {
            AND: [
              { eventType: { in: expect.arrayContaining(['STATION_SHORTAGE', 'LOW_UTILIZATION']) } },
              { eventKind: { not: NotificationEventKind.STATE } },
              { severity: { not: NotificationSeverity.CRITICAL } },
            ],
          },
        },
      ],
    });
  });

  it('keeps STATE dashboard insights visible when inApp is disabled', () => {
    const clause = buildPreferenceWhereClause([
      {
        category: NotificationCategory.BOOKINGS,
        inApp: false,
        criticalOnly: false,
      } as never,
    ]);

    const notAnd = (clause as { AND: Array<{ NOT: { AND: unknown[] } }> }).AND[0].NOT.AND;
    expect(notAnd).toContainEqual({ eventKind: { not: NotificationEventKind.STATE } });
  });
});
