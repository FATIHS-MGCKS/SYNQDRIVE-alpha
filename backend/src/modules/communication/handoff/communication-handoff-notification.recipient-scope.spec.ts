import { MembershipRole, NotificationSeverity } from '@prisma/client';
import { NotificationStationScopeService } from '@modules/notifications/access/notification-station-scope.service';

describe('Communication handoff notification recipient scope', () => {
  const prisma = {
    vehicle: { findMany: jest.fn(async () => []) },
    booking: { findMany: jest.fn(async () => []) },
  };
  const stationAccess = {
    resolve: jest.fn(async () => ({
      bypassScope: false,
      allowedStationIds: ['station-a'],
      membershipRole: MembershipRole.WORKER,
      userId: 'user-a',
    })),
  };

  const service = new NotificationStationScopeService(prisma as any, stationAccess as any);

  it('includes station-a operator for station-a handoff action target', async () => {
    const ctx = await service.buildScopeContext('org-1', MembershipRole.WORKER, 'station-a', 'user-a');
    const inScope = service.isNotificationInScope(
      {
        id: 'n-1',
        eventType: 'COMMUNICATION_HANDOFF_REQUIRED',
        domain: 'OPERATIONS',
        severity: NotificationSeverity.WARNING,
        entityType: 'ORGANIZATION',
        entityId: 'conv-1',
        actionTarget: {
          type: 'OPEN_COMMUNICATION',
          conversationId: 'conv-1',
          stationId: 'station-a',
        },
        status: 'OPEN',
      },
      {
        userId: 'user-a',
        organizationId: 'org-1',
        membershipRole: MembershipRole.WORKER,
        stationScope: 'station-a',
        scopedStationId: 'station-a',
        scopedStationIds: ['station-a'],
        scopedVehicleIds: [],
        scopedBookingIds: [],
        bypassStationScope: false,
        preferences: [],
      },
    );

    expect(inScope).toBe(true);
  });

  it('excludes station-b-only operator for station-a handoff', () => {
    const inScope = service.isNotificationInScope(
      {
        id: 'n-2',
        eventType: 'COMMUNICATION_HANDOFF_REQUIRED',
        domain: 'OPERATIONS',
        severity: NotificationSeverity.WARNING,
        entityType: 'ORGANIZATION',
        entityId: 'conv-1',
        actionTarget: {
          type: 'OPEN_COMMUNICATION',
          conversationId: 'conv-1',
          stationId: 'station-a',
        },
        status: 'OPEN',
      },
      {
        userId: 'user-b',
        organizationId: 'org-1',
        membershipRole: MembershipRole.WORKER,
        stationScope: 'station-b',
        scopedStationId: 'station-b',
        scopedStationIds: ['station-b'],
        scopedVehicleIds: [],
        scopedBookingIds: [],
        bypassStationScope: false,
        preferences: [],
      },
    );

    expect(inScope).toBe(false);
  });
});
