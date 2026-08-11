import { ForbiddenException } from '@nestjs/common';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';

const PERIOD: EvaluationsPeriodWindow = {
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
};

interface StationAccess {
  bypassScope: boolean;
  allowedStationIds: string[] | null;
  membershipRole: string | null;
  userId?: string;
}

function makeService(opts: {
  access: StationAccess;
  ownedStations: string[];
}): { service: EvaluationsAnalyticsScopeService; stationFindMany: jest.Mock } {
  const stationFindMany = jest.fn(async (args: { where: { id: { in: string[] } } }) => {
    const requested: string[] = args.where.id.in;
    return requested
      .filter((id) => opts.ownedStations.includes(id))
      .map((id) => ({ id }));
  });
  const prisma = { station: { findMany: stationFindMany } } as never;
  const stationAccess = {
    resolve: jest.fn(async () => opts.access),
  } as never;
  return {
    service: new EvaluationsAnalyticsScopeService(prisma, stationAccess),
    stationFindMany,
  };
}

const actor = { id: 'user-a', organizationId: 'org-a', platformRole: 'USER' };

describe('EvaluationsAnalyticsScopeService', () => {
  it('grants the full organization scope for a bypass actor with no station narrowing', async () => {
    const { service } = makeService({
      access: { bypassScope: true, allowedStationIds: null, membershipRole: 'ORG_ADMIN' },
      ownedStations: ['s1', 's2'],
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      period: PERIOD,
    });
    expect(scope).toMatchObject({
      organizationId: 'org-a',
      stationIds: null,
      stationScoped: false,
    });
  });

  it('limits a station-scoped actor to the authorized stations', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1', 's2'], membershipRole: 'WORKER' },
      ownedStations: ['s1', 's2', 's3'],
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      period: PERIOD,
    });
    expect(scope.stationIds).toEqual(['s1', 's2']);
    expect(scope.stationScoped).toBe(true);
  });

  it('accepts an explicit station that is org-owned and within scope', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1', 's2'], membershipRole: 'WORKER' },
      ownedStations: ['s1', 's2'],
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: ['s1'],
      period: PERIOD,
    });
    expect(scope.stationIds).toEqual(['s1']);
  });

  it('fails closed when a requested station does not belong to the organization', async () => {
    const { service } = makeService({
      access: { bypassScope: true, allowedStationIds: null, membershipRole: 'ORG_ADMIN' },
      ownedStations: ['s1'],
    });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s-foreign'],
        period: PERIOD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when a requested station is org-owned but outside the actor scope', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1'], membershipRole: 'WORKER' },
      ownedStations: ['s1', 's3'],
    });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s3'],
        period: PERIOD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an entire mixed authorized+foreign station list (fail closed)', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1'], membershipRole: 'WORKER' },
      ownedStations: ['s1'],
    });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s1', 's-foreign'],
        period: PERIOD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('treats an explicit empty selection as a well-defined empty scope', async () => {
    const { service } = makeService({
      access: { bypassScope: true, allowedStationIds: null, membershipRole: 'ORG_ADMIN' },
      ownedStations: ['s1'],
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: [],
      period: PERIOD,
    });
    expect(scope.stationIds).toEqual([]);
    expect(scope.stationScoped).toBe(true);
  });
});
