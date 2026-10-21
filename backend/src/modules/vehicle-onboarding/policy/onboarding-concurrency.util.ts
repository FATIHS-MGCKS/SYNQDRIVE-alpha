import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export function assertExpectedConcurrencyToken(
  stored: string | null,
  expected: string | null,
): void {
  if (stored !== expected) {
    throw new VehicleOnboardingError(
      'ONBOARDING_CONCURRENCY_CONFLICT',
      'Onboarding case concurrency token mismatch',
    );
  }
}

export function assertCaseMutable(status: string): void {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXPIRED') {
    throw new VehicleOnboardingError(
      'TERMINAL_CASE_IDEMPOTENCY',
      'Cannot mutate terminal onboarding case',
    );
  }
}
