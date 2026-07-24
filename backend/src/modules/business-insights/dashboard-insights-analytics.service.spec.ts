import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import type { InsightAnalyticsRow } from '@synq/evaluations-insights/insights-analytics.contract';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';

function insightRow(id: string, overrides: Partial<InsightAnalyticsRow> = {}): InsightAnalyticsRow {
  return {
    id,
    type: 'STATION_SHORTAGE',
    severity: 'WARNING',
    priority: 50,
    entityIds: ['s1'],
    metrics: { category: 'BUSINESS_RISK' },
    createdAt: new Date('2026-06-10'),
    ...overrides,
  };
}

describe('DashboardInsightsAnalyticsService', () => {
  const orgId = 'org-analytics-test';
  let rows: InsightAnalyticsRow[] = [];

  const baseResolved = (
    overrides: Partial<ResolvedEvaluationsAnalyticsFilters> = {},
  ): ResolvedEvaluationsAnalyticsFilters => ({
    organizationId: orgId,
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

  const prisma = {
    dashboardInsight: {
      findMany: jest.fn(async (args: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return args.where.id.in
            .map((id) => rows.find((r) => r.id === id))
            .filter(Boolean)
            .map((r) => ({
              ...r,
              title: `Title ${r!.id}`,
              message: 'msg',
              actionLabel: null,
              actionType: null,
              entityScope: 'STATION',
              reasons: [],
              isGrouped: false,
              groupCount: 1,
              calculationMeta: null,
            }));
        }
        return rows.map((r) => ({
          id: r.id,
          type: r.type,
          severity: r.severity,
          priority: r.priority,
          entityIds: r.entityIds,
          metrics: r.metrics,
          timeContext: r.timeContext,
          createdAt: r.createdAt ?? new Date(),
        }));
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) return null;
        return {
          ...row,
          organizationId: where.organizationId,
          title: `Title ${row.id}`,
          message: 'msg',
          actionLabel: null,
          actionType: null,
          entityScope: 'STATION',
          reasons: [],
          isGrouped: false,
          groupCount: 1,
          calculationMeta: null,
        };
      }),
    },
    vehicle: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const repo = {
    expireStaleInsights: jest.fn().mockResolvedValue(0),
    getRunMetadata: jest.fn().mockResolvedValue({
      hasRun: true,
      lastRunAt: '2026-06-16T12:00:00.000Z',
      stale: false,
      error: null,
    }),
    mapRowsToInsightDtos: jest.fn(async (_org: string, ids: string[]) =>
      ids.map((id) => ({
        id,
        type: 'STATION_SHORTAGE',
        severity: 'WARNING',
        priority: 50,
        title: `Title ${id}`,
        message: 'msg',
        entityScope: 'STATION',
        isGrouped: false,
        groupCount: 1,
        createdAt: '2026-06-10T00:00:00.000Z',
      })),
    ),
    toPublicInsightDto: jest.fn((row: { id: string }) => ({
      id: row.id,
      type: 'STATION_SHORTAGE',
      severity: 'WARNING',
      priority: 50,
      title: `Title ${row.id}`,
      message: 'msg',
      entityScope: 'STATION',
      isGrouped: false,
      groupCount: 1,
      createdAt: '2026-06-10T00:00:00.000Z',
    })),
  };

  let service: DashboardInsightsAnalyticsService;

  beforeEach(async () => {
    rows = [];
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardInsightsAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DashboardInsightsRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(DashboardInsightsAnalyticsService);
  });

  it('summary with 0 insights returns zero counts', async () => {
    const summary = await service.getAnalyticsSummary(orgId, baseResolved());
    expect(summary.counts.totalVisible).toBe(0);
    expect(summary.counts.businessRisks).toBe(0);
  });

  it('summary with 5 insights is independent of list page size', async () => {
    rows = Array.from({ length: 5 }, (_, i) =>
      insightRow(`ins-${i}`, { type: 'TIGHT_HANDOVER', priority: 100 - i }),
    );
    const summary = await service.getAnalyticsSummary(orgId, baseResolved());
    const page1 = await service.listAnalyticsInsights(orgId, baseResolved(), { page: 1, limit: 2 });
    const page2 = await service.listAnalyticsInsights(orgId, baseResolved(), { page: 2, limit: 2 });

    expect(summary.counts.businessRisks).toBe(5);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page1.meta.total).toBe(5);
    expect(summary.counts.businessRisks).toBe(page1.meta.total);
  });

  it('summary with 100 insights aggregates all rows', async () => {
    rows = Array.from({ length: 100 }, (_, i) =>
      insightRow(`ins-${i}`, {
        type: i % 4 === 0 ? 'LOW_UTILIZATION' : 'STATION_SHORTAGE',
        metrics: i % 4 === 0 ? null : { category: 'BUSINESS_RISK' },
        priority: i,
      }),
    );
    const summary = await service.getAnalyticsSummary(orgId, baseResolved());
    expect(summary.counts.totalVisible).toBe(100);
    expect(summary.counts.revenueLeakage).toBe(25);
    expect(summary.counts.businessRisks).toBe(75);
  });

  it('list supports pagination and deterministic sort by priority desc', async () => {
    rows = [
      insightRow('low', { priority: 10 }),
      insightRow('high', { priority: 90 }),
      insightRow('mid', { priority: 50 }),
      insightRow('top', { priority: 100 }),
    ];
    const list = await service.listAnalyticsInsights(orgId, baseResolved(), {
      page: 1,
      limit: 2,
      sortBy: 'priority',
      sortOrder: 'desc',
    });
    expect(list.data.map((d) => d.id)).toEqual(['top', 'high']);
    expect(list.meta.total).toBe(4);
    expect(list.meta.totalPages).toBe(2);
  });

  it('getAnalyticsInsightById returns a single insight', async () => {
    rows = [insightRow('one')];
    const insight = await service.getAnalyticsInsightById(orgId, 'one', baseResolved());
    expect(insight?.id).toBe('one');
  });

  it('category filter applies to both summary and list', async () => {
    rows = [
      insightRow('br', { type: 'PICKUP_OVERDUE' }),
      insightRow('rl', { type: 'LOW_UTILIZATION', metrics: null }),
    ];
    const summary = await service.getAnalyticsSummary(orgId, baseResolved({ riskCategory: 'REVENUE_LEAKAGE' }));
    const list = await service.listAnalyticsInsights(orgId, baseResolved({ riskCategory: 'REVENUE_LEAKAGE' }), {
      page: 1,
      limit: 10,
    });
    expect(summary.counts.revenueLeakage).toBe(1);
    expect(summary.counts.businessRisks).toBe(0);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.id).toBe('rl');
  });
});
