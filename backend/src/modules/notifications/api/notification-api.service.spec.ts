import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  MembershipRole,
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
} from '@prisma/client';
import { NotificationApiService } from './notification-api.service';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationRepository } from '../notification.repository';
import { NotificationReceiptService } from '../access/notification-receipt.service';
import { NotificationStationScopeService } from '../access/notification-station-scope.service';

const ORG = 'org-1';
const ORG_OTHER = 'org-2';
const USER = 'user-1';
const USER_B = 'user-2';
const STATION = 'station-1';
const STATION_B = 'station-b';
const VEH = 'veh-1';
const NOTIF_ID = 'notif-1';

function buildRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-11T12:00:00.000Z');
  return {
    id: NOTIF_ID,
    organizationId: ORG,
    fingerprint: 'internal-fp-hidden',
    lifecycleGeneration: 1,
    eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
    eventKind: NotificationEventKind.STATE,
    conditionCode: 'technical_observation_active',
    domain: NotificationDomain.VEHICLE_HEALTH,
    severity: NotificationSeverity.WARNING,
    status: NotificationStatus.OPEN,
    entityType: NotificationEntityType.VEHICLE,
    entityId: VEH,
    titleKey: 'notification.title.technicalObservation',
    bodyKey: 'notification.body.technicalObservation',
    templateParams: { label: 'WOB L 7503' },
    actionType: NotificationActionType.OPEN_VEHICLE_MODULE,
    actionTarget: { type: NotificationActionType.OPEN_VEHICLE_MODULE, vehicleId: VEH, module: 'complaints' },
    sourceType: NotificationSourceType.OPERATIONAL_ISSUE,
    primarySourceRef: 'obs-1',
    firstSeenAt: now,
    lastSeenAt: now,
    occurrenceCount: 1,
    resolvedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    acknowledgedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    reopenCount: 0,
    version: 1,
    legacyInsightId: null,
    ...overrides,
  };
}

describe('NotificationApiService', () => {
  let v2Enabled: boolean;
  let row: ReturnType<typeof buildRow>;
  const receipts = new Map<string, any>();
  let membership: { role: MembershipRole; stationScope: string | null };
  let preferences: any[];

  const engineConfig = { isV2Enabled: () => v2Enabled } as NotificationEngineConfig;

  const core = {
    resolveNotification: jest.fn(async () => ({})),
    archiveNotification: jest.fn(async () => ({})),
  } as unknown as NotificationCoreService;

  const repository = {
    findById: jest.fn(async (id: string, orgId: string) =>
      id === NOTIF_ID && orgId === ORG ? row : null,
    ),
    listNotificationsWhere: jest.fn(async () => [row]),
    countNotificationsWhere: jest.fn(async () => 1),
    groupCountBySeverityWhere: jest.fn(async () => [
      { severity: NotificationSeverity.WARNING, _count: { _all: 1 } },
    ]),
    groupCountByDomainWhere: jest.fn(async () => [
      { domain: NotificationDomain.VEHICLE_HEALTH, _count: { _all: 1 } },
    ]),
    findReceiptsForUser: jest.fn(async (ids: string[], userId: string) =>
      ids.map((id) => receipts.get(`${id}:${userId}`)).filter(Boolean),
    ),
    findReceipt: jest.fn(async (notificationId: string, userId: string) =>
      receipts.get(`${notificationId}:${userId}`) ?? null,
    ),
  } as unknown as NotificationRepository;

  const receiptService = {
    markRead: jest.fn(async (id: string, orgId: string, userId: string) => {
      receipts.set(`${id}:${userId}`, {
        notificationId: id,
        userId,
        readAt: new Date(),
        acknowledgedAt: null,
        snoozedUntil: null,
        hiddenAt: null,
      });
    }),
    markUnread: jest.fn(async (id: string, _orgId: string, userId: string) => {
      receipts.set(`${id}:${userId}`, {
        notificationId: id,
        userId,
        readAt: null,
        acknowledgedAt: null,
        snoozedUntil: null,
        hiddenAt: null,
      });
    }),
    acknowledgePersonal: jest.fn(async (id: string, _orgId: string, userId: string) => {
      receipts.set(`${id}:${userId}`, {
        notificationId: id,
        userId,
        readAt: new Date(),
        acknowledgedAt: new Date(),
        snoozedUntil: null,
        hiddenAt: null,
      });
    }),
    snoozePersonal: jest.fn(async (id: string, _orgId: string, userId: string, until: Date) => {
      receipts.set(`${id}:${userId}`, {
        notificationId: id,
        userId,
        readAt: null,
        acknowledgedAt: null,
        snoozedUntil: until,
        hiddenAt: null,
      });
    }),
    unsnoozePersonal: jest.fn(async (id: string, _orgId: string, userId: string) => {
      const existing = receipts.get(`${id}:${userId}`);
      receipts.set(`${id}:${userId}`, { ...existing, snoozedUntil: null });
    }),
  } as unknown as NotificationReceiptService;

  const stationScopeService = {
    buildScopeContext: jest.fn(async (_orgId: string, role: MembershipRole, stationScope: string | null) => {
      const scope = stationScope?.trim();
      if (!scope || scope === 'ALL' || role === MembershipRole.ORG_ADMIN) {
        return { scopedVehicleIds: [], scopedBookingIds: [], bypassStationScope: true };
      }
      return {
        scopedStationId: scope,
        scopedVehicleIds: scope === STATION ? [VEH] : [],
        scopedBookingIds: [],
        bypassStationScope: false,
      };
    }),
    isNotificationInScope: jest.fn((notificationRow: any, ctx: any) => {
      if (ctx.bypassStationScope) return true;
      if (notificationRow.entityType === 'STATION' && notificationRow.entityId === ctx.scopedStationId) {
        return true;
      }
      if (notificationRow.entityId === VEH && ctx.scopedVehicleIds?.includes(VEH)) return true;
      return false;
    }),
    recheckVehicleStationScope: jest.fn(async () => true),
    shouldApplyStationScope: jest.fn(() => true),
  } as unknown as NotificationStationScopeService;

  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async () =>
        membership ? { role: membership.role, stationScope: membership.stationScope } : null,
      ),
    },
    userNotificationPreference: {
      findMany: jest.fn(async () => preferences),
    },
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === VEH && where.organizationId === ORG ? { id: VEH } : null,
      ),
    },
    station: { findFirst: jest.fn(async () => null) },
    booking: { findFirst: jest.fn(async () => null) },
    customer: { findFirst: jest.fn(async () => null) },
    orgInvoice: { findFirst: jest.fn(async () => null) },
    vehicleTrip: { findFirst: jest.fn(async () => null) },
  };

  const audit = { record: jest.fn(async () => 'audit-1') };

  let service: NotificationApiService;

  beforeEach(() => {
    v2Enabled = true;
    row = buildRow();
    receipts.clear();
    membership = { role: MembershipRole.ORG_ADMIN, stationScope: 'ALL' };
    preferences = [];
    jest.clearAllMocks();
    service = new NotificationApiService(
      core,
      repository,
      engineConfig,
      prisma as any,
      audit as any,
      receiptService,
      stationScopeService,
    );
  });

  describe('feature flag', () => {
    it('returns 503 when NOTIFICATIONS_V2 is disabled', async () => {
      v2Enabled = false;
      await expect(service.list(ORG, { id: USER }, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('tenant isolation', () => {
    it('returns 404 for foreign org notification', async () => {
      await expect(service.getById(ORG_OTHER, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('independent read state per user', () => {
    it('user A read does not mark user B read', async () => {
      await service.markRead(ORG, { id: USER }, NOTIF_ID);
      const forA = await service.getById(ORG, { id: USER }, NOTIF_ID);
      const forB = await service.getById(ORG, { id: USER_B }, NOTIF_ID);
      expect(forA.userReceipt.readAt).not.toBeNull();
      expect(forB.userReceipt.readAt).toBeNull();
    });
  });

  describe('station scope', () => {
    it('worker at station A cannot see station B notification', async () => {
      membership = { role: MembershipRole.WORKER, stationScope: STATION };
      row = buildRow({
        entityType: NotificationEntityType.STATION,
        entityId: STATION_B,
        eventType: 'STATION_SHORTAGE',
      });
      (stationScopeService.isNotificationInScope as jest.Mock).mockReturnValue(false);

      await expect(service.getById(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sub admin sees org-wide critical integration notification despite station scope', async () => {
      membership = { role: MembershipRole.SUB_ADMIN, stationScope: STATION };
      row = buildRow({
        eventType: 'INTEGRATION_DISCONNECTED',
        entityType: NotificationEntityType.ORGANIZATION,
        entityId: ORG,
        domain: NotificationDomain.SYSTEM,
        severity: NotificationSeverity.CRITICAL,
      });
      (stationScopeService.isNotificationInScope as jest.Mock).mockReturnValue(true);

      const dto = await service.getById(ORG, { id: USER }, NOTIF_ID);
      expect(dto.eventType).toBe('INTEGRATION_DISCONNECTED');
    });
  });

  describe('personal acknowledge and snooze', () => {
    it('acknowledge sets personal receipt only', async () => {
      await service.acknowledge(ORG, { id: USER }, NOTIF_ID);
      expect(receiptService.acknowledgePersonal).toHaveBeenCalled();
      const dto = await service.getById(ORG, { id: USER }, NOTIF_ID);
      expect(dto.userReceipt.acknowledgedAt).not.toBeNull();
      expect(row.status).toBe(NotificationStatus.OPEN);
    });

    it('snooze is per user', async () => {
      const until = new Date(Date.now() + 3600_000).toISOString();
      await service.snooze(ORG, { id: USER }, NOTIF_ID, until);
      expect(receiptService.snoozePersonal).toHaveBeenCalled();
    });

    it('rejects snooze with past date', async () => {
      await expect(
        service.snooze(ORG, { id: USER }, NOTIF_ID, '2020-01-01T00:00:00.000Z'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('global resolved state', () => {
    it('resolved status visible to all users', async () => {
      row = buildRow({ status: NotificationStatus.RESOLVED, resolvedAt: new Date() });
      const dtoA = await service.getById(ORG, { id: USER }, NOTIF_ID);
      const dtoB = await service.getById(ORG, { id: USER_B }, NOTIF_ID);
      expect(dtoA.status).toBe(NotificationStatus.RESOLVED);
      expect(dtoB.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('preferences', () => {
    it('hides non-mandatory notification when category inApp off', async () => {
      preferences = [
        {
          category: 'DAMAGE_MISUSE',
          inApp: false,
          email: true,
          push: false,
          sms: false,
          criticalOnly: false,
        },
      ];
      await expect(service.getById(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('shows mandatory SECURITY despite preference off', async () => {
      row = buildRow({
        eventType: 'WEBHOOK_FAILURE',
        domain: NotificationDomain.SYSTEM,
        entityType: NotificationEntityType.ORGANIZATION,
        entityId: ORG,
      });
      preferences = [
        {
          category: 'SECURITY',
          inApp: false,
          email: true,
          push: false,
          sms: false,
          criticalOnly: false,
        },
      ];
      membership = { role: MembershipRole.ORG_ADMIN, stationScope: 'ALL' };

      const dto = await service.getById(ORG, { id: USER }, NOTIF_ID);
      expect(dto.eventType).toBe('WEBHOOK_FAILURE');
    });
  });

  describe('roles', () => {
    it('rejects users without active membership', async () => {
      membership = null as any;
      await expect(service.getById(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
