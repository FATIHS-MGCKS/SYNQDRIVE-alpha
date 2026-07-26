import { SetMetadata } from '@nestjs/common';
import { StepUpActionCode } from '@modules/iam-mfa/iam-mfa.policy';

export const MASTER_ADMIN_MFA_ACTION_KEY = 'masterAdminMfaAction';

/** Step-up + enrollment gate for master-admin mutating routes (POST/PUT/PATCH/DELETE). */
export const RequireMasterAdminMfa = (action: StepUpActionCode) =>
  SetMetadata(MASTER_ADMIN_MFA_ACTION_KEY, action);
