import { ForbiddenException } from '@nestjs/common';

export const ORGANIZATION_OFFBOARDING_FINALIZATION_DISABLED_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZATION_DISABLED';

export const ORGANIZATION_OFFBOARDING_FINALIZATION_CONFIRMATION_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZATION_CONFIRM_REQUIRED';

export const OFFBOARDING_FINALIZATION_CONFIRM_VALUE =
  'CONFIRM_ORGANIZATION_OFFBOARDING_FINALIZATION';

export const ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZE_BLOCKED';

export const ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZE_CONFLICT';

export const ORGANIZATION_OFFBOARDING_FINALIZE_IN_PROGRESS_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZE_IN_PROGRESS';

export const ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING_CODE =
  'ORGANIZATION_OFFBOARDING_FINALIZE_JOB_BINDING';

export function isOrganizationOffboardingFinalizationEnabled(): boolean {
  return process.env.ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED === '1';
}

/** Fail-closed in production until owner arms finalization (P6D4 certification). */
export function assertOrganizationOffboardingFinalizationAdmitted(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && !isOrganizationOffboardingFinalizationEnabled()) {
    throw new ForbiddenException({
      code: ORGANIZATION_OFFBOARDING_FINALIZATION_DISABLED_CODE,
      message:
        'Organization offboarding finalization is disabled in production until P6D4 certification',
    });
  }
}