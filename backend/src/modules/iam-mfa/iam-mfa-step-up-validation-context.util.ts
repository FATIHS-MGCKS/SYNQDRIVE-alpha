import type { StepUpGrantValidationContext } from './iam-mfa-step-up-binding.types';

type RequestUserLike = {
  tokenFamily?: string | null;
  organizationId?: string | null;
  membershipId?: string | null;
  sessionVersion?: number;
  membershipVersion?: number | null;
};

export function resolveStepUpGrantValidationContext(
  user: RequestUserLike | undefined,
): StepUpGrantValidationContext | null {
  if (!user?.tokenFamily) {
    return null;
  }
  return {
    tokenFamily: user.tokenFamily,
    organizationId: user.organizationId ?? null,
    membershipId: user.membershipId ?? null,
    sessionVersion: user.sessionVersion ?? 0,
    membershipVersion: user.membershipVersion ?? null,
  };
}