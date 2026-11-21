import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MasterBillingDelegateMfaGuard } from '@shared/auth/master-billing-delegate-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_BILLING_PLATFORM_PERMISSION } from '@shared/decorators/require-master-billing.decorator';
import { MasterSubscriptionController } from './master-subscription.controller';
import { BillingSubscriptionAdminService } from './billing-subscription-admin.service';
import { TenantSubscriptionOverviewService } from './tenant-subscription-overview.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';

const DELEGATE_ID = 'billing-delegate-1';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

function createBillingAuthGuard() {
  return {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: Record<string, unknown>;
      };
      const auth = String(req.headers?.authorization ?? '');
      if (auth.startsWith('Bearer master-')) {
        req.user = { id: 'master-1', platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      if (auth.startsWith('Bearer billing-delegate-')) {
        req.user = {
          id: DELEGATE_ID,
          platformRole: UserPlatformRole.USER,
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        };
        return true;
      }
      if (auth.startsWith('Bearer org-admin-')) {
        req.user = {
          id: 'org-admin-1',
          platformRole: UserPlatformRole.USER,
          membershipRole: 'ORG_ADMIN',
          organizationId: 'org-tenant',
          platformPermissions: [],
        };
        return true;
      }
      if (auth.startsWith('Bearer revoked-delegate-')) {
        req.user = {
          id: 'revoked-delegate',
          platformRole: UserPlatformRole.USER,
          platformPermissions: [],
        };
        return true;
      }
      return false;
    },
  };
}

describe('Master billing delegate MFA — HTTP (MasterSubscriptionController)', () => {
  const subscriptionAdmin = {
    createDraft: jest.fn().mockResolvedValue({ created: true }),
    getContract: jest.fn().mockResolvedValue({ orgId: ORG_ID }),
  };
  const subscriptionOverview = { getOverview: jest.fn() };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    platformPermissionService.hasActiveMasterBillingGrant.mockImplementation(
      async (userId: string) => userId === DELEGATE_ID,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const platformPermissionService = {
    hasActiveMasterBillingGrant: jest.fn(async (userId: string) => userId === DELEGATE_ID),
  };

  async function createApp() {
    const validateGrant = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [MasterSubscriptionController],
      providers: [
        { provide: APP_GUARD, useValue: createBillingAuthGuard() },
        Reflector,
        MasterAdminMfaGuard,
        MasterBillingDelegateMfaGuard,
        MasterBillingGuard,
        { provide: PlatformPermissionService, useValue: platformPermissionService },
        { provide: PrismaService, useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) } } },
        { provide: IamMfaStepUpService, useValue: { validateGrant } },
        { provide: BillingSubscriptionAdminService, useValue: subscriptionAdmin },
        { provide: TenantSubscriptionOverviewService, useValue: subscriptionOverview },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => { user?: { platformRole?: string; platformPermissions?: string[] } };
          };
        }) => {
          const user = ctx.switchToHttp().getRequest().user;
          if (user?.platformRole === UserPlatformRole.MASTER_ADMIN) return true;
          return (
            Array.isArray(user?.platformPermissions) &&
            user.platformPermissions.includes(MASTER_BILLING_PLATFORM_PERMISSION)
          );
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, validateGrant };
  }

  it('delegate MFA OFF — POST draft allowed without step-up', async () => {
    delete process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED;
    const { app } = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer billing-delegate-token')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(201);
      expect(subscriptionAdmin.createDraft).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('delegate MFA ON — STEP_UP_REQUIRED; createDraft not called', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app } = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer billing-delegate-token')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'STEP_UP_REQUIRED',
        action: STEP_UP_ACTION.MASTER_SUBSCRIPTION,
      });
      expect(subscriptionAdmin.createDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('delegate MFA ON — valid step-up permits mutation', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app, validateGrant } = await createApp();
    validateGrant.mockResolvedValue(true);
    try {
      await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer billing-delegate-token')
        .set('x-step-up-token', 'grant-valid')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(201);
      expect(validateGrant).toHaveBeenCalledWith(
        DELEGATE_ID,
        'grant-valid',
        STEP_UP_ACTION.MASTER_SUBSCRIPTION,
      );
      expect(subscriptionAdmin.createDraft).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('delegate MFA ON — invalid step-up denied', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app, validateGrant } = await createApp();
    validateGrant.mockResolvedValue(false);
    try {
      const res = await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer billing-delegate-token')
        .set('x-step-up-token', 'expired')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'STEP_UP_EXPIRED' });
      expect(subscriptionAdmin.createDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('ORG_ADMIN without platform permission denied by MasterBillingGuard', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app } = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer org-admin-token')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(403);
      expect(subscriptionAdmin.createDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('revoked master-billing JWT denied before MFA', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app } = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/admin/billing/organizations/${ORG_ID}/subscription/draft`)
        .set('Authorization', 'Bearer revoked-delegate-token')
        .send({ currency: 'EUR', lockVersion: 1 })
        .expect(403);
      expect(subscriptionAdmin.createDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('GET contract readable for delegate without step-up when MFA on', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const { app, validateGrant } = await createApp();
    try {
      await request(app.getHttpServer())
        .get(`/admin/billing/organizations/${ORG_ID}/subscription`)
        .set('Authorization', 'Bearer billing-delegate-token')
        .expect(200);
      expect(validateGrant).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});