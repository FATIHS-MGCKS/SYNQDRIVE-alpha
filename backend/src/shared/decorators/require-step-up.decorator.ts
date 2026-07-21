import { SetMetadata } from '@nestjs/common';
import { StepUpActionCode } from '@modules/iam-mfa/iam-mfa.policy';

export const STEP_UP_METADATA_KEY = 'iam:stepUpAction';

export const RequireStepUp = (action: StepUpActionCode) =>
  SetMetadata(STEP_UP_METADATA_KEY, action);
