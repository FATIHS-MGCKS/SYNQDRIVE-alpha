import { NotFoundException } from '@nestjs/common';
import { parsePagination } from '@shared/utils/pagination';
import {
  buildNotificationEvaluationJobId,
  followUpKey,
  pendingEventsKey,
} from '@modules/notifications/runtime/notification-evaluation-queue.util';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import { matchesResolvedInsightFilters } from '@synq/evaluations-insights/evaluations-analytics-filters';
import type { InsightAnalyticsRow } from '@synq/evaluations-insights/insights-analytics.contract';

describe('Evaluations analytics tenant isolation', () => {
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const stationA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const stationB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const vehicleA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const insightA = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const insightB = '11111111-1111-4111-8111-111111111111';

  const baseResolved = (
    overrides: Partial<ResolvedEvaluationsAnalyticsFilters> = {},
  ): ResolvedEvaluationsAnalyticsFilters => ({
    organizationId: orgA,
    period: {
      key: 'mtd',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-16T12:00:00.000Z',
      timezone: 'Europe/Berlin',
    },
    comparisonPeriod: {
      key: 'mtd',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
      timezone: 'Europe/Berlin',
    },
    stationId: null,
    vehicleId: null,
    vehicleClassId: null,
    vehicleStatus: null,
    bookingStatus: null,
    customerSegment: null,
    currency: 'EUR',
    riskCategory: null,
    insightStatus: null,
    dataQualityStatus: null,
    scopedVehicleIds: null,
    stationVehicleIds: null,
    allowedStationIds: null,
    ...overrides,
  });

  describe('EvaluationsAnalyticsFilterService', () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }) },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([{ id: vehicleA }]),
        findFirst: jest.fn().mockResolvedValue({ id: vehicleA }),
      },
      rentalVehicleCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }),
      },
    };

    const stationAccess = {
      resolve: jest.fn().mockResolvedValue({
        bypassScope: false,
        allowedStationIds: [stationA],
        membershipRole: 'WORKER',
        userId: 'user-1',
      }),
      assertStationReadable: jest.fn((access, id: string) => {
        if (!access.allowedStationIds.includes(id)) {
          throw new NotFoundException('Station not found');
        }
      }),
      buildVehicleStationScopeWhere: jest.fn().mockReturnValue({
        OR: [{ homeStationId: { in: [stationA] } }, { currentStationId: { in: [stationA] } }],
      }),
    };

    let service: EvaluationsAnalyticsFilterService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new EvaluationsAnalyticsFilterService(prisma as never, stationAccess as never);
    });

    it('rejects foreign station id without revealing existence', async () => {
      await expect(service.resolve(orgA, 'user-1', { stationId: stationB })).rejects.toThrow(
        'Station not found',
      );
    });

    it('rejects foreign vehicle id scoped to another organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.resolve(orgA, 'user-1', { vehicleId: '99999999-9999-4999-8999-999999999999' }),
      ).rejects.toThrow('Vehicle not found');
    });

    it('rejects foreign vehicle class id', async () => {
      prisma.rentalVehicleCategory.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.resolve(orgA, 'user-1', {
          vehicleClassId: '99999999-9999-4999-8999-999999999999',
        }),
      ).rejects.toThrow('Vehicle class not found');
    });
  });

  describe('DashboardInsightsAnalyticsService insight access', () => {
    const prisma = {
      dashboardInsight: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const repo = {
      expireStaleInsights: jest.fn(),
      getRunMetadata: jest.fn().mockResolvedValue({
        hasRun: true,
        lastRunAt: '2026-06-10T10:00:00.000Z',
        stale: false,
        error: null,
      }),
      toPublicInsightDto: jest.fn((row) => ({ id: row.id, title: row.title })),
    };

    let service: DashboardInsightsAnalyticsService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new DashboardInsightsAnalyticsService(prisma as never, repo as never);
    });

    it('returns null for foreign organization insight id (no cross-tenant leak)', async () => {
      prisma.dashboardInsight.findFirst.mockResolvedValue(null);
      const result = await service.getAnalyticsInsightById(
        orgA,
        insightB,
        baseResolved(),
      );
      expect(result).toBeNull();
      expect(prisma.dashboardInsight.findFirst).toHaveBeenCalledWith({
        where: { id: insightB, organizationId: orgA, isActive: true },
      });
    });

    it('returns null for in-org insight outside station scope (same as not found)', async () => {
      prisma.dashboardInsight.findFirst.mockResolvedValue({
        id: insightA,
        type: 'STATION_SHORTAGE',
        severity: 'CRITICAL',
        priority: 90,
        entityScope: 'STATION',
        entityIds: [stationB],
        isGrouped: false,
        groupCount: 1,
        entityReferences: null,
        metrics: null,
        timeContext: null,
        createdAt: new Date(),
        title: 'Other station',
        message: 'Hidden',
      });
      const result = await service.getAnalyticsInsightById(
        orgA,
        insightA,
        baseResolved({
          stationId: stationA,
          stationVehicleIds: new Set([vehicleA]),
        }),
      );
      expect(result).toBeNull();
    });
  });

  describe('Insight filter matching', () => {
    const orgWideInsight: InsightAnalyticsRow = {
      id: insightA,
      type: 'LOW_UTILIZATION',
      severity: 'WARNING',
      priority: 40,
      entityScope: 'ORG',
      entityIds: [],
      organizationId: orgA,
    };

    it('hides org-wide insights from station-scoped users', () => {
      const resolved = baseResolved({
        allowedStationIds: [stationA],
        stationVehicleIds: new Set([vehicleA]),
      });
      expect(matchesResolvedInsightFilters(orgWideInsight, resolved)).toBe(false);
    });

    it('does not treat manipulated pagination as a scope bypass', () => {
      const pagination = parsePagination({ page: -5, limit: 9999 });
      expect(pagination.skip).toBe(0);
      expect(pagination.take).toBe(100);
    });
  });

  describe('Background job and cache key isolation', () => {
    it('scopes BullMQ job ids and Redis keys per organization', () => {
      expect(buildNotificationEvaluationJobId(orgA, 'scheduled')).toBe(
        `notification-evaluation:${orgA}:scheduled`,
      );
      expect(buildNotificationEvaluationJobId(orgB, 'scheduled')).not.toBe(
        buildNotificationEvaluationJobId(orgA, 'scheduled'),
      );
      expect(pendingEventsKey(orgA)).toBe(`notification:eval:pending:${orgA}`);
      expect(followUpKey(orgB)).toBe(`notification:eval:followup:${orgB}`);
      expect(pendingEventsKey(orgA)).not.toBe(pendingEventsKey(orgB));
    });
  });

  describe('DashboardInsightsRepository run detail', () => {
    const prisma = {
      dashboardInsightRun: {
        findFirst: jest.fn(),
      },
    };

    let repo: DashboardInsightsRepository;

    beforeEach(() => {
      repo = new DashboardInsightsRepository(prisma as never);
    });

    it('returns null when run belongs to another organization', async () => {
      prisma.dashboardInsightRun.findFirst.mockResolvedValue(null);
      const detail = await repo.getRunDetailForOrg(orgA, 'run-foreign');
      expect(detail).toBeNull();
      expect(prisma.dashboardInsightRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-foreign', organizationId: orgA },
        }),
      );
    });
  });
});
