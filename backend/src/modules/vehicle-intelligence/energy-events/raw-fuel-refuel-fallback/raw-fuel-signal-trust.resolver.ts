import type {
  RawFuelAbsoluteSignalTrust,
  RawFuelSignalTrustInput,
  RawFuelSignalTrustResult,
} from './raw-fuel-refuel-fallback.types';

/** F4 contract: no fleet-wide absolute-trust authority exists yet. */
export const ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE = false;

const RELATIVE_VALID_RANGE = { min: 0, max: 100 } as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasSemanticallyValidRelativeSample(
  input: RawFuelSignalTrustInput,
): boolean {
  const samples = input.samples ?? [];
  if (samples.length === 0) return false;

  const windowStart = input.scanWindowStart?.getTime();
  const windowEnd = input.scanWindowEnd?.getTime();

  for (const sample of samples) {
    if (!(sample.timestamp instanceof Date) || Number.isNaN(sample.timestamp.getTime())) {
      continue;
    }
    const ts = sample.timestamp.getTime();
    if (windowStart != null && ts < windowStart) continue;
    if (windowEnd != null && ts > windowEnd) continue;

    if (!isFiniteNumber(sample.relativePercent)) continue;
    if (
      sample.relativePercent < RELATIVE_VALID_RANGE.min ||
      sample.relativePercent > RELATIVE_VALID_RANGE.max
    ) {
      continue;
    }
    return true;
  }

  return false;
}

/**
 * Resolves absolute vs relative signal trust axes separately.
 * Absolute TRUSTED is never derived from fuelType or sample presence alone in F4-PR1.
 */
export function resolveRawFuelSignalTrust(
  input: RawFuelSignalTrustInput = {},
): RawFuelSignalTrustResult {
  void input.fuelType;
  void input.samplePresenceOnly;

  const absoluteSignalTrust: RawFuelAbsoluteSignalTrust = 'UNKNOWN';

  return {
    absoluteSignalTrust,
    relativeSignalAvailable: hasSemanticallyValidRelativeSample(input),
  };
}
