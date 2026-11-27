import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  closeMasterAdminMfaHttpHarness,
  createMasterAdminAuthGuard,
  createMasterAdminMfaHttpHarness,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from './security-governance-platform-permission-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';
import { MasterGlobalIdentityService } from '@modules/users/master-global-identity.service';

describe('SecurityGovernance identity provisioning — HTTP guard security', () => {
  const globalIdentity = {
    provisionGlobalUser: jest.fn().mockResolvedValue({
      user: { id: 'new-user', email: 'new@test.de' },
      onboarding: { identityCreated: true },
    }),
    updateGlobalProfile: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@test.de' }),
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

  const sharedProviders = [
    { provide: MasterGlobalIdentityService, useValue: globalIdentity },
    { provide: SecurityGovernanceService, useValue: governance },
    { provide: SecurityGovernanceSessionAuditService, useValue: {} },
    { provide: SecurityGovernancePlatformPermissionAuditService, useValue: {} },
    { provide: PlatformPermissionService, useValue: {} },
    { provide: RefreshTokenService, useValue: {} },
    { provide: IamMfaService, useValue: {} },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MFA enforced', () => {
    installMfaEnforcedEnvForSuite();

    it('A02 — unauthenticated POST denied', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: SecurityGovernanceController,
        providers: sharedProviders,
      });
      try {
        await request(harness.app.getHttpServer())
          .post('/admin/security/users')
          .send({ email: 'x@test.de', firstName: 'X', lastName: 'Y' })
          .expect(403);
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('A03 — non-master role denied', async () => {
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
            useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f1' }) } },
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
          .post('/admin/security/users')
          .set('Authorization', 'Bearer member-token')
          .send({ email: 'x@test.de', firstName: 'X', lastName: 'Y' })
          .expect(403);
      } finally {
        await app.close();
      }
    });
  });
});