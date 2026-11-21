import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import {
  closeMasterAdminMfaHttpHarness,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { BillingEmailDeliveryController } from './billing-email-delivery.controller';
import { BillingEmailDeliveryAuditService } from './billing-email-delivery-audit.service';
import { BillingEmailResendService } from './billing-email-resend.service';

describe('BillingEmailDeliveryController — MFA HTTP security', () => {
  const audit = { listDeliveries: jest.fn(), getDelivery: jest.fn() };
  const resend = {
    replayDeadLetter: jest.fn().mockResolvedValue({ replayed: true }),
    manualResend: jest.fn().mockResolvedValue({ resent: true }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('applies RolesGuard and MasterAdminMfaGuard on class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BillingEmailDeliveryController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([RolesGuard, MasterAdminMfaGuard]));
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, BillingEmailDeliveryController)).toBe(
      STEP_UP_ACTION.MASTER_BILLING,
    );
  });

  describe('when master admin MFA is enforced', () => {
    installMfaEnforcedEnvForSuite();

    it('POST replay — STEP_UP_REQUIRED without token', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: BillingEmailDeliveryController,
        providers: [
          { provide: BillingEmailDeliveryAuditService, useValue: audit },
          { provide: BillingEmailResendService, useValue: resend },
        ],
      });
      try {
        const res = await request(harness.app.getHttpServer())
          .post('/admin/billing/email-deliveries/delivery-1/replay')
          .set('Authorization', 'Bearer master-token')
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          message: 'Fresh MFA step-up required for this master admin action',
        });
        expect(resend.replayDeadLetter).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('POST replay — allows with valid step-up token', async () => {
      const harness = await createMasterAdminMfaHttpHarness({
        controller: BillingEmailDeliveryController,
        providers: [
          { provide: BillingEmailDeliveryAuditService, useValue: audit },
          { provide: BillingEmailResendService, useValue: resend },
        ],
      });
      harness.validateGrant.mockResolvedValue(true);
      try {
        await request(harness.app.getHttpServer())
          .post('/admin/billing/email-deliveries/delivery-1/replay')
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .expect(201);
        expectStepUpValidation(harness.validateGrant, STEP_UP_ACTION.MASTER_BILLING);
        expect(resend.replayDeadLetter).toHaveBeenCalledWith('delivery-1', expect.any(String));
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('GET list — no step-up required', async () => {
      audit.listDeliveries.mockResolvedValue({ items: [], total: 0 });
      const harness = await createMasterAdminMfaHttpHarness({
        controller: BillingEmailDeliveryController,
        providers: [
          { provide: BillingEmailDeliveryAuditService, useValue: audit },
          { provide: BillingEmailResendService, useValue: resend },
        ],
      });
      try {
        await request(harness.app.getHttpServer())
          .get('/admin/billing/email-deliveries')
          .set('Authorization', 'Bearer master-token')
          .expect(200);
        expect(harness.validateGrant).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});