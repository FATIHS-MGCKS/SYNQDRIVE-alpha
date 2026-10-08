import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VehicleOnboardingOffboardController } from '../controllers/vehicle-onboarding-offboard.controller';

describe('VehicleOnboardingOffboardController security', () => {
  it('requires MASTER_ADMIN, RolesGuard, MasterAdminMfaGuard, and MASTER_INTEGRATIONS step-up', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VehicleOnboardingOffboardController) as string[];
    expect(roles).toContain('MASTER_ADMIN');

    const guards = Reflect.getMetadata('__guards__', VehicleOnboardingOffboardController) as Array<
      { name: string }
    >;
    expect(guards?.map((g) => g.name)).toEqual(
      expect.arrayContaining([RolesGuard.name, MasterAdminMfaGuard.name]),
    );

    const stepUp = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      VehicleOnboardingOffboardController,
    ) as string;
    expect(stepUp).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });
});
