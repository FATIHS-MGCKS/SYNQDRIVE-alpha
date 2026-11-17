import { Reflector } from '@nestjs/core';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { CoreAppServiceClientAdminController } from './core-app-service-client.admin.controller';

describe('CoreAppServiceClientAdminController MFA metadata', () => {
  const reflector = new Reflector();

  it('requires MASTER_API_KEYS step-up for the controller', () => {
    const action = reflector.get<typeof STEP_UP_ACTION.MASTER_API_KEYS>(
      MASTER_ADMIN_MFA_ACTION_KEY,
      CoreAppServiceClientAdminController,
    );
    expect(action).toBe(STEP_UP_ACTION.MASTER_API_KEYS);
  });
});