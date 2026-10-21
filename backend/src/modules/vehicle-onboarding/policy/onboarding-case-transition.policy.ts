import type { OnboardingCaseStatus } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const TERMINAL: OnboardingCaseStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

const ALLOWED: Record<OnboardingCaseStatus, OnboardingCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'READY_FOR_ACTIVATION', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['READY_FOR_ACTIVATION', 'CANCELLED', 'EXPIRED'],
  READY_FOR_ACTIVATION: ['IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function assertCaseTransitionAllowed(
  from: OnboardingCaseStatus,
  to: OnboardingCaseStatus,
): void {
  if (from === to) return;
  if (TERMINAL.includes(from)) {
    throw new VehicleOnboardingError(
      'INVALID_CASE_TRANSITION',
      `Cannot transition from terminal status ${from}`,
      { from, to },
    );
  }
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw new VehicleOnboardingError(
      'INVALID_CASE_TRANSITION',
      `Transition ${from} → ${to} is not allowed in VO-3`,
      { from, to },
    );
  }
}

export function isTerminalCaseStatus(status: OnboardingCaseStatus): boolean {
  return TERMINAL.includes(status);
}
