import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION, type StepUpActionCode } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import {
  MFA_HTTP_ORG,
  closeMasterAdminMfaHttpHarness,
  createMasterAdminAuthGuard,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

const providers = (deps: {
  insights: object;
  repo: object;
  policy: object;
  trigger: object;
}) => [
  { provide: BusinessInsightsService, useValue: deps.insights },
  { provide: DashboardInsightsRepository, useValue: deps.repo },
  { provide: TenantInsightPolicyService, useValue: deps.policy },
  { provide: BusinessInsightsTriggerService, useValue: deps.trigger },
];

describe('InternalBusinessInsightsController — MFA HTTP security', () => {
  const insights = {
    runForAllActiveOrganizations: jest.fn().mockResolvedValue([{ published: 1 }]),
    runForOrganization: jest.fn().mockResolvedValue({ published: 1, orgId: MFA_HTTP_ORG }),
  };
  const repo = {};
  const policy = { updatePolicy: jest.fn().mockResolvedValue({ orgId: MFA_HTTP_ORG }) };
  const trigger = { requestDebouncedRerun: jest.fn().mockResolvedValue(undefined) };

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

  describe('MFA disabled (default env)', () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      savedEnv = process.env;
      process.env = { ...savedEnv };
      delete process.env.IAM_MFA_MASTER_ADMIN_ENABLED;
    });

    afterEach(() => {
      process.env = savedEnv;
    });

    it('allows run-all without step-up', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [InternalBusinessInsightsController],
        providers: [
          ...providers({ insights, repo, policy, trigger }),
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          Reflector,
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
      try {
        await request(app.getHttpServer())
          .post('/admin/business-insights/run-all')
          .set('Authorization', 'Bearer master-token')
          .expect(201);
      } finally {
        await app.close();
      }
    });
  });

  describe('HTTP — real MasterAdminMfaGuard + route metadata', () => {
    installMfaEnforcedEnvForSuite();

    const cases: Array<{
      name: string;
      method: 'post' | 'patch';
      path: string;
      expectedAction: StepUpActionCode;
      body?: object;
    }> = [
      {
        name: 'run-all',
        method: 'post',
        path: '/admin/business-insights/run-all',
        expectedAction: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
      },
      {
        name: 'run/:orgId',
        method: 'post',
        path: `/admin/business-insights/run/${MFA_HTTP_ORG}`,
        expectedAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
      },
      {
        name: 'trigger/:orgId',
        method: 'post',
        path: `/admin/business-insights/trigger/${MFA_HTTP_ORG}`,
        expectedAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
      },
      {
        name: 'patch policy/:orgId',
        method: 'patch',
        path: `/admin/business-insights/policy/${MFA_HTTP_ORG}`,
        expectedAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
        body: { enabled: true },
      },
    ];

    it.each(cases)(
      '$name — STEP_UP_REQUIRED without step-up (action=$expectedAction)',
      async ({ method, path, expectedAction }) => {
        const harness = await createMasterAdminMfaHttpHarness({
          controller: InternalBusinessInsightsController,
          providers: providers({ insights, repo, policy, trigger }),
        });
        try {
          const res = await request(harness.app.getHttpServer())
            [method](path)
            .set('Authorization', 'Bearer master-token')
            .expect(403);

          expect(res.body).toMatchObject({
            code: 'STEP_UP_REQUIRED',
            action: expectedAction,
          });
          expect(harness.validateGrant).not.toHaveBeenCalled();
        } finally {
          await closeMasterAdminMfaHttpHarness(harness);
        }
      },
    );

    it.each(cases)(
      '$name — STEP_UP_EXPIRED on invalid token (action=$expectedAction)',
      async ({ method, path, expectedAction, body }) => {
        const harness = await createMasterAdminMfaHttpHarness({
          controller: InternalBusinessInsightsController,
          providers: providers({ insights, repo, policy, trigger }),
        });
        harness.validateGrant.mockResolvedValue(false);
        try {
          const res = await request(harness.app.getHttpServer())
            [method](path)
            .set('Authorization', 'Bearer master-token')
            .set('x-step-up-token', 'expired-token')
            .send(body ?? {})
            .expect(403);

          expect(res.body).toMatchObject({
            code: 'STEP_UP_EXPIRED',
            action: expectedAction,
          });
          expectStepUpValidation(harness.validateGrant, expectedAction, 'expired-token');
        } finally {
          await closeMasterAdminMfaHttpHarness(harness);
        }
      },
    );

    it.each(cases)(
      '$name — accepts valid step-up (action=$expectedAction)',
      async ({ method, path, expectedAction, body }) => {
        const harness = await createMasterAdminMfaHttpHarness({
          controller: InternalBusinessInsightsController,
          providers: providers({ insights, repo, policy, trigger }),
        });
        harness.validateGrant.mockResolvedValue(true);
        try {
          await request(harness.app.getHttpServer())
            [method](path)
            .set('Authorization', 'Bearer master-token')
            .set('x-step-up-token', 'step-up-token-valid')
            .send(body ?? {})
            .expect((method === 'post' ? 201 : 200) as number);

          expectStepUpValidation(harness.validateGrant, expectedAction, 'step-up-token-valid');
        } finally {
          await closeMasterAdminMfaHttpHarness(harness);
        }
      },
    );

    it('rejects non–MASTER_ADMIN on run-all', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: InternalBusinessInsightsController,
        providers: providers({ insights, repo, policy, trigger }),
      });
      try {
        await request(harness.app.getHttpServer())
          .post('/admin/business-insights/run-all')
          .set('Authorization', 'Bearer member-token')
          .expect(403);
        expect(insights.runForAllActiveOrganizations).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});