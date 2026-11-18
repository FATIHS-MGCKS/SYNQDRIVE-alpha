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
import { TwilioTenantProvisioningController } from '@modules/twilio/provisioning/twilio-tenant-provisioning.controller';
import { TwilioTenantProvisioningService } from '@modules/twilio/provisioning/twilio-tenant-provisioning.service';
import { ElevenLabsTwilioImportController } from './provisioning/elevenlabs-twilio-import.controller';
import { ElevenLabsTwilioImportProvisioningService } from './provisioning/elevenlabs-twilio-import-provisioning.service';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const phoneNumberId = 'pn-semantic-audit-1';
const rawPhoneInRequest = '+15559876543';

const masterAdminAudit = {
  record: jest.fn().mockResolvedValue(undefined),
  recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
};

function assertNoSecretLeakInAuditCalls(): void {
  const serialized = JSON.stringify(masterAdminAudit.record.mock.calls);
  expect(serialized).not.toMatch(/authToken|apiKey|secret/i);
  expect(serialized).not.toContain(rawPhoneInRequest);
}

async function createVoiceAuditHttpApp(controllers: unknown[], extraProviders: unknown[]) {
  const moduleRef = await Test.createTestingModule({
    controllers: controllers as never[],
    providers: [
      MasterVoiceProvisioningAdminAuditService,
      { provide: MasterAdminAuditService, useValue: masterAdminAudit },
      ...(extraProviders as never[]),
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

describe('Voice provisioning — semantic admin audit HTTP', () => {
  const voiceService = { adminSyncOrganization: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    voiceService.adminSyncOrganization.mockResolvedValue({ synced: 3 });
  });

  it('records SYNC_COMPLETED semantic audit without generic success duplicate', async () => {
    const app = await createVoiceAuditHttpApp(
      [VoiceAssistantAdminController],
      [{ provide: VoiceAssistantService, useValue: voiceService }],
    );
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
    const app = await createVoiceAuditHttpApp(
      [VoiceAssistantAdminController],
      [{ provide: VoiceAssistantService, useValue: voiceService }],
    );
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
    const app = await createVoiceAuditHttpApp(
      [VoiceAssistantAdminController],
      [{ provide: VoiceAssistantService, useValue: voiceService }],
    );
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

describe('TwilioTenantProvisioningController — phone purchase semantic audit HTTP', () => {
  const jobId = 'twilio-job-purchase-1';
  const twilioProvisioning = { purchasePhoneNumber: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    twilioProvisioning.purchasePhoneNumber.mockResolvedValue({
      organizationId: orgId,
      dryRun: false,
      mutating: true,
      job: { id: jobId, status: 'COMPLETED' },
      phoneNumberId: 'pn-internal-db-id',
      maskedPhoneNumber: '+1***6543',
      lifecycle: 'ACTIVE',
      regulatoryStatus: null,
    });
  });

  it('records PROVISIONING_COMPLETED with org and job entityId (single canonical audit)', async () => {
    const app = await createVoiceAuditHttpApp(
      [TwilioTenantProvisioningController],
      [{ provide: TwilioTenantProvisioningService, useValue: twilioProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/twilio/phone-numbers/purchase`)
        .set('Authorization', 'Bearer master-token')
        .send({ phoneNumber: rawPhoneInRequest, confirm: true, dryRun: false })
        .expect(201);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_VOICE_TWILIO_PROVISIONING,
          targetOrganizationId: orgId,
          entityId: jobId,
          metadata: expect.objectContaining({
            operation: 'PHONE_NUMBER_PURCHASE',
            outcome: 'PROVISIONING_COMPLETED',
            phoneNumberId: 'pn-internal-db-id',
          }),
        }),
      );
      assertNoSecretLeakInAuditCalls();
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) => c[0]?.auditAction === MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('records privileged failure audit on unauthorized without semantic success', async () => {
    const app = await createVoiceAuditHttpApp(
      [TwilioTenantProvisioningController],
      [{ provide: TwilioTenantProvisioningService, useValue: twilioProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/twilio/phone-numbers/purchase`)
        .set('Authorization', 'Bearer member-token')
        .send({ phoneNumber: rawPhoneInRequest, confirm: true })
        .expect(403);
      expect(twilioProvisioning.purchasePhoneNumber).not.toHaveBeenCalled();
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_VOICE_TWILIO_PROVISIONING,
        ),
      ).toBe(false);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('does not record semantic success when purchase throws', async () => {
    twilioProvisioning.purchasePhoneNumber.mockRejectedValue(new Error('purchase_failed'));
    const app = await createVoiceAuditHttpApp(
      [TwilioTenantProvisioningController],
      [{ provide: TwilioTenantProvisioningService, useValue: twilioProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-assistant/organizations/${orgId}/twilio/phone-numbers/purchase`)
        .set('Authorization', 'Bearer master-token')
        .send({ phoneNumber: rawPhoneInRequest, confirm: true })
        .expect(500);
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_VOICE_TWILIO_PROVISIONING,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('ElevenLabsTwilioImportController — import-and-assign semantic audit HTTP', () => {
  const elevenLabsJobId = 'el-import-job-1';
  const elevenLabsProvisioning = { importAndAssign: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    elevenLabsProvisioning.importAndAssign.mockResolvedValue({
      organizationId: orgId,
      phoneNumberId,
      deploymentId: 'dep-1',
      dryRun: false,
      mutating: true,
      importStatus: 'IMPORTED',
      maskedElevenLabsPhoneRef: 'el_ref_***',
      maskedAgentRef: 'agent_***',
      job: { id: elevenLabsJobId, status: 'COMPLETED' },
      rolledBack: false,
    });
  });

  it('records PROVISIONING_COMPLETED with org and phone entityId (single canonical audit)', async () => {
    const app = await createVoiceAuditHttpApp(
      [ElevenLabsTwilioImportController],
      [{ provide: ElevenLabsTwilioImportProvisioningService, useValue: elevenLabsProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/voice-assistant/organizations/${orgId}/elevenlabs/phone-numbers/${phoneNumberId}/import-and-assign`,
        )
        .set('Authorization', 'Bearer master-token')
        .send({ confirm: true, dryRun: false, deploymentId: 'dep-1' })
        .expect(201);
      expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.MASTER_VOICE_ELEVENLABS_IMPORT,
          targetOrganizationId: orgId,
          entityId: phoneNumberId,
          metadata: expect.objectContaining({
            operation: 'IMPORT_AND_ASSIGN',
            outcome: 'PROVISIONING_COMPLETED',
            deploymentId: 'dep-1',
          }),
        }),
      );
      assertNoSecretLeakInAuditCalls();
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) => c[0]?.auditAction === MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('records privileged failure audit on unauthorized without semantic success', async () => {
    const app = await createVoiceAuditHttpApp(
      [ElevenLabsTwilioImportController],
      [{ provide: ElevenLabsTwilioImportProvisioningService, useValue: elevenLabsProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/voice-assistant/organizations/${orgId}/elevenlabs/phone-numbers/${phoneNumberId}/import-and-assign`,
        )
        .set('Authorization', 'Bearer member-token')
        .send({ confirm: true, deploymentId: 'dep-1' })
        .expect(403);
      expect(elevenLabsProvisioning.importAndAssign).not.toHaveBeenCalled();
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_VOICE_ELEVENLABS_IMPORT,
        ),
      ).toBe(false);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('does not record semantic success when import throws', async () => {
    elevenLabsProvisioning.importAndAssign.mockRejectedValue(new Error('import_failed'));
    const app = await createVoiceAuditHttpApp(
      [ElevenLabsTwilioImportController],
      [{ provide: ElevenLabsTwilioImportProvisioningService, useValue: elevenLabsProvisioning }],
    );
    try {
      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/voice-assistant/organizations/${orgId}/elevenlabs/phone-numbers/${phoneNumberId}/import-and-assign`,
        )
        .set('Authorization', 'Bearer master-token')
        .send({ confirm: true, deploymentId: 'dep-1' })
        .expect(500);
      expect(
        masterAdminAudit.record.mock.calls.some(
          (c) =>
            c[0]?.auditAction === MasterAdminAuditAction.MASTER_VOICE_ELEVENLABS_IMPORT,
        ),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});