import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
} from './raw-fuel-refuel-fallback.types';
import type { RawFuelPrePlateauBaselineRecencyClassification } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  type RawFuelRiseDetectorConfig,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

export const RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION = 'rfrf-hybrid-absolute-trust-v2';

export type RawFuelHybridTrustLocalityAssessment = 'UNKNOWN' | 'VALID' | 'INVALID';

export type RawFuelHybridTrustReasonCode =
  | 'NO_EVIDENCE'
  | 'ABSOLUTE_MALFORMED'
  | 'ABSOLUTE_INADMISSIBLE'
  | 'RISE_INCOHERENT'
  | 'RISE_RESET_PATTERN'
  | 'BASELINE_NOT_FRESH'
  | 'BASELINE_PROVENANCE_MISSING'
  | 'RELATIVE_COVERAGE_INSUFFICIENT'
  | 'RELATIVE_CORROBORATES'
  | 'RELATIVE_CONTRADICTS_ABSOLUTE'
  | 'CORROBORATED_RISE'
  | 'INSUFFICIENT_CORROBORATION';

/** Authoritative runtime domain for persisted hybrid trust reason codes. */
export const RAW_FUEL_HYBRID_TRUST_REASON_CODE_VALUES: readonly RawFuelHybridTrustReasonCode[] = [
  'NO_EVIDENCE',
  'ABSOLUTE_MALFORMED',
  'ABSOLUTE_INADMISSIBLE',
  'RISE_INCOHERENT',
  'RISE_RESET_PATTERN',
  'BASELINE_NOT_FRESH',
  'BASELINE_PROVENANCE_MISSING',
  'RELATIVE_COVERAGE_INSUFFICIENT',
  'RELATIVE_CORROBORATES',
  'RELATIVE_CONTRADICTS_ABSOLUTE',
  'CORROBORATED_RISE',
  'INSUFFICIENT_CORROBORATION',
] as const;

export function isRawFuelHybridTrustReasonCode(
  value: unknown,
): value is RawFuelHybridTrustReasonCode {
  return (
    typeof value === 'string' &&
    (RAW_FUEL_HYBRID_TRUST_REASON_CODE_VALUES as readonly string[]).includes(value)
  );
}

export interface RawFuelHybridTrustSample {
  timestamp: Date;
  absoluteLiters?: number | null;
  relativePercent?: number | null;
}

export interface RawFuelHybridTrustObservationContext {
  baselineRecencyClassification?: RawFuelPrePlateauBaselineRecencyClassification;
  riseOnsetAt?: Date | null;
  riseEndAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  postFuelAbsoluteLiters?: number | null;
}

export interface RawFuelHybridTrustInput {
  samples?: RawFuelHybridTrustSample[];
  scanWindowStart?: Date;
  scanWindowEnd?: Date;
  observation?: RawFuelHybridTrustObservationContext;
  config?: RawFuelRiseDetectorConfig;
}

export interface RawFuelHybridTrustProvenance {
  authorityVersion: string;
  classification: RawFuelAbsoluteSignalTrust;
  reasonCode: RawFuelHybridTrustReasonCode;
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSampleCoverage: 'NONE' | 'PARTIAL' | 'SUFFICIENT';
  baselineRecencyClassification: RawFuelPrePlateauBaselineRecencyClassification | 'NOT_PROVIDED';
  absoluteDeltaLiters: number | null;
  relativeDeltaPercent: number | null;
  materialRiseLiters: number;
  materialRisePercent: number;
  relativePrePlateauLocal: RawFuelHybridTrustLocalityAssessment;
  relativePostPlateauLocal: RawFuelHybridTrustLocalityAssessment;
  absolutePostPlateauLocal: RawFuelHybridTrustLocalityAssessment;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inWindow(ts: number, start?: number, end?: number): boolean {
  if (start != null && ts < start) return false;
  if (end != null && ts > end) return false;
  return true;
}

function filterInWindowSamples(input: RawFuelHybridTrustInput): RawFuelHybridTrustSample[] {
  const samples = input.samples ?? [];
  const windowStart = input.scanWindowStart?.getTime();
  const windowEnd = input.scanWindowEnd?.getTime();
  return samples.filter((s) => {
    if (!(s.timestamp instanceof Date) || Number.isNaN(s.timestamp.getTime())) return false;
    return inWindow(s.timestamp.getTime(), windowStart, windowEnd);
  });
}

function relativeValidRange(config: RawFuelRiseDetectorConfig) {
  return config.relativeValidRange;
}

function isValidRelativeSample(
  sample: RawFuelHybridTrustSample,
  config: RawFuelRiseDetectorConfig,
): boolean {
  if (!isFiniteNumber(sample.relativePercent)) return false;
  const range = relativeValidRange(config);
  return sample.relativePercent >= range.min && sample.relativePercent <= range.max;
}

function resolveAbsoluteDetectionAdmissibility(
  inWindow: RawFuelHybridTrustSample[],
): RawFuelAbsoluteDetectionAdmissibility {
  if (inWindow.length === 0) return 'UNKNOWN';
  let sawAbsoluteField = false;
  let sawInvalidAbsolute = false;
  for (const sample of inWindow) {
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function maxConsecutiveGapMs(samples: RawFuelHybridTrustSample[]): number {
  let max = 0;
  for (let i = 1; i < samples.length; i++) {
    max = Math.max(
      max,
      samples[i]!.timestamp.getTime() - samples[i - 1]!.timestamp.getTime(),
    );
  }
  return max;
}

function extractTrailingPrePlateau(
  samples: RawFuelHybridTrustSample[],
  endBeforeMs: number,
  channel: 'relative' | 'absolute',
  config: RawFuelRiseDetectorConfig,
): { locality: RawFuelHybridTrustLocalityAssessment; median: number | null } {
  const maxGap =
    channel === 'relative'
      ? config.relative.maxSampleGapMs
      : config.absolute.maxSampleGapMs;
  const minSamples =
    channel === 'relative'
      ? config.relative.prePlateauMinSamples
      : config.absolute.prePlateauMinSamples;
  const tol =
    channel === 'relative'
      ? config.relative.prePlateauTolerancePercent
      : config.absolute.prePlateauToleranceLiters;

  const filtered = samples
    .filter((s) => s.timestamp.getTime() < endBeforeMs)
    .filter((s) =>
      channel === 'relative' ? isValidRelativeSample(s, config) : isFiniteNumber(s.absoluteLiters),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (filtered.length < minSamples) {
    return { locality: filtered.length === 0 ? 'UNKNOWN' : 'INVALID', median: null };
  }

  const lastGap = endBeforeMs - filtered[filtered.length - 1]!.timestamp.getTime();
  if (lastGap > maxGap) {
    return { locality: 'INVALID', median: null };
  }

  for (let start = filtered.length - minSamples; start >= 0; start--) {
    const slice = filtered.slice(start);
    if (slice.length < minSamples) continue;
    if (maxConsecutiveGapMs(slice) > maxGap) continue;
    const values = slice.map((s) =>
      channel === 'relative' ? s.relativePercent! : s.absoluteLiters!,
    );
    const med = median(values)!;
    if (values.every((v) => Math.abs(v - med) <= tol)) {
      return { locality: 'VALID', median: med };
    }
  }

  return { locality: 'INVALID', median: null };
}

function extractLeadingPostPlateau(
  samples: RawFuelHybridTrustSample[],
  startAtMs: number,
  channel: 'relative' | 'absolute',
  config: RawFuelRiseDetectorConfig,
  expectedLevel?: number | null,
): { locality: RawFuelHybridTrustLocalityAssessment; median: number | null } {
  const maxGap =
    channel === 'relative'
      ? config.relative.maxSampleGapMs
      : config.absolute.maxSampleGapMs;
  const minSamples =
    channel === 'relative'
      ? config.relative.postPlateauMinSamples
      : config.absolute.postPlateauMinSamples;
  const tol =
    channel === 'relative'
      ? config.relative.postPlateauTolerancePercent
      : config.absolute.postPlateauToleranceLiters;
  const minPersistence = config.relative.postPlateauMinPersistenceMs;

  const filtered = samples
    .filter((s) => s.timestamp.getTime() >= startAtMs)
    .filter((s) =>
      channel === 'relative' ? isValidRelativeSample(s, config) : isFiniteNumber(s.absoluteLiters),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (filtered.length < minSamples) {
    return { locality: filtered.length === 0 ? 'UNKNOWN' : 'INVALID', median: null };
  }

  const firstGap = filtered[0]!.timestamp.getTime() - startAtMs;
  if (firstGap > maxGap) {
    return { locality: 'INVALID', median: null };
  }

  for (let end = minSamples; end <= filtered.length; end++) {
    const slice = filtered.slice(0, end);
    if (maxConsecutiveGapMs(slice) > maxGap) break;
    const values = slice.map((s) =>
      channel === 'relative' ? s.relativePercent! : s.absoluteLiters!,
    );
    const med = median(values)!;
    const ref = expectedLevel != null && isFiniteNumber(expectedLevel) ? expectedLevel : med;
    if (!values.every((v) => Math.abs(v - ref) <= tol)) continue;
    const spanMs =
      slice[slice.length - 1]!.timestamp.getTime() - slice[0]!.timestamp.getTime();
    if (channel === 'relative' && spanMs < minPersistence) continue;
    if (channel === 'absolute' && spanMs < config.absolute.postPlateauMinPersistenceMs) continue;
    if (slice.length >= minSamples) {
      return { locality: 'VALID', median: med };
    }
  }

  return { locality: 'INVALID', median: null };
}

function assessAbsoluteRiseCoherence(
  input: RawFuelHybridTrustInput,
  inWindow: RawFuelHybridTrustSample[],
  config: RawFuelRiseDetectorConfig,
): {
  coherent: boolean;
  resetPattern: boolean;
  deltaLiters: number | null;
  absolutePostPlateauLocal: RawFuelHybridTrustLocalityAssessment;
} {
  const obs = input.observation;
  const material = config.absolute.materialRiseLiters;
  const invalidPost: RawFuelHybridTrustLocalityAssessment = 'INVALID';

  if (
    obs &&
    isFiniteNumber(obs.preFuelAbsoluteLiters) &&
    isFiniteNumber(obs.postFuelAbsoluteLiters)
  ) {
    const delta = obs.postFuelAbsoluteLiters - obs.preFuelAbsoluteLiters;
    if (obs.postFuelAbsoluteLiters < obs.preFuelAbsoluteLiters) {
      return {
        coherent: false,
        resetPattern: true,
        deltaLiters: delta,
        absolutePostPlateauLocal: invalidPost,
      };
    }
    if (delta < material) {
      return {
        coherent: false,
        resetPattern: false,
        deltaLiters: delta,
        absolutePostPlateauLocal: invalidPost,
      };
    }

    const riseEndMs = obs.riseEndAt?.getTime();
    if (riseEndMs == null) {
      return {
        coherent: false,
        resetPattern: false,
        deltaLiters: delta,
        absolutePostPlateauLocal: 'UNKNOWN',
      };
    }

    const postPlateau = extractLeadingPostPlateau(
      inWindow,
      riseEndMs,
      'absolute',
      config,
      obs.postFuelAbsoluteLiters,
    );
    if (postPlateau.locality !== 'VALID') {
      return {
        coherent: false,
        resetPattern: false,
        deltaLiters: delta,
        absolutePostPlateauLocal: postPlateau.locality,
      };
    }

    const postSamples = inWindow.filter(
      (s) =>
        isFiniteNumber(s.absoluteLiters) && s.timestamp.getTime() >= riseEndMs,
    );
    const minPostVal = Math.min(...postSamples.map((s) => s.absoluteLiters!));
    if (minPostVal < obs.preFuelAbsoluteLiters! - config.absolute.negativeWobbleLiters) {
      return {
        coherent: false,
        resetPattern: true,
        deltaLiters: delta,
        absolutePostPlateauLocal: invalidPost,
      };
    }

    return {
      coherent: true,
      resetPattern: false,
      deltaLiters: delta,
      absolutePostPlateauLocal: 'VALID',
    };
  }

  return {
    coherent: false,
    resetPattern: false,
    deltaLiters: null,
    absolutePostPlateauLocal: 'UNKNOWN',
  };
}

function assessRelativeCorroboration(
  input: RawFuelHybridTrustInput,
  inWindow: RawFuelHybridTrustSample[],
  config: RawFuelRiseDetectorConfig,
  absoluteDeltaLiters: number | null,
): {
  coverage: 'NONE' | 'PARTIAL' | 'SUFFICIENT';
  corroborates: boolean;
  contradicts: boolean;
  relativeDeltaPercent: number | null;
  relativePrePlateauLocal: RawFuelHybridTrustLocalityAssessment;
  relativePostPlateauLocal: RawFuelHybridTrustLocalityAssessment;
} {
  const obs = input.observation;
  const riseOnsetMs = obs?.riseOnsetAt?.getTime();
  const riseEndMs = obs?.riseEndAt?.getTime();
  const emptyLocal = {
    relativePrePlateauLocal: 'UNKNOWN' as const,
    relativePostPlateauLocal: 'UNKNOWN' as const,
  };

  if (riseOnsetMs == null || riseEndMs == null) {
    return {
      coverage: 'PARTIAL',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: null,
      ...emptyLocal,
    };
  }

  const pre = extractTrailingPrePlateau(inWindow, riseOnsetMs, 'relative', config);
  const post = extractLeadingPostPlateau(inWindow, riseEndMs, 'relative', config);

  if (pre.locality !== 'VALID' || post.locality !== 'VALID') {
    return {
      coverage: pre.locality === 'UNKNOWN' && post.locality === 'UNKNOWN' ? 'NONE' : 'PARTIAL',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: null,
      relativePrePlateauLocal: pre.locality,
      relativePostPlateauLocal: post.locality,
    };
  }

  const relDelta = post.median! - pre.median!;
  const materialPct = config.relative.materialRisePercent;

  if (absoluteDeltaLiters != null && absoluteDeltaLiters >= config.absolute.materialRiseLiters) {
    if (relDelta <= -materialPct) {
      return {
        coverage: 'SUFFICIENT',
        corroborates: false,
        contradicts: true,
        relativeDeltaPercent: relDelta,
        relativePrePlateauLocal: 'VALID',
        relativePostPlateauLocal: 'VALID',
      };
    }
    if (relDelta >= materialPct) {
      return {
        coverage: 'SUFFICIENT',
        corroborates: true,
        contradicts: false,
        relativeDeltaPercent: relDelta,
        relativePrePlateauLocal: 'VALID',
        relativePostPlateauLocal: 'VALID',
      };
    }
    return {
      coverage: 'SUFFICIENT',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: relDelta,
      relativePrePlateauLocal: 'VALID',
      relativePostPlateauLocal: 'VALID',
    };
  }

  return {
    coverage: 'PARTIAL',
    corroborates: false,
    contradicts: false,
    relativeDeltaPercent: relDelta,
    relativePrePlateauLocal: pre.locality,
    relativePostPlateauLocal: post.locality,
  };
}

export function evaluateHybridAbsoluteSignalTrust(
  input: RawFuelHybridTrustInput = {},
): RawFuelHybridTrustProvenance {
  const config = input.config ?? RAW_FUEL_RISE_DETECTOR_CONFIG_V1;
  const inWindow = filterInWindowSamples(input);
  const absoluteDetectionAdmissibility = resolveAbsoluteDetectionAdmissibility(inWindow);
  const baselineProvided = input.observation?.baselineRecencyClassification;
  const baseline = baselineProvided ?? ('NOT_PROVIDED' as const);

  const base = {
    authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    absoluteDetectionAdmissibility,
    relativeSampleCoverage: 'NONE' as const,
    baselineRecencyClassification: baseline,
    absoluteDeltaLiters: null as number | null,
    relativeDeltaPercent: null as number | null,
    materialRiseLiters: config.absolute.materialRiseLiters,
    materialRisePercent: config.relative.materialRisePercent,
    relativePrePlateauLocal: 'UNKNOWN' as RawFuelHybridTrustLocalityAssessment,
    relativePostPlateauLocal: 'UNKNOWN' as RawFuelHybridTrustLocalityAssessment,
    absolutePostPlateauLocal: 'UNKNOWN' as RawFuelHybridTrustLocalityAssessment,
  };

  if (inWindow.length === 0 && !input.observation) {
    return { ...base, classification: 'UNKNOWN', reasonCode: 'NO_EVIDENCE' };
  }

  if (absoluteDetectionAdmissibility === 'INADMISSIBLE') {
    return { ...base, classification: 'UNTRUSTED', reasonCode: 'ABSOLUTE_INADMISSIBLE' };
  }

  for (const sample of inWindow) {
    if (sample.absoluteLiters != null) {
      if (!isFiniteNumber(sample.absoluteLiters) || sample.absoluteLiters < 0) {
        return { ...base, classification: 'UNTRUSTED', reasonCode: 'ABSOLUTE_MALFORMED' };
      }
    }
  }

  const rise = assessAbsoluteRiseCoherence(input, inWindow, config);
  const rel = assessRelativeCorroboration(input, inWindow, config, rise.deltaLiters);

  const withLocality = {
    ...base,
    relativePrePlateauLocal: rel.relativePrePlateauLocal,
    relativePostPlateauLocal: rel.relativePostPlateauLocal,
    absolutePostPlateauLocal: rise.absolutePostPlateauLocal,
    relativeSampleCoverage: rel.coverage,
    absoluteDeltaLiters: rise.deltaLiters,
    relativeDeltaPercent: rel.relativeDeltaPercent,
  };

  if (rise.resetPattern) {
    return { ...withLocality, classification: 'UNTRUSTED', reasonCode: 'RISE_RESET_PATTERN' };
  }

  if (rel.contradicts) {
    return {
      ...withLocality,
      classification: 'UNTRUSTED',
      reasonCode: 'RELATIVE_CONTRADICTS_ABSOLUTE',
    };
  }

  if (!rise.coherent) {
    return { ...withLocality, classification: 'UNKNOWN', reasonCode: 'RISE_INCOHERENT' };
  }

  if (baseline === 'NOT_PROVIDED') {
    return { ...withLocality, classification: 'UNKNOWN', reasonCode: 'BASELINE_PROVENANCE_MISSING' };
  }

  if (baseline !== 'FRESH') {
    return { ...withLocality, classification: 'UNKNOWN', reasonCode: 'BASELINE_NOT_FRESH' };
  }

  if (rel.coverage === 'NONE' || rel.coverage === 'PARTIAL') {
    return {
      ...withLocality,
      classification: 'UNKNOWN',
      reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
    };
  }

  if (!rel.corroborates) {
    return {
      ...withLocality,
      classification: 'UNKNOWN',
      reasonCode: 'INSUFFICIENT_CORROBORATION',
    };
  }

  return {
    ...withLocality,
    classification: 'TRUSTED',
    reasonCode: 'CORROBORATED_RISE',
    relativeSampleCoverage: 'SUFFICIENT',
  };
}
