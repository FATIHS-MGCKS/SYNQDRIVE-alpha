import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';

function scope(): EvaluationsAuthorizedAnalyticsScope {
  return {
    organizationId: 'org-a',
    stationIds: ['s1'],
    stationScoped: true,
    period: {
      periodType: 'MTD',
      start: '2026-08-01T00:00:00.000Z',
      endExclusive: '2026-08-11T00:00:00.000Z',
      reference: '2026-08-10T00:00:00.000Z',
      timezone: {
        effectiveTimezone: 'Europe/Berlin',
        source: 'PLATFORM_FALLBACK',
        reportTimezone: null,
        stationTimezone: null,
        organizationTimezone: null,
      },
      comparisonBasis: null,
    },
  };
}

function makeService(overrides: Record<string, jest.Mock> = {}) {
  const references = {
    countInScope: overrides.countInScope ?? jest.fn(async () => 100),
    groupInScope:
      overrides.groupInScope ??
      jest.fn(async () => [
        { key: { entityType: 'VEHICLE' }, count: 60 },
        { key: { entityType: 'CUSTOMER' }, count: 40 },
      ]),
    listInScope:
      overrides.listInScope ??
      jest.fn(async () =>
        Array.from({ length: 20 }, (_, i) => ({
          reference: {
            organizationId: 'org-a',
            stationId: 's1',
            ownerType: 'INSIGHT' as const,
            ownerId: `ins-${i}`,
            entityType: 'VEHICLE' as const,
            entityId: `veh-${i}`,
            relationType: 'PRIMARY_SUBJECT' as const,
          },
          createdAt: new Date('2026-08-05T00:00:00.000Z'),
        })),
      ),
  };
  return {
    service: new EvaluationsAnalyticsService(references as never),
    references,
  };
}

describe('EvaluationsAnalyticsService summary', () => {
  it('keeps the aggregate total independent from top-N groups', async () => {
    const { service } = makeService();
    const summary = await service.getSummary({
      scope: scope(),
      filters: {},
      groupBy: 'ENTITY_TYPE',
      groupLimit: 5,
    });
    expect(summary.aggregateTotal).toBe(100);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groupLimit).toBe(5);
    // The top-N list must never be treated as the population total.
    const groupSum = summary.groups.reduce((acc, g) => acc + g.count, 0);
    expect(summary.aggregateTotal).not.toBe(summary.groups.length);
    expect(groupSum).toBeLessThanOrEqual(summary.aggregateTotal!);
    expect(summary.status).toBe('AVAILABLE');
  });

  it('returns no groups when no dimension is requested but still reports the total', async () => {
    const { service, references } = makeService();
    const summary = await service.getSummary({
      scope: scope(),
      filters: {},
      groupBy: null,
    });
    expect(summary.groups).toEqual([]);
    expect(summary.aggregateTotal).toBe(100);
    expect(references.groupInScope).not.toHaveBeenCalled();
  });
});

describe('EvaluationsAnalyticsService detail', () => {
  it('separates total count from the returned page', async () => {
    const { service } = makeService();
    const detail = await service.getDetail({
      scope: scope(),
      filters: {},
      page: { page: 1, pageSize: 20 },
    });
    expect(detail.totalCount).toBe(100);
    expect(detail.returnedCount).toBe(20);
    expect(detail.totalCount).not.toBe(detail.returnedCount);
    expect(detail.pageSize).toBe(20);
    expect(detail.hasMore).toBe(true);
    expect(detail.items).toHaveLength(20);
    expect(detail.items[0].createdAt).toBe('2026-08-05T00:00:00.000Z');
  });

  it('reports hasMore=false on the final page', async () => {
    const { service } = makeService({
      countInScope: jest.fn(async () => 20),
    });
    const detail = await service.getDetail({
      scope: scope(),
      filters: {},
      page: { page: 1, pageSize: 20 },
    });
    expect(detail.totalCount).toBe(20);
    expect(detail.hasMore).toBe(false);
  });
});

describe('EvaluationsAnalyticsService summary/detail reconciliation', () => {
  it('counts summary and detail over identical scope, filters and period', async () => {
    const { service, references } = makeService();
    const commonScope = scope();
    const commonFilters = { entityTypes: ['VEHICLE'] as const };

    await service.getSummary({ scope: commonScope, filters: commonFilters, groupBy: null });
    await service.getDetail({ scope: commonScope, filters: commonFilters });

    const [summaryCall] = references.countInScope.mock.calls[0];
    const [detailCall] = references.countInScope.mock.calls[1];
    expect(summaryCall).toBe(detailCall);
    expect(references.countInScope.mock.calls[0][1]).toBe(
      references.countInScope.mock.calls[1][1],
    );
    expect(references.countInScope.mock.calls[0][2]).toEqual(
      references.countInScope.mock.calls[1][2],
    );
  });
});
