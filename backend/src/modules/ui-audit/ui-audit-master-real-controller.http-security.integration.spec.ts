import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformAdminController } from '@modules/platform-admin/platform-admin.controller';
import { PlatformDashboardService } from '@modules/platform-admin/platform-dashboard.service';
import { PlatformConnectivitySummaryService } from '@modules/platform-admin/platform-dashboard.service';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UiAuditWriteDenyGuard } from './ui-audit-write-deny.guard';
import { UiAuditSessionEnforcementGuard } from './ui-audit-session-enforcement.guard';

describe('Master UI audit — real PlatformAdminController HTTP', () => {
  let app: INestApplication;
  let tokenMasterAudit: string;
  const priorJwt = process.env.JWT_SECRET;

  const dashboardSpy = jest.fn().mockResolvedValue({
    organizationsAttention: [{ organizationId: 'org-secret', companyName: 'Acme GmbH' }],
    support: { newest: [{ subject: 'Billing dispute', reporterEmail: 'pii@example.com' }] },
  });

  const connectivityPayload = {
    generatedAt: new Date().toISOString(),
    dimoLinkedVehicles: 42,
    freshness: { live: 10, standby: 5, signal_delayed: 0, offline: 2, no_signal: 0 },
    platform: {
      dimoTotal: 50,
      dimoConnected: 45,
      dimoDisconnected: 5,
      pollErrorRatePercent: 0.1,
      tokenHealthStatus: 'healthy',
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-master-real' });
    harness.platformPermissions.resolveJwtPermissions.mockResolvedValue(['ui-audit-master']);

    tokenMasterAudit = (
      await harness.service.issueTokenPair(
        {
          id: 'master-audit',
          email: 'master-audit@test.example',
          name: 'Master Audit',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        },
        null,
      )
    ).accessToken;

    const prisma = {
      ...harness.prisma,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 1,
        }),
      },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminController],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        MasterAdminMfaGuard,
        UiAuditWriteDenyGuard,
        UiAuditSessionEnforcementGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PlatformPermissionService,
          useValue: harness.platformPermissions,
        },
        {
          provide: PlatformDashboardService,
          useValue: { getOperationalDashboard: dashboardSpy },
        },
        {
          provide: PlatformConnectivitySummaryService,
          useValue: { getPlatformSummary: jest.fn().mockResolvedValue(connectivityPayload) },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: UiAuditSessionEnforcementGuard },
        { provide: APP_GUARD, useClass: UiAuditWriteDenyGuard },
      ],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (priorJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwt;
  });

  it('blocks audit identity on dashboard/operational before service invocation', async () => {
    dashboardSpy.mockClear();
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard/operational')
      .set('Authorization', `Bearer ${tokenMasterAudit}`)
      .expect(403);
    expect(dashboardSpy).not.toHaveBeenCalled();
  });

  it('allows connectivity/platform-summary with aggregate-only payload', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/connectivity/platform-summary')
      .set('Authorization', `Bearer ${tokenMasterAudit}`)
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('organizationsAttention');
    expect(JSON.stringify(body)).not.toMatch(/@/);
    expect(body.dimoLinkedVehicles).toBe(42);
  });
});