import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import * as request from 'supertest';
import {
  closeMasterAdminMfaHttpHarness,
  createMasterAdminMfaHttpHarness,
  expectStepUpValidation,
  installMfaEnforcedEnvForSuite,
} from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { VehicleCleaningTaskService } from '../tasks/vehicle-cleaning-task.service';
import { VehiclesOperationalService } from './vehicles-operational.service';

describe('VehiclesController — admin mutation MFA HTTP security', () => {
  const vehiclesService = {
    upsertHvMasterSpecificationForAdmin: jest.fn().mockResolvedValue({ vehicleId: 'v1' }),
    findAllPlatform: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const exteriorImagesService = {
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('hv master specification uses MASTER_INTEGRATIONS step-up', () => {
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        VehiclesController.prototype.upsertHvMasterSpecificationAdmin,
      ),
    ).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });

  it('exterior image delete uses MASTER_PLATFORM_SETTINGS step-up', () => {
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        VehiclesController.prototype.deleteExteriorImageAdmin,
      ),
    ).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
  });

  it('deregister step-up metadata unchanged', () => {
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        VehiclesController.prototype.deregisterVehicle,
      ),
    ).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });

  describe('MFA enforced', () => {
    installMfaEnforcedEnvForSuite();

    async function openHarness() {
      return createMasterAdminMfaHttpHarness({
        controller: VehiclesController,
        providers: [
          { provide: VehiclesService, useValue: vehiclesService },
          { provide: VehicleExteriorImagesService, useValue: exteriorImagesService },
          { provide: VehicleCleaningTaskService, useValue: {} },
          { provide: VehiclesOperationalService, useValue: {} },
        ],
      });
    }

    it('PATCH hv-master-specification — STEP_UP_REQUIRED; service not called', async () => {
      const harness = await openHarness();
      try {
        const res = await request(harness.app.getHttpServer())
          .patch('/admin/vehicles/v1/hv-master-specification')
          .set('Authorization', 'Bearer master-token')
          .send({ specification: {} })
          .expect(403);
        expect(res.body).toMatchObject({
          code: 'STEP_UP_REQUIRED',
          action: STEP_UP_ACTION.MASTER_INTEGRATIONS,
        });
        expect(vehiclesService.upsertHvMasterSpecificationForAdmin).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('PATCH hv-master-specification — success with valid step-up', async () => {
      const harness = await openHarness();
      harness.validateGrant.mockResolvedValue(true);
      try {
        await request(harness.app.getHttpServer())
          .patch('/admin/vehicles/v1/hv-master-specification')
          .set('Authorization', 'Bearer master-token')
          .set('x-step-up-token', 'step-up-token-valid')
          .send({ specification: {} })
          .expect(200);
        expectStepUpValidation(harness.validateGrant, STEP_UP_ACTION.MASTER_INTEGRATIONS);
        expect(vehiclesService.upsertHvMasterSpecificationForAdmin).toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('DELETE exterior image — STEP_UP_REQUIRED', async () => {
      const harness = await openHarness();
      try {
        await request(harness.app.getHttpServer())
          .delete('/admin/vehicles/v1/exterior-images/front')
          .set('Authorization', 'Bearer master-token')
          .expect(403);
        expect(exteriorImagesService.delete).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('GET admin/vehicles — readable without step-up', async () => {
      const harness = await openHarness();
      try {
        await request(harness.app.getHttpServer())
          .get('/admin/vehicles')
          .set('Authorization', 'Bearer master-token')
          .expect(200);
        expect(harness.validateGrant).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });

    it('tenant member denied on admin mutation', async () => {
      const harness = await openHarness();
      try {
        await request(harness.app.getHttpServer())
          .delete('/admin/vehicles/v1/exterior-images/front')
          .set('Authorization', 'Bearer member-token')
          .expect(403);
        expect(exteriorImagesService.delete).not.toHaveBeenCalled();
      } finally {
        await closeMasterAdminMfaHttpHarness(harness);
      }
    });
  });
});