import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
  RawFuelSignalTrustInput,
  RawFuelSignalTrustResult,
} from './raw-fuel-refuel-fallback.types';
import { evaluateHybridAbsoluteSignalTrust } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import { resolveHybridTrustActivationDecision } from './raw-fuel-hybrid-trust-activation.authority';
import { readBaselineRecencyFromEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

/**
 * @deprecated Global promotion trust is gated by {@link resolveHybridTrustActivationDecision}
 * (`RFRF_HYBRID_TRUST_ACTIVATION_MODE`). This flag remains false — do not flip to global true.
 */
export const ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE = false;

/** Bump when promotion-trust semantics change; stale READY refresh metadata becomes REFRESH_REQUIRED. */
export const RFRF_SIGNAL_TRUST_RESOLVER_VERSION = 'rfrf-signal-trust-v2';

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
 * Resolves absolute promotion trust vs detection admissibility separately.
 * Promotion TRUSTED is never derived from fuelType or sample presence alone.
 * Hybrid v2 computes observation-local classification; scoped activation yields effective promotion trust.
 */
export function resolveRawFuelSignalTrust(
  input: RawFuelSignalTrustInput = {},
): RawFuelSignalTrustResult {
  void input.fuelType;
  void input.samplePresenceOnly;

  const hybridTrustProvenance = evaluateHybridAbsoluteSignalTrust({
    samples: input.samples,
    scanWindowStart: input.scanWindowStart,
    scanWindowEnd: input.scanWindowEnd,
    observation: input.observation,
  });

  const absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility =
    hybridTrustProvenance.absoluteDetectionAdmissibility;

  const hybridTrustActivation = resolveHybridTrustActivationDecision({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    computedHybridClassification: hybridTrustProvenance.classification,
  });

  const absoluteSignalTrust: RawFuelAbsoluteSignalTrust =
    hybridTrustActivation.effectiveAbsoluteSignalTrust;

  return {
    absoluteSignalTrust,
    absoluteDetectionAdmissibility,
    relativeSignalAvailable: hasSemanticallyValidRelativeSample(input),
    hybridTrustProvenance,
    hybridTrustActivation,
  };
}

export function buildRawFuelSignalTrustObservationContext(observation: {
  evidenceMeta?: unknown;
  riseOnsetAt?: Date | null;
  riseEndAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  postFuelAbsoluteLiters?: number | null;
}): NonNullable<RawFuelSignalTrustInput['observation']> {
  const baselineRecency = readBaselineRecencyFromEvidenceMeta(observation.evidenceMeta);
  return {
    ...(baselineRecency != null ? { baselineRecencyClassification: baselineRecency } : {}),
    riseOnsetAt: observation.riseOnsetAt,
    riseEndAt: observation.riseEndAt,
    preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters,
    postFuelAbsoluteLiters: observation.postFuelAbsoluteLiters,
  };
}
