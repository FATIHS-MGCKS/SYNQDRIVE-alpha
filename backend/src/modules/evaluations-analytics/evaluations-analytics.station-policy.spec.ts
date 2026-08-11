import { ForbiddenException } from '@nestjs/common';
import { StationAccessService } from '@shared/stations/station-access.service';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';

/**
 * Station access policy authority (EVAL: delegates to central StationAccessService,
 * per docs/architecture/stations-v2-permissions.md).
 *
 * - Stations-V2 OFF: legacy org-wide visibility (StationAccessService bypass);
 *   an evaluations reader sees all stations within their own organization.
 * - Stations-V2 ON: station scope enforced from membership; station-scoped
 *   members are limited to their allowed stations.
 * - In BOTH modes the organization (tenant) boundary is always enforced; the
 *   feature flag can never enable cross-tenant access.
 */

const FLAG_ENV = 'STATIONS_V2_FLAGS_TEST_DEFAULT'; // 'off' disables V2 test defaults

const STATIONS = [
  { id: 's-a1', organizationId: 'org-a' },
  { id: 's-a2', organizationId: 'org-a' },
  { id: 's-b1', organizationId: 'org-b' },
];

function makeStack(membership: {
  role: string;
  stationScope: string | null;
  stationIds: unknown;
}) {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async (args: { where: { organizationId: string } }) => ({
        id: 'm1',
        organizationId: args.where.organizationId,
        role: membership.role,
        status: 'ACTIVE',
        permissions: {},
        stationScope: membership.stationScope,
        stationIds: membership.stationIds,
        fieldAgentAccess: false,
        membershipVersion: 1,
        organizationRoleId: null,
      })),
    },
    organization: { findUnique: jest.fn(async () => ({ timezone: 'Europe/Berlin' })) },
    station: {
      findMany: jest.fn(async (args: { where: { organizationId: string; id: { in: string[] } } }) =>
        STATIONS.filter(
          (s) => s.organizationId === args.where.organizationId && args.where.id.in.includes(s.id),
        ).map((s) => ({ id: s.id })),
      ),
      findFirst: jest.fn(async (args: { where: { id: string; organizationId: string } }) => {
        const found = STATIONS.find(
          (s) => s.id === args.where.id && s.organizationId === args.where.organizationId,
        );
        return found ? { timezone: 'Europe/Berlin' } : null;
      }),
    },
  } as never;
  const stationAccess = new StationAccessService(prisma);
  const scopeService = new EvaluationsAnalyticsScopeService(prisma, stationAccess);
  return { scopeService };
}

const actor = { id: 'u-a', organizationId: 'org-a' };

describe('Evaluations station access policy — Stations-V2 OFF (legacy org-wide)', () => {
  const original = process.env[FLAG_ENV];
  beforeAll(() => {
    process.env[FLAG_ENV] = 'off';
  });
  afterAll(() => {
    if (original === undefined) delete process.env[FLAG_ENV];
    else process.env[FLAG_ENV] = original;
  });

  it('grants org-wide station visibility without narrowing', async () => {
    const { scopeService } = makeStack({ role: 'WORKER', stationScope: null, stationIds: [] });
    const scope = await scopeService.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: new Date('2026-08-10T00:00:00.000Z'),
    });
    expect(scope.stationIds).toBeNull();
    expect(scope.stationScoped).toBe(false);
  });

  it('still denies a foreign-organization station (tenant boundary independent of flag)', async () => {
    const { scopeService } = makeStack({ role: 'ORG_ADMIN', stationScope: 'ALL', stationIds: [] });
    await expect(
      scopeService.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s-b1'],
        periodType: 'MTD',
        reference: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Evaluations station access policy — Stations-V2 ON (scoped)', () => {
  it('limits a station-scoped worker to assigned stations', async () => {
    const { scopeService } = makeStack({
      role: 'WORKER',
      stationScope: null,
      stationIds: ['s-a1'],
    });
    const scope = await scopeService.resolveAuthorizedScope({
      actor,
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'MTD',
      reference: new Date('2026-08-10T00:00:00.000Z'),
    });
    expect(scope.stationIds).toEqual(['s-a1']);
    expect(scope.stationScoped).toBe(true);
  });

  it('denies an org-owned station outside the worker assignment', async () => {
    const { scopeService } = makeStack({
      role: 'WORKER',
      stationScope: null,
      stationIds: ['s-a1'],
    });
    await expect(
      scopeService.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s-a2'],
        periodType: 'MTD',
        reference: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still denies a foreign-organization station', async () => {
    const { scopeService } = makeStack({
      role: 'WORKER',
      stationScope: null,
      stationIds: ['s-a1'],
    });
    await expect(
      scopeService.resolveAuthorizedScope({
        actor,
        orgId: 'org-a',
        requestedStationIds: ['s-b1'],
        periodType: 'MTD',
        reference: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
