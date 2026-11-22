import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrganizationOffboardingJobStatus, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrganizationOffboardingController } from './organization-offboarding.controller';
import { OrganizationOffboardingService } from './organization-offboarding.service';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('Organization offboarding — HTTP security (P6D2)', () => {
  let app: INestApplication;
  const orgId = 'org-a';
  const master = { id: 'ma-1', platformRole: UserPlatformRole.MASTER_ADMIN };
  const tenant = { id: 'u-1', platformRole: UserPlatformRole.USER, organizationId: orgId };

  const offboarding = {
    getPreflight: jest.fn(),
    getLatestJob: jest.fn(),
    prepare: jest.fn(),
  };

  let mfaEnforced = false;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationOffboardingController],
      providers: [{ provide: OrganizationOffboardingService, useValue: offboarding }],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          return req.user?.platformRole === UserPlatformRole.MASTER_ADMIN;
        },
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({
        canActivate: () => !mfaEnforced,
      })
      .overrideProvider(APP_GUARD)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: { headers: Record<string, string | undefined>; user?: unknown }, _res: unknown, next: () => void) => {
      const raw = req.headers['x-test-user'];
      if (raw) {
        try {
          req.user = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mfaEnforced = false;
    offboarding.getPreflight.mockResolvedValue({
      organizationId: orgId,
      hardBlockers: [],
      reviewRequired: [],
      warnings: [],
    });
  });

  it('A — MASTER_ADMIN authorized preflight', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/organizations/${orgId}/offboarding/preflight`)
      .set(...auth(master));
    expect(res.status).toBe(200);
    expect(offboarding.getPreflight).toHaveBeenCalledWith(orgId);
  });

  it('B — tenant denied', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/organizations/${orgId}/offboarding/preflight`)
      .set(...auth(tenant));
    expect(res.status).toBe(403);
  });

  it('C — MFA enforced when guard enabled', async () => {
    mfaEnforced = true;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/organizations/${orgId}/offboarding/preflight`)
      .set(...auth(master));
    expect(res.status).toBe(403);
  });

  it('E — prepare delegates to service', async () => {
    offboarding.prepare.mockResolvedValue({
      jobId: 'job-1',
      status: OrganizationOffboardingJobStatus.PREPARED,
      idempotentReplay: false,
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${orgId}/offboarding/prepare`)
      .set(...auth(master))
      .send({ idempotencyKey: 'idem-1' });
    expect(res.status).toBe(201);
    expect(offboarding.prepare).toHaveBeenCalledWith(orgId, { idempotencyKey: 'idem-1' }, master.id);
  });
});