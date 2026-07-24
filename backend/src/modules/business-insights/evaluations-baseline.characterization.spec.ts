import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { InsightSeverity } from './insight.types';
import { buildCalculationProvenance } from '@synq/evaluations-metrics/evaluations-calculation-provenance';

describe('evaluations baseline (characterization)', () => {
  describe('DashboardInsightsRepository.getActiveInsights', () => {
    function makeRepo(overrides: {
      insights?: Array<Record<string, unknown>>;
      lastRunFinishedAt?: Date | null;
      refreshIntervalMin?: number;
    }) {
      const prisma = {
        dashboardInsight: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue(overrides.insights ?? []),
        },
        dashboardInsightRun: {
          findFirst: jest.fn().mockResolvedValue(
            overrides.lastRunFinishedAt
              ? { finishedAt: overrides.lastRunFinishedAt, errorMessage: null, startedAt: overrides.lastRunFinishedAt }
              : null,
          ),
        },
        tenantInsightPolicy: {
          findUnique: jest.fn().mockResolvedValue({
            refreshIntervalMin: overrides.refreshIntervalMin ?? 30,
          }),
        },
      };
      return new DashboardInsightsRepository(prisma as never);
    }

    it('characterization: applies take limit from maxVisibleInsights (default 4)', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => ({
        id: `ins-${i}`,
        type: 'STATION_SHORTAGE',
        severity: InsightSeverity.WARNING,
        priority: 100 - i,
        title: `T${i}`,
        message: 'msg',
        actionLabel: null,
        actionType: null,
        entityScope: 'STATION',
        entityIds: [`s${i}`],
        timeContext: null,
        metrics: null,
        reasons: [],
        isGrouped: false,
        groupCount: 1,
        createdAt: new Date(),
      }));
      const findMany = jest.fn().mockResolvedValue(rows.slice(0, 4));
      const prisma = {
        dashboardInsight: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany,
        },
        dashboardInsightRun: {
          findFirst: jest.fn().mockResolvedValue({ finishedAt: new Date(), errorMessage: null, startedAt: new Date() }),
        },
        tenantInsightPolicy: {
          findUnique: jest.fn().mockResolvedValue({ refreshIntervalMin: 30 }),
        },
      };
      const repo = new DashboardInsightsRepository(prisma as never);
      const res = await repo.getActiveInsights('org-1', 4);
      expect(res.insights).toHaveLength(4);
      expect(findMany.mock.calls[0]?.[0]?.take).toBe(4);
    });

    it('marks response stale when last run older than 2x refreshIntervalMin', async () => {
      const old = new Date(Date.now() - 120 * 60_000);
      const repo = makeRepo({ lastRunFinishedAt: old, refreshIntervalMin: 30, insights: [] });
      const res = await repo.getActiveInsights('org-1', 4);
      expect(res.stale).toBe(true);
      expect(res.hasRun).toBe(true);
    });

    it('empty organisation: hasRun false when no completed run exists', async () => {
      const repo = makeRepo({ insights: [], lastRunFinishedAt: null });
      const res = await repo.getActiveInsights('org-empty', 4);
      expect(res.hasRun).toBe(false);
      expect(res.insights).toHaveLength(0);
      expect(res.summary.total).toBe(0);
    });

    it('returns calculationMeta null for legacy persisted insights (no invented defaults)', async () => {
      const repo = makeRepo({
        insights: [
          {
            id: 'legacy-1',
            type: 'LOW_UTILIZATION',
            severity: InsightSeverity.OPPORTUNITY,
            priority: 50,
            title: 'Legacy',
            message: 'msg',
            actionLabel: null,
            actionType: null,
            entityScope: 'VEHICLE',
            entityIds: ['v1'],
            timeContext: null,
            metrics: null,
            reasons: [],
            isGrouped: false,
            groupCount: 1,
            createdAt: new Date(),
            calculationMeta: null,
          },
        ],
      });
      const res = await repo.getActiveInsights('org-1', 4);
      expect(res.insights[0]?.calculationMeta).toBeNull();
    });

    it('round-trips persisted calculationMeta through DTO serialization', async () => {
      const provenance = buildCalculationProvenance({
        metricId: 'ins.low_utilization',
        calculationVersion: '1.0.0',
        generatedAt: new Date('2026-06-16T12:00:00.000Z'),
        periodStart: new Date('2026-06-09T12:00:00.000Z'),
        periodEnd: new Date('2026-06-23T12:00:00.000Z'),
        appliedFilters: { organizationId: 'org-1' },
        sourceVersions: { detector: 'LOW_UTILIZATION' },
      });
      const repo = makeRepo({
        insights: [
          {
            id: 'new-1',
            type: 'LOW_UTILIZATION',
            severity: InsightSeverity.OPPORTUNITY,
            priority: 50,
            title: 'With meta',
            message: 'msg',
            actionLabel: null,
            actionType: null,
            entityScope: 'VEHICLE',
            entityIds: ['v1'],
            timeContext: null,
            metrics: null,
            reasons: [],
            isGrouped: false,
            groupCount: 1,
            createdAt: new Date(),
            calculationMeta: provenance,
          },
        ],
      });
      const res = await repo.getActiveInsights('org-1', 4);
      expect(res.insights[0]?.calculationMeta?.metricId).toBe('ins.low_utilization');
      expect(res.insights[0]?.calculationMeta?.calculationVersion).toBe('1.0.0');
    });
  });
});
