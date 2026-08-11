import { ForbiddenException } from '@nestjs/common';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';
import { resolveEvaluationsAuthorizedStationScope } from './evaluations-analytics-station-scope';

/**
 * E2.3 station scope authority — canonical, feature-flag-independent.
 *
 * The Stations-V2 flag governs rollout only; it can never widen the evaluations
 * authorization boundary. Every case is proven identical with the flag ON and
 * OFF, and an assigned-station member never gains org-wide analytics when the
 * flag is OFF (the E2.2 privilege-escalation regression).
 */

const FLAG_ENV = 'STATIONS_V2_FLAGS_TEST_DEFAULT';
const REFERENCE = new Date('2026-08-10T00:00:00.000Z');
const OWNED_STATIONS = [
  { id: 's-a1', organizationId: 'org-a' },
  { id: 's-a2', organizationId: 'org-a' },
  { id: 's-b1', organizationId: 'org-b' },
];

function makeService(membership: {
  role: string;
  stationScope?: string | null;
  stationIds?: unknown;
} | null) {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(async () =>
        membership
          ? {
              role: membership.role,
              status: 'ACTIVE',
              permissions: {},
              stationScope: membership.stationScope ?? null,
              stationIds: membership.stationIds ?? [],
              fieldAgentAccess: false,
              membershipVersion: 1,
              organizationRoleId: null,
            }
          : null,
      ),
    },
    organization: { findUnique: jest.fn(async () => ({ timezone: 'Europe/Berlin' })) },
    station: {
      findMany: jest.fn(async (args: { where: { organizationId: string; id: { in: string[] } } }) =>
        OWNED_STATIONS.filter(
          (s) => s.organizationId === args.where.organizationId && args.where.id.in.includes(s.id),
        ).map((s) => ({ id: s.id })),
      ),
      findFirst: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
    },
  } as never;
  return new EvaluationsAnalyticsScopeService(prisma);
}

const actor = { id: 'u-a', organizationId: 'org-a', platformRole: 'USER' };

async function scopeFor(
  membership: Parameters<typeof makeService>[0],
  requestedStationIds: readonly string[] | null,
) {
  const service = makeService(membership);
  return service.resolveAuthorizedScope({
    actor,
    orgId: 'org-a',
    requestedStationIds,
    periodType: 'MTD',
    reference: REFERENCE,
  });
}

describe('E2.3 station scope authority is independent of the Stations-V2 flag', () => {
  const original = process.env[FLAG_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[FLAG_ENV];
    else process.env[FLAG_ENV] = original;
  });

  const modes: Array<['ON' | 'OFF', string | undefined]> = [
    ['ON', 'true'],
    ['OFF', 'off'],
  ];

  for (const [label, flag] of modes) {
    describe(`Stations-V2 ${label}`, () => {
      beforeEach(() => {
        if (flag === undefined) delete process.env[FLAG_ENV];
        else process.env[FLAG_ENV] = flag;
      });

      it('assigned WORKER, no station filter → limited to assigned station', async () => {
        const scope = await scopeFor({ role: 'WORKER', stationIds: ['s-a1'] }, null);
        expect(scope.stationIds).toEqual(['s-a1']);
        expect(scope.stationScoped).toBe(true);
      });

      it('assigned WORKER requesting an unassigned org station → DENY', async () => {
        await expect(scopeFor({ role: 'WORKER', stationIds: ['s-a1'] }, ['s-a2'])).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });

      it('SUB_ADMIN assigned [s-a1,s-a2], no filter → both assigned stations', async () => {
        const scope = await scopeFor(
          { role: 'SUB_ADMIN', stationIds: ['s-a1', 's-a2'] },
          null,
        );
        expect(new Set(scope.stationIds ?? [])).toEqual(new Set(['s-a1', 's-a2']));
      });

      it('ORG_ADMIN, no filter → ALL_STATIONS (org-wide)', async () => {
        const scope = await scopeFor({ role: 'ORG_ADMIN', stationScope: 'ALL' }, null);
        expect(scope.stationIds).toBeNull();
      });

      it('cross-tenant station request → DENY', async () => {
        await expect(
          scopeFor({ role: 'ORG_ADMIN', stationScope: 'ALL' }, ['s-b1']),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });
  }

  it('ON/OFF produce identical authorized station population for the same membership', async () => {
    process.env[FLAG_ENV] = 'true';
    const on = await scopeFor({ role: 'WORKER', stationIds: ['s-a1'] }, null);
    process.env[FLAG_ENV] = 'off';
    const off = await scopeFor({ role: 'WORKER', stationIds: ['s-a1'] }, null);
    expect(off.stationIds).toEqual(on.stationIds);
    expect(off.stationScoped).toBe(on.stationScoped);
  });
});

describe('E2.3 canonical resolver role matrix (flag forced ON internally)', () => {
  const org = 'org-a';
  it('MASTER_ADMIN → ALL_STATIONS', () => {
    expect(
      resolveEvaluationsAuthorizedStationScope({
        platformRole: 'MASTER_ADMIN',
        membership: null,
        organizationId: org,
      }),
    ).toEqual({ mode: 'ALL_STATIONS', stationIds: null });
  });

  it('ORG_ADMIN → ALL_STATIONS', () => {
    expect(
      resolveEvaluationsAuthorizedStationScope({
        platformRole: 'USER',
        membership: { role: 'ORG_ADMIN' as never, status: 'ACTIVE' as never, stationScope: 'ALL', stationIds: [] },
        organizationId: org,
      }),
    ).toEqual({ mode: 'ALL_STATIONS', stationIds: null });
  });

  it('WORKER assigned → ASSIGNED_STATIONS', () => {
    expect(
      resolveEvaluationsAuthorizedStationScope({
        platformRole: 'USER',
        membership: { role: 'WORKER' as never, status: 'ACTIVE' as never, stationScope: null, stationIds: ['s-a1'] },
        organizationId: org,
      }),
    ).toEqual({ mode: 'ASSIGNED_STATIONS', stationIds: ['s-a1'] });
  });

  it('inactive / non-member → NO_STATIONS', () => {
    expect(
      resolveEvaluationsAuthorizedStationScope({
        platformRole: 'USER',
        membership: null,
        organizationId: org,
      }),
    ).toEqual({ mode: 'NO_STATIONS', stationIds: [] });
  });
});
