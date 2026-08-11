import { ForbiddenException } from '@nestjs/common';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';

const REFERENCE = new Date('2026-08-10T09:00:00.000Z');

interface Membership {
  role: string;
  status?: string;
  stationScope?: string | null;
  stationIds?: unknown;
}

const OWNED_STATIONS = [
  { id: 's1', organizationId: 'org-a' },
  { id: 's2', organizationId: 'org-a' },
  { id: 's-b1', organizationId: 'org-b' },
];

function makeService(opts: {
  membership: Membership | null;
  organizationTimezone?: string | null;
}): { service: EvaluationsAnalyticsScopeService } {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async () =>
        opts.membership
          ? {
              role: opts.membership.role,
              status: opts.membership.status ?? 'ACTIVE',
              permissions: {},
              stationScope: opts.membership.stationScope ?? null,
              stationIds: opts.membership.stationIds ?? [],
              fieldAgentAccess: false,
              membershipVersion: 1,
              organizationRoleId: null,
            }
          : null,
      ),
    },
    organization: {
      findUnique: jest.fn(async () => ({ timezone: opts.organizationTimezone ?? null })),
    },
    station: {
      findMany: jest.fn(async (args: { where: { organizationId: string; id: { in: string[] } } }) =>
        OWNED_STATIONS.filter(
          (s) => s.organizationId === args.where.organizationId && args.where.id.in.includes(s.id),
        ).map((s) => ({ id: s.id })),
      ),
      findFirst: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
    },
  } as never;
  return { service: new EvaluationsAnalyticsScopeService(prisma) };
}

const actor = { id: 'u-a', organizationId: 'org-a', platformRole: 'USER' };
const master = { id: 'u-m', organizationId: null, platformRole: 'MASTER_ADMIN' };

describe('EvaluationsAnalyticsScopeService — canonical station authorization', () => {
  it('ORG_ADMIN with no narrowing → ALL_STATIONS (org-wide, not station-scoped)', async () => {
    const { service } = makeService({ membership: { role: 'ORG_ADMIN', stationScope: 'ALL' } });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: REFERENCE,
    });
    expect(scope.stationIds).toBeNull();
    expect(scope.stationScoped).toBe(false);
  });

  it('assigned WORKER with no narrowing → limited to assigned stations', async () => {
    const { service } = makeService({ membership: { role: 'WORKER', stationIds: ['s1'] } });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: REFERENCE,
    });
    expect(scope.stationIds).toEqual(['s1']);
    expect(scope.stationScoped).toBe(true);
  });

  it('assigned WORKER requesting an unassigned org station → fail closed', async () => {
    const { service } = makeService({ membership: { role: 'WORKER', stationIds: ['s1'] } });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s2'],
        periodType: 'MTD',
        reference: REFERENCE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assigned WORKER requesting mixed assigned + foreign-org station → fail closed', async () => {
    const { service } = makeService({ membership: { role: 'WORKER', stationIds: ['s1'] } });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s1', 's-b1'],
        periodType: 'MTD',
        reference: REFERENCE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non-member (no active membership) → NO_STATIONS empty population', async () => {
    const { service } = makeService({ membership: null });
    const scope = await service.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: REFERENCE,
    });
    expect(scope.stationIds).toEqual([]);
    expect(scope.stationScoped).toBe(true);
  });

  it('MASTER_ADMIN → ALL_STATIONS within the targeted organization', async () => {
    const { service } = makeService({ membership: null });
    const scope = await service.resolveAuthorizedScope({
      actor: master,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: REFERENCE,
    });
    expect(scope.stationIds).toBeNull();
    expect(scope.stationScoped).toBe(false);
  });

  it('ORG_ADMIN requesting a foreign-organization station → fail closed', async () => {
    const { service } = makeService({ membership: { role: 'ORG_ADMIN', stationScope: 'ALL' } });
    await expect(
      service.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s-b1'],
        periodType: 'MTD',
        reference: REFERENCE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('EvaluationsAnalyticsScopeService — timezone authority (regression)', () => {
  it('uses the organization timezone when no single station is scoped', async () => {
    const { service } = makeService({
      membership: { role: 'ORG_ADMIN', stationScope: 'ALL' },
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
});
