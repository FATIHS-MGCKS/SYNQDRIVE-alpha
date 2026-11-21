import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import * as request from 'supertest';
import {
  closeMasterAdminMfaHttpHarness,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { StorageService } from '@shared/storage/storage.service';

describe('SupportController — admin MFA HTTP security', () => {
  const support = {
    updateStatus: jest.fn().mockResolvedValue({ id: 't1', status: 'RESOLVED' }),
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('updateStatus requires MASTER_PLATFORM_SETTINGS step-up metadata', () => {
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        SupportController.prototype.updateStatus,
      ),
    ).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
  });

  it('masterUpdate requires the same step-up metadata as admin update', () => {
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, SupportController.prototype.masterUpdate),
    ).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, SupportController.prototype.update),
    ).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
  });

  it('org ticket create has no master-admin MFA metadata', () => {
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, SupportController.prototype.orgCreate),
    ).toBeUndefined();
  });

  describe('MFA enforced', () => {
    installMfaEnforcedEnvForSuite();

    async function openHarness() {
      return createMasterAdminMfaHttpHarness({
        controller: SupportController,
        providers: [
          { provide: SupportService, useValue: support },
          { provide: StorageService, useValue: { finalizeUpload: jest.fn() } },
        ],
      });
    }

    it('PATCH admin/support/tickets/:id/status — STEP_UP_REQUIRED; service not called', async () => {
      const harness = await openHarness();
      try {
        const res = await request(harness.app.getHttpServer())
          .patch('/admin/support/tickets/t1/status')
          .set('Authorization', 'Bearer master-token')
          .send({ status: 'RESOLVED' })
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
        });
        expect(support.updateStatus).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('PATCH master/support/tickets/:id — STEP_UP_REQUIRED (alias parity)', async () => {
      const harness = await openHarness();
      try {
        const res = await request(harness.app.getHttpServer())
          .patch('/master/support/tickets/t1')
          .set('Authorization', 'Bearer master-token')
          .send({ priority: 'HIGH' })
          .expect(403);
        expect(res.body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
        expect(support.update).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('PATCH admin/support/tickets/:id/status — success with valid step-up', async () => {
      const harness = await openHarness();
      harness.validateGrant.mockResolvedValue(true);
      try {
        await request(harness.app.getHttpServer())
          .patch('/admin/support/tickets/t1/status')
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .send({ status: 'RESOLVED' })
          .expect(200);
        expectStepUpValidation(harness.validateGrant, STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
        expect(support.updateStatus).toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('PATCH admin/support/tickets/:id/status — invalid step-up denied', async () => {
      const harness = await openHarness();
      harness.validateGrant.mockResolvedValue(false);
      try {
        const res = await request(harness.app.getHttpServer())
          .patch('/admin/support/tickets/t1/status')
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'expired-token')
          .send({ status: 'RESOLVED' })
          .expect(403);
        expect(res.body).toMatchObject({ code: 'STEP_UP_EXPIRED' });
        expect(support.updateStatus).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('GET admin/support/tickets — readable without step-up', async () => {
      const harness = await openHarness();
      try {
        await request(harness.app.getHttpServer())
          .get('/admin/support/tickets')
          .set('Authorization', 'Bearer master-token')
          .expect(200);
        expect(harness.validateGrant).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('tenant member denied on admin mutation before MFA', async () => {
      const harness = await openHarness();
      try {
        await request(harness.app.getHttpServer())
          .patch('/admin/support/tickets/t1/status')
          .set('Authorization', 'Bearer member-token')
          .send({ status: 'RESOLVED' })
          .expect(403);
        expect(support.updateStatus).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});