import { BadRequestException } from '@nestjs/common';
import { VehicleRegistrationConvergenceService } from './vehicle-registration-convergence.service';
import { assertConvergenceOrganizationAuthorized } from './vehicle-registration-convergence.security';
import {
  describeRegistrationConvergenceIdempotencyContract,
  activationOutboxIdempotencyKey,
} from './vehicle-registration-convergence.idempotency';
import {
  isHmOnlyCanonicalRoutingEnabled,
  shouldSuppressLegacyVehicleCreateBillingHook,
} from './vehicle-registration-convergence.routing';

describe('VehicleRegistrationConvergence foundation (V2B-PR1)', () => {
  it('routing helpers are false when config undefined (legacy parity)', () => {
    expect(isHmOnlyCanonicalRoutingEnabled(undefined)).toBe(false);
    expect(shouldSuppressLegacyVehicleCreateBillingHook(undefined)).toBe(false);
  });

  it('documents registry activation idempotency contract', () => {
    expect(activationOutboxIdempotencyKey('case-1')).toBe(
      'vehicle-onboarding:VEHICLE_ACTIVATED:v1:case-1',
    );
    expect(describeRegistrationConvergenceIdempotencyContract()).toMatchObject({
      billingActivateKeyShape: 'vehicle-registry:{eventId}:billing-activate:v1',
    });
  });

  it('rejects cross-organization convergence access', () => {
    expect(() =>
      assertConvergenceOrganizationAuthorized('org-b', {
        tenantOrganizationId: 'org-a',
        isMasterAdmin: false,
        actorUserId: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('delegates to HM canonical orchestrator (V2B-PR2)', async () => {
    const hmOnlyCanonical = {
      register: jest.fn().mockResolvedValue({
        success: true,
        synqdriveVehicleId: 'veh-1',
        hmVehicleId: 'hm-1',
        vin: 'VIN',
        sourceMode: 'HM_ONLY',
        message: 'ok',
      }),
    };
    const service = new VehicleRegistrationConvergenceService(hmOnlyCanonical as never);
    const result = await service.registerHmOnlyCanonical({
      dto: { hmVehicleId: 'hm-1', organizationId: 'org-a' },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'u1' },
    });
    expect(result.synqdriveVehicleId).toBe('veh-1');
    expect(hmOnlyCanonical.register).toHaveBeenCalledTimes(1);
  });
});