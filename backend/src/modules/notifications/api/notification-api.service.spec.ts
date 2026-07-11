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

const ORG = 'org-1';
const ORG_OTHER = 'org-2';
const USER = 'user-1';
const STATION = 'station-1';
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
  let receipt: { notificationId: string; userId: string; readAt: Date | null } | null;
  let membership: {
    role: MembershipRole;
    stationScope: string | null;
  };

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  const core = {
    markRead: jest.fn(async () => ({})),
    markUnread: jest.fn(async () => ({})),
    acknowledgeNotification: jest.fn(async () => ({})),
    snoozeNotification: jest.fn(async () => ({})),
    unsnoozeNotification: jest.fn(async () => ({})),
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
    findReceiptsForUser: jest.fn(async () => (receipt ? [receipt] : [])),
    findReceipt: jest.fn(async () => receipt),
  } as unknown as NotificationRepository;

  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async () =>
        membership
          ? { role: membership.role, stationScope: membership.stationScope }
          : null,
      ),
    },
    vehicle: {
      findMany: jest.fn(async () => [{ id: VEH }]),
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === VEH && where.organizationId === ORG ? { id: VEH } : null,
      ),
    },
    station: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === STATION && where.organizationId === ORG ? { id: STATION } : null,
      ),
    },
    booking: { findFirst: jest.fn(async () => null) },
    customer: { findFirst: jest.fn(async () => null) },
    orgInvoice: { findFirst: jest.fn(async () => null) },
    trip: { findFirst: jest.fn(async () => null) },
    vehicleTrip: { findFirst: jest.fn(async () => null) },
  };

  const audit = { record: jest.fn(async () => 'audit-1') };

  let service: NotificationApiService;

  beforeEach(() => {
    v2Enabled = true;
    row = buildRow();
    receipt = null;
    membership = { role: MembershipRole.ORG_ADMIN, stationScope: 'ALL' };
    jest.clearAllMocks();
    service = new NotificationApiService(
      core,
      repository,
      engineConfig,
      prisma as any,
      audit as any,
    );
  });

  describe('feature flag', () => {
    it('returns 503 when NOTIFICATIONS_V2 is disabled', async () => {
      v2Enabled = false;
      await expect(service.list(ORG, { id: USER }, {})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('tenant isolation', () => {
    it('returns 404 for foreign org notification', async () => {
      await expect(service.getById(ORG_OTHER, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns 404 for unknown notification id', async () => {
      await expect(service.getById(ORG, { id: USER }, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns 404 for foreign entity filter', async () => {
      await expect(
        service.list(ORG, { id: USER }, { vehicleId: 'foreign-veh' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('station scope', () => {
    it('returns 404 when worker cannot access notification outside station scope', async () => {
      membership = { role: MembershipRole.WORKER, stationScope: STATION };
      row = buildRow({
        entityType: NotificationEntityType.STATION,
        entityId: 'other-station',
        actionTarget: { stationId: 'other-station' },
        eventType: 'STATION_SHORTAGE',
      });

      await expect(service.getById(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows worker to access vehicle at scoped station', async () => {
      membership = { role: MembershipRole.WORKER, stationScope: STATION };
      row = buildRow({ entityId: VEH, actionTarget: { vehicleId: VEH } });

      const dto = await service.getById(ORG, { id: USER }, NOTIF_ID);
      expect(dto.id).toBe(NOTIF_ID);
    });
  });

  describe('read state per user', () => {
    it('marks read idempotently', async () => {
      (core.markRead as jest.Mock).mockImplementation(async () => {
        receipt = {
          notificationId: NOTIF_ID,
          userId: USER,
          readAt: new Date('2026-07-11T12:01:00.000Z'),
          acknowledgedAt: null,
          snoozedUntil: null,
          hiddenAt: null,
        } as any;
        return receipt;
      });
      const result = await service.markRead(ORG, { id: USER }, NOTIF_ID);
      expect(core.markRead).toHaveBeenCalledWith(NOTIF_ID, ORG, USER);
      expect(result.availableActions).toContain('unread');
      expect(result.userReceipt.readAt).not.toBeNull();
    });

    it('does not expose fingerprint in response', async () => {
      const dto = await service.getById(ORG, { id: USER }, NOTIF_ID);
      expect(dto).not.toHaveProperty('fingerprint');
      expect(dto.entity.displayLabel).toBe('WOB L 7503');
    });
  });

  describe('counts', () => {
    it('returns separated severity and domain counts', async () => {
      const counts = await service.getCounts(ORG, { id: USER });
      expect(counts).toEqual({
        totalActive: 1,
        unread: 1,
        critical: 0,
        warning: 1,
        info: 0,
        resolvedRecent: 1,
        byDomain: { VEHICLE_HEALTH: 1 },
      });
    });
  });

  describe('pagination and list', () => {
    it('returns paginated list meta', async () => {
      const result = await service.list(ORG, { id: USER }, { page: 1, limit: 10 });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('lifecycle transitions', () => {
    it('rejects acknowledge when not allowed', async () => {
      row = buildRow({ status: NotificationStatus.RESOLVED });
      await expect(service.acknowledge(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects manual resolve for auto telemetry', async () => {
      row = buildRow({
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        status: NotificationStatus.OPEN,
      });
      await expect(service.resolve(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows manual resolve for technical observation', async () => {
      await service.resolve(ORG, { id: USER }, NOTIF_ID);
      expect(core.resolveNotification).toHaveBeenCalledWith(
        NOTIF_ID,
        ORG,
        expect.any(Date),
        { manual: true },
      );
      expect(audit.record).toHaveBeenCalled();
    });

    it('rejects snooze with past date', async () => {
      await expect(
        service.snooze(ORG, { id: USER }, NOTIF_ID, '2020-01-01T00:00:00.000Z'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows snooze with future date', async () => {
      const until = new Date(Date.now() + 3600_000).toISOString();
      await service.snooze(ORG, { id: USER }, NOTIF_ID, until);
      expect(core.snoozeNotification).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('roles', () => {
    it('rejects users without active membership', async () => {
      membership = null as any;
      await expect(service.getById(ORG, { id: USER }, NOTIF_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
