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
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from './security-governance-platform-permission-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';

const targetUserId = '33333333-3333-3333-3333-333333333333';
const sessionId = 'sess-mfa-test';

describe('SecurityGovernance session revoke — real guard HTTP security', () => {
  const refreshTokens = {
    revokeSessionById: jest.fn().mockResolvedValue(true),
    revokeSessionByIdInTransaction: jest.fn().mockResolvedValue(true),
    revokeAllActiveForUser: jest.fn().mockResolvedValue(2),
    revokeAllActiveForUserInTransaction: jest.fn().mockResolvedValue(2),
    findSessionOrganizationId: jest.fn().mockResolvedValue('org-mfa'),
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

  const auditDelivery = {
    persistAuthoritativeAuditIntent: jest.fn().mockResolvedValue('outbox-test-id'),
    attemptImmediateDelivery: jest.fn(async (record: unknown) => {
      await masterAdminAudit.record(record as never);
      return 'DELIVERED';
    }),
    commitAuditIntent: jest.fn(async (record: unknown) => {
      await masterAdminAudit.record(record as never);
      return 'DELIVERED';
    }),
  };

  const prismaMock: { $transaction: jest.Mock } = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock as unknown),
    ),
  };

  const platformPermissions = {
    grantMasterBillingWithMandatoryAudit: jest.fn(),
    revokeMasterBillingWithMandatoryAudit: jest.fn(),
  };

  const revokeOnePath = `/admin/security/users/${targetUserId}/sessions/${sessionId}/revoke`;
  const revokeAllPath = `/admin/security/users/${targetUserId}/sessions/revoke-all`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revoke route requires REVOKE_OTHER_USER_SESSIONS step-up scope metadata', () => {
    const handler = SecurityGovernanceController.prototype.revokeSession;
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, handler)).toBe(
      STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
    );
  });

  describe('MFA enforced — real MasterAdminMfaGuard and StepUpGuard', () => {
    installMfaEnforcedEnvForSuite();

    const sharedProviders = [
      SecurityGovernancePlatformPermissionAuditService,
      SecurityGovernanceSessionAuditService,
      { provide: MasterAdminAuditDeliveryService, useValue: auditDelivery },
      { provide: MasterAdminAuditService, useValue: masterAdminAudit },
      { provide: PrismaService, useValue: prismaMock },
      { provide: PlatformPermissionService, useValue: platformPermissions },
      { provide: SecurityGovernanceService, useValue: governance },
      { provide: RefreshTokenService, useValue: refreshTokens },
      { provide: IamMfaService, useValue: {} },
    ];

    it('denies unauthenticated revoke without session mutation', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: sharedProviders,
      });
      try {
        await request(harness.app.getHttpServer()).post(revokeOnePath).expect(403);
        expect(refreshTokens.revokeSessionByIdInTransaction).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('returns 403 for non-master platform role', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [SecurityGovernanceController],
        providers: [
          ...sharedProviders,
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          Reflector,
          MasterAdminMfaGuard,
          StepUpGuard,
          {
            provide: PrismaService,
            useValue: {
              ...prismaMock,
              userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) },
            },
          },
          { provide: IamMfaStepUpService, useValue: { validateGrant: jest.fn().mockResolvedValue(true) } },
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
          .post(revokeOnePath)
          .set('Authorization', 'Bearer member-token')
          .expect(403);
        expect(refreshTokens.revokeSessionByIdInTransaction).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('returns STEP_UP_REQUIRED when MFA enforced and no token or fresh claims', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: sharedProviders,
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post(revokeOnePath)
          .set('Authorization', 'Bearer master-token')
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
        expect(harness.validateGrant).not.toHaveBeenCalled();
        expect(refreshTokens.revokeSessionByIdInTransaction).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('returns STEP_UP_EXPIRED for invalid step-up token', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: sharedProviders,
      });
      harness.validateGrant.mockResolvedValue(false);
      try {
        const res = await request(harness.app.getHttpServer())
          .post(revokeOnePath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'expired-token')
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.STEP_UP_EXPIRED);
        expect(harness.validateGrant).toHaveBeenCalledTimes(1);
        expect(refreshTokens.revokeSessionByIdInTransaction).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('rejects step-up token when action binding does not match REVOKE_OTHER_USER_SESSIONS', async () => {
      const validateGrant = jest.fn(
        async (_userId: string, token: string, action: string) =>
          token === 'step-up-token-valid' && action === STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
      );
      const moduleRef = await Test.createTestingModule({
        controllers: [SecurityGovernanceController],
        providers: [
          ...sharedProviders,
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          Reflector,
          MasterAdminMfaGuard,
          StepUpGuard,
          {
            provide: PrismaService,
            useValue: {
              ...prismaMock,
              userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) },
            },
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
        .compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      try {
        const res = await request(app.getHttpServer())
          .post(revokeOnePath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(403);
        expect([MFA_ERROR.STEP_UP_REQUIRED, MFA_ERROR.STEP_UP_EXPIRED]).toContain(res.body.code);
        expect(refreshTokens.revokeSessionByIdInTransaction).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('revokes session when valid step-up token is presented', async () => {
      const validateGrant = jest.fn(
        async (_userId: string, token: string, action: string) =>
          token === 'step-up-token-valid' &&
          (action === STEP_UP_ACTION.MASTER_USER_MANAGEMENT ||
            action === STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS),
      );
      const moduleRef = await Test.createTestingModule({
        controllers: [SecurityGovernanceController],
        providers: [
          ...sharedProviders,
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          Reflector,
          MasterAdminMfaGuard,
          StepUpGuard,
          {
            provide: PrismaService,
            useValue: {
              ...prismaMock,
              userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) },
            },
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
        .compile();

      const app = moduleRef.createNestApplication();
      await app.init();
      try {
        await request(app.getHttpServer())
          .post(revokeOnePath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(200);
        expect(validateGrant).toHaveBeenCalledTimes(2);
        expectStepUpValidation(validateGrant, STEP_UP_ACTION.MASTER_USER_MANAGEMENT);
        expectStepUpValidation(validateGrant, STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS);
        expect(refreshTokens.revokeSessionByIdInTransaction).toHaveBeenCalledWith(
          expect.anything(),
          targetUserId,
          sessionId,
        );
        expect(auditDelivery.attemptImmediateDelivery).toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('revoke-all succeeds with fresh MFA session claims without x-step-up-token', async () => {
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
          ...sharedProviders,
          { provide: APP_GUARD, useValue: authGuard },
          Reflector,
          MasterAdminMfaGuard,
          StepUpGuard,
          {
            provide: PrismaService,
            useValue: {
              ...prismaMock,
              userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) },
            },
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
        .compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      try {
        await request(app.getHttpServer())
          .post(revokeAllPath)
          .set('Authorization', 'Bearer master-token')
          .expect(200);
        expect(validateGrant).not.toHaveBeenCalled();
        expect(refreshTokens.revokeAllActiveForUserInTransaction).toHaveBeenCalledWith(
          expect.anything(),
          targetUserId,
        );
      } finally {
        await app.close();
      }
    });
  });
});