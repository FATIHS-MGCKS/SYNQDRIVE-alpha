import { createHash } from 'node:crypto';
import type { ManualOnboardingInput } from '../adapters/manual-onboarding-source.adapter';

/** Canonical fingerprint for complete initial manual onboarding command (no migration storage). */
export function manualOnboardingRequestFingerprint(input: ManualOnboardingInput): string {
  const canonical = {
    vin: normalize(input.vin),
    make: normalize(input.make),
    model: normalize(input.model),
    year: input.year ?? null,
    fuelType: normalize(input.fuelType),
    vehicleName: normalize(input.vehicleName),
    licensePlate: normalize(input.licensePlate),
    stationId: normalize(input.stationId),
    notes: normalize(input.notes),
  };
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function normalize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
