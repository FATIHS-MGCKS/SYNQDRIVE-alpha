import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { buildNotificationWhereInput, buildStationIdQueryFilter } from './notification-query.util';

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
      bypassStationScope: false,
      scopedStationIds: ['st-1'],
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

  it('denies all rows when scoped user has zero stations', () => {
    const where = buildNotificationWhereInput({
      ...base,
      bypassStationScope: false,
      scopedStationIds: [],
    });
    expect(where.id).toBe('__none__');
  });

  it('filters by FLEET_READINESS attentionScope using registry event types', () => {
    const where = buildNotificationWhereInput({
      ...base,
      attentionScope: 'FLEET_READINESS',
    });
    expect(where.eventType).toEqual({
      in: expect.arrayContaining(['VEHICLE_NOT_READY', 'ACTIVE_DTC', 'VEHICLE_DAMAGE_BLOCKING']),
    });
    expect((where.eventType as { in: string[] }).in).not.toContain('LOW_UTILIZATION');
  });

  it('filters by OPERATIONS attentionScope using registry complement', () => {
    const where = buildNotificationWhereInput({
      ...base,
      attentionScope: 'OPERATIONS',
    });
    expect(where.eventType).toEqual({
      in: expect.arrayContaining(['LOW_UTILIZATION', 'PICKUP_OVERDUE']),
    });
    expect((where.eventType as { in: string[] }).in).not.toContain('VEHICLE_NOT_READY');
  });

  describe('stationId dashboard filter', () => {
    it('includes vehicle notifications for vehicles at the requested station', () => {
      const where = buildNotificationWhereInput({
        ...base,
        stationId: 'st-1',
        stationFilterVehicleIds: ['veh-1'],
      });
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { entityType: NotificationEntityType.VEHICLE, entityId: { in: ['veh-1'] } },
            ]),
          }),
        ]),
      );
    });

    it('excludes vehicle notifications when vehicle is not in station membership list', () => {
      const filter = buildStationIdQueryFilter({
        stationId: 'st-1',
        vehicleIds: ['veh-1'],
        bookingIds: [],
      });
      expect(filter.OR).not.toEqual(
        expect.arrayContaining([
          { entityType: NotificationEntityType.VEHICLE, entityId: 'veh-2' },
        ]),
      );
    });

    it('includes station entity notifications for direct station ownership', () => {
      const filter = buildStationIdQueryFilter({
        stationId: 'st-1',
        vehicleIds: [],
        bookingIds: [],
      });
      expect(filter.OR).toEqual(
        expect.arrayContaining([
          { entityType: NotificationEntityType.STATION, entityId: 'st-1' },
          { actionTarget: { path: ['stationId'], equals: 'st-1' } },
        ]),
      );
    });

    it('combines FLEET_READINESS attentionScope with station vehicle membership', () => {
      const where = buildNotificationWhereInput({
        ...base,
        attentionScope: 'FLEET_READINESS',
        stationId: 'st-1',
        stationFilterVehicleIds: ['veh-1'],
      });
      expect(where.eventType).toEqual({
        in: expect.arrayContaining(['VEHICLE_NOT_READY', 'TIRE_CRITICAL']),
      });
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { entityType: NotificationEntityType.VEHICLE, entityId: { in: ['veh-1'] } },
            ]),
          }),
        ]),
      );
    });

    it('does not include vehicle notifications when station membership is empty', () => {
      const filter = buildStationIdQueryFilter({
        stationId: 'st-1',
        vehicleIds: [],
        bookingIds: [],
      });
      const vehicleEntityClauses = (filter.OR as Prisma.NotificationWhereInput[]).filter(
        (clause) =>
          clause.entityType === NotificationEntityType.VEHICLE ||
          (clause.actionTarget as { path?: string[] } | undefined)?.path?.[0] === 'vehicleId',
      );
      expect(vehicleEntityClauses).toHaveLength(0);
    });
  });
});
