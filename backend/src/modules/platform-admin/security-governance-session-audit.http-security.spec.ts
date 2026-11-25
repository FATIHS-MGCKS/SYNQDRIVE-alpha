import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminPrivilegedAuditInterceptor } from '@shared/interceptors/master-admin-privileged-audit.interceptor';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from './security-governance-platform-permission-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';

describe('SecurityGovernance session revocation audit — HTTP', () => {
  const targetUserId = '11111111-1111-1111-1111-111111111111';
  const sessionId = 'sess-abc';

  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  const refreshTokens = {
    revokeSessionById: jest.fn(),
    revokeAllActiveForUser: jest.fn(),
    findSessionOrganizationId: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    refreshTokens.findSessionOrganizationId.mockResolvedValue('org-target');
    refreshTokens.revokeSessionById.mockResolvedValue(true);
    refreshTokens.revokeAllActiveForUser.mockResolvedValue(2);
  });

  const auditDelivery = {
    scheduleDelivery: jest.fn((record: unknown) => {
      void masterAdminAudit.record(record as never);
    }),
  };

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [SecurityGovernanceController],
      providers: [
        SecurityGovernancePlatformPermissionAuditService,
        SecurityGovernanceSessionAuditService,
        {
          provide: PlatformPermissionService,
          useValue: {
            grantMasterBillingWithMandatoryAudit: jest.fn(),
            revokeMasterBillingWithMandatoryAudit: jest.fn(),
          },
        },
        { provide: MasterAdminAuditDeliveryService, useValue: auditDelivery },
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: RefreshTokenService, useValue: refreshTokens },
        { provide: SecurityGovernanceService, useValue: governance },
        { provide: IamMfaService, useValue: { resetUserMfa: jest.fn() } },
        MasterAdminPrivilegedAuditInterceptor,
        GlobalExceptionFilter,
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    return app;
  }

  it('records semantic audit on successful single session revoke without generic HTTP audit', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/security/users/${targetUserId}/sessions/${sessionId}/revoke`)
        .set('Authorization', 'Bearer master-token')
        .expect(200);
      expect(res.body).toEqual({ revoked: true });
      expect(refreshTokens.revokeSessionById).toHaveBeenCalledWith(targetUserId, sessionId);
      expect(refreshTokens.findSessionOrganizationId).toHaveBeenCalledWith(
        targetUserId,
        sessionId,
      );
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
          targetOrganizationId: 'org-target',
          metadata: expect.objectContaining({ outcome: 'SUCCESS', sessionId }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('revokes session before org lookup and succeeds when org lookup fails', async () => {
    const callOrder: string[] = [];
    refreshTokens.revokeSessionById.mockImplementation(async () => {
      callOrder.push('revoke');
      return true;
    });
    refreshTokens.findSessionOrganizationId.mockImplementation(async () => {
      callOrder.push('findOrg');
      throw new Error('db_read_failed');
    });
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/security/users/${targetUserId}/sessions/${sessionId}/revoke`)
        .set('Authorization', 'Bearer master-token')
        .expect(200);
      expect(res.body).toEqual({ revoked: true });
      expect(callOrder).toEqual(['revoke', 'findOrg']);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
          targetOrganizationId: null,
          metadata: expect.objectContaining({ outcome: 'SUCCESS' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records NO_OP outcome when session revoke finds no row', async () => {
    refreshTokens.revokeSessionById.mockResolvedValue(false);
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/security/users/${targetUserId}/sessions/${sessionId}/revoke`)
        .set('Authorization', 'Bearer master-token')
        .expect(200);
      expect(res.body).toEqual({ revoked: false });
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
          metadata: expect.objectContaining({ outcome: 'NO_OP' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records revoke-all with revoked session count', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/security/users/${targetUserId}/sessions/revoke-all`)
        .set('Authorization', 'Bearer master-token')
        .expect(200);
      expect(res.body).toEqual({ revoked: true });
      expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(targetUserId);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
          metadata: expect.objectContaining({ revokedSessionCount: 2 }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records unauthorized attempt via privileged failure audit only', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/security/users/${targetUserId}/sessions/${sessionId}/revoke`)
        .set('Authorization', 'Bearer member-token')
        .expect(403);
      expect(refreshTokens.revokeSessionById).not.toHaveBeenCalled();
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        }),
      );
    } finally {
      await app.close();
    }
  });
});