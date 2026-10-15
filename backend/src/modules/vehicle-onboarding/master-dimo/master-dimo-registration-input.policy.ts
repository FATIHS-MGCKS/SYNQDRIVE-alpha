import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { MasterDimoRegistrationInput } from './master-dimo-registration.types';

const UNSUPPORTED_EXTRA_FIELDS = ['engineDisplacementCc', 'cylinderCount'] as const;

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/** Rejects Master form fields that have no supported persistence target on register-from-dimo. */
export function assertMasterDimoRegistrationInputSupported(input: MasterDimoRegistrationInput): void {
  const extra = input.extraData;
  if (!extra || typeof extra !== 'object') return;

  const rejected: string[] = [];
  for (const field of UNSUPPORTED_EXTRA_FIELDS) {
    if (hasMeaningfulValue((extra as Record<string, unknown>)[field])) {
      rejected.push(field);
    }
  }
  if (!rejected.length) return;

  throw new VehicleOnboardingError(
    'UNSUPPORTED_MASTER_REGISTRATION_FIELDS',
    'One or more vehicle fields are not supported on DIMO register-from-dimo; update the vehicle after registration instead',
    {
      fields: rejected,
      useVehicleUpdateWorkflow: true,
    },
  );
}
