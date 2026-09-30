import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export function assertExactObjectKeys(
  raw: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new VehicleOnboardingError(
        'INVALID_CAPTURE_PAYLOAD',
        `Unknown field in ${context}: ${key}`,
      );
    }
  }
}
