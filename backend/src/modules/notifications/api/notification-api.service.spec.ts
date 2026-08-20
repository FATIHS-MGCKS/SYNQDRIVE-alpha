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
import { getNotificationEventTypesByAttentionScope } from '../registry/notification-event-registry';
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

function findEventTypeFilter(where: Record<string, unknown>): unknown {
  if (where.eventType) return where.eventType;
  const and = where.AND;
  if (!Array.isArray(and)) return undefined;
  for (const clause of and) {
    if (clause && typeof clause === 'object') {
      const nested = findEventTypeFilter(clause as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return undefined;
}

function containsOrClause(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const record = where as Record<string, unknown>;
  if (Array.isArray(record.OR)) return true;
  const and = record.AND;
  if (!Array.isArray(and)) return false;
  return and.some((clause) => containsOrClause(clause));
}

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

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
    isV2EnabledForOrg: (_orgId?: string | null) => v2Enabled,
  } as unknown as NotificationEngineConfig;

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
        return { scopedStationIds: [], scopedVehicleIds: [], scopedBookingIds: [], bypassStationScope: true };
      }
      return {
        scopedStationId: scope,
        scopedStationIds: [scope],
        scopedVehicleIds: scope === STATION ? [VEH] : [],
        scopedBookingIds: [],
        bypassStationScope: false,
      };
    }),
    isNotificationInScope: jest.fn((notificationRow: any, ctx: any) => {
      if (ctx.bypassStationScope) return true;
      const stationIds = ctx.scopedStationIds ?? (ctx.scopedStationId ? [ctx.scopedStationId] : []);
      if (notificationRow.entityType === 'STATION' && stationIds.includes(notificationRow.entityId)) {
        return true;
      }
      if (notificationRow.entityId === VEH && ctx.scopedVehicleIds?.includes(VEH)) return true;
      return false;
    }),
    isEntityInCallerScope: jest.fn((_ctx: any, entity: any) => {
      if (entity.kind === 'vehicle') return entity.id === VEH;
      return false;
    }),
    recheckVehicleStationScope: jest.fn(async () => true),
    shouldApplyStationScope: jest.fn(() => true),
  } as unknown as NotificationStationScopeService;

  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ status: 'ACTIVE' })),
    },
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
      findMany: jest.fn(async () => [
        { id: VEH, licensePlate: 'WOB L 7503', make: 'VW', model: 'Tiguan', year: 2020 },
      ]),
    },
    station: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    booking: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    dashboardInsight: {
      findMany: jest.fn(async () => []),
    },
    customer: { findFirst: jest.fn(async () => null) },
    orgInvoice: { findFirst: jest.fn(async () => null) },
    vehicleTrip: { findFirst: jest.fn(async () => null) },
  };

  const notificationAudit = {
    recordFireAndForget: jest.fn(),
    listEvents: jest.fn(async () => ({ items: [], nextCursor: null })),
  };
  const ingestObservability = {
    recordApiRequest: jest.fn(),
    recordFireAndForget: jest.fn(),
  };

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
      notificationAudit as any,
      ingestObservability as any,
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

  describe('attentionScope projection', () => {
    it('list with FLEET_READINESS filters to fleet registry event types only', async () => {
      await service.list(ORG, { id: USER, membershipRole: MembershipRole.ORG_ADMIN }, {
        attentionScope: 'FLEET_READINESS',
      });

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      const fleetTypes = getNotificationEventTypesByAttentionScope('FLEET_READINESS');
      expect(findEventTypeFilter(whereArg)).toEqual({ in: fleetTypes });
      expect(fleetTypes).toContain('VEHICLE_NOT_READY');
      expect(fleetTypes).not.toContain('LOW_UTILIZATION');
    });

    it('list with OPERATIONS filters to operations registry event types only', async () => {
      await service.list(ORG, { id: USER, membershipRole: MembershipRole.ORG_ADMIN }, {
        attentionScope: 'OPERATIONS',
      });

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      const opsTypes = getNotificationEventTypesByAttentionScope('OPERATIONS');
      expect(findEventTypeFilter(whereArg)).toEqual({ in: opsTypes });
      expect(opsTypes).toContain('LOW_UTILIZATION');
      expect(opsTypes).not.toContain('VEHICLE_NOT_READY');
    });

    it('counts with FLEET_READINESS applies scope to active count query', async () => {
      await service.getCounts(ORG, { id: USER, membershipRole: MembershipRole.ORG_ADMIN }, {
        attentionScope: 'FLEET_READINESS',
      });

      const activeWhere = (repository.countNotificationsWhere as jest.Mock).mock.calls[0][0];
      expect(findEventTypeFilter(activeWhere)).toEqual({
        in: getNotificationEventTypesByAttentionScope('FLEET_READINESS'),
      });
    });

    it('counts with OPERATIONS applies scope to active count query', async () => {
      await service.getCounts(ORG, { id: USER, membershipRole: MembershipRole.ORG_ADMIN }, {
        attentionScope: 'OPERATIONS',
      });

      const activeWhere = (repository.countNotificationsWhere as jest.Mock).mock.calls[0][0];
      expect(findEventTypeFilter(activeWhere)).toEqual({
        in: getNotificationEventTypesByAttentionScope('OPERATIONS'),
      });
    });

    it('attentionScope intersects with station scope for worker', async () => {
      membership = { role: MembershipRole.WORKER, stationScope: STATION };
      await service.list(ORG, { id: USER, membershipRole: MembershipRole.WORKER }, {
        attentionScope: 'FLEET_READINESS',
      });

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      expect(findEventTypeFilter(whereArg)).toEqual({
        in: getNotificationEventTypesByAttentionScope('FLEET_READINESS'),
      });
      expect(containsOrClause(whereArg)).toBe(true);
    });

    it('attentionScope intersects with preference suppression', async () => {
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
      await service.list(ORG, { id: USER, membershipRole: MembershipRole.ORG_ADMIN }, {
        attentionScope: 'FLEET_READINESS',
      });

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      expect(findEventTypeFilter(whereArg)).toEqual({
        in: getNotificationEventTypesByAttentionScope('FLEET_READINESS'),
      });
      expect(Array.isArray(whereArg.AND) && whereArg.AND.length).toBeGreaterThan(1);
    });
  });

  describe('stationId dashboard filter (vehicle membership)', () => {
    const STATION_S1 = 'station-s1';
    const STATION_S2 = 'station-s2';
    const VEH_S1 = 'veh-s1';
    const VEH_S2 = 'veh-s2';

    beforeEach(() => {
      (prisma.station.findFirst as jest.Mock).mockImplementation(async ({ where }: any) =>
        where.id === STATION_S1 && where.organizationId === ORG
          ? { id: STATION_S1, name: 'Zentrale' }
          : where.id === STATION_S2 && where.organizationId === ORG
            ? { id: STATION_S2, name: 'Other' }
            : null,
      );
      (prisma.vehicle.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
        const andClauses = Array.isArray(where.AND) ? where.AND : [where];
        const orgClause = andClauses.find((clause: any) => clause.organizationId);
        if (orgClause?.organizationId && orgClause.organizationId !== ORG) return [];
        const stationOr = andClauses.find((clause: any) => Array.isArray(clause.OR))?.OR ?? [];
        const stationIds = new Set<string>();
        for (const clause of stationOr) {
          if (clause.homeStationId) stationIds.add(clause.homeStationId);
          if (clause.currentStationId) stationIds.add(clause.currentStationId);
          if (clause.expectedStationId) stationIds.add(clause.expectedStationId);
        }
        if (stationIds.has(STATION_S1)) return [{ id: VEH_S1 }];
        if (stationIds.has(STATION_S2)) return [{ id: VEH_S2 }];
        return [];
      });
      (stationScopeService.isEntityInCallerScope as jest.Mock).mockImplementation(
        (_ctx: any, entity: any) => {
          if (entity.kind === 'station') return entity.id === STATION_S1 || entity.id === STATION_S2;
          if (entity.kind === 'vehicle') return entity.id === VEH_S1 || entity.id === VEH_S2;
          return false;
        },
      );
    });

    function findStationVehicleFilter(where: Record<string, unknown>): { OR?: unknown[] } | undefined {
      const or = where.OR;
      if (
        Array.isArray(or) &&
        or.some(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry as { entityType?: string; entityId?: unknown }).entityType ===
              NotificationEntityType.VEHICLE &&
            (entry as { entityId?: unknown }).entityId &&
            typeof (entry as { entityId?: { in?: unknown[] } }).entityId === 'object' &&
            Array.isArray((entry as { entityId?: { in?: unknown[] } }).entityId?.in),
        )
      ) {
        return where as { OR?: unknown[] };
      }

      const and = where.AND;
      if (!Array.isArray(and)) return undefined;
      for (const clause of and) {
        if (clause && typeof clause === 'object') {
          const nested = findStationVehicleFilter(clause as Record<string, unknown>);
          if (nested) return nested;
        }
      }
      return undefined;
    }

    it('returns vehicle notifications for vehicles at requested station S1', async () => {
      row = buildRow({ entityId: VEH_S1, eventType: 'TIRE_CRITICAL' });
      await service.list(
        ORG,
        { id: USER, membershipRole: MembershipRole.ORG_ADMIN },
        { stationId: STATION_S1, attentionScope: 'FLEET_READINESS' },
      );

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      const filter = findStationVehicleFilter(whereArg) as { OR?: unknown[] } | undefined;
      expect(filter?.OR).toEqual(
        expect.arrayContaining([
          { entityType: NotificationEntityType.VEHICLE, entityId: { in: [VEH_S1] } },
        ]),
      );
    });

    it('excludes S1 vehicle notifications when stationId=S2', async () => {
      row = buildRow({ entityId: VEH_S1, eventType: 'TIRE_CRITICAL' });
      await service.list(
        ORG,
        { id: USER, membershipRole: MembershipRole.ORG_ADMIN },
        { stationId: STATION_S2, attentionScope: 'FLEET_READINESS' },
      );

      const whereArg = (repository.listNotificationsWhere as jest.Mock).mock.calls[0][0];
      const filter = findStationVehicleFilter(whereArg) as { OR?: unknown[] } | undefined;
      expect(filter?.OR).toEqual(
        expect.arrayContaining([
          { entityType: NotificationEntityType.VEHICLE, entityId: { in: [VEH_S2] } },
        ]),
      );
      expect(JSON.stringify(filter?.OR ?? [])).not.toContain(VEH_S1);
    });

    it('applies station vehicle membership to counts endpoint', async () => {
      await service.getCounts(
        ORG,
        { id: USER, membershipRole: MembershipRole.ORG_ADMIN },
        { stationId: STATION_S1, attentionScope: 'FLEET_READINESS' },
      );

      const activeWhere = (repository.countNotificationsWhere as jest.Mock).mock.calls[0][0];
      expect(findStationVehicleFilter(activeWhere)).toBeDefined();
    });
  });
});
