import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';

const PERIOD = { start: '2026-08-01T00:00:00.000Z', endExclusive: '2026-09-01T00:00:00.000Z' };

function scope(
  overrides: Partial<EvaluationsAuthorizedAnalyticsScope> = {},
): EvaluationsAuthorizedAnalyticsScope {
  return {
    organizationId: 'org-a',
    stationIds: null,
    stationScoped: false,
    period: {
      periodType: 'MONTH',
      start: PERIOD.start,
      endExclusive: PERIOD.endExclusive,
      reference: '2026-08-15T00:00:00.000Z',
      timezone: {
        effectiveTimezone: 'Europe/Berlin',
        source: 'PLATFORM_FALLBACK',
        reportTimezone: null,
        stationTimezone: null,
        organizationTimezone: null,
      },
      comparisonBasis: null,
    },
    ...overrides,
  };
}

describe('EvaluationsEntityReferenceRepository.buildWhere', () => {
  const repo = new EvaluationsEntityReferenceRepository({} as never);

  it('always anchors on organizationId and the period window', () => {
    const where = repo.buildWhere(scope(), {}, PERIOD);
    expect(where.organizationId).toBe('org-a');
    expect(where.createdAt).toEqual({
      gte: new Date(PERIOD.start),
      lt: new Date(PERIOD.endExclusive),
    });
  });

  it('adds no station constraint for a full-scope (bypass) actor without station filter', () => {
    const where = repo.buildWhere(scope({ stationIds: null }), {}, PERIOD);
    expect(where.stationId).toBeUndefined();
  });

  it('constrains to the authorized station subset for a station-scoped actor', () => {
    const where = repo.buildWhere(
      scope({ stationIds: ['s1', 's2'], stationScoped: true }),
      {},
      PERIOD,
    );
    expect(where.stationId).toEqual({ in: ['s1', 's2'] });
  });

  it('intersects a station filter with the authorized station subset', () => {
    const where = repo.buildWhere(
      scope({ stationIds: ['s1', 's2'], stationScoped: true }),
      { stationIds: ['s2', 's3'] },
      PERIOD,
    );
    expect(where.stationId).toEqual({ in: ['s2'] });
  });

  it('applies entity and relation type filters', () => {
    const where = repo.buildWhere(
      scope(),
      { entityTypes: ['VEHICLE'], relationTypes: ['PRIMARY_SUBJECT'] },
      PERIOD,
    );
    expect(where.entityType).toEqual({ in: ['VEHICLE'] });
    expect(where.relationType).toEqual({ in: ['PRIMARY_SUBJECT'] });
  });

  it('maps vehicle and customer id filters to typed entity clauses', () => {
    const where = repo.buildWhere(
      scope(),
      { vehicleIds: ['v1'], customerIds: ['c1', 'c2'] },
      PERIOD,
    );
    expect(where.AND).toEqual([
      {
        OR: [
          { entityType: 'VEHICLE', entityId: { in: ['v1'] } },
          { entityType: 'CUSTOMER', entityId: { in: ['c1', 'c2'] } },
        ],
      },
    ]);
  });
});

describe('EvaluationsEntityReferenceRepository tenant-scoped queries', () => {
  function makeRepo() {
    const count = jest.fn(async () => 3);
    const findMany = jest.fn(async () => []);
    const groupBy = jest.fn(async () => []);
    const prisma = {
      evaluationsEntityReference: { count, findMany, groupBy },
    } as never;
    return {
      repo: new EvaluationsEntityReferenceRepository(prisma),
      count,
      findMany,
      groupBy,
    };
  }

  it('passes organizationId scope to count', async () => {
    const { repo, count } = makeRepo();
    await repo.countInScope(scope({ organizationId: 'org-a' }), {}, PERIOD);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    });
  });

  it('passes organizationId scope and bounded paging to findMany', async () => {
    const { repo, findMany } = makeRepo();
    await repo.listInScope(scope({ organizationId: 'org-a' }), {}, PERIOD, {
      page: 2,
      pageSize: 10,
      skip: 10,
      take: 10,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it('passes organizationId scope to groupBy', async () => {
    const { repo, groupBy } = makeRepo();
    await repo.groupInScope(scope({ organizationId: 'org-a' }), {}, PERIOD, 'ENTITY_TYPE', 5);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['entityType'],
        where: expect.objectContaining({ organizationId: 'org-a' }),
        take: 5,
      }),
    );
  });
});
