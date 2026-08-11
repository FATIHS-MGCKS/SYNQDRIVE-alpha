import { ForbiddenException } from '@nestjs/common';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';

const REFERENCE = new Date('2026-08-10T09:00:00.000Z');

interface StationAccess {
  bypassScope: boolean;
  allowedStationIds: string[] | null;
  membershipRole: string | null;
  userId?: string;
}

function makeService(opts: {
  access: StationAccess;
  ownedStations: string[];
  organizationTimezone?: string | null;
  stationTimezones?: Record<string, string | null>;
}): { service: EvaluationsAnalyticsScopeService; stationFindMany: jest.Mock } {
  const stationFindMany = jest.fn(async (args: { where: { id: { in: string[] } } }) => {
    const requested: string[] = args.where.id.in;
    return requested
      .filter((id) => opts.ownedStations.includes(id))
      .map((id) => ({ id }));
  });
  const prisma = {
    station: {
      findMany: stationFindMany,
      findFirst: jest.fn(async (args: { where: { id: string } }) => {
        const id = args.where.id;
        if (!opts.ownedStations.includes(id)) return null;
        return { timezone: opts.stationTimezones?.[id] ?? 'Europe/Berlin' };
      }),
    },
    organization: {
      findUnique: jest.fn(async () => ({
        timezone: opts.organizationTimezone ?? null,
      })),
    },
  } as never;
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
      periodType: 'MTD',
      reference: REFERENCE,
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
      periodType: 'MTD',
      reference: REFERENCE,
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
      periodType: 'MTD',
      reference: REFERENCE,
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
        periodType: 'MTD',
        reference: REFERENCE,
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
        periodType: 'MTD',
        reference: REFERENCE,
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
        periodType: 'MTD',
        reference: REFERENCE,
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
      periodType: 'MTD',
      reference: REFERENCE,
    });
    expect(scope.stationIds).toEqual([]);
    expect(scope.stationScoped).toBe(true);
  });
});

describe('EvaluationsAnalyticsScopeService timezone authority', () => {
  it('uses the real organization timezone when no single station is scoped', async () => {
    const { service } = makeService({
      access: { bypassScope: true, allowedStationIds: null, membershipRole: 'ORG_ADMIN' },
      ownedStations: ['s1'],
      organizationTimezone: 'America/New_York',
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MONTH',
      reference: REFERENCE,
    });
    expect(scope.period.timezone.effectiveTimezone).toBe('America/New_York');
    expect(scope.period.timezone.source).toBe('ORGANIZATION');
  });

  it('prefers a single authorized station timezone over the organization', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1'], membershipRole: 'WORKER' },
      ownedStations: ['s1'],
      organizationTimezone: 'America/New_York',
      stationTimezones: { s1: 'Europe/Berlin' },
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: ['s1'],
      periodType: 'MONTH',
      reference: REFERENCE,
    });
    expect(scope.period.timezone.effectiveTimezone).toBe('Europe/Berlin');
    expect(scope.period.timezone.source).toBe('STATION');
  });

  it('falls through to the organization timezone for multiple stations (no first-station-wins)', async () => {
    const { service } = makeService({
      access: { bypassScope: false, allowedStationIds: ['s1', 's2'], membershipRole: 'WORKER' },
      ownedStations: ['s1', 's2'],
      organizationTimezone: 'America/New_York',
      stationTimezones: { s1: 'Europe/Berlin', s2: 'Asia/Tokyo' },
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: ['s1', 's2'],
      periodType: 'MONTH',
      reference: REFERENCE,
    });
    expect(scope.period.timezone.effectiveTimezone).toBe('America/New_York');
    expect(scope.period.timezone.source).toBe('ORGANIZATION');
  });

  it('falls back to the platform timezone only when no org/station timezone exists', async () => {
    const { service } = makeService({
      access: { bypassScope: true, allowedStationIds: null, membershipRole: 'ORG_ADMIN' },
      ownedStations: ['s1'],
      organizationTimezone: null,
    });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MONTH',
      reference: REFERENCE,
    });
    expect(scope.period.timezone.effectiveTimezone).toBe('Europe/Berlin');
    expect(scope.period.timezone.source).toBe('PLATFORM_FALLBACK');
  });
});
