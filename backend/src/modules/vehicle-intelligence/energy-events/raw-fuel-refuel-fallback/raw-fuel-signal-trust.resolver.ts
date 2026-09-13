import type {
  RawFuelAbsoluteDetectionAdmissibility,
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


function resolveAbsoluteDetectionAdmissibility(
  input: RawFuelSignalTrustInput,
): RawFuelAbsoluteDetectionAdmissibility {
  const samples = input.samples ?? [];
  if (samples.length === 0) return 'UNKNOWN';

  const windowStart = input.scanWindowStart?.getTime();
  const windowEnd = input.scanWindowEnd?.getTime();
  let sawAbsoluteField = false;
  let sawInvalidAbsolute = false;

  for (const sample of samples) {
    if (!(sample.timestamp instanceof Date) || Number.isNaN(sample.timestamp.getTime())) {
      continue;
    }
    const ts = sample.timestamp.getTime();
    if (windowStart != null && ts < windowStart) continue;
    if (windowEnd != null && ts > windowEnd) continue;

    if (sample.absoluteLiters == null) continue;
    sawAbsoluteField = true;

    if (!isFiniteNumber(sample.absoluteLiters) || sample.absoluteLiters < 0) {
      sawInvalidAbsolute = true;
      continue;
    }
    return 'ADMISSIBLE';
  }

  if (sawInvalidAbsolute) return 'INADMISSIBLE';
  if (sawAbsoluteField) return 'INADMISSIBLE';
  return 'UNKNOWN';
}

/**
 * Resolves absolute promotion trust vs detection admissibility separately.
 * Promotion TRUSTED is never derived from fuelType or sample presence alone.
 * Detection ADMISSIBLE requires semantically valid absolute samples in-window.
 */
export function resolveRawFuelSignalTrust(
  input: RawFuelSignalTrustInput = {},
): RawFuelSignalTrustResult {
  void input.fuelType;
  void input.samplePresenceOnly;

  const absoluteSignalTrust: RawFuelAbsoluteSignalTrust = 'UNKNOWN';
  const absoluteDetectionAdmissibility = resolveAbsoluteDetectionAdmissibility(input);

  return {
    absoluteSignalTrust,
    absoluteDetectionAdmissibility,
    relativeSignalAvailable: hasSemanticallyValidRelativeSample(input),
  };
}
