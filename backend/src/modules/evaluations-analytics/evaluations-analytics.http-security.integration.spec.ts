import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '@shared/database/prisma.service';
import { EvaluationsAnalyticsController } from './evaluations-analytics.controller';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';
import { EVALUATIONS_ANALYTICS_V2_MODE_ENV } from './evaluations-analytics-feature-flags';

/**
 * Real HTTP guard-pipeline integration: request → (test) auth → OrgScopingGuard
 * → PermissionsGuard → FeatureGuard → controller → scope service →
 * StationAccessService → service → repository. Only the datastore and the JWT
 * decode are simulated; the central security guards run for real.
 */

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

const MEMBERSHIPS: Record<
  string,
  {
    id: string;
    role: string;
    status: string;
    permissions: unknown;
    stationScope: string | null;
    stationIds: unknown;
    fieldAgentAccess: boolean;
    membershipVersion: number;
    organizationRoleId: string | null;
  }
> = {
  'ua|org-a': {
    id: 'm-a',
    role: 'ORG_ADMIN',
    status: 'ACTIVE',
    permissions: {},
    stationScope: 'ALL',
    stationIds: [],
    fieldAgentAccess: false,
    membershipVersion: 1,
    organizationRoleId: null,
  },
  'uw|org-a': {
    id: 'm-w',
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: {},
    stationScope: null,
    stationIds: [],
    fieldAgentAccess: false,
    membershipVersion: 1,
    organizationRoleId: null,
  },
};

const STATIONS = [
  { id: 's-a1', organizationId: 'org-a' },
  { id: 's-a2', organizationId: 'org-a' },
  { id: 's-b1', organizationId: 'org-b' },
];

function makePrisma() {
  return {
    organizationMembership: {
      findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string } }) => {
        return MEMBERSHIPS[`${args.where.userId}|${args.where.organizationId}`] ?? null;
      }),
    },
    organization: {
      findUnique: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
    },
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
    evaluationsEntityReference: {
      count: jest.fn(async (args: { where: { organizationId: string } }) =>
        args.where.organizationId === 'org-a' ? 2 : 0,
      ),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    },
  };
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('EvaluationsAnalyticsController — HTTP security integration', () => {
  let app: INestApplication;
  let originalMode: string | undefined;

  beforeAll(async () => {
    originalMode = process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'on';

    const moduleRef = await Test.createTestingModule({
      controllers: [EvaluationsAnalyticsController],
      providers: [
        { provide: PrismaService, useValue: makePrisma() },
        EvaluationsAnalyticsScopeService,
        EvaluationsAnalyticsService,
        EvaluationsEntityReferenceRepository,
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
      const header = req.headers['x-test-user'];
      if (header && header !== 'null') req.user = JSON.parse(header);
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
    else process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = originalMode;
    await app.close();
  });

  const adminA = { id: 'ua', platformRole: 'USER', membershipRole: 'ORG_ADMIN', organizationId: 'org-a' };
  const workerA = { id: 'uw', platformRole: 'USER', membershipRole: 'WORKER', organizationId: 'org-a' };
  const master = { id: 'um', platformRole: 'MASTER_ADMIN', organizationId: null };
  const base = '/api/v1/organizations';

  it('1. unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary`)
      .expect(401);
  });

  it('2. authenticated wrong organization → 403', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-b/evaluations/analytics/summary`)
      .set(...auth(adminA))
      .expect(403);
  });

  it('3. authenticated missing permission → 403', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary`)
      .set(...auth(workerA))
      .expect(403);
  });

  it('4. correct org + permission → 200 with org-scoped total', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary`)
      .set(...auth(adminA))
      .expect(200);
    expect(res.body.aggregateTotal).toBe(2);
    expect(res.body.scope.organizationId).toBe('org-a');
  });

  it('5. foreign station → 403 (fail closed, no existence leak)', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary?stationIds=s-b1`)
      .set(...auth(adminA))
      .expect(403);
    expect(JSON.stringify(res.body)).not.toContain('org-b');
  });

  it('6. mixed authorized + foreign station list → 403', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary?stationIds=s-a1,s-b1`)
      .set(...auth(adminA))
      .expect(403);
  });

  it('7. foreign entity id filter → 200 but no leak', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/detail?vehicleIds=veh-foreign`)
      .set(...auth(adminA))
      .expect(200);
    expect(res.body.scope.organizationId).toBe('org-a');
  });

  it('8. malformed (oversized) entity id → 400', async () => {
    const huge = 'x'.repeat(500);
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/detail?vehicleIds=${huge}`)
      .set(...auth(adminA))
      .expect(400);
  });

  it('10. org admin own organization → 200', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary`)
      .set(...auth(adminA))
      .expect(200);
  });

  it('12. authorized platform actor with explicit target org → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary`)
      .set(...auth(master))
      .expect(200);
    expect(res.body.scope.organizationId).toBe('org-a');
  });

  it('13. feature disabled → 404', async () => {
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'off';
    try {
      await request(app.getHttpServer())
        .get(`${base}/org-a/evaluations/analytics/summary`)
        .set(...auth(adminA))
        .expect(404);
    } finally {
      process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'on';
    }
  });

  it('14. excessive page size → clamped, 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/detail?pageSize=100000`)
      .set(...auth(adminA))
      .expect(200);
    expect(res.body.pageSize).toBe(100);
  });

  it('15. excessive page number → 400', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/detail?page=999999999999`)
      .set(...auth(adminA))
      .expect(400);
  });

  it('16. unknown query parameter is ignored (platform policy), not forwarded', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/summary?evilField=1&__proto__=x`)
      .set(...auth(adminA))
      .expect(200);
    expect(res.body.scope.organizationId).toBe('org-a');
    expect(res.body.aggregateTotal).toBe(2);
  });
});
