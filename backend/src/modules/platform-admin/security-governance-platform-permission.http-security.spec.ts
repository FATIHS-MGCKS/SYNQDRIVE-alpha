import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION, MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import {
  MFA_HTTP_MASTER,
  closeMasterAdminMfaHttpHarness,
  createMasterAdminAuthGuard,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { buildMfaClaims } from '@shared/auth/auth-session-claims.types';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from './security-governance-platform-permission-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';

const targetUserId = '22222222-2222-2222-2222-222222222222';

function createBillingDelegateAuthGuard() {
  return {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole; platformPermissions?: string[] };
      };
      if (req.headers?.authorization === 'Bearer billing-delegate') {
        req.user = {
          id: 'billing-delegate-1',
          platformRole: UserPlatformRole.USER,
          platformPermissions: ['master-billing'],
        };
        return true;
      }
      return createMasterAdminAuthGuard().canActivate(ctx);
    },
  };
}

describe('SecurityGovernance — master-billing platform permission HTTP security', () => {
  const platformPermissions = {
    grantMasterBilling: jest.fn().mockResolvedValue({
      granted: true,
      idempotent: false,
      grantId: 'grant-1',
    }),
    revokeMasterBilling: jest.fn().mockResolvedValue({
      revoked: true,
      idempotent: false,
      grantId: 'grant-1',
    }),
  };

  const governance = {
    getAttentionSummary: jest.fn(),
    listUsers: jest.fn(),
    getUserDetail: jest.fn(),
    listUserSessions: jest.fn(),
    listPlatformRoles: jest.fn(),
    listOrgRoles: jest.fn(),
    getRoleDetail: jest.fn(),
  };

  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grant route requires MASTER_USER_MANAGEMENT master-admin MFA only (no duplicate StepUpGuard scope)', () => {
    const grant = SecurityGovernanceController.prototype.grantMasterBilling;
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, grant)).toBe(
      STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
    );
  });

  describe('MFA enforced — single step-up validation per grant', () => {
    installMfaEnforcedEnvForSuite();

    const grantPath = `/admin/security/users/${targetUserId}/platform-permissions/master-billing/grant`;
    const revokePath = `/admin/security/users/${targetUserId}/platform-permissions/master-billing/revoke`;

    async function buildHarness(validateGrant = jest.fn().mockResolvedValue(true)) {
      const moduleRef = await Test.createTestingModule({
        controllers: [SecurityGovernanceController],
        providers: [
          SecurityGovernancePlatformPermissionAuditService,
          SecurityGovernanceSessionAuditService,
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: PlatformPermissionService, useValue: platformPermissions },
          { provide: SecurityGovernanceService, useValue: governance },
          { provide: RefreshTokenService, useValue: {} },
          { provide: IamMfaService, useValue: {} },
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          Reflector,
          MasterAdminMfaGuard,
          {
            provide: PrismaService,
            useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) } },
          },
          { provide: IamMfaStepUpService, useValue: { validateGrant } },
        ],
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(StepUpGuard)
      .useValue({ canActivate: () => true })
      .compile();

      const app = moduleRef.createNestApplication();
      await app.init();
      return { app, validateGrant };
    }

    it('grant succeeds with x-step-up-token and validates step-up exactly once', async () => {
      const validateGrant = jest.fn().mockResolvedValue(true);
      const { app } = await buildHarness(validateGrant);
      try {
        await request(app.getHttpServer())
          .post(grantPath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(200);
        expect(validateGrant).toHaveBeenCalledTimes(1);
        expectStepUpValidation(validateGrant, STEP_UP_ACTION.MASTER_USER_MANAGEMENT);
        expect(platformPermissions.grantMasterBilling).toHaveBeenCalledWith(
          targetUserId,
          MFA_HTTP_MASTER,
        );
      } finally {
        await app.close();
      }
    });

    it('revoke succeeds with x-step-up-token without second consumption on same request', async () => {
      const validateGrant = jest.fn().mockResolvedValue(true);
      const { app } = await buildHarness(validateGrant);
      try {
        await request(app.getHttpServer())
          .post(revokePath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(200);
        expect(validateGrant).toHaveBeenCalledTimes(1);
        expect(platformPermissions.revokeMasterBilling).toHaveBeenCalledWith(
          targetUserId,
          MFA_HTTP_MASTER,
        );
      } finally {
        await app.close();
      }
    });

    it('returns STEP_UP_REQUIRED when MFA enforced and no token or fresh claims', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: [
          SecurityGovernancePlatformPermissionAuditService,
          SecurityGovernanceSessionAuditService,
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: PlatformPermissionService, useValue: platformPermissions },
          { provide: SecurityGovernanceService, useValue: governance },
          { provide: RefreshTokenService, useValue: {} },
          { provide: IamMfaService, useValue: {} },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post(grantPath)
          .set('Authorization', 'Bearer master-token')
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
        expect(harness.validateGrant).not.toHaveBeenCalled();
        expect(platformPermissions.grantMasterBilling).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('returns STEP_UP_EXPIRED for invalid step-up token', async () => {
      const validateGrant = jest.fn().mockResolvedValue(false);
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: [
          SecurityGovernancePlatformPermissionAuditService,
          SecurityGovernanceSessionAuditService,
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: PlatformPermissionService, useValue: platformPermissions },
          { provide: SecurityGovernanceService, useValue: governance },
          { provide: RefreshTokenService, useValue: {} },
          { provide: IamMfaService, useValue: {} },
        ],
      });
      harness.validateGrant.mockResolvedValue(false);
      try {
        const res = await request(harness.app.getHttpServer())
          .post(grantPath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'expired-token')
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.STEP_UP_EXPIRED);
        expect(harness.validateGrant).toHaveBeenCalledTimes(1);
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('allows grant when fresh MFA session claims present without x-step-up-token', async () => {
      const authGuard = {
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = {
            id: MFA_HTTP_MASTER,
            platformRole: UserPlatformRole.MASTER_ADMIN,
            sessionClaims: buildMfaClaims(),
          };
          return true;
        },
      };
      const validateGrant = jest.fn();
      const moduleRef = await Test.createTestingModule({
        controllers: [SecurityGovernanceController],
        providers: [
          SecurityGovernancePlatformPermissionAuditService,
          SecurityGovernanceSessionAuditService,
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: PlatformPermissionService, useValue: platformPermissions },
          { provide: SecurityGovernanceService, useValue: governance },
          { provide: RefreshTokenService, useValue: {} },
          { provide: IamMfaService, useValue: {} },
          { provide: APP_GUARD, useValue: authGuard },
          Reflector,
          MasterAdminMfaGuard,
          {
            provide: PrismaService,
            useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) } },
          },
          { provide: IamMfaStepUpService, useValue: { validateGrant } },
        ],
      })
        .overrideGuard(RolesGuard)
        .useValue({
          canActivate: (ctx: {
            switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
          }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
        })
        .overrideGuard(StepUpGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      try {
        await request(app.getHttpServer())
          .post(grantPath)
          .set('Authorization', 'Bearer master-token')
          .expect(200);
        expect(validateGrant).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  it('billing delegate cannot grant master-billing', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityGovernanceController],
      providers: [
        SecurityGovernancePlatformPermissionAuditService,
        SecurityGovernanceSessionAuditService,
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: PlatformPermissionService, useValue: platformPermissions },
        { provide: SecurityGovernanceService, useValue: governance },
        { provide: RefreshTokenService, useValue: {} },
        { provide: IamMfaService, useValue: {} },
        { provide: APP_GUARD, useValue: createBillingDelegateAuthGuard() },
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
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StepUpGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer())
        .post(
          `/admin/security/users/${targetUserId}/platform-permissions/master-billing/grant`,
        )
        .set('Authorization', 'Bearer billing-delegate')
        .expect(403);
      expect(platformPermissions.grantMasterBilling).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('records audit metadata on grant', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityGovernanceController],
      providers: [
        SecurityGovernancePlatformPermissionAuditService,
        SecurityGovernanceSessionAuditService,
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: PlatformPermissionService, useValue: platformPermissions },
        { provide: SecurityGovernanceService, useValue: governance },
        { provide: RefreshTokenService, useValue: {} },
        { provide: IamMfaService, useValue: {} },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StepUpGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer())
        .post(
          `/admin/security/users/${targetUserId}/platform-permissions/master-billing/grant`,
        )
        .set('Authorization', 'Bearer master-token')
        .expect(200);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            domain: 'platform_permission',
            operation: 'GRANT_MASTER_BILLING',
            targetUserId,
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});