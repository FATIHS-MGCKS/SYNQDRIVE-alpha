import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { PhysicalDeviceInventoryController } from './physical-device-inventory.controller';

describe('PhysicalDeviceInventoryController security', () => {
  it('requires MASTER_ADMIN, RolesGuard, MasterAdminMfaGuard, and platform settings step-up', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PhysicalDeviceInventoryController) as string[];
    expect(roles).toContain('MASTER_ADMIN');

    const guards = Reflect.getMetadata('__guards__', PhysicalDeviceInventoryController) as Array<{ name: string }>;
    expect(guards?.map((g) => g.name)).toEqual(
      expect.arrayContaining([RolesGuard.name, MasterAdminMfaGuard.name]),
    );

    const stepUp = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      PhysicalDeviceInventoryController,
    ) as string;
    expect(stepUp).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
  });

  it('requires MASTER_INTEGRATIONS step-up for manual intake', () => {
    const intakeStepUp = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      PhysicalDeviceInventoryController.prototype.manualIntake,
    ) as string;
    expect(intakeStepUp).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });

  it('requires MASTER_INTEGRATIONS step-up for verify identity', () => {
    const verifyStepUp = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      PhysicalDeviceInventoryController.prototype.verifyIdentity,
    ) as string;
    expect(verifyStepUp).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });
});
