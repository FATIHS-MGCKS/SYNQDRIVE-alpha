import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterVoiceProvisioningAdminAuditService } from '@modules/activity-log/master-voice-provisioning-admin-audit.service';
import { MasterAdminPrivilegedAuditInterceptor } from '@shared/interceptors/master-admin-privileged-audit.interceptor';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { VoiceAssistantAdminController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';

describe('Voice provisioning — semantic admin audit HTTP', () => {
  const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  const voiceService = { adminSyncOrganization: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    voiceService.adminSyncOrganization.mockResolvedValue({ synced: 3 });
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [VoiceAssistantAdminController],
      providers: [
        MasterVoiceProvisioningAdminAuditService,
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: VoiceAssistantService, useValue: voiceService },
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

  it('records SYNC_COMPLETED semantic audit without generic success duplicate', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/sync`)
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(res.body.synced).toBe(3);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_VOICE_ASSISTANT_ADMIN_SYNC,
          targetOrganizationId: orgId,
          metadata: expect.objectContaining({ outcome: 'SYNC_COMPLETED' }),
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
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/sync`)
        .set('Authorization', 'Bearer member-token')
        .expect(403);
      expect(voiceService.adminSyncOrganization).not.toHaveBeenCalled();
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('does not record success audit when sync throws', async () => {
    voiceService.adminSyncOrganization.mockRejectedValue(new Error('sync_failed'));
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/sync`)
        .set('Authorization', 'Bearer master-token')
        .expect(500);
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_VOICE_ASSISTANT_ADMIN_SYNC,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});