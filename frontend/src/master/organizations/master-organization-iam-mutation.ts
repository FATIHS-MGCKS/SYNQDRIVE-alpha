import { isEnrollmentRequiredError, isStepUpRequiredError } from '../../lib/mfa';
import { parseHttpErrorCodeFromUnknown } from '../../lib/http-error-code';

export type MasterIamPendingMutation = {
  run: () => Promise<void>;
  onSuccess?: () => void | Promise<void>;
};

export function shouldRetainPendingIamMutation(err: unknown): boolean {
  return isStepUpRequiredError(err) || parseHttpErrorCodeFromUnknown(err) === 'STEP_UP_REQUIRED';
}

export function shouldClearPendingIamMutation(err: unknown): boolean {
  return isEnrollmentRequiredError(err);
}