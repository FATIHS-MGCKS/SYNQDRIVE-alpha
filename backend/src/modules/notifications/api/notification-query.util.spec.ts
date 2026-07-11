import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
} from '@prisma/client';
import { buildNotificationWhereInput } from './notification-query.util';

describe('buildNotificationWhereInput', () => {
  const base = {
    organizationId: 'org-1',
    userId: 'user-1',
  };

  it('filters active notifications', () => {
    const where = buildNotificationWhereInput({ ...base, activeOnly: true });
    expect(where.status).toEqual({ in: ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'] });
  });

  it('filters resolved-only notifications', () => {
    const from = new Date('2026-07-04T12:00:00.000Z');
    const where = buildNotificationWhereInput({ ...base, resolvedOnly: true, from });
    expect(where.status).toBe(NotificationStatus.RESOLVED);
    expect(where.lastSeenAt).toEqual({ gte: from });
  });

  it('filters unread for user', () => {
    const where = buildNotificationWhereInput({ ...base, unreadOnly: true });
    expect(where.NOT).toEqual({
      receipts: {
        some: {
          userId: 'user-1',
          readAt: { not: null },
        },
      },
    });
  });

  it('filters by vehicle via entity or action target', () => {
    const where = buildNotificationWhereInput({ ...base, vehicleId: 'veh-1' });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { entityType: NotificationEntityType.VEHICLE, entityId: 'veh-1' },
            { actionTarget: { path: ['vehicleId'], equals: 'veh-1' } },
          ]),
        }),
      ]),
    );
  });

  it('applies station scope filter', () => {
    const where = buildNotificationWhereInput({
      ...base,
      scopedStationId: 'st-1',
      scopedVehicleIds: ['veh-1'],
    });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { entityType: NotificationEntityType.STATION, entityId: 'st-1' },
            { actionTarget: { path: ['vehicleId'], equals: 'veh-1' } },
          ]),
        }),
      ]),
    );
  });
});
