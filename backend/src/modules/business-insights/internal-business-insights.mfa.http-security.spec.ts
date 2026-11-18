import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const MASTER = 'master-admin-1';

describe('InternalBusinessInsightsController — MFA HTTP security', () => {
  const insights = {
    runForAllActiveOrganizations: jest.fn().mockResolvedValue([{ published: 1 }]),
    runForOrganization: jest.fn().mockResolvedValue({ published: 1, orgId: ORG }),
  };
  const repo = {};
  const policy = { updatePolicy: jest.fn().mockResolvedValue({ orgId: ORG }) };
  const trigger = { requestDebouncedRerun: jest.fn().mockResolvedValue(undefined) };

  const authGuard = {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole };
      };
      if (String(req.headers?.authorization ?? '').startsWith('Bearer master-')) {
        req.user = { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      return false;
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('assigns expected step-up actions to privileged mutations', () => {
    const proto = InternalBusinessInsightsController.prototype;
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, proto.runAll)).toBe(
      STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
    );
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, proto.runForOrg)).toBe(
      STEP_UP_ACTION.MASTER_ORGANIZATION,
    );
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, proto.triggerDebouncedRerun)).toBe(
      STEP_UP_ACTION.MASTER_ORGANIZATION,
    );
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, proto.updatePolicy)).toBe(
      STEP_UP_ACTION.MASTER_ORGANIZATION,
    );
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, proto.getPolicy)).toBeUndefined();
  });

  it('allows run-all when MFA flags are off (default)', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.IAM_MFA_MASTER_ADMIN_ENABLED;

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalBusinessInsightsController],
      providers: [
        { provide: BusinessInsightsService, useValue: insights },
        { provide: DashboardInsightsRepository, useValue: repo },
        { provide: TenantInsightPolicyService, useValue: policy },
        { provide: BusinessInsightsTriggerService, useValue: trigger },
        { provide: APP_GUARD, useValue: authGuard },
        MasterAdminMfaGuard,
        { provide: PrismaService, useValue: { userMfaFactor: { findFirst: jest.fn() } } },
        { provide: IamMfaStepUpService, useValue: { validateGrant: jest.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post('/admin/business-insights/run-all')
      .set('Authorization', 'Bearer master-token')
      .expect(201);

    process.env = originalEnv;
    await app.close();
  });

  it('rejects non–MASTER_ADMIN on run-all', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalBusinessInsightsController],
      providers: [
        { provide: BusinessInsightsService, useValue: insights },
        { provide: DashboardInsightsRepository, useValue: repo },
        { provide: TenantInsightPolicyService, useValue: policy },
        { provide: BusinessInsightsTriggerService, useValue: trigger },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post('/admin/business-insights/run-all')
      .expect(403);

    await app.close();
  });

  it('real MasterAdminMfaGuard denies run-all POST without step-up when enforced', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    };

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS),
    };
    const prisma = {
      userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'mfa-1' }) },
    };
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) };
    const guard = new MasterAdminMfaGuard(
      reflector as never,
      prisma as unknown as PrismaService,
      stepUp as unknown as IamMfaStepUpService,
    );

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN },
          headers: {},
        }),
      }),
    };

    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      response: { code: 'STEP_UP_REQUIRED' },
    });

    process.env = originalEnv;
  });
});