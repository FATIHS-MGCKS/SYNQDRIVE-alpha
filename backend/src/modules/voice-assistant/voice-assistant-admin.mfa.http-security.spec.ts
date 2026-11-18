import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import {
  MFA_HTTP_ORG,
  closeMasterAdminMfaHttpHarness,
  createMasterAdminAuthGuard,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { VoiceAssistantAdminController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';
import { MasterVoiceProvisioningAdminAuditService } from '@modules/activity-log/master-voice-provisioning-admin-audit.service';

const noopVoiceAudit = { recordProvisioningMutation: jest.fn() };

describe('VoiceAssistantAdminController — MFA HTTP security', () => {
  const service = { adminSyncOrganization: jest.fn().mockResolvedValue({ synced: true }) };

  beforeEach(() => jest.clearAllMocks());

  it('sync route requires MASTER_INTEGRATIONS step-up metadata', () => {
    const sync = VoiceAssistantAdminController.prototype.syncOrganization;
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, sync)).toBe(
      STEP_UP_ACTION.MASTER_INTEGRATIONS,
    );
  });

  describe('MFA disabled (default env)', () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      savedEnv = process.env;
      process.env = { ...savedEnv };
      delete process.env.IAM_MFA_MASTER_ADMIN_ENABLED;
    });

    afterEach(() => {
      process.env = savedEnv;
    });

    it('allows sync without step-up', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [VoiceAssistantAdminController],
        providers: [
          { provide: VoiceAssistantService, useValue: service },
          { provide: MasterVoiceProvisioningAdminAuditService, useValue: noopVoiceAudit },
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
        .compile();

      const app = moduleRef.createNestApplication();
      await app.init();

      try {
        await request(app.getHttpServer())
          .post(`/admin/voice-assistant/organizations/${MFA_HTTP_ORG}/sync`)
          .set('Authorization', 'Bearer master-token')
          .expect(201);
        expect(service.adminSyncOrganization).toHaveBeenCalledWith(MFA_HTTP_ORG);
      } finally {
        await app.close();
      }
    });
  });

  describe('HTTP — real MasterAdminMfaGuard + route metadata', () => {
    installMfaEnforcedEnvForSuite();

    const syncPath = `/admin/voice-assistant/organizations/${MFA_HTTP_ORG}/sync`;

    it('rejects non–MASTER_ADMIN on sync', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: VoiceAssistantAdminController,
        providers: [
          { provide: VoiceAssistantService, useValue: service },
          { provide: MasterVoiceProvisioningAdminAuditService, useValue: noopVoiceAudit },
        ],
      });
      try {
        await request(harness.app.getHttpServer())
          .post(syncPath)
          .set('Authorization', 'Bearer member-token')
          .expect(403);
        expect(service.adminSyncOrganization).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('returns STEP_UP_REQUIRED without step-up when MFA enforced', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: VoiceAssistantAdminController,
        providers: [
          { provide: VoiceAssistantService, useValue: service },
          { provide: MasterVoiceProvisioningAdminAuditService, useValue: noopVoiceAudit },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post(syncPath)
          .set('Authorization', 'Bearer master-token')
          .expect(403);

        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
        });
        expect(harness.validateGrant).not.toHaveBeenCalled();
        expect(service.adminSyncOrganization).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('returns STEP_UP_EXPIRED for invalid step-up token', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: VoiceAssistantAdminController,
        providers: [
          { provide: VoiceAssistantService, useValue: service },
          { provide: MasterVoiceProvisioningAdminAuditService, useValue: noopVoiceAudit },
        ],
      });
      harness.validateGrant.mockResolvedValue(false);
      try {
        const res = await request(harness.app.getHttpServer())
          .post(syncPath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'bad-token')
          .expect(403);

        expect(res.body).toMatchObject({
          code: 'STEP_UP_EXPIRED',
          action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
        });
        expectStepUpValidation(
          harness.validateGrant,
          STEP_UP_ACTION.MASTER_INTEGRATIONS,
          'bad-token',
        );
        expect(service.adminSyncOrganization).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('allows sync with valid step-up and passes MASTER_INTEGRATIONS to validation', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: VoiceAssistantAdminController,
        providers: [
          { provide: VoiceAssistantService, useValue: service },
          { provide: MasterVoiceProvisioningAdminAuditService, useValue: noopVoiceAudit },
        ],
      });
      harness.validateGrant.mockResolvedValue(true);
      try {
        await request(harness.app.getHttpServer())
          .post(syncPath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(201);

        expectStepUpValidation(
          harness.validateGrant,
          STEP_UP_ACTION.MASTER_INTEGRATIONS,
          'step-up-token-valid',
        );
        expect(service.adminSyncOrganization).toHaveBeenCalledWith(MFA_HTTP_ORG);
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});