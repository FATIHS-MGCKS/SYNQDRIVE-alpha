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
import { EvaluationsRecommendationsController } from './evaluations-recommendations.controller';
import { EvaluationsRecommendationsService } from './evaluations-recommendations.service';
import { EvaluationsAnalyticsScopeService } from '../evaluations-analytics-scope.service';
import { EVALUATIONS_ANALYTICS_V2_MODE_ENV } from '../evaluations-analytics-feature-flags';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

const MEMBERSHIPS: Record<string, { id: string; role: string; status: string; permissions: unknown; stationScope: string | null; stationIds: unknown; fieldAgentAccess: boolean; membershipVersion: number; organizationRoleId: string | null }> = {
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
  { id: 's-b1', organizationId: 'org-b' },
];

function makePrisma() {
  return {
    organizationMembership: {
      findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string } }) =>
        MEMBERSHIPS[`${args.where.userId}|${args.where.organizationId}`] ?? null,
      ),
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
  };
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('EvaluationsRecommendationsController — HTTP security integration', () => {
  let app: INestApplication;
  let originalMode: string | undefined;
  const mockResponse = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-02-15T00:00:00.000Z',
    calculationVersion: 'recommendations-e7-v1',
    requestPeriod: {},
    scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
    status: 'AVAILABLE',
    reason: null,
    recommendations: [],
    emptyState: 'NO_ACTION_NEEDED',
  };

  beforeAll(async () => {
    originalMode = process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'on';

    const moduleRef = await Test.createTestingModule({
      controllers: [EvaluationsRecommendationsController],
      providers: [
        { provide: PrismaService, useValue: makePrisma() },
        EvaluationsAnalyticsScopeService,
        {
          provide: EvaluationsRecommendationsService,
          useValue: {
            getRecommendations: jest.fn().mockResolvedValue(mockResponse),
          },
        },
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
  const base = '/api/v1/organizations';

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/insights/recommendations`)
      .expect(401);
  });

  it('rejects cross-org access', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-b/evaluations/analytics/insights/recommendations`)
      .set(...auth(adminA))
      .expect(403);
  });

  it('rejects missing permission', async () => {
    await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/insights/recommendations`)
      .set(...auth(workerA))
      .expect(403);
  });

  it('allows authorized org admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/insights/recommendations`)
      .set(...auth(adminA))
      .expect(200);
    expect(res.body.scope.organizationId).toBe('org-a');
    expect(res.body.calculationVersion).toBe('recommendations-e7-v1');
  });

  it('fail-closes foreign station without leak', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/org-a/evaluations/analytics/insights/recommendations?stationIds=s-b1`)
      .set(...auth(adminA))
      .expect(403);
    expect(JSON.stringify(res.body)).not.toContain('org-b');
  });

  it('returns 404 when feature disabled', async () => {
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'off';
    try {
      await request(app.getHttpServer())
        .get(`${base}/org-a/evaluations/analytics/insights/recommendations`)
        .set(...auth(adminA))
        .expect(404);
    } finally {
      process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'on';
    }
  });
});
