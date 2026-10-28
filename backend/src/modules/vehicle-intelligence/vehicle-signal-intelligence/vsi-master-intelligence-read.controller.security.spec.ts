import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VsiMasterIntelligenceReadController } from './vsi-master-intelligence-read.controller';

describe('VsiMasterIntelligenceReadController security', () => {
  it('requires MASTER_ADMIN, RolesGuard, and MasterAdminMfaGuard', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VsiMasterIntelligenceReadController) as string[];
    expect(roles).toContain('MASTER_ADMIN');

    const classGuards = Reflect.getMetadata('__guards__', VsiMasterIntelligenceReadController) as
      | { name: string }[]
      | undefined;
    expect(classGuards?.map((g) => g.name)).toEqual(
      expect.arrayContaining([RolesGuard.name, MasterAdminMfaGuard.name]),
    );
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, VsiMasterIntelligenceReadController),
    ).toBe(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS);
  });
});
