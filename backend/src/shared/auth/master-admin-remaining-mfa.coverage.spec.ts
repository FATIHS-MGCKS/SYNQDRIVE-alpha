import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { HighMobilityCompatibilityController } from '@modules/high-mobility/compatibility/hm-compatibility.controller';
import { InsurancesAdminController } from '@modules/insurances/insurances.controller';
import { PartsAccessoriesAdminController } from '@modules/parts-accessories/parts-accessories.controller';
import { ProspectsController } from '@modules/prospects/prospects.controller';
import { TwilioTenantProvisioningController } from '@modules/twilio/provisioning/twilio-tenant-provisioning.controller';
import { ElevenLabsTwilioImportController } from '@modules/voice-assistant/provisioning/elevenlabs-twilio-import.controller';
import { VoiceBillingAdminController } from '@modules/voice-billing/voice-billing-admin.controller';
import { VoiceProtectionAdminController } from '@modules/voice-protection/voice-protection.controller';
import {
  MFA_HTTP_ORG,
  closeMasterAdminMfaHttpHarness,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { ProspectsService } from '@modules/prospects/prospects.service';
import { TwilioTenantProvisioningService } from '@modules/twilio/provisioning/twilio-tenant-provisioning.service';
import { ElevenLabsTwilioImportProvisioningService } from '@modules/voice-assistant/provisioning/elevenlabs-twilio-import-provisioning.service';
import { InsurancesService } from '@modules/insurances/insurances.service';
import { PartsAccessoriesService } from '@modules/parts-accessories/parts-accessories.service';
import { VoiceProtectionOverrideService } from '@modules/voice-protection/voice-protection-override.service';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { VoiceBudgetWarningService } from '@modules/voice-protection/voice-budget-warning.service';
import { VoiceProtectionAuditService } from '@modules/voice-protection/voice-protection-audit.service';
import { MasterCatalogAdminAuditService } from '@modules/activity-log/master-catalog-admin-audit.service';

const noopCatalogAudit = { recordMutation: jest.fn() };

function expectMfaGuardsOnController(controller: object): void {
  const guards = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  expect(guards).toEqual(expect.arrayContaining([RolesGuard, MasterAdminMfaGuard]));
}

describe('P5-B2 remaining admin MFA coverage — metadata', () => {
  it('HmCompatibility — guard only (read-only surface)', () => {
    expectMfaGuardsOnController(HighMobilityCompatibilityController);
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, HighMobilityCompatibilityController),
    ).toBeUndefined();
  });

  it('VoiceBillingAdmin — guard only (read-only surface)', () => {
    expectMfaGuardsOnController(VoiceBillingAdminController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, VoiceBillingAdminController)).toBeUndefined();
  });

  it('InsurancesAdmin — MASTER_PLATFORM_SETTINGS', () => {
    expectMfaGuardsOnController(InsurancesAdminController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, InsurancesAdminController)).toBe(
      STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
    );
  });

  it('PartsAccessoriesAdmin — MASTER_PLATFORM_SETTINGS', () => {
    expectMfaGuardsOnController(PartsAccessoriesAdminController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, PartsAccessoriesAdminController)).toBe(
      STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
    );
  });

  it('Prospects — MASTER_PLATFORM_SETTINGS', () => {
    expectMfaGuardsOnController(ProspectsController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, ProspectsController)).toBe(
      STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
    );
  });

  it('TwilioTenantProvisioning — MASTER_INTEGRATIONS', () => {
    expectMfaGuardsOnController(TwilioTenantProvisioningController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, TwilioTenantProvisioningController)).toBe(
      STEP_UP_ACTION.MASTER_INTEGRATIONS,
    );
  });

  it('ElevenLabsTwilioImport — MASTER_INTEGRATIONS', () => {
    expectMfaGuardsOnController(ElevenLabsTwilioImportController);
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, ElevenLabsTwilioImportController)).toBe(
      STEP_UP_ACTION.MASTER_INTEGRATIONS,
    );
  });

  it('VoiceProtectionAdmin — MASTER_ORGANIZATION on override POST', () => {
    expectMfaGuardsOnController(VoiceProtectionAdminController);
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        VoiceProtectionAdminController.prototype.createOverride,
      ),
    ).toBe(STEP_UP_ACTION.MASTER_ORGANIZATION);
  });
});

describe('P5-B2 remaining admin MFA coverage — HTTP (real guard)', () => {
  installMfaEnforcedEnvForSuite();

  it('Prospects POST — STEP_UP_REQUIRED without token', async () => {
    const prospects = { create: jest.fn() };
    const harness = await createMasterAdminMfaHttpHarness({
      controller: ProspectsController,
      providers: [
        { provide: ProspectsService, useValue: prospects },
        { provide: MasterCatalogAdminAuditService, useValue: noopCatalogAudit },
      ],
    });
    try {
      const res = await request(harness.app.getHttpServer())
        .post('/admin/prospects')
        .set('Authorization', 'Bearer master-token')
        .send({ name: 'Acme' })
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'STEP_UP_REQUIRED',
        action: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
      });
    } finally {
      await closeMasterAdminMfaHttpHarness(harness);
    }
  });

  it('Twilio provisioning preview — STEP_UP_REQUIRED', async () => {
    const provisioning = { previewProvisioning: jest.fn() };
    const harness = await createMasterAdminMfaHttpHarness({
      controller: TwilioTenantProvisioningController,
      providers: [{ provide: TwilioTenantProvisioningService, useValue: provisioning }],
    });
    try {
      const res = await request(harness.app.getHttpServer())
        .post(`/admin/voice-assistant/organizations/${MFA_HTTP_ORG}/twilio/provisioning/preview`)
        .set('Authorization', 'Bearer master-token')
        .send({ numberType: 'local' })
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'STEP_UP_REQUIRED',
        action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
      });
    } finally {
      await closeMasterAdminMfaHttpHarness(harness);
    }
  });

  it('Voice protection override — rejects non–MASTER_ADMIN', async () => {
    const harness = await createMasterAdminMfaHttpHarness({
      controller: VoiceProtectionAdminController,
      providers: [
        { provide: VoiceBudgetEnforcementService, useValue: { getEnforcementSnapshot: jest.fn() } },
        { provide: VoiceBudgetWarningService, useValue: { getPeriodForecast: jest.fn() } },
        { provide: VoiceProtectionAuditService, useValue: { listByOrganization: jest.fn() } },
        { provide: VoiceProtectionOverrideService, useValue: { createOverride: jest.fn() } },
      ],
    });
    try {
      await request(harness.app.getHttpServer())
        .post(`/admin/voice-assistant/protection/organizations/${MFA_HTTP_ORG}/overrides`)
        .set('Authorization', 'Bearer member-token')
        .send({
          scope: 'ORGANIZATION',
          reason: 'test',
          expiresAt: new Date().toISOString(),
        })
        .expect(403);
    } finally {
      await closeMasterAdminMfaHttpHarness(harness);
    }
  });

  it('Voice protection override — accepts valid step-up', async () => {
    const overrides = { createOverride: jest.fn().mockResolvedValue({ id: 'ov-1' }) };
    const harness = await createMasterAdminMfaHttpHarness({
      controller: VoiceProtectionAdminController,
      providers: [
        {
          provide: VoiceBudgetEnforcementService,
          useValue: { getEnforcementSnapshot: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: VoiceBudgetWarningService,
          useValue: { getPeriodForecast: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: VoiceProtectionAuditService,
          useValue: { listByOrganization: jest.fn().mockResolvedValue([]) },
        },
        { provide: VoiceProtectionOverrideService, useValue: overrides },
      ],
    });
    harness.validateGrant.mockResolvedValue(true);
    try {
      await request(harness.app.getHttpServer())
        .post(`/admin/voice-assistant/protection/organizations/${MFA_HTTP_ORG}/overrides`)
        .set('Authorization', 'Bearer master-token')
        .set('x-step-up-token', 'step-up-token-valid')
        .send({
          scope: 'ORGANIZATION',
          reason: 'test',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      expect(harness.validateGrant).toHaveBeenCalledWith(
        expect.any(String),
        'step-up-token-valid',
        STEP_UP_ACTION.MASTER_ORGANIZATION,
      );
    } finally {
      await closeMasterAdminMfaHttpHarness(harness);
    }
  });
});

describe('P5-B2 PR2429 F1 — high-risk mutation HTTP security', () => {
  installMfaEnforcedEnvForSuite();

  const twilioBase = `/admin/voice-assistant/organizations/${MFA_HTTP_ORG}/twilio`;
  const elevenLabsBase = `/admin/voice-assistant/organizations/${MFA_HTTP_ORG}/elevenlabs`;
  const phoneNumberId = 'pn-test-1';

  describe('Twilio POST phone-numbers/purchase', () => {
    const purchasePath = `${twilioBase}/phone-numbers/purchase`;
    const purchaseBody = { phoneNumber: '+15551234567', confirm: true, dryRun: true };

    it('STEP_UP_REQUIRED without token; purchase not executed', async () => {
      const provisioning = { purchasePhoneNumber: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: TwilioTenantProvisioningController,
        providers: [{ provide: TwilioTenantProvisioningService, useValue: provisioning }],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post(purchasePath)
          .set('Authorization', 'Bearer master-token')
          .send(purchaseBody)
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
        });
        expect(provisioning.purchasePhoneNumber).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('rejects non–MASTER_ADMIN; purchase not executed', async () => {
      const provisioning = { purchasePhoneNumber: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: TwilioTenantProvisioningController,
        providers: [{ provide: TwilioTenantProvisioningService, useValue: provisioning }],
      });
      try {
        await request(harness.app.getHttpServer())
          .post(purchasePath)
          .set('Authorization', 'Bearer member-token')
          .send(purchaseBody)
          .expect(403);
        expect(provisioning.purchasePhoneNumber).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('allows purchase with valid MASTER_INTEGRATIONS step-up', async () => {
      const provisioning = {
        purchasePhoneNumber: jest.fn().mockResolvedValue({ purchased: true }),
      };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: TwilioTenantProvisioningController,
        providers: [{ provide: TwilioTenantProvisioningService, useValue: provisioning }],
      });
      harness.validateGrant.mockResolvedValue(true);
      try {
        await request(harness.app.getHttpServer())
          .post(purchasePath)
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .send(purchaseBody)
          .expect(201);
        expectStepUpValidation(
          harness.validateGrant,
          STEP_UP_ACTION.MASTER_INTEGRATIONS,
          'step-up-token-valid',
        );
        expect(provisioning.purchasePhoneNumber).toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });

  describe('ElevenLabs POST import-and-assign', () => {
    const importPath = `${elevenLabsBase}/phone-numbers/${phoneNumberId}/import-and-assign`;
    const importBody = { confirm: true, dryRun: true };

    it('STEP_UP_REQUIRED without token; import not executed', async () => {
      const provisioning = { importAndAssign: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: ElevenLabsTwilioImportController,
        providers: [
          { provide: ElevenLabsTwilioImportProvisioningService, useValue: provisioning },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post(importPath)
          .set('Authorization', 'Bearer master-token')
          .send(importBody)
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
        });
        expect(provisioning.importAndAssign).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('rejects non–MASTER_ADMIN; import not executed', async () => {
      const provisioning = { importAndAssign: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: ElevenLabsTwilioImportController,
        providers: [
          { provide: ElevenLabsTwilioImportProvisioningService, useValue: provisioning },
        ],
      });
      try {
        await request(harness.app.getHttpServer())
          .post(importPath)
          .set('Authorization', 'Bearer member-token')
          .send(importBody)
          .expect(403);
        expect(provisioning.importAndAssign).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });

  describe('Insurances PATCH partners/:id', () => {
    const partnerId = 'partner-1';
    const patchPath = `/admin/insurances/partners/${partnerId}`;

    it('STEP_UP_REQUIRED without token; update not executed', async () => {
      const service = { updatePartner: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: InsurancesAdminController,
        providers: [
          { provide: InsurancesService, useValue: service },
          { provide: MasterCatalogAdminAuditService, useValue: noopCatalogAudit },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .patch(patchPath)
          .set('Authorization', 'Bearer master-token')
          .send({ displayName: 'Updated' })
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
        });
        expect(service.updatePartner).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('rejects non–MASTER_ADMIN; update not executed', async () => {
      const service = { updatePartner: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: InsurancesAdminController,
        providers: [
          { provide: InsurancesService, useValue: service },
          { provide: MasterCatalogAdminAuditService, useValue: noopCatalogAudit },
        ],
      });
      try {
        await request(harness.app.getHttpServer())
          .patch(patchPath)
          .set('Authorization', 'Bearer member-token')
          .send({ displayName: 'Updated' })
          .expect(403);
        expect(service.updatePartner).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });

  describe('PartsAccessories PATCH providers/:id', () => {
    const providerId = 'provider-1';
    const patchPath = `/admin/parts-accessories/providers/${providerId}`;

    it('STEP_UP_REQUIRED without token; update not executed', async () => {
      const service = { updateProvider: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: PartsAccessoriesAdminController,
        providers: [
          { provide: PartsAccessoriesService, useValue: service },
          { provide: MasterCatalogAdminAuditService, useValue: noopCatalogAudit },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .patch(patchPath)
          .set('Authorization', 'Bearer master-token')
          .send({ displayName: 'Updated' })
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
        });
        expect(service.updateProvider).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('rejects non–MASTER_ADMIN; update not executed', async () => {
      const service = { updateProvider: jest.fn() };
      const harness = await createMasterAdminMfaHttpHarness({
        controller: PartsAccessoriesAdminController,
        providers: [
          { provide: PartsAccessoriesService, useValue: service },
          { provide: MasterCatalogAdminAuditService, useValue: noopCatalogAudit },
        ],
      });
      try {
        await request(harness.app.getHttpServer())
          .patch(patchPath)
          .set('Authorization', 'Bearer member-token')
          .send({ displayName: 'Updated' })
          .expect(403);
        expect(service.updateProvider).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});