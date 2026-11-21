import { isEnrollmentRequiredError, isStepUpRequiredError } from '../../lib/mfa';

export type MasterIamPendingMutation = {
  run: () => Promise<void>;
  onSuccess?: () => void | Promise<void>;
};

export function shouldRetainPendingIamMutation(err: unknown): boolean {
  return isStepUpRequiredError(err);
}

export function shouldClearPendingIamMutation(err: unknown): boolean {
  return isEnrollmentRequiredError(err);
}