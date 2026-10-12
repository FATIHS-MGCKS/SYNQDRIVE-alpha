import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuditService } from '@modules/activity-log/audit.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { buildMfaClaims } from '@shared/auth/auth-session-claims.types';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import {
  PLATFORM_PRUNE_DISABLED_ACTION,
  PLATFORM_PRUNE_DISABLED_CODE,
} from './platform-prune.errors';

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

function conflictPayload(body: Record<string, unknown>) {
  const nested = body.message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return body;
}

describe('PlatformAdminController — platform prune containment HTTP security', () => {
  let platformAdminService: { pruneMasterData: jest.Mock };
  let stepUpValidate: jest.Mock;
  let prisma: { userMfaFactor: { findFirst: jest.Mock } };

  const route = '/api/v1/admin/prune';
  const confirmBody = { confirm: 'PRUNE_ALL_MASTER_DATA' };
  const originalEnv = process.env;

  const masterAdmin = {
    id: 'ma-1',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    sessionClaims: buildMfaClaims(),
  };
  const tenantUser = { id: 'u-1', platformRole: 'USER', organizationId: 'org-a' };

  beforeAll(() => {
    platformAdminService = { pruneMasterData: jest.fn() };
    stepUpValidate = jest.fn().mockResolvedValue(true);
    prisma = {
      userMfaFactor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }),
      },
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function buildApp(env: Record<string, string | undefined>) {
    process.env = { ...originalEnv, ...env };
    stepUpValidate.mockResolvedValue(true);
    platformAdminService.pruneMasterData.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminController],
      providers: [
        Reflector,
        RolesGuard,
        MasterAdminMfaGuard,
        StepUpGuard,
        {
          provide: IamMfaStepUpService,
          useValue: { validateGrant: stepUpValidate },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { critical: jest.fn(), record: jest.fn() } },
        {
          provide: IamMetricsService,
          useValue: { recordStepUpDenied: jest.fn(), recordCrossTenantDenial: jest.fn() },
        },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    })
      .useMocker((token) => {
        if (token === PlatformAdminService) return platformAdminService;
        if (token === IamMetricsService) {
          return { recordStepUpDenied: jest.fn(), recordCrossTenantDenial: jest.fn() };
        }
        if (token === MasterAdminAuditService) {
          return { recordMfaStepUp: jest.fn() };
        }
        return {};
      })
      .compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.setGlobalPrefix('api/v1');
    nestApp.use(
      (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
        const header = req.headers['x-test-user'];
        if (header && header !== 'null') req.user = JSON.parse(header);
        next();
      },
    );
    await nestApp.init();
    return nestApp;
  }

  function expectPruneDisabled(res: request.Response) {
    const payload = conflictPayload(res.body as Record<string, unknown>);
    expect(payload).toMatchObject({
      code: PLATFORM_PRUNE_DISABLED_CODE,
      action: PLATFORM_PRUNE_DISABLED_ACTION,
    });
  }

  it('anonymous denied (401)', async () => {
    const app = await buildApp({ IAM_MFA_MASTER_ADMIN_ENABLED: 'false' });
    await request(app.getHttpServer()).post(route).send(confirmBody).expect(401);
    expect(platformAdminService.pruneMasterData).not.toHaveBeenCalled();
    await app.close();
  });

  it('tenant denied (403)', async () => {
    const app = await buildApp({ IAM_MFA_MASTER_ADMIN_ENABLED: 'false' });
    await request(app.getHttpServer())
      .post(route)
      .set(...auth(tenantUser))
      .send(confirmBody)
      .expect(403);
    expect(platformAdminService.pruneMasterData).not.toHaveBeenCalled();
    await app.close();
  });

  it('MASTER_ADMIN with MFA flags OFF still receives 409', async () => {
    const app = await buildApp({
      IAM_MFA_MASTER_ADMIN_ENABLED: 'false',
      IAM_MFA_STEP_UP_ENFORCED: 'false',
    });
    const res = await request(app.getHttpServer())
      .post(route)
      .set(...auth(masterAdmin))
      .send(confirmBody)
      .expect(409);
    expectPruneDisabled(res);
    expect(platformAdminService.pruneMasterData).not.toHaveBeenCalled();
    await app.close();
  });

  it('MASTER_ADMIN with MFA ON and valid BREAK_GLASS step-up still receives 409', async () => {
    const app = await buildApp({
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'false',
    });
    const res = await request(app.getHttpServer())
      .post(route)
      .set(...auth(masterAdmin))
      .set('x-step-up-token', 'valid-grant-token')
      .send(confirmBody)
      .expect(409);
    expectPruneDisabled(res);
    expect(platformAdminService.pruneMasterData).not.toHaveBeenCalled();
    await app.close();
  });

  it('confirmation string does not enable prune', async () => {
    const app = await buildApp({ IAM_MFA_MASTER_ADMIN_ENABLED: 'false' });
    const res = await request(app.getHttpServer())
      .post(route)
      .set(...auth(masterAdmin))
      .send(confirmBody)
      .expect(409);
    expectPruneDisabled(res);
    await app.close();
  });

  it('MASTER_ADMIN without step-up when enforced is denied (403) before destructive path', async () => {
    const app = await buildApp({
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'false',
    });
    stepUpValidate.mockResolvedValue(false);
    const noFreshMfa = {
      id: 'ma-1',
      platformRole: UserPlatformRole.MASTER_ADMIN,
    };
    const res = await request(app.getHttpServer())
      .post(route)
      .set(...auth(noFreshMfa))
      .send(confirmBody)
      .expect(403);
    const body = res.body as Record<string, unknown>;
    const nested = body.message;
    const code =
      body.code === MFA_ERROR.STEP_UP_REQUIRED
        ? MFA_ERROR.STEP_UP_REQUIRED
        : nested && typeof nested === 'object' && !Array.isArray(nested)
          ? (nested as Record<string, unknown>).code
          : undefined;
    expect(code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
    expect(platformAdminService.pruneMasterData).not.toHaveBeenCalled();
    await app.close();
  });
});
