import {
  MembershipRole,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationStatus,
} from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildNotificationWhereInput } from '../api/notification-query.util';
import { NotificationStationScopeService } from './notification-station-scope.service';
import { NotificationApiService } from '../api/notification-api.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationRepository } from '../notification.repository';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationReceiptService } from './notification-receipt.service';
import { NOTIFICATION_API_PERMISSION_MATRIX } from './notification-access-permissions';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER = 'user-1';
const STATION_A = 'station-a';
const STATION_B = 'station-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const BOOKING_B = 'booking-b';

describe('notification access security regressions', () => {
  describe('permission matrix', () => {
    it('denies resolve for DRIVER and CUSTOMER', () => {
      const resolve = NOTIFICATION_API_PERMISSION_MATRIX.find((r) => r.operation === 'resolve');
      expect(resolve?.roles).not.toContain(MembershipRole.DRIVER);
    });

    it('denies archive for WORKER', () => {
      const archive = NOTIFICATION_API_PERMISSION_MATRIX.find((r) => r.operation === 'archive');
      expect(archive?.roles).not.toContain(MembershipRole.WORKER);
    });
  });

  describe('station scope SQL', () => {
    it('returns zero rows when scoped user has no stations', () => {
      const where = buildNotificationWhereInput({
        organizationId: ORG_A,
        userId: USER,
        bypassStationScope: false,
        scopedStationIds: [],
        scopedVehicleIds: [],
        scopedBookingIds: [],
      });
      expect(where.id).toBe('__none__');
    });

    it('applies multi-station OR filter', () => {
      const where = buildNotificationWhereInput({
        organizationId: ORG_A,
        userId: USER,
        bypassStationScope: false,
        scopedStationIds: [STATION_A, STATION_B],
        scopedVehicleIds: [VEH_A],
        scopedBookingIds: [],
      });
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { entityType: NotificationEntityType.STATION, entityId: STATION_A },
              { entityType: NotificationEntityType.STATION, entityId: STATION_B },
              { entityType: NotificationEntityType.VEHICLE, entityId: { in: [VEH_A] } },
            ]),
          }),
        ]),
      );
    });
  });

  describe('NotificationStationScopeService', () => {
    const prisma = {
      vehicle: { findMany: jest.fn() },
      booking: { findMany: jest.fn() },
    };
    const stationAccess = {
      resolve: jest.fn(),
    };
    let service: NotificationStationScopeService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new NotificationStationScopeService(prisma as any, stationAccess as any);
    });

    it('worker station A cannot see station B entity', () => {
      const inScope = service.isNotificationInScope(
        {
          id: 'n-1',
          eventType: 'STATION_SHORTAGE',
          domain: 'OPERATIONS',
          severity: NotificationSeverity.WARNING,
          entityType: 'STATION',
          entityId: STATION_B,
          actionTarget: {},
          status: NotificationStatus.OPEN,
        },
        {
          userId: USER,
          organizationId: ORG_A,
          membershipRole: MembershipRole.WORKER,
          stationScope: STATION_A,
          scopedStationIds: [STATION_A],
          scopedStationId: STATION_A,
          scopedVehicleIds: [],
          scopedBookingIds: [],
          bypassStationScope: false,
          preferences: [],
        },
      );
      expect(inScope).toBe(false);
    });

    it('rejects manipulated vehicleId outside scope', () => {
      const allowed = service.isEntityInCallerScope(
        {
          userId: USER,
          organizationId: ORG_A,
          membershipRole: MembershipRole.WORKER,
          stationScope: STATION_A,
          scopedStationIds: [STATION_A],
          scopedVehicleIds: [VEH_A],
          scopedBookingIds: [],
          bypassStationScope: false,
          preferences: [],
        },
        { kind: 'vehicle', id: VEH_B },
      );
      expect(allowed).toBe(false);
    });

    it('rejects manipulated bookingId outside scope', () => {
      const allowed = service.isEntityInCallerScope(
        {
          userId: USER,
          organizationId: ORG_A,
          membershipRole: MembershipRole.WORKER,
          stationScope: STATION_A,
          scopedStationIds: [STATION_A],
          scopedVehicleIds: [],
          scopedBookingIds: [],
          bypassStationScope: false,
          preferences: [],
        },
        { kind: 'booking', id: BOOKING_B },
      );
      expect(allowed).toBe(false);
    });
  });

  describe('NotificationApiService negative paths', () => {
    const engineConfig = { isV2Enabled: () => true } as NotificationEngineConfig;
    const core = {} as NotificationCoreService;
    const row = {
      id: 'notif-1',
      eventType: 'BOOKING_CREATED',
      eventKind: NotificationEventKind.EVENT,
      domain: NotificationDomain.BOOKINGS,
      severity: NotificationSeverity.INFO,
      entityType: NotificationEntityType.BOOKING,
      entityId: 'booking-1',
      actionTarget: {},
      status: NotificationStatus.OPEN,
      templateParams: {},
      titleKey: 't',
      bodyKey: 'b',
      actionType: 'OPEN_SETTINGS',
      sourceType: 'SYSTEM',
      primarySourceRef: 'ref',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
      resolvedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const repository = {
      findById: jest.fn(async (id: string, orgId: string) => (id === 'notif-1' && orgId === ORG_A ? row : null)),
      findReceiptsForUser: jest.fn(async () => []),
      listNotificationsWhere: jest.fn(async () => []),
      countNotificationsWhere: jest.fn(async () => 0),
      groupCountBySeverityWhere: jest.fn(async () => []),
      groupCountByDomainWhere: jest.fn(async () => []),
    } as unknown as NotificationRepository;

    const receiptService = {} as NotificationReceiptService;
    const stationScopeService = {
      buildScopeContext: jest.fn(async () => ({
        scopedStationIds: [],
        scopedVehicleIds: [],
        scopedBookingIds: [],
        bypassStationScope: true,
      })),
      isNotificationInScope: jest.fn(() => true),
      isEntityInCallerScope: jest.fn(() => true),
      recheckVehicleStationScope: jest.fn(),
    } as unknown as NotificationStationScopeService;

    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ status: 'ACTIVE' })),
      },
      organizationMembership: {
        findFirst: jest.fn(async () => ({
          role: MembershipRole.DRIVER,
          stationScope: 'ALL',
        })),
      },
      userNotificationPreference: { findMany: jest.fn(async () => []) },
      vehicle: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
      station: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
      booking: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
      dashboardInsight: { findMany: jest.fn(async () => []) },
      customer: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      vehicleTrip: { findFirst: jest.fn() },
    };

    const service = new NotificationApiService(
      core,
      repository,
      engineConfig,
      prisma as any,
      { recordFireAndForget: jest.fn(), listEvents: jest.fn() } as any,
      { recordApiRequest: jest.fn(), recordFireAndForget: jest.fn() } as any,
      receiptService,
      stationScopeService,
    );

    it('org A cannot read org B notification (404)', async () => {
      await expect(service.getById(ORG_B, { id: USER }, 'notif-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('driver cannot resolve CRITICAL notification', async () => {
      const dto = await service.getById(ORG_A, { id: USER }, 'notif-1');
      expect(dto.availableActions).not.toContain('resolve');
      await expect(service.resolve(ORG_A, { id: USER }, 'notif-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects deactivated user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ status: 'INACTIVE' });
      await expect(service.list(ORG_A, { id: USER }, {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows master admin without org membership using bypass context', async () => {
      (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValueOnce(null);
      const counts = await service.getCounts(ORG_A, {
        id: USER,
        platformRole: 'MASTER_ADMIN',
      });
      expect(counts).toBeDefined();
    });

    it('rejects customer-equivalent role (no staff role)', async () => {
      (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValueOnce({
        role: 'CUSTOMER' as MembershipRole,
        stationScope: null,
      });
      await expect(service.list(ORG_A, { id: USER }, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
