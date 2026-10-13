import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { MasterVehicleOffboardAdmissionGuard } from '../guards/master-vehicle-offboard-admission.guard';
import { MasterVehicleOffboardMfaGuard } from '../guards/master-vehicle-offboard-mfa.guard';
import { VehicleOnboardingOffboardController } from '../controllers/vehicle-onboarding-offboard.controller';

describe('VehicleOnboardingOffboardController security', () => {
  it('requires MASTER_ADMIN, RolesGuard, offboard MFA guard, and MASTER_INTEGRATIONS step-up', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VehicleOnboardingOffboardController) as string[];
    expect(roles).toContain('MASTER_ADMIN');

    const guards = Reflect.getMetadata('__guards__', VehicleOnboardingOffboardController) as Array<
      { name: string }
    >;
    expect(guards?.map((g) => g.name)).toEqual(
      expect.arrayContaining([
        RolesGuard.name,
        MasterVehicleOffboardAdmissionGuard.name,
        MasterVehicleOffboardMfaGuard.name,
      ]),
    );

    const stepUp = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      VehicleOnboardingOffboardController,
    ) as string;
    expect(stepUp).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });
});
