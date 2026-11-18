import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterCatalogAdminAuditService } from '@modules/activity-log/master-catalog-admin-audit.service';
import { MasterAdminPrivilegedAuditInterceptor } from '@shared/interceptors/master-admin-privileged-audit.interceptor';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';

describe('ProspectsController — catalog semantic admin audit HTTP', () => {
  const prospectId = '11111111-1111-1111-1111-111111111111';
  const orgId = '22222222-2222-2222-2222-222222222222';

  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  const prospects = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    import: jest.fn(),
    convertToOrganization: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prospects.create.mockResolvedValue({ id: prospectId });
    prospects.update.mockResolvedValue({ id: prospectId });
    prospects.delete.mockResolvedValue({ id: prospectId });
    prospects.import.mockResolvedValue({ count: 2 });
    prospects.convertToOrganization.mockResolvedValue({ organizationId: orgId });
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProspectsController],
      providers: [
        MasterCatalogAdminAuditService,
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: ProspectsService, useValue: prospects },
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

  it('records CREATE semantic audit without generic success audit', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/prospects')
        .set('Authorization', 'Bearer master-token')
        .send({ companyName: 'Acme GmbH' })
        .expect(201);
      expect(res.body.id).toBe(prospectId);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_PROSPECT_CATALOG_MUTATION,
          entityId: prospectId,
          httpStatus: 201,
          metadata: expect.objectContaining({ operation: 'CREATE', resource: 'prospect' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records CONVERT with target organization attribution', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/prospects/${prospectId}/convert`)
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          targetOrganizationId: orgId,
          metadata: expect.objectContaining({ operation: 'CONVERT' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records unauthorized via privileged failure audit only', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/prospects')
        .set('Authorization', 'Bearer member-token')
        .send({ companyName: 'Acme' })
        .expect(403);
      expect(prospects.create).not.toHaveBeenCalled();
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

  it('does not record catalog success audit when create throws', async () => {
    prospects.create.mockRejectedValue(new Error('db_error'));
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/prospects')
        .set('Authorization', 'Bearer master-token')
        .send({ companyName: 'Acme' })
        .expect(500);
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) => c[0]?.auditAction === MasterAdminAuditAction.MASTER_PROSPECT_CATALOG_MUTATION,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});