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
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';
import { InternalBusinessInsightsAdminAuditService } from './internal-business-insights-admin-audit.service';

describe('InternalBusinessInsightsController — semantic admin audit HTTP', () => {
  const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  const insights = {
    runForAllActiveOrganizations: jest.fn(),
    runForOrganization: jest.fn(),
  };
  const repo = {};
  const policy = { updatePolicy: jest.fn() };
  const trigger = { requestDebouncedRerun: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    insights.runForAllActiveOrganizations.mockResolvedValue([
      { orgId: 'o1', published: 2 },
      { orgId: 'o2', published: 0 },
    ]);
    insights.runForOrganization.mockResolvedValue({ runId: 'run-1', published: 3 });
    policy.updatePolicy.mockResolvedValue({ enabled: true, refreshIntervalMin: 30 });
    trigger.requestDebouncedRerun.mockResolvedValue(undefined);
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalBusinessInsightsController],
      providers: [
        InternalBusinessInsightsAdminAuditService,
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: BusinessInsightsService, useValue: insights },
        { provide: DashboardInsightsRepository, useValue: repo },
        { provide: TenantInsightPolicyService, useValue: policy },
        { provide: BusinessInsightsTriggerService, useValue: trigger },
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

  it('records run-all semantic audit with PARTIAL outcome and no generic success audit', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/business-insights/run-all')
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(res.body.organizationCount).toBe(2);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ALL,
          metadata: expect.objectContaining({ outcome: 'PARTIAL', totalPublished: 2 }),
        }),
      );
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) => c[0]?.auditAction === MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('records run-org semantic audit after execution', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/business-insights/run/${orgId}`)
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(res.body.published).toBe(3);
      expect(insights.runForOrganization).toHaveBeenCalled();
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ORG,
          targetOrganizationId: orgId,
          metadata: expect.objectContaining({ outcome: 'EXECUTED', publishedCount: 3 }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records QUEUED semantic audit for debounced trigger without COMPLETED outcome', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/business-insights/trigger/${orgId}`)
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(res.body.status).toBe('queued');
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_TRIGGER_QUEUED,
          metadata: expect.objectContaining({ outcome: 'QUEUED' }),
        }),
      );
      expect(
        JSON.stringify(masterAdminAudit.record.mock.calls),
      ).not.toMatch(/COMPLETED/);
    } finally {
      await app.close();
    }
  });

  it('records policy update with sanitized field names only', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/business-insights/policy/${orgId}`)
        .set('Authorization', 'Bearer master-token')
        .send({ enabled: false })
        .expect(200);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_POLICY_UPDATED,
          changeSummary: 'Updated fields: enabled',
          metadata: expect.objectContaining({
            updatedFieldNames: ['enabled'],
            outcome: 'UPDATED',
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('does not run insights or success audit when unauthorized', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/business-insights/run-all')
        .set('Authorization', 'Bearer member-token')
        .expect(403);
      expect(insights.runForAllActiveOrganizations).not.toHaveBeenCalled();
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

  it('does not record success audit when run-org throws', async () => {
    insights.runForOrganization.mockRejectedValue(new Error('run_failed'));
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/business-insights/run/${orgId}`)
        .set('Authorization', 'Bearer master-token')
        .expect(500);
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ORG ||
            c[0]?.auditAction === MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});