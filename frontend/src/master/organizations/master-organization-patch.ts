import { isEnrollmentRequiredError, isStepUpRequiredError } from '../../lib/mfa';

export type MasterOrgPatchIntent = {
  orgId: string;
  data: Record<string, unknown>;
};

export type MasterOrgPatchPending = MasterOrgPatchIntent & {
  onSuccess?: () => void | Promise<void>;
};

export function classifyMasterOrgPatchError(err: unknown): {
  stepUpRequired: boolean;
  enrollmentRequired: boolean;
  message: string;
} {
  const message = err instanceof Error ? err.message : 'Request failed';
  return {
    stepUpRequired: isStepUpRequiredError(err),
    enrollmentRequired: isEnrollmentRequiredError(err),
    message,
  };
}

export function shouldRetainPendingOrgPatch(err: unknown): boolean {
  return isStepUpRequiredError(err);
}

export function shouldClearPendingOrgPatch(err: unknown): boolean {
  return isEnrollmentRequiredError(err);
}